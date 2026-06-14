export type LedgerOrderScope = {
  userOrderId: string;
  ledgerOrderId: string;
  accountLabel: string;
};

const DUAL_ACCOUNT_LABELS = new Set(['maker', 'taker']);

export function normalizeAccountLabel(accountLabel?: string | null): string {
  const normalized = String(accountLabel || '').trim();

  return normalized || 'default';
}

export function buildDualAccountLedgerOrderId(params: {
  userOrderId: string;
  accountLabel: string;
}): string {
  const userOrderId = String(params.userOrderId || '').trim();
  const accountLabel = normalizeAccountLabel(params.accountLabel);

  if (!userOrderId) {
    throw new Error('userOrderId must be non-empty');
  }

  if (!accountLabel || accountLabel === 'default') {
    throw new Error('dual-account ledger order id requires account label');
  }

  return `${userOrderId}:${accountLabel}`;
}

export function resolveLedgerOrderScope(params: {
  ledgerOrderId: string;
  userOrderId?: string | null;
  accountLabel?: string | null;
}): LedgerOrderScope {
  const ledgerOrderId = String(params.ledgerOrderId || '').trim();

  if (!ledgerOrderId) {
    throw new Error('ledgerOrderId must be non-empty');
  }

  const explicitUserOrderId = String(params.userOrderId || '').trim();
  const explicitAccountLabel = normalizeAccountLabel(params.accountLabel);

  if (explicitUserOrderId) {
    return {
      userOrderId: explicitUserOrderId,
      ledgerOrderId,
      accountLabel: explicitAccountLabel,
    };
  }

  const separatorIndex = ledgerOrderId.lastIndexOf(':');

  if (separatorIndex > 0) {
    const possibleUserOrderId = ledgerOrderId.slice(0, separatorIndex);
    const possibleAccountLabel = ledgerOrderId.slice(separatorIndex + 1);

    if (DUAL_ACCOUNT_LABELS.has(possibleAccountLabel)) {
      return {
        userOrderId: possibleUserOrderId,
        ledgerOrderId,
        accountLabel: possibleAccountLabel,
      };
    }
  }

  return {
    userOrderId: ledgerOrderId,
    ledgerOrderId,
    accountLabel: explicitAccountLabel,
  };
}
