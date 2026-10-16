import { presentCards } from "./reminderPresentation";
import { ReminderListView } from "@/cards/ReminderListView";
import { TargetBadge } from "@/cards/TargetBadge";
import { SubcardAnchor } from "@/cards/SubcardAnchor";
import { SubcardThemeContext } from "@/cards/SubcardEditorContext";
import { cardTitle, type CountdownCard } from "@/contracts";
import { GripHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { fixedContentHeight } from "@/cards/sizing";
import { carriesCard, readCardDrag, startCardDrag } from "@/cards/surfaceDrag";
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { VivicCard } from "@/cards/VivicCard";
import {
  canvasStore,
  useVivicState,
  useDisplayPreferences,
  type CardState,
  type FocusState,
  type HighlightState,
} from "@/state/canvasStore";
import { beginCanvasDrag, commitCanvasDrag, getDisplayStatus, requestCardToCanvas } from "@/sync/browserRuntime";
import type { CanvasDrag } from "@/sync/displayClient";
import { resolveTheme } from "@/motion/motionDirector";

const EXIT_ANIMATION_MS = 260;

interface VivicNodeData extends Record<string, unknown> {
  entry: CardState;
  reminders?: CountdownCard[];
  focusedId?: string;
  focused: boolean;
  dimmed: boolean;
  highlight: HighlightState | null;
}

/** Drag a card off the stage onto the user page (another window). */
const MoveToUserHandle = ({ entry }: { entry: CardState }) => <span
  className="vivic-move-handle nodrag nopan"
  draggable
  role="button"
  tabIndex={-1}
  title="拖到用户页"
  aria-label={`把「${cardTitle(entry.record).slice(0, 40)}」拖到用户页`}
  data-vivic-move-handle={entry.record.id}
  onDragStart={event => {
    const canvasId = getDisplayStatus()?.canvasId;
    if (!canvasId) { event.preventDefault(); return; }
    const card = event.currentTarget.closest(".vivic-card");
    const rect = card?.getBoundingClientRect();
    startCardDrag(event, { v: 1, canvasId, cardId: entry.record.id, from: "display",
      grabX: rect ? event.clientX - rect.left : undefined, grabY: rect ? event.clientY - rect.top : undefined }, cardTitle(entry.record), card);
  }}
><GripHorizontal size={14} aria-hidden /></span>;

const VivicNode = ({ data }: NodeProps<Node<VivicNodeData>>) => {
  const { entry, focused, dimmed, highlight } = data;
  return (
    <div
      className="vivic-card"
      data-card-id={entry.record.id}
      data-scene-type={entry.record.type}
      data-focused={focused || undefined}
      data-dimmed={dimmed || undefined}
      data-highlighted={!data.reminders && highlight?.cardId === entry.record.id || undefined}
      data-exiting={entry.exitingRequestId ? true : undefined}
      style={{ width: entry.record.layout.width }}
    >
      {data.reminders ? <ReminderListView cards={data.reminders} focusedId={data.focusedId} highlightedId={highlight?.cardId} />
        : <VivicCard record={entry.record} highlight={highlight} height={fixedContentHeight(entry.record)} />}
      {!data.reminders && !entry.exitingRequestId && <MoveToUserHandle entry={entry} />}
      {!data.reminders && (entry.record.type !== "CountdownCard" || !entry.record.sourceData.reminderText) && <TargetBadge cardId={entry.record.id} />}
      {!data.reminders && (entry.record.type !== "CountdownCard" || !entry.record.sourceData.reminderText) && <div className="vivic-card-expansion"><SubcardAnchor card={entry.record} /></div>}
    </div>
  );
};

const nodeTypes = { vivic: VivicNode };

const CanvasInner = ({ resolvedTheme }: { resolvedTheme?: "light" | "dark" }) => {
  const rf = useReactFlow();
  const cards = useVivicState((s) => s.cards);
  const focus = useVivicState((s) => s.focus);
  const highlight = useVivicState((s) => s.highlight);
  const targetChoice = useVivicState(s => s.targetChoice);
  useEffect(() => {
    if (!targetChoice) return;
    const timer = setTimeout(() => {
      if (canvasStore.getState().targetChoice?.id === targetChoice.id) canvasStore.internal({ type: "targetChoice.set", choice: null });
    }, Math.max(0, targetChoice.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [targetChoice]);
  const fitRequestId = useVivicState((s) => s.lastFitRequestId);
  const preferences = useDisplayPreferences();
  // StageRoot supplies the live clock; retain an initial local-time fallback
  // for standalone mounts without reading an impure clock during render.
  const [themeAt] = useState(() => new Date());
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemReducedMotion(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const reducedMotion = preferences.reducedMotion || systemReducedMotion;
  const dragRef = useRef<CanvasDrag | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dragOverrides, setDragOverrides] = useState<Record<string, { x: number; y: number }>>({});
  const [measurements, setMeasurements] = useState<Record<string, { width: number; height: number }>>({});
  const lastFocusRef = useRef<FocusState | null>(null);
  const lastFitRef = useRef<string | null>(null);

  const nodes = useMemo<Array<Node<VivicNodeData>>>(
    () =>
      presentCards(cards, { focusId: focus?.cardId }).map(({ entry, reminders, memberIds }) => {
        const override = dragOverrides[entry.record.id];
        return {
          id: entry.record.id,
          type: "vivic",
          position: override ?? {
            x: entry.record.layout.x,
            y: entry.record.layout.y,
          },
          width: entry.record.layout.width,
          measured: measurements[entry.record.id],
          draggable: !entry.record.layout.pinned && !entry.exitingRequestId,
          selectable: false,
          data: {
            entry, reminders, focusedId: focus?.cardId,
            focused: Boolean(focus && memberIds.includes(focus.cardId)),
            dimmed: Boolean(focus && !memberIds.includes(focus.cardId)),
            highlight: highlight && memberIds.includes(highlight.cardId) ? highlight : null,
          },
        };
      }),
    [cards, focus, highlight, dragOverrides, measurements],
  );

  // A manual drag wins until the store picks up the committed position.
  useEffect(() => {
    const ids = new Set(cards.map(entry => entry.record.id));
    setMeasurements(previous => Object.keys(previous).some(id => !ids.has(id))
      ? Object.fromEntries(Object.entries(previous).filter(([id]) => ids.has(id))) : previous);
    const drag = dragRef.current;
    const current = drag && cards.find(c => c.record.id === drag.cardId && !c.exitingRequestId);
    if (drag && current && Object.keys(drag.from).every(key =>
      current.record.layout[key as keyof typeof drag.from] === drag.from[key as keyof typeof drag.from])) return;
    dragRef.current = null;
    setDragOverrides({});
  }, [cards]);
  useEffect(() => {
    const cancel = () => { dragRef.current = null; setDragOverrides({}); };
    window.addEventListener("blur", cancel);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("blur", cancel);
      window.removeEventListener("pointercancel", cancel);
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, []);

  const onNodesChange = (changes: Array<NodeChange<Node<VivicNodeData>>>) => {
    // Controlled nodes must retain React Flow's measured dimensions between
    // position previews. Dropping them re-initializes a node on every drag tick.
    setMeasurements(previous => {
      let next = previous;
      for (const change of changes) {
        if (change.type !== "dimensions" || !change.dimensions || !cards.some(entry => entry.record.id === change.id)) continue;
        const { width, height } = change.dimensions;
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) continue;
        const before = next[change.id];
        if (before?.width === width && before.height === height) continue;
        next = { ...next, [change.id]: { width, height } };
      }
      return next;
    });
    setDragOverrides((prev) => {
      let next = prev;
      for (const change of changes) {
        if (change.type === "position" && change.position && dragRef.current?.cardId === change.id)
          next = { ...next, [change.id]: change.position };
      }
      return next;
    });
  };

  // Delete exit animation commit (idempotent; second commit is a no-op).
  const pendingDeletes = useVivicState((s) => s.pendingDeletes);
  useEffect(() => {
    const ids = Object.keys(pendingDeletes);
    if (ids.length === 0) return;
    const timers = ids.map((id) =>
      setTimeout(
        () => canvasStore.internal({ type: "card.delete.commit", requestId: id }),
        EXIT_ANIMATION_MS,
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, [pendingDeletes]);

  // Highlight self-clears after its confirmed duration.
  useEffect(() => {
    if (!highlight) return;
    const timer = setTimeout(
      () => canvasStore.internal({ type: "highlight.clear", id: highlight.id }),
      highlight.durationMs,
    );
    return () => clearTimeout(timer);
  }, [highlight]);

  // Report this window's canvas size so the reducer's auto-fit decision
  // (post-card.create one-shot) can compare bounds against it.
  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const report = () =>
      canvasStore.internal({
        type: "canvas.viewportSize",
        width: el.clientWidth,
        height: el.clientHeight,
      });
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Smooth camera: focus = setCenter on the card, restore = previous viewport.
  // Never touches card content or variant.
  useEffect(() => {
    if (focus) {
      const entry = presentCards(canvasStore.getState().cards, { focusId: focus.cardId }).find(group => group.memberIds.includes(focus.cardId))?.entry;
      if (entry) {
        const { x, y, width, height } = entry.record.layout;
        const zoom = Math.min(
          1.4,
          Math.max(focus.prevViewport.zoom, 1),
        );
        void rf.setCenter(x + width / 2, y + height / 2, {
          zoom,
          duration: reducedMotion ? 0 : 480,
        });
      }
    } else if (lastFocusRef.current) {
      void rf.setViewport(lastFocusRef.current.prevViewport, { duration: reducedMotion ? 0 : 420 });
    }
    lastFocusRef.current = focus;
  }, [focus, rf, reducedMotion]);

  useEffect(() => {
    if (!fitRequestId || fitRequestId === lastFitRef.current) return;
    lastFitRef.current = fitRequestId;
    void rf.fitView({ duration: reducedMotion ? 0 : 450, padding: 0.3, minZoom: 0.05, maxZoom: 1.1 });
  }, [fitRequestId, rf, reducedMotion]);

  // A card dragged here from the user page lands where it is dropped.
  const dragDepth = useRef(0);
  const [receiving, setReceiving] = useState(false);
  const dropProps = {
    onDragEnter: (event: DragEvent) => {
      if (!carriesCard(event, "user")) return;
      dragDepth.current += 1; setReceiving(true);
    },
    onDragOver: (event: DragEvent) => {
      if (!carriesCard(event, "user")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    },
    onDragLeave: (event: DragEvent) => {
      if (!carriesCard(event, "user")) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setReceiving(false);
    },
    onDrop: (event: DragEvent) => {
      dragDepth.current = 0; setReceiving(false);
      const payload = readCardDrag(event, "user");
      if (!payload) return;
      event.preventDefault();
      const card = canvasStore.getState().cards.find(entry => entry.record.id === payload.cardId)?.record;
      const point = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const grabX = Math.min(payload.grabX ?? 40, card?.layout.width ?? 40), grabY = payload.grabY ?? 24;
      requestCardToCanvas(payload.canvasId, payload.cardId, Math.round(point.x - grabX), Math.round(point.y - grabY));
    },
  };

  return (
    <SubcardThemeContext.Provider value={resolvedTheme ?? resolveTheme(preferences.theme, themeAt, preferences)}><div ref={wrapperRef} className="absolute inset-0 z-10" data-vivic-canvas {...dropProps}>
      {receiving && <div className="vivic-drop-overlay" data-vivic-drop-overlay="display">松开，把卡片放回副屏</div>}
      <ReactFlow
        nodes={nodes}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStart={(_, node) => {
          if (settleTimer.current) clearTimeout(settleTimer.current);
          dragRef.current = beginCanvasDrag(node.id);
        }}
        onNodeDragStop={(_, node) => {
          const drag = dragRef.current;
          dragRef.current = null;
          if (!drag || !commitCanvasDrag(drag, node.position.x, node.position.y)) {
            setDragOverrides({}); return;
          }
          // Only a confirmed owner snapshot enters the store. If the request
          // is dropped, abandon the preview rather than inventing saved state.
          settleTimer.current = setTimeout(() => setDragOverrides({}), 1500);
        }}
        onMoveEnd={(_, viewport) =>
          canvasStore.internal({ type: "canvas.viewport", viewport })
        }
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={null}
        minZoom={0.05}
        maxZoom={1.8}
        colorMode={resolvedTheme ?? resolveTheme(preferences.theme, themeAt, preferences)}
        fitView
        fitViewOptions={{ padding: 0.25, minZoom: 0.05, maxZoom: 1 }}
      />
    </div></SubcardThemeContext.Provider>
  );
};

export const CanvasView = ({ resolvedTheme }: { resolvedTheme?: "light" | "dark" }) => (
  <ReactFlowProvider>
    <CanvasInner resolvedTheme={resolvedTheme} />
  </ReactFlowProvider>
);
