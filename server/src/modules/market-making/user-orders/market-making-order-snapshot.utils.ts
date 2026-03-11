import BigNumber from 'bignumber.js';
import {
  MarketMakingOrder,
  type MarketMakingOrderStrategySnapshot,
} from 'src/common/entities/orders/user-orders.entity';
import { PriceSourceType } from 'src/common/enum/pricesourcetype';

function toConfigNumber(value?: string | number | null, fallback = 0): number {
  return new BigNumber(value ?? fallback).toNumber();
}

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

export function buildLegacyMarketMakingOrderRuntimeConfig(
  order: Pick<
    MarketMakingOrder,
    | 'pair'
    | 'exchangeName'
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
  >,
  definitionDefaultConfig: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    pair: order.pair.replaceAll('-ERC20', ''),
    exchangeName: order.exchangeName,
    bidSpread: toConfigNumber(order.bidSpread),
    askSpread: toConfigNumber(order.askSpread),
    orderAmount: toConfigNumber(order.orderAmount),
    orderRefreshTime: toConfigNumber(order.orderRefreshTime),
    numberOfLayers: toConfigNumber(order.numberOfLayers),
    priceSourceType:
      order.priceSourceType || definitionDefaultConfig.priceSourceType,
    amountChangePerLayer: toConfigNumber(order.amountChangePerLayer),
    amountChangeType:
      order.amountChangeType ||
      definitionDefaultConfig.amountChangeType ||
      'fixed',
    ceilingPrice: toConfigNumber(order.ceilingPrice),
    floorPrice: toConfigNumber(order.floorPrice),
  };
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
