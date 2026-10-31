import { describe, expect, it } from "vitest";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { createHostedEvents } from "../src/hosted/events.js";
import { HostedSpaceStore, type SpaceIdentity } from "../src/space/store.js";

const origin = "https://unit.test";
const request = (route: string, body?: unknown) => new Request(origin + route, {
  method: body ? "POST" : "GET", headers: { origin, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}),
});
async function setup() {
  const folder = mkdtempSync(path.join(tmpdir(), "vivic-events-"));
  let store = new HostedSpaceStore({ dataDir: folder, inviteCode: "TEST-event-invite-one" });
  const a = await store.register({ username: "test_events_a", password: "TEST-password-a", invite: "TEST-event-invite-one" });
  store.dispose(); store = new HostedSpaceStore({ dataDir: folder, inviteCode: "TEST-event-invite-two" });
  const b = await store.register({ username: "test_events_b", password: "TEST-password-b", invite: "TEST-event-invite-two" });
  const phone = await store.login({ username: "test_events_a", password: "TEST-password-a" });
  const hub = createHostedEvents(store); const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
  async function stream(identity: SpaceIdentity) {
    const response = await hub.handle(request("/api/space/events"), identity);
    const reader = response!.body!.getReader(); readers.push(reader);
    await next(reader, "ready"); await next(reader, "display.status"); return reader;
  }
  async function done() {
    hub.dispose(); await Promise.all(readers.map(reader => reader.cancel())); store.dispose();
    const target = realpathSync(folder); expect(path.dirname(target)).toBe(realpathSync(tmpdir()));
    expect(path.basename(target)).toMatch(/^vivic-events-/); rmSync(target, { recursive: true, force: true });
  }
  return { store, hub, a: a.identity, b: b.identity, phone: phone.identity, stream, done,
    space: store.listSpaces(a.identity.accountId)[0]!.id };
}
async function next(reader: ReadableStreamDefaultReader<Uint8Array>, type: string): Promise<Record<string, unknown>> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(Error("TEST stream timeout")), 2500); }),
      (async () => { for (;;) {
        const chunk = await reader.read(); if (chunk.done) throw Error("TEST stream closed");
        const value = JSON.parse(new TextDecoder().decode(chunk.value).slice(6).trim());
        if (value.type === type) return value;
      } })()]);
  } finally { clearTimeout(timer!); }
}

describe("account metadata event streams", () => {
  it("observes committed changes across accounts without leaking another account's metadata", async () => {
    const f = await setup();
    try {
      const a = await f.stream(f.a), b = await f.stream(f.b);
      f.store.applyCommand(f.a.accountId, f.space, { requestId: "TEST-note", expectedVersion: 0, command: { type: "note.create", text: "TEST private card content" } }, f.a.device.id);
      const changed = await next(a, "space.changed"); expect(changed.spaceId).toBe(f.space); expect(changed.version).toBe(1);
      expect(JSON.stringify(changed)).not.toContain("private card content"); expect(JSON.stringify(changed)).not.toContain(f.a.accountId);
      let leaked = false; const pending = b.read().then(result => { leaked = !result.done; });
      await new Promise(resolve => setTimeout(resolve, 650)); expect(leaked).toBe(false);
      await b.cancel(); await pending;
    } finally { await f.done(); }
  });
  it("replaces a device's previous stream and closes it after device revocation", async () => {
    const f = await setup();
    try {
      const first = await f.stream(f.a); const second = await f.stream(f.a);
      expect((await first.read()).done).toBe(true); expect(f.hub.activeCount()).toBe(1);
      f.store.revokeDevice(f.a.accountId, f.a.device.id, f.a.device.id);
      expect((await second.read()).done).toBe(true);
    } finally { await f.done(); }
  });
  it("requires an online display and a matching acknowledgement, without writing a Space", async () => {
    const f = await setup();
    try {
      await expect(f.hub.handle(request("/api/space/display/commands", { type: "sleep", spaceId: f.space }), f.phone)).rejects.toMatchObject({ code: "display-offline" });
      const reader = await f.stream(f.a);
      await f.hub.handle(request("/api/space/display/presence", { displayId: "TEST-display", spaceId: f.space, sleeping: false }), f.a);
      const pending = f.hub.handle(request("/api/space/display/commands", { type: "sleep", spaceId: f.space }), f.phone);
      const event = await next(reader, "display.command");
      await expect(f.hub.handle(request("/api/space/display/commands", { type: "wake", spaceId: f.space }), f.phone)).rejects.toMatchObject({ code: "display-busy" });
      const body = { commandId: event.commandId, displayId: "TEST-display", ok: true, sleeping: true };
      await expect(f.hub.handle(request("/api/space/display/ack", body), f.b)).rejects.toMatchObject({ code: "stale-display-ack" });
      await f.hub.handle(request("/api/space/display/ack", body), f.a);
      const response = await pending; expect(response!.status).toBe(200);
      expect(await response!.json()).toMatchObject({ ok: true, display: { online: true, sleeping: true } });
      expect(f.store.listSpaces(f.a.accountId)[0]!.version).toBe(0);
    } finally { await f.done(); }
  });
});
