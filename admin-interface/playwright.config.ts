import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://localhost:4174',
    trace: 'off',
  },
  webServer: [
    {
      command:
        "bun run --cwd ../server build && rm -f ../server/data/admin-e2e.db ../server/data/admin-e2e.db-* && PORT=3000 DATABASE_PATH=data/admin-e2e.db ADMIN_PASSWORD=test-admin-password JWT_SECRET=test-admin-jwt-secret-with-enough-length-for-local-validation ENCRYPTION_PRIVATE_KEY=test-local-encryption-private-key CORS_ORIGIN=http://localhost:4174 ADMIN_PASSKEY_RP_ID=localhost ADMIN_PASSKEY_ORIGIN=http://localhost:4174 ADMIN_PASSKEY_RP_NAME='Mr.Market Admin' bun run --cwd ../server start:prod",
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command:
        'PUBLIC_MRM_BACKEND_URL=http://127.0.0.1:3000 bun run build && PUBLIC_MRM_BACKEND_URL=http://127.0.0.1:3000 bun run preview -- --host localhost --port 4174',
      url: 'http://localhost:4174/login',
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
