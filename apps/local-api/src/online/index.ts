import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createOnlineSessionApp } from "./appFactory.js";
import { createOnlineHandler } from "./sessions.js";

// Online deployment deliberately does not import the local entry point,
// loadConfig(), preferences, OS proxy setup, or any server-wide API key.
const origin = process.env.VIVIC_ONLINE_ORIGIN?.trim();
if (!origin) throw new Error("Set VIVIC_ONLINE_ORIGIN to the public HTTPS origin.");
const port = Number(process.env.PORT ?? 8790);
const host = process.env.VIVIC_ONLINE_BIND_HOST === "0.0.0.0" ? "0.0.0.0" : "127.0.0.1";
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid online PORT.");
const handler = createOnlineHandler({ origin, createSessionApp: createOnlineSessionApp });
const app = new Hono();
app.all("/api/*", c => handler.fetch(c.req.raw));
app.get("/healthz", c => handler.fetch(c.req.raw));

// Use a dedicated origin, rooted at /. Production TLS terminates at the
// reverse proxy; that proxy must forward only to this loopback listener.
const dist = path.resolve(process.env.VIVIC_ONLINE_WEB_DIST?.trim() || path.resolve(import.meta.dirname, "../../../web/dist-online"));
let onlineBuild = false;
try {
  const marker = JSON.parse(fs.readFileSync(path.join(dist, ".vivic-online-build.json"), "utf8")) as { mode?: unknown };
  onlineBuild = marker.mode === "online" && fs.existsSync(path.join(dist, "index.html"));
} catch { /* A local build or missing artifact must fail before listening. */ }
if (!onlineBuild) {
  void handler.dispose();
  throw new Error("Missing online web build. Build dist-online with its .vivic-online-build.json marker first.");
}
{
  app.use("/*", async (c, next) => {
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "same-origin");
    c.header("Content-Security-Policy", "frame-ancestors 'self'; base-uri 'self'; object-src 'none'");
    c.header("Cache-Control", /\/assets\/[^/]+\.[a-z0-9]+$/.test(c.req.path) ? "public, max-age=31536000, immutable" : "no-cache");
    await next();
  });
  app.use("/*", serveStatic({ root: dist }));
  for (const route of ["/", "/control", "/display", "/remote", "/remote/", "/remote/index.html"]) app.get(route, serveStatic({ path: path.join(dist, "index.html") }));
}
const server = serve({ fetch: app.fetch, hostname: host, port }, info => {
  console.log(`[vivic-online-api] loopback port ${info.port}; public origin ${origin}`);
});
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(0), 5000);
  deadline.unref();
  void handler.dispose().finally(() => server.close(() => process.exit(0)));
});
