import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildDemoCards } from "../demoCards";
import { CARD_SOURCES, SHARED_SOURCES, sliceSource } from "../gallery/cardSources";

const repo = path.resolve(import.meta.dirname, "../../../../..");
const read = (file: string) => fs.readFileSync(path.join(repo, file), "utf8");

describe("landing card sources", () => {
  const cards = buildDemoCards(Date.parse("2026-10-17T06:00:00Z"));

  it("names sources for every demo card, and every file exists", () => {
    expect(Object.keys(CARD_SOURCES).sort()).toEqual(Object.keys(cards).sort());
    const paths = [...Object.values(CARD_SOURCES).flat().map(part => part.path), ...SHARED_SOURCES.flatMap(group => group.paths)];
    for (const file of paths) expect(fs.existsSync(path.join(repo, file)), file).toBe(true);
  });

  it("starts each card with the view the registry renders it with", () => {
    const registry = read("apps/web/src/cards/registry.tsx");
    for (const [key, parts] of Object.entries(CARD_SOURCES)) {
      const component = path.basename(parts[0]!.path, ".tsx");
      expect(registry, key).toContain(component);
    }
  });

  it("every slice finds what it picks", () => {
    for (const [key, parts] of Object.entries(CARD_SOURCES)) for (const part of parts) {
      const text = sliceSource(read(part.path), part.pick);
      expect(text.trim().length, `${key} ${part.label}`).toBeGreaterThan(0);
      if (part.pick && "schemas" in part.pick) for (const name of part.pick.schemas) expect(text).toContain(`const ${name} =`);
      if (part.pick && "demo" in part.pick) expect(text).toContain(cards[key as keyof typeof cards].prompt);
      if (part.pick && "css" in part.pick) expect(text).toMatch(/\{[^}]*:/);
    }
  });

  it("a schema slice brings the local schemas it uses", () => {
    const text = sliceSource(read("packages/contracts/src/sceneCards.ts"), { schemas: ["WeeklyScheduleCardSchema"] });
    expect(text).toContain("const ScheduleEventSchema =");
    expect(text).not.toContain("const PaperCardSchema =");
  });
});
