import BigNumber from 'bignumber.js';

export const getRFC3339Timestamp = () => {
  return new Date().toISOString();
};

export const subtractFee = (
  amount: string,
  feePercentage: string,
): { amount: string; fee: string } => {
  const amountBN = new BigNumber(amount);
  const feePercentageBN = new BigNumber(feePercentage);

  const feeAmount = amountBN.multipliedBy(feePercentageBN);
  const finalAmount = amountBN.minus(feeAmount);

  return {
    amount: finalAmount.toString(),
    fee: feeAmount.toString(),
  };
};

export const isUniqueConstraintViolation = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidates: Array<Record<string, unknown>> = [
    error as Record<string, unknown>,
  ];
  const nestedKeys = ['driverError', 'cause', 'originalError'];

  for (const key of nestedKeys) {
    const nested = (error as Record<string, unknown>)[key];

    if (nested && typeof nested === 'object') {
      candidates.push(nested as Record<string, unknown>);
    }
  }

  for (const candidate of candidates) {
    const code = String(candidate.code ?? '');
    const errno = Number(candidate.errno);
    const normalizedMessage = String(candidate.message ?? '').toLowerCase();

    if (
      code === '23505' ||
      code === 'SQLITE_CONSTRAINT' ||
      code === 'SQLITE_CONSTRAINT_UNIQUE' ||
      errno === 19
    ) {
      return true;
    }

    if (
      normalizedMessage.includes('duplicate') ||
      normalizedMessage.includes('unique constraint failed')
    ) {
      return true;
    }
  }

  return false;
};
