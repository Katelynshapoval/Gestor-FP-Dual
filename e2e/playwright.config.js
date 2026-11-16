// End-to-end tests: the real frontend (Vite) and backend (Express) against an
// isolated database built from the repository with synthetic data
// (prepararDb.js → proyecto_dual_e2e_verify). The development database is never
// used. Emails are only logged (MAIL_MODE=log).
//
//   cd e2e && npm install && npx playwright install chromium
//   npm test
//
// Needs the MySQL server of backend/.env (it creates and drops its own database).
const crypto = require('node:crypto');
const path = require('node:path');
const { defineConfig, devices } = require('@playwright/test');

const API_PORT = 3101;
const WEB_PORT = 3100;
const E2E_DB = process.env.E2E_DB || 'proyecto_dual_e2e';

module.exports = defineConfig({
  testDir: './tests',
  // One journey that builds on itself: run in order, one browser.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  globalTeardown: require.resolve('./teardown.js'),
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'es-ES',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Builds the database first, then starts the API on it.
      command: `node "${path.join(__dirname, 'prepararDb.js')}" && node src/index.js`,
      cwd: path.join(__dirname, '..', 'backend'),
      url: `http://localhost:${API_PORT}/especialidades`,
      timeout: 180_000,
      reuseExistingServer: false,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        E2E_DB,
        DBNAME: `${E2E_DB}_verify`,
        PORT: String(API_PORT),
        JWT_SECRET: crypto.randomBytes(32).toString('hex'),
        MAIL_MODE: 'log',
        NODE_ENV: 'development',
        APP_URL: `http://localhost:${WEB_PORT}`,
        PUPPETEER_SKIP_DOWNLOAD: 'true',
      },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      cwd: path.join(__dirname, '..', 'frontend'),
      // A file from public/: a bare "/" without Accept: text/html would be
      // proxied to the API (see vite.config.js) and answer 404.
      url: `http://localhost:${WEB_PORT}/robots.txt`,
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: 'ignore',
      env: { FPDUAL_API_URL: `http://localhost:${API_PORT}` },
    },
  ],
});
