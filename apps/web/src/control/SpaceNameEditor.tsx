import { useRef, useState, useSyncExternalStore } from "react";
import type { ControlHost } from "@/sync/controlHost";
import { Button } from "@/components/ui/button";

export function SpaceNameEditor({ host, canvasId }: { host: ControlHost; canvasId: string }) {
  const snapshot = useSyncExternalStore(host.subscribe, host.getSnapshot);
  const [draft, setDraft] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const owner = useRef<string | null>(null);
  const disabled = busy || !snapshot.ready || snapshot.ownerMode !== "owner";
  if (draft === null) return <Button size="sm" variant="ghost" disabled={disabled} onClick={() => {
    owner.current = snapshot.ownerId; setDraft(snapshot.canvases.find(canvas => canvas.id === canvasId)?.title ?? ""); setError("");
  }}>重命名</Button>;
  return <form onSubmit={event => {
    event.preventDefault();
    const current = host.getSnapshot(), title = draft.trim();
    if (disabled || !title || title.length > 120) return;
    if (current.activeCanvasId !== canvasId || current.ownerId !== owner.current || current.ownerMode !== "owner") {
      setError("Space 或控制权已变化，请重新操作。"); return;
    }
    setBusy(true); host.renameCanvas(canvasId, title);
    const version = host.getSnapshot().canvases.find(canvas => canvas.id === canvasId)?.version;
    if (version === undefined) { setBusy(false); setError("空间已变化，请重新操作。"); return; }
    void host.flush(canvasId, version).then(() => setDraft(null), () => setError("名称尚未保存，请重试。")).finally(() => setBusy(false));
  }}>
    <input aria-label="画布名称" autoFocus maxLength={120} value={draft} disabled={busy} onChange={event => setDraft(event.target.value)}
      onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setDraft(null); } }} />
    <Button type="submit" size="sm" disabled={disabled || !draft.trim() || draft.trim().length > 120}>{busy ? "正在保存…" : "保存"}</Button>
    {error && <p role="status">{error}</p>}
  </form>;
}
