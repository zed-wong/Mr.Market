import type { Exchange } from '$lib/types/hufi/grow';

export type ExchangeReadinessStatus = 'ready' | 'disabled' | 'missing' | 'unknown';

export interface ExchangeReadinessView {
  status: ExchangeReadinessStatus;
  label: string;
  title: string;
  description: string;
  tone: string;
}

export const exchangeReadinessLabels: Record<ExchangeReadinessStatus, string> = {
  ready: 'ready',
  disabled: 'disabled',
  missing: 'missing',
  unknown: 'unknown',
};

export const exchangeReadinessTone: Record<ExchangeReadinessStatus, string> = {
  ready: 'badge-success text-base-100',
  disabled: 'badge-warning text-base-content',
  missing: 'badge-warning text-base-content',
  unknown: 'badge-ghost text-base-content',
};

const hasIdentity = (exchange: Partial<Exchange>) =>
  Boolean(String(exchange.exchange_id || '').trim() || String(exchange.name || '').trim());

export const getExchangeReadiness = (exchange?: Partial<Exchange> | null): ExchangeReadinessView => {
  if (!exchange) {
    return {
      status: 'missing',
      label: exchangeReadinessLabels.missing,
      title: 'exchange missing',
      description: 'No configured exchange record was returned.',
      tone: exchangeReadinessTone.missing,
    };
  }

  if (!hasIdentity(exchange) || typeof exchange.enable !== 'boolean') {
    return {
      status: 'unknown',
      label: exchangeReadinessLabels.unknown,
      title: 'exchange readiness unknown',
      description: 'The exchange record is present, but its enabled state could not be classified.',
      tone: exchangeReadinessTone.unknown,
    };
  }

  if (exchange.enable) {
    return {
      status: 'ready',
      label: exchangeReadinessLabels.ready,
      title: 'configured and enabled',
      description: 'This exchange is configured and enabled for operations.',
      tone: exchangeReadinessTone.ready,
    };
  }

  return {
    status: 'disabled',
    label: exchangeReadinessLabels.disabled,
    title: 'configured but disabled',
    description: 'This exchange is configured, but it is disabled and not usable for trading.',
    tone: exchangeReadinessTone.disabled,
  };
};

export const summarizeExchangeReadiness = (exchanges: Partial<Exchange>[] | null | undefined) => {
  const views = (exchanges ?? []).map(getExchangeReadiness);
  return {
    total: views.length,
    ready: views.filter((view) => view.status === 'ready').length,
    disabled: views.filter((view) => view.status === 'disabled').length,
    missing: views.length === 0 ? 1 : 0,
    unknown: views.filter((view) => view.status === 'unknown').length,
  };
};
