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

    for (let layer = 1; layer <= input.numberOfLayers; layer++) {
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

      let bidSpread = new BigNumber(input.bidSpread).multipliedBy(layer);
      let askSpread = new BigNumber(input.askSpread).multipliedBy(layer);

      if (input.makerHeavyMode) {
        bidSpread = bidSpread.plus(makerBias);
        askSpread = askSpread.plus(makerBias);
      }

      bidSpread = BigNumber.max(0, bidSpread.plus(skewAdjust));
      askSpread = BigNumber.max(0, askSpread.minus(skewAdjust));

      const buyPrice = mid.multipliedBy(new BigNumber(1).minus(bidSpread));
      const sellPrice = mid.multipliedBy(new BigNumber(1).plus(askSpread));

      quotes.push({
        layer,
        slotKey: `layer-${layer}-buy`,
        side: 'buy',
        price: buyPrice.toFixed(),
        qty: currentQty.toFixed(),
      });
      quotes.push({
        layer,
        slotKey: `layer-${layer}-sell`,
        side: 'sell',
        price: sellPrice.toFixed(),
        qty: currentQty.toFixed(),
      });
    }

    return quotes;
  }
}
