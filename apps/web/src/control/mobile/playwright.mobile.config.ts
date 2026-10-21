import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const directory = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(directory, "../../..");
export default defineConfig({
  testDir: path.resolve(directory, "../../../../../contrib/mobile-console/browser"),
  outputDir: path.resolve(directory, "../../../../../evidence/mobile-console/browser-results"),
  workers: 1, timeout: 40_000, reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5174", viewport: { width: 390, height: 844 },
    reducedMotion: "reduce", trace: "off", video: "off",
    launchOptions: { args: ["--mute-audio"], ...(process.env.VIVIC_E2E_CHROMIUM ? { executablePath: process.env.VIVIC_E2E_CHROMIUM } : {}) },
  },
  webServer: {
    command: "pnpm dev --port 5174 --strictPort", cwd: web,
    url: "http://127.0.0.1:5174/src/control/mobile/index.html", reuseExistingServer: true,
    timeout: 30_000,
  },
});
