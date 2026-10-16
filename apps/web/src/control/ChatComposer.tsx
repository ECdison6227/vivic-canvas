import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowUp, LoaderCircle, Volume2 } from "lucide-react";
import { getSpeechSnapshot, subscribeSpeech } from "@/ai/speech";
import type { ResolvedCard } from "@/commands/references";
import type { CommandClarifyAction } from "@/commands/parse";
import { VoiceInput, VoiceNote } from "./VoiceInput";
import { cancelVoiceInput } from "@/ai/voiceInput";
import { ImageAttachment } from "./ImageAttachment";
import type { Attachment } from "@/ai/attachments";
import { getProvidersStatus } from "@/ai/api";
import { LocalWakeInput } from "./LocalSpeechSettings";
import { getVoiceConfiguration, subscribeVoiceConfiguration } from "@/ai/voiceConfig";

export interface ClarifyState {
  action: CommandClarifyAction;
  canvasId?: string;
  candidates: ResolvedCard[];
  prompt: string;
  choiceId?: string;
  expiresAt?: number;
}

interface ChatComposerProps {
  disabled: boolean;
  clarify: ClarifyState | null;
  suggestions?: string[];
  backendOnline: boolean | null;
  onSubmit: (text: string, attachments?: Attachment[]) => void;
  ownerKey?: string;
  onPickClarify: (candidate: ResolvedCard) => void;
  onPreviewClarify?: (candidate: ResolvedCard) => void;
  onCancelClarify: () => void;
  busy: boolean;
  onCancel: () => void;
}

/**
 * The user page's only input: text, the + image draft and the press-to-talk
 * mic share one bar (图一). Choices, suggestions and progress sit above it.
 */
export const ChatComposer = ({
  disabled,
  clarify,
  suggestions = [],
  backendOnline,
  onSubmit,
  onPickClarify,
  onPreviewClarify,
  onCancelClarify,
  busy,
  onCancel,
  ownerKey = "control",
}: ChatComposerProps) => {
  const [text, setText] = useState("");
  const composing = useRef(false);
  const [elapsed, setElapsed] = useState(0);
  const latestDraft = useRef(text); latestDraft.current = text;
  const draftAtVoiceStart = useRef("");
  const [unappliedVoice, setUnappliedVoice] = useState<string | null>(null);
  const [autoVoice, setAutoVoice] = useState(false);
  const autoAtVoiceStart = useRef(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [imageProcessing, setImageProcessing] = useState(false);
  const [imageReset, setImageReset] = useState(0);
  const [visionAvailable, setVisionAvailable] = useState(false);
  const [modelConnection, setModelConnection] = useState<{ connected: boolean; name: string } | null>(null);
  const [wakeCancelKey, setWakeCancelKey] = useState(0);
  const voiceConfig = useSyncExternalStore(subscribeVoiceConfiguration, getVoiceConfiguration);
  const speech = useSyncExternalStore(subscribeSpeech, getSpeechSnapshot);
  useEffect(() => {
    let active = true;
    const clear = () => { setAttachment(null); setImageReset(value => value + 1); setWakeCancelKey(value => value + 1); };
    const refresh = async () => {
      try { const data = await getProvidersStatus(); const provider = data.providers.find(item => item.name === (data.activeProvider ?? "stepfun"));
        if (active) {
          setVisionAvailable(Boolean(provider?.connected && provider.capabilities.includes("vision")));
          setModelConnection({ connected: Boolean(provider?.connected), name: provider?.defaultModel ?? (data.activeProvider === "gpt" ? "GPT" : "StepFun") });
        }
      } catch { if (active) { setVisionAvailable(false); setModelConnection(null); } }
    };
    void refresh(); const timer = setInterval(() => void refresh(), 3000);
    window.addEventListener("vivic:provider-change", clear);
    window.addEventListener("vivic:voice-config-change", clear);
    return () => { active = false; clearInterval(timer); window.removeEventListener("vivic:provider-change", clear); window.removeEventListener("vivic:voice-config-change", clear); };
  }, []);
  useEffect(() => {
    if (!busy) { setElapsed(0); return; }
    const began = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - began) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  const submit = () => {
    const value = text.trim();
    if (!value || imageProcessing || (attachment && !visionAvailable)) return;
    const images = attachment ? [attachment] : undefined;
    setWakeCancelKey(value => value + 1);
    setAttachment(null); setImageReset(value => value + 1);
    cancelVoiceInput(); setUnappliedVoice(null);
    setText("");
    onSubmit(value, images);
  };
  const beginVoiceDraft = () => {
    onCancel(); draftAtVoiceStart.current = latestDraft.current; autoAtVoiceStart.current = autoVoice; setUnappliedVoice(null);
  };
  const receiveTranscript = (value: string) => {
    if (!attachment && !imageProcessing && latestDraft.current === draftAtVoiceStart.current && autoAtVoiceStart.current && autoVoice) {
      cancelVoiceInput(); setText(""); onSubmit(value);
    } else if (latestDraft.current === draftAtVoiceStart.current) setText(value);
    else setUnappliedVoice(value);
  };

  const modePill =
    backendOnline === null
      ? { text: "意图路由检查中…", tone: "checking" }
      : backendOnline
        ? modelConnection?.connected ? { text: `已连接 · ${modelConnection.name}`, tone: "connected" }
          : { text: "模型未连接 · 可用本地指令", tone: "warning" }
        : { text: "离线本地模式", tone: "warning" };
  const sendDisabled = disabled || !text.trim() || imageProcessing || Boolean(attachment && !visionAvailable);

  return (
    <ImageAttachment disabled={disabled} ownerKey={ownerKey} resetKey={imageReset} visionAvailable={visionAvailable}
      onChange={setAttachment} onProcessingChange={setImageProcessing}>{parts => <div className="vivic-composer" data-vivic-composer>
      <div className="vivic-composer-stack">
        {clarify && <div className="vivic-chip-row" data-vivic-clarify>
          {clarify.candidates.map((c, index) => (
            <button key={c.card.id} type="button" className="vivic-chip"
              onClick={() => onPickClarify(c)}
              onPointerEnter={() => onPreviewClarify?.(c)}
              onFocus={() => onPreviewClarify?.(c)}
              data-vivic-clarify-candidate
            >
              {index + 1}号 · {c.label}
            </button>
          ))}
          <button type="button" className="vivic-chip vivic-chip-quiet" onClick={onCancelClarify}>取消</button>
        </div>}
        {suggestions.length > 0 && <div className="vivic-chip-row" data-vivic-data-suggestions>
          {suggestions.map(suggestion => <button key={suggestion} type="button" className="vivic-chip"
            disabled={disabled || busy} onClick={() => { setText(""); onSubmit(suggestion); }}>{suggestion}</button>)}
        </div>}
        {unappliedVoice && <div className="vivic-composer-card" data-vivic-unapplied-voice>
          <p>{unappliedVoice}</p>
          <p className="vivic-composer-card-hint">你在识别期间改过输入，已保留现有文字。</p>
          <button type="button" className="vivic-chip" onClick={() => { setText(unappliedVoice); setUnappliedVoice(null); }}>使用这段转写</button>
        </div>}
        {(busy || speech.status === "loading" || speech.status === "playing") && <div className="vivic-composer-progress" data-vivic-command-progress>
          {speech.status === "playing" && !busy ? <Volume2 className="h-4 w-4" aria-hidden="true" /> : <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          <span>{busy ? "正在理解并安排你的指令" : speech.status === "loading" ? "正在准备语音" : "正在说话"}</span>
          {busy && <span className="vivic-composer-progress-time" data-vivic-wait-seconds>{elapsed} 秒</span>}
          {busy && <button type="button" className="vivic-chip vivic-chip-quiet" onClick={() => { setWakeCancelKey(value => value + 1); onCancel(); }} data-vivic-command-cancel>
            取消
          </button>}
        </div>}
        <VoiceNote autoExecute={autoVoice} />
        <div hidden={!parts.active}>
          {(parts.preview || parts.remove) && <div className="vivic-attachment-row">{parts.preview}{parts.remove}</div>}
          {parts.status}
        </div>
      </div>
      <form
        className="vivic-composer-bar"
        onSubmit={(e) => {
          e.preventDefault();
          if (composing.current) return;
          submit();
        }}
      >
        <input
          className="vivic-composer-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="给 Vivic 发消息"
          disabled={disabled}
          aria-label="指令输入"
          enterKeyHint="send"
          data-vivic-command-input
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={() => { composing.current = false; }}
          onKeyDown={event => {
            if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) {
              if (event.key === "Enter") event.preventDefault();
              return;
            }
            if (event.key === "Escape" && clarify) { event.preventDefault(); onCancelClarify(); }
          }}
        />
        {parts.trigger}
        <VoiceInput disabled={disabled || (backendOnline === false && voiceConfig.stt === "stepfun")} autoExecute={autoVoice}
          onBegin={() => { setWakeCancelKey(value => value + 1); beginVoiceDraft(); }} onTranscript={receiveTranscript} />
        <button type="submit" className="vivic-composer-send" disabled={sendDisabled}
          aria-label={busy ? "发送新指令" : "发送"} title={busy ? "发送新指令" : "发送"} data-vivic-command-send>
          <ArrowUp className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      </form>
      <div className="vivic-composer-meta">
        <span className="vivic-mode-pill" data-tone={modePill.tone} data-vivic-intent-mode>{modePill.text}</span>
        <label className="vivic-toggle">
          <input type="checkbox" checked={autoVoice}
            disabled={disabled} onChange={event => setAutoVoice(event.target.checked)} data-vivic-voice-auto />
          识别后自动发送
        </label>
        {voiceConfig.stt !== "none" && <LocalWakeInput compact ownerKey={ownerKey} cancelKey={wakeCancelKey}
          disabled={disabled || busy || (backendOnline === false && voiceConfig.stt === "stepfun")}
          speaking={speech.loading || speech.playing} recognition={voiceConfig.stt === "local" ? "local" : "segment"}
          onBegin={beginVoiceDraft} onTranscript={receiveTranscript}
          onSegment={async event => {
            const form = new FormData(); form.append("file", event.wav, "voice.wav");
            const response = await fetch("/api/transcribe", { method: "POST", body: form,
              signal: AbortSignal.any([event.signal, AbortSignal.timeout(40000)]), cache: "no-store" });
            const result = await response.json();
            if (event.signal.aborted) return;
            if (!response.ok || result.ok !== true || typeof result.text !== "string" || !result.text.trim() || result.text.length > 500) {
              throw new Error(typeof result.error === "string" ? result.error.slice(0, 300) : "语音识别未完成，请改用文字或PTT。");
            }
            receiveTranscript(result.text);
          }} />}
      </div>
    </div>}</ImageAttachment>
  );
};
