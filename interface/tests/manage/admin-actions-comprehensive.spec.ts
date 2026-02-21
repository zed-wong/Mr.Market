import { expect, test, type Page } from "@playwright/test";

type MockState = {
  exchanges: {
    exchange_id: string;
    name: string;
    icon_url?: string;
    enable: boolean;
  }[];
  apiKeys: {
    key_id: string;
    exchange: string;
    name: string;
    api_key: string;
    state: string;
    last_update: string;
  }[];
  globalFee: {
    spot_fee: string;
    enable_spot_fee: boolean;
    market_making_fee: string;
    enable_market_making_fee: boolean;
  };
  feeOverrides: {
    type: "spot" | "market_making";
    symbol: string;
    custom_fee_rate: string;
  }[];
  updateExchangeCalls: number;
  updateGlobalFeeCalls: number;
  updateGlobalFeePayload: Record<string, unknown> | null;
};

function createMockState(): MockState {
  return {
    exchanges: [
      {
        exchange_id: "binance",
        name: "Binance",
        icon_url: "https://example.com/binance.png",
        enable: true,
      },
    ],
    apiKeys: [
      {
        key_id: "key-binance-1",
        exchange: "binance",
        name: "Binance Main",
        api_key: "binance-main-key-123456",
        state: "alive",
        last_update: "2026-02-20",
      },
    ],
    globalFee: {
      spot_fee: "0.001",
      enable_spot_fee: true,
      market_making_fee: "0.002",
      enable_market_making_fee: true,
    },
    feeOverrides: [
      {
        type: "spot",
        symbol: "BTC/USDT",
        custom_fee_rate: "0.0015",
      },
      {
        type: "market_making",
        symbol: "ETH/USDT",
        custom_fee_rate: "0.0009",
      },
    ],
    updateExchangeCalls: 0,
    updateGlobalFeeCalls: 0,
    updateGlobalFeePayload: null,
  };
}

async function setupAdminMocks(page: Page, state: MockState) {
  await page.route("**/auth/login", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ access_token: "test-admin-token" }),
    });
  });

  await page.route("**/grow/info", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        exchanges: state.exchanges,
        simply_grow: { tokens: [] },
        arbitrage: { pairs: [] },
        market_making: { pairs: [], exchanges: state.exchanges },
      }),
    });
  });

  await page.route("**/spot/info", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ trading_pairs: [] }),
    });
  });

  await page.route("**/admin/grow/exchange/supported", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(state.exchanges.map((item) => item.exchange_id)),
    });
  });

  await page.route("**/admin/grow/exchange/ccxt-supported", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(["binance", "kraken", "okx", "bybit"]),
    });
  });

  await page.route("**/admin/grow/exchange/details/*", async (route) => {
    const exchangeId = route.request().url().split("/").pop() || "exchange";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        urls: { logo: `https://example.com/${exchangeId}.png` },
      }),
    });
  });

  await page.route("**/admin/grow/exchange/add", async (route) => {
    const payload = JSON.parse(route.request().postData() || "{}");
    state.exchanges.push({
      exchange_id: String(payload.exchange_id || "new"),
      name: String(payload.name || payload.exchange_id || "New"),
      icon_url: String(payload.icon_url || ""),
      enable: true,
    });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.route("**/admin/grow/exchange/update/*", async (route) => {
    const exchangeId = route.request().url().split("/").pop() || "";
    const payload = JSON.parse(route.request().postData() || "{}");
    state.exchanges = state.exchanges.map((item) =>
      item.exchange_id === exchangeId
        ? {
            ...item,
            name: String(payload.name ?? item.name),
            icon_url: String(payload.icon_url ?? item.icon_url ?? ""),
            enable: Boolean(payload.enable ?? item.enable),
          }
        : item,
    );
    state.updateExchangeCalls += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.route("**/admin/grow/exchange/remove/*", async (route) => {
    const exchangeId = route.request().url().split("/").pop() || "";
    state.exchanges = state.exchanges.filter((item) => item.exchange_id !== exchangeId);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.route("**/admin/exchanges/key-pair", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ publicKey: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=" }),
    });
  });

  await page.route("**/admin/exchanges/keys", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(state.apiKeys) });
      return;
    }

    if (route.request().method() === "POST") {
      const payload = JSON.parse(route.request().postData() || "{}");
      const apiKey = String(payload.api_key || "key-value-123456");
      state.apiKeys.push({
        key_id: `key-${Date.now()}`,
        exchange: String(payload.exchange || "kraken"),
        name: String(payload.name || "New Key"),
        api_key: apiKey,
        state: "alive",
        last_update: "2026-02-21",
      });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }

    await route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ error: "method not allowed" }) });
  });

  await page.route("**/admin/exchanges/keys/*", async (route) => {
    const keyId = route.request().url().split("/").pop() || "";
    state.apiKeys = state.apiKeys.filter((item) => item.key_id !== keyId);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.route("**/admin/fee/global", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(state.globalFee) });
      return;
    }

    if (route.request().method() === "POST") {
      const payload = JSON.parse(route.request().postData() || "{}");
      state.globalFee = {
        ...state.globalFee,
        ...payload,
      };
      state.updateGlobalFeeCalls += 1;
      state.updateGlobalFeePayload = payload;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }

    await route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ error: "method not allowed" }) });
  });

  await page.route("**/admin/fee/overrides", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(state.feeOverrides),
    });
  });
}

async function openAdminPage(page: Page, path: string) {
  await page.addInitScript(() => {
    localStorage.setItem("admin-password", "password");
    localStorage.setItem("admin-access-token", "test-admin-token");
  });

  await page.goto(path);

  const loginHeading = page.getByRole("heading", { name: /login/i });
  await expect
    .poll(async () => {
      const loginVisible = await loginHeading.isVisible().catch(() => false);
      const currentUrl = page.url();
      return loginVisible || currentUrl.includes("/manage/");
    }, { timeout: 10000 })
    .toBeTruthy();

  if (await loginHeading.isVisible().catch(() => false)) {
    await page.locator('input[type="password"]').fill("password");
    await page.getByRole("button", { name: /^login$/i }).click();
    await page.waitForURL(/\/manage\//, { timeout: 10000 });
    await page.goto(path);
  }
}

test.describe("admin settings actions", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
    const state = createMockState();
    await setupAdminMocks(page, state);
  });

  test("settings cards navigate to each admin section", async ({ page }) => {
    await openAdminPage(page, "/manage/settings");

    const settingsCards = page.locator(".grid button.card");

    await settingsCards.filter({ hasText: /exchanges/i }).first().click();
    await expect(page).toHaveURL(/\/manage\/settings\/exchanges/);

    await page.goto("/manage/settings");
    await settingsCards.filter({ hasText: /spot/i }).first().click();
    await expect(page).toHaveURL(/\/manage\/settings\/spot-trading/);

    await page.goto("/manage/settings");
    await settingsCards.filter({ hasText: /market making/i }).first().click();
    await expect(page).toHaveURL(/\/manage\/settings\/market-making/);

    await page.goto("/manage/settings");
    await settingsCards.filter({ hasText: /fees/i }).first().click();
    await expect(page).toHaveURL(/\/manage\/settings\/fees/);

    await page.goto("/manage/settings");
    await settingsCards.filter({ hasText: /api keys/i }).first().click();
    await expect(page).toHaveURL(/\/manage\/settings\/api-keys/);
  });

  test("exchanges page supports add, toggle, and delete actions", async ({ page }) => {
    await openAdminPage(page, "/manage/settings/exchanges");

    await page.getByRole("button", { name: /add exchange/i }).first().click();

    const dialog = page.locator("dialog[open]");
    const exchangeIdInput = dialog.locator("input").first();
    await exchangeIdInput.fill("kraken");
    await dialog.getByRole("button", { name: /^kraken$/i }).click();

    await dialog.locator("input").nth(1).fill("Kraken");
    await dialog.getByRole("button", { name: /add exchange/i }).click();

    await expect(page.locator("tr", { hasText: "kraken" })).toBeVisible({ timeout: 10000 });

    const krakenRow = page.locator("tr", { hasText: "kraken" });
    await krakenRow.locator("button").first().click();

    await expect
      .poll(async () => (await page.locator("tr", { hasText: "kraken" }).count()) > 0)
      .toBeTruthy();

    page.once("dialog", (dialogEvent) => dialogEvent.accept());
    await krakenRow.locator("button").nth(1).click();
    await expect(page.locator("tr", { hasText: "kraken" })).toHaveCount(0, { timeout: 10000 });
  });

  test("api keys page supports add and delete key actions", async ({ page }) => {
    await openAdminPage(page, "/manage/settings/api-keys");

    await page.getByRole("button", { name: /add api key/i }).first().click();

    const dialog = page.locator("dialog[open]");
    await dialog.locator("input").first().fill("kraken");
    await dialog.getByRole("button", { name: /^kraken$/i }).click();
    await dialog.locator("input").nth(1).fill("Kraken Key");
    await dialog.locator("input").nth(2).fill("kraken-api-key-111111");
    await dialog.locator("input").nth(3).fill("kraken-secret");
    await dialog.getByRole("button", { name: /add api key/i }).click();

    const keyRow = page.locator("tr", { hasText: "Kraken Key" });
    await expect(keyRow).toBeVisible({ timeout: 10000 });

    await keyRow.locator("button").nth(1).click();
    await keyRow.getByRole("button", { name: /confirm/i }).click();

    await expect(page.locator("tr", { hasText: "Kraken Key" })).toHaveCount(0, { timeout: 10000 });
  });

  test("fees page supports save changes and manage override navigation", async ({ page }) => {
    await openAdminPage(page, "/manage/settings/fees");

    const spotFeeInput = page.locator("#spot-fee-input");
    await expect(spotFeeInput).toBeVisible();
    await spotFeeInput.fill("0.0033");

    await page.getByRole("button", { name: /save changes/i }).click();
    await page.locator("#confirm_modal").getByRole("button", { name: /confirm/i }).click();

    await expect
      .poll(async () => (await spotFeeInput.inputValue()) === "0.0033")
      .toBeTruthy();

    await page.getByRole("button", { name: /^manage$/i }).first().click();
    await expect(page).toHaveURL(/\/manage\/settings\/spot-trading|\/manage\/settings\/market-making/);
  });
});
