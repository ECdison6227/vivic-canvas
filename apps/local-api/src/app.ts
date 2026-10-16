import { cloneVoice, CloneVoiceRequestSchema } from "./voiceClone.js";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { LocalApiConfig } from "./config.js";
import { CredentialStore } from "./credentials.js";
import { runIntent } from "./intent/pipeline.js";
import {
  IntentRequestSchema,
  IntentResponseSchema,
  SpeechRequestSchema,
  ValidateKeyRequestSchema,
} from "./schemas.js";
import { validateConnection, chatJson, probeAnswered, PLAN_CHAT_MODELS } from "./stepfun.js";
import { providerRecoveryHint } from "./providerError.js";
import { SPEECH_MODEL, synthesizeSpeech } from "./speech.js";
import { DEFAULT_SPEECH_VOICE, SPEECH_VOICES, SPEECH_VOICES_SOURCE } from "./voices.js";
import { createAsrRoutes, ASR_BODY_LIMIT_BYTES } from "./asr.js";
import { createSearchClient, createSearchRoutes, type SearchClient } from "./search/index.js";
import { GptProvider } from "./gpt/provider.js";
import { searchGpt } from "./gpt/search.js";
import { cachedProxy, resolveSearchProxy } from "./openaiProxy.js";
import { createDataClient, type DataClient } from "./data/index.js";
import { validateImageAttachment, imageInputErrorMessage, type ImageDecoder } from "./images.js";
import { decodeImage } from "./imageDecoder.js";
import { DecisionManager } from "./decision/manager.js";
import type { PreferenceStore } from "./preferences.js";

/**
 * Vivic local decision API. Loopback only, bearer-guarded, zod on every
 * body, no stack traces to clients. StepFun key is accepted here, tested
 * once against the real provider, and kept in process memory only.
 */

export interface AppDeps {
  config: LocalApiConfig;
  credentials?: CredentialStore;
  fetchImpl?: typeof fetch;
  search?: SearchClient;
  gpt?: GptProvider;
  data?: DataClient;
  imageDecoder?: ImageDecoder;
  decision?: DecisionManager;
  /** Remembers the chosen connection across restarts; absent in tests. */
  preferences?: PreferenceStore;
}

const tokenOk = (presented: string, expected: string): boolean => {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

const firstIssue = (error: z.ZodError): string =>
  error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");

export const createApp = (deps: AppDeps) => {
  const { config } = deps;
  const credentials = deps.credentials ?? new CredentialStore();
  const gpt = deps.gpt ?? new GptProvider({ fetchImpl: deps.fetchImpl });
  const data = deps.data ?? createDataClient({ fetchImpl: deps.fetchImpl });
  const decision = deps.decision ?? new DecisionManager();
  const { preferences } = deps;
  const saved = preferences?.read() ?? {};
  let activeProvider: "stepfun" | "gpt" = saved.activeProvider ?? "stepfun";
  let providerRevision = 0;
  // Lets the page tell "the backend restarted and dropped the in-memory key"
  // apart from a key that stopped working.
  const instance = randomUUID();
  const rememberGpt = () => {
    const status = gpt.status();
    if (status.connected && status.source) preferences?.update({ gptSource: status.source, gptModel: status.defaultModel });
  };
  // A restart must not drop a GPT login the user never disconnected. Requests
  // arriving meanwhile wait for this instead of reporting "not connected".
  let restoringGpt: Promise<void> | undefined = saved.gptSource ? (async () => {
    const source = saved.gptSource!;
    const ok = await gpt.connect(source, saved.gptModel) || (saved.gptModel ? await gpt.connect(source) : false);
    if (ok) { providerRevision++; rememberGpt(); }
  })().catch(() => undefined).finally(() => { restoringGpt = undefined; }) : undefined;
  const searchProxy = config.searchProxy ? cachedProxy(() => resolveSearchProxy(config.searchProxy, process.env)) : undefined;
  const search = deps.search ?? (config.searchEnabled ? createSearchClient({ credentials, fetchImpl: deps.fetchImpl,
    config: { publicDnsFallback: config.publicDnsFallback === true },
    gpt: { connected: () => gpt.status().connected, preferred: () => activeProvider === "gpt",
      search: (query, signal) => searchGpt(gpt, query, signal, deps.fetchImpl) },
    searchProxy: () => searchProxy?.()?.url,
    captureSession: () => { const version = providerRevision; return () => version === providerRevision; },
  }) : undefined);
  const stepfun = {
    baseUrl: config.stepfunBaseUrl,
    fetchImpl: deps.fetchImpl,
    timeoutMs: config.requestTimeoutMs,
  };

  const app = new Hono();
  app.onError((_error, c) => c.json({ ok: false, error: "本地服务暂时无法完成请求。" }, 500));

  // unauthenticated liveness probe (process manager / playwright webServer)
  app.get("/healthz", (c) => c.json({ ok: true, service: "vivic-local-api" }));

  app.use(
    "/api/*",
    cors({
      origin: (origin) =>
        origin && config.allowedOrigins.includes(origin) ? origin : null,
      allowHeaders: ["authorization", "content-type"],
      allowMethods: ["GET", "POST"],
      maxAge: 600,
    }),
  );

  // Hard body size cap before any parsing.
  app.use("/api/*", async (c, next) => {
    if (c.req.method === "POST") {
      const len = Number(c.req.header("content-length") ?? 0);
      const limit = c.req.path === "/api/transcribe" ? ASR_BODY_LIMIT_BYTES : c.req.path === "/api/intent" ? 6 * 1024 * 1024 : config.bodyLimitBytes;
      if (len > limit) {
        return c.json({ ok: false, error: "请求体过大" }, 413);
      }
    }
    await next();
  });

  // Local session bearer. The browser never holds it: the vite dev proxy
  // injects it server-side; tests and operators use .env.local directly.
  app.use("/api/*", async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!presented || !tokenOk(presented, config.token)) {
      return c.json({ ok: false, error: "未授权的本地会话" }, 401);
    }
    // Multipart voice uploads are simple browser requests, so CORS response
    // headers alone do not prevent another origin from spending a local key.
    if (c.req.method === "POST") {
      const origin = c.req.header("origin");
      if ((origin && !config.allowedOrigins.includes(origin)) || c.req.header("sec-fetch-site") === "cross-site") {
        return c.json({ ok: false, error: "请求来源不在本地控制页范围内。" }, 403);
      }
    }
    await next();
  });

  app.post("/api/credentials/stepfun/validate", async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "请求体不是合法 JSON" }, 400);
    }
    const parsed = ValidateKeyRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        { ok: false, error: `请求格式不正确：${firstIssue(parsed.error)}` },
        400,
      );
    }
    const result = await validateConnection(parsed.data.apiKey, {
      ...stepfun, timeoutMs: config.connectionTimeoutMs ?? 12000,
    });
    if (!result.ok) {
      // A failed key must not leave stale credentials around (fail closed).
      credentials.clear();
      const error = `${result.error}。${providerRecoveryHint(result.status)}`;
      credentials.recordError(error);
      return c.json({ ok: false, connected: false, error });
    }
    // Replace credentials atomically; the key object never leaves this scope.
    credentials.set({ apiKey: parsed.data.apiKey, ...result.value });
    return c.json({ ok: true, ...credentials.status() });
  });

  app.post("/api/credentials/stepfun/disconnect", (c) => {
    credentials.clear();
    return c.json({ ok: true, connected: false });
  });

  app.get("/api/providers/status", (c) => {
    c.header("Cache-Control", "no-store");
    const status = credentials.status();
    rememberGpt();
    if (activeProvider === "gpt") gpt.keepWarm();
    return c.json({
      activeProvider, instance,
      ...(restoringGpt ? { restoring: "gpt" } : {}),
      providers: [status, gpt.status()],
      degradations: (activeProvider === "stepfun" ? status.connected : gpt.status().connected)
        ? []
        : [
            {
              code: "stepfun-disconnected",
              message: "所选模型未连接，/api/intent 只做本地规则，复杂指令暂不可用。",
            },
          ],
    });
  });

  const readJson = async (c: { req: { json: () => Promise<unknown> } }) => c.req.json().catch(() => null);
  app.post("/api/providers/select", async c => {
    const body = z.strictObject({ provider: z.enum(["stepfun", "gpt"]) }).safeParse(await readJson(c));
    if (!body.success) return c.json({ ok: false, error: "仅支持 StepFun Coding Plan 或 GPT。" }, 400);
    if (activeProvider !== body.data.provider) { activeProvider = body.data.provider; providerRevision++; }
    preferences?.update({ activeProvider });
    return c.json({ ok: true, activeProvider });
  });
  app.post("/api/providers/model", async c => {
    const body = z.strictObject({ provider: z.enum(["stepfun", "gpt"]), model: z.string().regex(/^[a-zA-Z0-9_.-]{1,128}$/) }).safeParse(await readJson(c));
    if (!body.success) return c.json({ ok: false, error: "模型选择无效。" }, 400);
    if (body.data.provider === "gpt") {
      const source = gpt.status().source;
      if (!source) return c.json({ ok: false, error: "请先连接 GPT。" }, 503);
      const ok = await gpt.connect(source, body.data.model); providerRevision++; rememberGpt();
      return c.json({ ok, ...gpt.status() });
    }
    const credential = credentials.getSecret();
    if (!credential || !credential.models.includes(body.data.model) || !PLAN_CHAT_MODELS.includes(body.data.model)) return c.json({ ok: false, error: "请选择已连接套餐中的推理模型。" }, 400);
    const candidate = { ...credential, defaultModel: body.data.model };
    const probe = await chatJson(candidate, [{ role: "system", content: '只输出JSON {"ok":true}' }, { role: "user", content: "测试连接" }], { ...stepfun, timeoutMs: config.connectionTimeoutMs ?? 12000 }, { maxTokens: 256 });
    if (credentials.getSecret() !== credential) return c.json({ ok: false, error: "连接已变更，请重新选择。" }, 409);
    if (!probe.ok && !probeAnswered(probe)) return c.json({ ok: false, error: probe.error });
    credentials.set({ ...candidate, checkedAt: new Date().toISOString() }); providerRevision++;
    return c.json({ ok: true, ...credentials.status() });
  });
  app.post("/api/gpt/connect", async c => {
    const body = z.strictObject({ source: z.enum(["pi", "vivic"]).default("pi") }).safeParse(await readJson(c));
    if (!body.success) return c.json({ ok: false, error: "登录来源无效。" }, 400);
    const ok = await gpt.connect(body.data.source); providerRevision++; rememberGpt();
    return c.json({ ok, ...gpt.status() });
  });
  app.post("/api/gpt/login/start", async c => {
    const body = z.strictObject({}).safeParse(await readJson(c));
    if (!body.success) return c.json({ ok: false, error: "登录请求不接受额外配置。" }, 400);
    providerRevision++;
    return c.json({ ok: true, login: await gpt.startLogin() });
  });
  app.get("/api/gpt/login/status", c => { c.header("Cache-Control", "no-store"); return c.json({ login: gpt.loginStatus(), provider: gpt.status() }); });
  app.post("/api/gpt/login/input", async c => {
    const body = z.strictObject({ value: z.string().min(1).max(8192) }).safeParse(await readJson(c));
    if (!body.success) return c.json({ ok: false, error: "回调地址无效。" }, 400);
    return c.json({ ok: gpt.provideLoginInput(body.data.value) });
  });
  app.post("/api/gpt/login/cancel", c => { gpt.cancelLogin(); return c.json({ ok: true }); });
  app.post("/api/gpt/disconnect", async c => {
    providerRevision++; await gpt.disconnect();
    preferences?.update({ gptSource: undefined, gptModel: undefined });
    return c.json({ ok: true });
  });

  const clonedVoices = new WeakMap<object, Set<string>>();
  app.get("/api/speech/cloned-voices", c => {
    c.header("Cache-Control", "no-store");
    const credential = credentials.getSecret();
    return c.json({ voices: credential ? [...(clonedVoices.get(credential) ?? [])] : [] });
  });
  app.post("/api/speech/cloned-voices", bodyLimit({ maxSize: 4096 }), async c => {
    c.header("Cache-Control", "no-store");
    const input = CloneVoiceRequestSchema.safeParse(await readJson(c));
    if (!input.success) return c.json({ ok: false, error: "请提供有效 File ID、可选原文，并确认你有权使用该声音。" }, 400);
    const credential = credentials.getSecret();
    if (!credential) return c.json({ ok: false, error: "请先连接 StepFun Plan。" }, 503);
    try {
      const id = await cloneVoice(credential, input.data, { ...stepfun, timeoutMs: config.speechTimeoutMs ?? 15000 }, c.req.raw.signal);
      if (credentials.getSecret() !== credential || c.req.raw.signal.aborted) return c.json({ ok: false, error: "连接已变更，复刻结果未启用。" }, 503);
      const voices = clonedVoices.get(credential) ?? new Set<string>();
      if (voices.size >= 20) voices.delete(voices.values().next().value!);
      voices.add(id); clonedVoices.set(credential, voices);
      return c.json({ ok: true, id });
    } catch { return c.json({ ok: false, error: "Plan 音色复刻未完成，请检查文件时长、权限、额度或连接；没有切换计费接口。" }, 503); }
  });

  app.get("/api/speech/voices", (c) => {
    c.header("Cache-Control", "no-store");
    return c.json({
      model: SPEECH_MODEL, voices: SPEECH_VOICES, defaultVoice: DEFAULT_SPEECH_VOICE,
      speed: { min: 0.5, max: 2, default: 1 },
      source: SPEECH_VOICES_SOURCE, verifiedAt: "2026-10-15",
    });
  });

  app.post("/api/speech", bodyLimit({
    maxSize: 4096,
    onError: (c) => c.json({ ok: false, code: "speech-invalid-input", error: "语音请求体过大" }, 413),
  }), async (c) => {
    c.header("Cache-Control", "no-store");
    if (c.req.header("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
      return c.json({ ok: false, code: "speech-invalid-input", error: "语音请求必须使用 application/json" }, 415);
    }
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ ok: false, code: "speech-invalid-input", error: "请求体不是合法 JSON" }, 400);
    }
    const parsed = SpeechRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({
        ok: false, code: "speech-invalid-input",
        error: "语音请求仅接受 text（1–200 字符可见短句）、voice（可选官方音色）、speed（可选 0.5–2）、timestamps（可选布尔值）。",
      }, 400);
    }
    const credential = credentials.getSecret();
    if (!credential) {
      return c.json({ ok: false, code: "speech-disconnected", error: "语音不可用：请先连接 StepFun Coding Plan Key。" }, 503);
    }
    if (parsed.data.clonedVoiceId && !clonedVoices.get(credential)?.has(parsed.data.clonedVoiceId))
      return c.json({ ok: false, code: "speech-unknown-voice", error: "该复刻音色未在当前连接中确认，请重新复刻或使用官方音色。" }, 400);
    const result = await synthesizeSpeech(credential, parsed.data.text, {
      ...stepfun, timeoutMs: config.speechTimeoutMs ?? 15000,
    }, c.req.raw.signal, { ...parsed.data, ...(parsed.data.clonedVoiceId ? { voice: parsed.data.clonedVoiceId } : {}) });
    // A disconnect/reconnect during synthesis must not deliver stale audio.
    if (credentials.getSecret() !== credential) {
      return c.json({ ok: false, code: "speech-disconnected", error: "语音已取消：模型连接已变更。" }, 503);
    }
    if (!result.ok) {
      return c.json({ ok: false, code: result.code, error: result.error }, result.status);
    }
    if (parsed.data.timestamps) return c.json({ audioBase64: Buffer.from(result.audio).toString("base64"), words: result.words ?? [] });
    c.header("Content-Type", "audio/mpeg");
    c.header("X-Content-Type-Options", "nosniff");
    return c.body(result.audio, 200);
  });

  app.get("/api/decision/status", c => c.json(decision.status()));
  app.post("/api/decision/prepare", c => c.json(decision.prepare()));
  app.post("/api/decision/stop", c => c.json(decision.stop()));
  app.post("/api/decision/clear", c => c.json(decision.clear()));
  app.post("/api/decision/enable", c => c.json(decision.enable()));

  app.post("/api/intent", bodyLimit({ maxSize: 6 * 1024 * 1024,
    onError: c => c.json({ ok: false, error: "图片指令请求过大。" }, 413),
  }), async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "请求体不是合法 JSON" }, 400);
    }
    const parsed = IntentRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        { ok: false, error: `请求格式不正确：${firstIssue(parsed.error)}` },
        400,
      );
    }
    if (restoringGpt && activeProvider === "gpt") await restoringGpt;
    const version = providerRevision;
    const gptVersion = gpt.generation();
    const imageCredential = credentials.getSecret();
    if (parsed.data.attachments?.length) {
      const vision = activeProvider === "gpt" ? gpt.status().connected && gpt.status().capabilities.includes("vision")
        : credentials.status().connected && credentials.status().capabilities.includes("vision");
      if (!vision) return c.json({ kind: "error", message: "当前所选模型没有可用的视觉能力。请选择支持图片的模型，或移除图片后发送文字。" });
      try {
        for (const attachment of parsed.data.attachments) await validateImageAttachment(attachment, deps.imageDecoder ?? decodeImage);
      } catch (error) { return c.json({ kind: "error", message: imageInputErrorMessage(error) }); }
      if (c.req.raw.signal.aborted) return c.json({ kind: "error", message: "图片请求已取消。" });
      if (version !== providerRevision || (activeProvider === "gpt" ? !gpt.isCurrent(gptVersion) : imageCredential !== credentials.getSecret())) {
        return c.json({ kind: "error", message: "模型连接已变更，图片请求已取消。" });
      }
    }
    const result = await runIntent(parsed.data, { credentials, stepfun, search, data, decision,
      isSessionCurrent: () => version === providerRevision,
      ...(activeProvider === "gpt" ? { planner: { provider: "gpt" as const, connected: gpt.status().connected,
        generate: (messages, signal) => gpt.generate(messages, signal), isCurrent: () => gpt.isCurrent(gptVersion) } } : {}),
    }, c.req.raw.signal);
    const wire = IntentResponseSchema.safeParse(result);
    if (!wire.success) {
      return c.json({ ok: false, error: "内部结果未能通过响应校验" }, 500);
    }
    return c.json(wire.data);
  });

  app.route("/api", createAsrRoutes({ config, credentials, fetchImpl: deps.fetchImpl }));
  if (search) app.route("/api", createSearchRoutes({ client: search }));
  else app.post("/api/search", c => c.json({ ok: false, error: "联网查询未启用。" }, 503));
  return Object.assign(app, { dispose: () => decision.stop() });
};
