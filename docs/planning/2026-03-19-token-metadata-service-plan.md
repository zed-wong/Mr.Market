# Token Metadata Service Migration Plan

**Status:** Planned
**Created:** 2026-03-19
**Priority:** P2
**Effort:** ~4-6 days human / ~3-5 hours CC

## Goal

Reduce and eventually remove the backend's runtime dependency on CoinGecko by moving token list metadata to a build-time bundle first, then replacing token detail and chart endpoints only after contract parity is verified.

## Non-Goals

- Phase 1 does not delete `CoingeckoModule`.
- Phase 1 does not replace token detail or chart endpoints.
- The first release does not attempt cross-exchange price aggregation for every token.
- The first release does not guarantee fresh market cap or rank beyond bundle refreshes.

## Current Frontend Contract

### List Flows

Current list flows use:

- `GET /coingecko/coins/markets/:vs_currency`
- `GET /coingecko/coins/markets/:vs_currency/category/:category`

Current list UI depends on:

- `id`
- `symbol`
- `name`
- `image`
- `current_price`
- `market_cap`
- `market_cap_rank`
- `price_change_24h`
- `price_change_percentage_24h`
- `total_volume`
- `high_24h`
- `low_24h`
- `last_updated`

### Detail Flows

Current detail flows use:

- `GET /coingecko/coins/:id`
- `GET /coingecko/coins/:id/market_chart`
- `GET /coingecko/coins/:id/market_chart/range`

Current detail UI depends on:

- `coin.id`
- `coin.symbol`
- `coin.name`
- `coin.image.thumb`
- `coin.description.en`
- `coin.genesis_date`
- `coin.market_data.current_price.usd`
- `coin.market_data.price_change_24h`
- `coin.market_data.price_change_percentage_24h`
- `coin.market_data.high_24h.usd`
- `coin.market_data.low_24h.usd`
- `coin.market_data.market_cap.usd`
- `coin.market_data.total_volume.usd`
- `coin.tickers[]`
- chart response `prices`

## Identifier Model

- `token.id` is the only stable identifier for storage, API lookup, routing, and image filenames.
- `token.symbol` is display-only and must never be treated as unique.
- `primary_market` is a separate runtime mapping used for CCXT lookups.

Example:

```json
{
  "id": "bitcoin",
  "symbol": "BTC",
  "primary_market": {
    "exchange": "binance",
    "symbol": "BTC/USDT"
  }
}
```

## Migration Strategy

### Phase 1: Token List Migration

Ship a new token metadata module for list pages only.

Scope:

- Add build-time token bundle
- Add static token images
- Add `/tokens/markets/:vs_currency`
- Add `/tokens/markets/:vs_currency/category/:category`
- Migrate list page helpers from `/coingecko/...markets...` to `/tokens/...`
- Keep CoinGecko detail and chart endpoints unchanged

Exit criteria:

- `/market/token` works without backend CoinGecko list endpoints
- category tabs still work
- token list sorting still works
- token row navigation still routes by `id`

### Phase 2: Token Detail Migration

Replace detail and chart APIs only after explicit parity verification.

Scope:

- Add `/tokens/:id`
- Add `/tokens/:id/market_chart`
- Add `/tokens/:id/market_chart/range`
- Migrate detail page helpers
- Verify title, chart, and info tab behavior

Exit criteria:

- current detail page works for every token exposed by the new detail API
- all supported chart ranges work
- unsupported tokens fail explicitly, not silently

### Phase 3: Cleanup

Delete CoinGecko runtime code only after Phase 1 and Phase 2 pass verification.

## API Contracts

### Phase 1 APIs

#### `GET /tokens/markets/:vs_currency`

Query params:

- `page` optional, default `1`
- `per_page` optional, default `50`

Response shape must remain list-compatible with current frontend consumption:

```ts
interface TokenMarketItem {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  fully_diluted_valuation?: number;
  total_volume: number;
  high_24h: number;
  low_24h: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  market_cap_change_24h?: number;
  market_cap_change_percentage_24h?: number;
  circulating_supply?: number;
  total_supply?: number;
  max_supply?: number | null;
  ath?: number;
  ath_change_percentage?: number;
  ath_date?: string;
  atl?: number;
  atl_change_percentage?: number;
  atl_date?: string;
  last_updated: string;
}
```

#### `GET /tokens/markets/:vs_currency/category/:category`

Supported categories in Phase 1:

- `all`
- `decentralized_finance_defi`
- `stablecoins`

Filtering source:

- category membership is stored in the build-time bundle

If a category is unsupported, return `400`.

### Phase 2 APIs

#### `GET /tokens/:id`

This endpoint is only guaranteed for tokens with detail support in the bundle.

```ts
interface TokenDetail {
  id: string;
  symbol: string;
  name: string;
  image: {
    thumb: string;
    small: string;
    large: string;
  };
  description: {
    en: string;
  };
  genesis_date?: string;
  market_cap_rank?: number;
  platforms?: Record<string, string | null>;
  market_data: {
    current_price: { usd: number };
    price_change_24h: number;
    price_change_percentage_24h: number;
    high_24h?: { usd: number };
    low_24h?: { usd: number };
    market_cap?: { usd: number };
    total_volume?: { usd: number };
  };
  tickers: Array<{
    base: string;
    target: string;
    market: {
      name: string;
      identifier: string;
      has_trading_incentive?: boolean;
    };
    last: number;
    volume: number;
    trade_url?: string;
  }>;
}
```

#### `GET /tokens/:id/market_chart`

#### `GET /tokens/:id/market_chart/range`

```ts
interface MarketChartResponse {
  prices: Array<[number, number]>;
  market_caps: Array<[number, number]>;
  total_volumes: Array<[number, number]>;
}
```

Contract notes:

- `prices` is required
- timestamps are milliseconds since epoch
- rows must be ascending by timestamp
- `market_caps` may be an empty array
- `total_volumes` may be mapped from CCXT OHLCV volume

## Build-Time Bundle

### File Placement

- script: `scripts/update-token-metadata.ts`
- images: `interface/static/tokens/{id}.png`
- list/detail bundle: `server/data/tokens.json`

### Bundle Shape

`tokens.json` should be keyed by `id` and include:

- core metadata for list pages
- category membership
- local image path
- optional detail payload
- explicit `primary_market` mapping

Example:

```json
{
  "bitcoin": {
    "id": "bitcoin",
    "symbol": "BTC",
    "name": "Bitcoin",
    "image": "/static/tokens/bitcoin.png",
    "categories": ["all"],
    "primary_market": {
      "exchange": "binance",
      "symbol": "BTC/USDT"
    },
    "detail_supported": true
  }
}
```

## Trading Pair Mapping

This is a required design decision, not an open question.

Primary strategy:

- the update script writes `primary_market.exchange` and `primary_market.symbol` into the bundle
- runtime uses this mapping directly

Fallback policy:

- runtime must not guess `{SYMBOL}/USDT` in production behavior
- if a token has no `primary_market`, detail price and chart endpoints return `404`

Rationale:

- symbol guessing is too unreliable
- exchange-specific symbols are not consistent
- wrapped assets and duplicate symbols make inference unsafe

## Data Sources

### Phase 1

- static metadata: CoinGecko build-time bundle
- list price fields: merged from primary CCXT market where available
- market cap and rank: bundle values

### Phase 2

- detail metadata: bundle
- detail tickers: bundle snapshot, not runtime cross-exchange aggregation
- live price fields: primary CCXT market
- chart series: CCXT `fetchOHLCV`

## Backend Design

Create:

- `server/src/modules/data/token-metadata/token-metadata.module.ts`
- `server/src/modules/data/token-metadata/token-metadata.service.ts`
- `server/src/modules/data/token-metadata/token-metadata.controller.ts`

Module dependencies:

- `TokenMetadataModule` imports `MarketdataModule`
- `TokenMetadataService` reuses `MarketdataService` for CCXT-backed reads

The service is responsible for:

- loading `server/data/tokens.json`
- serving list-compatible responses
- category filtering
- merging live price fields onto static metadata
- enforcing `detail_supported`
- returning explicit `404` for unsupported detail/chart lookups

## Update Script

Invocation:

```json
{
  "scripts": {
    "update:tokens": "bun ../scripts/update-token-metadata.ts"
  }
}
```

Steps:

1. Fetch token universe with platform and category data needed by the frontend
2. Fetch market list data for the configured top N tokens
3. Download token images to `interface/static/tokens/{id}.png`
4. Populate `primary_market` for supported tokens
5. Optionally enrich detail payload for tokens selected for Phase 2
6. Write `server/data/tokens.json`

Practical rule:

- Phase 1 requires enough bundle data to serve list pages
- Phase 2 may enrich only a curated subset for detail support
- tokens without detail enrichment must not be treated as detail-compatible

## Cleanup Conditions

Delete CoinGecko runtime code only after all of the following are true:

- list pages no longer call `/coingecko/coins/markets/...`
- detail pages no longer call `/coingecko/coins/:id`
- chart pages no longer call CoinGecko chart endpoints
- unsupported-token behavior is explicit and tested
- `server/src/app.module.ts` swaps `CoingeckoModule` for `TokenMetadataModule`
- CoinGecko tests and fixtures are replaced
- `docs/architecture/server/module-map.md` is updated

Files to delete after cleanup:

- `server/src/modules/data/coingecko/coingecko.module.ts`
- `server/src/modules/data/coingecko/coingecko.service.ts`
- `server/src/modules/data/coingecko/coingecko.controller.ts`
- `server/src/modules/data/coingecko/coingecko.controller.spec.ts`
- `server/src/modules/data/coingecko/coingecko.service.spec.ts`
- `server/src/modules/data/coingecko/coingecko.fixtures.ts`

## Risks

| Risk | Mitigation |
|------|------------|
| API drift from current frontend contract | Treat current helper usage as the compatibility source of truth |
| Duplicate symbols | Key everything by `id` |
| Missing CCXT mapping | Require explicit `primary_market` in bundle |
| Detail parity over-promised | Keep detail replacement in Phase 2 with explicit support gating |
| Category behavior regression | Add a dedicated category endpoint and fixed supported set |

## Implementation Order

1. Build Phase 1 bundle and image pipeline
2. Add `TokenMetadataModule` and list endpoints
3. Migrate list frontend calls and verify category behavior
4. Add detail/chart endpoints behind explicit `detail_supported` gating
5. Migrate detail frontend calls and verify parity
6. Delete CoinGecko module only after cleanup conditions pass
