import { CanvasSnapshotSchema, PERMISSIONS, type CanvasSnapshot, type Command, type Frame, type Permission, type Result, type Welcome } from "./protocol";
import type { Transport } from "./transport";

export interface ComputerHostAdapter {
  getSnapshot(): CanvasSnapshot;
  subscribe(listener: () => void): () => void;
  /** Resolve only after owner execution. Honor signal/isCurrent immediately before every commit. */
  submitText(text: string, context: { requestId: string; signal: AbortSignal; isCurrent(): boolean }): Promise<{ ok: boolean; message: string }>;
  switchCanvas(id: string): { ok: boolean; message: string };
  setCardPinned(cardId: string, pinned: boolean): { ok: boolean; message: string };
}
export interface ConnectorState {
  status: "stopped" | "connecting" | "connected" | "offline" | "expired" | "error";
  pairCode: string | null; pairExpiresAt: number | null; expiresAt: number | null;
  controllers: string[]; error: string | null;
}
export interface ComputerConnectorOptions {
  transport: Transport; deviceId: string; deviceName: string; accessKey?: string; token?: string;
  host: ComputerHostAdapter; now?: () => number; maxRequests?: number; reconnectDelayMs?: number;
}
interface Entry { command: Command; fingerprint: string; abort: AbortController; started: boolean; result?: Result }

/** Owns no canvas/store. Only a leased, validated adapter to the existing elected owner. */
export function createComputerConnector(options: ComputerConnectorOptions) {
  const { transport, host, deviceId } = options;
  const now = options.now ?? Date.now;
  const permissions = new Map<string, Permission[]>();
  // Owner initiated revocations take effect locally even before the relay acknowledges them.
  const locallyRevoked = new Set<string>();
  const ledger = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  let state: ConnectorState = { status: "stopped", pairCode: null, pairExpiresAt: null, expiresAt: null, controllers: [], error: null };
  let welcome: Welcome | null = null;
  let token = options.token;
  let active = false;
  let finished = false;
  let connected = false;
  let sequence = 0;
  let advertisedAvailability: boolean | null = null;
  let lastSeen = now();
  let queue = Promise.resolve();
  let unsubTransport: (() => void) | null = null;
  let unsubHost: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let reconnect: ReturnType<typeof setTimeout> | null = null;
  let expiry: ReturnType<typeof setTimeout> | null = null;
  const emit = (next: Partial<ConnectorState>) => { state = { ...state, ...next }; listeners.forEach(listener => listener()); };
  const scope = () => welcome ? { v: 1 as const, sessionId: welcome.sessionId, deviceId, epoch: welcome.epoch } : null;
  const send = (frame: Frame) => connected && transport.send(frame);
  const key = (sessionId: string, epoch: string, sender: string, requestId: string) => `${sessionId}:${epoch}:${sender}:${requestId}`;
  const scoped = (frame: Frame) => Boolean(welcome && "sessionId" in frame && frame.sessionId === welcome.sessionId && frame.epoch === welcome.epoch && now() < welcome.expiresAt);
  const authorized = (sender: string, kind?: Permission) => permissions.has(sender) && (!kind || permissions.get(sender)!.includes(kind));
  const hostSnapshot = () => CanvasSnapshotSchema.parse(host.getSnapshot());
  function publishSnapshot() {
    const s = scope(); if (!s || !connected) return;
    try {
      const snapshot = hostSnapshot();
      if (advertisedAvailability !== snapshot.ownerAvailable) {
        advertisedAvailability = snapshot.ownerAvailable;
        send({ ...s, type: "owner.status", available: snapshot.ownerAvailable });
      }
      send({ ...s, type: "snapshot", sequence: ++sequence, state: snapshot });
    } catch { send({ ...s, type: "owner.status", available: false }); emit({ error: "电脑状态不符合远程协议，已停止控制。" }); }
  }
  function makeResult(command: Command, status: Result["status"], message: string): Result {
    return { v: 1, sessionId: command.sessionId, epoch: command.epoch, deviceId, type: "result", forDeviceId: command.deviceId, requestId: command.requestId,
      status, message: message.slice(0, 500), version: host.getSnapshot().version };
  }
  function answer(entry: Entry, status: Result["status"], message: string) {
    entry.result = makeResult(entry.command, status, message);
    if (active && connected && scoped(entry.command) && authorized(entry.command.deviceId)) send(entry.result);
  }
  function current(entry: Entry) {
    const c = entry.command;
    const snapshot = hostSnapshot();
    return active && connected && scoped(c) && authorized(c.deviceId, c.operation.kind) && !entry.abort.signal.aborted
      && snapshot.ownerAvailable && snapshot.ownerEpoch === c.ownerEpoch
      && snapshot.activeCanvasId === c.canvasId && snapshot.version === c.expectedVersion;
  }
  async function execute(entry: Entry) {
    if (entry.result) return;
    if (!current(entry)) { answer(entry, entry.abort.signal.aborted ? "cancelled" : "rejected", "控制会话、电脑 owner 或画布版本已变化；请同步后重新发起。"); return; }
    const c = entry.command;
    const operation = c.operation;
    entry.started = true;
    send({ ...scope()!, type: "executing", requestId: c.requestId, forDeviceId: c.deviceId });
    try {
      let outcome: { ok: boolean; message: string };
      if (operation.kind === "text.submit") {
        outcome = await host.submitText(operation.text, { requestId: c.requestId, signal: entry.abort.signal, isCurrent: () => current(entry) });
      } else if (operation.kind === "canvas.switch") {
        if (!hostSnapshot().canvases.some(canvas => canvas.id === operation.targetCanvasId)) { answer(entry, "rejected", "目标画布不存在。"); return; }
        outcome = host.switchCanvas(operation.targetCanvasId);
      } else {
        if (!hostSnapshot().cards.some(card => card.id === operation.cardId)) { answer(entry, "rejected", "目标卡片不在当前画布。"); return; }
        outcome = host.setCardPinned(operation.cardId, operation.pinned);
      }
      // If the adapter committed before cancellation, report execution; cancellation never rolls it back.
      answer(entry, outcome.ok ? "succeeded" : entry.abort.signal.aborted ? "cancelled" : "rejected", outcome.message);
      publishSnapshot();
    } catch { answer(entry, "unknown", "电脑执行异常，结果无法确认；请查看电脑状态，不会自动重试。"); }
  }
  function command(c: Command) {
    if (!scoped(c) || !authorized(c.deviceId, c.operation.kind)) return;
    const id = key(c.sessionId, c.epoch, c.deviceId, c.requestId);
    const fingerprint = JSON.stringify(c);
    const existing = ledger.get(id);
    if (existing) {
      if (existing.fingerprint !== fingerprint) { send(makeResult(c, "rejected", "请求 ID 已用于另一条指令。")); return; }
      if (existing.result) send(existing.result);
      else send({ ...scope()!, type: "executing", requestId: c.requestId, forDeviceId: c.deviceId });
      return;
    }
    if (ledger.size >= (options.maxRequests ?? 512)) {
      send(makeResult(c, "rejected", "会话请求额度已满，请结束此连接并创建新会话；不会丢弃去重记录。")); return;
    }
    const entry: Entry = { command: c, fingerprint, abort: new AbortController(), started: false };
    ledger.set(id, entry);
    // Every command is admitted once, including stale/rejected writes; duplicate IDs never acquire a fresh lease.
    queue = queue.then(() => execute(entry)).catch(() => { answer(entry, "unknown", "执行结果无法确认。"); });
  }
  function clearLoops() {
    if (heartbeat) clearInterval(heartbeat); heartbeat = null;
    if (reconnect) clearTimeout(reconnect); reconnect = null;
  }
  function abortPending() { ledger.forEach(entry => { if (!entry.result) entry.abort.abort(); }); }
  function expire(message: string) {
    active = false; finished = true; connected = false; clearLoops(); abortPending();
    if (expiry) clearTimeout(expiry); expiry = null;
    unsubTransport?.(); unsubHost?.(); unsubTransport = null; unsubHost = null;
    token = undefined; permissions.clear(); transport.close();
    emit({ status: "expired", pairCode: null, pairExpiresAt: null, controllers: [], error: message });
  }
  function lost(reason: string) {
    if (!active) return;
    connected = false; abortPending();
    if (heartbeat) clearInterval(heartbeat); heartbeat = null;
    emit({ status: "offline", error: reason });
    if (!reconnect) reconnect = setTimeout(() => { reconnect = null; if (active) { emit({ status: "connecting" }); transport.connect(); } }, options.reconnectDelayMs ?? 1500);
  }
  function receive(frame: Frame) {
    lastSeen = now();
    if (frame.type === "welcome") {
      if (frame.deviceId !== deviceId || frame.computerId !== deviceId) return;
      if (welcome && (frame.sessionId !== welcome.sessionId || frame.epoch !== welcome.epoch)) { expire("中继会话已更换，请重新创建配对。"); return; }
      welcome = frame; token = frame.token; connected = true; advertisedAvailability = null;
      permissions.clear(); frame.controllers?.forEach(controller => { if (!locallyRevoked.has(controller.deviceId)) permissions.set(controller.deviceId, controller.permissions); });
      emit({ status: "connected", pairCode: frame.pairCode ?? null, pairExpiresAt: frame.pairExpiresAt ?? null,
        expiresAt: frame.expiresAt, controllers: [...permissions.keys()], error: null });
      if (expiry) clearTimeout(expiry);
      expiry = setTimeout(() => expire("远程控制会话已过期。"), Math.max(0, frame.expiresAt - now()));
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = setInterval(() => {
        if (now() - lastSeen > 30000) { transport.close(); lost("中继心跳超时"); return; }
        const s = scope(); if (s) send({ ...s, type: "heartbeat", at: now() });
      }, 8000);
      publishSnapshot(); return;
    }
    if (frame.type === "error") { emit({ error: frame.message }); if (/expired|unauthorized|revoked|auth|invalid-session/i.test(frame.code)) expire(frame.message); return; }
    if (!scoped(frame)) return;
    if (frame.type === "controller") {
      // Pair codes are single-use. A redeemed code must disappear immediately from the computer UI.
      if (frame.state === "joined") emit({ pairCode: null, pairExpiresAt: null });
      if (frame.state === "joined" && !locallyRevoked.has(frame.deviceId)) permissions.set(frame.deviceId, frame.permissions.filter(permission => PERMISSIONS.includes(permission)));
      else { permissions.delete(frame.deviceId); ledger.forEach(entry => { if (entry.command.deviceId === frame.deviceId && !entry.result) entry.abort.abort(); }); }
      emit({ controllers: [...permissions.keys()] }); publishSnapshot();
    } else if (frame.type === "command") command(frame);
    else if ((frame.type === "query" || frame.type === "cancel") && authorized(frame.deviceId)) {
      const entry = ledger.get(key(frame.sessionId, frame.epoch, frame.deviceId, frame.requestId));
      if (!entry || entry.command.canvasId !== frame.canvasId) {
        send({ ...scope()!, type: "result", forDeviceId: frame.deviceId, requestId: frame.requestId, status: "unknown", message: "电脑没有该请求的执行记录；不会自动重放。" }); return;
      }
      if (frame.type === "cancel" && !entry.result) {
        entry.abort.abort();
        if (!entry.started) answer(entry, "cancelled", "尚未执行的指令已取消。");
        else send({ ...scope()!, type: "result", forDeviceId: frame.deviceId, requestId: frame.requestId, status: "unknown", message: "已请求取消；已经提交的动作不能撤回，请查询实际结果。" });
      } else if (entry.result) send(entry.result);
      else send({ ...scope()!, type: "executing", requestId: frame.requestId, forDeviceId: frame.deviceId });
    } else if (frame.type === "snapshot.request" && authorized(frame.deviceId)) publishSnapshot();
    else if (frame.type === "pairing") emit({ pairCode: frame.pairCode, pairExpiresAt: frame.pairExpiresAt });
    else if (frame.type === "revoked") expire(frame.reason);
  }
  return {
    start() {
      if (finished) { emit({ error: "此电脑连接已结束；请创建新的 connector 和设备身份后重新配对。" }); return; }
      if (active) return;
      active = true; emit({ status: "connecting", error: null });
      unsubTransport = transport.subscribe(event => {
        if (event.type === "open") {
          transport.send({ v: 1, type: "hello", role: "computer", deviceId, deviceName: options.deviceName,
            ...(token ? { token } : { accessKey: options.accessKey ?? "" }) });
        } else if (event.type === "message") receive(event.frame);
        else lost(event.reason);
      });
      unsubHost = host.subscribe(publishSnapshot);
      transport.connect();
    },
    stop() {
      const s = scope(); if (s && connected) send({ ...s, type: "revoke" });
      active = false; finished = true; connected = false; clearLoops(); if (expiry) clearTimeout(expiry); expiry = null;
      abortPending(); unsubTransport?.(); unsubHost?.(); transport.close();
      token = undefined; welcome = null; permissions.clear();
      emit({ status: "stopped", pairCode: null, pairExpiresAt: null, expiresAt: null, controllers: [], error: null });
    },
    rotatePairing() { const s = scope(); if (s) send({ ...s, type: "pair.rotate" }); },
    revoke(targetDeviceId?: string) {
      const targets = targetDeviceId ? [targetDeviceId] : [...permissions.keys()];
      targets.forEach(id => { locallyRevoked.add(id); permissions.delete(id); });
      ledger.forEach(entry => { if ((!targetDeviceId || entry.command.deviceId === targetDeviceId) && !entry.result) entry.abort.abort(); });
      emit({ controllers: [...permissions.keys()] });
      const s = scope(); if (s) send({ ...s, type: "revoke", ...(targetDeviceId ? { targetDeviceId } : {}) });
      if (!targetDeviceId) expire("已结束电脑远程控制；若中继未收到撤销，旧授权仍因 owner 退出而无法执行。");
    },
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
