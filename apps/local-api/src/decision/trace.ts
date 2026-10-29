import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ROUTES } from "@vivic/contracts";
import type { IntentRequest, IntentResult, PipelineDeps } from "../intent/pipeline.js";
import { splitClauses } from "./split.js";
import { resolveTarget } from "./target.js";

const route = z.enum(Object.keys(ROUTES) as [keyof typeof ROUTES, ...Array<keyof typeof ROUTES>]);
const target = z.union([z.strictObject({ targetId: z.string().max(128) }),
  z.strictObject({ missing: z.literal(true) }), z.strictObject({ ambiguous: z.array(z.strictObject({
    id: z.string().max(128), label: z.string().max(500),
  })).max(40) })]);
const decision = z.strictObject({ text: z.string().max(500), route: route.nullable(),
  probability: z.number().min(0).max(1), probabilities: z.record(z.string(), z.number().min(0).max(1)),
  none: z.boolean(), latencyMs: z.number().nonnegative(), failed: z.boolean(), target: target.optional() });
export const DecisionTraceSchema = z.strictObject({
  id: z.string().max(128), mode: z.enum(["shadow", "on"]), status: z.enum(["pending", "complete", "failed"]),
  taskId: z.string().max(128).optional(),
  clauses: z.array(z.string().max(500)).max(3), decisions: z.array(decision).max(3),
  route: route.nullable(), probability: z.number().min(0).max(1), target: target.optional(),
  latencyMs: z.number().nonnegative(), routeLatencyMs: z.number().nonnegative(),
  legacyElapsedMs: z.number().nonnegative(), shadowWaitMs: z.number().nonnegative(),
  failedCount: z.int().min(0).max(3), legacyKind: z.string().max(32),
  legacyUsedProvider: z.string().max(32).optional(), legacyActionTypes: z.array(z.string().max(80)).max(32),
  legacyCardTypes: z.array(z.string().max(80)).max(32),
});
export type DecisionTrace = z.infer<typeof DecisionTraceSchema>;

/** Advisory only. The old execution path remains authoritative in shadow mode. */
export async function observeDecision(req: IntentRequest, deps: PipelineDeps, signal: AbortSignal | undefined,
  legacy: () => Promise<IntentResult>): Promise<IntentResult> {
  if (deps.router?.mode !== "shadow" || req.task?.receipt || req.task?.cancel) return legacy();
  const router = deps.router, clauses = splitClauses(req.text), id = `decision_${randomUUID()}`;
  const start = performance.now(), controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  let rows: DecisionTrace["decisions"] | undefined;
  let decisionElapsedMs: number | undefined;
  const pending = (async () => {
    const output: DecisionTrace["decisions"] = [];
    let shadowContext = req.canvasContext;
    for (const text of clauses) {
      const clauseStarted = performance.now();
      try {
        const value = await router.routeUtterance(text, shadowContext, controller.signal);
        const selected = value?.route ? await resolveTarget(text, shadowContext, value.route, router, controller.signal) : undefined;
        output.push(value ? { text, ...value, failed: false, ...(selected ? { target: selected } : {}) }
          : { text, route: null, probability: 0, probabilities: {}, none: true, latencyMs: Math.round(performance.now() - clauseStarted), failed: true });
        if (value?.route === "focus" && value.probability >= .8 && selected && "targetId" in selected) {
          shadowContext = { ...shadowContext, focusHistory: [...shadowContext.focusHistory, selected.targetId].slice(-20) };
        }
      } catch {
        output.push({ text, route: null, probability: 0, probabilities: {}, none: true, latencyMs: Math.round(performance.now() - clauseStarted), failed: true });
      }
    }
    rows = output;
    decisionElapsedMs = Math.round(performance.now() - start);
    return output;
  })();
  let result: IntentResult;
  try { result = await legacy(); }
  catch (error) {
    controller.abort(); signal?.removeEventListener("abort", abort);
    throw error;
  }
  const legacyElapsedMs = Math.round(performance.now() - start);
  const waitStarted = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Leave 50ms of the 300ms public budget for serialization and transport.
    if (!rows) await Promise.race([pending, new Promise<void>(resolve => { timer = setTimeout(resolve, 250); })]);
  } finally {
    if (timer) clearTimeout(timer);
    // A completed SSE stream aborts its transport controller. Do not cancel the
    // detached read-only observation after an otherwise successful response.
    signal?.removeEventListener("abort", abort);
  }
  const shadowWaitMs = Math.round(performance.now() - waitStarted);
  const build = (): DecisionTrace => {
    const first = rows?.[0], failures = rows?.filter(row => row.failed).length ?? 0;
    const actions = result.envelope?.actions ?? [];
    return { id, mode: "shadow", status: !rows ? "pending" : failures ? "failed" : "complete",
      ...(req.task?.id ? { taskId: req.task.id } : {}),
      clauses, decisions: rows ?? [], route: first?.route ?? null, probability: first?.probability ?? 0,
      ...(first?.target ? { target: first.target } : {}),
      latencyMs: decisionElapsedMs ?? Math.round(performance.now() - start), routeLatencyMs: first?.latencyMs ?? 0,
      legacyElapsedMs, shadowWaitMs, failedCount: failures, legacyKind: result.kind,
      ...(result.usedProvider ? { legacyUsedProvider: result.usedProvider } : {}),
      legacyActionTypes: [...actions.map(action => action.type), ...(result.hostOperation ? [result.hostOperation.kind] : [])],
      legacyCardTypes: actions.flatMap(action => action.type === "card.create" ? [action.card.type] : []),
    };
  };
  const returned = build();
  const record = (trace: DecisionTrace) => {
    setImmediate(() => {
      try { void Promise.resolve(deps.onDecisionTrace?.(req, trace, result)).catch(() => {}); }
      catch { /* observer failure is noncritical */ }
    });
  };
  record(returned);
  if (!rows) void pending.then(() => record(build())).catch(() => {});
  const valid = DecisionTraceSchema.safeParse(returned);
  return valid.success ? { ...result, trace: valid.data } : result;
}
