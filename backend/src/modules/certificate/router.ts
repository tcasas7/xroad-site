import { Router } from 'express';
import multer from 'multer';
import tls from 'tls';
import crypto from 'crypto';
import { prisma } from '../../db/prisma';
import { encryptAesGcm } from '../../core/crypto/aesgcm';
import { clearAgent } from '../../core/mtls/agentCache';

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

router.post('/', upload.single('p12') as any, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'p12 file required' });

  const passphrase: string = req.body?.passphrase || '';

  const tenant = await prisma.tenantSettings.findUnique({
    where: { id: 'singleton' }
  });
  if (!tenant) return res.status(400).json({ error: 'Configure settings first' });

  try {
    //
    // ✅ Validar p12 con passphrase real
    //
    tls.createSecureContext({ pfx: req.file.buffer, passphrase });

    // ✅ Fingerprint del archivo
    const fingerprint = crypto.createHash('sha256')
      .update(req.file.buffer)
      .digest('hex');

    // TODO: en una versión más adelante vamos a extraer CN / NotBefore / NotAfter reales
    const subject = 'p12_import';
    const notBefore = new Date();
    const notAfter = new Date(Date.now() + 365 * 24 * 3600 * 1000);

    // ✅ Cifrado AES-GCM
    const masterKey = Buffer.from(process.env.MASTER_KEY!, 'hex');

    const encryptedP12 = encryptAesGcm(req.file.buffer, masterKey);
    const encryptedPass = encryptAesGcm(Buffer.from(passphrase, 'utf-8'), masterKey);

    await prisma.certificate.upsert({
      where: { tenantId: tenant.id },
      update: {
        p12Encrypted: encryptedP12.ciphertext,
        iv: encryptedP12.iv,
        authTag: encryptedP12.authTag,
        label: req.file.originalname,
        fingerprint,
        subject,
        notBefore,
        notAfter,
        // nuevo: guardamos passphrase cifrada
        passIv: encryptedPass.iv,
        passAuthTag: encryptedPass.authTag,
        passEncrypted: encryptedPass.ciphertext,
      },
      create: {
        tenantId: tenant.id,
        p12Encrypted: encryptedP12.ciphertext,
        iv: encryptedP12.iv,
        authTag: encryptedP12.authTag,
        label: req.file.originalname,
        fingerprint,
        subject,
        notBefore,
        notAfter,
        passIv: encryptedPass.iv,
        passAuthTag: encryptedPass.authTag,
        passEncrypted: encryptedPass.ciphertext,
      }
    });

    // ✅ invalidar cache
    clearAgent('singleton');

    res.json({ ok: true, label: req.file.originalname });
  } catch (e: any) {
    return res.status(400).json({
      error: 'Invalid p12 or passphrase',
      detail: String(e?.message || e)
    });
  }
});

router.get('/', async (_req, res) => {
  const tenant = await prisma.tenantSettings.findUnique({
    where: { id: 'singleton' }, 
    include: { certificate: true }
  });
  if (!tenant?.certificate) return res.json(null);

  const { id, label, fingerprint, subject, notBefore, notAfter, createdAt } = tenant.certificate;
  res.json({ id, label, fingerprint, subject, notBefore, notAfter, createdAt });
});

export { router };
