const CONTROLLER_TYPE_ALIASES: Record<string, string> = {
  marketMaking: 'pureMarketMaking',
  market_making: 'pureMarketMaking',
  pure_market_making: 'pureMarketMaking',
  dual_account_volume: 'dualAccountVolume',
  'dual-account-volume': 'dualAccountVolume',
  time_indicator: 'timeIndicator',
};

export function normalizeControllerType(controllerType?: string): string {
  if (!controllerType) {
    return '';
  }

  return CONTROLLER_TYPE_ALIASES[controllerType] || controllerType;
}
