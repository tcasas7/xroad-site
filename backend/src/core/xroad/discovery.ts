import axios, { AxiosInstance } from 'axios';
import https from 'https';
import { prisma } from '../../db/prisma';
import { getMtlsAgentForUser } from '../mtls/agentFactory';

type RouteVersion = '' | 'r1' | 'r2' | 'r3';

function sanitizeBaseUrl(u: string): string {
  return (u || '').trim().replace(/\/+$/, '');
}
function ensureLeadingSlash(p: string): string {
  if (!p) return '/';
  return p.startsWith('/') ? p : `/${p}`;
}

async function buildHttpClientForUser(userId: string): Promise<AxiosInstance> {
  const agent = await getMtlsAgentForUser(userId);
  const rejectUnauthorized = !process.env.DEV_INSECURE_TLS;
  return axios.create({
    httpsAgent: agent ?? new https.Agent({ rejectUnauthorized }),
    timeout: 20000,
    maxRedirects: 0,
    validateStatus: s => s >= 200 && s < 500,
  });
}

/** /listClients JSON */
async function listClientsForUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (
    !user?.baseUrl ||
    !user.xRoadInstance ||
    !user.xRoadMemberClass ||
    !user.xRoadMemberCode ||
    !user.xRoadSubsystem
  ) {
    throw new Error('Perfil X-Road incompleto para este usuario');
  }

  const baseUrl = sanitizeBaseUrl(user.baseUrl);
  const client = await buildHttpClientForUser(userId);
  const headers = {
    'X-Road-Client': `${user.xRoadInstance}/${user.xRoadMemberClass}/${user.xRoadMemberCode}/${user.xRoadSubsystem}`,
  };

  const res = await client.get(`${baseUrl}/listClients`, { headers });
  if (res.status < 200 || res.status >= 300 || !res.data) {
    throw new Error(`listClients failed (${res.status})`);
  }

  const arr = Array.isArray(res.data?.member) ? res.data.member : [];
  return arr
    .filter((m: any) => m?.id?.object_type === 'SUBSYSTEM')
    .map((m: any) => ({
      xRoadInstance: m.id.xroad_instance,
      memberClass: m.id.member_class,
      memberCode: m.id.member_code,
      subsystemCode: m.id.subsystem_code,
      displayName:
        m.subsystem_name || m.id.subsystem_code || m.name || m.id.member_code,
    }));
}

async function detectWorkingRouteVersionForUser(
  userId: string,
  provider: { xRoadInstance: string; memberClass: string; memberCode: string; subsystemCode: string }
): Promise<RouteVersion | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (
    !user?.baseUrl ||
    !user.xRoadInstance ||
    !user.xRoadMemberClass ||
    !user.xRoadMemberCode ||
    !user.xRoadSubsystem
  ) {
    return null;
  }
  const base = sanitizeBaseUrl(user.baseUrl);
  const headers = {
    'X-Road-Client': `${user.xRoadInstance}/${user.xRoadMemberClass}/${user.xRoadMemberCode}/${user.xRoadSubsystem}`,
    Accept: 'application/json',
  };
  const client = await buildHttpClientForUser(userId);

  const candidates: RouteVersion[] = ['r1', 'r2', 'r3', ''];
  const pathFor = (rv: RouteVersion) =>
    rv
      ? `${base}/${rv}/${provider.xRoadInstance}/${provider.memberClass}/${provider.memberCode}/${provider.subsystemCode}/allowedMethods`
      : `${base}/${provider.xRoadInstance}/${provider.memberClass}/${provider.memberCode}/${provider.subsystemCode}/allowedMethods`;

  for (const rv of candidates) {
    try {
      const res = await client.get(pathFor(rv), { headers });
      if (res.status >= 200 && res.status < 300 && typeof res.data === 'object')
        return rv;
    } catch {
      // sigue intentando
    }
  }
  return null;
}

async function fetchAllowedMethodsForUser(
  userId: string,
  routeVersion: RouteVersion,
  provider: { xRoadInstance: string; memberClass: string; memberCode: string; subsystemCode: string }
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const base = sanitizeBaseUrl(user!.baseUrl!);
  const headers = {
    'X-Road-Client': `${user!.xRoadInstance}/${user!.xRoadMemberClass}/${user!.xRoadMemberCode}/${user!.xRoadSubsystem}`,
    Accept: 'application/json',
  };
  const client = await buildHttpClientForUser(userId);

  const url = routeVersion
    ? `${base}/${routeVersion}/${provider.xRoadInstance}/${provider.memberClass}/${provider.memberCode}/${provider.subsystemCode}/allowedMethods`
    : `${base}/${provider.xRoadInstance}/${provider.memberClass}/${provider.memberCode}/${provider.subsystemCode}/allowedMethods`;

  const res = await client.get(url, { headers });
  if (res.status < 200 || res.status >= 300 || !res.data || typeof res.data !== 'object') {
    throw new Error('allowedMethods failed');
  }
  return res.data;
}


async function upsertProviderForUser(
  userId: string,
  routeVersion: RouteVersion,
  p: {
    xRoadInstance: string;
    memberClass: string;
    memberCode: string;
    subsystemCode: string;
    displayName: string;
  }
) {
  const display = `${p.xRoadInstance} / ${p.memberClass} / ${p.memberCode} / ${p.subsystemCode}`;

  try {
    // Buscar si ya existe para este user
    const existing = await prisma.provider.findFirst({
      where: {
        userId,
        routeVersion: routeVersion || '',
        xRoadInstance: p.xRoadInstance,
        memberClass: p.memberClass,
        memberCode: p.memberCode,
        subsystemCode: p.subsystemCode,
      },
    });

    if (existing) {
      // ✅ Actualizamos en lugar de ignorar
      return await prisma.provider.update({
        where: { id: existing.id },
        data: {
          displayName: p.displayName || display,
          updatedAt: new Date(),
        },
      });
    }

    // ✅ Si no existe, lo creamos
    return await prisma.provider.create({
      data: {
        userId,
        routeVersion: routeVersion || '',
        xRoadInstance: p.xRoadInstance,
        memberClass: p.memberClass,
        memberCode: p.memberCode,
        subsystemCode: p.subsystemCode,
        displayName: p.displayName || display,
        hasServices: false,
      },
    });
  } catch (err: unknown) {
    const e = err as Error & { code?: string };
    console.error(`❌ Error creando/actualizando provider ${p.subsystemCode}: ${e.message}`);
    return null;
  }
}

async function upsertServicesAndEndpointsForUser(
  userId: string,
  providerId: string,
  payload: any
) {
  // Asegurar que siempre tengamos una lista de servicios
  const raw = payload?.service || payload?.services || payload;
  const services = Array.isArray(raw) ? raw : raw ? [raw] : [];

  let saved = 0;

  for (const s of services) {
    const serviceCode: string = s?.service_code || s?.code;
    if (!serviceCode) continue;

    try {
      const existingService = await prisma.service.findFirst({
        where: { userId, providerId, serviceCode },
      });

      const service = existingService
        ? await prisma.service.update({
            where: { id: existingService.id },
            data: {
              serviceVersion:
                s?.service_version || existingService.serviceVersion || null,
              serviceType:
                s?.service_type || existingService.serviceType || null,
              updatedAt: new Date(),
            },
          })
        : await prisma.service.create({
            data: {
              userId,
              providerId,
              serviceCode,
              serviceVersion: s?.service_version || null,
              serviceType: s?.service_type || null,
            },
          });

      const endpoints = Array.isArray(s?.endpoint_list)
        ? s.endpoint_list
        : [];
      const filtered = endpoints.filter((e: any) => {
        const path = String(e?.path || '');
        return path && !path.includes('*');
      });

      for (const e of filtered) {
        const method = String(e?.method || 'GET').toUpperCase();
        const path = ensureLeadingSlash(String(e?.path || '/'));
        const existingEp = await prisma.endpoint.findFirst({
          where: { userId, serviceId: service.id, method, path },
        });
        if (existingEp) {
          await prisma.endpoint.update({
            where: { id: existingEp.id },
            data: { updatedAt: new Date() },
          });
        } else {
          await prisma.endpoint.create({
            data: { userId, serviceId: service.id, method, path },
          });
        }
        saved++;
      }
    } catch (err: unknown) {
      const e = err as Error;
      console.warn(
        `⚠️ Error procesando servicio ${s?.service_code || 'sin_code'}: ${
          e.message
        }`
      );
    }
  }

  await prisma.provider.update({
    where: { id: providerId },
    data: { hasServices: saved > 0, updatedAt: new Date() },
  });

  return saved;
}


/** 🔁 Orquestador: delete → recreate por usuario */
export async function refreshProviders(userId: string): Promise<{ ok: true; discovered: number; withServices: number }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.baseUrl || !user.xRoadInstance || !user.xRoadMemberClass || !user.xRoadMemberCode || !user.xRoadSubsystem) {
    throw new Error('Perfil X-Road incompleto para este usuario');
  }

  await prisma.endpoint.deleteMany({ where: { userId } });
  await prisma.service.deleteMany({ where: { userId } });
  await prisma.provider.deleteMany({ where: { userId } });

  const subsystems = await listClientsForUser(userId);
  let discovered = 0;
  let withServices = 0;
for (const sub of subsystems) {
  try {
    const rv = await detectWorkingRouteVersionForUser(userId, sub);
    const provider = await upsertProviderForUser(userId, rv ?? '', sub);
    if (!provider) continue;

    discovered++;
    if (!rv) continue;

    try {
      const payload = await fetchAllowedMethodsForUser(userId, rv, sub);
      const count = await upsertServicesAndEndpointsForUser(userId, provider.id, payload);
      if (count > 0) withServices++;
    } catch (err: unknown) {
      const e = err as Error;
      console.warn(`⚠️ Error al obtener servicios para ${sub.subsystemCode}: ${e.message}`);
    }
  } catch (outer: unknown) {
    const e = outer as Error;
    console.error(`❌ Error procesando subsystem ${sub.subsystemCode}: ${e.message}`);
  }
}

return { ok: true, discovered, withServices };

}
