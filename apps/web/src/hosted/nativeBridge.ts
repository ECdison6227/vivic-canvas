import { createOwnerDB, getOwnerServerVersion, invalidateOwnerDB } from "./ownerDB";
import { getControlHost, getDisplayRuntime, getDisplayStatus, requestCardFocus } from "@/sync/browserRuntime";
import { canvasStore } from "@/state/canvasStore";

declare global {
  interface Window {
    __vivicRemoteRuntime?: {
      getControlHost: typeof getControlHost;
      createOwnerDB: typeof createOwnerDB;
      getOwnerServerVersion: typeof getOwnerServerVersion;
      invalidateOwnerDB: typeof invalidateOwnerDB;
      requestCardFocus: typeof requestCardFocus;
      getDisplayRuntime: typeof getDisplayRuntime;
      getDisplayStatus: typeof getDisplayStatus;
      canvasStore: typeof canvasStore;
    };
  }
}
window.__vivicRemoteRuntime = { getControlHost, createOwnerDB, getOwnerServerVersion, invalidateOwnerDB,
  requestCardFocus, getDisplayRuntime, getDisplayStatus, canvasStore };
window.dispatchEvent(new Event("vivic:runtime-ready"));
