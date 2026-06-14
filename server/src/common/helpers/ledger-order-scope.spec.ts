import {
  buildDualAccountLedgerOrderId,
  normalizeAccountLabel,
  resolveLedgerOrderScope,
} from './ledger-order-scope';

describe('ledger order scope helpers', () => {
  it('treats a normal order as both userOrderId and ledgerOrderId', () => {
    expect(resolveLedgerOrderScope({ ledgerOrderId: 'order-1' })).toEqual({
      userOrderId: 'order-1',
      ledgerOrderId: 'order-1',
      accountLabel: 'default',
    });
  });

  it('resolves maker ledger order id to the root user order', () => {
    expect(resolveLedgerOrderScope({ ledgerOrderId: 'order-1:maker' })).toEqual(
      {
        userOrderId: 'order-1',
        ledgerOrderId: 'order-1:maker',
        accountLabel: 'maker',
      },
    );
  });

  it('resolves taker ledger order id to the root user order', () => {
    expect(resolveLedgerOrderScope({ ledgerOrderId: 'order-1:taker' })).toEqual(
      {
        userOrderId: 'order-1',
        ledgerOrderId: 'order-1:taker',
        accountLabel: 'taker',
      },
    );
  });

  it('does not split non-dual-account colon ids', () => {
    expect(
      resolveLedgerOrderScope({ ledgerOrderId: 'campaign:order-1' }),
    ).toEqual({
      userOrderId: 'campaign:order-1',
      ledgerOrderId: 'campaign:order-1',
      accountLabel: 'default',
    });
  });

  it('prefers explicit userOrderId over parsing', () => {
    expect(
      resolveLedgerOrderScope({
        userOrderId: 'explicit-root',
        ledgerOrderId: 'order-1:maker',
        accountLabel: 'maker',
      }),
    ).toEqual({
      userOrderId: 'explicit-root',
      ledgerOrderId: 'order-1:maker',
      accountLabel: 'maker',
    });
  });

  it('normalizes blank account labels to default', () => {
    expect(normalizeAccountLabel(undefined)).toBe('default');
    expect(normalizeAccountLabel(null)).toBe('default');
    expect(normalizeAccountLabel('')).toBe('default');
    expect(normalizeAccountLabel(' maker ')).toBe('maker');
  });

  it('builds dual-account ledger order ids through one helper', () => {
    expect(
      buildDualAccountLedgerOrderId({
        userOrderId: 'order-1',
        accountLabel: 'maker',
      }),
    ).toBe('order-1:maker');
  });

  it('allows explicit non-role account labels when building new scopes', () => {
    expect(
      buildDualAccountLedgerOrderId({
        userOrderId: 'order-1',
        accountLabel: 'account-a',
      }),
    ).toBe('order-1:account-a');
  });
});
