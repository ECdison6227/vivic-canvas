import { Fragment, useEffect, useRef, type ReactNode } from "react";
import { ImageIcon, Settings, UserRound } from "lucide-react";
import type { ResolvedCard } from "@/commands/references";
import type { Attachment } from "@/ai/attachments";
import { ChatComposer, type ClarifyState } from "./ChatComposer";

/** One sent message; `reply` is frozen once the next message starts, the last one shows live feedback. */
export interface ChatTurn { id: string; text: string; image: boolean; reply: string | null }

export const CHAT_WELCOME = "你好，我是 Vivic。打字或按住麦克风说话就能操作画布，例如“十分钟倒计时”“加待办：买菜；回邮件”“上海天气”。";

interface ChatPageProps {
  hidden: boolean;
  turns: ChatTurn[];
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

/** 用户使用页: deliberately simple — settings (top left), avatar (top right), the conversation and one input. */
export const ChatPage = ({ hidden, turns, feedback, notice, onOpenSettings, ...composer }: ChatPageProps) => {
  const scroller = useRef<HTMLDivElement>(null);
  const live = feedback ?? (turns.length === 0 ? CHAT_WELCOME : "");
  useEffect(() => {
    const el = scroller.current;
    if (el && !hidden) el.scrollTop = el.scrollHeight;
  }, [hidden, turns.length, live, composer.busy]);

  return (
    <div className="vivic-chat" hidden={hidden} data-vivic-chat>
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
      <div className="vivic-chat-scroll" ref={scroller}>
        <div className="vivic-chat-column" data-vivic-chat-log>
          {turns.map((turn, index) => <Fragment key={turn.id}>
            <div className="vivic-bubble vivic-bubble-user" data-vivic-chat-user>
              {turn.image && <span className="vivic-bubble-tag"><ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />图片</span>}
              {turn.text}
            </div>
            {index < turns.length - 1 && turn.reply && <div className="vivic-bubble vivic-bubble-assistant">{turn.reply}</div>}
          </Fragment>)}
          {composer.busy && !feedback && <div className="vivic-bubble vivic-bubble-assistant vivic-typing" aria-hidden="true"><span /><span /><span /></div>}
          <p className="vivic-bubble vivic-bubble-assistant" role="status" aria-live="polite" aria-busy={composer.busy}
            hidden={!live} data-vivic-command-feedback>{live}</p>
        </div>
      </div>
      <div className="vivic-chat-footer">
        <ChatComposer {...composer} />
      </div>
    </div>
  );
};
