import {
  MarketMakingOrder,
  type MarketMakingOrderStrategySnapshot,
} from 'src/common/entities/orders/user-orders.entity';
import { PriceSourceType } from 'src/common/enum/pricesourcetype';

function toStoredString(value: unknown, fallback: string): string {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return String(value);
}

function toStoredPriceSourceType(value: unknown): PriceSourceType {
  return Object.values(PriceSourceType).includes(value as PriceSourceType)
    ? (value as PriceSourceType)
    : PriceSourceType.MID_PRICE;
}

function toStoredAmountChangeType(value: unknown): 'fixed' | 'percentage' {
  return value === 'percentage' ? 'percentage' : 'fixed';
}

export function mapStrategySnapshotToMarketMakingOrderFields(
  strategySnapshot: MarketMakingOrderStrategySnapshot,
): Pick<
  MarketMakingOrder,
  | 'bidSpread'
  | 'askSpread'
  | 'orderAmount'
  | 'orderRefreshTime'
  | 'numberOfLayers'
  | 'priceSourceType'
  | 'amountChangePerLayer'
  | 'amountChangeType'
  | 'ceilingPrice'
  | 'floorPrice'
> {
  const resolvedConfig = strategySnapshot.resolvedConfig || {};

  return {
    bidSpread: toStoredString(resolvedConfig.bidSpread, '0.001'),
    askSpread: toStoredString(resolvedConfig.askSpread, '0.001'),
    orderAmount: toStoredString(resolvedConfig.orderAmount, '0'),
    orderRefreshTime: toStoredString(resolvedConfig.orderRefreshTime, '10000'),
    numberOfLayers: toStoredString(resolvedConfig.numberOfLayers, '1'),
    priceSourceType: toStoredPriceSourceType(resolvedConfig.priceSourceType),
    amountChangePerLayer: toStoredString(
      resolvedConfig.amountChangePerLayer,
      '0',
    ),
    amountChangeType: toStoredAmountChangeType(resolvedConfig.amountChangeType),
    ceilingPrice: toStoredString(resolvedConfig.ceilingPrice, '0'),
    floorPrice: toStoredString(resolvedConfig.floorPrice, '0'),
  };
}
