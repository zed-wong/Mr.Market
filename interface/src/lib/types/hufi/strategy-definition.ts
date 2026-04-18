export type StrategyDefinitionVisibility = "public" | "admin";
export type StrategyDirectExecutionMode = "single_account" | "dual_account";

export type StrategyDefinition = {
  id: string;
  key: string;
  name: string;
  description?: string;
  controllerType: string;
  executorType?: string;
  configSchema: Record<string, unknown>;
  defaultConfig: Record<string, unknown>;
  enabled: boolean;
  visibility: StrategyDefinitionVisibility;
  directOrderCompatible?: boolean;
  directExecutionMode?: StrategyDirectExecutionMode | null;
  launchSurfaces?: string[];
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type StrategyDefinitionPayload = {
  key: string;
  name: string;
  description?: string;
  controllerType: string;
  executorType?: string;
  configSchema: Record<string, unknown>;
  defaultConfig: Record<string, unknown>;
  visibility?: StrategyDefinitionVisibility;
  createdBy?: string;
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
  controllerType?: string;
  executorType?: string;
  createdAt: string;
  updatedAt: string;
};

export type ValidateStrategyInstanceResponse = {
  valid: true;
  definitionId: string;
  definitionKey: string;
  controllerType: string;
  executorType?: string;
  mergedConfig: Record<string, unknown>;
};

export type StartStopStrategyInstanceResponse = {
  message: string;
  definitionId: string;
  controllerType: string;
  executorType?: string;
};

export type RemoveStrategyDefinitionResponse = {
  message: string;
  definitionId: string;
};
