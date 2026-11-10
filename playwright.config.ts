import { defineConfig } from '@playwright/test';
import { chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const macLauncher = fileURLToPath(new URL('./tests/chrome-macos.sh', import.meta.url));
if (process.platform === 'darwin') chmodSync(macLauncher, 0o755);

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 120000,
  workers: 1,
  use: {
    baseURL: process.env.AF_TEST_URL ?? 'http://127.0.0.1:5173',
    headless: true,
    launchOptions: { ...(process.platform === 'darwin' ? { executablePath: macLauncher } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: { command: 'npm run dev -- --port 5173', url: 'http://127.0.0.1:5173', reuseExistingServer: true },
});