import crypto from 'crypto';
const ALGO = 'aes-256-gcm';

export function encryptAesGcm(plaintext: Buffer, masterKey: Buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, masterKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { iv, ciphertext, authTag };
}

export function decryptAesGcm(ciphertext: Buffer, iv: Buffer, authTag: Buffer, masterKey: Buffer) {
  const decipher = crypto.createDecipheriv(ALGO, masterKey, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
