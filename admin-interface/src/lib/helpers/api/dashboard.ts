import { apiFetch } from './client';

export const DASHBOARD_RANGES = ['24h', '7d', '30d'] as const;

export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

export interface AdminDashboardSummary {
  generatedAt: string;
  range: {
    key: DashboardRange;
    startedAt: string;
    endedAt: string;
  };
  kpis: {
    activeStrategies: number;
    totalStrategies: number;
    pendingIntents: number;
    openOrders: number;
    trackedOrders: number;
    totalCapital: string;
    reconciliationViolations: number;
    runtimeHealth: string;
  };
  strategies: {
    total: number;
    definitions: number;
    counts: Record<string, number>;
    recent: Array<{
      strategyKey: string;
      strategyType: string | null;
      status: string;
      strategyDefinitionId: string | null;
      definitionName: string | null;
      marketMakingOrderId: string | null;
      createdAt: string | null;
      updatedAt: string | null;
    }>;
    updatedSince: string;
    truncated: boolean;
  };
  intents: {
    total: number;
    counts: Record<string, number>;
    recent: Array<{
      intentId: string;
      strategyKey: string;
      type: string;
      status: string;
      exchange: string;
      accountLabel: string | null;
      pair: string;
      side: string | null;
      createdAt: string | null;
      updatedAt: string | null;
    }>;
    truncated: boolean;
  };
  orderFlow: {
    total: number;
    counts: Record<string, number>;
    recent: Array<{
      orderId: string;
      strategyKey: string;
      exchange: string;
      accountLabel: string | null;
      pair: string;
      side: string;
      qty: string;
      filledQty: string;
      price: string;
      status: string;
      createdAt: string | null;
      updatedAt: string | null;
    }>;
    truncated: boolean;
    updatedSince: string;
    volume: {
      tradeCount: number;
      notionalVolume: string;
      scannedRows: number;
      truncated: boolean;
    };
  };
  capital: {
    total: string;
    byAsset: Array<{
      asset: string;
      available: string;
      locked: string;
      total: string;
    }>;
    scannedRows: number;
    totalRows: number;
    truncated: boolean;
  };
  exchanges: {
    total: number;
    byValidationStatus: Record<string, number>;
    accounts: Array<{
      keyId: string;
      exchange: string;
      name: string;
      permissions: string[];
      validationStatus: string;
      validatedAt: string | null;
      createdAt: string | null;
    }>;
    scannedRows: number;
    truncated: boolean;
  };
  health: {
    status: string;
    timestamp: string;
    queue: unknown;
    metrics: unknown;
    issues: unknown[];
  };
  reconciliation: {
    totalViolations: number;
    reports: Array<Record<string, unknown>>;
  };
  runtime: {
    stats: Array<Record<string, unknown>>;
    recent: Array<Record<string, unknown>>;
    truncated: boolean;
  };
  limits: {
    recentItems: number;
    capitalScanRows: number;
    apiKeyScanRows: number;
  };
}

export const fetchDashboardSummary = (range: DashboardRange) =>
  apiFetch<AdminDashboardSummary>('/admin/dashboard/summary', {
    query: { range },
  });
