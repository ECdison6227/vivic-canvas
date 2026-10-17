import { describe, expect, it } from "vitest";
import { buildDemoCards, RING_ORDER } from "../demoCards";
import { CATALOG } from "../gallery/catalog";

describe("landing card gallery", () => {
  const cards = buildDemoCards(Date.parse("2026-10-17T06:00:00Z"));
  const entries = CATALOG.flatMap(group => group.entries);

  it("lists every landing demo card exactly once", () => {
    expect(entries.map(entry => entry.key).sort()).toEqual(Object.keys(cards).sort());
  });

  it("marks the ring cards, and only those, as shown in the ring", () => {
    const inRing = entries.filter(entry => entry.spots.includes("ring")).map(entry => entry.key).sort();
    expect(inRing).toEqual([...RING_ORDER].sort());
  });
});
