import { test, expect } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },
});

test.describe('HuFi Campaign i18n', () => {
  test('displays localized strings on campaign not found page (zh-CN)', async ({ page, context }) => {
    await context.addInitScript(() => {
      localStorage.setItem('mrm-locale', 'zh-CN');
    });

    await page.route('**/campaigns/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(null),
      });
    });

    await page.goto('/market-making/hufi/campaign/nonexistent-campaign');

    await expect(page.getByText('未找到活动')).toBeVisible();
    await expect(page.getByText('您查找的活动不存在或已被删除。')).toBeVisible();
    await expect(page.getByText('返回活动列表')).toBeVisible();
  });

  test('displays localized strings on campaign not found page (en-US)', async ({ page, context }) => {
    await context.addInitScript(() => {
      localStorage.setItem('mrm-locale', 'en-US');
    });

    await page.route('**/campaigns/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(null),
      });
    });

    await page.goto('/market-making/hufi/campaign/nonexistent-campaign');

    await expect(page.getByText('Campaign Not Found')).toBeVisible();
    await expect(page.getByText("The campaign you're looking for doesn't exist or has been removed.")).toBeVisible();
    await expect(page.getByText('Back to Campaigns')).toBeVisible();
  });
});
