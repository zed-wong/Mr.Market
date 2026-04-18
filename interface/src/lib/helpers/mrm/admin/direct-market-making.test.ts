import { beforeEach, describe, expect, it, vi } from "vitest";

import { startDirectOrder } from "./direct-market-making";

vi.mock("$env/dynamic/public", () => {
  return {
    env: {
      PUBLIC_MRM_BACKEND_URL: "http://localhost:3000",
    },
  };
});

describe("admin direct market making helper", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts dual-account start payloads using only api key ids and config overrides", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ orderId: "o1", state: "running", warnings: [] }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    await startDirectOrder(
      {
        exchangeName: "binance",
        pair: "BTC/USDT",
        strategyDefinitionId: "def-1",
        makerApiKeyId: "maker-key",
        takerApiKeyId: "taker-key",
        configOverrides: {
          baseTradeAmount: 0.001,
        },
      },
      "token",
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3000/admin/market-making/direct-start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          exchangeName: "binance",
          pair: "BTC/USDT",
          strategyDefinitionId: "def-1",
          makerApiKeyId: "maker-key",
          takerApiKeyId: "taker-key",
          configOverrides: {
            baseTradeAmount: 0.001,
          },
        }),
      }),
    );
  });
});
