import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  mapMixinAssetsToBalances,
  formatBalancesForUser,
} from "$lib/helpers/mixin/mixin";

describe("Mixin WebView assets", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("maps WebView assets to balances with USD and BTC totals", async () => {
    const assets = [
      {
        asset_id: "asset-1",
        balance: "2.5",
        price_usd: "100",
        symbol: "AAA",
      },
      {
        asset_id: "asset-2",
        balance: "1",
        price_usd: "20000",
        symbol: "BTC",
      },
    ];

    const result = await mapMixinAssetsToBalances(assets, {
      asset_id: "asset-2",
      price_usd: "20000",
    });

    expect(result.balances).toHaveLength(2);
    expect(result.balances[0].asset_id).toBe("asset-2");
    expect(result.totalUSDBalance).toBe(20250);
    expect(result.totalBTCBalance).toBeCloseTo(1.0125);
  });

  it("formats assets for user balances mapping", async () => {
    const assets = [
      {
        asset_id: "asset-1",
        balance: "2.5",
        price_usd: "100",
        symbol: "AAA",
      },
    ];

    const result = await formatBalancesForUser(assets, {
      asset_id: "btc-asset",
      price_usd: "50000",
    });

    expect(result.balances).toEqual([
      {
        asset_id: "asset-1",
        balance: 2.5,
        usdBalance: 250,
        details: assets[0],
      },
    ]);
    expect(result.totalUSDBalance).toBe(250);
    expect(result.totalBTCBalance).toBeCloseTo(0.005);
  });
});
