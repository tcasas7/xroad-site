// src/modules/providers/router.ts
import { Router } from 'express';
import { prisma } from '../../db/prisma';
import { refreshProviders } from '../../core/xroad/discovery';
import { requireAuth } from '../../middlewares/auth';

const router = Router();

/** GET /api/providers  -> lista para el usuario logueado */
router.get('/', requireAuth, async (req, res) => {
  const userId = req.auth!.userId;
  const providers = await prisma.provider.findMany({
    where: { userId },
    orderBy: { displayName: 'asc' }
  });
  res.json(providers);
});

/** GET /api/providers/:id/services  -> servicios del provider SI es del usuario */
router.get('/:id/services', requireAuth, async (req, res) => {
  const userId = req.auth!.userId;
  const { id } = req.params;

  const provider = await prisma.provider.findFirst({
    where: { id, userId },
    include: { services: { include: { endpoints: true } } }
  });

  if (!provider) return res.status(404).json({ error: 'provider_not_found' });

  return res.json({
    provider: provider.displayName,
    services: provider.services.map(s => ({
      code: s.serviceCode,
      version: s.serviceVersion,
      type: s.serviceType,
      endpoints: s.endpoints.map(e => ({ method: e.method, path: e.path }))
    }))
  });
});

/** POST /api/providers/refresh -> delete→recreate para el usuario */
router.post('/refresh', requireAuth, async (req, res) => {
  try {
    const userId = req.auth!.userId;
    const result = await refreshProviders(userId);
    return res.json(result);
  } catch (err: any) {
    console.error('Refresh error =>', err);
    return res.status(500).json({ error: 'discovery_failed', detail: err?.message || String(err) });
  }
});

export { router };
