export function buildClientOrderId(orderId: string, seq: number): string {
  if (!orderId || orderId.includes(':')) {
    throw new Error('orderId must be non-empty and must not contain ":"');
  }
  if (!Number.isInteger(seq) || seq < 0) {
    throw new Error('seq must be a non-negative integer');
  }

  return `${orderId}:${seq}`;
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
