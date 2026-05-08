import {
  StrategyDefinition,
  type StrategyDefinitionCapabilities,
  type StrategyDirectExecutionMode,
  type StrategyLaunchSurface,
} from 'src/common/entities/market-making/strategy-definition.entity';

export type { StrategyDirectExecutionMode };

export type ResolvedStrategyDefinitionCapabilities = {
  directOrderCompatible: boolean;
  directExecutionMode: StrategyDirectExecutionMode | null;
  launchSurfaces: StrategyLaunchSurface[];
};

function readLaunchSurfaces(
  metadata: StrategyDefinitionCapabilities | undefined,
): StrategyLaunchSurface[] {
  if (!metadata || !Array.isArray(metadata.launchSurfaces)) {
    return [];
  }

  return metadata.launchSurfaces.filter(
    (surface): surface is StrategyLaunchSurface =>
      surface === 'strategy_settings' || surface === 'admin_direct_mm',
  );
}

function readDirectExecutionMode(
  metadata: StrategyDefinitionCapabilities | undefined,
): StrategyDirectExecutionMode | null {
  if (metadata?.directExecutionMode === 'single_account') {
    return 'single_account';
  }

  if (metadata?.directExecutionMode === 'dual_account') {
    return 'dual_account';
  }

  return null;
}

export function getStrategyDefinitionCapabilities(
  definition: Pick<StrategyDefinition, 'controllerType' | 'capabilities'>,
): ResolvedStrategyDefinitionCapabilities {
  const launchSurfaces = readLaunchSurfaces(definition.capabilities);
  const directExecutionMode = readDirectExecutionMode(definition.capabilities);
  const directOrderCompatible =
    launchSurfaces.includes('admin_direct_mm') && directExecutionMode !== null;

  return {
    directOrderCompatible,
    directExecutionMode: directOrderCompatible ? directExecutionMode : null,
    launchSurfaces,
  };
}

export function attachStrategyDefinitionCapabilities<
  T extends Pick<StrategyDefinition, 'controllerType' | 'capabilities'>,
>(definition: T): T & ResolvedStrategyDefinitionCapabilities {
  return {
    ...definition,
    ...getStrategyDefinitionCapabilities(definition),
  };
}
