import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryDB } from "@/persistence/db";
import { canvasStore } from "@/state/canvasStore";
import { createMemoryHub } from "@/sync/channel";
import { createMemoryLockProvider } from "@/sync/testing";
import { createControlHost } from "@/sync/controlHost";
import { postIntent } from "@/ai/api";
import { executeRemoteText } from "../executeRemoteText";
vi.mock("@/ai/api", async original => ({ ...await original<typeof import("@/ai/api")>(), postIntent: vi.fn() }));
const stops: Array<() => void> = [];
afterEach(() => { stops.splice(0).forEach(stop => stop()); vi.resetAllMocks(); });
async function setup() {
  const host = createControlHost({ db: createMemoryDB(), store: canvasStore, channel: createMemoryHub().createChannel(),
    lockProvider: createMemoryLockProvider(), reminderPollMs: 1e8 });
  stops.push(host.stop); await host.start();
  const canvasId = host.getSnapshot().activeCanvasId!;
  const context = { requestId: "remote-test", signal: new AbortController().signal, isCurrent: () => true };
  return { host, canvasId, context };
}
describe("formal remote text executor", () => {
  it("awaits durable confirmation before reporting a single successful commit", async () => {
    const { host, canvasId, context } = await setup();
    vi.mocked(postIntent).mockResolvedValue({ kind: "envelope", envelope: { schemaVersion: "0.6", requestId: "backend-test", canvasId,
      actions: [{ type: "canvas.fit" }] } });
    const dispatch = vi.spyOn(host, "dispatch"), flush = vi.spyOn(host, "flush");
    let finish!: () => void; flush.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    let finished = false;
    const result = executeRemoteText(host, "请求测试模型理解文字", context, () => false).then(value => { finished = true; return value; });
    await vi.waitFor(() => expect(flush).toHaveBeenCalledOnce());
    expect(dispatch).toHaveBeenCalledOnce(); expect(finished).toBe(false);
    finish(); expect((await result).ok).toBe(true);
  });
  it("drops an old model result when the lease or desktop priority changes", async () => {
    const { host, canvasId, context } = await setup();
    let resolve!: (value: Awaited<ReturnType<typeof postIntent>>) => void;
    vi.mocked(postIntent).mockImplementation(() => new Promise(done => { resolve = done; }));
    const dispatch = vi.spyOn(host, "dispatch"); let busy = false;
    const result = executeRemoteText(host, "理解一个测试指令", context, () => busy);
    busy = true;
    resolve({ kind: "envelope", envelope: { schemaVersion: "0.6", requestId: "late-test", canvasId, actions: [{ type: "canvas.fit" }] } });
    expect((await result).ok).toBe(false); expect(dispatch).not.toHaveBeenCalled();
  });
  it("surfaces uncertain storage after a committed action as an exception for connector unknown", async () => {
    const { host, context } = await setup();
    vi.spyOn(host, "flush").mockRejectedValue(new Error("fixture save failed"));
    const dispatch = vi.spyOn(host, "dispatch");
    await expect(executeRemoteText(host, "显示全部卡片", context, () => false)).rejects.toThrow("fixture save failed");
    expect(dispatch).toHaveBeenCalledOnce();
  });
  it("does not start parsing or network work for cancelled or busy requests", async () => {
    const { host, context } = await setup(); const dispatch = vi.spyOn(host, "dispatch");
    expect((await executeRemoteText(host, "显示全部卡片", { ...context, signal: AbortSignal.abort() }, () => false)).ok).toBe(false);
    expect((await executeRemoteText(host, "显示全部卡片", context, () => true)).ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled(); expect(postIntent).not.toHaveBeenCalled();
  });
});
