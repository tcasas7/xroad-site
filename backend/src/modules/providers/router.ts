// src/modules/providers/router.ts

import { Router } from 'express';
import { prisma } from '../../db/prisma';
import { refreshProviders } from '../../core/xroad/discovery';
import { getMtlsAgent } from '../../core/mtls/agentFactory';
import axios from 'axios';

const router = Router();

router.get('/', async (_req, res) => {
  const providers = await prisma.provider.findMany({
    orderBy: { displayName: 'asc' }
  });
  res.json(providers);
});


router.get('/:id/services', async (req, res) => {
  const { id } = req.params;
  const provider = await prisma.provider.findUnique({
    where: { id },
    include: {
      services: {
        include: {
          endpoints: true
        }
      }
    }
  });

  if (!provider) {
    return res.status(404).json({ error: 'provider_not_found' });
  }

  return res.json({
    provider: provider.displayName,
    services: provider.services.map(s => ({
      code: s.serviceCode,
      version: s.serviceVersion,
      type: s.serviceType,
      endpoints: s.endpoints
    }))
  });
});


router.post('/refresh', async (_req, res) => {
  try {
    const result = await refreshProviders();
    return res.json(result);
  } catch (err: any) {
    console.error("Refresh error =>", err);
    return res.status(500).json({
      error: 'discovery_failed',
      detail: err?.message || String(err)
    });
  }
});

export { router };
