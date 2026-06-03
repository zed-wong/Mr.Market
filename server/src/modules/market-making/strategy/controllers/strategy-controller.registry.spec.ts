import { ArbitrageStrategyController } from './arbitrage-strategy.controller';
import { DualAccountBestCapacityVolumeStrategyController } from './dual-account-best-capacity-volume-strategy.controller';
import { DualAccountVolumeStrategyController } from './dual-account-volume-strategy.controller';
import { EfficientDualAccountVolumeStrategyController } from './efficient-dual-account-volume-strategy.controller';
import { PureMarketMakingStrategyController } from './pure-market-making-strategy.controller';
import { StrategyControllerRegistry } from './strategy-controller.registry';
import { VolumeStrategyController } from './volume-strategy.controller';

describe('StrategyControllerRegistry', () => {
  it('registers controllers by type and lists them in insertion order', () => {
    const pure = new PureMarketMakingStrategyController();
    const arbitrage = new ArbitrageStrategyController();
    const bestCapacity = new DualAccountBestCapacityVolumeStrategyController();
    const dualAccount = new DualAccountVolumeStrategyController();
    const efficient = new EfficientDualAccountVolumeStrategyController();
    const volume = new VolumeStrategyController();

    const registry = new StrategyControllerRegistry([
      pure,
      arbitrage,
      efficient,
      bestCapacity,
      dualAccount,
      volume,
    ]);

    expect(registry.getController('pureMarketMaking')).toBe(pure);
    expect(registry.getController('arbitrage')).toBe(arbitrage);
    expect(registry.getController('dualAccountBestCapacityVolume')).toBe(
      bestCapacity,
    );
    expect(registry.getController('efficientDualAccountVolume')).toBe(
      efficient,
    );
    expect(registry.getController('dualAccountVolume')).toBe(dualAccount);
    expect(registry.getController('volume')).toBe(volume);
    expect(registry.getController('missing')).toBeUndefined();
    expect(registry.listControllerTypes()).toEqual([
      'pureMarketMaking',
      'arbitrage',
      'efficientDualAccountVolume',
      'dualAccountBestCapacityVolume',
      'dualAccountVolume',
      'volume',
    ]);
  });

  it('rejects duplicate controller registrations', () => {
    expect(
      () =>
        new StrategyControllerRegistry([
          new PureMarketMakingStrategyController(),
          new PureMarketMakingStrategyController(),
        ]),
    ).toThrow(
      'Duplicate strategy controller registered for type "pureMarketMaking"',
    );
  });
});
