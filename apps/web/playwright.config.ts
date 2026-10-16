import { defineConfig } from "@playwright/test";

// Playwright manages its own dev servers so it never touches the user's
// dev processes: web on :5174, local decision API on 127.0.0.1:8788 with a
// stubbed StepFun base URL (per-test in-process stub on :45991).
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5174",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    // Exercise playback state without emitting office audio.
    launchOptions: { args: ["--mute-audio"] },
  },
  webServer: [
    {
      command: "pnpm dev --port 5174 --strictPort",
      url: "http://localhost:5174",
      reuseExistingServer: true,
      timeout: 30_000,
      env: {
        VIVIC_LOCAL_API: "http://127.0.0.1:8788",
      },
    },
    {
      command: "pnpm --filter @vivic/local-api start",
      url: "http://127.0.0.1:8788/healthz",
      reuseExistingServer: true,
      timeout: 30_000,
      env: {
        PORT: "8788",
        VIVIC_PREFERENCES: "off",
        STEPFUN_BASE_URL: "http://127.0.0.1:45991/v1",
      },
    },
  ],
});
