export type StrategyDefinition = {
  id: string;
  key: string;
  name: string;
  description?: string;
  executorType: string;
  configSchema: Record<string, unknown>;
  defaultConfig: Record<string, unknown>;
  enabled: boolean;
  visibility: string;
  currentVersion: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type StrategyDefinitionPayload = {
  key: string;
  name: string;
  description?: string;
  executorType: string;
  configSchema: Record<string, unknown>;
  defaultConfig: Record<string, unknown>;
  visibility?: string;
  createdBy?: string;
};

export type PublishStrategyDefinitionVersionPayload = {
  name?: string;
  description?: string;
  executorType?: string;
  configSchema?: Record<string, unknown>;
  defaultConfig?: Record<string, unknown>;
  visibility?: string;
  version?: string;
};

export type StartStrategyInstancePayload = {
  definitionId: string;
  userId: string;
  clientId: string;
  config?: Record<string, unknown>;
};

export type StopStrategyInstancePayload = {
  definitionId: string;
  userId: string;
  clientId: string;
};

export type StrategyInstanceView = {
  id: number;
  strategyKey: string;
  strategyType: string;
  status: string;
  userId: string;
  clientId: string;
  definitionId?: string;
  definitionKey?: string;
  definitionName?: string;
  executorType?: string;
  createdAt: string;
  updatedAt: string;
};

export type ValidateStrategyInstanceResponse = {
  valid: true;
  definitionId: string;
  definitionKey: string;
  executorType: string;
  mergedConfig: Record<string, unknown>;
};

export type StartStopStrategyInstanceResponse = {
  message: string;
  definitionId: string;
  executorType: string;
};

export type StrategyDefinitionVersion = {
  id: string;
  definitionId: string;
  version: string;
  executorType: string;
  configSchema: Record<string, unknown>;
  defaultConfig: Record<string, unknown>;
  description?: string;
  createdAt: string;
};

export type BackfillDefinitionLinksResponse = {
  updated: number;
  skipped: number;
};
