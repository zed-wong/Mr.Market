import type { AdminSingleKey } from '$lib/types/hufi/admin';

export type ApiKeyReadinessStatus =
  | 'ready'
  | 'validation_pending'
  | 'validation_failed'
  | 'disabled'
  | 'unknown';

export type ApiKeyPermissionCapability = 'read' | 'trade' | 'unknown';

export interface ApiKeyReadinessView {
  status: ApiKeyReadinessStatus;
  label: string;
  title: string;
  description: string;
  tone: string;
}

export interface ApiKeyPermissionView {
  capability: ApiKeyPermissionCapability;
  label: string;
  description: string;
  tone: string;
}

export const apiKeyReadinessLabels: Record<ApiKeyReadinessStatus, string> = {
  ready: 'ready',
  validation_pending: 'validation pending',
  validation_failed: 'validation failed',
  disabled: 'disabled',
  unknown: 'unknown',
};

export const apiKeyReadinessTone: Record<ApiKeyReadinessStatus, string> = {
  ready: 'bg-success/10 text-success',
  validation_pending: 'bg-warning/10 text-warning',
  validation_failed: 'bg-error/10 text-error',
  disabled: 'bg-base-content/5 text-base-content/60',
  unknown: 'bg-base-content/5 text-base-content/60',
};

const disabledStates = new Set(['disabled', 'inactive', 'deleted', 'revoked']);
const failedStates = new Set(['error', 'failed']);
const readyStates = new Set(['alive', 'active', 'enabled']);
const pendingStates = new Set(['pending', 'validating', 'validation_pending']);
const readyValidationStates = new Set(['valid', 'validated', 'succeeded', 'success']);
const pendingValidationStates = new Set(['pending', 'validating', 'validation_pending']);
const failedValidationStates = new Set(['invalid', 'failed', 'error', 'validation_failed']);

const normalize = (value?: string | null) => String(value || '').trim().toLowerCase();

export const getApiKeyReadiness = (key?: Partial<AdminSingleKey> | null): ApiKeyReadinessView => {
  if (!key) {
    return {
      status: 'unknown',
      label: apiKeyReadinessLabels.unknown,
      title: 'API key readiness unknown',
      description: 'No API key record was returned.',
      tone: apiKeyReadinessTone.unknown,
    };
  }

  const state = normalize(key.state);
  const validation = normalize(key.validation_status);
  const validationError = normalize(key.validation_error);

  if (disabledStates.has(state)) {
    return {
      status: 'disabled',
      label: apiKeyReadinessLabels.disabled,
      title: 'API key disabled',
      description: 'This key is configured but disabled or unavailable for operations.',
      tone: apiKeyReadinessTone.disabled,
    };
  }

  if (pendingStates.has(state) || pendingValidationStates.has(validation) || validationError === 'validation timeout') {
    return {
      status: 'validation_pending',
      label: apiKeyReadinessLabels.validation_pending,
      title: 'validation pending',
      description: 'Validation is still pending, so the key is not ready for trading yet.',
      tone: apiKeyReadinessTone.validation_pending,
    };
  }

  if (failedStates.has(state) || failedValidationStates.has(validation) || Boolean(validationError)) {
    return {
      status: 'validation_failed',
      label: apiKeyReadinessLabels.validation_failed,
      title: 'validation failed',
      description: key.validation_error || 'Validation failed. Review the key, secret, exchange, and permissions before using it.',
      tone: apiKeyReadinessTone.validation_failed,
    };
  }

  if (readyStates.has(state) || readyValidationStates.has(validation)) {
    return {
      status: 'ready',
      label: apiKeyReadinessLabels.ready,
      title: 'ready and validated',
      description: 'This key is validated and its state allows use.',
      tone: apiKeyReadinessTone.ready,
    };
  }

  return {
    status: 'unknown',
    label: apiKeyReadinessLabels.unknown,
    title: 'API key readiness unknown',
    description: 'The key is present, but its validation and enabled state could not be classified.',
    tone: apiKeyReadinessTone.unknown,
  };
};

export const getApiKeyPermissionViews = (key: Partial<AdminSingleKey>): ApiKeyPermissionView[] => {
  const permissions = normalize(key.permissions);

  if (permissions === 'read-trade' || permissions === 'read_trade' || permissions === 'trade') {
    return [
      {
        capability: 'read',
        label: 'read access',
        description: 'Can read exchange account data.',
        tone: 'bg-base-content/5 text-base-content/60',
      },
      {
        capability: 'trade',
        label: 'trade enabled',
        description: 'Can place and manage exchange orders.',
        tone: 'bg-info/10 text-info',
      },
    ];
  }

  if (permissions === 'read' || permissions === 'read-only' || permissions === 'readonly') {
    return [
      {
        capability: 'read',
        label: 'read only',
        description: 'Can read exchange account data but cannot trade.',
        tone: 'bg-base-content/5 text-base-content/60',
      },
    ];
  }

  return [
    {
      capability: 'unknown',
      label: 'permission unknown',
      description: 'The returned key permissions could not be classified.',
      tone: 'bg-base-content/5 text-base-content/60',
    },
  ];
};

export const summarizeApiKeyReadiness = (keys: Partial<AdminSingleKey>[] | null | undefined) => {
  const views = (keys ?? []).map(getApiKeyReadiness);
  return {
    total: views.length,
    ready: views.filter((view) => view.status === 'ready').length,
    validation_pending: views.filter((view) => view.status === 'validation_pending').length,
    validation_failed: views.filter((view) => view.status === 'validation_failed').length,
    disabled: views.filter((view) => view.status === 'disabled').length,
    unknown: views.filter((view) => view.status === 'unknown').length,
  };
};
