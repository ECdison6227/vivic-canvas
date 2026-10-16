import { clearMedia } from "@/cards/scene/mediaStore";
import { CanvasRecordSchema, type CanvasRecord } from "./canvasRecord";

/**
 * Thin Promise wrapper over IndexedDB. DB `vivic`, schema v1:
 *  - store `canvases` (keyPath `id`): one CanvasRecord per canvas (the registry)
 *  - store `meta` (keyPath `key`): {key:'lastCanvasId', value}
 * Secrets never land here — cards/viewport only (see AGENTS.md §7).
 */

export interface VivicDB {
  getAllCanvases: () => Promise<CanvasRecord[]>;
  getCanvas: (id: string) => Promise<CanvasRecord | undefined>;
  putCanvas: (record: CanvasRecord) => Promise<void>;
  deleteCanvas: (id: string) => Promise<void>;
  getMeta: (key: string) => Promise<string | undefined>;
  setMeta: (key: string, value: string) => Promise<void>;
  /** Atomically replace all app records and metadata with one empty canvas. */
  reset: (fresh: CanvasRecord) => Promise<void>;
  close: () => void;
}

const DB_NAME = "vivic";
const DB_VERSION = 1;

const reqToPromise = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexeddb error"));
  });

const txDone = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexeddb tx error"));
    tx.onabort = () => reject(tx.error ?? new Error("indexeddb tx aborted"));
  });

const parseRecord = (raw: unknown): CanvasRecord | undefined => {
  const parsed = CanvasRecordSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
};

/** Non-persistent stand-in used by unit tests and as a no-IndexedDB fallback. */
export const createMemoryDB = (): VivicDB => {
  const canvases = new Map<string, CanvasRecord>();
  const meta = new Map<string, string>();
  return {
    getAllCanvases: async () => [...canvases.values()],
    getCanvas: async (id) => canvases.get(id),
    putCanvas: async (record) => {
      canvases.set(record.id, JSON.parse(JSON.stringify(record)));
    },
    deleteCanvas: async (id) => {
      canvases.delete(id);
    },
    getMeta: async (key) => meta.get(key),
    setMeta: async (key, value) => {
      meta.set(key, value);
    },
    reset: async fresh => {
      const record = CanvasRecordSchema.parse(fresh);
      canvases.clear(); meta.clear();
      canvases.set(record.id, structuredClone(record));
      meta.set("lastCanvasId", record.id);
    },
    close: () => undefined,
  };
};

export const openVivicDB = (): Promise<VivicDB> =>
  new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("canvases")) {
        db.createObjectStore("canvases", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    open.onerror = () =>
      reject(open.error ?? new Error("failed to open vivic db"));
    open.onsuccess = () => {
      const db = open.result;
      const wrapper: VivicDB = {
        async getAllCanvases() {
          const tx = db.transaction("canvases", "readonly");
          const rows = await reqToPromise(tx.objectStore("canvases").getAll());
          await txDone(tx);
          return rows
            .map(parseRecord)
            .filter((r): r is CanvasRecord => Boolean(r));
        },
        async getCanvas(id) {
          const tx = db.transaction("canvases", "readonly");
          const raw = await reqToPromise(tx.objectStore("canvases").get(id));
          await txDone(tx);
          return parseRecord(raw);
        },
        async putCanvas(record) {
          const tx = db.transaction("canvases", "readwrite");
          tx.objectStore("canvases").put(record);
          await txDone(tx);
        },
        async deleteCanvas(id) {
          const tx = db.transaction("canvases", "readwrite");
          tx.objectStore("canvases").delete(id);
          await txDone(tx);
        },
        async getMeta(key) {
          const tx = db.transaction("meta", "readonly");
          const raw = await reqToPromise(tx.objectStore("meta").get(key));
          await txDone(tx);
          return (raw as { value?: string } | undefined)?.value;
        },
        async setMeta(key, value) {
          const tx = db.transaction("meta", "readwrite");
          tx.objectStore("meta").put({ key, value });
          await txDone(tx);
        },
        async reset(fresh) {
          const record = CanvasRecordSchema.parse(fresh);
          const tx = db.transaction(["canvases", "meta"], "readwrite");
          tx.objectStore("canvases").clear();
          tx.objectStore("meta").clear();
          tx.objectStore("canvases").put(record);
          tx.objectStore("meta").put({ key: "lastCanvasId", value: record.id });
          await txDone(tx);
          // Photos added to scene cards live in their own local database.
          await clearMedia();
        },
        close() {
          db.close();
        },
      };
      resolve(wrapper);
    };
  });
