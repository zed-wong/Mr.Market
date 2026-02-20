import { describe, expect, it } from "vitest";

import { buildAdminSidebarMenu } from "./sidebar-menu";

describe("buildAdminSidebarMenu", () => {
  it("keeps only dashboard + settings and nests all settings children", () => {
    const menu = buildAdminSidebarMenu();

    expect(menu).toHaveLength(2);
    expect(menu.map((item) => item.key)).toEqual(["dashboard", "settings"]);

    const settings = menu.find((item) => item.key === "settings");
    expect(settings?.children?.map((item) => item.key)).toEqual([
      "exchanges",
      "spot-trading",
      "market-making",
      "fees",
      "api-keys",
    ]);
  });
});
