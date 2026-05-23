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

const login = async (page: Page) => {
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

  test('direct market-making API key remediation stays in the admin shell', async ({ page, context }) => {
    await login(page);
    await page.goto('/trading/direct-market-making');
    await page.waitForLoadState('networkidle');

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
