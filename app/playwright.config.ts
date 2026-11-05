import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';
const baseURL = process.env.SV_TEST_URL || 'http://127.0.0.1:3100';
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 45_000,
  reporter: [['list']],
  use: { baseURL, headless: true, viewport: { width: 1440, height: 1000 }, permissions: ['microphone'],
    launchOptions: { executablePath: process.env.CHROME_PATH || (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined), args: ['--no-sandbox', '--allow-loopback-in-peer-connection', '--disable-features=WebRtcHideLocalIpsWithMdns', '--autoplay-policy=no-user-gesture-required'] } },
  webServer: process.env.SV_TEST_URL ? undefined : { command: 'npm run dev', url: baseURL, reuseExistingServer: true, timeout: 30_000 },
});
