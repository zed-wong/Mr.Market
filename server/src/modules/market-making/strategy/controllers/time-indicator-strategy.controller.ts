import { Injectable, Optional } from '@nestjs/common';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { ExchangeInitService } from 'src/modules/infrastructure/exchange-init/exchange-init.service';
import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { OrderScopedBalanceQueryService } from '../../balance-state/order-scoped-balance-query.service';
import { ExecutorAction } from '../config/executor-action.types';
import type {
  StrategyController,
  StrategyControllerFacade,
  StrategyRuntimeSession,
  StrategyTickContext,
} from '../config/strategy-controller.types';
import { TimeIndicatorStrategyDto } from '../config/timeIndicator.dto';
import { StrategyIntentStoreService } from '../execution/strategy-intent-store.service';
import {
  calcCross,
  calcEma,
  calcRsi,
  safePct,
} from './indicators/technical-indicators';

@Injectable()
export class TimeIndicatorStrategyController implements StrategyController {
  readonly strategyType = 'timeIndicator' as const;
  private readonly logger = new CustomLogger(
    TimeIndicatorStrategyController.name,
  );

  constructor(
    private readonly exchangeInitService: ExchangeInitService,
    @Optional()
    private readonly orderScopedBalanceQueryService?: OrderScopedBalanceQueryService,
    @Optional()
    private readonly strategyIntentStoreService?: StrategyIntentStoreService,
  ) {}

  getCadenceMs(parameters: Record<string, unknown>): number {
    return Math.max(1000, Number(parameters?.tickIntervalMs || 60000));
  }

  async start(
    config: Record<string, unknown>,
    service: StrategyControllerFacade,
  ): Promise<void> {
    await service.executeTimeIndicatorStrategy(
      config as unknown as TimeIndicatorStrategyDto,
    );
  }

  async decideActions(ctx: StrategyTickContext): Promise<ExecutorAction[]> {
    return await this.buildTimeIndicatorActions(ctx.session, ctx.ts);
  }

  async rerun(
    strategyInstance: StrategyInstance,
    service: StrategyControllerFacade,
  ): Promise<void> {
    await service.executeTimeIndicatorStrategy(
      strategyInstance.parameters as TimeIndicatorStrategyDto,
    );
  }

  async buildTimeIndicatorActions(
    session: StrategyRuntimeSession,
    ts: string,
  ): Promise<ExecutorAction[]> {
    const params = session.params as unknown as TimeIndicatorStrategyDto;
    const { userId, clientId, exchangeName, symbol } = params;

    if (!this.isWithinTimeWindow(params)) {
      this.logger.debug(
        `[${exchangeName}:${symbol}] Outside time window — skipping.`,
      );

      return [];
    }

    const ex = this.exchangeInitService.getExchange(exchangeName);

    if (!ex) {
      this.logger.error(`Exchange '${exchangeName}' is not initialized.`);

      return [];
    }

    try {
      if (!ex.markets || Object.keys(ex.markets).length === 0) {
        await ex.loadMarkets();
      }
    } catch (e: unknown) {
      const { message } = this.toErrorDetails(e);

      this.logger.error(`[${exchangeName}] loadMarkets failed: ${message}`);

      return [];
    }

    if (!ex.markets[symbol]) {
      this.logger.error(`[${exchangeName}] Unknown symbol '${symbol}'.`);

      return [];
    }

    if (ex.timeframes && !ex.timeframes[params.timeframe]) {
      this.logger.error(
        `[${exchangeName}:${symbol}] Unsupported timeframe '${params.timeframe}'.`,
      );

      return [];
    }

    if (params.maxConcurrentPositions && params.maxConcurrentPositions > 0) {
      try {
        const openOrders = await ex.fetchOpenOrders(symbol);

        if (openOrders.length >= params.maxConcurrentPositions) {
          this.logger.warn(
            `[${exchangeName}:${symbol}] Open orders (${openOrders.length}) >= maxConcurrentPositions (${params.maxConcurrentPositions}). Skipping.`,
          );

          return [];
        }
      } catch (e: unknown) {
        const { message } = this.toErrorDetails(e);

        this.logger.warn(
          `[${exchangeName}:${symbol}] fetchOpenOrders failed (${message}). Proceeding anyway.`,
        );
      }
    }

    const ohlcv = await this.fetchCandles(
      ex,
      symbol,
      params.timeframe,
      params.lookback,
    );
    const minBarsNeeded = Math.max(params.emaSlow, params.rsiPeriod) + 2;

    if (!ohlcv || ohlcv.length < minBarsNeeded) {
      this.logger.warn(`[${exchangeName}:${symbol}] Not enough candles yet.`);

      return [];
    }

    const closes = ohlcv.map((c) => c[4]);
    const emaF = calcEma(closes, params.emaFast);
    const emaS = calcEma(closes, params.emaSlow);
    const rsiV = calcRsi(closes, params.rsiPeriod);

    const last = closes[closes.length - 1];
    const lastEmaF = emaF[emaF.length - 1];
    const lastEmaS = emaS[emaS.length - 1];
    const prevEmaF = emaF[emaF.length - 2];
    const prevEmaS = emaS[emaS.length - 2];
    const lastRsi = rsiV[rsiV.length - 1];

    if (
      [lastEmaF, lastEmaS, prevEmaF, prevEmaS, lastRsi].some(
        (x) => x === undefined || Number.isNaN(x),
      )
    ) {
      this.logger.debug(
        `[${exchangeName}:${symbol}] Indicators not ready (NaN).`,
      );

      return [];
    }

    const signal = calcCross(prevEmaF!, prevEmaS!, lastEmaF!, lastEmaS!);
    const rsiBuyOk =
      params.rsiBuyBelow === undefined || lastRsi! <= params.rsiBuyBelow!;
    const rsiSellOk =
      params.rsiSellAbove === undefined || lastRsi! >= params.rsiSellAbove!;
    const hasRsiThresholds =
      params.rsiBuyBelow !== undefined && params.rsiSellAbove !== undefined;

    let side: 'buy' | 'sell' | null = null;

    if (params.indicatorMode === 'ema') {
      if (signal === 'CROSS_UP') side = 'buy';
      else if (signal === 'CROSS_DOWN') side = 'sell';
    } else if (params.indicatorMode === 'rsi') {
      if (!hasRsiThresholds) {
        this.logger.warn(
          `[${exchangeName}:${symbol}] RSI mode requires both rsiBuyBelow and rsiSellAbove thresholds.`,
        );

        return [];
      }
      if (rsiBuyOk && !rsiSellOk) side = 'buy';
      else if (rsiSellOk && !rsiBuyOk) side = 'sell';
    } else if (params.indicatorMode === 'both') {
      if (signal === 'CROSS_UP' && rsiBuyOk) side = 'buy';
      else if (signal === 'CROSS_DOWN' && rsiSellOk) side = 'sell';
    }

    if (!side) {
      this.logger.debug(`[${exchangeName}:${symbol}] No trade signal.`);

      return [];
    }

    const parsedSymbol = this.parseBaseQuote(symbol);

    if (!parsedSymbol) {
      this.logger.error(
        `[${exchangeName}] Unable to parse symbol '${symbol}' into base/quote`,
      );

      return [];
    }
    const { base, quote } = parsedSymbol;

    const availableBalances = await this.getAvailableBalancesForPair(
      exchangeName,
      symbol,
    );

    if (!availableBalances) {
      this.logger.warn(
        `[${exchangeName}:${symbol}] Skipping time-indicator tick: balance cache unavailable or stale.`,
      );

      return [];
    }

    const freeBase = Number(availableBalances.base.toFixed());
    const freeQuote = Number(availableBalances.quote.toFixed());

    const amountBaseRaw =
      params.orderMode === 'base' ? params.orderSize : params.orderSize / last;

    if (side === 'sell' && freeBase < amountBaseRaw * 1.01) {
      this.logger.warn(
        `[${exchangeName}:${symbol}] Insufficient ${base} to sell.`,
      );

      return [];
    }
    if (side === 'buy' && freeQuote < amountBaseRaw * last * 1.01) {
      this.logger.warn(
        `[${exchangeName}:${symbol}] Insufficient ${quote} to buy.`,
      );

      return [];
    }

    const market = ex.markets[symbol];
    const amountPrec = (x: number) =>
      parseFloat(ex.amountToPrecision(symbol, x));
    const pricePrec = (x: number) => parseFloat(ex.priceToPrecision(symbol, x));

    let amountBase = amountPrec(amountBaseRaw);

    if (market?.limits?.amount?.min && amountBase < market.limits.amount.min) {
      amountBase = amountPrec(market.limits.amount.min);
    }
    if (
      market?.limits?.cost?.min &&
      amountBase * last < market.limits.cost.min
    ) {
      const needed = market.limits.cost.min / last;

      amountBase = amountPrec(Math.max(amountBase, needed));
    }

    const bps = params.slippageBps ?? 10;
    const entryPriceRaw =
      side === 'buy' ? last * (1 - bps / 10_000) : last * (1 + bps / 10_000);
    const entryPrice = pricePrec(entryPriceRaw);

    this.logger.log(
      `[${exchangeName}:${symbol}] ${side.toUpperCase()} ${amountBase} @ ${entryPrice} (EMA${
        params.emaFast
      }/${params.emaSlow}, RSI=${lastRsi!.toFixed(2)})`,
    );

    return [
      {
        type: 'CREATE_LIMIT_ORDER',
        intentId: `${session.strategyKey}:${ts}:indicator-entry`,
        runtimeInstanceKey: session.strategyKey,
        strategyKey: session.strategyKey,
        userId,
        clientId,
        exchange: ex.id,
        pair: symbol,
        side,
        price: String(entryPrice),
        qty: String(amountBase),
        executionCategory: 'clob_cex',
        metadata: {
          emaFast: lastEmaF,
          emaSlow: lastEmaS,
          rsi: lastRsi,
          signal,
          stopLossPct: safePct(params.stopLossPct),
          takeProfitPct: safePct(params.takeProfitPct),
        },
        createdAt: ts,
        status: 'NEW',
      },
    ];
  }

  private isWithinTimeWindow(params: TimeIndicatorStrategyDto): boolean {
    const now = new Date();
    const wd = now.getDay();
    const hr = now.getHours();

    if (params.allowedWeekdays?.length && !params.allowedWeekdays.includes(wd))
      return false;
    if (params.allowedHours?.length && !params.allowedHours.includes(hr))
      return false;

    return true;
  }

  private async fetchCandles(
    ex: any,
    symbol: string,
    timeframe: string,
    lookback: number,
  ): Promise<number[][]> {
    try {
      const limit = Math.max(lookback, 200);

      return await ex.fetchOHLCV(symbol, timeframe, undefined, limit);
    } catch (e: unknown) {
      const { message } = this.toErrorDetails(e);

      this.logger.error(
        `fetchOHLCV error on ${ex.id} ${symbol} ${timeframe}: ${message}`,
      );

      return [];
    }
  }

  private parseBaseQuote(
    symbol: string,
  ): { base: string; quote: string } | null {
    if (symbol.includes('/')) {
      const [base, quote] = symbol.split('/');

      if (base && quote) {
        return { base, quote };
      }

      return null;
    }

    const knownQuotes = [
      'USDT',
      'USDC',
      'BUSD',
      'USD',
      'BTC',
      'ETH',
      'BNB',
      'EUR',
    ];
    const upper = symbol.toUpperCase();

    for (const q of knownQuotes) {
      if (upper.endsWith(q) && upper.length > q.length) {
        return {
          base: symbol.slice(0, symbol.length - q.length),
          quote: symbol.slice(symbol.length - q.length),
        };
      }
    }

    return null;
  }

  private async getAvailableBalancesForPair(
    exchangeName: string,
    pair: string,
    accountLabel?: string,
    marketMakingOrderId?: string,
  ): Promise<{
    base: { toFixed(): string };
    quote: { toFixed(): string };
    assets: { base: string; quote: string };
  } | null> {
    return (
      (await this.orderScopedBalanceQueryService?.getAvailableBalancesForPair(
        exchangeName,
        pair,
        accountLabel,
        marketMakingOrderId,
      )) || null
    );
  }

  private toErrorDetails(error: unknown): { message: string; stack?: string } {
    if (error instanceof Error) {
      return { message: error.message, stack: error.stack };
    }

    return { message: String(error) };
  }
}
