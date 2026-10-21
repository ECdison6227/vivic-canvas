import { describe, expect, it, vi } from "vitest";
import { readIntentStream } from "../intentStream";

const response = (chunks: string[]) => new Response(new ReadableStream({ start(controller) {
  chunks.forEach(chunk => controller.enqueue(new TextEncoder().encode(chunk))); controller.close();
} }), { headers: { "content-type": "text/event-stream" } });
const accepted = 'event: accepted\ndata: {"requestId":"r1"}\n\n';
const result = 'event: result\ndata: {"kind":"clarify","message":"需要日期"}\n\n';

describe("bounded SSE intent parser", () => {
  it("handles fragmented CRLF frames, filters foreign progress, and returns a final result once", async () => {
    const onProgress = vi.fn();
    const progress = 'event: progress\r\ndata: {"requestId":"r1","stage":"planner","status":"started"}\r\n\r\n';
    const foreign = 'event: progress\ndata: {"requestId":"stale","stage":"planner","status":"started"}\n\n';
    const stream = accepted + foreign + progress + result;
    expect(await readIntentStream(response([stream.slice(0, 19), stream.slice(19, 90), stream.slice(90)]), onProgress))
      .toEqual({ kind: "clarify", message: "需要日期" });
    expect(onProgress).toHaveBeenCalledOnce();
  });
  it("rejects incomplete, malformed or uncorrelated action results", async () => {
    await expect(readIntentStream(response([accepted]), () => {})).rejects.toThrow("提前结束");
    await expect(readIntentStream(response([result]), () => {})).rejects.toThrow("会话标识");
    await expect(readIntentStream(response([accepted + 'event: result\ndata: {"kind":"envelope","envelope":{"actions":[{"type":"eval"}]}}\n\n']), () => {})).rejects.toThrow();
  });
  it("accepts JSON test/backward-compatible responses and honors cancellation", async () => {
    expect(await readIntentStream(Response.json({ kind: "unknown", message: "TEST" }), () => {})).toMatchObject({ kind: "unknown" });
    const controller = new AbortController(); controller.abort();
    await expect(readIntentStream(response([accepted + result]), () => {}, controller.signal)).rejects.toThrow();
  });
});
