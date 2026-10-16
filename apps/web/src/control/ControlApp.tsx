import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { buildCanvasContext, postIntent } from "@/ai/api";
import { cancelSpeech, speakText, subscribeSpeech, getSpeechSnapshot, speakShortFeedback, cancelShortFeedback } from "@/ai/speech";
import { speechDisplayFrame, type SpeechRange } from "@/ai/speechTelemetry";
import { LocalDecisionSettings } from "./LocalDecisionSettings";
import { clarifiedCardAction, fastLocalCommand, parseCommand, type CommandResult } from "@/commands/parse";
import { choiceNumber } from "@/commands/choice";
import { completedCountdown } from "@/canvas/reminderPresentation";
import type { ResolvedCard } from "@/commands/references";
import { applyUrlTheme } from "@/lib/urlTheme";
import { newId } from "@/lib/id";
import { canvasStore, useDisplayPreferences } from "@/state/canvasStore";
import { getControlHost } from "@/sync/browserRuntime";
import type { ControlHost } from "@/sync/controlHost";
import { AiSection } from "./AiSection";
import { CanvasManager } from "./CanvasManager";
import type { ClarifyState } from "./ChatComposer";
import { ChatPage, type ChatTurn } from "./ChatPage";
import { BackgroundSettings } from "./BackgroundSettings";
import { DataActions } from "./DataActions";
import { RemindersSection } from "./RemindersSection";
import type { ReminderNotice } from "@/reminders/reminders";
import { deliveredNoticeCurrent } from "@/reminders/reminders";
import { cancelVoiceInput, getVoiceInputSnapshot, isVoiceInputBusy, subscribeVoiceInput } from "@/ai/voiceInput";
import { LocalSpeechSettings } from "./LocalSpeechSettings";
import { CanvasSettings } from "./CanvasSettings";
import { CardSubcardsSection } from "./CardSubcardsSection";
import { QuickFind } from "./QuickFind";
import type { Attachment } from "@/ai/attachments";
import { startsNewInstruction } from "@vivic/contracts";
import { focusResponseActions } from "@/commands/responseFocus";
import { armReminderSound } from "@/reminders/sound";
import { ArrowLeft } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { AtmosphereBackground } from "@/components/atmosphere/AtmosphereBackground";
import { paletteFor } from "@/components/atmosphere/palettes";
import { useResolvedTheme } from "@/stage/useResolvedTheme";
import { pathForView, viewForPath, type ControlView } from "./controlView";

export const INTENT_TIMEOUT_MS = 100_000;
const MAX_TURNS = 50;

/** A non-action result must still reach Display after the thinking lease ends. */
const publishFeedback = (host: ControlHost, text: string) => {
  const { activeCanvasId, ownerMode } = host.getSnapshot();
  if (!activeCanvasId || ownerMode !== "owner") return;
  host.dispatch({ schemaVersion: "0.6", requestId: newId("feedback"), canvasId: activeCanvasId,
    actions: [{ type: "subtitle.show", text: text.slice(0, 120), durationMs: 12000 }] });
};

declare global {
  interface Window {
    __vivicControl?: {
      snapshot: () => unknown;
      switchCanvas: (id: string) => void;
      createCanvas: (title?: string) => string;
      undo: () => boolean;
      takeover: () => void;
    };
  }
}

export const ControlApp = () => {
  const [host, setHost] = useState<ControlHost | null>(null);
  const [clarify, setClarify] = useState<ClarifyState | null>(null);
  const [feedback, setFeedbackState] = useState<string | null>(null);
  // The ref mirrors feedback synchronously so a new turn can freeze the previous reply.
  const feedbackRef = useRef<string | null>(null);
  const setFeedback = useCallback((next: string | null | ((prev: string | null) => string | null)) => {
    const value = typeof next === "function" ? next(feedbackRef.current) : next;
    feedbackRef.current = value;
    setFeedbackState(value);
  }, []);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const startTurn = useCallback((text: string, image: boolean) => {
    const reply = feedbackRef.current;
    setTurns(prev => [...prev.slice(0, -1), ...prev.slice(-1).map(turn => ({ ...turn, reply })),
      { id: newId("turn"), text, image, reply: null }].slice(-MAX_TURNS));
    setFeedback(null);
  }, [setFeedback]);
  const [view, setView] = useState<ControlView>(() => viewForPath(window.location.pathname));
  useEffect(() => {
    const sync = () => setView(viewForPath(window.location.pathname));
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const navigate = useCallback((next: ControlView) => {
    const path = pathForView(next);
    if (window.location.pathname !== path) window.history.pushState(null, "", `${path}${window.location.search}`);
    setView(next);
  }, []);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef<{
    requestId: string;
    canvasId: string;
    controller: AbortController;
    slowTimer: ReturnType<typeof setTimeout>;
    deadlineTimer: ReturnType<typeof setTimeout>;
    feedbackTimer: ReturnType<typeof setTimeout>;
    expiresAt: number;
    text: string;
  } | null>(null);
  const reminderQueue = useRef<ReminderNotice[]>([]);
  useEffect(() => {
    const unlock = () => { if (host?.getSnapshot().ownerMode === "owner") armReminderSound(); };
    window.addEventListener("pointerdown", unlock); window.addEventListener("keydown", unlock);
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, [host]);
  const announcing = useRef(false);
  const previousQuestion = useRef<{ canvasId: string; utterance: string; question: string; at: number } | null>(null);

  const cancelPending = useCallback(() => {
    cancelVoiceInput();
    cancelSpeech();
    setSuggestions([]);
    const current = pending.current;
    if (!current) return;
    pending.current = null;
    current.controller.abort();
    clearTimeout(current.slowTimer);
    clearTimeout(current.deadlineTimer);
    clearTimeout(current.feedbackTimer);
    host?.setActivity(current.requestId, null);
    setBusy(false);
    setFeedback("已取消本次请求");
  }, [host, setFeedback]);

  useEffect(() => {
    window.addEventListener("vivic:provider-change", cancelPending);
    window.addEventListener("vivic:voice-config-change", cancelPending);
    return () => { window.removeEventListener("vivic:provider-change", cancelPending); window.removeEventListener("vivic:voice-config-change", cancelPending); };
  }, [cancelPending]);

  // Speech state follows actual audio loading/playback, rather than a guessed
  // fixed subtitle duration. The short lease also expires if control disappears.
  useEffect(() => {
    if (!host) return;
    let voiceActivityId: string | null = null;
    let lastSpeechRange: SpeechRange | null = null;
    const update = () => {
      const speech = getSpeechSnapshot();
      if (isVoiceInputBusy() || host.getSnapshot().ownerMode !== "owner") return;
      const live = speech.status === "loading" || speech.status === "playing";
      if (pending.current && (!live || speech.kind !== "phrase" || speech.status === "loading")) {
        if (voiceActivityId) {
          host.setActivity(voiceActivityId, null); voiceActivityId = null;
          const current = pending.current;
          host.setActivity(current.requestId, { requestId: current.requestId, text: current.text, phase: "thinking", expiresAt: current.expiresAt });
        }
        return;
      }
      if (live && speech.requestId) {
        const requestId = `voice_${speech.requestId}`.slice(0, 128);
        if (voiceActivityId !== requestId) lastSpeechRange = null;
        voiceActivityId = requestId;
        const frame = speechDisplayFrame(speech.text || "正在说话…", speech.wordRange, lastSpeechRange);
        if (speech.wordRange) lastSpeechRange = speech.wordRange;
        host.setActivity(requestId, { requestId,
          text: speech.status === "loading" ? "正在准备语音…" : frame.text,
          phase: speech.status === "loading" ? "preparing-speech" : "speaking",
          ...(speech.status === "playing" ? { speech: { amplitude: speech.amplitude,
            ...(frame.wordStart !== undefined ? { wordStart: frame.wordStart, wordEnd: frame.wordEnd } : {}) } } : {}),
          expiresAt: Date.now() + 6000,
        });
      } else if (voiceActivityId) {
        host.setActivity(voiceActivityId, null);
        voiceActivityId = null;
      }
    };
    const unsubscribe = subscribeSpeech(update);
    const timer = setInterval(update, 2000);
    return () => { unsubscribe(); clearInterval(timer); if (voiceActivityId) host.setActivity(voiceActivityId, null); };
  }, [host]);

  useEffect(() => {
    if (!host) return;
    let requestId: string | null = null;
    const update = () => {
      const voice = getVoiceInputSnapshot();
      if (host.getSnapshot().ownerMode !== "owner") return;
      if (isVoiceInputBusy()) {
        requestId ??= newId("microphone");
        host.setActivity(requestId, { requestId,
          phase: voice.status === "transcribing" ? "transcribing" : "listening",
          text: voice.status === "transcribing" ? "正在识别语音…" : voice.status === "requesting" ? "等待麦克风授权…" : "在听，请说…",
          expiresAt: Date.now() + 6000,
        });
      } else if (requestId) { host.setActivity(requestId, null); requestId = null; }
    };
    const unsubscribe = subscribeVoiceInput(update);
    const timer = setInterval(update, 2000);
    return () => { unsubscribe(); clearInterval(timer); if (requestId) host.setActivity(requestId, null); };
  }, [host]);

  useEffect(() => {
    if (!host) return;
    const seen = new Set(host.getSnapshot().reminderNotices.map(n => n.id));
    let cancelled = false;
    const drain = async () => {
      if (announcing.current || pending.current || isVoiceInputBusy() || getSpeechSnapshot().status === "playing" || getSpeechSnapshot().status === "loading") return;
      announcing.current = true;
      try {
        while (!cancelled && reminderQueue.current.length && !pending.current && !isVoiceInputBusy() && host.getSnapshot().ownerMode === "owner" &&
          getSpeechSnapshot().status !== "playing" && getSpeechSnapshot().status !== "loading") {
          const notice = reminderQueue.current.shift()!;
          // If the timer was removed/rescheduled after firing, don't read a
          // now-obsolete queued announcement when another sound finishes.
          const current = host.getSnapshot().reminders.find(r => r.canvasId === notice.canvasId && r.card.id === notice.cardId);
          if (!current || !deliveredNoticeCurrent(notice, current.card)) continue;
          await speakText(`提醒：${notice.text}`.slice(0, 200), { requestId: notice.id });
        }
      } finally { announcing.current = false; }
    };
    const collect = () => {
      for (const notice of host.getSnapshot().reminderNotices) {
        if (seen.has(notice.id)) continue;
        const timer = host.getSnapshot().reminders.find(r => r.canvasId === notice.canvasId && r.card.id === notice.cardId);
        if (!timer || !deliveredNoticeCurrent(notice, timer.card)) continue;
        seen.add(notice.id);
        reminderQueue.current.push(notice);
      }
      if (host.getSnapshot().ownerMode !== "owner") reminderQueue.current = [];
      void drain();
    };
    const unsubscribe = host.subscribe(collect);
    const timer = setInterval(() => void drain(), 500);
    return () => { cancelled = true; unsubscribe(); clearInterval(timer); reminderQueue.current = []; };
  }, [host]);

  useEffect(() => {
    if (!host) return;
    let lastCanvasId = host.getSnapshot().activeCanvasId;
    const unsubscribe = host.subscribe(() => {
      const current = pending.current;
      const snap = host.getSnapshot();
      if (snap.activeCanvasId !== lastCanvasId || snap.ownerMode !== "owner") { cancelSpeech(); cancelVoiceInput(); setClarify(null); setSuggestions([]); previousQuestion.current = null; }
      lastCanvasId = snap.activeCanvasId;
      if (current && (snap.activeCanvasId !== current.canvasId || snap.ownerMode !== "owner")) {
        cancelPending();
      }
    });
    return () => {
      unsubscribe();
      cancelPending();
    };
  }, [host, cancelPending]);

  useEffect(() => {
    let cancelled = false;
    applyUrlTheme();
    void getControlHost().then((h) => {
      if (cancelled) return;
      setHost(h);
      if (import.meta.env.DEV) {
        window.__vivic = {
          dispatch: (raw) => h.dispatch(raw),
          internal: (action) =>
            canvasStore.internal(
              action as Parameters<typeof canvasStore.internal>[0],
            ),
          getState: () => canvasStore.getState(),
        };
        window.__vivicControl = {
          snapshot: () => h.getSnapshot(),
          switchCanvas: (id) => h.switchCanvas(id),
          createCanvas: (title) => h.createCanvas(title),
          undo: () => h.undo(),
          takeover: () => h.takeover(),
        };
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const applyResult = useCallback(
    (h: ControlHost, result: CommandResult) => {
      const { activeCanvasId } = h.getSnapshot();
      setClarify(null); h.setTargetChoice(null); setSuggestions([]);
      if (result.kind === "unknown") {
        setFeedback(result.message);
        publishFeedback(h, result.message);
        return;
      }
      if (result.kind === "undo") {
        const text = h.undo() ? "已撤销上一次删除" : "没有可撤销的删除";
        setFeedback(text);
        void speakText(text, { requestId: newId("speech") });
        return;
      }
      if (result.kind === "clarify") {
        const choiceId = newId("choice"), expiresAt = Date.now() + 120_000;
        const prompt = `${result.prompt} 请回复几号，也可以点击选择。`;
        setClarify({ ...result, prompt, choiceId, expiresAt, canvasId: activeCanvasId ?? undefined });
        h.setTargetChoice({ id: choiceId, targets: result.candidates.map(c => c.card.id), expiresAt });
        setFeedback(prompt); publishFeedback(h, prompt);
        void speakText(prompt, { requestId: newId("speech") });
        return;
      }
      const res = h.dispatch({
        schemaVersion: "0.6",
        requestId: newId("cmd"),
        canvasId: activeCanvasId ?? "",
        spokenText: result.spokenText,
        actions: focusResponseActions(result.actions, canvasStore.getState()),
      });
      const message = res.ok ? result.spokenText ?? result.description : `指令未执行（${res.error}）`;
      setFeedback(message);
      if (!res.ok) publishFeedback(h, message);
      if (res.ok && result.spokenText) void speakText(result.spokenText, { requestId: newId("speech") });
    },
    [setFeedback],
  );

  const pickClarify = useCallback(
    (candidate: ResolvedCard) => {
      if (!host || !clarify) return;
      host.setTargetChoice(null);
      const { activeCanvasId, ownerMode } = host.getSnapshot();
      if (!activeCanvasId || ownerMode !== "owner" || !clarify.candidates.some(item => item.card.id === candidate.card.id)) return;
      if ((clarify.expiresAt && Date.now() >= clarify.expiresAt) || (clarify.canvasId && clarify.canvasId !== activeCanvasId)) { setClarify(null); setFeedback("画布已变更，请重新指定卡片。"); return; }
      const current = canvasStore.getState().cards.find(item => item.record.id === candidate.card.id && !item.exitingRequestId && !completedCountdown(item))?.record;
      const action = current ? clarifiedCardAction(clarify.action, current) : null;
      if (!action) { setClarify(null); setFeedback("目标已变更，请重新指定卡片。"); return; }
      const verb = { delete: "删除", focus: "聚焦", highlight: "高亮", expand: "展开", collapse: "收起" }[clarify.action];
      const message = `已${verb}${candidate.label}`;
      const res = host.dispatch({
        schemaVersion: "0.6",
        requestId: newId("cmd"),
        canvasId: activeCanvasId ?? "",
        spokenText: message,
        actions: action.type === "card.update" && action.variant !== undefined ? [action, { type: "canvas.fit" }] : [action],
      });
      setClarify(null);
      setFeedback(res.ok ? `${message}${clarify.action === "delete" ? "，可撤销" : ""}` : res.error);
      if (res.ok) void speakText(message, { requestId: newId("speech") });
    },
    [host, clarify, setFeedback],
  );

  useEffect(() => {
    if (!host || !clarify) return;
    const check = () => {
      const snapshot = host.getSnapshot();
      const cards = canvasStore.getState().cards;
      if (snapshot.ownerMode !== "owner" || snapshot.activeCanvasId !== clarify.canvasId
        || Date.now() >= (clarify.expiresAt ?? Infinity)
        || clarify.candidates.some(c => !cards.some(entry => entry.record.id === c.card.id && !entry.exitingRequestId && !completedCountdown(entry)))) {
        setClarify(null); host.setTargetChoice(null); setFeedback("选择已失效，请重新指定目标。");
      }
    };
    const unsubscribe = host.subscribe(check), timer = setInterval(check, 1000);
    check(); return () => { unsubscribe(); clearInterval(timer); };
  }, [host, clarify, setFeedback]);

  const submitCommand = useCallback(
    (text: string, attachments?: Attachment[]) => {
      if (!host) return;
      const snap = host.getSnapshot();
      if (!snap.activeCanvasId || snap.ownerMode !== "owner") return;
      armReminderSound();
      const trimmed = text.trim();
      // A request still running is answered "已取消" in its own turn before this one starts.
      if (pending.current) cancelPending();
      startTurn(trimmed, Boolean(attachments?.length));
      if (clarify && !attachments?.length) {
        const number = choiceNumber(trimmed);
        if (number !== null) {
          const candidate = clarify.candidates[number - 1];
          if (!candidate) { setFeedback(`请选 1 到 ${clarify.candidates.length} 号。`); return; }
          pickClarify(candidate); return;
        }
        if (/^(?:取消|算了|不删了|不用了)$/.test(trimmed)) {
          setClarify(null); host.setTargetChoice(null); setFeedback("已取消选择"); return;
        }
      }
      cancelPending();
      setClarify(null); host.setTargetChoice(null); setSuggestions([]);
      const activeCanvasId = snap.activeCanvasId;
      const previous = previousQuestion.current;
      const continuation = previous && previous.canvasId === activeCanvasId && Date.now() - previous.at < 120_000 && trimmed.length <= 80
        && !attachments?.length && !startsNewInstruction(trimmed, previous.utterance)
        ? { utterance: previous.utterance, question: previous.question } : undefined;
      previousQuestion.current = null;
      if (!attachments?.length && /^(?:请|帮我|请帮我)?\s*(?:重新排(?:布|列|版)(?:卡片)?(?:并?居中)?|整理(?:布局|画布)|排好卡片)[。！!]*$/.test(trimmed)) {
        const result = host.arrangeCanvas();
        setFeedback(result.ok ? "已重新排布，固定卡片保持原位。" : "暂时无法整理布局，请检查控制权后重试。");
        return;
      }
      const runLocal = () =>
        applyResult(
          host,
          parseCommand(trimmed, {
            state: canvasStore.getState(),
            canvasId: activeCanvasId,
          }),
        );
      if (!attachments?.length && !continuation) {
        const exact = fastLocalCommand(trimmed, { state: canvasStore.getState(), canvasId: activeCanvasId });
        if (exact) { applyResult(host, exact); return; }
      }
      // 撤销 is window-local undo-stack semantics: handle it here, never
      // round-trip to the decision API.
      if (!attachments?.length && /^(撤销|撤销删除)$/.test(trimmed)) {
        runLocal();
        return;
      }
      // Resolve explicit Note density locally first: an ambiguous target must not be guessed by a model.
      if (!attachments?.length && /^(?:请\s*)?(?:展开|收起|折叠|(?:把|将).+(?:展开|收起|折叠)[。！!]?$)/.test(trimmed)) {
        runLocal();
        return;
      }
      const requestId = newId("intent");
      const controller = new AbortController();
      const expiresAt = Date.now() + INTENT_TIMEOUT_MS;
      const isCurrent = () => pending.current?.requestId === requestId &&
        host.getSnapshot().activeCanvasId === activeCanvasId &&
        host.getSnapshot().ownerMode === "owner";
      pending.current = {
        requestId,
        canvasId: activeCanvasId,
        controller,
        deadlineTimer: setTimeout(() => controller.abort(new DOMException("请求超时", "TimeoutError")), INTENT_TIMEOUT_MS),
        feedbackTimer: setTimeout(() => {
          if (isCurrent()) void speakShortFeedback("我看看", { requestId: `${requestId}:checking`, signal: controller.signal });
        }, 300),
        slowTimer: setTimeout(() => {
          if (!isCurrent()) return;
          const text = "响应较慢，仍在处理…";
          pending.current!.text = text;
          setFeedback(text);
          host.setActivity(requestId, { requestId, text, expiresAt, phase: "thinking" });
          void speakShortFeedback("稍等", { requestId: `${requestId}:slow`, signal: controller.signal });
        }, 5000),
        expiresAt, text: "让我想想…",
      };
      setBusy(true);
      setFeedback("正在理解你的指令…");
      host.setActivity(requestId, { requestId, text: "让我想想…", expiresAt, phase: "thinking" });
      // Backend-first: /api/intent (rules-first, then LLM planner when a key
      // exists). When the local API is offline, fall back to the in-browser
      // rules — an explicit offline mode, surfaced in the mode pill.
      void (async () => {
        try {
          const result = await postIntent(
            trimmed,
            buildCanvasContext(canvasStore.getState(), activeCanvasId),
            controller.signal,
            attachments,
            continuation,
          );
          if (!isCurrent()) return;
          cancelShortFeedback(requestId);
          setBackendOnline(true);
          if (result.kind === "envelope" && result.envelope) {
            const res = host.dispatch({ ...result.envelope, actions: focusResponseActions(result.envelope.actions, canvasStore.getState()) });
            const message = res.ok ? result.envelope.spokenText ?? "已执行" : `指令未执行（${res.error}）`;
            setFeedback(message);
            if (!res.ok) publishFeedback(host, message);
            if (res.ok && !res.deduplicated && result.envelope.spokenText) {
              void speakText(result.envelope.spokenText, { requestId: result.envelope.requestId });
            }
          } else {
            // No envelope (rules miss / model offline / planner failed):
            // the in-browser parser knows the local references better — try
            // it before surfacing the server's honest "can't do that" line.
            const local = attachments?.length ? { kind: "unknown" as const, message: result.message ?? "图片分析未完成。" } : parseCommand(trimmed, {
              state: canvasStore.getState(),
              canvasId: activeCanvasId,
            });
            if (local.kind !== "unknown") {
              applyResult(host, local);
            } else {
              const message = result.message ?? local.message;
              setFeedback(message);
              publishFeedback(host, message);
              setSuggestions(result.suggestions ?? []);
              if (result.kind === "clarify" && result.message) previousQuestion.current = {
                canvasId: activeCanvasId, utterance: continuation?.utterance ?? trimmed,
                question: result.message.slice(0, 180), at: Date.now(),
              };
            }
          }
        } catch (error) {
          if (!isCurrent()) return;
          cancelShortFeedback(requestId);
          if (error instanceof DOMException && error.name === "TimeoutError") {
            setFeedback("本次请求超时，请重试。");
            publishFeedback(host, "本次请求超时，请重试。");
            return;
          }
          setBackendOnline(false);
          if (attachments?.length) { setFeedback("图片分析服务暂不可达，未执行任何动作；文字输入仍可使用。"); return; }
          runLocal();
          setFeedback((prev) => (prev ? `离线本地模式 · ${prev}` : prev));
        } finally {
          if (pending.current?.requestId === requestId) {
            cancelShortFeedback(requestId);
            clearTimeout(pending.current.slowTimer);
            clearTimeout(pending.current.deadlineTimer);
            clearTimeout(pending.current.feedbackTimer);
            pending.current = null;
            host.setActivity(requestId, null);
            setBusy(false);
          }
        }
      })();
    },
    [host, applyResult, cancelPending, clarify, pickClarify, setFeedback, startTurn],
  );


  if (!host) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0C1224] text-sm text-white/70">
        正在载入本地画布…
      </div>
    );
  }

  return (
    <ControlShell
      host={host}
      view={view}
      onNavigate={navigate}
      turns={turns}
      clarify={clarify}
      feedback={feedback}
      suggestions={suggestions}
      onSubmit={submitCommand}
      onPickClarify={pickClarify}
      onCancelClarify={() => { setClarify(null); host.setTargetChoice(null); setFeedback("已取消选择"); }}
      backendOnline={backendOnline}
      onBackendChange={setBackendOnline}
      busy={busy}
      onCancel={cancelPending}
    />
  );
};

interface ShellProps {
  host: ControlHost;
  view: ControlView;
  onNavigate: (view: ControlView) => void;
  turns: ChatTurn[];
  clarify: ClarifyState | null;
  feedback: string | null;
  suggestions: string[];
  backendOnline: boolean | null;
  onSubmit: (text: string, attachments?: Attachment[]) => void;
  onPickClarify: (candidate: ResolvedCard) => void;
  onCancelClarify: () => void;
  onBackendChange: (online: boolean) => void;
  busy: boolean;
  onCancel: () => void;
}

/**
 * One owner window, two pages that stay mounted (drafts, voice and in-flight
 * requests survive the switch) over the shared 流光以太 background.
 */
const ControlShell = (props: ShellProps) => {
  const snap = useSyncExternalStore(props.host.subscribe, props.host.getSnapshot);
  const readonly = snap.ownerMode !== "owner";
  const theme = useResolvedTheme();
  const preferences = useDisplayPreferences();
  const reduced = useReducedMotion() || preferences.reducedMotion;

  const openDisplay = () => {
    const id = snap.activeCanvasId ?? "";
    window.open(`/display?canvasId=${encodeURIComponent(id)}`, "_blank");
  };
  const readonlyNotice = readonly && (
    <div className="vivic-readonly-notice" data-vivic-readonly-notice>
      <span>另一个控制窗口正在写入，本窗口为只读。</span>
      <button
        type="button"
        className="rounded-md border border-amber-400 bg-white px-3 py-1 text-xs font-medium hover:bg-amber-100"
        onClick={() => props.host.takeover()}
        data-vivic-takeover
      >
        接管控制权
      </button>
    </div>
  );

  return (
    <div
      className="vivic-control-root"
      data-vivic-control="ready"
      data-vivic-owner={snap.ownerMode}
      data-vivic-active-canvas={snap.activeCanvasId ?? ""}
      data-vivic-view={props.view}
      data-appearance={theme}
    >
      <AtmosphereBackground theme={theme} palette={paletteFor(theme, preferences)} paused={reduced} className="fixed inset-0" />

      <ChatPage
        hidden={props.view !== "chat"}
        turns={props.turns}
        feedback={props.feedback}
        notice={props.view === "chat" ? readonlyNotice : null}
        onOpenSettings={() => props.onNavigate("settings")}
        ownerKey={`${snap.activeCanvasId}:${snap.ownerMode}`}
        disabled={readonly || !snap.ready}
        clarify={props.clarify}
        suggestions={props.suggestions}
        backendOnline={props.backendOnline}
        onSubmit={props.onSubmit}
        onPickClarify={props.onPickClarify}
        onPreviewClarify={candidate => {
          const current = props.host.getSnapshot();
          if (current.ownerMode === "owner" && current.activeCanvasId === props.clarify?.canvasId) {
            props.host.dispatch({ schemaVersion: "0.6", requestId: newId("preview"), canvasId: current.activeCanvasId,
              actions: [{ type: "card.highlight", targetId: candidate.card.id, durationMs: 5000 }] });
          }
        }}
        onCancelClarify={props.onCancelClarify}
        busy={props.busy}
        onCancel={props.onCancel}
      />

      <div className="vivic-settings" hidden={props.view !== "settings"} data-vivic-settings>
        <div className="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-8">
          <header className="vivic-settings-header">
            <button type="button" className="vivic-settings-back" onClick={() => props.onNavigate("chat")} data-vivic-open-chat>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />返回聊天
            </button>
            <h1 className="text-lg font-semibold tracking-tight">设置</h1>
            <QuickFind host={props.host} />
          </header>

          {props.view === "settings" && readonlyNotice}

          <AiSection disabled={readonly || !snap.ready} onBackendChange={props.onBackendChange} />
          <LocalSpeechSettings disabled={readonly || !snap.ready} onBeforeClear={props.onCancel} />

          <section className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={openDisplay}
                disabled={!snap.activeCanvasId}
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
                data-vivic-open-display
              >
                打开 Vivic 展示窗口
              </button>
              <p className="text-xs text-neutral-500">
                把打开的窗口拖到第二屏，按 F11 或 ⌃⌘F 全屏；文字和语音输入在聊天页，本页负责设置。
              </p>
            </div>
          </section>

          <CanvasManager
            host={props.host}
            canvases={snap.canvases}
            activeCanvasId={snap.activeCanvasId}
            readonly={readonly}
          />
          <CanvasSettings host={props.host} disabled={readonly || !snap.ready} />
          <BackgroundSettings host={props.host} disabled={readonly || !snap.ready} resolvedTheme={theme} />
          <CardSubcardsSection key={`${snap.activeCanvasId}:${snap.ownerMode}:${snap.ownerId}:${snap.ready}`} host={props.host} />
          <LocalDecisionSettings disabled={readonly || !snap.ready} />

          <RemindersSection host={props.host} readonly={readonly} />

          <DataActions host={props.host} readonly={readonly || !snap.ready} onBeforeClear={props.onCancel} />
        </div>
      </div>
    </div>
  );
};
