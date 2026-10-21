import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./ConfirmDialog";
interface Status { phase: string; enabled: boolean; model: string; bytes: number; gpuBytes: number; lastMs: number | null; error: string | null; mode?: "provider"; configurationError?: string }
export function LocalDecisionSettings({ disabled }: { disabled: boolean }) {
  const [status, setStatus] = useState<Status | null>(null), [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = async () => { try { const r = await fetch("/api/decision/status", { cache: "no-store" }); if (r.ok && active) setStatus(await r.json()); } catch { /* Main app remains usable offline. */ } };
    void refresh(); const timer = setInterval(() => void refresh(), 5000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  const action = async (name: "prepare" | "enable" | "stop" | "clear") => {
    setBusy(true);
    try { const response = await fetch(`/api/decision/${name}`, { method: "POST" }); if (response.ok) setStatus(await response.json()); }
    catch { setStatus(previous => previous ? { ...previous, error: previous.mode === "provider" ? "决策服务暂不可达，请重试。" : "本地决策服务暂不可达，请重试。" } : previous); }
    finally { setBusy(false); }
  };
  const pending = status && ["downloading", "installing", "loading"].includes(status.phase);
  const providerMode = status?.mode === "provider" || Boolean(status?.configurationError);
  const phaseLabel = status ? providerMode ? status.enabled ? "已启用（服务状态待请求确认）" : "未启用"
    : ({ absent: "尚未准备", downloading: "正在准备模型文件", installing: "正在准备运行环境", cached: "已准备，未启用", loading: "正在加载并预热", ready: "已启用", error: "暂不可用" } as Record<string, string>)[status.phase] ?? status.phase : "";
  return <section className="rounded-xl border border-neutral-200 bg-white p-4" data-vivic-local-decision>
    <h2 className="text-sm font-semibold">决策路由</h2>
    <p className="mt-2 text-xs text-neutral-500">{providerMode ? "优先使用已配置的决策服务，协助视图、聚焦及便笺展开/收起；不确定或服务失败时交给原有流程。失败后暂停请求 30 秒，避免每条指令重复等待；手动重新启用可立即重试。启用不代表服务健康或准确率已通过验证。" : "确定指令直接执行；未配置决策服务时，复杂指令仍可交给已连接的模型。可在本机后端配置 API/本地决策服务，或在 Apple Silicon Mac 上准备 Kev。Kev 仅协助视图、聚焦及便笺展开/收起，不执行删除、不生成文字。首次准备约 1.83GB 模型，启用后约占用 1.5GB 共享显存。"}</p>
    <p className="mt-2 text-xs text-neutral-600" role="status" data-vivic-decision-status>{status
      ? `${status.model} · ${phaseLabel}${status.lastMs !== null ? ` · 最近 ${Math.round(status.lastMs)}ms` : ""}`
      : "本地决策服务未连接，现有文字指令仍可使用。"}</p>
    <div className="mt-3 flex flex-wrap gap-2">
      {!providerMode && <Button variant="secondary" size="sm" disabled={disabled || busy || !status || Boolean(pending) || status.enabled} onClick={() => void action("prepare")} data-vivic-decision-prepare>准备模型</Button>}
      <Button variant="secondary" size="sm" disabled={disabled || busy || !status || Boolean(pending) || Boolean(status.configurationError) || status.enabled || !providerMode && status.phase === "absent"} onClick={() => void action("enable")} data-vivic-decision-enable>{providerMode ? "启用决策服务" : "启用本地决策"}</Button>
      <Button variant="outline" size="sm" disabled={disabled || busy || !status || !status.enabled && !pending} onClick={() => void action("stop")} data-vivic-decision-stop>{providerMode ? "停用决策服务" : "停止并释放内存"}</Button>
      {!providerMode && <ConfirmDialog title="清理本地决策模型缓存？" description="停止本地决策并删除其模型文件，之后需要重新准备；画布和账号连接保留。"
        disabled={disabled || busy || Boolean(pending)} onConfirm={() => void action("clear")} confirmLabel="清理模型"
        trigger={<Button variant="outline" size="sm" disabled={disabled || busy || Boolean(pending)} data-vivic-decision-clear>清理模型缓存</Button>} />}
    </div>
    {status?.error && <p className="mt-2 text-xs text-amber-700">{status.error}</p>}
  </section>;
}
