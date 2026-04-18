import { describe, expect, it } from "vitest";

import { CONFIG_SCHEMA_TEMPLATES } from "./configTemplates";

describe("CONFIG_SCHEMA_TEMPLATES", () => {
  it("exposes dual-account volume variance fields used by direct-order creation", () => {
    const dualAccountVolumeTemplate = CONFIG_SCHEMA_TEMPLATES.dualAccountVolume as {
      properties?: Record<string, unknown>;
    };

    expect(dualAccountVolumeTemplate.properties).toEqual(
      expect.objectContaining({
        tradeAmountVariance: expect.any(Object),
        priceOffsetVariance: expect.any(Object),
        makerDelayVariance: expect.any(Object),
      }),
    );
  });
});
