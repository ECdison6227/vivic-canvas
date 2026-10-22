import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const directory = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(directory, "../../..");
const host = process.env.VIVIC_MOBILE_TEST_HOST ?? "127.0.0.1";
if (!["127.0.0.1", "127.0.0.2"].includes(host)) throw new Error("Mobile browser tests require an isolated loopback host.");
const origin = `http://${host}:5174`;
export default defineConfig({
  testDir: path.join(path.dirname(fileURLToPath(import.meta.resolve("@vivic/mobile-console-prototype/protocol"))), "browser"),
  outputDir: path.resolve(directory, "../../../../../evidence/mobile-console/browser-results"),
  workers: 1, timeout: 40_000, reporter: [["list"]],
  use: {
    baseURL: origin, viewport: { width: 390, height: 844 },
    reducedMotion: "reduce", trace: "off", video: "off",
    launchOptions: { args: ["--mute-audio"], ...(process.env.VIVIC_E2E_CHROMIUM ? { executablePath: process.env.VIVIC_E2E_CHROMIUM } : {}) },
  },
  webServer: {
    command: `pnpm exec vite --host ${host} --port 5174 --strictPort`, cwd: web,
    url: `${origin}/src/control/mobile/index.html`, reuseExistingServer: false,
    timeout: 30_000,
  },
});
