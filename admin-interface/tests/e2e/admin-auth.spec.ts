import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ADMIN_PASSWORD = 'test-admin-password';
const API_ORIGIN = 'http://127.0.0.1:3000';
const TOKEN_KEY = 'admin-access-token';

type ApiRequest = {
  url: string;
  method: string;
  hasBearer: boolean;
};

const installNetworkAssertions = (page: Page) => {
  const apiRequests: ApiRequest[] = [];
  const apiFailures: string[] = [];
  const pageErrors: string[] = [];
  const consoleMessages: string[] = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => consoleMessages.push(message.text()));
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(API_ORIGIN)) return;
    apiRequests.push({
      url,
      method: request.method(),
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

  return { apiRequests, apiFailures, pageErrors, consoleMessages };
};

const getTokenPresence = (page: Page) =>
  page.evaluate((key) => Boolean(localStorage.getItem(key)), TOKEN_KEY);

const getToken = (page: Page) =>
  page.evaluate((key) => localStorage.getItem(key), TOKEN_KEY);

const setToken = (page: Page, token: string) =>
  page.evaluate(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: TOKEN_KEY, value: token },
  );

const loginWithPassword = async (page: Page) => {
  const loginResponse = page.waitForResponse(
    (response) =>
      response.url() === `${API_ORIGIN}/auth/login` &&
      response.request().method() === 'POST',
  );
  await page.goto('/login');
  await expect(page.getByTestId('old-admin-login-layout')).toBeVisible();
  await expect(page.getByTestId('old-admin-market-depth')).toBeVisible();
  await expect(page.getByText(/market making engine/i).first()).toBeVisible();
  await expect(page.getByRole('tab', { name: /passkey/i })).toBeVisible();
  await page.getByLabel(/enter password/i).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /^login$/i }).click();
  expect([200, 201]).toContain((await loginResponse).status());
  await expect(page).toHaveURL('/');
  await expect(page.locator('aside[aria-label="Sidebar"]')).toBeVisible();
  await expect(page.getByTestId('old-admin-sidebar')).toBeVisible();
  await expect.poll(() => getTokenPresence(page)).toBe(true);
};

const expectUnauthenticated = async (page: Page) => {
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: /^login$/i })).toBeVisible();
  await expect.poll(() => getTokenPresence(page)).toBe(false);
};

const addVirtualAuthenticator = async (context: BrowserContext, page: Page) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'usb',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return {
    cdp,
    authenticatorId,
    credentials: async () =>
      cdp.send('WebAuthn.getCredentials', { authenticatorId }),
  };
};

test('admin auth E2E contains no backend stubs or fake backend port', async () => {
  const [spec, config] = await Promise.all([
    readFile(join(process.cwd(), 'tests/e2e/admin-auth.spec.ts'), 'utf8'),
    readFile(join(process.cwd(), 'playwright.config.ts'), 'utf8'),
  ]);

  expect(spec).not.toContain(`route.${'fulfill'}`);
  expect(config).not.toContain('59999');
  expect(config).toContain('http://localhost:4174');
  expect(config).toContain('http://127.0.0.1:3000');
});

test('protected routes redirect unauthenticated sessions to login', async ({ page }) => {
  for (const route of ['/', '/settings', '/orders/spot', '/market-making/direct', '/rebalance/new']) {
    await page.goto(route);
    await expectUnauthenticated(page);
    await expect(page.getByTestId('old-admin-login-layout')).toBeVisible();
  }
});

test('password login, session persistence, invalid token clearing, login redirect, and logout revocation use the real server', async ({
  page,
  context,
}) => {
  const network = installNetworkAssertions(page);

  await loginWithPassword(page);
  const token = await getToken(page);
  expect(token).toBeTruthy();

  const sessionResponse = await page.request.get(`${API_ORIGIN}/auth/session`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(sessionResponse.status()).toBe(200);

  await page.reload();
  await expect(page).toHaveURL('/');
  await expect(page.locator('aside[aria-label="Sidebar"]')).toBeVisible();
  await expect(page.getByTestId('old-admin-sidebar')).toBeVisible();
  await expect(page.locator('main')).toContainText(/dashboard overview/i);
  await expect(page.locator('body')).not.toContainText('/manage');
  expect(await page.evaluate(() => document.body.innerHTML.includes('/manage'))).toBe(false);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByTestId('old-admin-sidebar')).toBeVisible();
  await expect(page.getByRole('button', { name: /register passkey/i })).toBeVisible();
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.getByRole('button', { name: /toggle sidebar/i })).toBeVisible();
  await page.getByRole('button', { name: /toggle sidebar/i }).click();
  await expect(page.getByTestId('old-admin-sidebar')).toBeVisible();
  await expect(page.getByRole('button', { name: /logout/i })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByRole('button', { name: /logout/i })).toBeVisible();

  const storageState = await context.storageState();
  const freshContext = await context.browser()!.newContext({ storageState });
  const freshPage = await freshContext.newPage();
  await freshPage.goto('/settings');
  await expect(freshPage).toHaveURL('/settings');
  await expect(freshPage.locator('aside[aria-label="Sidebar"]')).toBeVisible();
  await freshContext.close();

  await page.goto('/login');
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('button', { name: /^login$/i })).toHaveCount(0);

  const logoutResponse = page.waitForResponse(
    (response) =>
      response.url() === `${API_ORIGIN}/auth/logout` &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: /logout/i }).click();
  await expect((await logoutResponse).status()).toBe(201);
  await expectUnauthenticated(page);

  await setToken(page, token!);
  await page.goto('/settings');
  await expectUnauthenticated(page);

  await page.evaluate(() => localStorage.setItem('admin-access-token', 'invalid-token'));
  await page.goto('/orders/spot');
  await expectUnauthenticated(page);

  expect(network.apiRequests.some((request) => request.url === `${API_ORIGIN}/auth/login`)).toBe(true);
  expect(network.apiRequests.some((request) => request.url === `${API_ORIGIN}/auth/session` && request.hasBearer)).toBe(true);
  expect(network.apiRequests.every((request) => request.url.startsWith(API_ORIGIN))).toBe(true);
  expect(network.pageErrors).toEqual([]);
  expect(network.consoleMessages.join('\n')).not.toContain(token);
});

test('invalid password remains unauthenticated', async ({ page }) => {
  const response = page.waitForResponse(
    (res) => res.url() === `${API_ORIGIN}/auth/login` && res.request().method() === 'POST',
  );
  await page.goto('/login');
  await page.getByLabel(/enter password/i).fill('not-the-password');
  await page.getByRole('button', { name: /^login$/i }).click();
  await expect((await response).status()).toBe(401);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect.poll(() => getTokenPresence(page)).toBe(false);

  await page.goto('/settings');
  await expectUnauthenticated(page);
});


test('passkey registration and login create a fresh valid session with localhost RP', async ({
  page,
  context,
}) => {
  const network = installNetworkAssertions(page);
  const authenticator = await addVirtualAuthenticator(context, page);

  await loginWithPassword(page);
  const passwordToken = await getToken(page);

  const registerOptions = page.waitForResponse(
    `${API_ORIGIN}/auth/passkeys/register/options`,
  );
  const registerVerify = page.waitForResponse(
    `${API_ORIGIN}/auth/passkeys/register/verify`,
  );
  await page.getByRole('button', { name: /register passkey/i }).click();
  await expect((await registerOptions).status()).toBe(201);
  await expect((await registerVerify).status()).toBe(201);
  await expect(page.getByRole('status')).toContainText(/passkey registered/i);
  expect((await authenticator.credentials()).credentials.length).toBeGreaterThan(0);

  await page.getByRole('button', { name: /logout/i }).click();
  await expectUnauthenticated(page);

  const loginOptions = page.waitForResponse(`${API_ORIGIN}/auth/passkeys/login/options`);
  const loginVerify = page.waitForResponse(`${API_ORIGIN}/auth/passkeys/login/verify`);
  await page.getByRole('tab', { name: /passkey/i }).click();
  await page.getByRole('button', { name: /login with passkey/i }).click();
  await expect((await loginOptions).status()).toBe(201);
  await expect((await loginVerify).status()).toBe(201);
  await expect(page).toHaveURL('/');
  await expect.poll(() => getTokenPresence(page)).toBe(true);
  const passkeyToken = await getToken(page);
  expect(passkeyToken).toBeTruthy();
  expect(passkeyToken).not.toBe(passwordToken);

  const sessionResponse = await page.request.get(`${API_ORIGIN}/auth/session`, {
    headers: { authorization: `Bearer ${passkeyToken}` },
  });
  expect(sessionResponse.status()).toBe(200);

  for (const route of ['/', '/settings', '/orders/spot']) {
    await page.goto(route);
    await expect(page).toHaveURL(route);
    await expect(page.locator('aside[aria-label="Sidebar"]')).toBeVisible();
    await expect(page.getByTestId('old-admin-sidebar')).toBeVisible();
  }

  expect(network.pageErrors).toEqual([]);
  expect(network.apiFailures).toEqual([]);
  expect(network.consoleMessages.join('\n')).not.toContain(passkeyToken);
});

test('passkey registration is blocked when unauthenticated', async ({ request }) => {
  const response = await request.post(`${API_ORIGIN}/auth/passkeys/register/options`);
  expect(response.status()).toBe(401);
});

test('passkey login without a credential fails gracefully', async ({ page, context }) => {
  const network = installNetworkAssertions(page);
  await addVirtualAuthenticator(context, page);

  await page.goto('/login');
  await expect(page.getByTestId('old-admin-login-layout')).toBeVisible();
  await page.getByRole('tab', { name: /passkey/i }).click();
  await page.getByRole('button', { name: /login with passkey/i }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect.poll(() => getTokenPresence(page)).toBe(false);
  expect(network.pageErrors).toEqual([]);
});

test('cancelled WebAuthn operations leave auth state unchanged', async ({ page }) => {
  await page.addInitScript(() => {
    const originalGet = navigator.credentials.get.bind(navigator.credentials);
    const originalCreate = navigator.credentials.create.bind(navigator.credentials);
    navigator.credentials.get = async () => {
      throw new DOMException('Operation cancelled', 'NotAllowedError');
    };
    navigator.credentials.create = async () => {
      throw new DOMException('Operation cancelled', 'NotAllowedError');
    };
    Object.assign(window, { __restoreCredentials: () => {
      navigator.credentials.get = originalGet;
      navigator.credentials.create = originalCreate;
    } });
  });

  await page.goto('/login');
  await page.getByRole('tab', { name: /passkey/i }).click();
  await page.getByRole('button', { name: /login with passkey/i }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect.poll(() => getTokenPresence(page)).toBe(false);

  await loginWithPassword(page);
  const tokenBeforeRegistrationCancel = await getToken(page);
  await page.getByRole('button', { name: /register passkey/i }).click();
  await expect(page.getByRole('status')).toContainText(/passkey registration failed/i);
  await expect.poll(() => getToken(page)).toBe(tokenBeforeRegistrationCancel);
});
