import { useEffect, useState, useSyncExternalStore } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { canvasStore } from "@/state/canvasStore";
import type { ControlHost } from "@/sync/controlHost";
import { createVivicHostAdapter } from "@vivic/mobile-console-prototype/vivicHostAdapter";
import { createComputerConnector, type ConnectorState } from "@vivic/mobile-console-prototype/connector";
import { createWebSocketTransport } from "@vivic/mobile-console-prototype/transport";
import { executeRemoteText } from "./executeRemoteText";
import { ExtensionDefinitionRefSchema } from "@vivic/contracts";
import { extensionDefinitions } from "@/extensions/definitionStore";
import { loadBuiltinOfficeDefinitions, officePlannerKind } from "@/cards/office/builtinOfficePackages";
import { AndroidDownload } from "./AndroidDownload";
import { projectMobileSubcards } from "./projectSubcards";
import { createRemoteFileReader } from "@/files/remoteFiles";

const stopped: ConnectorState = { status: "stopped", pairCode: null, pairExpiresAt: null, expiresAt: null, controllers: [], error: null };
const subscribeNothing = () => () => {};
const getStopped = () => stopped;
const labels: Record<ConnectorState["status"], string> = { stopped: "未开启", connecting: "正在连接", connected: "已连接中继", offline: "正在重连", expired: "会话已结束", error: "连接失败" };
export function MobileControlSettings({ host, disabled, desktopBusy }: { host: ControlHost; disabled: boolean; desktopBusy(): boolean }) {
  const [connector, setConnector] = useState<ReturnType<typeof createComputerConnector> | null>(null);
  const state = useSyncExternalStore(connector?.subscribe ?? subscribeNothing, connector?.getSnapshot ?? getStopped);
  const [mobileUrl, setMobileUrl] = useState("");
  const [qr, setQr] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now);
  const running = connector && !["stopped", "expired", "error"].includes(state.status);
  const pairCode = state.pairCode && (state.pairExpiresAt ?? 0) > now ? state.pairCode : null;
  useEffect(() => () => connector?.stop(), [connector]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    let active = true; setQr("");
    if (pairCode && mobileUrl) {
      const url = new URL(mobileUrl); url.hash = new URLSearchParams({ pair: pairCode }).toString();
      void QRCode.toDataURL(url.href, { width: 240, margin: 2, errorCorrectionLevel: "M" }).then(value => { if (active) setQr(value); });
    }
    return () => { active = false; };
  }, [pairCode, mobileUrl]);
  const start = async () => {
    setBusy(true); setError(null); connector?.stop(); setConnector(null);
    try {
      // A custom extension sharing an Office ID must never select its preview.
      await Promise.all([loadBuiltinOfficeDefinitions(), extensionDefinitions.ready()]).catch(() => {});
      const response = await fetch("/api/mobile/session", { method: "POST", cache: "no-store" });
      if (!response.ok) throw new Error("relay_unavailable");
      const session = await response.json() as { relayUrl: string; mobileUrl: string; deviceId: string; token: string };
      const adapter = createVivicHostAdapter({ computerName: "Vivic 电脑", shareCardPreviews: true, host: { ...host,
        getSnapshot: () => { const snapshot = host.getSnapshot(); return { ...snapshot, ready: snapshot.ready && !desktopBusy() }; },
        switchCanvas: id => { if (!desktopBusy()) host.switchCanvas(id); },
        setCardSurface: (cardId, surface, position, canvasId) => desktopBusy() ? { ok: false } : host.setCardSurface(cardId, surface, position, canvasId),
        setCardPinned: (...args) => desktopBusy() ? { ok: false } : host.setCardPinned(...args) },
        isOfficeDefinition: ref => {
          const parsed = ExtensionDefinitionRefSchema.safeParse(ref);
          return parsed.success && Boolean(officePlannerKind(extensionDefinitions.get(parsed.data)));
        },
        projectSubcards: projectMobileSubcards,
        readFileChunk: createRemoteFileReader(),
        readCards: () => canvasStore.getState().cards,
        subscribeCards: listener => {
          const cards = canvasStore.subscribe(listener), definitions = extensionDefinitions.subscribe(listener);
          return () => { cards(); definitions(); };
        },
        submitText: (text, context) => executeRemoteText(host, text, context, desktopBusy) });
      const next = createComputerConnector({ transport: createWebSocketTransport(session.relayUrl), host: adapter,
        deviceId: session.deviceId, deviceName: "Vivic 电脑", token: session.token });
      setMobileUrl(session.mobileUrl); setConnector(next); next.start();
    } catch { setError("手机中继暂不可用，请检查本机中继配置后重试。"); }
    finally { setBusy(false); }
  };
  return <section className="rounded-xl border border-neutral-200 bg-white p-4" data-vivic-mobile-control>
    <h2 className="text-sm font-semibold">扫码连接手机</h2>
    <p className="mt-2 text-xs text-neutral-500">先在电脑连接模型，再扫码。手机可聊天，并查看当前画布的卡片内容。</p>
    {running && <p className="mt-2 text-xs" role="status">{state.status === "connected" ? state.controllers.length ? `已连接 ${state.controllers.length} 部手机` : "等待扫码" : labels[state.status]}</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      <AndroidDownload />
      {!running ? <Button size="sm" disabled={disabled || busy} onClick={() => void start()} data-vivic-mobile-start>生成连接二维码</Button>
        : <><Button size="sm" variant="outline" onClick={() => { connector?.stop(); setConnector(null); }} data-vivic-mobile-stop>停止手机控制</Button>
          <Button size="sm" variant="secondary" disabled={state.status !== "connected"} onClick={() => connector?.rotatePairing()}>生成新配对码</Button></>}
    </div>
    {pairCode && <div className="mt-4"><p className="text-xs">扫码连接，仅可使用一次 · {Math.max(0, Math.ceil(((state.pairExpiresAt ?? 0) - now) / 1000))} 秒后过期</p>
      {qr && <img src={qr} alt="手机控制一次性配对二维码" width={240} height={240} />}
      <output className="font-mono text-lg" data-vivic-mobile-pair-code>{pairCode}</output>
      <p className="text-xs text-neutral-500">也可在手机打开 {mobileUrl}，手动输入配对码。</p></div>}
    {state.controllers.map((id, index) => <div className="mt-2 flex items-center gap-3" key={id}><span className="text-xs">手机 {index + 1}</span><Button size="sm" variant="outline" onClick={() => connector?.revoke(id)}>撤销授权</Button></div>)}
    {(error || state.error) && <p className="mt-2 text-xs text-amber-700" role="alert">{error ?? state.error}</p>}
  </section>;
}
