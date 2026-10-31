import { describe, expect, it, vi } from "vitest";
import { CredentialStore } from "../src/credentials.js";
import { DeepseekCredentialStore, validateDeepseek } from "../src/deepseek.js";
import { accountPlanner } from "../src/modelFallback.js";
import { createApp } from "../src/app.js";
import { authed, chatOk, emptyContext, modelsOk, testConfig } from "./helpers.js";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHostedService } from "../src/hosted/service.js";

const STEP_KEY = "TEST-private-step-key", DEEP_KEY = "TEST-private-deep-key";
function fixture(fetchImpl: typeof fetch, timeoutMs = 1000) {
  const credentials = new CredentialStore(), deepseek = new DeepseekCredentialStore();
  credentials.set({ apiKey: STEP_KEY, defaultModel: "step-3.7-flash", models: ["step-3.7-flash"], checkedAt: new Date().toISOString() });
  deepseek.set({ apiKey: DEEP_KEY, defaultModel: "deepseek-flash", checkedAt: new Date().toISOString() });
  let current = true;
  return { credentials, deepseek, invalidate: () => { current = false; },
    planner: accountPlanner({ credentials, deepseek, selected: "stepfun", isCurrent: () => current,
      stepfun: { baseUrl: "https://unit.test/v1", fetchImpl, timeoutMs } }) };
}
describe("account inference failover", () => {
  it("uses StepFun first and never contacts DeepSeek after success", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => chatOk({ reply: "primary" }));
    const { planner } = fixture(fetchImpl);
    expect(await planner.generate([{ role: "user", content: "TEST JSON" }])).toEqual({ ok: true, value: { reply: "primary" } });
    expect(planner.provider).toBe("stepfun"); expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]![0])).toBe("https://unit.test/v1/chat/completions");
  });
  it("fails over once after primary failure, preserving messages and reporting the actual provider", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async input => String(input).includes("unit.test")
      ? new Response("TEST no provider capacity", { status: 503 }) : chatOk({ reply: "secondary" }));
    const { planner } = fixture(fetchImpl);
    const messages = [{ role: "user" as const, content: "TEST do not replay persistence" }];
    expect(await planner.generate(messages)).toEqual({ ok: true, value: { reply: "secondary" } });
    expect(planner.provider).toBe("deepseek"); expect(fetchImpl).toHaveBeenCalledTimes(2);
    const request = JSON.parse(String(fetchImpl.mock.calls[1]![1]!.body));
    expect(request.messages).toEqual(messages); expect(request.thinking.type).toBe("disabled");
    expect(String(fetchImpl.mock.calls[1]![0])).toBe("https://api.deepseek.com/chat/completions");
  });
  it("uses the fallback when the primary deadline expires without restarting a task", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async input => String(input).includes("unit.test")
      ? new Promise<Response>(() => {}) : chatOk({ reply: "secondary" }));
    const { planner } = fixture(fetchImpl, 5);
    expect((await planner.generate([{ role: "user", content: "TEST" }])).ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it("never invokes another provider after cancellation or a connection revision change", async () => {
    const controller = new AbortController();
    const cancelledFetch = vi.fn<typeof fetch>(async () => { controller.abort(); throw Error("cancelled"); });
    const cancelled = fixture(cancelledFetch);
    expect((await cancelled.planner.generate([], controller.signal)).ok).toBe(false);
    expect(cancelledFetch).toHaveBeenCalledTimes(1);
    let invalidate = () => {};
    const changedFetch = vi.fn<typeof fetch>(async () => { invalidate(); return new Response("TEST", { status: 503 }); });
    const changed = fixture(changedFetch); invalidate = changed.invalidate;
    expect((await changed.planner.generate([])).ok).toBe(false);
    expect(changedFetch).toHaveBeenCalledTimes(1);
  });
  it("supports a DeepSeek-only connection without exposing either key in public status", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => chatOk({ reply: "secondary" }));
    const { credentials, deepseek } = fixture(fetchImpl); credentials.clear();
    const planner = accountPlanner({ credentials, deepseek, selected: "stepfun", isCurrent: () => true,
      stepfun: { baseUrl: "https://unit.test", fetchImpl } });
    expect((await planner.generate([])).ok).toBe(true); expect(planner.provider).toBe("deepseek");
    expect(JSON.stringify(deepseek.status())).not.toContain(DEEP_KEY);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("does not echo an upstream error body or key", async () => {
    const result = await validateDeepseek(DEEP_KEY, "deepseek-flash", {
      fetchImpl: async () => new Response(JSON.stringify({ message: DEEP_KEY }), { status: 401 }),
    });
    expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain(DEEP_KEY);
  });
});

describe("DeepSeek account API", () => {
  it("isolates hosted accounts and retains DeepSeek when StepFun is reconnected", async () => {
    const folder = mkdtempSync(path.join(tmpdir(), "vivic-deepseek-")); const origin = "https://unit.test";
    const open = (inviteCode: string) => createHostedService({ origin, dataDir: folder, inviteCode, autoStartReminders: false,
      fetchImpl: async input => String(input).endsWith("/models") ? modelsOk(String(input).includes("deepseek") ? ["deepseek-flash"] : ["step-3.7-flash"]) : chatOk({ ok: true }) });
    let service = open("TEST-invitation");
    const request = async (route: string, cookie?: string, body?: unknown) => service.fetch(new Request(origin + route, {
      method: body ? "POST" : "GET", headers: { origin, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }));
    try {
      const a = await request("/api/space/register", undefined, { username: "TEST_deep_a", password: "TEST-password-a", invite: "TEST-invitation" });
      expect(a.status).toBe(200);
      await service.dispose(); service = open("TEST-invitation-b");
      const b = await request("/api/space/register", undefined, { username: "TEST_deep_b", password: "TEST-password-b", invite: "TEST-invitation-b" });
      expect(b.status).toBe(200);
      const cookieA = a.headers.get("set-cookie")!.split(";")[0], cookieB = b.headers.get("set-cookie")!.split(";")[0];
      expect((await (await request("/api/credentials/deepseek/validate", cookieA, { apiKey: DEEP_KEY })).json()).connected).toBe(true);
      expect((await (await request("/api/providers/status", cookieB)).json()).deepseek.connected).toBe(false);
      await request("/api/credentials/stepfun/validate", cookieA, { apiKey: STEP_KEY });
      const status = await (await request("/api/providers/status", cookieA)).json();
      expect(status.deepseek.connected).toBe(true); expect(status.providers[0].connected).toBe(true);
      expect(JSON.stringify(status)).not.toContain(DEEP_KEY);
      const registryA = await (await request("/api/providers", cookieA)).json();
      const registryB = await (await request("/api/providers", cookieB)).json();
      expect(registryA.providers).toHaveLength(2); expect(registryB.providers).toHaveLength(0);
      expect(JSON.stringify(registryA)).not.toContain(DEEP_KEY);
      await service.dispose(); service = open("TEST-invitation-c");
      const restored = await (await request("/api/providers/status", cookieA)).json();
      expect(restored.deepseek.connected).toBe(true); expect(restored.providers[0].connected).toBe(true);
      expect((await (await request("/api/providers/status", cookieB)).json()).deepseek.connected).toBe(false);
    } finally {
      await service.dispose(); const target = realpathSync(folder);
      expect(path.dirname(target)).toBe(realpathSync(tmpdir())); expect(path.basename(target)).toMatch(/^vivic-deepseek-/);
      rmSync(target, { recursive: true, force: true });
    }
  });
  it("keeps both providers connected and routes a primary outage to validated DeepSeek JSON", async () => {
    let primaryFails = false;
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/models")) return modelsOk(url.includes("deepseek") ? ["deepseek-flash", "deepseek-v4-pro"] : ["step-3.7-flash"]);
      const body = JSON.parse(String(init?.body));
      return primaryFails && !url.includes("deepseek") ? new Response("TEST outage", { status: 503 })
        : chatOk(body.max_tokens <= 256 ? { ok: true } : { reply: "TEST fallback works" });
    });
    const app = createApp({ mode: "online", config: testConfig({ requestTimeoutMs: 1000 }), fetchImpl });
    const post = (route: string, body: unknown) => app.request(route, { method: "POST", headers: authed, body: JSON.stringify(body) });
    try {
      expect((await (await post("/api/credentials/deepseek/validate", { apiKey: DEEP_KEY, model: "deepseek-v4-flash" })).json()).connected).toBe(true);
      expect((await (await post("/api/credentials/stepfun/validate", { apiKey: STEP_KEY })).json()).connected).toBe(true);
      const status = await (await app.request("/api/providers/status", { headers: authed })).json();
      expect(status.providers).toEqual([expect.objectContaining({ name: "stepfun", connected: true })]);
      expect(status.deepseek).toMatchObject({ name: "deepseek", connected: true });
      expect(JSON.stringify(status)).not.toContain(DEEP_KEY); expect(JSON.stringify(status)).not.toContain(STEP_KEY);
      primaryFails = true;
      const result = await (await post("/api/intent", { text: "TEST write a short greeting", canvasContext: emptyContext() })).json();
      expect(result.usedProvider).toBe("deepseek"); expect(result.kind).not.toBe("error");
    } finally { app.dispose(); }
  });
});
