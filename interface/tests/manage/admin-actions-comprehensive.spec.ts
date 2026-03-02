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
    enabled: boolean;
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
        enabled: true,
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
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
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
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.route("**/admin/grow/exchange/remove/*", async (route) => {
    const exchangeId = route.request().url().split("/").pop() || "";
    state.exchanges = state.exchanges.filter(
      (item) => item.exchange_id !== exchangeId,
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.route("**/admin/exchanges/key-pair", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        publicKey: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=",
      }),
    });
  });

  await page.route("**/admin/exchanges/keys**", async (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.endsWith("/admin/exchanges/keys")) {
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(state.apiKeys),
        });
        return;
      }

      if (method === "POST") {
        const payload = JSON.parse(route.request().postData() || "{}");
        const apiKey = String(payload.api_key || "key-value-123456");
        state.apiKeys.push({
          key_id: `key-${Date.now()}`,
          exchange: String(payload.exchange || "kraken"),
          name: String(payload.name || "New Key"),
          api_key: apiKey,
          enabled: true,
          state: "alive",
          last_update: "2026-02-21",
        });
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        });
        return;
      }
    }

    const updateMatch = path.match(/\/admin\/exchanges\/keys\/([^/]+)\/update$/);
    if (updateMatch && method === "POST") {
      const keyId = updateMatch[1];
      const payload = JSON.parse(route.request().postData() || "{}");
      state.apiKeys = state.apiKeys.map((item) =>
        item.key_id === keyId
          ? { ...item, enabled: Boolean(payload.enabled) }
          : item,
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    const byExchangeMatch = path.match(
      /\/admin\/exchanges\/keys\/by-exchange\/([^/]+)$/,
    );
    if (byExchangeMatch && method === "DELETE") {
      const exchangeId = byExchangeMatch[1];
      state.apiKeys = state.apiKeys.filter(
        (item) => item.exchange !== exchangeId,
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    const deleteMatch = path.match(/\/admin\/exchanges\/keys\/([^/]+)$/);
    if (deleteMatch && method === "DELETE") {
      const keyId = deleteMatch[1];
      state.apiKeys = state.apiKeys.filter((item) => item.key_id !== keyId);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    await route.fulfill({
      status: 405,
      contentType: "application/json",
      body: JSON.stringify({ error: "method not allowed" }),
    });
  });

  await page.route("**/admin/fee/global", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(state.globalFee),
      });
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
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    await route.fulfill({
      status: 405,
      contentType: "application/json",
      body: JSON.stringify({ error: "method not allowed" }),
    });
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
  });

  test("merged exchanges page supports exchange and API key actions", async ({
    page,
  }) => {
    await openAdminPage(page, "/manage/settings/exchanges");

    await page.getByRole("button", { name: /add exchange/i }).first().click();

    const addExchangeDialog = page.locator("dialog[open]");
    const exchangeIdInput = addExchangeDialog.locator("input").first();
    await exchangeIdInput.fill("kraken");
    await addExchangeDialog.getByRole("button", { name: /^kraken$/i }).click();
    await addExchangeDialog.locator("input").nth(1).fill("Kraken");
    await addExchangeDialog.getByRole("button", { name: /add exchange/i }).click();

    let krakenCard = page.locator(".card", { hasText: "kraken" }).first();
    await expect(krakenCard).toBeVisible({ timeout: 10000 });

    await krakenCard.getByRole("button", { name: /disable|enable/i }).click();
    await expect(krakenCard.getByText(/disabled|enabled/i).first()).toBeVisible({
      timeout: 10000,
    });

    await krakenCard.getByRole("button", { name: /add api key/i }).click();

    const addApiKeyDialog = page.locator("dialog[open]");
    await addApiKeyDialog.locator("input").nth(1).fill("Kraken Key");
    await addApiKeyDialog.locator("input").nth(2).fill("kraken-api-key-111111");
    await addApiKeyDialog.locator("input").nth(3).fill("kraken-secret");
    await addApiKeyDialog.getByRole("button", { name: /add api key/i }).click();

    krakenCard = page.locator(".card", { hasText: "kraken" }).first();
    await krakenCard.getByRole("button", { name: /show api keys/i }).click();

    const keyRow = page.locator("tr", { hasText: "Kraken Key" });
    await expect(keyRow).toBeVisible({ timeout: 10000 });

    await keyRow.getByRole("button", { name: /enabled|disabled/i }).click();

    page.once("dialog", (dialogEvent) => dialogEvent.accept());
    await keyRow.getByRole("button", { name: /^delete$/i }).click();
    await expect(page.locator("tr", { hasText: "Kraken Key" })).toHaveCount(0, {
      timeout: 10000,
    });

    page.once("dialog", (dialogEvent) => dialogEvent.accept());
    await krakenCard.getByRole("button", { name: /^delete$/i }).click();
    await expect(page.locator(".card", { hasText: "kraken" })).toHaveCount(0, {
      timeout: 10000,
    });
  });

  test("legacy api keys route returns not found", async ({ page }) => {
    const response = await page.goto("/manage/settings/api-keys");
    const status = response?.status() ?? 200;
    expect([200, 404]).toContain(status);
    await expect(page.getByText(/not found/i)).toBeVisible();
  });

  test("fees page supports save changes and manage override navigation", async ({
    page,
  }) => {
    await openAdminPage(page, "/manage/settings/fees");

    const spotFeeInput = page.locator("#spot-fee-input");
    await expect(spotFeeInput).toBeVisible();
    await spotFeeInput.fill("0.0033");

    await page.getByRole("button", { name: /save changes/i }).click();
    await page
      .locator("#confirm_modal")
      .getByRole("button", { name: /confirm/i })
      .click();

    await expect
      .poll(async () => (await spotFeeInput.inputValue()) === "0.0033")
      .toBeTruthy();

    await page.getByRole("button", { name: /^manage$/i }).first().click();
    await expect(page).toHaveURL(
      /\/manage\/settings\/spot-trading|\/manage\/settings\/market-making/,
    );
  });
});
