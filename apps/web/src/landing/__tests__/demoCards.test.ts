import { describe, expect, it } from "vitest";
import { CardRecordSchema, SCENES, sceneOfCard } from "@/contracts";
import { buildDemoCards, RING_ORDER } from "../demoCards";

describe("landing demo cards", () => {
  const cards = buildDemoCards(Date.parse("2026-10-17T06:00:00Z"));

  it("every demo card passes the same schema the canvas uses", () => {
    for (const [key, { card, prompt }] of Object.entries(cards)) {
      const parsed = CardRecordSchema.safeParse(card);
      expect(parsed.success, `${key}: ${parsed.success ? "" : parsed.error.message}`).toBe(true);
      expect(prompt.trim().length).toBeGreaterThan(0);
    }
  });

  it("the ring shows all twenty scene cards once, plus classic cards", () => {
    expect(new Set(RING_ORDER).size).toBe(RING_ORDER.length);
    const scenes = new Set(RING_ORDER.map(key => sceneOfCard(cards[key].card)).filter(Boolean));
    expect(scenes.size).toBe(SCENES.length);
  });
});
