import { Router } from 'express';
import { prisma } from '../../db/prisma';
import { getBaseUrlAndClientHeader } from '../../core/xroad/client';
import { getMtlsAgent } from '../../core/mtls/agentFactory';
import axios from 'axios';

const router = Router();

router.post('/', async (req, res) => {
  const { providerId, serviceId, endpointId, method, path, query, body } = req.body || {};

  const provider = await prisma.provider.findUnique({ where: { id: providerId }});
  const service = await prisma.service.findUnique({ where: { id: serviceId, providerId }});
  const endpoint = await prisma.endpoint.findUnique({ where: { id: endpointId, serviceId }});

  if (!provider || !service || !endpoint) return res.status(400).json({ error: 'Invalid provider/service/endpoint' });

  const { baseUrl, xRoadClient } = await getBaseUrlAndClientHeader();
  const httpsAgent = await getMtlsAgent();

  // Construye URL final X-Road
  const base = [
    baseUrl,
    'r1',
    provider.xRoadInstance,
    provider.memberClass,
    provider.memberCode,
    provider.subsystemCode || '',
    service.serviceCode
  ].filter(Boolean).join('/').replace(/\/{2,}/g, '/').replace(':/','://');

  // si se pasa un path específico, respeta; si no, toma el del endpoint
  const finalUrl = (path && typeof path === 'string')
    ? base + (path.startsWith('/') ? path : '/' + path)
    : base + (endpoint.path.startsWith('/') ? endpoint.path : '/' + endpoint.path);

  const methodUsed = (method || endpoint.method || 'GET').toUpperCase();

  try {
    const r = await axios.request({
      url: finalUrl,
      method: methodUsed as any,
      httpsAgent,
      headers: { 'X-Road-Client': xRoadClient, 'Accept': '*/*' },
      params: query || undefined,
      data: body || undefined,
      responseType: 'arraybuffer'
    });

    // Propaga content-type si viene
    if (r.headers['content-type']) res.setHeader('Content-Type', r.headers['content-type'] as string);
    // Si querés forzar descarga: res.setHeader('Content-Disposition', 'attachment');

    return res.status(r.status).send(Buffer.from(r.data));
  } catch (e:any) {
    const status = e?.response?.status || 502;
    const data = e?.response?.data;
    return res.status(status).send(data || String(e?.message || e));
  }
});

export { router };
