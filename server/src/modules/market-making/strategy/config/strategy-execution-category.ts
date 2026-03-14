import { BadRequestException } from '@nestjs/common';

export type StrategyExecutionCategory = 'clob_cex' | 'clob_dex' | 'amm_dex';

export const STRATEGY_EXECUTION_CATEGORIES: StrategyExecutionCategory[] = [
  'clob_cex',
  'clob_dex',
  'amm_dex',
];

export function normalizeExecutionCategory(
  value?: string,
): StrategyExecutionCategory {
  const normalized = String(value || 'clob_cex')
    .trim()
    .toLowerCase();

  if (normalized === 'cex') {
    return 'clob_cex';
  }
  if (normalized === 'dex') {
    return 'amm_dex';
  }
  if (normalized === 'clob_cex') {
    return 'clob_cex';
  }
  if (normalized === 'clob_dex') {
    return 'clob_dex';
  }
  if (normalized === 'amm_dex') {
    return 'amm_dex';
  }

  throw new BadRequestException(
    `Unsupported execution category ${value}. Allowed: clob_cex, clob_dex, amm_dex`,
  );
}

export function toLegacyExecutionVenue(
  executionCategory: StrategyExecutionCategory,
): 'cex' | 'dex' {
  return executionCategory === 'amm_dex' ? 'dex' : 'cex';
}
