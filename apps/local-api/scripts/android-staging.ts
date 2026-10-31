/** Isolated loopback evaluation server. All credentials/evidence remain in ignored .cache. */
import { serve } from "@hono/node-server";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createHostedService } from "../src/hosted/service.js";

const folder = path.resolve(process.argv[2]!);
const keys = JSON.parse(readFileSync(path.resolve(process.argv[3]!), "utf8"));
mkdirSync(folder, { recursive: true });
const origin = "https://vivic.edsionc.top", invite = randomUUID();
const service = createHostedService({ origin, dataDir: folder, inviteCode: invite, autoStartReminders: false,
  modelApiBaseUrl: keys.voice.baseUrl,
  fetchImpl: async (input, init) => {
    if (process.env.VIVIC_ANDROID_QA_PRIMARY_DOWN === "1" && String(input).includes("api.stepfun.com") && String(input).endsWith("/chat/completions")
      && Number(JSON.parse(String(init?.body)).max_tokens) > 256) return new Response("Evaluation primary outage", { status: 503 });
    return fetch(input, init);
  } });
const credentialFile = path.join(folder, "credentials-private.json");
let credentials: { cookie: string; username: string; origin: string; evaluation: boolean; accountId: string; spaceId: string };
if (process.env.VIVIC_ANDROID_STAGING_EXISTING === "1") credentials = JSON.parse(readFileSync(credentialFile, "utf8"));
else {
  const username = "decision-eval-android-" + Date.now();
  const registered = await service.fetch(new Request(origin + "/api/space/register", { method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ username, password: randomUUID(), invite }) }));
  if (!registered.ok) throw Error("Evaluation registration failed");
  const cookie = registered.headers.get("set-cookie")!.split(";")[0]!;
  const session = await registered.json() as any;
  const spaces = await (await service.fetch(new Request(origin + "/api/space/spaces", { headers: { cookie } }))).json() as any;
  credentials = { cookie, username, origin, evaluation: true, accountId: session.user.id, spaceId: spaces.spaces[0].id };
  writeFileSync(credentialFile, JSON.stringify(credentials), { mode: 0o600 });
  for (const [route, apiKey] of [["/api/credentials/stepfun/validate", keys.stepfun.apiKey],
    ["/api/credentials/deepseek/validate", keys.deepseek.apiKey], ["/api/space/models/connect", keys.voice.apiKey]]) {
    const response = await service.fetch(new Request(origin + route, { method: "POST", headers: { cookie, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ apiKey }) }));
    const result = await response.json() as any;
    console.log(JSON.stringify({ connection: route.split("/")[3], ok: response.ok && result.ok !== false }));
  }
}
const server = serve({ hostname: "127.0.0.1", port: 19447, fetch: request => {
  const url = new URL(request.url); url.protocol = "https:"; url.host = "vivic.edsionc.top";
  url.port = "";
  return service.fetch(new Request(url, request));
} });
console.log("Android isolated staging ready on loopback 19447");
for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, () => { void service.dispose().finally(() => server.close()); });
