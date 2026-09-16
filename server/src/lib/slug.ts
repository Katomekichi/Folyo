import crypto from 'crypto';

export function generateSlug(): string {
  return crypto.randomBytes(6).toString('base64url');
}
