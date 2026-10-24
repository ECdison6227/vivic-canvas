import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { DiagnosticEvent } from "../src/diagnostics.js";
import { authed, emptyContext, testConfig } from "./helpers.js";

describe("intent progress and metadata diagnostics", () => {
  it("streams ordered progress and one schema-valid final result using the existing authenticated route", async () => {
    const events: DiagnosticEvent[] = [];
    const app = createApp({ config: testConfig(), onDiagnostic: event => events.push(event) });
    try {
      const response = await app.request("/api/intent", { method: "POST", headers: { ...authed, accept: "text/event-stream" },
        body: JSON.stringify({ text: "倒计时一分钟", canvasContext: emptyContext() }) });
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      const id = response.headers.get("x-request-id"); expect(id).toBeTruthy();
      const text = await response.text();
      expect(text.indexOf("event: accepted")).toBeLessThan(text.indexOf("event: progress"));
      expect(text.indexOf("event: progress")).toBeLessThan(text.indexOf("event: result"));
      expect(text.match(/event: result/g)).toHaveLength(1);
      const final = JSON.parse(text.split("event: result\ndata: ")[1]!.trim());
      expect(final).toMatchObject({ kind: "envelope", usedProvider: "rules" });
      expect(events).toContainEqual(expect.objectContaining({ event: "intent.stage", requestId: id, stage: "rules" }));
      const log = JSON.stringify(events);
      for (const privateValue of ["倒计时一分钟", authed.authorization, "test-token-0123456789"]) expect(log).not.toContain(privateValue);
    } finally { app.dispose(); }
  });
  it("preserves authentication, strict input validation and JSON clients", async () => {
    const app = createApp({ config: testConfig(), onDiagnostic: () => { throw new Error("observer failure"); } });
    try {
      expect((await app.request("/api/intent/stream", { method: "POST" })).status).toBe(401);
      expect((await app.request("/api/intent/stream", { method: "POST", headers: authed, body: "{}" })).status).toBe(400);
      const ordinary = await app.request("/api/intent", { method: "POST", headers: authed,
        body: JSON.stringify({ text: "倒计时一分钟", canvasContext: emptyContext() }) });
      expect(ordinary.headers.get("content-type")).toContain("application/json");
      expect(await ordinary.json()).toMatchObject({ kind: "envelope" });
    } finally { app.dispose(); }
  });
  it("refreshes demo facts only via the validated adapter route", async () => {
    const query = { kind: "hotel", destination: "杭州", nights: 2 };
    const fetchImpl = vi.fn<typeof fetch>();
    const app = createApp({ config: testConfig(), fetchImpl });
    try {
      const response = await app.request("/api/travel/refresh", { method: "POST", headers: authed, body: JSON.stringify({ query }) });
      expect(await response.json()).toMatchObject({ kind: "travel", card: { type: "TravelOffersCard", displayProps: { query, mode: "demo" }, sourceData: { provider: "vivic-demo" } } });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect((await app.request("/api/travel/refresh", { method: "POST", headers: authed,
        body: JSON.stringify({ query, items: [{ price: 1 }] }) })).status).toBe(400);
    } finally { app.dispose(); }
  });
});
