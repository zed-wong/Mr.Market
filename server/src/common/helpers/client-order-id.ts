import { createHash } from 'crypto';

export function buildClientOrderId(orderId: string, seq: number): string {
  if (!orderId || orderId.includes(':')) {
    throw new Error('orderId must be non-empty and must not contain ":"');
  }
  if (!Number.isInteger(seq) || seq < 0) {
    throw new Error('seq must be a non-negative integer');
  }

  return `${orderId}:${seq}`;
}

export function buildSubmittedClientOrderId(
  orderId: string,
  seq: number,
): string {
  if (!orderId || !orderId.trim()) {
    throw new Error('orderId must be non-empty');
  }
  if (!Number.isInteger(seq) || seq < 0) {
    throw new Error('seq must be a non-negative integer');
  }

  const orderHash = createHash('sha1')
    .update(orderId.trim())
    .digest('hex')
    .slice(0, 12);
  const seqToken = seq.toString(36);

  return `mm-${orderHash}-${seqToken}`;
}

export function parseClientOrderId(
  clientOrderId: string,
): { orderId: string; seq: number } | null {
  const parts = clientOrderId.split(':');

  if (parts.length !== 2 || !parts[0]) {
    return null;
  }
  if (!/^\d+$/.test(parts[1])) {
    return null;
  }

  const seq = Number(parts[1]);

  if (!Number.isSafeInteger(seq)) {
    return null;
  }

  return { orderId: parts[0], seq };
}
