// src/modules/xroad/router.ts
import { Router } from 'express';
import { prisma } from '../../db/prisma';
import { getMtlsAgentForUser } from '../../core/mtls/agentFactory';
import axios from 'axios';
import { requireAuth } from '../../middlewares/auth';

const xroadRouter = Router();

/** GET /api/xroad/files?providerId=&serviceCode=&endpointPath= */
xroadRouter.get('/files', requireAuth, async (req, res) => {
  try {
    const userId = req.auth!.userId;
    const { providerId, serviceCode, endpointPath } = req.query;

    if (!providerId || !serviceCode || !endpointPath) {
      return res.status(400).json({ error: 'Missing query params' });
    }

    // Validar ownership del provider
    const provider = await prisma.provider.findFirst({ where: { id: String(providerId), userId }});
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const user = await prisma.user.findUnique({ where: { id: userId }});
    if (!user?.baseUrl || !user.xRoadInstance) return res.status(400).json({ error: 'X-Road profile incomplete' });

    const consumerHeader = `${user.xRoadInstance}/${user.xRoadMemberClass}/${user.xRoadMemberCode}/${user.xRoadSubsystem}`;
    const base = user.baseUrl.replace(/\/+$/, '');
    const url = [
      base,
      provider.routeVersion,
      provider.xRoadInstance,
      provider.memberClass,
      provider.memberCode,
      provider.subsystemCode,
      String(serviceCode),
      String(endpointPath)
    ]
      .filter(Boolean)
      .join('/')
      .replace(/\/{2,}/g, '/')
      .replace(':/', '://');

    const httpsAgent = await getMtlsAgentForUser(userId);
    const r = await axios.get(url, { httpsAgent, headers: { 'X-Road-Client': consumerHeader } });

    let items: string[] = [];
    const data = r.data;
    if (Array.isArray(data)) {
      items = data.map(d => typeof d === 'string' ? d : d?.filename || d?.name || d?.path || JSON.stringify(d));
    } else if (data && typeof data === 'object') {
      const vals = Object.values(data);
      if (Array.isArray(vals[0])) {
        items = (vals[0] as any[]).map(d => typeof d === 'string' ? d : d?.filename || d?.name || d?.path || JSON.stringify(d));
      }
    }

    return res.json({ ok: true, items });
  } catch (err: any) {
    console.error('FILES ERROR =>', err?.message || err);
    return res.status(502).json({ error: 'files_fetch_failed', detail: err?.response?.data || err?.message || String(err) });
  }
});

/** GET /api/xroad/stream?providerId=&serviceCode=&endpointPath=&filename=&mode=preview|download */
xroadRouter.get('/stream', requireAuth, async (req, res) => {
  try {
    const userId = req.auth!.userId;
    const { providerId, serviceCode, endpointPath, filename, mode } = req.query;
    if (!providerId || !serviceCode || !endpointPath || !filename) {
      return res.status(400).json({ error: 'Missing params' });
    }

    const provider = await prisma.provider.findFirst({ where: { id: String(providerId), userId }});
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const user = await prisma.user.findUnique({ where: { id: userId }});
    if (!user?.baseUrl || !user.xRoadInstance) return res.status(400).json({ error: 'X-Road profile incomplete' });

    const consumerHeader = `${user.xRoadInstance}/${user.xRoadMemberClass}/${user.xRoadMemberCode}/${user.xRoadSubsystem}`;
    const base = user.baseUrl.replace(/\/+$/, '');
    const listBase = [
      base,
      provider.routeVersion,
      provider.xRoadInstance,
      provider.memberClass,
      provider.memberCode,
      provider.subsystemCode,
      String(serviceCode),
      String(endpointPath)
    ]
      .filter(Boolean)
      .join('/')
      .replace(/\/{2,}/g, '/')
      .replace(':/', '://')
      .replace(/\/$/, '');

    const finalUrl = `${listBase}/${encodeURIComponent(String(filename))}`;

    const httpsAgent = await getMtlsAgentForUser(userId);
    const response = await axios.get(finalUrl, {
      httpsAgent,
      responseType: 'stream',
      headers: { 'X-Road-Client': consumerHeader },
    });

    const dispo = mode === 'preview' ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${dispo}; filename="${filename}"`);
    if (response.headers['content-type']) {
      res.setHeader('Content-Type', response.headers['content-type'] as string);
    }
    return response.data.pipe(res);
  } catch (err: any) {
    console.error('STREAM ERROR =>', err?.message || err);
    return res.status(502).json({ error: 'stream_failed', detail: err?.response?.data || err?.message || String(err) });
  }
});

export { xroadRouter };
