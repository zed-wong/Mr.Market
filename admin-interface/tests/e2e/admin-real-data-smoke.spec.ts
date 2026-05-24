import { expect, test, type Page, type Response } from '@playwright/test';
import { inspectResponseBodyForSecrets } from '../../src/lib/helpers/admin/response-secret-check';

const ADMIN_PASSWORD = 'test-admin-password';
const BACKEND_ORIGIN = 'http://127.0.0.1:3100';
const PREVIEW_ORIGIN = 'http://localhost:4176';

const realDataRoutes = [
  {
    path: '/',
    label: 'dashboard',
    selector: '[data-testid="admin-dashboard-shell"]',
    endpoint: '/admin/dashboard/summary',
  },
  {
    path: '/trading/orders',
    label: 'orders',
    selector: '[data-testid="orders-page"]',
    endpoint: '/admin/orders',
  },
  {
    path: '/trading/positions',
    label: 'positions',
    selector: '[data-testid="positions-page"]',
    endpoint: '/admin/positions',
  },
  {
    path: '/system/health',
    label: 'health',
    selector: '[data-testid="system-health-page"]',
    endpoint: '/admin/system/health',
  },
  {
    path: '/system/logs',
    label: 'logs',
    selector: '[data-testid="system-logs-page"]',
    endpoint: '/admin/system/logs',
  },
  {
    path: '/system/audit',
    label: 'audit',
    selector: '[data-testid="system-audit-page"]',
    endpoint: '/admin/system/audit',
  },
  {
    path: '/system/config',
    label: 'config',
    selector: '[data-testid="system-config-page"]',
    endpoint: '/admin/system/config',
  },
] as const;

const preservedRoutes = [
  {
    path: '/setup',
    label: 'setup guide',
    text: /first-time admin setup guide|backend reachability|API key validation/i,
  },
  {
    path: '/trading/direct-market-making',
    label: 'direct market making',
    text: /direct market making|market making/i,
  },
  {
    path: '/trading/exchanges',
    label: 'exchanges',
    text: /exchanges/i,
  },
  {
    path: '/system/api-keys',
    label: 'api keys',
    text: /api keys/i,
  },
] as const;

const secretPatterns = [
  /test-admin-password/i,
  /test-admin-jwt-secret-with-enough-length-for-local-validation/i,
  /authorization\s*[:=]/i,
  /bearer\s+[a-z0-9._-]{16,}/i,
  /jwt_secret/i,
  /encryption_private_key/i,
  /-----BEGIN [^-]*PRIVATE KEY-----/i,
];

const internalUrl = (url: string) =>
  url.startsWith(BACKEND_ORIGIN) || url.startsWith(PREVIEW_ORIGIN);

const responsePath = (response: Response) => {
  try {
    return new URL(response.url()).pathname;
  } catch {
    return '';
  }
};

const expectNoSecrets = (value: string, context: string) => {
  for (const pattern of secretPatterns) {
    expect(value, `${context} must not expose ${pattern}`).not.toMatch(pattern);
  }
};

const dashboardSummary = (range: '24h' | '7d' | '30d', totalCapital: string) => ({
  generatedAt: `2026-05-23T0${range === '24h' ? '1' : '2'}:00:00.000Z`,
  range: {
    key: range,
    startedAt: '2026-05-22T00:00:00.000Z',
    endedAt: '2026-05-23T00:00:00.000Z',
  },
  kpis: {
    activeStrategies: 0,
    totalStrategies: 0,
    pendingIntents: 0,
    openOrders: 0,
    trackedOrders: 0,
    totalCapital,
    reconciliationViolations: 0,
    runtimeHealth: 'healthy',
  },
  strategies: {
    total: 0,
    definitions: 0,
    counts: {},
    recent: [],
    updatedSince: '2026-05-22T00:00:00.000Z',
    truncated: false,
  },
  intents: { total: 0, counts: {}, recent: [], truncated: false },
  orderFlow: {
    total: 0,
    counts: {},
    recent: [],
    truncated: false,
    updatedSince: '2026-05-22T00:00:00.000Z',
    volume: {
      tradeCount: 0,
      notionalVolume: '0',
      scannedRows: 0,
      truncated: false,
    },
  },
  capital: {
    total: totalCapital,
    byAsset: [],
    scannedRows: 0,
    totalRows: 0,
    truncated: false,
  },
  exchanges: {
    total: 0,
    byValidationStatus: {},
    accounts: [],
    scannedRows: 0,
    truncated: false,
  },
  health: {
    status: 'healthy',
    timestamp: '2026-05-23T00:00:00.000Z',
    queue: null,
    metrics: null,
    issues: [],
  },
  reconciliation: {
    totalViolations: 0,
    reports: [],
  },
  runtime: {
    stats: [],
    recent: [],
    truncated: false,
  },
  limits: {
    recentItems: 10,
    capitalScanRows: 500,
    apiKeyScanRows: 25,
  },
});

let cachedAdminAccessToken: string | null = null;

const login = async (page: Page) => {
  if (cachedAdminAccessToken) {
    await page.goto('/login');
    await page.evaluate((token) => {
      localStorage.setItem('admin-access-token', token);
    }, cachedAdminAccessToken);
    await page.goto('/');
    await expect(page.locator('[data-testid="admin-dashboard-shell"]')).toBeVisible();
    return;
  }

  await page.goto('/login');
  await page.locator('input[name="password"]').fill(ADMIN_PASSWORD);
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().startsWith(`${BACKEND_ORIGIN}/auth/login`) &&
        response.status() === 201,
    ),
    page.locator('button[type="submit"]').click(),
  ]);
  await expect(page.locator('[data-testid="admin-dashboard-shell"]')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('admin-access-token') !== null))
    .toBe(true);
  cachedAdminAccessToken = await page.evaluate(() => localStorage.getItem('admin-access-token'));
};

const routeApiKeyMetadata = async (page: Page) => {
  await page.route(`${BACKEND_ORIGIN}/admin/grow/exchange/ccxt-supported`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(['binance', 'okx']),
    });
  });
  await page.route(`${BACKEND_ORIGIN}/admin/exchanges/key-pair`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ publicKey: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=' }),
    });
  });
};

const routeExchangeMetadata = async (page: Page) => {
  await page.route(`${BACKEND_ORIGIN}/admin/grow/exchange/supported`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(['binance', 'okx']),
    });
  });
  await page.route(`${BACKEND_ORIGIN}/admin/grow/exchange/ccxt-supported`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(['binance', 'okx', 'mystery']),
    });
  });
};

test.describe.serial('real-data admin smoke', () => {
  test('visits every target admin surface in one authenticated isolated session', async ({ page }) => {
    const unexpectedResponses: string[] = [];
    const clientErrors: string[] = [];
    const secretChecks: Promise<void>[] = [];
    let authenticated = false;

    page.on('pageerror', (error) => {
      clientErrors.push(error.message);
    });
    page.on('console', (message) => {
      if (message.type() === 'error') {
        clientErrors.push(message.text());
      }
    });
    page.on('response', (response) => {
      const url = response.url();
      if (!internalUrl(url)) {
        return;
      }

      const status = response.status();
      const pathname = responsePath(response);
      if (
        status === 404 ||
        status >= 500 ||
        (authenticated && (status === 401 || status === 403))
      ) {
        unexpectedResponses.push(`${status} ${url}`);
      }

      const requestType = response.request().resourceType();
      const canInspectBody = ['document', 'fetch', 'xhr'].includes(requestType);
      if (!canInspectBody || pathname === '/auth/login') {
        return;
      }

      secretChecks.push(
        inspectResponseBodyForSecrets({
          readText: () => response.text(),
          assertNoSecrets: expectNoSecrets,
          context: `response body for ${url}`,
        }),
      );
    });

    await login(page);
    authenticated = true;

    for (const route of realDataRoutes) {
      const apiResponse = page.waitForResponse(
        (response) =>
          response.url().startsWith(`${BACKEND_ORIGIN}${route.endpoint}`) &&
          response.status() === 200,
      );
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');
      await expect(page.locator(route.selector), route.label).toBeVisible();
      await apiResponse;
      await expect(page.locator(route.selector)).not.toContainText(/fixture|mock/i);
      expectNoSecrets(await page.locator('body').innerText(), `${route.label} rendered text`);
      expect(page.url(), `${route.label} should stay on isolated preview`).toContain(
        PREVIEW_ORIGIN,
      );
    }

    for (const route of preservedRoutes) {
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('body'), route.label).toContainText(route.text);
      expect((await page.locator('body').innerText()).trim().length).toBeGreaterThan(20);
      expectNoSecrets(await page.locator('body').innerText(), `${route.label} rendered text`);
      expect(page.url(), `${route.label} should stay on isolated preview`).toContain(
        PREVIEW_ORIGIN,
      );
    }

    await Promise.all(secretChecks);

    const requestedUrls = await page.evaluate(() =>
      performance.getEntriesByType('resource').map((entry) => entry.name),
    );
    expect(requestedUrls.join('\n')).not.toMatch(/localhost:3000|127\.0\.0\.1:3000|localhost:5174/);
    expect(unexpectedResponses).toEqual([]);
    expect(clientErrors).toEqual([]);
  });

  test('sidebar highlights only the active child for nested admin locations', async ({ page }) => {
    await login(page);
    await routeApiKeyMetadata(page);
    await page.route(`${BACKEND_ORIGIN}/admin/exchanges/keys`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/system/api-keys');
    await page.waitForLoadState('networkidle');

    const sidebar = page.getByTestId('old-admin-sidebar');
    const parentGroup = sidebar.getByRole('button', { name: /system health/i });
    const activeChild = sidebar.getByRole('button', { name: /^api keys$/i });

    await expect(parentGroup).toHaveAttribute('aria-current', 'location');
    await expect(parentGroup).toHaveClass(/(?:^|\s)bg-base-200(?:\s|$)/);
    await expect(parentGroup).not.toHaveClass(/(?:^|\s)bg-primary(?:\s|$)/);
    await expect(parentGroup).not.toHaveClass(/(?:^|\s)text-primary-content(?:\s|$)/);

    await expect(activeChild).toHaveAttribute('aria-current', 'page');
    await expect(activeChild).toHaveClass(/(?:^|\s)bg-primary(?:\s|$)/);
    await expect(activeChild).toHaveClass(/(?:^|\s)text-primary-content(?:\s|$)/);
  });

  test('API key management shows readiness labels, permission labels, form validation, and removal refresh', async ({ page }) => {
    await login(page);
    await routeApiKeyMetadata(page);

    let keys = [
      {
        key_id: 'ready-key',
        exchange: 'binance',
        name: 'ready account',
        api_key: 'ready-api-key-1234',
        api_secret: '',
        permissions: 'read-trade',
        state: 'alive',
        validation_status: 'valid',
        created_at: '2026-05-23T00:00:00.000Z',
        last_update: '2026-05-23T00:00:00.000Z',
      },
      {
        key_id: 'pending-key',
        exchange: 'binance',
        name: 'pending account',
        api_key: 'pending-api-key-1234',
        api_secret: '',
        permissions: 'read',
        validation_status: 'pending',
      },
      {
        key_id: 'failed-key',
        exchange: 'okx',
        name: 'failed account',
        api_key: 'failed-api-key-1234',
        api_secret: '',
        permissions: 'read-trade',
        validation_status: 'failed',
        validation_error: 'Invalid signature',
      },
      {
        key_id: 'disabled-key',
        exchange: 'okx',
        name: 'disabled account',
        api_key: 'disabled-api-key-1234',
        api_secret: '',
        permissions: 'read',
        state: 'disabled',
        validation_status: 'valid',
      },
      {
        key_id: 'unknown-key',
        exchange: 'kraken',
        name: 'unknown account',
        api_key: 'unknown-api-key-1234',
        api_secret: '',
        permissions: 'custom',
        state: 'mystery',
      },
    ];
    let keyListLoads = 0;

    await page.route(`${BACKEND_ORIGIN}/admin/exchanges/keys`, async (route) => {
      if (route.request().method() === 'GET') {
        keyListLoads += 1;
        if (keyListLoads === 1) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(keys),
        });
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });
    await page.route(`${BACKEND_ORIGIN}/admin/exchanges/keys/*`, async (route) => {
      if (route.request().method() === 'DELETE') {
        keys = [];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto('/system/api-keys');
    await expect(page.getByTestId('api-key-loading')).toBeVisible();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toContainText('ready');
    await expect(page.locator('body')).toContainText('validation pending');
    await expect(page.locator('body')).toContainText('validation failed');
    await expect(page.locator('body')).toContainText('Invalid signature');
    await expect(page.locator('body')).toContainText('disabled');
    await expect(page.locator('body')).toContainText('unknown');
    await expect(page.locator('body')).toContainText('read only');
    await expect(page.locator('body')).toContainText('trade enabled');
    await expect(page.locator('body')).toContainText('permission unknown');

    await page.getByRole('button', { name: /^\+ add key$/i }).click();
    await page.getByRole('button', { name: /^add key$/i }).click();
    await expect(page.locator('body')).toContainText('Choose or enter an exchange.');
    await expect(page.locator('body')).toContainText('Enter a display name.');
    await expect(page.locator('body')).toContainText('Paste the exchange API key.');
    await expect(page.locator('body')).toContainText('Paste the exchange API secret.');
    await page.getByRole('button', { name: /^cancel$/i }).click();

    await page.locator('button[aria-label="delete API key"]').first().click();
    await page.locator('.modal-open').getByRole('button', { name: /^delete$/i }).click();
    await expect(page.getByTestId('api-key-empty')).toBeVisible();
    await expect(page.locator('body')).toContainText('no API keys configured');

    await page.unroute(`${BACKEND_ORIGIN}/admin/exchanges/keys`);
    await page.route(`${BACKEND_ORIGIN}/admin/exchanges/keys`, async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'forced API key load failure' }),
      });
    });

    await page.goto('/system/api-keys');
    await expect(page.getByTestId('api-key-error')).toBeVisible();
    await expect(page.locator('body')).toContainText('forced API key load failure');
    await expect(page.getByTestId('api-key-empty')).not.toBeVisible();

    await page.unroute(`${BACKEND_ORIGIN}/admin/exchanges/key-pair`);
    await page.route(`${BACKEND_ORIGIN}/admin/exchanges/key-pair`, async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'forced encryption metadata failure' }),
      });
    });
    await page.unroute(`${BACKEND_ORIGIN}/admin/exchanges/keys`);
    await page.route(`${BACKEND_ORIGIN}/admin/exchanges/keys`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/system/api-keys');
    await expect(page.getByTestId('api-key-metadata-error')).toBeVisible();
    await expect(page.locator('body')).toContainText('forced encryption metadata failure');
    await expect(page.getByRole('button', { name: /^\+ add key$/i })).toBeDisabled();
  });

  test('direct market-making reuses API key readiness vocabulary and remediation routes', async ({ page, context }) => {
    await login(page);
    await routeExchangeMetadata(page);

    let resolveGrowInfo!: () => void;
    const delayedGrowInfo = new Promise<void>((resolve) => {
      resolveGrowInfo = resolve;
    });

    await page.route(`${BACKEND_ORIGIN}/grow/info`, async (route) => {
      await delayedGrowInfo;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          exchanges: [{ exchange_id: 'binance', name: 'Binance', enable: true }],
          simply_grow: { tokens: [] },
          arbitrage: { pairs: [] },
          market_making: { pairs: [], exchanges: [] },
        }),
      });
    });

    await page.goto('/trading/exchanges');
    await expect(page.getByTestId('exchange-loading')).toBeVisible();
    await expect(page.getByTestId('exchange-loading')).toContainText(/exchange management/i);
    await expect(page.getByTestId('exchange-loading')).toContainText(/loading exchange management/i);
    await expect(page.getByTestId('exchange-empty')).not.toBeVisible();
    await expect(page.locator('body')).not.toContainText('No exchanges are configured yet');

    resolveGrowInfo();
    await expect(page.getByRole('row').filter({ hasText: 'Binance' })).toBeVisible();
    await expect(page.getByTestId('exchange-loading')).not.toBeVisible();
    await page.unroute(`${BACKEND_ORIGIN}/grow/info`);

    const keys = [
      {
        key_id: 'ready-key',
        exchange: 'binance',
        name: 'ready account',
        api_key: 'ready-api-key-1234',
        api_secret: '',
        permissions: 'read-trade',
        state: 'alive',
        validation_status: 'valid',
      },
      {
        key_id: 'read-only-key',
        exchange: 'binance',
        name: 'read only account',
        api_key: 'read-only-api-key-1234',
        api_secret: '',
        permissions: 'read',
        state: 'alive',
        validation_status: 'valid',
      },
      {
        key_id: 'pending-key',
        exchange: 'binance',
        name: 'pending account',
        api_key: 'pending-api-key-1234',
        api_secret: '',
        permissions: 'read-trade',
        validation_status: 'pending',
      },
      {
        key_id: 'failed-key',
        exchange: 'binance',
        name: 'failed account',
        api_key: 'failed-api-key-1234',
        api_secret: '',
        permissions: 'read-trade',
        validation_status: 'failed',
        validation_error: 'Invalid signature',
      },
    ];
    const order = {
      orderId: 'order-failed-key',
      exchangeName: 'binance',
      pair: 'BTC/USDT',
      state: 'running',
      runtimeState: 'running',
      strategyDefinitionId: 'pure-mm',
      strategyName: 'Pure MM',
      controllerType: 'pureMarketMaking',
      directExecutionMode: 'single_account',
      createdAt: '2026-05-23T00:00:00.000Z',
      lastTickAt: '2026-05-23T00:00:00.000Z',
      accountLabel: 'main',
      makerAccountLabel: 'maker',
      takerAccountLabel: 'taker',
      apiKeyId: 'failed-key',
      makerApiKeyId: null,
      takerApiKeyId: null,
      warnings: [],
    };

    await page.route(`${BACKEND_ORIGIN}/grow/info`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          exchanges: [
            { exchange_id: 'binance', name: 'binance', enable: true },
            { exchange_id: 'okx', name: 'OKX', enable: true },
            { exchange_id: 'mystery', name: 'Mystery Exchange' },
          ],
          simply_grow: { tokens: [] },
          arbitrage: { pairs: [] },
          market_making: {
            exchanges: [
              { exchange_id: 'binance', name: 'binance', enable: true },
              { exchange_id: 'okx', name: 'OKX', enable: true },
            ],
            pairs: [
              { exchange_id: 'binance', symbol: 'BTC/USDT', min_order_amount: '0.01' },
              { exchange_id: 'okx', symbol: 'ETH/USDT', min_order_amount: '0.1' },
            ],
          },
        }),
      });
    });
    await page.route(`${BACKEND_ORIGIN}/admin/exchanges/keys`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(keys),
      });
    });
    await page.route(`${BACKEND_ORIGIN}/admin/market-making/direct-strategies`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'pure-mm',
            key: 'pure-mm',
            name: 'Pure MM',
            controllerType: 'pureMarketMaking',
            directExecutionMode: 'single_account',
            defaultConfig: {},
            configSchema: {},
          },
        ]),
      });
    });
    await page.route(`${BACKEND_ORIGIN}/admin/market-making/direct-orders`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([order]),
      });
    });
    await page.route(`${BACKEND_ORIGIN}/admin/market-making/direct-orders/order-failed-key/status`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...order,
          executorHealth: 'active',
          lastUpdatedAt: '2026-05-23T00:01:00.000Z',
          privateStreamEventAt: '2026-05-23T00:01:00.000Z',
          openOrders: [],
          intents: [],
          recentErrors: [],
          orderConfig: {
            orderAmount: '0.01',
            bidSpread: null,
            askSpread: null,
            numberOfLayers: null,
            baseIntervalTime: 30,
            numTrades: 100,
            baseIncrementPercentage: null,
            pricePushRate: null,
            postOnlySide: 'buy',
            dynamicRoleSwitching: false,
            targetQuoteVolume: null,
            cadenceVariance: null,
            tradeAmountVariance: null,
            priceOffsetVariance: null,
            publishedCycles: 0,
            completedCycles: 0,
            tradedQuoteVolume: null,
            realizedPnlQuote: null,
          },
          spread: null,
          inventoryBalances: [],
          stale: false,
        }),
      });
    });
    await page.route(`${BACKEND_ORIGIN}/admin/market-making/campaigns`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route(`${BACKEND_ORIGIN}/admin/market-making/wallet-status`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ configured: true, address: '0x0000000000000000000000000000000000000000' }),
      });
    });
    await page.route(`${BACKEND_ORIGIN}/admin/grow/exchange/markets/binance`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route(`${BACKEND_ORIGIN}/admin/grow/exchange/markets/okx`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    let updateRequests = 0;
    await page.route(`${BACKEND_ORIGIN}/admin/grow/exchange/update/*`, async (route) => {
      updateRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto('/trading/direct-market-making');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toContainText('ready');
    await expect(page.locator('body')).toContainText('validation pending');
    await expect(page.locator('body')).toContainText('validation failed');
    await expect(page.locator('body')).toContainText('Invalid signature');
    await expect(page.locator('body')).toContainText('read only');
    await expect(page.locator('body')).toContainText('trade enabled');

    await page.goto('/trading/exchanges');
    await page.waitForLoadState('networkidle');
    const mysteryRow = page.getByRole('row').filter({ hasText: 'Mystery Exchange' });
    await expect(mysteryRow).toContainText('unknown');
    await expect(mysteryRow).not.toContainText('disabled');

    const unknownToggle = mysteryRow.getByRole('button', { name: /enablement unknown mystery exchange/i });
    await expect(unknownToggle).toBeDisabled();
    await expect(unknownToggle).toHaveAttribute('title', /enablement is unknown/i);
    await expect(unknownToggle).not.toHaveAttribute('title', /click to enable/i);
    expect(updateRequests).toBe(0);

    await page.goto('/trading/direct-market-making');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /create new order/i }).click();
    await page.locator('select').first().selectOption('binance');
    await expect(page.locator('.modal-open')).toContainText('ready · trade enabled');
    await expect(page.locator('.modal-open')).toContainText('blocked API keys');
    await expect(page.locator('.modal-open')).toContainText('validation pending');
    await expect(page.locator('.modal-open')).toContainText('validation failed');
    await expect(page.locator('.modal-open')).toContainText('read only');
    await page.locator('.modal-open select').first().selectOption('okx');
    await expect(page.locator('.modal-open')).toContainText('No ready, trade enabled API key is available for this exchange');
    await expect(page.locator('.modal-open')).toContainText('missing');
    await expect(page.locator('.modal-open')).toContainText('No API key record was returned for this exchange.');
    await expect(page.locator('.modal-open').getByRole('link', { name: /manage API keys/i })).toHaveAttribute('href', '/system/api-keys');
    await page.locator('.modal-open').getByLabel(/close/i).click();

    await page.getByText('BTC/USDT').click();
    await expect(page.locator('.modal-open')).toContainText('exchange and API key readiness');
    await expect(page.locator('.modal-open')).toContainText('exchange ready');
    await expect(page.locator('.modal-open')).toContainText('API key validation failed');
    await expect(page.locator('.modal-open')).toContainText('Invalid signature');
    await expect(page.locator('.modal-open').getByRole('link', { name: /manage exchanges/i })).toHaveAttribute('href', '/trading/exchanges');
    await expect(page.locator('.modal-open').getByRole('link', { name: /manage API keys/i })).toHaveAttribute('href', '/system/api-keys');
    await page.locator('.modal-open').getByLabel(/close/i).click();

    const remediationLink = page.getByRole('link', { name: /manage exchange api keys/i });
    await expect(remediationLink).toBeVisible();
    await expect(remediationLink).toHaveAttribute('href', '/system/api-keys');

    const pageCountBefore = context.pages().length;
    await Promise.all([
      page.waitForURL('**/system/api-keys'),
      remediationLink.click(),
    ]);

    expect(context.pages()).toHaveLength(pageCountBefore);
    expect(page.url()).toContain(`${PREVIEW_ORIGIN}/system/api-keys`);
    expect(page.url()).not.toContain('/manage/settings/api-keys');
    await expect(page.locator('body')).toContainText(/api keys/i);
    await expect(page.locator('body')).toContainText(/Exchange API credentials/i);

    await page.goto('/trading/direct-market-making');
    await page.waitForLoadState('networkidle');
    await page.getByText('BTC/USDT').click();
    const diagnosisRemediationLink = page.locator('.modal-open').getByRole('link', { name: /manage API keys/i });
    await Promise.all([
      page.waitForURL('**/system/api-keys'),
      diagnosisRemediationLink.click(),
    ]);
    expect(page.url()).toContain(`${PREVIEW_ORIGIN}/system/api-keys`);
  });

  test('direct market-making list and detail diagnosis states are explicit and keyboard reachable', async ({ page }) => {
    await login(page);

    const nowMs = Date.now();
    const secondsAgo = (seconds: number) => new Date(nowMs - seconds * 1000).toISOString();
    const order = {
      orderId: 'order-state-handling',
      exchangeName: 'binance',
      pair: 'BTC/USDT',
      state: 'running',
      runtimeState: '',
      strategyDefinitionId: 'dual-mm',
      strategyName: 'Dual MM',
      controllerType: 'dualAccountVolume',
      directExecutionMode: 'dual_account',
      createdAt: secondsAgo(120),
      lastTickAt: secondsAgo(5),
      accountLabel: 'main',
      makerAccountLabel: 'maker',
      takerAccountLabel: 'taker',
      apiKeyId: null,
      makerApiKeyId: 'ready-maker-key',
      takerApiKeyId: 'ready-taker-key',
      warnings: [],
    };
    const statusBody = (runtimeState: 'running' | 'stopped') => ({
      ...order,
      state: runtimeState,
      runtimeState,
      executorHealth: 'active',
      lastTickAt: runtimeState === 'running' ? secondsAgo(5) : null,
      lastUpdatedAt: runtimeState === 'running' ? secondsAgo(3) : secondsAgo(1),
      privateStreamEventAt: runtimeState === 'running' ? secondsAgo(3) : null,
      openOrders: [],
      intents: [],
      recentErrors: [],
      orderConfig: {
        orderAmount: '0.01',
        bidSpread: '0.001',
        askSpread: '0.001',
        numberOfLayers: '1',
        baseIntervalTime: 30,
        numTrades: 100,
        baseIncrementPercentage: null,
        pricePushRate: null,
        postOnlySide: 'buy',
        dynamicRoleSwitching: false,
        targetQuoteVolume: null,
        cadenceVariance: null,
        tradeAmountVariance: null,
        priceOffsetVariance: null,
        publishedCycles: 0,
        completedCycles: 0,
        tradedQuoteVolume: null,
        realizedPnlQuote: null,
      },
      spread: { bid: '0.001', ask: '0.001', absolute: '0.002' },
      inventoryBalances: [],
      balanceCacheStatus: [
        {
          accountLabel: 'maker',
          asset: 'BTC',
          source: 'user_stream',
          freshnessTimestamp: secondsAgo(3),
          stale: false,
        },
        {
          accountLabel: 'taker',
          asset: 'USDT',
          source: 'user_stream',
          freshnessTimestamp: secondsAgo(3),
          stale: false,
        },
      ],
      streamHealth: [
        {
          accountLabel: 'maker',
          state: 'live',
          order: true,
          trade: true,
          balance: true,
          lastEventAt: secondsAgo(3),
          lastBalanceRefreshAt: secondsAgo(3),
        },
        {
          accountLabel: 'taker',
          state: 'live',
          order: true,
          trade: true,
          balance: true,
          lastEventAt: secondsAgo(4),
          lastBalanceRefreshAt: secondsAgo(4),
        },
      ],
      userStreamRuntime: {
        activeWatcherCount: 1,
        queueDepth: 0,
        duplicateFillSuppressionCount: 0,
      },
      userStreamCapabilities: [
        {
          accountLabel: 'maker',
          watchOrders: true,
          watchTrades: true,
          watchBalance: true,
        },
        {
          accountLabel: 'taker',
          watchOrders: true,
          watchTrades: true,
          watchBalance: true,
        },
      ],
      stale: false,
    });

    await page.route(`${BACKEND_ORIGIN}/grow/info`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          exchanges: [{ exchange_id: 'binance', name: 'binance', enable: true }],
          simply_grow: { tokens: [] },
          arbitrage: { pairs: [] },
          market_making: {
            exchanges: [{ exchange_id: 'binance', name: 'binance', enable: true }],
            pairs: [{ exchange_id: 'binance', symbol: 'BTC/USDT', min_order_amount: '0.01' }],
          },
        }),
      });
    });
    await page.route(`${BACKEND_ORIGIN}/admin/exchanges/keys`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            key_id: 'ready-maker-key',
            exchange: 'binance',
            name: 'Ready maker key',
            state: 'active',
            validation_status: 'succeeded',
            permissions: ['read', 'trade'],
          },
          {
            key_id: 'ready-taker-key',
            exchange: 'binance',
            name: 'Ready taker key',
            state: 'active',
            validation_status: 'succeeded',
            permissions: ['read', 'trade'],
          },
        ]),
      });
    });
    await page.route(`${BACKEND_ORIGIN}/admin/market-making/direct-strategies`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'dual-mm',
            key: 'dual-mm',
            name: 'Dual MM',
            controllerType: 'dualAccountVolume',
            directExecutionMode: 'dual_account',
            defaultConfig: {},
            configSchema: {},
          },
        ]),
      });
    });
    await page.route(`${BACKEND_ORIGIN}/admin/market-making/direct-orders`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([order]) });
    });
    await page.route(`${BACKEND_ORIGIN}/admin/market-making/campaigns`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route(`${BACKEND_ORIGIN}/admin/market-making/wallet-status`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: true, address: '0x0000000000000000000000000000000000000000' }) });
    });

    let statusRequests = 0;
    await page.route(`${BACKEND_ORIGIN}/admin/market-making/direct-orders/order-state-handling/status`, async (route) => {
      statusRequests += 1;
      if (statusRequests === 1) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(statusBody('running')) });
        return;
      }
      if (statusRequests === 2) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'forced diagnosis failure' }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(statusBody('stopped')) });
    });

    await page.goto('/setup');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/first-time admin setup guide/i);
    await Promise.all([
      page.waitForURL('**/trading/direct-market-making'),
      page.getByRole('link', { name: /direct diagnostics/i }).click(),
    ]);
    await page.waitForLoadState('networkidle');

    const stopAllButton = page.getByRole('button', { name: /^stop all$/i });
    await expect(stopAllButton).toBeEnabled();
    await stopAllButton.click();
    await expect(page.locator('.modal-open')).toContainText(/confirm stop all orders/i);
    await page.locator('.modal-open').getByRole('button', { name: /cancel/i }).click();
    await expect(page.locator('.modal-open')).toHaveCount(0);

    const diagnosisButton = page.getByRole('button', { name: /open diagnosis details for BTC\/USDT on binance/i });
    await diagnosisButton.focus();
    await expect(diagnosisButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.locator('[data-testid="direct-mm-detail-loading"]')).toBeVisible();
    await expect(page.locator('.modal-open')).toContainText('maker linkage');
    await expect(page.locator('.modal-open')).toContainText('taker linkage');
    await expect(page.locator('.modal-open')).toContainText(/running/i);
    await expect(page.locator('[data-testid="direct-mm-ops-diagnosis-summary"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="direct-mm-diagnostic-evidence"]')).toHaveCount(0);
    await expect(page.locator('.modal-open').getByRole('button', { name: /stop order/i })).toBeVisible();

    await page.locator('.modal-open').getByRole('button', { name: /refresh order diagnosis/i }).click();
    await expect(page.locator('[data-testid="direct-mm-detail-error"]')).toBeVisible();
    await expect(page.locator('.modal-open')).toContainText('forced diagnosis failure');
    await expect(page.locator('.modal-open')).not.toContainText('executor health');

    await page.locator('.modal-open').getByRole('button', { name: /retry diagnosis/i }).click();
    await expect(page.locator('.modal-open')).toContainText(/stopped/i);
    await expect(page.locator('[data-testid="direct-mm-ops-diagnosis-summary"]')).toHaveCount(0);
    await expect(page.locator('.modal-open').getByRole('button', { name: /resume order/i })).toBeVisible();
    await expect(page.locator('.modal-open').getByRole('button', { name: /stop order/i })).toHaveCount(0);
  });

  test('direct market-making order detail omits diagnosis evidence sections', async ({ page }) => {
    await login(page);

    const nowMs = Date.now();
    const secondsAgo = (seconds: number) => new Date(nowMs - seconds * 1000).toISOString();
    const order = {
      orderId: 'order-conservative-evidence',
      exchangeName: 'binance',
      pair: 'RISK/USDT',
      state: 'running',
      runtimeState: 'running',
      strategyDefinitionId: 'pure-mm',
      strategyName: 'Pure MM',
      controllerType: 'pureMarketMaking',
      directExecutionMode: 'single_account',
      createdAt: secondsAgo(120),
      lastTickAt: secondsAgo(5),
      accountLabel: 'main',
      makerAccountLabel: '',
      takerAccountLabel: '',
      apiKeyId: 'ready-key',
      makerApiKeyId: null,
      takerApiKeyId: null,
      warnings: [],
    };
    const status = {
      ...order,
      executorHealth: 'active',
      lastUpdatedAt: secondsAgo(3),
      privateStreamEventAt: secondsAgo(3),
      orderConfig: {
        orderAmount: '0.01',
        bidSpread: '0.001',
        askSpread: '0.001',
        numberOfLayers: '1',
        baseIntervalTime: 30,
        numTrades: 100,
        baseIncrementPercentage: null,
        pricePushRate: null,
        postOnlySide: 'buy',
        dynamicRoleSwitching: false,
        targetQuoteVolume: null,
        cadenceVariance: null,
        tradeAmountVariance: null,
        priceOffsetVariance: null,
        publishedCycles: 0,
        completedCycles: 0,
        tradedQuoteVolume: null,
        realizedPnlQuote: null,
      },
      spread: { bid: '0.001', ask: '0.001', absolute: '0.002' },
      inventoryBalances: [],
      balanceCacheStatus: [
        {
          accountLabel: 'main',
          asset: 'USDT',
          source: 'user_stream',
          freshnessTimestamp: secondsAgo(3),
          stale: false,
        },
      ],
      streamHealth: [
        {
          accountLabel: 'maker',
          state: 'degraded',
          order: true,
          trade: true,
          balance: true,
          lastEventAt: secondsAgo(3),
          lastBalanceRefreshAt: secondsAgo(3),
        },
        {
          accountLabel: 'taker',
          state: 'reconnecting',
          order: true,
          trade: true,
          balance: true,
          lastEventAt: secondsAgo(4),
          lastBalanceRefreshAt: secondsAgo(4),
        },
        {
          accountLabel: 'backup',
          state: 'silent',
          order: true,
          trade: false,
          balance: true,
          lastEventAt: secondsAgo(90),
          lastBalanceRefreshAt: secondsAgo(90),
        },
        {
          accountLabel: 'observer',
          state: 'unknown',
          order: null,
          trade: null,
          balance: null,
          lastEventAt: null,
          lastBalanceRefreshAt: null,
        },
      ],
      userStreamRuntime: {
        activeWatcherCount: 1,
        queueDepth: 0,
        duplicateFillSuppressionCount: 0,
      },
      userStreamCapabilities: [],
      stale: false,
    };

    await page.route(`${BACKEND_ORIGIN}/grow/info`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          exchanges: [{ exchange_id: 'binance', name: 'binance', enable: true }],
          simply_grow: { tokens: [] },
          arbitrage: { pairs: [] },
          market_making: {
            exchanges: [{ exchange_id: 'binance', name: 'binance', enable: true }],
            pairs: [{ exchange_id: 'binance', symbol: 'RISK/USDT', min_order_amount: '0.01' }],
          },
        }),
      });
    });
    await page.route(`${BACKEND_ORIGIN}/admin/exchanges/keys`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            key_id: 'ready-key',
            exchange: 'binance',
            name: 'Ready key',
            state: 'active',
            validation_status: 'succeeded',
            permissions: ['read', 'trade'],
          },
        ]),
      });
    });
    await page.route(`${BACKEND_ORIGIN}/admin/market-making/direct-strategies`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'pure-mm',
            key: 'pure-mm',
            name: 'Pure MM',
            controllerType: 'pureMarketMaking',
            directExecutionMode: 'single_account',
            defaultConfig: {},
            configSchema: {},
          },
        ]),
      });
    });
    await page.route(`${BACKEND_ORIGIN}/admin/market-making/direct-orders`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([order]) });
    });
    await page.route(`${BACKEND_ORIGIN}/admin/market-making/direct-orders/order-conservative-evidence/status`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(status) });
    });
    await page.route(`${BACKEND_ORIGIN}/admin/market-making/campaigns`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route(`${BACKEND_ORIGIN}/admin/market-making/wallet-status`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ configured: true, address: '0x0000000000000000000000000000000000000000' }),
      });
    });

    await page.goto('/trading/direct-market-making');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /open diagnosis details for RISK\/USDT on binance/i }).click();

    const modal = page.locator('.modal-open');
    const summary = page.locator('[data-testid="direct-mm-ops-diagnosis-summary"]');
    const evidence = page.locator('[data-testid="direct-mm-diagnostic-evidence"]');
    await expect(modal).toContainText(/general status/i);
    await expect(modal).toContainText(/exchange and API key readiness/i);
    await expect(summary).toHaveCount(0);
    await expect(evidence).toHaveCount(0);
    await expect(modal).not.toContainText('Operational risk detected');
    await expect(modal).not.toContainText('diagnosis evidence');
    await expect(modal).not.toContainText('partial diagnostics');
  });

  test('direct market-making gates actions by backend-supported persisted lifecycle state', async ({ page }) => {
    await login(page);

    const now = new Date().toISOString();
    const orders = [
      {
        orderId: 'order-stale-running',
        exchangeName: 'binance',
        pair: 'STALE/USDT',
        state: 'running',
        runtimeState: 'stale',
        strategyDefinitionId: 'pure-mm',
        strategyName: 'Pure MM',
        controllerType: 'pureMarketMaking',
        directExecutionMode: 'single_account',
        createdAt: now,
        lastTickAt: now,
        accountLabel: 'main',
        makerAccountLabel: '',
        takerAccountLabel: '',
        apiKeyId: 'ready-key',
        makerApiKeyId: null,
        takerApiKeyId: null,
        warnings: ['executor_stale'],
      },
      {
        orderId: 'order-created',
        exchangeName: 'binance',
        pair: 'CREATED/USDT',
        state: 'created',
        runtimeState: 'created',
        strategyDefinitionId: 'pure-mm',
        strategyName: 'Pure MM',
        controllerType: 'pureMarketMaking',
        directExecutionMode: 'single_account',
        createdAt: now,
        lastTickAt: null,
        accountLabel: 'main',
        makerAccountLabel: '',
        takerAccountLabel: '',
        apiKeyId: 'ready-key',
        makerApiKeyId: null,
        takerApiKeyId: null,
        warnings: [],
      },
      {
        orderId: 'order-stopped',
        exchangeName: 'binance',
        pair: 'STOPPED/USDT',
        state: 'stopped',
        runtimeState: 'stopped',
        strategyDefinitionId: 'pure-mm',
        strategyName: 'Pure MM',
        controllerType: 'pureMarketMaking',
        directExecutionMode: 'single_account',
        createdAt: now,
        lastTickAt: null,
        accountLabel: 'main',
        makerAccountLabel: '',
        takerAccountLabel: '',
        apiKeyId: 'ready-key',
        makerApiKeyId: null,
        takerApiKeyId: null,
        warnings: [],
      },
      {
        orderId: 'order-failed',
        exchangeName: 'binance',
        pair: 'FAILED/USDT',
        state: 'failed',
        runtimeState: 'failed',
        strategyDefinitionId: 'pure-mm',
        strategyName: 'Pure MM',
        controllerType: 'pureMarketMaking',
        directExecutionMode: 'single_account',
        createdAt: now,
        lastTickAt: null,
        accountLabel: 'main',
        makerAccountLabel: '',
        takerAccountLabel: '',
        apiKeyId: 'ready-key',
        makerApiKeyId: null,
        takerApiKeyId: null,
        warnings: ['execution_blocked'],
      },
    ];
    const statusBody = (order: (typeof orders)[number]) => ({
      ...order,
      executorHealth: order.runtimeState === 'stale' ? 'stale' : 'active',
      lastUpdatedAt: now,
      privateStreamEventAt: order.runtimeState === 'running' ? now : null,
      openOrders: [],
      intents: [],
      recentErrors:
        order.runtimeState === 'failed'
          ? [{ ts: now, message: 'forced failed order evidence' }]
          : [],
      orderConfig: {
        orderAmount: '0.01',
        bidSpread: '0.001',
        askSpread: '0.001',
        numberOfLayers: '1',
        baseIntervalTime: 30,
        numTrades: 100,
        baseIncrementPercentage: null,
        pricePushRate: null,
        postOnlySide: 'buy',
        dynamicRoleSwitching: false,
        targetQuoteVolume: null,
        cadenceVariance: null,
        tradeAmountVariance: null,
        priceOffsetVariance: null,
        publishedCycles: 0,
        completedCycles: 0,
        tradedQuoteVolume: null,
        realizedPnlQuote: null,
      },
      spread: null,
      inventoryBalances: [],
      balanceCacheStatus: [],
      streamHealth: [],
      userStreamRuntime: {
        activeWatcherCount: 0,
        queueDepth: 0,
        duplicateFillSuppressionCount: 0,
      },
      userStreamCapabilities: [],
      stale: order.runtimeState === 'stale',
    });

    await page.route(`${BACKEND_ORIGIN}/grow/info`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          exchanges: [{ exchange_id: 'binance', name: 'binance', enable: true }],
          simply_grow: { tokens: [] },
          arbitrage: { pairs: [] },
          market_making: {
            exchanges: [{ exchange_id: 'binance', name: 'binance', enable: true }],
            pairs: orders.map((order) => ({
              exchange_id: 'binance',
              symbol: order.pair,
              min_order_amount: '0.01',
            })),
          },
        }),
      });
    });
    await page.route(`${BACKEND_ORIGIN}/admin/exchanges/keys`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            key_id: 'ready-key',
            exchange: 'binance',
            name: 'Ready key',
            state: 'active',
            validation_status: 'succeeded',
            permissions: ['read', 'trade'],
          },
        ]),
      });
    });
    await page.route(`${BACKEND_ORIGIN}/admin/market-making/direct-strategies`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'pure-mm',
            key: 'pure-mm',
            name: 'Pure MM',
            controllerType: 'pureMarketMaking',
            directExecutionMode: 'single_account',
            defaultConfig: {},
            configSchema: {},
          },
        ]),
      });
    });
    await page.route(`${BACKEND_ORIGIN}/admin/market-making/direct-orders`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(orders) });
    });
    await page.route(`${BACKEND_ORIGIN}/admin/market-making/direct-orders/*/status`, async (route) => {
      const orderId = new URL(route.request().url()).pathname.split('/').at(-2);
      const order = orders.find((item) => item.orderId === orderId);
      await route.fulfill({
        status: order ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(order ? statusBody(order) : { message: 'order not found' }),
      });
    });
    await page.route(`${BACKEND_ORIGIN}/admin/market-making/campaigns`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route(`${BACKEND_ORIGIN}/admin/market-making/wallet-status`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ configured: true, address: '0x0000000000000000000000000000000000000000' }),
      });
    });

    await page.goto('/trading/direct-market-making');
    await page.waitForLoadState('networkidle');

    const staleRow = page.getByRole('row').filter({ hasText: 'STALE/USDT' });
    await expect(staleRow.getByRole('button', { name: /^stop$/i })).toBeVisible();
    await expect(staleRow.getByRole('button', { name: /^remove$/i })).toHaveCount(0);
    await expect(staleRow.getByRole('button', { name: /^play$/i })).toHaveCount(0);

    const createdRow = page.getByRole('row').filter({ hasText: 'CREATED/USDT' });
    await expect(createdRow.getByRole('button', { name: /^stop$/i })).toBeVisible();
    await expect(createdRow.getByRole('button', { name: /^remove$/i })).toHaveCount(0);
    await expect(createdRow.getByRole('button', { name: /^play$/i })).toHaveCount(0);

    const stoppedRow = page.getByRole('row').filter({ hasText: 'STOPPED/USDT' });
    await expect(stoppedRow.getByRole('button', { name: /^play$/i })).toBeVisible();
    await expect(stoppedRow.getByRole('button', { name: /^remove$/i })).toBeVisible();

    const failedRow = page.getByRole('row').filter({ hasText: 'FAILED/USDT' });
    await expect(failedRow.getByRole('button', { name: /^remove$/i })).toBeVisible();
    await expect(failedRow.getByRole('button', { name: /^play$/i })).toHaveCount(0);

    await page.getByRole('button', { name: /open diagnosis details for STALE\/USDT on binance/i }).click();
    await expect(page.locator('.modal-open')).toContainText(/stale/i);
    await expect(page.locator('[data-testid="direct-mm-ops-diagnosis-summary"]')).toHaveCount(0);
    await expect(page.locator('.modal-open').getByRole('button', { name: /stop order/i })).toBeVisible();
    await expect(page.locator('.modal-open').getByRole('button', { name: /^remove$/i })).toHaveCount(0);
    await expect(page.locator('.modal-open').getByRole('button', { name: /resume order/i })).toHaveCount(0);
    await expect(page.locator('.modal-open').getByRole('button', { name: /refresh order diagnosis/i })).toBeVisible();
    await page.locator('.modal-open').getByLabel(/close/i).click();

    await page.getByRole('button', { name: /open diagnosis details for CREATED\/USDT on binance/i }).click();
    await expect(page.locator('.modal-open')).toContainText(/created/i);
    await expect(page.locator('[data-testid="direct-mm-ops-diagnosis-summary"]')).toHaveCount(0);
    await expect(page.locator('.modal-open').getByRole('button', { name: /stop order/i })).toBeVisible();
    await expect(page.locator('.modal-open').getByRole('button', { name: /^remove$/i })).toHaveCount(0);
    await expect(page.locator('.modal-open').getByRole('button', { name: /resume order/i })).toHaveCount(0);
    await page.locator('.modal-open').getByLabel(/close/i).click();

    await page.getByRole('button', { name: /open diagnosis details for STOPPED\/USDT on binance/i }).click();
    await expect(page.locator('.modal-open')).toContainText(/stopped/i);
    await expect(page.locator('[data-testid="direct-mm-ops-diagnosis-summary"]')).toHaveCount(0);
    await expect(page.locator('.modal-open').getByRole('button', { name: /resume order/i })).toBeVisible();
    await expect(page.locator('.modal-open').getByRole('button', { name: /^remove$/i })).toBeVisible();
  });

  test('direct market-making order list failures show an error instead of the empty state', async ({ page }) => {
    await login(page);

    await page.route(`${BACKEND_ORIGIN}/admin/market-making/direct-orders`, async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'forced direct order list failure' }),
      });
    });

    await page.goto('/trading/direct-market-making');
    await expect(page.locator('[data-testid="direct-mm-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="direct-mm-error"]')).toContainText('forced direct order list failure');
    await expect(page.locator('body')).not.toContainText('No active orders yet');
  });

  test('direct market-making sidebar navigation shows contextual loading while orders are delayed', async ({ page }) => {
    await login(page);

    await page.goto('/setup');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/first-time admin setup guide/i);

    await page.route(`${BACKEND_ORIGIN}/grow/info`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          exchanges: [{ exchange_id: 'binance', name: 'binance', enable: true }],
          simply_grow: { tokens: [] },
          arbitrage: { pairs: [] },
          market_making: {
            exchanges: [{ exchange_id: 'binance', name: 'binance', enable: true }],
            pairs: [{ exchange_id: 'binance', symbol: 'BTC/USDT', min_order_amount: '0.01' }],
          },
        }),
      });
    });
    await page.route(`${BACKEND_ORIGIN}/admin/exchanges/keys`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            key_id: 'ready-key',
            exchange: 'binance',
            name: 'Ready key',
            state: 'active',
            validation_status: 'succeeded',
            permissions: ['read', 'trade'],
          },
        ]),
      });
    });
    await page.route(`${BACKEND_ORIGIN}/admin/market-making/direct-strategies`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'pure-mm',
            key: 'pure-mm',
            name: 'Pure MM',
            controllerType: 'pureMarketMaking',
            directExecutionMode: 'single_account',
            defaultConfig: {},
            configSchema: {},
          },
        ]),
      });
    });
    await page.route(`${BACKEND_ORIGIN}/admin/market-making/campaigns`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route(`${BACKEND_ORIGIN}/admin/market-making/wallet-status`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ configured: true, address: '0x0000000000000000000000000000000000000000' }),
      });
    });

    let releaseDirectOrders!: () => void;
    const delayedDirectOrders = new Promise<void>((resolve) => {
      releaseDirectOrders = resolve;
    });
    await page.route(`${BACKEND_ORIGIN}/admin/market-making/direct-orders`, async (route) => {
      await delayedDirectOrders;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            orderId: 'order-delayed-sidebar-loading',
            exchangeName: 'binance',
            pair: 'BTC/USDT',
            state: 'running',
            runtimeState: 'running',
            strategyDefinitionId: 'pure-mm',
            strategyName: 'Pure MM',
            controllerType: 'pureMarketMaking',
            directExecutionMode: 'single_account',
            createdAt: '2026-05-23T00:00:00.000Z',
            lastTickAt: '2026-05-23T00:01:00.000Z',
            accountLabel: 'main',
            makerAccountLabel: '',
            takerAccountLabel: '',
            apiKeyId: 'ready-key',
            makerApiKeyId: null,
            takerApiKeyId: null,
            warnings: [],
          },
        ]),
      });
    });

    await page.getByTestId('old-admin-sidebar').getByRole('button', { name: /direct market making/i }).click();

    await expect(page).toHaveURL(/\/trading\/direct-market-making$/);
    await expect(page.getByTestId('direct-mm-loading')).toBeVisible();
    await expect(page.getByTestId('direct-mm-loading')).toContainText(/direct market-making/i);
    await expect(page.locator('body')).not.toContainText(/first-time admin setup guide/i);
    await expect(page.locator('body')).not.toContainText('No active orders yet');

    releaseDirectOrders();
    await expect(page.getByTestId('direct-mm-loading')).not.toBeVisible();
    await expect(page.getByRole('button', { name: /open diagnosis details for BTC\/USDT on binance/i })).toBeVisible();
  });

  test('real-data pages show API errors instead of static fixture fallbacks', async ({ page }) => {
    await login(page);

    for (const route of realDataRoutes) {
      const urlPattern = `**${route.endpoint}**`;
      await page.route(urlPattern, async (interceptedRoute) => {
        await interceptedRoute.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: `e2e forced ${route.label} failure` }),
        });
      });

      await page.goto(route.path);
      await expect(page.locator(`${route.selector} [data-testid$="-error"]`)).toBeVisible();
      await expect(page.locator(route.selector)).toContainText(`e2e forced ${route.label} failure`);
      await expect(page.locator(route.selector)).not.toContainText(/fixture|mock/i);

      await page.unroute(urlPattern);
    }
  });

  test('dashboard keeps a newer selected range when the initial response finishes last', async ({ page }) => {
    let delayedInitialReturned = false;

    await page.route(
      (url) =>
        url.href.startsWith(`${BACKEND_ORIGIN}/admin/dashboard/summary`) &&
        url.searchParams.get('range') === '24h',
      async (interceptedRoute) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        delayedInitialReturned = true;
        await interceptedRoute.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(dashboardSummary('24h', '24')),
        });
      },
    );

    await page.route(
      (url) =>
        url.href.startsWith(`${BACKEND_ORIGIN}/admin/dashboard/summary`) &&
        url.searchParams.get('range') === '7d',
      async (interceptedRoute) => {
        await interceptedRoute.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(dashboardSummary('7d', '7')),
        });
      },
    );

    await login(page);
    await page.getByRole('button', { name: '7d' }).click();

    await expect(page.locator('[data-testid="dashboard-range-key"]')).toHaveText('7d');
    await expect(page.getByRole('button', { name: '7d' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => delayedInitialReturned).toBe(true);
    await expect(page.locator('[data-testid="dashboard-range-key"]')).toHaveText('7d');
    await expect(page.getByRole('button', { name: '24h' })).toHaveAttribute('aria-pressed', 'false');
  });
});
