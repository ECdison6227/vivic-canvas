import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

/**
 * Build of the beta landing only, with relative URLs so it works under any
 * sub-path of a static host (e.g. /vivic/).
 *   default            dist-landing/: code-split, lazy chunks load on demand (for hosting)
 *   LANDING_SINGLE=1   dist-landing-single/: one JS chunk, one stylesheet, assets inlined,
 *                      for scripts/inline-landing.mjs to fold into a single HTML file
 * Set VITE_LANDING_APP_URL when the build has no Vivic app beside it.
 * LANDING_PAGE=card-gallery builds the landing's card gallery instead, into
 * dist-card-gallery(-single)/.
 */
const single = process.env.LANDING_SINGLE === "1";
const page = process.env.LANDING_PAGE === "card-gallery" ? "card-gallery" : "landing";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  base: "./",
  build: {
    outDir: `dist-${page}${single ? "-single" : ""}`,
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    ...(single ? { assetsInlineLimit: 100_000_000, cssCodeSplit: false, modulePreload: false } : {}),
    rolldownOptions: {
      input: { [page]: path.resolve(import.meta.dirname, `${page}/index.html`) },
      ...(single ? { output: { inlineDynamicImports: true } } : {}),
    },
  },
});
