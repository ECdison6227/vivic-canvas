import { buildCanvasContext, postIntent } from "@/ai/api";
import { fastLocalCommand, parseCommand, type CommandResult } from "@/commands/parse";
import { focusResponseActions } from "@/commands/responseFocus";
import { canvasStore } from "@/state/canvasStore";
import type { ControlHost } from "@/sync/controlHost";
import type { TextExecutionContext } from "@vivic/mobile-console-prototype/vivicHostAdapter";

/** No placeholders or shared conversation history: one guarded owner commit, followed by durable confirmation. */
export async function executeRemoteText(host: ControlHost, text: string, context: TextExecutionContext, desktopBusy: () => boolean) {
  const before = host.getSnapshot(), canvasId = before.activeCanvasId;
  const current = () => !desktopBusy() && !context.signal.aborted && context.isCurrent();
  const rejected = (message: string) => ({ ok: false, message });
  if (!canvasId || !current()) return rejected("电脑正在处理其他指令或控制会话已变化，请稍后重试。");
  const commandContext = { canvasId, state: canvasStore.getState() };
  let local: CommandResult | undefined = fastLocalCommand(text, commandContext) ?? undefined;
  let envelope: unknown;
  let message = "已执行并保存。";
  if (!local && /^(?:撤销|撤销删除|展开|收起|折叠)/.test(text)) local = parseCommand(text, commandContext);
  if (!local) {
    try {
      const result = await postIntent(text, buildCanvasContext(commandContext.state, canvasId), context.signal);
      if (!current()) return rejected("控制会话或画布已变化，未提交指令。");
      if (result.kind === "envelope" && result.envelope) {
        envelope = { ...result.envelope, actions: focusResponseActions(result.envelope.actions, canvasStore.getState()) };
        message = result.envelope.spokenText ?? message;
      } else {
        local = parseCommand(text, commandContext);
        if (local.kind === "unknown") return rejected(result.message ?? local.message);
      }
    } catch {
      if (!current()) return rejected("本次指令已取消或失效。");
      local = parseCommand(text, commandContext);
    }
  }
  if (local?.kind === "unknown") return rejected(local.message);
  if (local?.kind === "clarify") return rejected(`${local.prompt} 请在下一条指令中写明卡片名称。`);
  // The lease is checked immediately before the sole mutation, with no await in between.
  if (!current()) return rejected("控制会话或画布已变化，未提交指令。");
  if (local?.kind === "undo") {
    if (!host.undo()) return rejected("没有可撤销的删除。");
    message = "已撤销上一次删除。";
  } else {
    if (local?.kind === "envelope") {
      envelope = { schemaVersion: "0.6", requestId: `mobile-${context.requestId}`, canvasId,
        actions: focusResponseActions(local.actions, canvasStore.getState()) };
      message = local.spokenText ?? local.description;
    }
    const outcome = host.dispatch(envelope);
    if (!outcome.ok) return rejected(`未执行：${outcome.error}`);
  }
  const after = host.getSnapshot();
  const committedCanvas = after.activeCanvasId;
  if (!committedCanvas) throw new Error("commit_scope_unknown");
  await host.flush(committedCanvas, after.canvases.find(canvas => canvas.id === committedCanvas)?.version ?? 0);
  return { ok: true, message };
}
