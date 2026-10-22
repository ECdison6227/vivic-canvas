import { afterEach, describe, expect, it, vi } from "vitest";
import { createComputerConnector, type ComputerHostAdapter } from "../connector";
import { MAX_FRAME_BYTES, parseFrame, type CanvasSnapshot, type Command, type Frame, type Welcome } from "../protocol";
import type { Transport, TransportEvent } from "../transport";

class FakeTransport implements Transport {
  listeners = new Set<(event: TransportEvent) => void>();
  sent: Frame[] = [];
  connect() { this.listeners.forEach(l => l({ type: "open" })); }
  close() {}
  send(frame: Frame) { this.sent.push(frame); return true; }
  subscribe(listener: (event: TransportEvent) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  receive(frame: Frame) { this.listeners.forEach(l => l({ type: "message", frame })); }
  disconnect() { this.listeners.forEach(l => l({ type: "disconnect", reason: "offline" })); }
}
const welcome: Welcome = { v: 1, type: "welcome", sessionId: "session", deviceId: "computer", computerId: "computer", epoch: "epoch",
  expiresAt: Date.now() + 600000, permissions: ["text.submit", "canvas.switch", "card.pin"], token: "dedicated-test-token-123456", controllers: [{ deviceId: "phone", permissions: ["text.submit", "canvas.switch", "card.pin"] }] };
const command = (patch: Partial<Command> = {}): Command => ({ v: 1, type: "command", sessionId: "session", deviceId: "phone", epoch: "epoch",
  requestId: "request", canvasId: "canvas", ownerEpoch: "owner", expectedVersion: 1, operation: { kind: "text.submit", text: "hello" }, ...patch });
const running: Array<ReturnType<typeof createComputerConnector>> = [];
afterEach(() => { running.splice(0).forEach(c => c.stop()); vi.useRealTimers(); });
async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
function setup(maxRequests = 512) {
  const transport = new FakeTransport();
  let snapshot: CanvasSnapshot = { computerName: "DEMO", ownerAvailable: true, ownerEpoch: "owner", activeCanvasId: "canvas", version: 1,
    canvases: [{ id: "canvas", title: "Canvas", version: 1 }, { id: "other", title: "Other", version: 0 }], cards: [{ id: "note", title: "Note", type: "NoteCard", pinned: false }] };
  const host: ComputerHostAdapter = { getSnapshot: () => snapshot, subscribe: () => () => {},
    submitText: vi.fn(async (_text, context) => context.isCurrent() ? { ok: true, message: "committed" } : { ok: false, message: "not committed" }),
    switchCanvas: vi.fn(id => { snapshot = { ...snapshot, activeCanvasId: id }; return { ok: true, message: "switched" }; }),
    setCardPinned: vi.fn(() => ({ ok: true, message: "pinned" })) };
  const connector = createComputerConnector({ transport, host, deviceId: "computer", deviceName: "DEMO", accessKey: "dedicated-test-access-key", maxRequests });
  running.push(connector); connector.start(); transport.receive(welcome);
  return { transport, host, connector, update: (patch: Partial<CanvasSnapshot>) => { snapshot = { ...snapshot, ...patch }; }, results: () => transport.sent.filter((f): f is Extract<Frame, {type:"result"}> => f.type === "result") };
}

describe("owner authorization, leases and exactly-once admission", () => {
  it("restores owner availability after an invalid snapshot recovers", () => {
    const { transport, host, connector } = setup();
    const original = host.getSnapshot;
    host.getSnapshot = () => { throw new Error("temporarily unavailable"); };
    transport.receive({ v: 1, type: "snapshot.request", sessionId: "session", epoch: "epoch", deviceId: "phone" });
    expect(transport.sent.at(-1)).toMatchObject({ type: "owner.status", available: false });
    expect(connector.getSnapshot().error).toContain("停止控制");
    host.getSnapshot = original;
    transport.receive({ v: 1, type: "snapshot.request", sessionId: "session", epoch: "epoch", deviceId: "phone" });
    expect(transport.sent.filter(frame => frame.type === "owner.status").at(-1)).toMatchObject({ available: true });
    expect(connector.getSnapshot().error).toBeNull();
  });
  it("ignores a queued welcome after the connector has stopped", () => {
    const { transport, connector } = setup();
    const queued = [...transport.listeners]; connector.stop();
    const count = transport.sent.length;
    queued.forEach(listener => listener({ type: "message", frame: welcome }));
    expect(connector.getSnapshot().status).toBe("stopped");
    expect(transport.sent).toHaveLength(count);
  });
  it("fits worst-case UTF-8 summaries into the wire limit and retains the active canvas", () => {
    const { transport, update } = setup();
    update({
      activeCanvasId: "canvas_99",
      canvases: Array.from({ length: 100 }, (_, i) => ({ id: `canvas_${i}_${"x".repeat(80)}`.slice(0, 100), title: "旅".repeat(160), version: 1 })).map((canvas, i) => i === 99 ? { ...canvas, id: "canvas_99" } : canvas),
      cards: Array.from({ length: 200 }, (_, i) => ({ id: `card_${i}_${"x".repeat(80)}`, title: "备".repeat(160), type: "卡".repeat(80), pinned: false })),
    });
    transport.receive({ v: 1, type: "snapshot.request", sessionId: "session", epoch: "epoch", deviceId: "phone" });
    const frame = transport.sent.at(-1);
    expect(frame?.type).toBe("snapshot");
    expect(Buffer.byteLength(JSON.stringify(frame))).toBeLessThanOrEqual(MAX_FRAME_BYTES);
    expect(parseFrame(JSON.stringify(frame))).not.toBeNull();
    if (frame?.type === "snapshot") expect(frame.state.canvases.some(canvas => canvas.id === "canvas_99")).toBe(true);
  });
  it("returns a terminal rejection when host snapshot reads throw and keeps later commands usable", async () => {
    const { transport, host, results } = setup(); const original = host.getSnapshot;
    host.getSnapshot = () => { throw new Error("host read failed"); };
    transport.receive(command()); await flush();
    expect(results().at(-1)).toMatchObject({ requestId: "request", status: "rejected" });
    expect(results().at(-1)).not.toHaveProperty("version");
    host.getSnapshot = original;
    transport.receive(command({ requestId: "after-recovery" })); await flush();
    expect(results().at(-1)).toMatchObject({ requestId: "after-recovery", status: "succeeded" });
  });
  it("removes a redeemed single-use pairing code from the computer state", () => {
    const { transport,connector }=setup();
    transport.receive({v:1,type:"pairing",sessionId:"session",epoch:"epoch",deviceId:"computer",pairCode:"PAIRCODE12",pairExpiresAt:Date.now()+120000});
    expect(connector.getSnapshot().pairCode).toBe("PAIRCODE12");
    transport.receive({v:1,type:"controller",sessionId:"session",epoch:"epoch",deviceId:"new-phone",state:"joined",permissions:["text.submit"]});
    expect(connector.getSnapshot()).toMatchObject({pairCode:null,pairExpiresAt:null});
  });
  it("rejects unauthorized devices and foreign epochs before touching the owner", async () => {
    const { transport, host } = setup();
    transport.receive(command({ deviceId: "intruder" })); transport.receive(command({ epoch: "old" })); transport.receive(command({ sessionId: "other" }));
    await flush(); expect(host.submitText).not.toHaveBeenCalled();
  });
  it("deduplicates writes, rejects an ID collision, and answers without executing again", async () => {
    const { transport, host, results } = setup();
    transport.receive(command()); transport.receive(command()); await flush();
    transport.receive(command()); transport.receive(command({ operation: { kind: "text.submit", text: "changed" } })); await flush();
    expect(host.submitText).toHaveBeenCalledTimes(1);
    expect(results().filter(r => r.status === "succeeded")).toHaveLength(2);
    expect(results().at(-1)?.status).toBe("rejected");
  });
  it("records stale version/owner rejections so they cannot later acquire a new write lease", async () => {
    const { transport, host, update, results } = setup(); update({ version: 2 });
    transport.receive(command()); await flush(); update({ version: 1 }); transport.receive(command());
    transport.receive(command({ requestId: "wrong-owner", ownerEpoch: "former-owner" })); await flush();
    expect(host.submitText).not.toHaveBeenCalled(); expect(results().every(r => r.status === "rejected")).toBe(true);
  });
  it("prevents a revoked device from committing asynchronous work", async () => {
    const { transport, host, results } = setup(); let finish!: () => void;
    const commit = vi.fn();
    host.submitText = vi.fn(async (_text, context) => { await new Promise<void>(resolve => { finish = resolve; }); if (!context.isCurrent()) return { ok: false, message: "cancelled before commit" }; commit(); return { ok: true, message: "committed" }; });
    transport.receive(command()); await flush();
    transport.receive({ v:1, type:"controller", sessionId:"session", epoch:"epoch", deviceId:"phone", state:"left", permissions:[] });
    finish(); await flush();
    expect(commit).not.toHaveBeenCalled(); expect(results()).toHaveLength(0);
  });
  it("revokes locally before relay acknowledgement and does not restore that device on a late joined event", async () => {
    const { transport, host, connector } = setup(); let finish!: () => void; const commit=vi.fn();
    host.submitText = vi.fn(async (_text,context) => { await new Promise<void>(resolve=>{finish=resolve;}); if (!context.isCurrent()) return {ok:false,message:"not committed"}; commit(); return {ok:true,message:"done"}; });
    transport.receive(command()); await flush(); connector.revoke("phone");
    transport.receive({v:1,type:"controller",sessionId:"session",epoch:"epoch",deviceId:"phone",state:"joined",permissions:["text.submit"]});
    finish(); await flush();
    transport.receive(command({requestId:"after-revoke"})); await flush();
    expect(commit).not.toHaveBeenCalled(); expect(host.submitText).toHaveBeenCalledTimes(1); expect(connector.getSnapshot().controllers).toHaveLength(0);
  });
  it("revokes the relay session on explicit stop and forbids reusing an ended connector", () => {
    const { transport,connector }=setup(); connector.stop();
    expect(transport.sent.at(-1)).toMatchObject({type:"revoke",sessionId:"session"});
    const count=transport.sent.length; connector.start(); expect(transport.sent).toHaveLength(count);
    expect(connector.getSnapshot().status).toBe("stopped");
  });
  it("cancels a queued operation without claiming that an executing operation was undone", async () => {
    const { transport, host, results } = setup(); let finish!: () => void;
    host.submitText = vi.fn(async () => { await new Promise<void>(resolve => { finish = resolve; }); return { ok: true, message: "committed already" }; });
    transport.receive(command()); transport.receive(command({ requestId: "queued" })); await flush();
    transport.receive({ v:1,type:"cancel",sessionId:"session",epoch:"epoch",deviceId:"phone",requestId:"queued",canvasId:"canvas" });
    transport.receive({ v:1,type:"cancel",sessionId:"session",epoch:"epoch",deviceId:"phone",requestId:"request",canvasId:"canvas" });
    expect(results().find(r => r.requestId === "queued")?.status).toBe("cancelled");
    expect(results().find(r => r.requestId === "request")?.status).toBe("unknown");
    finish(); await flush(); expect(results().at(-1)?.status).toBe("succeeded"); expect(host.submitText).toHaveBeenCalledTimes(1);
  });
  it("does not leak another controller's result or invent an unknown request execution", async () => {
    const { transport, host, results } = setup(); transport.receive(command()); await flush();
    transport.receive({ v:1,type:"controller",sessionId:"session",epoch:"epoch",deviceId:"phone2",state:"joined",permissions:["text.submit"] });
    transport.receive({ v:1,type:"query",sessionId:"session",epoch:"epoch",deviceId:"phone2",requestId:"request",canvasId:"canvas" });
    expect(results().at(-1)).toMatchObject({ forDeviceId:"phone2",status:"unknown" });
    transport.receive({ v:1,type:"query",sessionId:"session",epoch:"epoch",deviceId:"phone",requestId:"request",canvasId:"other" });
    expect(results().at(-1)?.status).toBe("unknown"); expect(host.submitText).toHaveBeenCalledTimes(1);
  });
  it("fails closed on bounded dedup capacity instead of evicting IDs and replaying writes", async () => {
    const { transport, host, results } = setup(1);
    transport.receive(command()); await flush(); transport.receive(command({ requestId:"second" })); await flush(); transport.receive(command()); await flush();
    expect(host.submitText).toHaveBeenCalledTimes(1); expect(results().find(r => r.requestId === "second")?.status).toBe("rejected");
  });
  it("blocks foreign canvas/card IDs and limits operations to the runtime schema whitelist", async () => {
    const { transport, host, results } = setup();
    transport.receive(command({ canvasId:"other" }));
    transport.receive(command({ requestId:"card",operation:{kind:"card.pin",cardId:"missing",pinned:true} })); await flush();
    expect(host.setCardPinned).not.toHaveBeenCalled(); expect(host.submitText).not.toHaveBeenCalled(); expect(results().every(r => r.status === "rejected")).toBe(true);
    expect(parseFrame({ ...command(), operation:{ kind:"api.forward",url:"/delete" } })).toBeNull();
    expect(parseFrame({ ...command(), token:"no-secret-fields" })).toBeNull();
    expect(parseFrame({ ...command(), operation:{kind:"text.submit",text:"x".repeat(4001)} })).toBeNull();
  });
});
