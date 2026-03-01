import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  backfillStrategyInstanceDefinitionLinks,
  listStrategyDefinitions,
  listStrategyDefinitionVersions,
  listStrategyInstances,
  publishStrategyDefinitionVersion,
  startStrategyInstance,
  validateStrategyInstance,
} from "./strategy";

vi.mock("$env/dynamic/public", () => {
  return {
    env: {
      PUBLIC_MRM_BACKEND_URL: "http://localhost:3000",
    },
  };
});

describe("admin strategy helper", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists strategy definitions", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify([{ id: "d1", key: "arbitrage" }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const result = await listStrategyDefinitions("token");

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3000/admin/strategy/definitions",
      expect.objectContaining({ method: "GET" }),
    );
    expect(result).toEqual([{ id: "d1", key: "arbitrage" }]);
  });

  it("validates strategy instance payload", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ valid: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const result = await validateStrategyInstance(
      {
        definitionId: "def-1",
        userId: "u1",
        clientId: "c1",
        config: { pair: "BTC/USDT" },
      },
      "token",
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3000/admin/strategy/instances/validate",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toEqual({ valid: true });
  });

  it("starts strategy instance", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await startStrategyInstance(
      {
        definitionId: "def-1",
        userId: "u1",
        clientId: "c1",
      },
      "token",
    );

    expect(result).toEqual({ message: "ok" });
  });

  it("lists strategy instances", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([{ id: 1, strategyKey: "u1-c1-volume" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await listStrategyInstances("token", true);

    expect(result).toEqual([{ id: 1, strategyKey: "u1-c1-volume" }]);
  });

  it("publishes strategy definition version", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "d1", currentVersion: "1.0.1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await publishStrategyDefinitionVersion(
      "d1",
      { version: "1.0.1" },
      "token",
    );

    expect(result).toEqual({ id: "d1", currentVersion: "1.0.1" });
  });

  it("lists strategy definition versions", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([{ id: "v1", version: "1.0.0" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await listStrategyDefinitionVersions("d1", "token");

    expect(result).toEqual([{ id: "v1", version: "1.0.0" }]);
  });

  it("backfills legacy strategy instance links", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ updated: 2, skipped: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await backfillStrategyInstanceDefinitionLinks("token");

    expect(result).toEqual({ updated: 2, skipped: 1 });
  });
});
