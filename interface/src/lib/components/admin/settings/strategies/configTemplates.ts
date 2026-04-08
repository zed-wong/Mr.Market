// Schema templates per controllerType, derived from server DTOs.
//
// Fields injected at runtime by the execution engine are EXCLUDED:
//   - pair, exchangeName, accountLabel — set from the direct order form
//   - userId, clientId, marketMakingOrderId — set by the server
// See admin-direct-mm.service.ts directStart() for context.

export const CONFIG_SCHEMA_TEMPLATES: Record<string, object> = {
  pureMarketMaking: {
    type: "object",
    required: [
      "bidSpread",
      "askSpread",
      "orderAmount",
      "orderRefreshTime",
      "numberOfLayers",
      "priceSourceType",
      "amountChangePerLayer",
      "amountChangeType",
    ],
    properties: {
      oracleExchangeName: {
        type: "string",
        description: "Oracle exchange for price data (defaults to order exchange)",
      },
      bidSpread: {
        type: "number",
        description: "Bid spread as decimal fraction (e.g. 0.001 = 0.1%)",
      },
      askSpread: {
        type: "number",
        description: "Ask spread as decimal fraction (e.g. 0.001 = 0.1%)",
      },
      orderAmount: {
        type: "number",
        description: "Order amount per layer",
      },
      orderRefreshTime: {
        type: "number",
        description: "Refresh cadence (milliseconds)",
      },
      numberOfLayers: {
        type: "number",
        description: "Number of bid/ask layers on each side",
      },
      priceSourceType: {
        type: "string",
        enum: ["MID_PRICE", "BEST_BID", "BEST_ASK", "LAST_PRICE"],
        description: "Source for mid price",
      },
      amountChangePerLayer: {
        type: "number",
        description: "How much quantity grows per layer",
      },
      amountChangeType: {
        type: "string",
        enum: ["fixed", "percentage"],
        description: "Whether amount change is fixed or percentage-based",
      },
      ceilingPrice: {
        type: "number",
        description: "No buy orders above this price (optional)",
      },
      floorPrice: {
        type: "number",
        description: "No sell orders below this price (optional)",
      },
      hangingOrdersEnabled: {
        type: "boolean",
        description: "Allow unfilled orders to persist",
      },
      makerHeavyMode: {
        type: "boolean",
        description: "Enable maker-heavy quote-widening mode",
      },
      makerHeavyBiasBps: {
        type: "number",
        description: "Bias in basis points for widening",
      },
      inventoryTargetBaseRatio: {
        type: "number",
        description: "Target base inventory ratio (0–1)",
      },
      inventorySkewFactor: {
        type: "number",
        description: "Spread adjustment factor for inventory skew",
      },
    },
  },
  arbitrage: {
    type: "object",
    required: [
      "amountToTrade",
      "minProfitability",
      "exchangeAName",
      "exchangeBName",
    ],
    properties: {
      pair: {
        type: "string",
        description: "Trading pair (e.g. BTC/USDT)",
      },
      amountToTrade: {
        type: "number",
        description: "Fixed trade size per arb leg",
      },
      minProfitability: {
        type: "number",
        description: "Min profit threshold (decimal, e.g. 0.01 = 1%)",
      },
      exchangeAName: {
        type: "string",
        description: "First exchange name",
      },
      exchangeBName: {
        type: "string",
        description: "Second exchange name",
      },
      checkIntervalSeconds: {
        type: "number",
        description: "Scan interval (seconds)",
      },
      maxOpenOrders: {
        type: "number",
        description: "Max concurrent arbitrage orders",
      },
    },
  },
  volume: {
    type: "object",
    required: [
      "incrementPercentage",
      "intervalTime",
      "tradeAmount",
      "numTrades",
      "pricePushRate",
    ],
    properties: {
      pair: {
        type: "string",
        description: "Trading pair (e.g. BTC/USDT) — for CEX",
      },
      executionCategory: {
        type: "string",
        enum: ["clob_cex", "amm_dex"],
        description: "clob_cex for exchange, amm_dex for DEX",
      },
      exchangeName: {
        type: "string",
        description: "Exchange name (for CEX execution)",
      },
      symbol: {
        type: "string",
        description: "Trading pair symbol (for CEX)",
      },
      dexId: {
        type: "string",
        enum: ["uniswapV3", "pancakeV3"],
        description: "DEX adapter (for AMM DEX execution)",
      },
      chainId: {
        type: "number",
        description: "EVM chain ID (for DEX, e.g. 1 = Ethereum)",
      },
      tokenIn: {
        type: "string",
        description: "Input token address (for DEX)",
      },
      tokenOut: {
        type: "string",
        description: "Output token address (for DEX)",
      },
      feeTier: {
        type: "number",
        description: "V3 fee tier in ppm (500, 3000, 10000)",
      },
      slippageBps: {
        type: "number",
        description: "Slippage tolerance (basis points)",
      },
      incrementPercentage: {
        type: "number",
        description: "Offset from mid price (percent)",
      },
      intervalTime: {
        type: "number",
        description: "Seconds between trades",
      },
      tradeAmount: {
        type: "number",
        description: "Base amount per trade",
      },
      numTrades: {
        type: "number",
        description: "Total number of trades to execute",
      },
      pricePushRate: {
        type: "number",
        description: "Price shift upward per trade (percent)",
      },
      postOnlySide: {
        type: "string",
        enum: ["buy", "sell"],
        description: "Side for first trade",
      },
    },
  },
  timeIndicator: {
    type: "object",
    required: [
      "exchangeName",
      "symbol",
      "timeframe",
      "lookback",
      "emaFast",
      "emaSlow",
      "rsiPeriod",
      "rsiBuyBelow",
      "rsiSellAbove",
      "indicatorMode",
      "orderMode",
      "orderSize",
    ],
    properties: {
      exchangeName: {
        type: "string",
        description: "CCXT exchange name",
      },
      symbol: {
        type: "string",
        description: "Trading pair (e.g. BTC/USDT)",
      },
      timeframe: {
        type: "string",
        description: "Candle timeframe (e.g. 5m, 1h)",
      },
      lookback: {
        type: "number",
        description: "Candles to fetch per tick",
      },
      emaFast: {
        type: "number",
        description: "Fast EMA period",
      },
      emaSlow: {
        type: "number",
        description: "Slow EMA period",
      },
      rsiPeriod: {
        type: "number",
        description: "RSI calculation period",
      },
      rsiBuyBelow: {
        type: "number",
        description: "RSI buy threshold (0–100)",
      },
      rsiSellAbove: {
        type: "number",
        description: "RSI sell threshold (0–100)",
      },
      indicatorMode: {
        type: "string",
        enum: ["ema", "rsi", "both"],
        description: "Which indicator to use for signals",
      },
      allowedWeekdays: {
        type: "array",
        description: "Weekday filter (0=Sun to 6=Sat), e.g. [1,2,3,4,5]",
        items: { type: "number" },
      },
      allowedHours: {
        type: "array",
        description: "Hour filter (0–23), e.g. [9,10,11,12,13,14]",
        items: { type: "number" },
      },
      orderMode: {
        type: "string",
        enum: ["base", "quote"],
        description: "base = trade base amount, quote = quote amount",
      },
      orderSize: {
        type: "number",
        description: "Order size",
      },
      slippageBps: {
        type: "number",
        description: "Limit price slippage (basis points)",
      },
      maxConcurrentPositions: {
        type: "number",
        description: "Max open orders guard",
      },
      tickIntervalMs: {
        type: "number",
        description: "Tick interval (milliseconds)",
      },
      stopLossPct: {
        type: "number",
        description: "Stop-loss percent (optional)",
      },
      takeProfitPct: {
        type: "number",
        description: "Take-profit percent (optional)",
      },
    },
  },
};
