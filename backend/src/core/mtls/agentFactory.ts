// src/core/mtls/agentFactory.ts
import https from 'https';
import tls from 'tls';
import { prisma } from '../../db/prisma';
import { decryptAesGcm } from '../crypto/aesgcm';
import { getCachedAgent, putAgent } from './agentCache';
import forge from 'node-forge';

export async function getMtlsAgentForUser(userId: string): Promise<https.Agent> {
  const cacheKey = `userCert_${userId}`;
  const cached = getCachedAgent(cacheKey);
  if (cached) return cached;

  const userCert = await prisma.userCertificate.findUnique({ where: { userId }});
  if (!userCert) throw new Error('No hay certificado cargado para este usuario');

  const masterKey = Buffer.from(process.env.MASTER_KEY!, 'hex');

  const p12Encrypted  = Buffer.from(userCert.p12Encrypted);
  const iv            = Buffer.from(userCert.iv);
  const authTag       = Buffer.from(userCert.authTag);
  const pfx           = decryptAesGcm(p12Encrypted, iv, authTag, masterKey);

  const passEncrypted = Buffer.from(userCert.passEncrypted);
  const passIv        = Buffer.from(userCert.passIv);
  const passAuthTag   = Buffer.from(userCert.passAuthTag);
  const passphrase    = decryptAesGcm(passEncrypted, passIv, passAuthTag, masterKey).toString('utf8').trim();

  // Validación local
  tls.createSecureContext({ pfx, passphrase });

  const agent = new https.Agent({
    pfx,
    passphrase,
    requestCert: true,
    rejectUnauthorized: !process.env.DEV_INSECURE_TLS
  });

  putAgent(cacheKey, agent);
  return agent;
}

/** Helpers para extraer metadatos del p12 */
export function parsePkcs12Meta(pfx: Buffer, passphrase: string) {
  const p12Asn1 = forge.asn1.fromDer(pfx.toString('binary'));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, passphrase);
  const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = bags[forge.pki.oids.certBag]?.[0];
  if (!certBag) throw new Error('No certificate found inside p12');
  return certBag.cert;
}

export function getCertFingerprintSubjectDates(cert: any) {
  const fingerprint = forge.pki.getPublicKeyFingerprint(cert.publicKey, {
    md: forge.md.sha256.create(),
    encoding: 'hex',
  }).toUpperCase();

  const subject = cert.subject.attributes.map((a: any) => `${a.shortName}=${a.value}`).join(', ');
  return {
    fingerprint,
    subject,
    notBefore: cert.validity.notBefore,
    notAfter:  cert.validity.notAfter,
  };
}
