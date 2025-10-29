import axios from 'axios';
import { prisma } from '../../db/prisma';
import { getMtlsAgent } from '../mtls/agentFactory';
import { joinUrl } from './url';

/**
 * Carga baseUrl + clientId desde DB (persistido)
 */
export async function getBaseUrlAndClientHeader() {
  const s = await prisma.tenantSettings.findUnique({ where: { id: 'singleton' }});
  if (!s) throw new Error('Tenant settings not configured. POST /api/config first.');

  const baseUrl = s.baseUrl.replace(/\/+$/, '');
  const xRoadClient = `${s.xRoadInstance}/${s.xRoadMemberClass}/${s.xRoadMemberCode}/${s.xRoadSubsystem}`;

  return { baseUrl, xRoadClient };
}

/**
 * listClients → descubre TODOS los miembros/subsistemas
 * Endpoint del Security Server (metaservice REST)
 */
export async function listClients() {
  const { baseUrl } = await getBaseUrlAndClientHeader();
  const httpsAgent = await getMtlsAgent();

  const url = joinUrl(baseUrl, 'listClients');

  const { data } = await axios.get(url, {
    httpsAgent,
    headers: { Accept: 'application/json' }
  });

  return data;
}

/**
 * allowedMethods → descubre servicios y endpoints para un proveedor específico
 */
export async function allowedMethods(provider: {
  instance: string;
  memberClass: string;
  memberCode: string;
  subsystemCode?: string | null;
}) {
  const { baseUrl, xRoadClient } = await getBaseUrlAndClientHeader();
  const httpsAgent = await getMtlsAgent();

  const path = joinUrl(
    baseUrl,
    'r1',
    provider.instance,
    provider.memberClass,
    provider.memberCode,
    provider.subsystemCode || '',
    'allowedMethods'
  );

  const { data } = await axios.get(path, {
    httpsAgent,
    headers: {
      'Accept': 'application/json',
      'X-Road-Client': xRoadClient
    }
  });

  return data;
}

/**
 * (Opcional) GET REST directo de un recurso ya armado
 * Usado en proxy
 */
export async function proxyGet(fullUrl: string) {
  const httpsAgent = await getMtlsAgent();
  const { xRoadClient } = await getBaseUrlAndClientHeader();

  const { data, headers, status } = await axios.get(fullUrl, {
    httpsAgent,
    responseType: 'arraybuffer',
    headers: { 'X-Road-Client': xRoadClient }
  });

  return { data, headers, status };
}
