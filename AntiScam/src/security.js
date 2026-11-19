import { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

export function safeEquals(a, b) {
  const ah = createHash('sha256').update(String(a ?? '')).digest();
  const bh = createHash('sha256').update(String(b ?? '')).digest();
  return timingSafeEqual(ah, bh);
}
export function makeMemberKey(secret, communityId, memberId) {
  return createHmac('sha256', secret).update(`${communityId}\u0000${memberId}`).digest('hex');
}
function validKey(key) {
  if (!/^[a-f\d]{64}$/i.test(String(key ?? ''))) throw new Error('DATA_ENCRYPTION_KEY must be exactly 64 hex characters');
  return Buffer.from(key, 'hex');
}
export function encryptMemberId(value, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', validKey(key), iv);
  const data = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}
export function decryptMemberId(value, key) {
  const raw = Buffer.from(value, 'base64url');
  if (raw.length < 29) throw new Error('Invalid encrypted member id');
  const decipher = createDecipheriv('aes-256-gcm', validKey(key), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}
export function verifyWebhook({ raw, signature, timestamp, secret, now = Date.now() }) {
  const ts = Number(timestamp);
  if (!Number.isSafeInteger(ts) || Math.abs(now - ts * 1000) > 5 * 60 * 1000 || !secret || !signature) return false;
  const expected = createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex');
  return /^sha256=[a-f0-9]{64}$/i.test(String(signature)) && safeEquals(signature.slice(7), expected);
}
export function actionKey(eventId, action) { return `${eventId}:${action}`; }
