import { parseFrame, type Frame } from "./protocol";

export type TransportEvent = { type: "open" } | { type: "message"; frame: Frame } | { type: "disconnect"; reason: string };
export interface Transport {
  connect(): void;
  send(frame: Frame): boolean;
  close(): void;
  subscribe(listener: (event: TransportEvent) => void): () => void;
}
export interface BrowserSocket {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, listener: (event: any) => void): void;
}

/** TLS is mandatory except for explicit loopback development; credentials never enter URLs. */
export function validateRelayUrl(value: string): string {
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== "wss:" && !(url.protocol === "ws:" && loopback))) {
    throw new Error("中继必须使用 WSS；仅本机开发允许 WS，地址不能包含凭据或查询参数。");
  }
  return url.toString();
}

export function createWebSocketTransport(value: string, socketFactory: (url: string) => BrowserSocket = url => new WebSocket(url)): Transport {
  const url = validateRelayUrl(value);
  const listeners = new Set<(event: TransportEvent) => void>();
  let socket: BrowserSocket | null = null;
  let generation = 0;
  const emit = (event: TransportEvent) => listeners.forEach(listener => listener(event));
  return {
    connect() {
      const current = ++generation;
      socket?.close();
      try {
        const active = socketFactory(url);
        socket = active;
        active.addEventListener("open", () => { if (generation === current) emit({ type: "open" }); });
        active.addEventListener("message", (event: MessageEvent) => {
          if (generation !== current) return;
          const frame = typeof event.data === "string" ? parseFrame(event.data) : null;
          if (!frame) { active.close(1008, "Invalid frame"); return; }
          emit({ type: "message", frame });
        });
        active.addEventListener("close", () => { if (generation === current) emit({ type: "disconnect", reason: "中继连接已断开" }); });
        active.addEventListener("error", () => { if (generation === current) emit({ type: "disconnect", reason: "无法连接中继" }); });
      } catch { emit({ type: "disconnect", reason: "无法连接中继" }); }
    },
    send(frame) {
      if (!socket || socket.readyState !== 1) return false;
      try { socket.send(JSON.stringify(frame)); return true; } catch { return false; }
    },
    close() { generation += 1; socket?.close(1000, "Client closed"); socket = null; },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
