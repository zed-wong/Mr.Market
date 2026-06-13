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
  exchange?: string,
): string {
  if (!orderId || !orderId.trim()) {
    throw new Error('orderId must be non-empty');
  }
  if (!Number.isInteger(seq) || seq < 0) {
    throw new Error('seq must be a non-negative integer');
  }

  const digest = createHash('sha1')
    .update(`${orderId.trim()}:${seq}:submitted`)
    .digest('hex');

  if (String(exchange || '').toLowerCase() === 'hyperliquid') {
    return `0x${digest.slice(0, 32)}`;
  }

  return digest.slice(0, 20);
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
