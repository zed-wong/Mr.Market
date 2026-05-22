import { Injectable } from '@nestjs/common';
import BigNumber from 'bignumber.js';

type BuildQuotesInput = {
  midPrice: string;
  numberOfLayers: number;
  bidSpread: number;
  askSpread: number;
  orderAmount: string;
  amountChangePerLayer: number;
  amountChangeType: 'fixed' | 'percentage';
  inventorySkewFactor: number;
  inventoryTargetBaseRatio: number;
  currentBaseRatio: number;
  makerHeavyMode: boolean;
  makerHeavyBiasBps: number;
  volBasedSpread?: boolean;
  realizedVolatility?: number | null;
  spreadSigmaMultiplier?: number;
  maxAdaptiveSpread?: number;
  orderBookImbalance?: number | null;
  imbalanceSkewFactor?: number;
  inventorySeverePivot?: number;
  inventoryPauseSidePivot?: number;
  adaptiveSizeEnabled?: boolean;
  sizeVolScalingFactor?: number;
  sizeFloor?: number;
  maxLayersInVol?: number;
  buyToxicityScore?: number;
  sellToxicityScore?: number;
  toxicityWidenBps?: number;
  buyPaused?: boolean;
  sellPaused?: boolean;
  buyRecoveryWidenBps?: number;
  sellRecoveryWidenBps?: number;
  buyRecoverySizeRatio?: number;
  sellRecoverySizeRatio?: number;
};

type QuoteLevel = {
  layer: number;
  slotKey: string;
  side: 'buy' | 'sell';
  price: string;
  qty: string;
};

@Injectable()
export class QuoteExecutorManagerService {
  buildQuotes(input: BuildQuotesInput): QuoteLevel[] {
    const mid = new BigNumber(input.midPrice);
    const inventoryDelta = new BigNumber(input.currentBaseRatio).minus(
      input.inventoryTargetBaseRatio,
    );
    const skewAdjust = inventoryDelta.multipliedBy(input.inventorySkewFactor);
    const makerBias = new BigNumber(input.makerHeavyBiasBps || 0).dividedBy(
      10_000,
    );

    const quotes: QuoteLevel[] = [];
    let currentQty = new BigNumber(input.orderAmount);
    const layerCount = this.resolveLayerCount(input);

    for (let layer = 1; layer <= layerCount; layer++) {
      if (layer > 1) {
        if (input.amountChangeType === 'fixed') {
          currentQty = currentQty.plus(input.amountChangePerLayer);
        } else {
          currentQty = currentQty.plus(
            currentQty.multipliedBy(
              new BigNumber(input.amountChangePerLayer).dividedBy(100),
            ),
          );
        }
      }

      let bidSpread = this.applyVolatilitySpread(
        input.bidSpread,
        input,
      ).multipliedBy(layer);
      let askSpread = this.applyVolatilitySpread(
        input.askSpread,
        input,
      ).multipliedBy(layer);
      const buyToxicity = this.calculateToxicityAdjustment('buy', input);
      const sellToxicity = this.calculateToxicityAdjustment('sell', input);
      const buyRecovery = this.resolveSideRecovery('buy', input);
      const sellRecovery = this.resolveSideRecovery('sell', input);
      const inventoryPause = this.resolveInventorySidePause(input);

      if (input.makerHeavyMode) {
        bidSpread = bidSpread.plus(makerBias);
        askSpread = askSpread.plus(makerBias);
      }

      bidSpread = BigNumber.max(0, bidSpread.plus(skewAdjust));
      askSpread = BigNumber.max(0, askSpread.minus(skewAdjust));

      const imbalanceAdjust = this.calculateImbalanceAdjust(input);

      bidSpread = this.clampAdaptiveSpread(
        BigNumber.max(
          0,
          bidSpread
            .plus(imbalanceAdjust)
            .plus(buyToxicity)
            .plus(buyRecovery.spread),
        ),
        input.maxAdaptiveSpread,
      );
      askSpread = this.clampAdaptiveSpread(
        BigNumber.max(
          0,
          askSpread
            .minus(imbalanceAdjust)
            .plus(sellToxicity)
            .plus(sellRecovery.spread),
        ),
        input.maxAdaptiveSpread,
      );

      const buyPrice = mid.multipliedBy(new BigNumber(1).minus(bidSpread));
      const sellPrice = mid.multipliedBy(new BigNumber(1).plus(askSpread));

      const buyQty = this.applyToxicitySize(
        this.applyAdaptiveSize(currentQty, 'buy', input),
        'buy',
        input,
      ).multipliedBy(buyRecovery.sizeRatio);
      const sellQty = this.applyToxicitySize(
        this.applyAdaptiveSize(currentQty, 'sell', input),
        'sell',
        input,
      ).multipliedBy(sellRecovery.sizeRatio);

      if (!input.buyPaused && !inventoryPause.buy) {
        quotes.push({
          layer,
          slotKey: `layer-${layer}-buy`,
          side: 'buy',
          price: buyPrice.toFixed(),
          qty: buyQty.toFixed(),
        });
      }
      if (!input.sellPaused && !inventoryPause.sell) {
        quotes.push({
          layer,
          slotKey: `layer-${layer}-sell`,
          side: 'sell',
          price: sellPrice.toFixed(),
          qty: sellQty.toFixed(),
        });
      }
    }

    return quotes;
  }

  private applyVolatilitySpread(
    baseSpread: number,
    input: BuildQuotesInput,
  ): BigNumber {
    const spread = new BigNumber(baseSpread);

    if (!input.volBasedSpread) {
      return spread;
    }

    const sigma = new BigNumber(input.realizedVolatility || 0);
    const multiplier = new BigNumber(input.spreadSigmaMultiplier || 0);

    if (
      !sigma.isFinite() ||
      sigma.isLessThanOrEqualTo(0) ||
      !multiplier.isFinite() ||
      multiplier.isLessThanOrEqualTo(0)
    ) {
      return spread;
    }

    return spread.plus(sigma.multipliedBy(multiplier));
  }

  private resolveLayerCount(input: BuildQuotesInput): number {
    const configuredLayers = Math.max(
      1,
      Math.floor(Number(input.numberOfLayers || 1)),
    );
    const maxLayersInVol = Math.max(
      0,
      Math.floor(Number(input.maxLayersInVol || 0)),
    );
    const sigma = new BigNumber(input.realizedVolatility || 0);

    if (
      !input.adaptiveSizeEnabled ||
      maxLayersInVol <= 0 ||
      !sigma.isFinite() ||
      sigma.isLessThanOrEqualTo(0)
    ) {
      return configuredLayers;
    }

    return Math.max(1, Math.min(configuredLayers, maxLayersInVol));
  }

  private applyAdaptiveSize(
    qty: BigNumber,
    side: 'buy' | 'sell',
    input: BuildQuotesInput,
  ): BigNumber {
    if (!input.adaptiveSizeEnabled) {
      return qty;
    }

    const sizeFloor = this.resolveSizeFloor(input.sizeFloor);
    const volDiscount = this.calculateVolatilitySizeDiscount(input, sizeFloor);
    const inventoryDiscount = this.calculateInventorySizeDiscount(
      input,
      side,
      sizeFloor,
    );

    return qty.multipliedBy(volDiscount).multipliedBy(inventoryDiscount);
  }

  private calculateVolatilitySizeDiscount(
    input: BuildQuotesInput,
    sizeFloor: BigNumber,
  ): BigNumber {
    const sigma = new BigNumber(input.realizedVolatility || 0);
    const factor = new BigNumber(input.sizeVolScalingFactor || 0);

    if (
      !sigma.isFinite() ||
      sigma.isLessThanOrEqualTo(0) ||
      !factor.isFinite() ||
      factor.isLessThanOrEqualTo(0)
    ) {
      return new BigNumber(1);
    }

    return BigNumber.max(
      sizeFloor,
      new BigNumber(1).minus(sigma.multipliedBy(factor)),
    );
  }

  private calculateInventorySizeDiscount(
    input: BuildQuotesInput,
    side: 'buy' | 'sell',
    sizeFloor: BigNumber,
  ): BigNumber {
    const severePivot = new BigNumber(input.inventorySeverePivot || 0);

    if (!severePivot.isFinite() || severePivot.isLessThanOrEqualTo(0)) {
      return new BigNumber(1);
    }

    const inventoryDelta = new BigNumber(input.currentBaseRatio).minus(
      input.inventoryTargetBaseRatio,
    );

    if (!inventoryDelta.isFinite() || inventoryDelta.isZero()) {
      return new BigNumber(1);
    }

    const sideAddsToInventory =
      (side === 'buy' && inventoryDelta.isGreaterThan(0)) ||
      (side === 'sell' && inventoryDelta.isLessThan(0));

    if (!sideAddsToInventory) {
      return new BigNumber(1);
    }

    const pressure = BigNumber.min(
      1,
      inventoryDelta.abs().dividedBy(severePivot),
    );

    return BigNumber.max(sizeFloor, new BigNumber(1).minus(pressure));
  }

  private resolveInventorySidePause(input: BuildQuotesInput): {
    buy: boolean;
    sell: boolean;
  } {
    const pausePivot = new BigNumber(input.inventoryPauseSidePivot || 0);

    if (!pausePivot.isFinite() || pausePivot.isLessThanOrEqualTo(0)) {
      return { buy: false, sell: false };
    }

    const inventoryDelta = new BigNumber(input.currentBaseRatio).minus(
      input.inventoryTargetBaseRatio,
    );

    if (
      !inventoryDelta.isFinite() ||
      inventoryDelta.abs().isLessThan(pausePivot)
    ) {
      return { buy: false, sell: false };
    }

    return {
      buy: inventoryDelta.isGreaterThan(0),
      sell: inventoryDelta.isLessThan(0),
    };
  }

  private resolveSizeFloor(value: number | undefined): BigNumber {
    const floor = new BigNumber(value || 0);

    if (!floor.isFinite() || floor.isLessThan(0)) {
      return new BigNumber(0);
    }

    return BigNumber.min(1, floor);
  }

  private clampAdaptiveSpread(
    spread: BigNumber,
    maxAdaptiveSpread: number | undefined,
  ): BigNumber {
    const maxSpread = new BigNumber(maxAdaptiveSpread || 0);

    if (!maxSpread.isFinite() || maxSpread.isLessThanOrEqualTo(0)) {
      return spread;
    }

    return BigNumber.min(spread, maxSpread);
  }

  private calculateImbalanceAdjust(input: BuildQuotesInput): BigNumber {
    const imbalance = new BigNumber(input.orderBookImbalance || 0);
    const factor = new BigNumber(input.imbalanceSkewFactor || 0);

    if (
      !imbalance.isFinite() ||
      imbalance.isZero() ||
      !factor.isFinite() ||
      factor.isLessThanOrEqualTo(0)
    ) {
      return new BigNumber(0);
    }

    const inventoryWeight = this.calculateInventoryWeight(input);

    if (inventoryWeight.isLessThanOrEqualTo(0)) {
      return new BigNumber(0);
    }

    return imbalance.multipliedBy(factor).multipliedBy(inventoryWeight);
  }

  private calculateToxicityAdjustment(
    side: 'buy' | 'sell',
    input: BuildQuotesInput,
  ): BigNumber {
    const score = new BigNumber(
      side === 'buy'
        ? input.buyToxicityScore || 0
        : input.sellToxicityScore || 0,
    );
    const widen = new BigNumber(input.toxicityWidenBps || 0).dividedBy(10_000);

    if (
      !score.isFinite() ||
      score.isLessThanOrEqualTo(0) ||
      !widen.isFinite() ||
      widen.isLessThanOrEqualTo(0)
    ) {
      return new BigNumber(0);
    }

    return score.multipliedBy(widen);
  }

  private applyToxicitySize(
    qty: BigNumber,
    side: 'buy' | 'sell',
    input: BuildQuotesInput,
  ): BigNumber {
    const score = new BigNumber(
      side === 'buy'
        ? input.buyToxicityScore || 0
        : input.sellToxicityScore || 0,
    );

    if (!score.isFinite() || score.isLessThanOrEqualTo(0)) {
      return qty;
    }

    return qty.dividedBy(new BigNumber(1).plus(score));
  }

  private resolveSideRecovery(
    side: 'buy' | 'sell',
    input: BuildQuotesInput,
  ): { spread: BigNumber; sizeRatio: BigNumber } {
    const widenBps = new BigNumber(
      side === 'buy'
        ? input.buyRecoveryWidenBps || 0
        : input.sellRecoveryWidenBps || 0,
    );
    const rawSizeRatio =
      side === 'buy'
        ? input.buyRecoverySizeRatio ?? 1
        : input.sellRecoverySizeRatio ?? 1;
    const sizeRatio = new BigNumber(rawSizeRatio);

    return {
      spread:
        widenBps.isFinite() && widenBps.isGreaterThan(0)
          ? widenBps.dividedBy(10_000)
          : new BigNumber(0),
      sizeRatio:
        sizeRatio.isFinite() && sizeRatio.isGreaterThan(0)
          ? BigNumber.min(1, sizeRatio)
          : new BigNumber(1),
    };
  }

  private calculateInventoryWeight(input: BuildQuotesInput): BigNumber {
    const severePivot = new BigNumber(input.inventorySeverePivot || 0);

    if (!severePivot.isFinite() || severePivot.isLessThanOrEqualTo(0)) {
      return new BigNumber(1);
    }

    const inventoryDelta = new BigNumber(input.currentBaseRatio)
      .minus(input.inventoryTargetBaseRatio)
      .abs();

    if (!inventoryDelta.isFinite()) {
      return new BigNumber(0);
    }

    return BigNumber.max(
      0,
      new BigNumber(1).minus(inventoryDelta.dividedBy(severePivot)),
    );
  }
}
