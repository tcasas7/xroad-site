import https from 'https';
import tls from 'tls';
import { prisma } from '../../db/prisma';
import { decryptAesGcm } from '../crypto/aesgcm';
import { getCachedAgent, putAgent } from './agentCache';

export async function getMtlsAgent(): Promise<https.Agent> {
  const cacheKey = 'singleton';
  const cached = getCachedAgent(cacheKey);
  if (cached) return cached;

  const settings = await prisma.tenantSettings.findUnique({ where: { id: 'singleton' }});
  if (!settings) throw new Error('Tenant settings not configured');

  const cert = await prisma.certificate.findUnique({ where: { tenantId: settings.id }});
  if (!cert) throw new Error('Certificate not uploaded');

  const masterKey = Buffer.from(process.env.MASTER_KEY!, 'hex');

  // 🔹 Convertimos Uint8Array → Buffer ANTES de decrypt
  const p12Encrypted  = Buffer.from(cert.p12Encrypted);
  const iv            = Buffer.from(cert.iv);
  const authTag       = Buffer.from(cert.authTag);

  const passEncrypted = Buffer.from(cert.passEncrypted);
  const passIv        = Buffer.from(cert.passIv);
  const passAuthTag   = Buffer.from(cert.passAuthTag);

  // 🔹 Desencriptamos P12
  const pfx = decryptAesGcm(p12Encrypted, iv, authTag, masterKey);

  // 🔹 Desencriptamos passphrase real
  const passphrase = decryptAesGcm(passEncrypted, passIv, passAuthTag, masterKey)
    .toString('utf-8')
    .trim();

  // 🔹 Validación local
  tls.createSecureContext({ pfx, passphrase });

  // 🔹 Agent mTLS real
  const agent = new https.Agent({
    pfx,
    passphrase,
    requestCert: true,
    rejectUnauthorized: !process.env.DEV_INSECURE_TLS
  });

  putAgent(cacheKey, agent);
  return agent;
}
