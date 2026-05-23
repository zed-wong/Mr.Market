import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://localhost:4176',
    trace: 'off',
  },
  webServer: [
    {
      command:
        "bun --no-env-file run --cwd ../server build && rm -f /tmp/mrmarket-validation-admin-e2e-3100.sqlite /tmp/mrmarket-validation-admin-e2e-3100.sqlite-* && DOTENV_CONFIG_PATH=/tmp/mrmarket-validation-no-env MR_MARKET_DISABLE_DOTENV=true PORT=3100 DATABASE_PATH=/tmp/mrmarket-validation-admin-e2e-3100.sqlite ADMIN_PASSWORD=test-admin-password JWT_SECRET=test-admin-jwt-secret-with-enough-length-for-local-validation CORS_ORIGIN=http://localhost:4176 ADMIN_PASSKEY_RP_ID=localhost ADMIN_PASSKEY_ORIGIN=http://localhost:4176 ADMIN_PASSKEY_RP_NAME='Mr.Market Admin Validation' NODE_ENV=production bun --no-env-file run --cwd ../server start:prod",
      url: 'http://127.0.0.1:3100/health/ping',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command:
        'PUBLIC_MRM_BACKEND_URL=http://127.0.0.1:3100 bun --no-env-file run build && PUBLIC_MRM_BACKEND_URL=http://127.0.0.1:3100 bun --no-env-file run preview -- --host localhost --port 4176',
      url: 'http://localhost:4176/login',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
