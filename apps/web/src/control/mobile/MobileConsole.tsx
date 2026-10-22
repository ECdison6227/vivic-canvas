import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { ArrowLeft, ArrowUp, Check, ChevronDown, CircleHelp, Laptop, Link2, LoaderCircle, Pin, RefreshCw, Settings2, ShieldCheck, Smartphone, X } from "lucide-react";
import { AtmosphereBackground } from "@/components/atmosphere/AtmosphereBackground";
import { ATMOSPHERE_PALETTES, DARK_PALETTE_IDS, LIGHT_PALETTE_IDS, type PaletteId } from "@/components/atmosphere/palettes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createMobileClient, type MobileClient, type MobileState } from "@vivic/mobile-console-prototype/client";
import type { Operation } from "@vivic/mobile-console-prototype/protocol";
import "./mobile.css";

const connectionLabels: Record<MobileState["status"], string> = {
  unpaired: "尚未配对", connecting: "正在连接", connected: "已连接", reconnecting: "正在重连",
  offline: "连接已断开", expired: "配对已过期", revoked: "授权已撤销", error: "连接遇到问题",
};
const resultLabels = {
  sending: "正在发送", accepted: "中继已接收，等待电脑确认", executing: "电脑正在执行", succeeded: "电脑已执行",
  rejected: "电脑未执行", cancelled: "已取消", unknown: "执行结果未知",
};
const operationLabel = (operation: Operation) => operation.kind === "text.submit" ? operation.text
  : operation.kind === "canvas.switch" ? "切换电脑活动画布" : operation.pinned ? "固定卡片" : "取消固定卡片";

export const defaultRelayUrl = () => {
  const configured = import.meta.env.VITE_MOBILE_RELAY_URL as string | undefined;
  if (configured) return configured;
  if (window.location.protocol === "https:") return new URL("./relay", window.location.href).href.replace(/^https:/, "wss:");
  return "ws://127.0.0.1:8791/relay";
};

export interface MobileConsoleProps {
  /** Inject only in isolated tests; the normal entry always uses the real relay client. */
  client?: MobileClient;
  initialRelayUrl?: string;
}
// Capture and erase once, outside React's repeatable render/initializer lifecycle.
const scannedPairingCode = (() => {
  const code = new URLSearchParams(window.location.hash.slice(1)).get("pair");
  if (code) window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return code && /^[A-F0-9]{16}$/.test(code) ? code : null;
})();

/** A remote client only: no ControlHost, local API, canvas store or IndexedDB is opened here. */
export function MobileConsole({ client: suppliedClient, initialRelayUrl }: MobileConsoleProps) {
  const [client] = useState(() => suppliedClient ?? createMobileClient({ name: "手机浏览器" }));
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const [relayUrl, setRelayUrl] = useState(initialRelayUrl ?? defaultRelayUrl);
  const [pairCode, setPairCode] = useState("");
  const scannedCode = scannedPairingCode;
  const [draft, setDraft] = useState("");
  const [settings, setSettings] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [darkPalette, setDarkPalette] = useState<PaletteId>("midnight");
  const [lightPalette, setLightPalette] = useState<PaletteId>("milk");
  const [localError, setLocalError] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const contentEnd = useRef<HTMLDivElement>(null);
  const stage = state.snapshot;
  const online = state.status === "connected" && Boolean(stage?.ownerAvailable);
  const working = state.requests.some(request => ["sending", "accepted", "executing"].includes(request.status));
  const uncertain = state.requests.some(request => request.status === "unknown");
  const connecting = state.status === "connecting" || state.status === "reconnecting";
  const paired = Boolean(stage) && !["unpaired", "revoked", "expired"].includes(state.status);
  const currentCanvas = stage?.canvases.find(canvas => canvas.id === stage.activeCanvasId);
  const palette = theme === "dark" ? darkPalette : lightPalette;
  const statusLabel = state.status === "connected" && !stage?.ownerAvailable ? "电脑控制页不可用" : connectionLabels[state.status];

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => document.documentElement.style.setProperty("--mobile-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
    update(); viewport?.addEventListener("resize", update); window.addEventListener("resize", update);
    return () => { viewport?.removeEventListener("resize", update); window.removeEventListener("resize", update); document.documentElement.style.removeProperty("--mobile-viewport-height"); };
  }, []);
  useEffect(() => {
    const recover = () => { if (!document.hidden && state.status === "offline") client.reconnect(); else if (!document.hidden && state.status === "connected") client.refresh(); };
    window.addEventListener("online", recover); window.addEventListener("pageshow", recover); document.addEventListener("visibilitychange", recover);
    return () => { window.removeEventListener("online", recover); window.removeEventListener("pageshow", recover); document.removeEventListener("visibilitychange", recover); };
  }, [client, state.status]);
  useEffect(() => { contentEnd.current?.scrollIntoView?.({ block: "nearest", behavior: reducedMotion ? "instant" : "smooth" }); }, [state.requests, reducedMotion]);
  useEffect(() => () => client.disconnect(), [client]);
  useEffect(() => {
    if (scannedCode) { try { client.pair(initialRelayUrl ?? defaultRelayUrl(), scannedCode); } catch { setLocalError("配对码已过期或电脑不可用，请在电脑生成新码。"); } }
  }, [client, scannedCode, initialRelayUrl]);

  const pair = async (event: FormEvent) => {
    event.preventDefault(); setLocalError(null);
    const code = pairCode.trim(); setPairCode("");
    try { await client.pair(relayUrl.trim(), code); }
    catch { setLocalError("连接失败。请核对中继地址，并从电脑获取新的配对码。"); }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !online || working || uncertain) return;
    const id = client.submit({ kind: "text.submit", text });
    if (id) { setDraft(""); setLocalError(null); }
    else setLocalError("未发送。请先确认电脑在线和目标画布。");
  };
  const retry = (operation: Operation) => {
    if (online && !working && !uncertain) client.submit(operation);
  };

  return <main className={`mobile-console ${theme === "dark" ? "dark" : ""}`} data-mobile-theme={theme}>
    <AtmosphereBackground theme={theme} palette={palette} paused={reducedMotion} className="mobile-atmosphere" />
    <div className="mobile-shell">
      <header className="mobile-header">
        <div className="mobile-wordmark" aria-label="Vivic 手机控制台">vivic<span>手机控制台</span></div>
        <Button variant="ghost" size="icon" className="mobile-icon-button" aria-label={settings ? "返回控制台" : "打开设置"} onClick={() => setSettings(value => !value)}>
          {settings ? <ArrowLeft size={20} /> : <Settings2 size={20} />}
        </Button>
      </header>

      <div className="mobile-content">
        <p className="mobile-prototype-note">独立控制台 · 电脑正式接线待核定</p>
        <section className={`mobile-connection ${online ? "is-online" : ""}`} aria-label="连接状态" aria-live="polite">
          <span className="mobile-status-dot" />
          <span>{statusLabel}</span>
          {paired && <Button variant="ghost" className="mobile-text-button" disabled={connecting} onClick={() => state.status === "connected" ? client.refresh() : client.reconnect()} aria-label="重新同步连接">
            <RefreshCw size={15} className={connecting ? "mobile-spin" : ""} /><span>{state.status === "connected" ? "同步" : "重连"}</span>
          </Button>}
        </section>

        {(localError || state.error) && <div role="alert" className="mobile-alert"><CircleHelp size={18} /><p>{localError ?? state.error}</p></div>}

        {settings ? <section className="mobile-settings mobile-panel" aria-labelledby="mobile-settings-title">
          <div className="mobile-section-label">连接与外观</div>
          <h1 id="mobile-settings-title">让连接清楚可控。</h1>
          <label htmlFor="mobile-settings-relay">中继地址</label>
          <Input id="mobile-settings-relay" type="url" value={relayUrl} onChange={event => setRelayUrl(event.target.value)} spellCheck={false} autoCapitalize="none" autoCorrect="off" disabled={paired} />
          <p className="mobile-hint">正式环境使用 WSS。手机与电脑需连接同一中继；同局域网也需要互联网。</p>
          <label htmlFor="mobile-theme">界面明暗</label>
          <select id="mobile-theme" value={theme} onChange={event => setTheme(event.target.value as "dark" | "light")}>
            <option value="dark">深色</option><option value="light">浅色</option>
          </select>
          <label htmlFor="mobile-palette">背景配色 · 流光以太</label>
          <select id="mobile-palette" value={palette} onChange={event => theme === "dark" ? setDarkPalette(event.target.value as PaletteId) : setLightPalette(event.target.value as PaletteId)}>
            {(theme === "dark" ? DARK_PALETTE_IDS : LIGHT_PALETTE_IDS).map(id => <option key={id} value={id}>{ATMOSPHERE_PALETTES[id].name}</option>)}
          </select>
          <div className="mobile-security-note"><ShieldCheck size={20} /><p>电脑是画布的唯一写入方。手机不保存画布或模型凭据，刷新后需重新配对。本次授权只保存在内存中。</p></div>
          <p className="mobile-hint">中继可以看到授权控制所需的指令、结果与状态；WSS 提供传输加密，当前不是端到端加密。</p>
          {paired && <div className="mobile-session-actions">
            <Button variant="outline" onClick={() => { client.disconnect(); setSettings(false); }}>断开连接</Button>
            {!confirmRevoke ? <Button variant="ghost" onClick={() => setConfirmRevoke(true)}>撤销手机授权</Button>
              : <div className="mobile-revoke-confirm"><p>撤销后需在电脑重新配对。</p><Button variant="destructive" onClick={() => { client.revoke(); setConfirmRevoke(false); setSettings(false); }}>确认撤销</Button><Button variant="ghost" onClick={() => setConfirmRevoke(false)}>返回</Button></div>}
          </div>}
          <Button variant="ghost" className="mobile-back-button" onClick={() => setSettings(false)}><ArrowLeft size={16} />返回控制台</Button>
        </section> : <>
          {!paired ? <section className="mobile-pair mobile-panel" aria-labelledby="mobile-pair-title">
            <div className="mobile-pair-symbol" aria-hidden="true"><Smartphone size={27} /><Link2 size={19} /><Laptop size={31} /></div>
            <div className="mobile-section-label">把想法送到大屏</div>
            <h1 id="mobile-pair-title">手机说一句，<br />电脑接着做。</h1>
            <p className="mobile-lead">连接你正在使用的 Vivic，<br />在手机上控制电脑展示屏。</p>
            <form className="mobile-pair-form" onSubmit={pair}>
              <label htmlFor="mobile-relay-url">中继地址</label>
              <Input id="mobile-relay-url" type="url" value={relayUrl} onChange={event => setRelayUrl(event.target.value)} spellCheck={false} autoCapitalize="none" autoCorrect="off" required disabled={connecting} />
              <label htmlFor="mobile-pair-code">电脑上的一次性配对码</label>
              <Input id="mobile-pair-code" value={pairCode} onChange={event => setPairCode(event.target.value)} placeholder="输入配对码" maxLength={64} autoComplete="off" autoCapitalize="characters" spellCheck={false} required disabled={connecting} className="mobile-code-input" />
              <Button type="submit" className="mobile-primary" disabled={connecting || !pairCode.trim() || !relayUrl.trim()}>{connecting ? <LoaderCircle size={18} className="mobile-spin" /> : <Link2 size={18} />}{connecting ? "正在连接电脑" : "连接我的电脑"}</Button>
            </form>
            <div className="mobile-pair-guidance"><span>01</span><p>在电脑 Vivic 设置中开启手机控制，扫码或获取一次性配对码。</p><span>02</span><p>输入同一中继地址与配对码。配对码过期或已使用时，请在电脑重新获取。</p></div>
            <p className="mobile-footnote">电脑需保持运行并打开控制页。同局域网也需互联网与中继在线。</p>
          </section> : <>
            <section className="mobile-device mobile-panel" aria-labelledby="mobile-device-title">
              <div className="mobile-device-heading"><Laptop size={22} /><div><div className="mobile-section-label">正在控制的电脑</div><h1 id="mobile-device-title">{stage?.computerName}</h1></div></div>
              <label htmlFor="mobile-canvas">目标画布</label>
              <div className="mobile-select-wrap"><select id="mobile-canvas" value={stage?.activeCanvasId ?? ""} disabled={!online || working || uncertain} onChange={event => client.submit({ kind: "canvas.switch", targetCanvasId: event.target.value })}>
                {!stage?.canvases.length && <option value="">没有可用画布</option>}
                {stage?.canvases.map(canvas => <option value={canvas.id} key={canvas.id}>{canvas.title}</option>)}
              </select><ChevronDown aria-hidden="true" size={16} /></div>
              <div className="mobile-canvas-caption"><span>{currentCanvas ? `版本 ${currentCanvas.version}` : "等待电脑状态"}</span><span>由电脑保存</span></div>
              {!online && <p className="mobile-hint">电脑关机、休眠或 owner 控制页关闭时不可控制。恢复后点击重连并同步状态。</p>}
            </section>

            <section className="mobile-requests" aria-label="指令与执行反馈" aria-live="polite">
              {!state.requests.length ? <div className="mobile-empty"><ArrowUp size={24} /><h2>这一屏，听你的。</h2><p>在下方输入指令。电脑确认执行后，<br />这里会显示实际结果。</p></div>
                : state.requests.map(request => <article className={`mobile-request mobile-request-${request.status}`} key={request.requestId}>
                  <p className="mobile-request-command">{operationLabel(request.operation)}</p>
                  <div className="mobile-result-heading">{request.status === "succeeded" ? <Check size={16} /> : ["sending", "accepted", "executing"].includes(request.status) ? <LoaderCircle size={16} className="mobile-spin" /> : request.status === "unknown" ? <CircleHelp size={16} /> : <X size={16} />}<span>{resultLabels[request.status]}</span></div>
                  <p className="mobile-result-message">{request.message}</p>
                  {request.status === "unknown" && <><p className="mobile-hint">先查询结果，不重复发送这条指令。</p><Button variant="outline" disabled={!online} onClick={() => client.query(request.requestId)}><RefreshCw size={15} />查询执行结果</Button></>}
                  {["sending", "accepted", "executing"].includes(request.status) && <Button variant="ghost" disabled={!online} onClick={() => client.cancel(request.requestId)}>请求取消</Button>}
                  {request.status === "rejected" && <Button variant="outline" disabled={!online || working || uncertain} onClick={() => retry(request.operation)}>重新发送</Button>}
                </article>)}
              <div ref={contentEnd} />
            </section>

            <section className="mobile-cards mobile-panel" aria-labelledby="mobile-cards-title">
              <div className="mobile-section-label" id="mobile-cards-title">画布卡片 · 触屏操作</div>
              {!stage?.cards.length ? <p className="mobile-hint">当前画布没有可操作的卡片。</p> : <ul>{stage.cards.map(card => <li key={card.id}><div><strong>{card.title || "未命名卡片"}</strong><span>{card.type}</span></div><Button variant="outline" disabled={!online || working || uncertain} aria-label={`${card.pinned ? "取消固定" : "固定"} ${card.title || "未命名卡片"}`} onClick={() => client.submit({ kind: "card.pin", cardId: card.id, pinned: !card.pinned })}><Pin size={16} /><span>{card.pinned ? "取消固定" : "固定"}</span></Button></li>)}</ul>}
            </section>
            <p className="mobile-footnote">仅电脑确认才显示已执行。取消请求无法撤回已提交的动作。</p>
          </>}
        </>}
      </div>

      {!settings && paired && <form className="mobile-composer" onSubmit={submit}>
        {uncertain && <p role="status" className="mobile-composer-warning">有一条指令结果未知，请先查询执行结果。</p>}
        <div className="mobile-composer-bar"><Input aria-label="发送给电脑的文字指令" value={draft} onChange={event => setDraft(event.target.value)} placeholder={online ? "让电脑做点什么…" : "电脑恢复连接后可输入指令"} maxLength={2000} disabled={!online} onKeyDown={event => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); }} /><Button type="submit" size="icon" className="mobile-send-button" aria-label="发送指令" disabled={!online || working || uncertain || !draft.trim()}><ArrowUp size={22} /></Button></div>
        <p>{working ? "电脑正在处理，等待实际执行结果" : <><ShieldCheck size={12} />文字指令 · {draft.length}/2000</>}</p>
      </form>}
      {settings && <div className="mobile-safe-bottom" />}
    </div>
  </main>;
}
