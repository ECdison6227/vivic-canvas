import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { CardRecord } from "@/contracts";
import { SCENE_CARD_KICKERS } from "./sceneMeta";
import { useCardMode } from "./cardContext";
import "./sceneCards.css";

export type BadgeTone = "accent" | "positive" | "caution" | "danger" | "neutral";

interface ShellProps {
  card: CardRecord;
  /** Display: the exact inner height the canvas reserved; omitted on the user page. */
  height?: number;
  title?: ReactNode;
  meta?: ReactNode;
  badge?: ReactNode;
  badgeTone?: BadgeTone;
  icon?: LucideIcon;
  kicker?: string;
  footer?: ReactNode;
  /** Edge-to-edge media cards draw over the card padding. */
  bleed?: boolean;
  /** Hide the standard header entirely (cover-style cards draw their own). */
  bare?: boolean;
  className?: string;
  children?: ReactNode;
}

/** Unified header/body/footer rhythm for every scene card. */
export function SceneCardShell({ card, height, title, meta, badge, badgeTone = "accent", icon, kicker, footer, bleed, bare, className, children }: ShellProps) {
  const mode = useCardMode();
  const fallback = SCENE_CARD_KICKERS[card.type];
  const Icon = icon ?? fallback.icon;
  const fixedHeight = height === undefined ? undefined : Math.max(40, bleed ? height + 40 : height);
  return <section
    className={`vivic-scene${className ? ` ${className}` : ""}`}
    data-scene-card={card.type}
    data-mode={mode}
    data-fixed={fixedHeight !== undefined || undefined}
    data-bleed={bleed || undefined}
    style={fixedHeight !== undefined ? { height: fixedHeight } : undefined}
  >
    {!bare && <header className="vivic-scene-head">
      <span className="vivic-scene-kicker"><Icon size={13} strokeWidth={2.2} aria-hidden />{kicker ?? fallback.label}</span>
      {badge !== undefined && badge !== null && badge !== false && <span className="vivic-scene-badge" data-tone={badgeTone}>{badge}</span>}
    </header>}
    {!bare && title && <h3 className="vivic-scene-title">{title}</h3>}
    {!bare && meta && <p className="vivic-scene-meta">{meta}</p>}
    <div className="vivic-scene-body">{children}</div>
    {footer && <footer className="vivic-scene-foot">{footer}</footer>}
  </section>;
}

/** Shared empty state; on the user page it can carry the action that fills it. */
export function SceneEmpty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="vivic-scene-empty" data-scene-empty><span>{children}</span>{action}</div>;
}
