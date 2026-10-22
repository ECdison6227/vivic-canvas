import type { CanvasSnapshot } from "./protocol";
import type { ComputerHostAdapter } from "./connector";

/** Structural subset of the existing ControlHost, not another owner implementation. */
export interface ExistingHost {
  getSnapshot(): {
    ready: boolean; ownerMode: string; ownerId: string | null;
    activeCanvasId: string | null;
    canvases: Array<{ id: string; title: string; version: number }>;
  };
  subscribe(listener: () => void): () => void;
  switchCanvas(id: string): void;
  setCardPinned(cardId: string, pinned: boolean, canvasId?: string): { ok: boolean };
}
export interface ExistingCard {
  record: { id: string; type: string; layout: { pinned: boolean }; displayProps?: unknown };
  exitingRequestId?: string;
}
export interface TextExecutionContext {
  requestId: string;
  signal: AbortSignal;
  /** The existing request entry MUST call this immediately before every dispatch. */
  isCurrent(): boolean;
}
export interface VivicHostAdapterOptions {
  host: ExistingHost;
  computerName: string;
  readCards(): ExistingCard[];
  subscribeCards(listener: () => void): () => void;
  /** Must resolve on actual execution, never on request enqueue/HTTP acceptance. */
  submitText(text: string, context: TextExecutionContext): Promise<{ ok: boolean; message: string }>;
}

/** No runtime imports, IndexedDB access, election, token storage or automatic activation. */
export function createVivicHostAdapter(options: VivicHostAdapterOptions): ComputerHostAdapter {
  const { host } = options;
  const getSnapshot = (): CanvasSnapshot => {
    const snapshot = host.getSnapshot();
    const active = snapshot.canvases.find(canvas => canvas.id === snapshot.activeCanvasId);
    return {
      computerName: options.computerName.slice(0, 80),
      ownerAvailable: snapshot.ready && snapshot.ownerMode === "owner" && Boolean(active),
      ownerEpoch: snapshot.ownerId ?? "unavailable",
      activeCanvasId: snapshot.activeCanvasId,
      version: active?.version ?? 0,
      // Only summaries are authorized; don't forward card bodies, sources, images or preferences.
      canvases: snapshot.canvases.slice(0, 100).map(({ id, title, version }) => ({ id, title: title.slice(0, 160), version })),
      cards: options.readCards().filter(card => !card.exitingRequestId).slice(0, 200).map(({ record }) => ({
        id: record.id, title: record.type, type: record.type, pinned: record.layout.pinned,
      })),
    };
  };
  return {
    getSnapshot,
    subscribe: listener => {
      const unsubscribeHost = host.subscribe(listener);
      const unsubscribeCards = options.subscribeCards(listener);
      return () => { unsubscribeHost(); unsubscribeCards(); };
    },
    submitText: async (text, context) => {
      const before = getSnapshot();
      const isCurrent = () => {
        const current = getSnapshot();
        return !context.signal.aborted && context.isCurrent() && current.ownerAvailable
          && current.ownerEpoch === before.ownerEpoch && current.activeCanvasId === before.activeCanvasId;
      };
      if (!isCurrent()) return { ok: false, message: "电脑控制权或目标画布已变化，请同步后重试。" };
      return options.submitText(text, { ...context, isCurrent });
    },
    switchCanvas: id => {
      const snapshot = getSnapshot();
      if (!snapshot.ownerAvailable || !snapshot.canvases.some(canvas => canvas.id === id)) {
        return { ok: false, message: "画布不存在或电脑 owner 不可用。" };
      }
      host.switchCanvas(id);
      return getSnapshot().activeCanvasId === id
        ? { ok: true, message: "电脑已切换画布。" }
        : { ok: false, message: "电脑没有确认画布切换。" };
    },
    setCardPinned: (cardId, pinned) => {
      const snapshot = getSnapshot();
      if (!snapshot.ownerAvailable || !snapshot.activeCanvasId || !snapshot.cards.some(card => card.id === cardId)) {
        return { ok: false, message: "卡片不存在或电脑 owner 不可用。" };
      }
      const result = host.setCardPinned(cardId, pinned, snapshot.activeCanvasId);
      return { ok: result.ok, message: result.ok ? (pinned ? "电脑已固定卡片。" : "电脑已取消固定卡片。") : "电脑未提交卡片操作。" };
    },
  };
}
