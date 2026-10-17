import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardRecord } from "@/contracts";
import { presentCards } from "@/canvas/reminderPresentation";
import { createMemoryDB } from "@/persistence/db";
import { createCanvasStore } from "@/state/canvasStore";
import { createMemoryHub, flushChannel } from "../channel";
import { createControlHost } from "../controlHost";
import { createDisplayClient } from "../displayClient";
import { DisplayInteractionSchema } from "../protocol";
import { createMemoryLockProvider } from "../testing";

const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).forEach(stop => stop()); vi.useRealTimers(); });
const stamp = "2026-10-17T00:00:00.000Z";
const quote = (id: string, x = 0): CardRecord => ({ id, type: "QuoteCard", variant: "standard", displayProps: { text: `TEST ${id}` }, sourceData: {}, sources: [],
  layout: { x, y: 0, width: 320, height: 220, pinned: false }, metadata: { createdAt: stamp, updatedAt: stamp } });

const setup = async () => {
  const hub = createMemoryHub(), db = createMemoryDB();
  const store = createCanvasStore();
  const host = createControlHost({ db, store, channel: hub.createChannel(), lockProvider: createMemoryLockProvider(), reminderPollMs: 1000000 });
  cleanup.push(host.stop); await host.start();
  const canvasId = host.getSnapshot().activeCanvasId!;
  host.dispatch({ schemaVersion: "0.6", canvasId, requestId: "seed", actions: [{ type: "card.create", card: quote("a") }, { type: "card.create", card: quote("b") }] });
  await flushChannel();
  const displayStore = createCanvasStore();
  const client = createDisplayClient({ db, store: displayStore, channel: hub.createChannel(), pinnedCanvasId: canvasId });
  cleanup.push(client.stop); await client.start(); await flushChannel();
  const find = (s: ReturnType<typeof createCanvasStore>, id: string) => s.getState().cards.find(entry => entry.record.id === id)!.record;
  return { db, host, store, displayStore, client, canvasId, find };
};

describe("cards move between the Display canvas and the user page", () => {
  it("sends a card to the user page: off the canvas layout, persisted, synced to Display", async () => {
    const { db, host, store, displayStore, canvasId, find } = await setup();
    const before = find(store, "b").layout;
    expect(host.setCardSurface("a", "user").ok).toBe(true);
    await flushChannel();
    expect(find(store, "a").layout.surface).toBe("user");
    expect(find(displayStore, "a").layout.surface).toBe("user");
    expect(presentCards(displayStore.getState().cards).map(item => item.entry.record.id)).toEqual(["b"]);
    expect(find(store, "b").layout).toEqual(before);
    expect((await db.getCanvas(canvasId))!.cardsById.a!.layout.surface).toBe("user");
  });

  it("puts it back exactly where the Display drop happened, through the owner", async () => {
    const { host, store, displayStore, client, canvasId, find } = await setup();
    host.setCardSurface("a", "user"); await flushChannel();
    expect(client.requestCardToCanvas(canvasId, "a", 640, 320)).toBe(true);
    await flushChannel();
    expect(find(store, "a").layout).toMatchObject({ x: 640, y: 320 });
    expect(find(store, "a").layout.surface).toBeUndefined();
    expect(find(displayStore, "a").layout).toMatchObject({ x: 640, y: 320 });
    expect(presentCards(displayStore.getState().cards)).toHaveLength(2);
  });

  it("auto-places a card sent back without a drop point and leaves other cards alone", async () => {
    const { host, store, find } = await setup();
    host.setCardSurface("a", "user");
    const other = find(store, "b").layout;
    expect(host.setCardSurface("a", "display").ok).toBe(true);
    expect(find(store, "b").layout).toEqual(other);
    const a = find(store, "a").layout;
    const overlaps = a.x < other.x + other.width && a.x + a.width > other.x && a.y < other.y + other.height && a.y + a.height > other.y;
    expect(overlaps).toBe(false);
  });

  it("Display can only take a card back with a position, never send one away", async () => {
    const from = { x: 0, y: 0, width: 320, height: 220, pinned: false };
    expect(DisplayInteractionSchema.safeParse({ kind: "card.surface", cardId: "a", from, surface: "display", x: 1, y: 2 }).success).toBe(true);
    expect(DisplayInteractionSchema.safeParse({ kind: "card.surface", cardId: "a", from, surface: "user" }).success).toBe(false);
    expect(DisplayInteractionSchema.safeParse({ kind: "card.surface", cardId: "a", from, surface: "display" }).success).toBe(false);
    expect(DisplayInteractionSchema.safeParse({ kind: "card.pin", cardId: "a", from, pinned: true }).success).toBe(false);
    const { client, canvasId } = await setup();
    // A card that is already on the canvas is not "returned".
    expect(client.requestCardToCanvas(canvasId, "a", 10, 10)).toBe(false);
  });

  it("keeps the user-page drop point, moves it there, and forgets it when the card returns", async () => {
    const { host, store, find } = await setup();
    const canvasSpot = { x: find(store, "a").layout.x, y: find(store, "a").layout.y };
    expect(host.setCardSurface("a", "user", { x: 420.4, y: 180 }).ok).toBe(true);
    expect(find(store, "a").layout).toMatchObject({ surface: "user", userPos: { x: 420, y: 180 }, ...canvasSpot });
    expect(host.setCardSurface("a", "user", { x: 60, y: 90 }).ok).toBe(true);
    expect(find(store, "a").layout.userPos).toEqual({ x: 60, y: 90 });
    expect(host.setCardSurface("a", "display", { x: 700, y: 40 }).ok).toBe(true);
    expect(find(store, "a").layout).toMatchObject({ x: 700, y: 40 });
    expect(find(store, "a").layout.userPos).toBeUndefined();
    expect(find(store, "a").layout.surface).toBeUndefined();
  });

  it("never dims the stage for a focus on a user-page card", async () => {
    const { host, store, canvasId } = await setup();
    host.setCardSurface("a", "user");
    host.dispatch({ schemaVersion: "0.6", canvasId, requestId: "focus", actions: [{ type: "card.focus", targetId: "a" }] });
    expect(store.getState().focus).toBeNull();
  });
});
