import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

/**
 * Dev proxy: the browser calls same-origin /api/*; this process injects the
 * local session bearer (from apps/local-api/.env.local) server-side so the
 * token never ships to the browser bundle. Target can be overridden for the
 * Playwright-managed API instance (VIVIC_LOCAL_API).
 */
const localApiTarget = process.env.VIVIC_LOCAL_API ?? "http://127.0.0.1:8787";

const readLocalToken = (): string | undefined => {
  try {
    const file = path.resolve(__dirname, "../local-api/.env.local");
    const line = fs
      .readFileSync(file, "utf8")
      .split("\n")
      .find((l) => l.startsWith("VIVIC_LOCAL_TOKEN="));
    return line?.split("=")[1]?.trim();
  } catch {
    return undefined;
  }
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    rolldownOptions: {
      // Second page: the beta landing at /landing/ (its own React entry, src/landing/).
      input: {
        main: path.resolve(__dirname, "index.html"),
        landing: path.resolve(__dirname, "landing/index.html"),
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5175,
    strictPort: true,
    proxy: {
      "/api": {
        target: localApiTarget,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            // Lazy re-read per request: the API generates .env.local on its
            // first boot, possibly after this config was evaluated.
            const token = readLocalToken();
            if (token) {
              proxyReq.setHeader("authorization", `Bearer ${token}`);
            }
          });
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
