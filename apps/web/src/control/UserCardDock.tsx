import { useMemo, useRef, useState, useSyncExternalStore, type DragEvent } from "react";
import { GripHorizontal, MonitorUp, Trash2 } from "lucide-react";
import { cardTitle, onUserSurface, type CardRecord } from "@/contracts";
import { canvasStore, useVivicState } from "@/state/canvasStore";
import { VivicCard } from "@/cards/VivicCard";
import { CardActionsContext, CardModeContext, type CardActions } from "@/cards/scene/cardContext";
import { storePhotos } from "@/cards/scene/photos";
import { carriesCard, readCardDrag, startCardDrag } from "@/cards/surfaceDrag";
import { newId } from "@/lib/id";
import type { ControlHost } from "@/sync/controlHost";
import "@/cards/scene/sceneCards.css";
import "./userCardDock.css";

const MAX_PHOTOS = 36;

/**
 * 用户页卡片区: cards the user pulled off the Display. Same card components in
 * control mode — tick todos, adjust progress, add photos — and every edit goes
 * through the owner's validated card.update. Drag a card back to the Display
 * window (or use 放回副屏) to show it on the stage again.
 */
export function UserCardDock({ host }: { host: ControlHost }) {
  const snapshot = useSyncExternalStore(host.subscribe, host.getSnapshot);
  const cards = useVivicState(state => state.cards);
  const docked = cards.filter(entry => !entry.exitingRequestId && onUserSurface(entry.record)).map(entry => entry.record);
  const editable = snapshot.ready && snapshot.ownerMode === "owner";
  const [notice, setNotice] = useState<string | null>(null);
  const [receiving, setReceiving] = useState(false);
  const depth = useRef(0);

  const actions = useMemo<CardActions>(() => ({
    editable,
    update: (cardId, patch) => {
      const current = host.getSnapshot();
      if (!editable || current.ownerMode !== "owner" || !current.activeCanvasId) return false;
      const before = canvasStore.getState().cards.find(entry => entry.record.id === cardId)?.record;
      const result = host.dispatch({ schemaVersion: "0.6", requestId: newId("edit"), canvasId: current.activeCanvasId,
        actions: [{ type: "card.update", targetId: cardId, ...patch }] });
      const after = canvasStore.getState().cards.find(entry => entry.record.id === cardId)?.record;
      // The reducer drops a merge that fails the card schema; report it instead of pretending.
      const applied = result.ok && Boolean(after) && after !== before;
      if (!applied) setNotice("这次修改没有通过校验，卡片保持原样。");
      return applied;
    },
    remove: cardId => {
      const current = host.getSnapshot();
      if (!editable || !current.activeCanvasId) return false;
      const ok = host.dispatch({ schemaVersion: "0.6", requestId: newId("remove"), canvasId: current.activeCanvasId,
        actions: [{ type: "card.delete", targetId: cardId }] }).ok;
      if (ok) setNotice("已删除，可在输入框输入「撤销」恢复。");
      return ok;
    },
    addPhotos: async files => {
      const { images, errors } = await storePhotos(files, MAX_PHOTOS);
      setNotice(errors[0] ?? (images.length ? `已在本机保存 ${images.length} 张照片` : null));
      return images;
    },
  }), [host, editable]);

  const sendToDisplay = (card: CardRecord) => {
    const result = host.setCardSurface(card.id, "display");
    setNotice(result.ok ? `「${cardTitle(card).slice(0, 24)}」已放回副屏` : "暂时无法放回副屏，请检查控制权。");
  };

  const onDragEnter = (event: DragEvent) => {
    if (!carriesCard(event, "display")) return;
    depth.current += 1; setReceiving(true);
  };
  const onDragOver = (event: DragEvent) => {
    if (!carriesCard(event, "display") || !editable) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };
  const onDragLeave = (event: DragEvent) => {
    if (!carriesCard(event, "display")) return;
    depth.current = Math.max(0, depth.current - 1);
    if (!depth.current) setReceiving(false);
  };
  const onDrop = (event: DragEvent) => {
    depth.current = 0; setReceiving(false);
    const payload = readCardDrag(event, "display");
    if (!payload) return;
    event.preventDefault();
    if (payload.canvasId !== host.getSnapshot().activeCanvasId) { setNotice("这张卡片属于另一张画布，请先在控制端切换画布。"); return; }
    const card = canvasStore.getState().cards.find(entry => entry.record.id === payload.cardId)?.record;
    const result = host.setCardSurface(payload.cardId, "user");
    setNotice(result.ok ? `「${card ? cardTitle(card).slice(0, 24) : "卡片"}」已移到用户页` : "暂时无法移动这张卡片，请检查控制权。");
  };

  return <section className="vivic-user-dock" data-vivic-user-dock data-receiving={receiving || undefined}
    onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} aria-label="用户页卡片">
    <header className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-sm font-semibold">用户页卡片</h2>
      <p className="text-xs text-neutral-500">从副屏卡片顶部的把手拖到这里即可编辑；拖回副屏窗口即可继续展示。</p>
    </header>
    {receiving && <div className="vivic-user-dock-drop" data-vivic-drop-overlay="user">松开，把卡片放到用户页</div>}
    {!docked.length && <div className="vivic-user-dock-empty" data-vivic-user-dock-empty>
      还没有卡片在用户页。AI 生成的卡片会先出现在副屏，需要勾选、调整或补照片时，把它拖过来。
    </div>}
    <CardModeContext.Provider value="control">
      <CardActionsContext.Provider value={actions}>
        <div className="vivic-user-dock-grid">
          {docked.map(card => <article key={card.id} className="vivic-user-card" data-vivic-user-card={card.id} data-scene-type={card.type}>
            <span className="vivic-move-handle" draggable role="button" tabIndex={-1} title="拖回副屏" aria-label={`把「${cardTitle(card).slice(0, 40)}」拖回副屏`}
              data-vivic-user-handle={card.id}
              onDragStart={event => {
                const canvasId = host.getSnapshot().activeCanvasId;
                if (!canvasId) { event.preventDefault(); return; }
                const box = event.currentTarget.closest(".vivic-user-card");
                const rect = box?.getBoundingClientRect();
                startCardDrag(event, { v: 1, canvasId, cardId: card.id, from: "user",
                  grabX: rect ? event.clientX - rect.left : undefined, grabY: rect ? event.clientY - rect.top : undefined }, cardTitle(card), box);
              }}><GripHorizontal size={14} aria-hidden /></span>
            <VivicCard record={card} />
            <footer className="vivic-user-card-actions">
              <button type="button" className="vivic-scene-action" disabled={!editable} onClick={() => sendToDisplay(card)} data-vivic-send-display={card.id}>
                <MonitorUp size={14} aria-hidden />放回副屏
              </button>
              <button type="button" className="vivic-scene-icon-button" disabled={!editable} aria-label={`删除「${cardTitle(card).slice(0, 40)}」（可撤销）`}
                title="删除（可撤销）" onClick={() => actions.remove?.(card.id)}><Trash2 size={15} /></button>
            </footer>
          </article>)}
        </div>
      </CardActionsContext.Provider>
    </CardModeContext.Provider>
    {notice && <p role="status" className="text-xs text-neutral-600" data-vivic-user-dock-notice>{notice}</p>}
  </section>;
}
