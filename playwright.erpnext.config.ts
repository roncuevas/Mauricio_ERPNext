import { defineConfig, devices } from '@playwright/test'
import { execFileSync } from 'node:child_process'

export default defineConfig({
  testDir: './e2e',
  testMatch: /erpnext\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'dot' : 'list',
  timeout: 45_000,
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'es-MX',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  globalSetup: './e2e/erpnext.global-setup.ts',
  webServer: {
    command: 'E2E_ERP_PROXY_TARGET=http://localhost:8080 npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'tablet', use: { ...devices['iPad Mini'], browserName: 'chromium' } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], browserName: 'chromium' } },
  ],
})

export function resetErpNextForE2E() {
  execFileSync('scripts/erpnext-reset.sh', { stdio: 'inherit' })
}
