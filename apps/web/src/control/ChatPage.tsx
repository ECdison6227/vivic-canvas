import { useEffect, useState, type ReactNode } from "react";
import { Settings, UserRound } from "lucide-react";
import type { ResolvedCard } from "@/commands/references";
import type { Attachment } from "@/ai/attachments";
import type { ControlHost } from "@/sync/controlHost";
import { ChatComposer, type ClarifyState } from "./ChatComposer";
import { UserCardLayer, useUserPageDrop } from "./UserCardLayer";

interface ChatPageProps {
  hidden: boolean;
  host: ControlHost;
  theme: "light" | "dark";
  feedback: string | null;
  notice?: ReactNode;
  disabled: boolean;
  ownerKey: string;
  clarify: ClarifyState | null;
  suggestions: string[];
  backendOnline: boolean | null;
  busy: boolean;
  onSubmit: (text: string, attachments?: Attachment[]) => void;
  onPickClarify: (candidate: ResolvedCard) => void;
  onPreviewClarify: (candidate: ResolvedCard) => void;
  onCancelClarify: () => void;
  onCancel: () => void;
  onOpenSettings: () => void;
}

const STATUS_VISIBLE_MS = 6000;

/**
 * 用户使用页: the shared background, settings (top left), avatar (top right)
 * and one text/voice input. No conversation is kept — results appear on the
 * Display. Cards the user drags in from the Display float where they land.
 */
export const ChatPage = ({ hidden, host, theme, feedback, notice, onOpenSettings, ...composer }: ChatPageProps) => {
  const drop = useUserPageDrop(host);
  // One transient status line (progress, a question, an error), never a log.
  const [fresh, setFresh] = useState(false);
  const sticky = composer.busy || Boolean(composer.clarify);
  useEffect(() => {
    // Reveal each new status, then let it fade; the text stays for assistive tech.
    // oxlint-disable-next-line react/set-state-in-effect
    setFresh(Boolean(feedback));
    if (!feedback) return;
    const timer = setTimeout(() => setFresh(false), STATUS_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [feedback]);

  return (
    <div className="vivic-chat" hidden={hidden} data-vivic-chat {...drop.handlers}>
      <UserCardLayer host={host} theme={theme} layerRef={drop.layerRef} receiving={drop.receiving} notice={drop.notice} onNotice={drop.setNotice} />
      <header className="vivic-chat-header">
        <button type="button" className="vivic-round-button" onClick={onOpenSettings}
          aria-label="设置" title="设置" data-vivic-open-settings>
          <Settings className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
        {notice}
        <span className="vivic-avatar" role="img" aria-label="我的头像" data-vivic-avatar>
          <UserRound className="h-5 w-5" aria-hidden="true" />
        </span>
      </header>
      <div className="vivic-chat-space" />
      <div className="vivic-chat-footer">
        <p className="vivic-chat-status" role="status" aria-live="polite" aria-busy={composer.busy}
          hidden={!feedback} data-visible={(fresh || sticky) || undefined} data-vivic-command-feedback>{feedback}</p>
        <ChatComposer {...composer} />
      </div>
    </div>
  );
};
