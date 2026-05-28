import { apiFetch } from './client';

export const HEALTH_STATUSES = ['healthy', 'warning', 'critical', 'unknown'] as const;
export const AUDIT_STATUSES = ['success', 'denied', 'error'] as const;

export type AdminHealthStatus = (typeof HEALTH_STATUSES)[number];
export type AdminAuditStatus = (typeof AUDIT_STATUSES)[number];

export interface AdminSystemHealthQuery {
  group?: string;
  service?: string;
}

export interface AdminSystemHealthService {
  id: string;
  group: string;
  name: string;
  status: AdminHealthStatus;
  message: string;
  observedAt: string;
  metrics?: Record<string, unknown>;
  details?: Record<string, unknown>;
  issues?: string[];
}

export interface AdminSystemHealthResponse {
  generatedAt: string;
  overallStatus: AdminHealthStatus;
  summary: Record<AdminHealthStatus | 'total', number>;
  groups: Array<{
    name: string;
    status: AdminHealthStatus;
    serviceCount: number;
    issues: string[];
  }>;
  services: AdminSystemHealthService[];
  filters: {
    group: string | null;
    service: string | null;
    availableGroups: string[];
    availableServices: Array<{
      id: string;
      group: string;
      name: string;
    }>;
  };
  limits: {
    maxServices: number;
    sourceTimeoutMs: number;
    maxConnectorAccounts: number;
    maxRuntimeRows: number;
    maxTrackedOrderSample: number;
  };
}

export interface AdminSystemAuditQuery {
  actor?: string;
  action?: string;
  resource?: string;
  status?: AdminAuditStatus | 'all';
  from?: string;
  to?: string;
  limit?: number;
  page?: number;
  exportAudit?: boolean;
  integrity?: boolean;
}

export interface AdminAuditLogEntry {
  id: string;
  actor: string;
  action: string;
  resource: string;
  status: AdminAuditStatus;
  timestamp: string;
  metadata: unknown;
  diff: unknown;
  requestContext: unknown;
  previousHash: string | null;
  contentHash: string;
}

export interface AdminSystemAuditResponse {
  generatedAt: string;
  entries: AdminAuditLogEntry[];
  filters: {
    actor: string | null;
    action: string | null;
    resource: string | null;
    status: AdminAuditStatus | null;
    from: string | null;
    to: string | null;
  };
  pagination: {
    page: number;
    limit: number;
    returned: number;
    total: number;
    hasMore: boolean;
  };
  limits: {
    defaultLimit: number;
    maxLimit: number;
    maxFilterLength: number;
    maxJsonBytes: number;
    maxStringLength: number;
    maxExportBytes: number;
  };
  export?: {
    format: 'application/x-ndjson';
    byteLength: number;
    content: string;
    truncated: boolean;
  };
  integrity?: {
    checked: number;
    valid: boolean;
    checks: Array<{
      id: string;
      timestamp: string;
      previousHash: string | null;
      contentHash: string;
      valid: boolean;
    }>;
  };
}

export type AdminConfigValue = string | number | boolean | null;

export interface AdminSystemConfigItem {
  key: string;
  label: string;
  category: string;
  description: string;
  value: AdminConfigValue;
  maskedValue: string | null;
  type: 'decimal' | 'boolean' | 'string';
  mutable: boolean;
  sensitive: boolean;
  validation: Record<string, string | number | boolean>;
  source: 'custom_config';
  sourceClass: 'database';
  sourceState: 'default' | 'override';
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface AdminSystemConfigResponse {
  generatedAt: string;
  schemaVersion: string;
  items: AdminSystemConfigItem[];
  sections: Array<{
    key: string;
    label: string;
    items: AdminSystemConfigItem[];
  }>;
  summary: {
    total: number;
    mutable: number;
    overrides: number;
  };
  limits: {
    maxPayloadKeys: number;
    maxKeyLength: number;
    maxStringLength: number;
  };
}

export interface AdminSystemConfigMutationResponse {
  generatedAt: string;
  item: AdminSystemConfigItem;
}

const cleanQuery = (query: Record<string, string | number | boolean | undefined | null>) =>
  Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );

export const fetchAdminSystemHealth = (query: AdminSystemHealthQuery = {}) =>
  apiFetch<AdminSystemHealthResponse>('/admin/system/health', {
    query: cleanQuery({
      group: query.group && query.group !== 'all' ? query.group : undefined,
      service: query.service && query.service !== 'all' ? query.service : undefined,
    }),
  });

export const fetchAdminSystemAudit = (query: AdminSystemAuditQuery = {}) =>
  apiFetch<AdminSystemAuditResponse>('/admin/system/audit', {
    query: cleanQuery({
      actor: query.actor?.trim(),
      action: query.action?.trim(),
      resource: query.resource?.trim(),
      status: query.status && query.status !== 'all' ? query.status : undefined,
      from: query.from?.trim(),
      to: query.to?.trim(),
      limit: query.limit,
      page: query.page,
      export: query.exportAudit,
      integrity: query.integrity,
    }),
  });

export const fetchAdminSystemConfig = () =>
  apiFetch<AdminSystemConfigResponse>('/admin/system/config');

export const updateAdminSystemConfig = (key: string, value: string | number | boolean) =>
  apiFetch<AdminSystemConfigMutationResponse>('/admin/system/config', {
    method: 'PATCH',
    json: { key, value },
  });

export const resetAdminSystemConfig = (key: string) =>
  apiFetch<AdminSystemConfigMutationResponse>('/admin/system/config/reset', {
    method: 'POST',
    json: { key },
  });
