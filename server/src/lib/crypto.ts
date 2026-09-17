import crypto from 'crypto';

const keyHex = process.env.EMAIL_ENCRYPTION_KEY;
const key = keyHex ? Buffer.from(keyHex, 'hex') : null;

function requireKey(): Buffer {
  if (!key || key.length !== 32) {
    throw new Error('EMAIL_ENCRYPTION_KEY must be set to a 32-byte hex string (64 hex characters)');
  }
  return key;
}

// AES-256-GCM, storing iv + authTag + ciphertext as "iv.tag.data" (base64 each).
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', requireKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, encrypted].map((b) => b.toString('base64')).join('.');
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Malformed encrypted payload');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', requireKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
