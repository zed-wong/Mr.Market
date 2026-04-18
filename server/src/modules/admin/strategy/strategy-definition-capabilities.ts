import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';

export type StrategyDirectExecutionMode = 'single_account' | 'dual_account';

export type StrategyDefinitionCapabilities = {
  directOrderCompatible: boolean;
  directExecutionMode: StrategyDirectExecutionMode | null;
  launchSurfaces: string[];
};

type StrategyDefinitionCapabilityMetadata = {
  launchSurfaces?: unknown;
  directExecutionMode?: unknown;
};

function readCapabilityMetadata(
  definition: Pick<StrategyDefinition, 'configSchema'>,
): StrategyDefinitionCapabilityMetadata {
  if (
    !definition.configSchema ||
    typeof definition.configSchema !== 'object' ||
    Array.isArray(definition.configSchema)
  ) {
    return {};
  }

  return definition.configSchema as StrategyDefinitionCapabilityMetadata;
}

function readLaunchSurfaces(
  metadata: StrategyDefinitionCapabilityMetadata,
): string[] {
  if (!Array.isArray(metadata.launchSurfaces)) {
    return [];
  }

  return metadata.launchSurfaces.filter(
    (surface): surface is string =>
      typeof surface === 'string' && surface.trim().length > 0,
  );
}

function readDirectExecutionMode(
  metadata: StrategyDefinitionCapabilityMetadata,
): StrategyDirectExecutionMode | null {
  if (metadata.directExecutionMode === 'single_account') {
    return 'single_account';
  }

  if (metadata.directExecutionMode === 'dual_account') {
    return 'dual_account';
  }

  return null;
}

export function getStrategyDefinitionCapabilities(
  definition: Pick<
    StrategyDefinition,
    'controllerType' | 'executorType' | 'configSchema'
  >,
): StrategyDefinitionCapabilities {
  const metadata = readCapabilityMetadata(definition);
  const launchSurfaces = readLaunchSurfaces(metadata);
  const directExecutionMode = readDirectExecutionMode(metadata);
  const directOrderCompatible =
    launchSurfaces.includes('admin_direct_mm') && directExecutionMode !== null;

  return {
    directOrderCompatible,
    directExecutionMode: directOrderCompatible ? directExecutionMode : null,
    launchSurfaces,
  };
}

export function attachStrategyDefinitionCapabilities<
  T extends Pick<
    StrategyDefinition,
    'controllerType' | 'executorType' | 'configSchema'
  >,
>(definition: T): T & StrategyDefinitionCapabilities {
  return {
    ...definition,
    ...getStrategyDefinitionCapabilities(definition),
  };
}
