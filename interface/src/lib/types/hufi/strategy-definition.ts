export type StrategyDefinitionVisibility = "public" | "admin";
export type StrategyDirectExecutionMode = "single_account" | "dual_account";
export type StrategyLaunchSurface = "strategy_settings" | "admin_direct_mm";

export type StrategyDefinitionCapabilities = {
  launchSurfaces: StrategyLaunchSurface[];
  directExecutionMode?: StrategyDirectExecutionMode | null;
};

export type StrategyDefinitionEntity = {
  id: string;
  key: string;
  name: string;
  description?: string;
  controllerType: string;
  configSchema: Record<string, unknown>;
  defaultConfig: Record<string, unknown>;
  capabilities?: StrategyDefinitionCapabilities;
  enabled: boolean;
  visibility: StrategyDefinitionVisibility;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type StrategyDefinitionView = StrategyDefinitionEntity & {
  directOrderCompatible?: boolean;
  directExecutionMode?: StrategyDirectExecutionMode | null;
  launchSurfaces?: StrategyLaunchSurface[];
};

export type StrategyDefinition = StrategyDefinitionView;

export type StrategyDefinitionPayload = {
  key: string;
  name: string;
  description?: string;
  controllerType: string;
  configSchema: Record<string, unknown>;
  defaultConfig: Record<string, unknown>;
  capabilities?: StrategyDefinitionCapabilities;
  visibility?: StrategyDefinitionVisibility;
  createdBy?: string;
};

export type StartStrategyInstancePayload = {
  strategyDefinitionId: string;
  userId: string;
  clientId: string;
  config?: Record<string, unknown>;
};

export type StopStrategyInstancePayload = {
  strategyDefinitionId: string;
  userId: string;
  clientId: string;
};

export type StrategyInstanceDefinitionSnapshot = {
  strategyDefinitionId: string;
  definitionKey: string;
  definitionName: string;
  controllerType: string;
  resolvedAt: string;
};

export type StrategyInstanceView = {
  id: number;
  strategyKey: string;
  strategyType: string;
  status: string;
  userId: string;
  clientId: string;
  strategyDefinitionId?: string;
  strategyDefinitionSnapshot?: StrategyInstanceDefinitionSnapshot;
  definitionKey?: string;
  definitionName?: string;
  controllerType?: string;
  createdAt: string;
  updatedAt: string;
};

export type ValidateStrategyInstanceResponse = {
  valid: true;
  strategyDefinitionId: string;
  definitionKey: string;
  controllerType: string;
  mergedConfig: Record<string, unknown>;
};

export type StartStopStrategyInstanceResponse = {
  message: string;
  strategyDefinitionId: string;
  controllerType: string;
};

export type RemoveStrategyDefinitionResponse = {
  message: string;
  strategyDefinitionId: string;
};
