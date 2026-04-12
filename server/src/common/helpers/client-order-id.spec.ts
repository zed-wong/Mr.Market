import {
  buildClientOrderId,
  buildSubmittedClientOrderId,
  parseClientOrderId,
} from './client-order-id';

describe('client-order-id helpers', () => {
  it('builds clientOrderId in {orderId}:{seq} format', () => {
    expect(buildClientOrderId('123e4567-e89b-12d3-a456-426614174000', 7)).toBe(
      '123e4567-e89b-12d3-a456-426614174000:7',
    );
  });

  it('parses valid clientOrderId values', () => {
    expect(parseClientOrderId('order-1:42')).toEqual({
      orderId: 'order-1',
      seq: 42,
    });
  });

  it('builds exchange-safe submitted clientOrderId values deterministically', () => {
    expect(buildSubmittedClientOrderId('order-1', 42)).toBe(
      'cid-ea37b42b1c3b-78b0-16',
    );
    expect(buildSubmittedClientOrderId('order-1', 42)).toMatch(
      /^cid-[a-f0-9]{12}-[a-f0-9]{4}-[a-z0-9]+$/,
    );
  });

  it('rejects invalid clientOrderId values', () => {
    expect(parseClientOrderId('order-1')).toBeNull();
    expect(parseClientOrderId('order-1:abc')).toBeNull();
    expect(parseClientOrderId('order-1:-1')).toBeNull();
    expect(parseClientOrderId('order-1:1:2')).toBeNull();
    expect(parseClientOrderId(':1')).toBeNull();
  });

  it('rejects invalid inputs when building clientOrderId', () => {
    expect(() => buildClientOrderId('order:1', 0)).toThrow(
      'orderId must be non-empty and must not contain ":"',
    );
    expect(() => buildClientOrderId('order-1', -1)).toThrow(
      'seq must be a non-negative integer',
    );
    expect(() => buildSubmittedClientOrderId('', 0)).toThrow(
      'orderId must be non-empty',
    );
    expect(() => buildSubmittedClientOrderId('order-1', -1)).toThrow(
      'seq must be a non-negative integer',
    );
  });
});
