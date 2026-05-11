import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ADMIN_PASSWORD = 'test-admin-password';
const API_ORIGIN = 'http://127.0.0.1:3000';

const MIGRATED_ROUTES = [
  '/',
  '/users',
  '/exchanges',
  '/health',
  '/message',
  '/orders',
  '/orders/spot',
  '/orders/swap',
  '/revenue',
  '/market-making/direct',
  '/rebalance',
  '/rebalance/new',
  '/settings',
  '/settings/api-keys',
  '/settings/exchanges',
  '/settings/fees',
  '/settings/spot-trading',
  '/settings/market-making',
  '/settings/strategies',
];

const installRouteSweepAssertions = (page: Page) => {
  const pageErrors: string[] = [];
  const apiFailures: string[] = [];
  const apiRequests: Array<{ url: string; hasBearer: boolean }> = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(API_ORIGIN)) return;
    apiRequests.push({
      url,
      hasBearer: /^Bearer\s+.+/.test(request.headers().authorization ?? ''),
    });
  });
  page.on('response', (response) => {
    const url = response.url();
    if (!url.startsWith(API_ORIGIN)) return;
    if ([401, 403, 404].includes(response.status()) || response.status() >= 500) {
      apiFailures.push(`${response.status()} ${new URL(url).pathname}`);
    }
  });

  return { pageErrors, apiFailures, apiRequests };
};

const loginWithPassword = async (page: Page) => {
  const loginResponse = page.waitForResponse(
    (response) =>
      response.url() === `${API_ORIGIN}/auth/login` &&
      response.request().method() === 'POST',
  );
  await page.goto('/login');
  await page.getByLabel(/enter password/i).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /^login$/i }).click();
  expect([200, 201]).toContain((await loginResponse).status());
  await expect(page).toHaveURL('/');
  await expect(page.locator('aside[aria-label="Sidebar"]')).toBeVisible();
};

const expectRouteLoaded = async (page: Page, route: string) => {
  await expect(page).toHaveURL(route);
  await expect(page.locator('aside[aria-label="Sidebar"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /^login$/i })).toHaveCount(0);
  await expect(page.locator('.loading, .loading-spinner')).toHaveCount(0);
  await expect(page.locator('body'), `route ${route} should not render an error page`).not.toHaveText(
    /internal error|vite error|page not found/i,
  );
  await expect(page.locator('main')).not.toBeEmpty();
};

test('admin page E2E contains no backend stubs or fake backend port', async () => {
  const [spec, config] = await Promise.all([
    readFile(join(process.cwd(), 'tests/e2e/admin-pages-real.spec.ts'), 'utf8'),
    readFile(join(process.cwd(), 'playwright.config.ts'), 'utf8'),
  ]);

  expect(spec).not.toContain(`route.${'fulfill'}`);
  expect(config).not.toContain('59999');
  expect(config).toContain('http://localhost:4174');
  expect(config).toContain('http://127.0.0.1:3000');
});

test('all migrated routes load and hard refresh against the real local backend', async ({ page }) => {
  const network = installRouteSweepAssertions(page);

  await loginWithPassword(page);
  network.apiFailures.length = 0;

  for (const route of MIGRATED_ROUTES) {
    await page.goto(route);
    await expectRouteLoaded(page, route);
    const legacyTargets = await page.locator('a[href^="/manage"], a[href*="/manage/"]').evaluateAll(
      (elements) => elements.map((element) => (element as HTMLAnchorElement).href),
    );
    expect(legacyTargets).toEqual([]);

    await page.reload({ waitUntil: 'networkidle' });
    await expectRouteLoaded(page, route);
  }

  expect(network.pageErrors).toEqual([]);
  expect(network.apiFailures).toEqual([]);
  expect(network.apiRequests.length).toBeGreaterThan(0);
  expect(network.apiRequests.every((request) => request.url.startsWith(API_ORIGIN))).toBe(true);
  expect(network.apiRequests.filter((request) => !request.url.endsWith('/auth/login')).every((request) => request.hasBearer)).toBe(true);
  expect(network.apiRequests.map((request) => request.url)).not.toContain(
    `${API_ORIGIN}/rebalance/minimum_balance/exchanges`,
  );
});
