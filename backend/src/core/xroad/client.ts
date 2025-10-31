// src/core/xroad/client.ts
import axios from 'axios';
import { prisma } from '../../db/prisma';
import { getMtlsAgentForUser } from '../mtls/agentFactory';
import { joinUrl } from './url';

export async function getBaseUrlAndClientHeaderForUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }});
  if (!user) throw new Error('User not found');

  if (!user.baseUrl || !user.xRoadInstance || !user.xRoadMemberClass || !user.xRoadMemberCode || !user.xRoadSubsystem) {
    throw new Error('X-Road profile incomplete for this user');
  }

  const baseUrl = user.baseUrl.replace(/\/+$/, '');
  const xRoadClient = `${user.xRoadInstance}/${user.xRoadMemberClass}/${user.xRoadMemberCode}/${user.xRoadSubsystem}`;

  return { baseUrl, xRoadClient };
}

/**
 * listClients (user scoped)
 */
export async function listClientsForUser_simple(userId: string) {
  const { baseUrl } = await getBaseUrlAndClientHeaderForUser(userId);
  const httpsAgent = await getMtlsAgentForUser(userId);

  const url = joinUrl(baseUrl, 'listClients');

  const { data } = await axios.get(url, {
    httpsAgent,
    headers: { Accept: 'application/json' }
  });

  return data;
}

/**
 * allowedMethods (user scoped)
 */
export async function allowedMethodsForUser(userId: string, provider: {
  instance: string;
  memberClass: string;
  memberCode: string;
  subsystemCode?: string | null;
}) {
  const { baseUrl, xRoadClient } = await getBaseUrlAndClientHeaderForUser(userId);
  const httpsAgent = await getMtlsAgentForUser(userId);

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
 * proxyGet directo (user scoped)
 */
export async function proxyGetForUser(userId: string, fullUrl: string) {
  const httpsAgent = await getMtlsAgentForUser(userId);
  const { xRoadClient } = await getBaseUrlAndClientHeaderForUser(userId);

  const { data, headers, status } = await axios.get(fullUrl, {
    httpsAgent,
    responseType: 'arraybuffer',
    headers: { 'X-Road-Client': xRoadClient }
  });

  return { data, headers, status };
}
