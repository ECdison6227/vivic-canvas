import { useSyncExternalStore } from "react";
import { Monitor, RotateCcw, Scan } from "lucide-react";
import { CardPortal } from "@/cards/CardPortal";
import { Button } from "@/components/ui/button";
import { useVivicState } from "@/state/canvasStore";
import { newId } from "@/lib/id";
import type { Action } from "@/contracts";
import type { ControlHost } from "@/sync/controlHost";

export function UserCanvasControls({ host, theme, onOpenDisplay }: { host: ControlHost; theme: "light" | "dark"; onOpenDisplay: () => void }) {
  const snapshot = useSyncExternalStore(host.subscribe, host.getSnapshot);
  const focus = useVivicState(state => state.focus);
  const disabled = !snapshot.ready || snapshot.ownerMode !== "owner";
  const act = (action: Action) => {
    const current = host.getSnapshot();
    if (!current.ready || current.ownerMode !== "owner" || !current.activeCanvasId || current.activeCanvasId !== snapshot.activeCanvasId) return false;
    return host.dispatch({ schemaVersion: "0.6", requestId: newId("view"), canvasId: current.activeCanvasId, actions: [action] }).ok;
  };
  return <nav className={`vivic-user-canvas-controls${theme === "dark" ? " dark" : ""}`} aria-label="画布操作">
    <CardPortal key={snapshot.activeCanvasId} surface="user" canvasId={snapshot.activeCanvasId ?? ""} disabled={disabled} theme={theme}
      onTransfer={(id, surface) => host.getSnapshot().activeCanvasId === snapshot.activeCanvasId && host.setCardSurface(id, surface, undefined, snapshot.activeCanvasId ?? "").ok}
      onFocus={id => act({ type: "card.focus", targetId: id })} onFit={() => act({ type: "canvas.fit" })} onRestore={() => act({ type: "canvas.restore" })} />
    <Button variant="outline" size="sm" disabled={disabled} onClick={() => act({ type: "canvas.fit" })}><Scan size={15} aria-hidden />显示全部</Button>
    {focus && <Button variant="outline" size="sm" disabled={disabled} onClick={() => act({ type: "canvas.restore" })}><RotateCcw size={15} aria-hidden />恢复视图</Button>}
    <Button variant="outline" size="sm" disabled={!snapshot.activeCanvasId} onClick={onOpenDisplay}><Monitor size={15} aria-hidden />展示窗口</Button>
  </nav>;
}
