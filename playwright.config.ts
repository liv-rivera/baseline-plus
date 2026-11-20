import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  grep: process.env.BASELINE_API_ONLY === "1" ? /endpoints enforce/ : /recovers access on mobile/,
  timeout: 120_000,
  use: {
    baseURL: "http://localhost:3300",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE },
    viewport: { width: 390, height: 844 },
    trace: "off",
    screenshot: "off",
    video: "off",
  },
});
