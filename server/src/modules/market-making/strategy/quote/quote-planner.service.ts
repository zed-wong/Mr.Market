import { Injectable, Optional } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';
import { ExchangeConnectorAdapterService } from 'src/modules/market-making/execution/exchange-connector-adapter.service';
import { ExecutorAction } from 'src/modules/market-making/strategy/config/executor-action.types';
import { PureMarketMakingStrategyDto } from 'src/modules/market-making/strategy/config/strategy.dto';

import { TrackedOrder } from '../../trackers/exchange-order-tracker.service';

type QuotePlanBalance = {
  base: BigNumber;
  quote: BigNumber;
  assets: { base: string; quote: string };
};

@Injectable()
export class QuotePlannerService {
  private readonly logger = new CustomLogger(QuotePlannerService.name);
  private readonly mmLog = this.logger.marketMaking();
  private readonly cancelBudgetUsageByStrategySecond = new Map<
    string,
    number
  >();
  private readonly slotCancelCooldownByStrategy = new Map<
    string,
    Map<string, number>
  >();

  constructor(
    @Optional()
    private readonly exchangeConnectorAdapterService?: ExchangeConnectorAdapterService,
  ) {}

  buildLegacyQuotes(
    params: PureMarketMakingStrategyDto,
    priceSource: BigNumber,
  ): Array<{
    layer: number;
    slotKey: string;
    side: 'buy' | 'sell';
    price: string;
    qty: string;
  }> {
    const quotes: Array<{
      layer: number;
      slotKey: string;
      side: 'buy' | 'sell';
      price: string;
      qty: string;
    }> = [];

    let currentOrderAmount = new BigNumber(params.orderAmount);

    for (let layer = 1; layer <= params.numberOfLayers; layer++) {
      if (layer > 1) {
        if (params.amountChangeType === 'fixed') {
          currentOrderAmount = currentOrderAmount.plus(
            params.amountChangePerLayer,
          );
        } else {
          currentOrderAmount = currentOrderAmount.plus(
            currentOrderAmount.multipliedBy(
              new BigNumber(params.amountChangePerLayer).dividedBy(100),
            ),
          );
        }
      }

      const layerBidSpread = new BigNumber(params.bidSpread).multipliedBy(
        layer,
      );
      const layerAskSpread = new BigNumber(params.askSpread).multipliedBy(
        layer,
      );
      const buyPrice = priceSource.multipliedBy(
        new BigNumber(1).minus(layerBidSpread),
      );
      const sellPrice = priceSource.multipliedBy(
        new BigNumber(1).plus(layerAskSpread),
      );

      quotes.push({
        layer,
        slotKey: `layer-${layer}-buy`,
        side: 'buy',
        price: buyPrice.toFixed(),
        qty: currentOrderAmount.toFixed(),
      });
      quotes.push({
        layer,
        slotKey: `layer-${layer}-sell`,
        side: 'sell',
        price: sellPrice.toFixed(),
        qty: currentOrderAmount.toFixed(),
      });
    }

    return quotes;
  }

  async resolveMinOrderNotional(
    exchangeName: string,
    pair: string,
    accountLabel: string | undefined,
    referencePrice: BigNumber,
  ): Promise<BigNumber> {
    if (!this.exchangeConnectorAdapterService) {
      return new BigNumber(0);
    }

    try {
      const rules = await this.exchangeConnectorAdapterService.loadTradingRules(
        exchangeName,
        pair,
        accountLabel,
      );
      const minByCost = new BigNumber(rules.costMin || 0);
      const minByAmount = new BigNumber(rules.amountMin || 0).multipliedBy(
        referencePrice,
      );

      return BigNumber.max(
        minByCost.isFinite() ? minByCost : 0,
        minByAmount.isFinite() ? minByAmount : 0,
      );
    } catch (error) {
      this.mmLog.warn(
        'quote blocked',
        {
          reason: 'trading_rules_unavailable',
          exchange: exchangeName,
          pair,
          account: accountLabel || 'default',
          error: error instanceof Error ? error.message : String(error),
        },
        {
          onceKey: `quote-min-notional:${exchangeName}:${pair}:${
            accountLabel || 'default'
          }`,
          windowMs: 60_000,
        },
      );

      return new BigNumber(0);
    }
  }

  isQuoteWithinTolerance(
    order: Pick<TrackedOrder, 'side' | 'price' | 'qty'>,
    action: Pick<ExecutorAction, 'side' | 'price' | 'qty'>,
    tolerance: BigNumber,
  ): boolean {
    if (order.side !== action.side) {
      return false;
    }

    if (tolerance.isLessThanOrEqualTo(0)) {
      return order.price === action.price && order.qty === action.qty;
    }

    const actionPrice = new BigNumber(action.price);
    const actionQty = new BigNumber(action.qty);

    if (
      !actionPrice.isFinite() ||
      actionPrice.isLessThanOrEqualTo(0) ||
      !actionQty.isFinite() ||
      actionQty.isLessThanOrEqualTo(0)
    ) {
      return false;
    }

    const priceWithinTolerance = new BigNumber(order.price)
      .minus(action.price)
      .abs()
      .dividedBy(actionPrice)
      .isLessThan(tolerance);
    const qtyWithinTolerance = new BigNumber(order.qty)
      .minus(action.qty)
      .abs()
      .dividedBy(actionQty)
      .isLessThan(tolerance);

    return priceWithinTolerance && qtyWithinTolerance;
  }

  buildCancelOrderAction(
    strategyKey: string,
    params: PureMarketMakingStrategyDto,
    order: Pick<
      TrackedOrder,
      'exchangeOrderId' | 'side' | 'price' | 'qty' | 'slotKey' | 'status'
    >,
    ts: string,
    reason: string,
  ): ExecutorAction | null {
    if (
      !order.exchangeOrderId ||
      order.status === 'pending_cancel' ||
      order.status === 'cancelled' ||
      order.status === 'filled'
    ) {
      return null;
    }

    return {
      type: 'CANCEL_ORDER',
      intentId: `${strategyKey}:${ts}:cancel-${reason}-${order.exchangeOrderId}`,
      runtimeInstanceKey: strategyKey,
      strategyKey,
      userId: params.userId,
      clientId: params.clientId,
      exchange: params.exchangeName,
      accountLabel: params.accountLabel,
      pair: params.pair,
      side: order.side,
      price: order.price,
      qty: order.qty,
      mixinOrderId: order.exchangeOrderId,
      slotKey: order.slotKey,
      createdAt: ts,
    };
  }

  appendCancelAction(
    actions: ExecutorAction[],
    cancelledExchangeOrderIds: Set<string>,
    action: ExecutorAction | null,
    strategyKey?: string,
    ts?: string,
    cancelBudgetPerSec?: number,
  ): void {
    if (
      !action?.mixinOrderId ||
      cancelledExchangeOrderIds.has(action.mixinOrderId)
    ) {
      return;
    }

    if (
      strategyKey &&
      ts &&
      Number.isFinite(cancelBudgetPerSec) &&
      Number(cancelBudgetPerSec) > 0 &&
      !this.consumeCancelBudget(strategyKey, ts, Number(cancelBudgetPerSec))
    ) {
      this.mmLog.debug('quote skipped', {
        reason: 'cancel_budget_exhausted',
        strategy: strategyKey,
        order: action.mixinOrderId,
      });

      return;
    }

    cancelledExchangeOrderIds.add(action.mixinOrderId);
    actions.push(action);

    if (strategyKey && action.slotKey) {
      this.recordSlotCancelTimestamp(strategyKey, action.slotKey);
    }
  }

  consumeCancelBudget(
    strategyKey: string,
    ts: string,
    cancelBudgetPerSec: number,
  ): boolean {
    const parsedTs = Date.parse(ts);
    const second = Math.floor(
      (Number.isFinite(parsedTs) ? parsedTs : Date.now()) / 1000,
    );
    const key = `${strategyKey}:${second}`;
    const used = this.cancelBudgetUsageByStrategySecond.get(key) || 0;

    if (used >= cancelBudgetPerSec) {
      return false;
    }

    this.cancelBudgetUsageByStrategySecond.set(key, used + 1);

    return true;
  }

  isSlotWithinCancelCooldown(
    strategyKey: string,
    slotKey: string,
    cooldownMs = 2000,
  ): boolean {
    const slotMap = this.slotCancelCooldownByStrategy.get(strategyKey);

    if (!slotMap) {
      return false;
    }

    const lastCancel = slotMap.get(slotKey);

    if (!lastCancel) {
      return false;
    }

    return Date.now() - lastCancel < cooldownMs;
  }

  clearStrategyState(strategyKey: string): void {
    this.slotCancelCooldownByStrategy.delete(strategyKey);
  }

  async quantizeAndValidateQuote(
    strategyKey: string,
    exchangeName: string,
    pair: string,
    accountLabel: string | undefined,
    side: 'buy' | 'sell',
    layer: number,
    slotKey: string,
    rawQty: BigNumber,
    rawPrice: BigNumber,
    availableBalances: QuotePlanBalance | null,
  ): Promise<{ price: BigNumber; qty: BigNumber } | null> {
    void layer;

    if (!this.exchangeConnectorAdapterService) {
      return { price: rawPrice, qty: rawQty };
    }

    if (!availableBalances) {
      this.mmLog.warn(
        'quote blocked',
        {
          reason: 'balance_unavailable',
          strategy: strategyKey,
          exchange: exchangeName,
          pair,
          account: accountLabel || 'default',
          side,
          slot: slotKey,
          required: rawQty.multipliedBy(rawPrice).toFixed(),
        },
        {
          onceKey: `quote-balance-unavailable:${strategyKey}:${slotKey}`,
          windowMs: 60_000,
        },
      );

      return null;
    }

    const { base, quote } = availableBalances;
    const rules = await this.exchangeConnectorAdapterService.loadTradingRules(
      exchangeName,
      pair,
      accountLabel,
    );
    const rawNotional = rawQty.multipliedBy(rawPrice);

    if (
      rawQty.isLessThanOrEqualTo(0) ||
      rawPrice.isLessThanOrEqualTo(0) ||
      (rules.amountMin && rawQty.isLessThan(rules.amountMin)) ||
      (rules.costMin && rawNotional.isLessThan(rules.costMin))
    ) {
      const rejectionReasons: string[] = [];

      if (rawQty.isLessThanOrEqualTo(0)) {
        rejectionReasons.push(`raw qty ${rawQty.toFixed()} <= 0`);
      }
      if (rawPrice.isLessThanOrEqualTo(0)) {
        rejectionReasons.push(`raw price ${rawPrice.toFixed()} <= 0`);
      }
      if (rules.amountMin && rawQty.isLessThan(rules.amountMin)) {
        rejectionReasons.push(
          `raw qty ${rawQty.toFixed()} ${
            availableBalances.assets.base
          } < amountMin ${new BigNumber(rules.amountMin).toFixed()} ${
            availableBalances.assets.base
          }`,
        );
      }
      if (rules.costMin && rawNotional.isLessThan(rules.costMin)) {
        rejectionReasons.push(
          `raw notional ${rawNotional.toFixed()} ${
            availableBalances.assets.quote
          } (${rawQty.toFixed()} ${
            availableBalances.assets.base
          } * ${rawPrice.toFixed()} ${availableBalances.assets.quote}/${
            availableBalances.assets.base
          }) < costMin ${new BigNumber(rules.costMin).toFixed()} ${
            availableBalances.assets.quote
          }`,
        );
      }
      this.mmLog.debug('quote filtered', {
        reason: 'min_order_rejected',
        strategy: strategyKey,
        exchange: exchangeName,
        pair,
        account: accountLabel || 'default',
        side,
        slot: slotKey,
        required: rawNotional.toFixed(),
        asset: availableBalances.assets.quote,
        details: rejectionReasons.join('; '),
      });

      return null;
    }

    let quantized: { price: string; qty: string };

    try {
      quantized = this.exchangeConnectorAdapterService.quantizeOrder(
        exchangeName,
        pair,
        rawQty.toFixed(),
        rawPrice.toFixed(),
        accountLabel,
      );
    } catch (error) {
      this.mmLog.debug('quote filtered', {
        reason: 'quantization_rejected',
        strategy: strategyKey,
        exchange: exchangeName,
        pair,
        account: accountLabel || 'default',
        side,
        slot: slotKey,
        required: rawQty.multipliedBy(rawPrice).toFixed(),
        error: error instanceof Error ? error.message : String(error),
      });

      return null;
    }

    const price = new BigNumber(quantized.price);
    const qty = new BigNumber(quantized.qty);

    if (
      qty.isLessThanOrEqualTo(0) ||
      price.isLessThanOrEqualTo(0) ||
      (rules.amountMin && qty.isLessThan(rules.amountMin)) ||
      (rules.costMin && qty.multipliedBy(price).isLessThan(rules.costMin))
    ) {
      const rejectionReasons: string[] = [];

      if (qty.isLessThanOrEqualTo(0)) {
        rejectionReasons.push(
          `quantized qty ${qty.toFixed()} <= 0 (rawQty=${rawQty.toFixed()})`,
        );
      }
      if (price.isLessThanOrEqualTo(0)) {
        rejectionReasons.push(
          `quantized price ${price.toFixed()} <= 0 (rawPrice=${rawPrice.toFixed()})`,
        );
      }
      if (rules.amountMin && qty.isLessThan(rules.amountMin)) {
        rejectionReasons.push(
          `qty ${qty.toFixed()} ${
            availableBalances.assets.base
          } < amountMin ${new BigNumber(rules.amountMin).toFixed()} ${
            availableBalances.assets.base
          }`,
        );
      }
      if (rules.costMin && qty.multipliedBy(price).isLessThan(rules.costMin)) {
        rejectionReasons.push(
          `notional ${qty.multipliedBy(price).toFixed()} ${
            availableBalances.assets.quote
          } (${qty.toFixed()} ${
            availableBalances.assets.base
          } * ${price.toFixed()} ${availableBalances.assets.quote}/${
            availableBalances.assets.base
          }) < costMin ${new BigNumber(rules.costMin).toFixed()} ${
            availableBalances.assets.quote
          }`,
        );
      }
      this.mmLog.debug('quote filtered', {
        reason: 'min_order_rejected',
        strategy: strategyKey,
        exchange: exchangeName,
        pair,
        account: accountLabel || 'default',
        side,
        slot: slotKey,
        required: qty.multipliedBy(price).toFixed(),
        asset: availableBalances.assets.quote,
        details: rejectionReasons.join('; '),
      });

      return null;
    }

    const notional = qty.multipliedBy(price);

    if (side === 'buy' && quote.isLessThan(notional)) {
      this.mmLog.warn(
        'quote blocked',
        {
          reason: 'insufficient_balance',
          strategy: strategyKey,
          exchange: exchangeName,
          pair,
          account: accountLabel || 'default',
          side,
          slot: slotKey,
          required: notional.toFixed(),
          available: quote.toFixed(),
          asset: availableBalances.assets.quote,
        },
        {
          onceKey: `quote-insufficient-balance:${strategyKey}:${slotKey}:buy`,
          windowMs: 60_000,
        },
      );

      return null;
    }
    if (side === 'sell' && base.isLessThan(qty)) {
      this.mmLog.warn(
        'quote blocked',
        {
          reason: 'insufficient_balance',
          strategy: strategyKey,
          exchange: exchangeName,
          pair,
          account: accountLabel || 'default',
          side,
          slot: slotKey,
          required: qty.toFixed(),
          available: base.toFixed(),
          asset: availableBalances.assets.base,
        },
        {
          onceKey: `quote-insufficient-balance:${strategyKey}:${slotKey}:sell`,
          windowMs: 60_000,
        },
      );

      return null;
    }

    if (side === 'buy') {
      availableBalances.quote = quote.minus(notional);
    } else {
      availableBalances.base = base.minus(qty);
    }

    return { price, qty };
  }

  buildStaleOrderActions(
    strategyKey: string,
    params: PureMarketMakingStrategyDto,
    ts: string,
    midPrice: BigNumber,
    openOrders: Array<{
      exchangeOrderId: string;
      slotKey?: string;
      side: 'buy' | 'sell';
      price: string;
      qty: string;
      createdAt: string;
      status: string;
    }>,
  ): ExecutorAction[] {
    const maxOrderAge = Number(params.maxOrderAge || 0);
    const hangingOrdersCancelPct = Number(params.hangingOrdersCancelPct || 0);

    return openOrders
      .filter((order) => {
        const ageMs = Date.now() - Date.parse(order.createdAt || ts);
        const driftPct = new BigNumber(order.price)
          .minus(midPrice)
          .abs()
          .dividedBy(midPrice);

        return (
          (Number.isFinite(maxOrderAge) &&
            maxOrderAge > 0 &&
            ageMs > maxOrderAge) ||
          (Number.isFinite(hangingOrdersCancelPct) &&
            hangingOrdersCancelPct > 0 &&
            driftPct.isGreaterThan(hangingOrdersCancelPct))
        );
      })
      .map((order, index) => ({
        type: 'CANCEL_ORDER' as const,
        intentId: `${strategyKey}:${ts}:stale-cancel-${index}`,
        runtimeInstanceKey: strategyKey,
        strategyKey,
        userId: params.userId,
        clientId: params.clientId,
        exchange: params.exchangeName,
        accountLabel: params.accountLabel,
        pair: params.pair,
        side: order.side,
        price: order.price,
        qty: order.qty,
        mixinOrderId: order.exchangeOrderId,
        slotKey: order.slotKey,
        createdAt: ts,
      }));
  }

  private recordSlotCancelTimestamp(
    strategyKey: string,
    slotKey: string,
  ): void {
    let slotMap = this.slotCancelCooldownByStrategy.get(strategyKey);

    if (!slotMap) {
      slotMap = new Map();
      this.slotCancelCooldownByStrategy.set(strategyKey, slotMap);
    }

    slotMap.set(slotKey, Date.now());
  }
}
