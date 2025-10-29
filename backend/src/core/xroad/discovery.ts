// src/core/xroad/discovery.ts
import axios, { AxiosInstance } from 'axios';
import https from 'https';
import { parseStringPromise } from 'xml2js';
import { prisma } from '../../db/prisma';
import { getMtlsAgent } from '../mtls/agentFactory';

/** Helpers */
function sanitizeBaseUrl(u: string): string {
  return (u || '').trim().replace(/\/+$/, '');
}

function ensureLeadingSlash(p: string): string {
  if (!p) return '/';
  return p.startsWith('/') ? p : `/${p}`;
}

type RouteVersion = '' | 'r1' | 'r2' | 'r3';

/** Creamos un cliente Axios configurable (con o sin mTLS) */
async function buildHttpClient(useMtls: boolean): Promise<AxiosInstance> {
  const agent: https.Agent | undefined = useMtls ? await getMtlsAgent() : undefined;
  // Si estás en dev con self-signed en el SS, DEV_INSECURE_TLS=1 para no rechazar
  const rejectUnauthorized = !process.env.DEV_INSECURE_TLS;

  return axios.create({
    // El agent ya lleva pfx y passphrase si useMtls=true
    httpsAgent: agent ?? new https.Agent({ rejectUnauthorized }),
    // Evitamos caídas por autonegociación rara
    timeout: 20000,
    // No seguir redirects por accidente
    maxRedirects: 0,
    validateStatus: s => s >= 200 && s < 500,
  });
}

/** 1) Descubrir clientes (subsystems) via `/listClients` (sin rN) */
/** 1) Descubrir clientes (subsystems) via `/listClients` (JSON, no XML en tu caso) */
async function listClients(baseUrl: string, consumerHeader: string) {
  const url = `${sanitizeBaseUrl(baseUrl)}/listClients`;
  const headers = { 'X-Road-Client': consumerHeader };

  const clientNoMtls = await buildHttpClient(false);
  let res;
  try {
    res = await clientNoMtls.get(url, { headers });
  } catch {
    const clientMtls = await buildHttpClient(true);
    res = await clientMtls.get(url, { headers });
  }

  // log para debug
  console.log("\n\n======= RAW RESPONSE FROM /listClients =======");
  console.log(res.data);
  console.log("=============================================\n\n");

  if (res.status < 200 || res.status >= 300) {
    const body = typeof res.data === 'string'
      ? res.data.slice(0, 300)
      : JSON.stringify(res.data).slice(0, 300);
    throw new Error(`listClients failed (${res.status}) ${body}`);
  }

  // ✅ FORMATO JSON (X-Road REST Admin)
return res.data.member
  .filter((m: any) => m?.id?.object_type === "SUBSYSTEM")
  .map((m: any) => ({
    xRoadInstance: m.id.xroad_instance,
    memberClass:   m.id.member_class,
    memberCode:    m.id.member_code,
    subsystemCode: m.id.subsystem_code,
    displayName:   m.subsystem_name || m.id.subsystem_code || m.name || m.id.member_code
  }));



  throw new Error("listClients returned unexpected format");
}

/** 2) Detectar (por prueba) qué routeVersion sirve para allowedMethods */
async function detectWorkingRouteVersion(
  baseUrl: string,
  consumerHeader: string,
  provider: { xRoadInstance: string; memberClass: string; memberCode: string; subsystemCode: string }
): Promise<RouteVersion | null> {
  const candidates: RouteVersion[] = ['r1', 'r2', 'r3', '']; // priorizamos r1/2/3; al final vacío
  const headers = { 'X-Road-Client': consumerHeader, Accept: 'application/json' };

  // allowedMethods path
  const base = sanitizeBaseUrl(baseUrl);
  const pathFor = (rv: RouteVersion) =>
    rv
      ? `${base}/${rv}/${provider.xRoadInstance}/${provider.memberClass}/${provider.memberCode}/${provider.subsystemCode}/allowedMethods`
      : `${base}/${provider.xRoadInstance}/${provider.memberClass}/${provider.memberCode}/${provider.subsystemCode}/allowedMethods`;

  // Intentamos SIEMPRE con mTLS (allowedMethods suele exigirlo)
  const clientMtls = await buildHttpClient(true);

  for (const rv of candidates) {
    try {
      const url = pathFor(rv);
      const res = await clientMtls.get(url, { headers });
      if (res.status >= 200 && res.status < 300 && res.data) {
        // Estructura válida = tiene "service" o al menos es JSON
        if (typeof res.data === 'object') {
          return rv;
        }
      }
    } catch {
      // siguiente routeVersion
    }
  }
  return null;
}

/** 3) Traer allowedMethods para un provider en una routeVersion detectada */
async function fetchAllowedMethods(
  baseUrl: string,
  consumerHeader: string,
  routeVersion: RouteVersion,
  provider: { xRoadInstance: string; memberClass: string; memberCode: string; subsystemCode: string }
): Promise<any> {
  const base = sanitizeBaseUrl(baseUrl);
  const headers = { 'X-Road-Client': consumerHeader, Accept: 'application/json' };
  const url = routeVersion
    ? `${base}/${routeVersion}/${provider.xRoadInstance}/${provider.memberClass}/${provider.memberCode}/${provider.subsystemCode}/allowedMethods`
    : `${base}/${provider.xRoadInstance}/${provider.memberClass}/${provider.memberCode}/${provider.subsystemCode}/allowedMethods`;

  const clientMtls = await buildHttpClient(true);
  const res = await clientMtls.get(url, { headers });

  if (res.status < 200 || res.status >= 300) {
    const body = typeof res.data === 'string' ? res.data.slice(0, 300) : JSON.stringify(res.data).slice(0, 300);
    throw new Error(`allowedMethods failed (${res.status}) ${body}`);
  }
  if (!res.data || typeof res.data !== 'object') {
    throw new Error('allowedMethods returned non-JSON');
  }
  return res.data;
}

/** 4) Upsert Provider */
async function upsertProvider(
  routeVersion: RouteVersion,
  p: { xRoadInstance: string; memberClass: string; memberCode: string; subsystemCode: string; displayName: string }
) {
  const display = `${p.xRoadInstance} / ${p.memberClass} / ${p.memberCode} / ${p.subsystemCode}`;
  const existing = await prisma.provider.findFirst({
    where: {
      routeVersion: routeVersion || '',
      xRoadInstance: p.xRoadInstance,
      memberClass: p.memberClass,
      memberCode: p.memberCode,
      subsystemCode: p.subsystemCode,
    },
  });

  if (existing) {
    return prisma.provider.update({
      where: { id: existing.id },
      data: {
        displayName: p.displayName || display,
        updatedAt: new Date(),
      },
    });
  }
  return prisma.provider.create({
    data: {
      routeVersion: routeVersion || '',
      xRoadInstance: p.xRoadInstance,
      memberClass: p.memberClass,
      memberCode: p.memberCode,
      subsystemCode: p.subsystemCode,
      displayName: p.displayName || display,
      hasServices: false,
    },
  });
}

/** 5) Upsert Services + Endpoints (sin wildcards) */
async function upsertServicesAndEndpoints(providerId: string, payload: any) {
  // Esperamos { service: [...] }
  const services = Array.isArray(payload?.service) ? payload.service : (payload?.service ? [payload.service] : []);

  let savedEndpoints = 0;

  for (const s of services) {
    const serviceCode: string = s?.service_code;
    if (!serviceCode) continue;

    // Service: findFirst (no hay unique(providerId, serviceCode) en schema)
    const existingService = await prisma.service.findFirst({
      where: { providerId, serviceCode },
    });

    const service = existingService
      ? await prisma.service.update({
          where: { id: existingService.id },
          data: {
            serviceVersion: s?.service_version || existingService.serviceVersion || null,
            serviceType: s?.service_type || existingService.serviceType || null,
            updatedAt: new Date(),
          },
        })
      : await prisma.service.create({
          data: {
            providerId,
            serviceCode,
            serviceVersion: s?.service_version || null,
            serviceType: s?.service_type || null,
          },
        });

    // Endpoints: filtrar SIN wildcard
    const endpoints = Array.isArray(s?.endpoint_list) ? s.endpoint_list : [];
    const filtered = endpoints.filter((e: any) => {
      const path = String(e?.path || '');
      return path && !path.includes('*');
    });

    for (const e of filtered) {
      const method = String(e?.method || 'GET').toUpperCase();
      const path = ensureLeadingSlash(String(e?.path || '/'));

      // No hay unique(serviceId, method, path) en schema → findFirst
      const existingEp = await prisma.endpoint.findFirst({
        where: { serviceId: service.id, method, path },
      });

      if (existingEp) {
        await prisma.endpoint.update({
          where: { id: existingEp.id },
          data: { updatedAt: new Date() },
        });
      } else {
        await prisma.endpoint.create({
          data: { serviceId: service.id, method, path },
        });
      }
      savedEndpoints++;
    }
  }

  // actualizar bandera hasServices
  await prisma.provider.update({
    where: { id: providerId },
    data: { hasServices: savedEndpoints > 0, updatedAt: new Date() },
  });

  return savedEndpoints;
}

/** 6) Orquestador público: refresca todo */
export async function refreshProviders(): Promise<{ ok: true; discovered: number; withServices: number }> {
  const settings = await prisma.tenantSettings.findUnique({ where: { id: 'singleton' }});
  if (!settings) throw new Error('Tenant settings not configured');

  const baseUrl = sanitizeBaseUrl(settings.baseUrl);
  const consumerHeader = `${settings.xRoadInstance}/${settings.xRoadMemberClass}/${settings.xRoadMemberCode}/${settings.xRoadSubsystem}`;

  // a) listClients → subsystems
  const subsystems = await listClients(baseUrl, consumerHeader);

  let discovered = 0;
  let withServices = 0;

  // b) por cada subsystem → detectar routeVersion y traer allowedMethods
  for (const sub of subsystems) {
    // detect routeVersion por provider
    const rv = await detectWorkingRouteVersion(baseUrl, consumerHeader, sub);
    // Si no hay route que funcione, igual damos de alta el provider con hasServices=false
    const provider = await upsertProvider(rv ?? '', sub);
    discovered++;

    if (!rv) {
      // no hay allowedMethods expuestos (o no accesibles con mTLS actual)
      await prisma.provider.update({
        where: { id: provider.id },
        data: { hasServices: false, updatedAt: new Date() },
      });
      continue;
    }

    try {
      const payload = await fetchAllowedMethods(baseUrl, consumerHeader, rv, sub);
      const count = await upsertServicesAndEndpoints(provider.id, payload);
      if (count > 0) withServices++;
    } catch {
      // allowedMethods falló → lo marcamos sin servicios
      await prisma.provider.update({
        where: { id: provider.id },
        data: { hasServices: false, updatedAt: new Date() },
      });
    }
  }

  return { ok: true, discovered, withServices };
}
