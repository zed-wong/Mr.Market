**WARNING: This is highly alpha code. Do not use it or you will lose all your money. We'd like to thank Little creatures for being the first company to test Mr. Market and for helping with QA.**

![Playwright Tests](https://github.com/Hu-Fi/Mr.Market/actions/workflows/playwright.yml/badge.svg)
![Unit Tests](https://github.com/Hu-Fi/Mr.Market/actions/workflows/vitest.yml/badge.svg)
![Unit Tests](https://github.com/Hu-Fi/Mr.Market/actions/workflows/servertests.yml/badge.svg)
![Lint](https://github.com/Hu-Fi/Mr.Market/actions/workflows/lint.yml/badge.svg)

# Introduction

## What is Mr.Market

Mr Market is a CeFi crypto bot and the reference exchange oracle for Hu Fi. Mr Market has three main functions

- An automated crypto bot that supports a variety of strategies for arbitrage across CeFi exchanges, including admin direct market-making strategies such as Efficient Dual Account Volume.
- [What is Hu-Fi](https://github.com/hu-fi)
- A front end where users can contribute funds to increase the ability to do Hu Fi market making.

# Development

## Getting Started

### Prerequisites

Install dependencies

```
make install
```

### SQLite database

SQLite is file-based. Set `DATABASE_PATH` in `/server/.env` and the database file is created automatically.

### Run development servers

```
make start-dev
```

### Local admin-interface validation

The standalone admin interface is validated locally against the real Nest server. The admin preview runs at `http://localhost:4176`, and the server runs at `http://127.0.0.1:3100`.

The admin dashboard, orders, positions, and system pages use real server-backed data in this flow. Rebalance has been removed; Direct Market Making, Exchanges, and API Keys remain available. The admin Direct Market Making area includes PnL, inventory, and risk analytics with per-order, per-pair, and admin-wide totals, timelines, drawdown, fill/quote metrics, cross-currency breakdowns, and mark-price unavailable states. Efficient Dual Account Volume is available as an admin direct market-making strategy for two selected exchange accounts, with readiness and cycle visibility surfaced in the direct order flow. Paused admin-direct strategy variations can be edited through schema-driven validation before resume. Hyperliquid spot is supported through the existing exchange API-key flow, where Hyperliquid credentials are labeled Wallet address and Private key. Build the admin interface with `PUBLIC_MRM_BACKEND_URL=http://127.0.0.1:3100`, then run the preview against the local production server.

Use inline environment variables for local validation instead of reading `.env` files. At minimum, provide the local server values such as `PORT=3100`, `DATABASE_PATH`, `ADMIN_PASSWORD`, `JWT_SECRET`, `CORS_ORIGIN=http://localhost:4176`, and passkey origin/RP settings; build the admin interface with `PUBLIC_MRM_BACKEND_URL=http://127.0.0.1:3100`.

Direct market-making strategies that trade on exchange require exchange credentials with trading permission. Efficient Dual Account Volume requires two exchange accounts on the same exchange/pair with order-scoped balances available for the selected base and quote assets.

Key commands:

```
bun run --cwd server build
bun --no-env-file --cwd server run test --testPathPattern='analytics|pnl|variation|strategy-variation|exchange-connector-adapter.service.spec.ts|exchange-init.service.spec.ts|exchange-api-key.service.spec.ts|fill-routing.service.spec.ts|client-order-id|cloid' --runInBand
bun run --cwd server start:prod
bun run --cwd admin-interface check
bun --no-env-file --cwd admin-interface x vitest run src/i18n/i18n.test.ts src/lib/components/shell/nav-items.test.ts src/lib/components/market-making src/lib/helpers src/routes/trading --reporter=verbose
bun run --cwd admin-interface test:unit
bun run --cwd admin-interface test:e2e
bun run --cwd admin-interface preview -- --host localhost --port 4176
```

### Local web3-interface prototype

`web3-interface` is a SvelteKit prototype for Web3 user flows. It can use Reown wallet connection state and now presents an order-first market-making experience: `/market-making` shows wallet-scoped orders with a create action, order creation captures strategy/spec/deposit inputs, and order detail shows PnL, specs, balances, events, and start/pause/resume/deposit/withdraw actions. Market-making order surfaces use the server-backed Web3 market-making API and no longer show campaign UX. It intentionally excludes swap/spot flows.

Run the prototype locally:

```
CHOKIDAR_USEPOLLING=1 bun run --cwd web3-interface dev -- --host 127.0.0.1 --port 5178
```

Validate the prototype:

```
bun run --cwd web3-interface check
bun run --cwd web3-interface lint
bun run --cwd web3-interface test:unit
bun run --cwd web3-interface build
```

The mission validation gate for the Web3 market-making order UX also passed all assertions in `validation-state.json` (75/75).

Future server endpoint contracts are documented in [`docs/plans/2026-05-23-future-web3-endpoint-documentation.md`](./docs/plans/2026-05-23-future-web3-endpoint-documentation.md).

## Tests

### Client

#### Install dependencies

```
bunx playwright install
```

#### Running tests

Unit testing

```
bun run test:unit
```

E2E testing

```
bun run test:e2e
```

### Server

#### Running tests

Unit testing

```
bun test
```

## Deployment Guide

### Preparations

First, ensure you have the following environment variables ready. These are crucial for the configuration of the server and interface.

#### Server Environment Variables (`/server/.env`)

| Variable                    | Description                | Source                    |
| --------------------------- | -------------------------- | ------------------------- |
| `ADMIN_PASSWORD`            | Admin page password        | User-defined              |
| `JWT_SECRET`                | JWT secret key (32 bit)    | User-defined              |
| `COINGECKO_API_KEY`         | Coingecko API key          | Coingecko                 |
| `DATABASE_PATH`             | SQLite database file path  | User-defined              |
| `MIXIN_APP_ID`              | Mixin App ID               | Mixin Developer Dashboard |
| `MIXIN_SESSION_ID`          | Mixin Session ID           | Mixin Developer Dashboard |
| `MIXIN_SERVER_PUBLIC_KEY`   | Mixin Server Public key    | Mixin Developer Dashboard |
| `MIXIN_SESSION_PRIVATE_KEY` | Mixin Session Private key  | Mixin Developer Dashboard |
| `MIXIN_SPEND_PRIVATE_KEY`   | Mixin Spend Private key    | Mixin Developer Dashboard |
| `MIXIN_OAUTH_SECRET`        | Mixin Oauth Secret         | Mixin Developer Dashboard |
| `BINANCE_API_KEY`           | Binance Account API Key    | Binance Account Settings  |
| `BINANCE_SECRET`            | Binance Account API Secret | Binance Account Settings  |
| `BINANCE_API_KEY_2`         | Optional second Binance Account API Key for two-account strategies | Binance Account Settings |
| `BINANCE_SECRET_2`          | Optional second Binance Account API Secret for two-account strategies | Binance Account Settings |

Refer to [`./server/.env.example`](./server/.env.example) to enable more exchanges for strategies.

#### Interface Environment Variables (`/interface/.env`)

| Variable                  | Description           | Source                    |
| ------------------------- | --------------------- | ------------------------- |
| `PUBLIC_BOT_ID`           | Mixin App ID          | Mixin Developer Dashboard |
| `PUBLIC_HUFI_SOCKET_URL`  | Server deployment URL | Server Hosting Platform   |
| `PUBLIC_HUFI_BACKEND_URL` | Server deployment URL | Server Hosting Platform   |

Variables starting with `MIXIN` are obtained from the Mixin bot keystore, accessible on the [Mixin developer dashboard](https://developers.mixin.one/dashboard) by creating a new bot.

### Deploy on Render

This guide will walk you through the process of deploying a server, and an interface on Render for our application. SQLite is used for persistence, so no external database service is required.
By the end of these steps, you will have a fully functional server and interface setup.

1. **Deploy Server on Render**

   - Login to the [Render](https://dashboard.render.com/), and create a new web service. Connect the github repo, and adjust the environment variables.

   - Use
     - `./server` for Root Directory
   - `bun install --frozen-lockfile; bun run build` for Build Command
   - `bun run migration:run` for Pre-Deploy Command (Available in advanced settings)
   - `bun run start:prod` for Start Command

2. **Deploy Interface on Render**

   - Login to the [Render](https://dashboard.render.com), and create a new static site. Connect the github repo, and adjust the environment variables.

   - Use

     - `./interface` for Root Directory
      - `bun install --frozen-lockfile; bun run build` for Build Command
     - `build` for Publish Directory

   - Setup Redirect & Rewrite Rules as follows.

     | Source | Destination | Action   |
     | ------ | ----------- | -------- |
     | /(.\*) | /app.html   | Redirect |

### Deploy with Docker

1. Deploy Server

   If you have docker installed on your server, it's much easier to run the Mr.Market server without setting up an additional database service.

   - Make sure you have `.env` file is configured properly.
   - Run `docker compose up` in `server` directory.

2. Deploy Interface

   We do not docker deployment for Mr.Market interface.

### Troubleshooting

If you encounter issues during the deployment, check the following:

- Ensure all environment variables are correctly set.
- Verify that your Render account is active and in good standing.
- Consult the Render documentation for detailed troubleshooting steps.

# Built With

- [Svelte](https://svelte.dev/) - Web framework
- [Daisy UI](https://daisyui.com/) - UI framework
- [Nest.js](https://nestjs.com/) - Backend API framework

# License

This project is licensed under the GNU Affero General Public License - see the [LICENSE.md](./LICENSE) file for details

# Free Data provided by

"Data provided by CoinGecko",
