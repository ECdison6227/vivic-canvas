import type { ActionEnvelope } from "@/contracts";
import type { CardState, VivicState } from "@/state/canvasStore";
import type { Attachment } from "./attachments";
import { completedCountdown } from "@/canvas/reminderPresentation";
import type { DeviceFix } from "@/location/deviceLocation";
import type { CardRecord } from "@/contracts";

/**
 * Browser-side client for the local decision API. All traffic is same-origin
 * through the Vite dev proxy, which injects the session bearer server-side —
 * this code never sees the token, and StepFun keys only ever travel browser
 * → same-origin proxy → loopback API body (never stored client-side).
 */

export interface ProviderStatus {
  name: "stepfun" | "gpt";
  connected: boolean;
  capabilities: string[];
  models?: string[];
  defaultModel?: string;
  checkedAt?: string;
  lastError?: string;
  source?: "pi" | "vivic";
  route?: "openai" | "openai-codex";
}

export interface ProvidersStatusResponse {
  activeProvider?: "stepfun" | "gpt";
  providers: ProviderStatus[];
  degradations: Array<{ code: string; message: string }>;
}

export interface IntentResult {
  kind: "envelope" | "clarify" | "unknown" | "error" | "locale";
  /** Answer to "我在哪里"; already phrased for display and speech. */
  locale?: { name: string; admin1?: string; country?: string; basis: "device" | "network"; answer: string };
  envelope?: ActionEnvelope;
  message?: string;
  suggestions?: string[];
  usedProvider?: "rules" | "stepfun" | "gpt" | "rules-offline" | "search" | "decision";
}

export interface CanvasContextPayload {
  timeZone?: string;
  canvasId: string;
  stage: VivicState["stage"];
  viewport: VivicState["viewport"];
  focusHistory: string[];
  cards: Array<{
    id: string;
    type: string;
    aliases?: string[];
    displayProps: Record<string, unknown>;
    sourceDataSummary: Record<string, unknown>;
    layout: { x: number; y: number };
  }>;
}

const secretFields = new Set(["apikey", "token", "secret"]);

/** Whitelist summary so provider keys/real source URLs never leak context. */
const summarizeSourceData = (
  record: CardState["record"],
): Record<string, unknown> => {
  if (record.type === "CountdownCard") return { ...record.sourceData };
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record.sourceData)) {
    if (key === "articleText" && typeof value === "string") { out[key] = `[${value.length} chars, retained on the source card]`; continue; }
    if (secretFields.has(key.toLowerCase())) continue;
    if (["string", "number", "boolean"].includes(typeof value) || value === null) {
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = `[${value.length} items]`;
    } else {
      out[key] = "[object]";
    }
  }
  return out;
};

export const buildCanvasContext = (
  state: VivicState,
  canvasId: string,
): CanvasContextPayload => ({
  canvasId,
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  stage: state.stage,
  viewport: state.viewport,
  focusHistory: state.focusHistory,
  cards: state.cards
    .filter((c) => !c.exitingRequestId && !completedCountdown(c))
    .map((entry) => ({
      id: entry.record.id,
      type: entry.record.type,
      aliases: entry.record.metadata.aliases,
      displayProps: entry.record.displayProps as Record<string, unknown>,
      sourceDataSummary: summarizeSourceData(entry.record),
      layout: { x: entry.record.layout.x, y: entry.record.layout.y },
    })),
});

const post = async <T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`api ${res.status}`);
  return (await res.json()) as T;
};

export const getProvidersStatus = async (): Promise<ProvidersStatusResponse> => {
  const res = await fetch("/api/providers/status");
  if (!res.ok) throw new Error(`api ${res.status}`);
  return (await res.json()) as ProvidersStatusResponse;
};

export const validateStepfunKey = (
  apiKey: string,
): Promise<{ ok: boolean; connected: boolean; error?: string; models?: string[]; defaultModel?: string }> =>
  post("/api/credentials/stepfun/validate", { apiKey });

export const disconnectStepfun = (): Promise<{ ok: boolean; connected: boolean }> =>
  post("/api/credentials/stepfun/disconnect", {});

export const postIntent = (
  text: string,
  canvasContext: CanvasContextPayload,
  signal?: AbortSignal,
  attachments?: Attachment[],
  continuation?: { utterance: string; question: string },
  deviceLocation?: DeviceFix | null,
): Promise<IntentResult> => post("/api/intent", { text, canvasContext, ...(attachments?.length ? { attachments } : {}), ...(continuation ? { continuation } : {}),
  ...(deviceLocation ? { deviceLocation } : {}) }, signal);

/** Verified fields for a "where I am" WeatherCard; Control swaps them into the existing card. */
export type WeatherHereFields = Pick<CardRecord, "displayProps" | "sourceData" | "sources"> & { aliases: string[] };
export type WeatherHereResult = ({ kind: "weather" } & WeatherHereFields) | { kind: "clarify" | "error"; message: string };
export const fetchWeatherHere = (deviceLocation: DeviceFix | null, signal?: AbortSignal): Promise<WeatherHereResult> =>
  post("/api/weather/here", deviceLocation ? { deviceLocation } : {}, signal);
