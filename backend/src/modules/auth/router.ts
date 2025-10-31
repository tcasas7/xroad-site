import { Router } from 'express';
import { prisma } from '../../db/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { requireAuth } from '../../middlewares/auth';

const router = Router();

// ✅ POST /api/auth/register (solo para admin - después se protegerá)
router.post('/register', async (req, res) => {
  const { pin, password } = req.body || {};

  if (!pin || !password) {
    return res.status(400).json({ error: 'pin_password_required' });
  }

  // PIN debe ser único
  const exists = await prisma.user.findUnique({ where: { pin } });
  if (exists) return res.status(409).json({ error: 'pin_taken' });

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      pin,
      passwordHash,
      firstLoginDone: false,
      role: 'USER',    // o 'ADMIN' si querés asignarlo manual
    },
  });

  return res.json({ ok: true, userId: user.id });
});

// ✅ POST /api/auth/login (PIN + password)
router.post('/login', async (req, res) => {
  const { pin, password } = req.body || {};
  if (!pin || !password)
    return res.status(400).json({ error: 'pin_password_required' });

  const user = await prisma.user.findUnique({ where: { pin } });
  if (!user)
    return res.status(401).json({ error: 'invalid_credentials' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok)
    return res.status(401).json({ error: 'invalid_credentials' });

  // Crear token 8h
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
    expiresIn: '8h',
  });

  res.cookie('xroad_token', token, {
    httpOnly: true,
    secure: false, // producción: true
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000,
  });

  return res.json({
    ok: true,
    firstLoginDone: user.firstLoginDone,
    profile: {
      pin: user.pin,
      baseUrl: user.baseUrl,
      xroad: {
        instance: user.xRoadInstance,
        memberClass: user.xRoadMemberClass,
        memberCode: user.xRoadMemberCode,
        subsystem: user.xRoadSubsystem,
      },
    },
  });
});

// ✅ POST /api/auth/change-password (solo primer login)
router.post('/change-password', requireAuth, async (req, res) => {
  const { newPassword } = req.body || {};
  const userId = req.auth?.userId;

  if (!userId || !newPassword)
    return res.status(400).json({ error: 'missing_fields' });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, firstLoginDone: true },
  });

  return res.json({ ok: true });
});

// ✅ POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.cookie('xroad_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: new Date(0),
  });
  return res.json({ ok: true });
});

export { router };
