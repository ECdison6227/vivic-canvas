import { describe, expect, it, vi } from "vitest";
import { createVivicHostAdapter, type ExistingHost } from "../vivicHostAdapter";

describe("Vivic owner summary adapter", () => {
  it("retains an active canvas beyond the first 100 and excludes card contents", () => {
    const host: ExistingHost = {
      getSnapshot: () => ({ ready: true, ownerMode: "owner", ownerId: "owner", activeCanvasId: "canvas_109",
        canvases: Array.from({ length: 110 }, (_, i) => ({ id: `canvas_${i}`, title: `Canvas ${i}`, version: i })) }),
      subscribe: () => () => {}, switchCanvas: vi.fn(), setCardPinned: vi.fn(() => ({ ok: true })),
    };
    const adapter = createVivicHostAdapter({ host, computerName: "电脑", subscribeCards: () => () => {},
      readCards: () => [{ record: { id: "note", type: "NoteCard", layout: { pinned: false }, displayProps: { text: "private card body" } } }],
      submitText: async () => ({ ok: true, message: "done" }),
    });
    const snapshot = adapter.getSnapshot();
    expect(snapshot.canvases).toHaveLength(100);
    expect(snapshot.canvases.some(canvas => canvas.id === "canvas_109")).toBe(true);
    expect(snapshot.version).toBe(109);
    expect(JSON.stringify(snapshot)).not.toContain("private card body");
  });
});
