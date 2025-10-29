import { Router } from 'express';
import { prisma } from '../../db/prisma';
import { z } from 'zod';

const router = Router();

const bodySchema = z.object({
  baseUrl: z.string().url(),
  xRoadClient: z.string().regex(/^[^\/\s]+\/[^\/\s]+\/[^\/\s]+\/[^\/\s]+$/)
});

router.post('/', async (req, res) => {
  const parse = bodySchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

  const { baseUrl, xRoadClient } = parse.data;
  const [instance, memberClass, memberCode, subsystem] = xRoadClient.split('/');

  const s = await prisma.tenantSettings.upsert({
    where: { id: 'singleton' },
    update: { baseUrl, xRoadInstance: instance, xRoadMemberClass: memberClass, xRoadMemberCode: memberCode, xRoadSubsystem: subsystem },
    create: { id: 'singleton', baseUrl, xRoadInstance: instance, xRoadMemberClass: memberClass, xRoadMemberCode: memberCode, xRoadSubsystem: subsystem }
  });

  res.json({ ok: true, settings: s });
});

router.get('/', async (_req, res) => {
  const s = await prisma.tenantSettings.findUnique({ where: { id: 'singleton' }});
  res.json(s ?? null);
});

export { router };
