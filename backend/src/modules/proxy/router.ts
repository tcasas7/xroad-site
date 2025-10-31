// src/modules/proxy/router.ts
import { Router } from 'express';
import { prisma } from '../../db/prisma';
import { getMtlsAgentForUser } from '../../core/mtls/agentFactory';
import axios from 'axios';
import { requireAuth } from '../../middlewares/auth';

const router = Router();

router.post('/', requireAuth, async (req, res) => {
  const userId = req.auth!.userId;
  const { providerId, serviceId, endpointId, method, path, query, body } = req.body || {};

  const provider = await prisma.provider.findFirst({ where: { id: providerId, userId }});
  const service  = await prisma.service.findFirst({ where: { id: serviceId, userId, providerId }});
  const endpoint = await prisma.endpoint.findFirst({ where: { id: endpointId, userId, serviceId }});

  if (!provider || !service || !endpoint) return res.status(400).json({ error: 'Invalid provider/service/endpoint' });

  const user = await prisma.user.findUnique({ where: { id: userId }});
  if (!user?.baseUrl || !user.xRoadInstance) return res.status(400).json({ error: 'X-Road profile incomplete' });

  const baseUrl = user.baseUrl.replace(/\/+$/, '');
  const xRoadClient = `${user.xRoadInstance}/${user.xRoadMemberClass}/${user.xRoadMemberCode}/${user.xRoadSubsystem}`;

  const base = [
    baseUrl,
    provider.routeVersion,
    provider.xRoadInstance,
    provider.memberClass,
    provider.memberCode,
    provider.subsystemCode || '',
    service.serviceCode
  ].filter(Boolean).join('/').replace(/\/{2,}/g, '/').replace(':/','://');

  const finalUrl = (path && typeof path === 'string')
    ? base + (path.startsWith('/') ? path : '/' + path)
    : base + (endpoint.path.startsWith('/') ? endpoint.path : '/' + endpoint.path);

  const methodUsed = (method || endpoint.method || 'GET').toUpperCase();

  try {
    const httpsAgent = await getMtlsAgentForUser(userId);
    const r = await axios.request({
      url: finalUrl,
      method: methodUsed as any,
      httpsAgent,
      headers: { 'X-Road-Client': xRoadClient, 'Accept': '*/*' },
      params: query || undefined,
      data: body || undefined,
      responseType: 'arraybuffer'
    });

    if (r.headers['content-type']) res.setHeader('Content-Type', r.headers['content-type'] as string);
    return res.status(r.status).send(Buffer.from(r.data));
  } catch (e:any) {
    const status = e?.response?.status || 502;
    const data = e?.response?.data;
    return res.status(status).send(data || String(e?.message || e));
  }
});

export { router };
