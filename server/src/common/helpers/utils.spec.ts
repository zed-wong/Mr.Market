import { getRFC3339Timestamp, subtractFee } from './utils';

describe('utils helpers', () => {
  it('returns RFC3339 timestamp ending with Z', () => {
    const timestamp = getRFC3339Timestamp();

    expect(timestamp.endsWith('Z')).toBe(true);
    expect(timestamp).toContain('T');
  });

  it('subtracts a fee percentage from an amount', () => {
    const result = subtractFee('100', '0.1');

    expect(result).toEqual({ amount: '90', fee: '10' });
  });
});
