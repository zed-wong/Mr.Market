import { describe, expect, it } from "vitest";

import { CONFIG_SCHEMA_TEMPLATES } from "./configTemplates";

describe("CONFIG_SCHEMA_TEMPLATES", () => {
  it("exposes efficient dual-account variance fields used by direct-order creation", () => {
    const efficientTemplate = CONFIG_SCHEMA_TEMPLATES.efficientDualAccountVolume as {
      properties?: Record<string, unknown>;
    };

    expect(efficientTemplate.properties).toEqual(
      expect.objectContaining({
        tradeAmountVariance: expect.any(Object),
        priceOffsetVariance: expect.any(Object),
      }),
    );
  });
});
