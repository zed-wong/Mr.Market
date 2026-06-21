import { BadRequestException } from '@nestjs/common';

export type StrategyExecutionCategory = 'clob' | 'clob_dex' | 'amm';

export const STRATEGY_EXECUTION_CATEGORIES: StrategyExecutionCategory[] = [
  'clob',
  'clob_dex',
  'amm',
];

export function normalizeExecutionCategory(
  value?: string,
): StrategyExecutionCategory {
  const normalized = String(value || 'clob')
    .trim()
    .toLowerCase();

  if (normalized === 'cex') {
    return 'clob';
  }
  if (normalized === 'dex') {
    return 'amm';
  }
  if (normalized === 'clob') {
    return 'clob';
  }
  if (normalized === 'clob_dex') {
    return 'clob_dex';
  }
  if (normalized === 'amm') {
    return 'amm';
  }

  throw new BadRequestException(
    `Unsupported execution category ${value}. Allowed: clob, clob_dex, amm`,
  );
}

export function toLegacyExecutionVenue(
  executionCategory: StrategyExecutionCategory,
): 'cex' | 'dex' {
  return executionCategory === 'amm' ? 'dex' : 'cex';
}
