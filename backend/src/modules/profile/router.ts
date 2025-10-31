import { Router } from 'express';
import { prisma } from '../../db/prisma';
import multer from 'multer';
import tls from 'tls';
import { requireAuth } from '../../middlewares/auth';
import { decryptAesGcm, encryptAesGcm } from '../../core/crypto/aesgcm';
import { parsePkcs12Meta, getCertFingerprintSubjectDates } from '../../core/mtls/agentFactory';

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

/** =============================
 * PATCH /api/profile/xroad
 * Guarda la configuración baseUrl + X-Road Client del usuario
 * ============================= */
router.patch('/xroad', requireAuth, async (req, res) => {
  const { baseUrl, xRoadClient } = req.body || {};
  if (!baseUrl || !xRoadClient)
    return res.status(400).json({ error: 'missing_fields' });

  const parts = String(xRoadClient).split('/');
  if (parts.length !== 4)
    return res.status(400).json({
      error: 'xroadclient_format',
      hint: 'INST/CLASS/MEMBER/SUBSYSTEM',
    });

  const [instance, memberClass, memberCode, subsystem] = parts;

  await prisma.user.update({
    where: { id: req.auth!.userId },
    data: {
      baseUrl: String(baseUrl).replace(/\/+$/, ''),
      xRoadInstance: instance,
      xRoadMemberClass: memberClass,
      xRoadMemberCode: memberCode,
      xRoadSubsystem: subsystem,
    },
  });

  return res.json({ ok: true });
});

/** =============================
 * GET /api/profile/xroad
 * Devuelve el estado del perfil X-Road para el usuario logueado
 * ============================= */

router.get('/xroad', requireAuth, async (req, res) => {
  try {
    const userId = req.auth!.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        baseUrl: true,
        xRoadInstance: true,
        xRoadMemberClass: true,
        xRoadMemberCode: true,
        xRoadSubsystem: true,
        certificate: { select: { id: true } },
        role: true,
      },
    });

    if (!user) return res.status(404).json({ ok: false, error: "user_not_found" });

    const ok =
      !!user.baseUrl?.trim() &&
      !!user.xRoadInstance?.trim() &&
      !!user.xRoadMemberClass?.trim() &&
      !!user.xRoadMemberCode?.trim() &&
      !!user.xRoadSubsystem?.trim() &&
      !!user.certificate?.id;

    return res.json({
      ok,
      hasCert: !!user.certificate?.id,
      baseUrl: user.baseUrl,
      userRole: user.role,
      xroad: {
        instance: user.xRoadInstance,
        memberClass: user.xRoadMemberClass,
        memberCode: user.xRoadMemberCode,
        subsystem: user.xRoadSubsystem,
      },
    });
  } catch (err) {
    console.error("❌ Error en /profile/xroad:", err);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});


/** =============================
 * POST /api/profile/certificate
 * Sube y asocia el .p12 cifrado al usuario
 * ============================= */
router.post('/certificate', requireAuth, upload.single('p12'), async (req, res) => {
  try {
    const { passphrase = '' } = req.body || {};
    if (!req.file) {
      return res.status(400).json({ error: 'p12_required' });
    }

    // Validar estructura básica del .p12
    try {
      tls.createSecureContext({ pfx: req.file.buffer, passphrase });
    } catch {
      return res.status(400).json({ error: 'invalid_p12_or_passphrase' });
    }

    // Extraer metadatos
    const certObj = parsePkcs12Meta(req.file.buffer, passphrase);
    const meta = getCertFingerprintSubjectDates(certObj);

    // Cifrar archivo y passphrase
    const masterKey = Buffer.from(process.env.MASTER_KEY!, 'hex');
    const encP12 = encryptAesGcm(req.file.buffer, masterKey);
    const encPass = encryptAesGcm(Buffer.from(passphrase, 'utf8'), masterKey);

    const userId = req.auth!.userId;

    // Guardar certificado (upsert)
    await prisma.userCertificate.upsert({
      where: { userId },
      update: {
        p12Encrypted: encP12.ciphertext,
        iv: encP12.iv,
        authTag: encP12.authTag,
        passEncrypted: encPass.ciphertext,
        passIv: encPass.iv,
        passAuthTag: encPass.authTag,
        fingerprint: meta.fingerprint,
        subject: meta.subject,
        notBefore: meta.notBefore,
        notAfter: meta.notAfter,
      },
      create: {
        userId,
        p12Encrypted: encP12.ciphertext,
        iv: encP12.iv,
        authTag: encP12.authTag,
        passEncrypted: encPass.ciphertext,
        passIv: encPass.iv,
        passAuthTag: encPass.authTag,
        fingerprint: meta.fingerprint,
        subject: meta.subject,
        notBefore: meta.notBefore,
        notAfter: meta.notAfter,
      },
    });

    console.log(`✅ Certificado guardado para usuario ${userId}`);

    // 🧠 Inicializar perfil X-Road si está vacío
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (
      !user?.baseUrl ||
      !user.xRoadInstance ||
      !user.xRoadMemberClass ||
      !user.xRoadMemberCode ||
      !user.xRoadSubsystem
    ) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          baseUrl: process.env.DEFAULT_XROAD_BASEURL || 'https://localhost:5500',
          xRoadInstance: process.env.DEFAULT_XROAD_INSTANCE || 'SI',
          xRoadMemberClass: process.env.DEFAULT_XROAD_MEMBER_CLASS || 'GOV',
          xRoadMemberCode: process.env.DEFAULT_XROAD_MEMBER_CODE || 'MSP',
          xRoadSubsystem: process.env.DEFAULT_XROAD_SUBSYSTEM || 'Consumidor',
        },
      });

      console.log(`⚙️ Perfil X-Road inicializado automáticamente para ${user?.pin}`);
    }

    return res.json({ ok: true, meta });
  } catch (e: unknown) {
    const err = e as Error;
    console.error('❌ Cert upload error:', err.message || err);
    return res.status(500).json({
      error: 'cert_upload_failed',
      detail: err.message || String(err),
    });
  }
});

export { router };

