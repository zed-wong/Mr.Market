import { expect, test } from "@playwright/test";

test("spot quick add focuses on asset selection after clicking Add", async ({
  page,
}) => {
  test.setTimeout(30000);

  const exchanges = [
    {
      exchange_id: "binance",
      name: "Binance",
      enable: true,
    },
  ];

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
        exchanges,
        simply_grow: { tokens: [] },
        arbitrage: { pairs: [] },
        market_making: { pairs: [], exchanges },
      }),
    });
  });

  await page.route("**/spot/info", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        trading_pairs: [],
      }),
    });
  });

  await page.route("**/admin/grow/exchange/markets/binance", async (route) => {
    const markets = Array.from({ length: 30 }, (_, index) => ({
      symbol: index === 0 ? "BTC/USDT" : `BTC${index}/USDT`,
      base: "BTC",
      quote: "USDT",
      spot: true,
    }));

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(markets),
    });
  });

  await page.route("**/network/assets/**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname.includes("/network/assets/search/BTC")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              asset_id: "btc-chain-a",
              symbol: "BTC",
              name: "Bitcoin A",
              icon_url: "https://example.com/btc-a.png",
              chain_id: "chain-a",
            },
            {
              asset_id: "btc-chain-b",
              symbol: "BTC",
              name: "Bitcoin B",
              icon_url: "https://example.com/btc-b.png",
              chain_id: "chain-b",
            },
          ],
        }),
      });
      return;
    }

    if (url.pathname.includes("/network/assets/search/USDT")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              asset_id: "usdt-chain-a",
              symbol: "USDT",
              name: "Tether A",
              icon_url: "https://example.com/usdt-a.png",
              chain_id: "chain-a",
            },
            {
              asset_id: "usdt-chain-b",
              symbol: "USDT",
              name: "Tether B",
              icon_url: "https://example.com/usdt-b.png",
              chain_id: "chain-b",
            },
          ],
        }),
      });
      return;
    }

    const chainId = url.pathname.split("/").pop() || "chain-a";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          asset_id: chainId,
          symbol: chainId.toUpperCase(),
          icon_url: "https://example.com/chain.png",
        },
      }),
    });
  });

  await page.goto("/manage/settings/spot-trading");

  const loginHeading = page.getByRole("heading", { name: /login/i });
  const addPairLauncher = page.getByRole("button", { name: /add pair/i });

  await expect
    .poll(async () => {
      const loginVisible = await loginHeading.isVisible().catch(() => false);
      const addPairVisible = await addPairLauncher.isVisible().catch(() => false);
      return loginVisible || addPairVisible;
    }, { timeout: 10000 })
    .toBeTruthy();

  if (await loginHeading.isVisible().catch(() => false)) {
    await page.locator('input[type="password"]').fill("password");
    await page.getByRole("button", { name: /^login$/i }).click();
    await page.waitForURL(/\/manage\/settings/, { timeout: 10000 });
    await page.goto("/manage/settings/spot-trading");
  }

  await expect(addPairLauncher).toBeVisible();
  await addPairLauncher.click();

  const searchInput = page.locator("#quick-symbol-input");
  await expect(searchInput).toBeVisible();
  await searchInput.fill("BTC");

  const rowAddButton = page.getByRole("button", { name: /^add$/i }).first();
  await expect(rowAddButton).toBeVisible();
  await rowAddButton.click();

  await expect(page.getByText("Select assets")).toBeVisible();
  await expect(searchInput).toBeHidden();
});
