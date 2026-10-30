import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "account.spec.ts",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4175",
    viewport: { width: 390, height: 844 },
    timezoneId: "Europe/Warsaw",
    launchOptions: { channel: "chrome" },
  },
  webServer: {
    command: "node e2e/start-account-server.mjs",
    url: "http://127.0.0.1:4175",
    reuseExistingServer: false,
  },
  reporter: "list",
});
