// Schema templates per controllerType, mirrored from server seed definitions.

export const CONFIG_SCHEMA_TEMPLATES: Record<string, object> = {
  pureMarketMaking: {
    type: "object",
    required: [
      "userId",
      "clientId",
      "pair",
      "exchangeName",
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
      userId: {
        type: "string",
        description: "User ID",
      },
      clientId: {
        type: "string",
        description: "Client ID",
      },
      marketMakingOrderId: {
        type: "string",
        description: "Bound market-making order ID",
      },
      pair: {
        type: "string",
        description: "Trading pair (e.g. BTC/USDT)",
      },
      exchangeName: {
        type: "string",
        description: "Exchange name",
      },
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
      currentBaseRatio: {
        type: "number",
        description: "Current base inventory ratio",
      },
    },
    additionalProperties: false,
  },
  arbitrage: {
    type: "object",
    required: [
      "userId",
      "clientId",
      "pair",
      "amountToTrade",
      "minProfitability",
      "exchangeAName",
      "exchangeBName",
    ],
    properties: {
      userId: {
        type: "string",
        description: "User ID",
      },
      clientId: {
        type: "string",
        description: "Client ID",
      },
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
    additionalProperties: false,
  },
  volume: {
    type: "object",
    required: [
      "userId",
      "clientId",
      "incrementPercentage",
      "intervalTime",
      "tradeAmount",
      "numTrades",
    ],
    properties: {
      userId: {
        type: "string",
        description: "User ID",
      },
      clientId: {
        type: "string",
        description: "Client ID",
      },
      executionCategory: {
        type: "string",
        enum: ["clob_cex", "amm_dex"],
        description: "clob_cex for exchange, amm_dex for DEX",
      },
      executionVenue: {
        type: "string",
        enum: ["cex", "dex"],
        description: "Legacy execution venue alias",
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
      recipient: {
        type: "string",
        description: "Recipient address for DEX execution",
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
    additionalProperties: false,
  },
  efficientDualAccountVolume: {
    type: "object",
    required: ["symbol", "maxOrderAmount"],
    properties: {
      symbol: {
        type: "string",
        description: "Trading pair symbol (e.g. BTC/USDT)",
      },
      maxOrderAmount: {
        type: "number",
        description:
          "Maximum base amount to trade per cycle; live balance/capacity can reduce the executed amount",
        minimum: 0,
      },
      mode: {
        type: "string",
        enum: ["cheapest_capital", "balanced", "fastest_volume"],
        description: "Capital/volume tradeoff mode. Defaults to balanced.",
      },
      interval: {
        type: "number",
        description: "Optional seconds between execution cycles",
        minimum: 1,
      },
      dailyVolumeTarget: {
        type: "number",
        description: "Optional quote-volume cap for the session",
        minimum: 0,
      },
      tradeAmountVariance: {
        type: "number",
        description: "Fractional variance applied to selected cycle quantity",
        minimum: 0,
      },
      priceOffsetVariance: {
        type: "number",
        description: "Fractional variance applied to maker price offset",
        minimum: 0,
      },
      cycleMode: {
        type: "string",
        enum: ["alternating", "static"],
        description: "Cycle role mode. Unified direct orders default to alternating.",
      },
      dynamicRoleSwitching: {
        type: "boolean",
        description:
          "Switch maker/taker roles dynamically based on balances. Unified direct orders default to true.",
      },
      strategyContract: {
        type: "string",
        enum: ["efficientDualAccountVolume"],
        description: "Unified Efficient Dual Account Volume backend contract marker",
      },
      safetyBuffer: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["default_formula"] },
          exchangeCostMinMultiplier: { type: "number", minimum: 0 },
          feeCostMultiplier: { type: "number", minimum: 0 },
        },
        additionalProperties: false,
      },
      makerAccountLabel: {
        type: "string",
        description: "Maker account label injected by admin direct start",
      },
      takerAccountLabel: {
        type: "string",
        description: "Taker account label injected by admin direct start",
      },
      pair: {
        type: "string",
        description: "Pair alias injected by admin direct start",
      },
      exchangeName: {
        type: "string",
        description: "Exchange injected by admin direct start",
      },
      userId: {
        type: "string",
        description: "Runtime user id injected by admin direct start",
      },
      clientId: {
        type: "string",
        description: "Runtime client/order id injected by admin direct start",
      },
      marketMakingOrderId: {
        type: "string",
        description: "Runtime market-making order id injected by admin direct start",
      },
    },
    additionalProperties: false,
  },
  timeIndicator: {
    type: "object",
    required: [
      "userId",
      "clientId",
      "exchangeName",
      "symbol",
      "timeframe",
      "lookback",
      "emaFast",
      "emaSlow",
      "rsiPeriod",
      "indicatorMode",
      "orderMode",
      "orderSize",
      "tickIntervalMs",
    ],
    properties: {
      userId: {
        type: "string",
        description: "User ID",
      },
      clientId: {
        type: "string",
        description: "Client ID",
      },
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
    additionalProperties: false,
  },
};
