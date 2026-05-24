import type { Exchange } from '$lib/types/hufi/grow';

export type ExchangeReadinessStatus = 'ready' | 'disabled' | 'missing' | 'unknown';

export interface ExchangeEnablementActionView {
  label: string;
  title: string;
  actionLabel: string;
  actionTitle: string;
  canToggle: boolean;
  nextEnable: boolean | null;
  tone: string;
}

export interface ExchangeReadinessView {
  status: ExchangeReadinessStatus;
  label: string;
  title: string;
  description: string;
  tone: string;
  enablement: ExchangeEnablementActionView;
}

export type ExchangeReadinessSource = Partial<Omit<Exchange, 'enable'>> & { enable?: unknown };

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

const hasIdentity = (exchange: ExchangeReadinessSource) =>
  Boolean(String(exchange.exchange_id || '').trim() || String(exchange.name || '').trim());

const enablementUnavailable = (
  label: string,
  actionLabel: string,
  title: string,
): ExchangeEnablementActionView => ({
  label,
  title,
  actionLabel,
  actionTitle: title,
  canToggle: false,
  nextEnable: null,
  tone: 'btn-ghost text-base-content',
});

export const getExchangeReadiness = (exchange?: ExchangeReadinessSource | null): ExchangeReadinessView => {
  if (!exchange) {
    return {
      status: 'missing',
      label: exchangeReadinessLabels.missing,
      title: 'exchange missing',
      description: 'No configured exchange record was returned.',
      tone: exchangeReadinessTone.missing,
      enablement: enablementUnavailable(
        'unavailable',
        'enablement unavailable',
        'Exchange enablement is unavailable because no exchange record was returned.',
      ),
    };
  }

  if (!hasIdentity(exchange) || typeof exchange.enable !== 'boolean') {
    return {
      status: 'unknown',
      label: exchangeReadinessLabels.unknown,
      title: 'exchange readiness unknown',
      description: 'The exchange record is present, but its enabled state could not be classified.',
      tone: exchangeReadinessTone.unknown,
      enablement: enablementUnavailable(
        'unknown',
        'enablement unknown',
        'Exchange enablement is unknown; refresh or reconfigure this exchange before changing it.',
      ),
    };
  }

  if (exchange.enable) {
    return {
      status: 'ready',
      label: exchangeReadinessLabels.ready,
      title: 'configured and enabled',
      description: 'This exchange is configured and enabled for operations.',
      tone: exchangeReadinessTone.ready,
      enablement: {
        label: 'enabled',
        title: 'enabled exchange; click to disable',
        actionLabel: 'disable',
        actionTitle: 'enabled exchange; click to disable',
        canToggle: true,
        nextEnable: false,
        tone: 'btn-success text-base-100',
      },
    };
  }

  return {
    status: 'disabled',
    label: exchangeReadinessLabels.disabled,
    title: 'configured but disabled',
    description: 'This exchange is configured, but it is disabled and not usable for trading.',
    tone: exchangeReadinessTone.disabled,
    enablement: {
      label: 'disabled',
      title: 'disabled exchange; click to enable',
      actionLabel: 'enable',
      actionTitle: 'disabled exchange; click to enable',
      canToggle: true,
      nextEnable: true,
      tone: 'btn-ghost text-base-content',
    },
  };
};

export const summarizeExchangeReadiness = (exchanges: ExchangeReadinessSource[] | null | undefined) => {
  const views = (exchanges ?? []).map(getExchangeReadiness);
  return {
    total: views.length,
    ready: views.filter((view) => view.status === 'ready').length,
    disabled: views.filter((view) => view.status === 'disabled').length,
    missing: views.length === 0 ? 1 : 0,
    unknown: views.filter((view) => view.status === 'unknown').length,
  };
};
