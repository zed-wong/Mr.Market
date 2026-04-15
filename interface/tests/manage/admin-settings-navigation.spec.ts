import { expect, test } from "@playwright/test";

test("admin settings launcher navigates to settings sections", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("admin-access-token", "test-admin-token");
  });

  await page.goto("/manage/settings");

  await expect(page).toHaveURL(/\/manage\/settings/);
  await expect(page.locator(".grid button.card").first()).toBeVisible({
    timeout: 10000,
  });
});
