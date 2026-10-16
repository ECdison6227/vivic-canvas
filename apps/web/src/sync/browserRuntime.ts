import { createMemoryDB, openVivicDB, type VivicDB } from "@/persistence/db";
import { collectMediaRefs, deleteMedia, listMediaRefs } from "@/cards/scene/mediaStore";
import { createBroadcastSyncChannel } from "./channel";
import { createControlHost, type ControlHost } from "./controlHost";
import { resetLocalPreferences } from "@/ai/resetLocalPreferences";
import { localSpeechModels } from "@/ai/localSpeech/modelManager";
import { MODEL_IDS } from "@/ai/localSpeech/models";
import {
  createDisplayClient,
  type DisplayClient,
  type DisplayClientStatus,
  type CanvasDrag,
} from "./displayClient";

let controlStarted: Promise<ControlHost> | null = null;

/** Control page singleton: IndexedDB + BroadcastChannel + owner election. */
export const getControlHost = (): Promise<ControlHost> => {
  if (!controlStarted) {
    controlStarted = (async () => {
      let db: VivicDB;
      try {
        db = await openVivicDB();
      } catch {
        db = createMemoryDB();
      }
      const channel = createBroadcastSyncChannel();
      const host = createControlHost({ db, channel, onLocalDataReset: () => {
        MODEL_IDS.forEach(id => localSpeechModels.cancelDownload(id));
        void localSpeechModels.refresh().catch(() => undefined);
        try { resetLocalPreferences(); } catch { /* Canvas state still refreshes if preferences storage is denied. */ }
      } });
      await host.start();
      // Drop locally stored photos that no saved card references any more.
      if (host.getSnapshot().ownerMode === "owner") void (async () => {
        const used = new Set<string>();
        for (const canvas of await db.getAllCanvases()) collectMediaRefs(canvas.cardsById, used);
        const stale = (await listMediaRefs()).filter(ref => !used.has(ref));
        if (stale.length) await deleteMedia(stale);
      })().catch(() => undefined);
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) void host.checkReminders();
      });
      window.addEventListener("pageshow", () => void host.checkReminders());
      return host;
    })();
  }
  return controlStarted;
};

export interface DisplayRuntime {
  client: DisplayClient;
  getStatus: () => DisplayClientStatus;
  stop: () => void;
}

let displayStarted: Promise<DisplayRuntime> | null = null;
let displayRuntime: DisplayRuntime | null = null;
export const getDisplayStatus = () => displayRuntime?.getStatus() ?? null;
let displayCanvasKey: string | null = null;
let displayGeneration = 0;

/** Used by CanvasView: never opens a controller or writes IndexedDB. */
export const beginCanvasDrag = (cardId: string): CanvasDrag | null =>
  displayRuntime?.client.beginCardDrag(cardId) ?? null;
export const commitCanvasDrag = (drag: CanvasDrag, x: number, y: number): boolean =>
  displayRuntime?.client.requestCardMove(drag, x, y) ?? false;
/** Display side of a user-page → Display drop. */
export const requestCardToCanvas = (canvasId: string, cardId: string, x: number, y: number): boolean =>
  displayRuntime?.client.requestCardToCanvas(canvasId, cardId, x, y) ?? false;

/** Display page singleton (read-only reader, pinned via ?canvasId=). */
export const getDisplayRuntime = (
  pinnedCanvasId?: string,
): Promise<DisplayRuntime> => {
  const key = pinnedCanvasId ?? "";
  if (!displayStarted || key !== displayCanvasKey) {
    displayRuntime?.stop();
    displayRuntime = null;
    displayCanvasKey = key;
    const generation = ++displayGeneration;
    displayStarted = (async () => {
      let db: VivicDB | undefined;
      try {
        db = await openVivicDB();
      } catch {
        db = undefined;
      }
      const channel = createBroadcastSyncChannel();
      const client = createDisplayClient({ channel, db, pinnedCanvasId });
      await client.start();
      const runtime: DisplayRuntime = { client, getStatus: () => client.getStatus(),
        stop: () => {
          client.stop(); channel.close(); db?.close();
          if (displayRuntime === runtime) {
            displayRuntime = null; displayStarted = null; displayCanvasKey = null;
          }
        },
      };
      if (generation === displayGeneration) displayRuntime = runtime;
      else runtime.stop();
      return runtime;
    })();
  }
  return displayStarted;
};
