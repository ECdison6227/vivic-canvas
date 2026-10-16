import { useState, useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import { ATMOSPHERE_PALETTES, DARK_PALETTE_IDS, LIGHT_PALETTE_IDS, paletteFor, type PaletteId } from "@/components/atmosphere/palettes";
import type { ControlHost } from "@/sync/controlHost";
import type { DisplayPreferences } from "@/sync/protocol";

/**
 * Control-only background palette picker. The motion is always 流光以太;
 * choosing a palette also selects its appearance so the change is visible at
 * once on Display, the user page and here. "自动" keeps both choices.
 */
export const BackgroundSettings = ({ host, disabled = false, resolvedTheme }: { host: ControlHost; disabled?: boolean; resolvedTheme: "light" | "dark" }) => {
  const snapshot = useSyncExternalStore(host.subscribe, host.getSnapshot);
  const [error, setError] = useState<string | null>(null);
  const readonly = disabled || !snapshot.ready || snapshot.ownerMode !== "owner";
  const preferences = snapshot.preferences;
  const shown = paletteFor(resolvedTheme, preferences);
  const choose = (family: "dark" | "light", id: PaletteId) => {
    const patch: Partial<DisplayPreferences> = family === "dark"
      ? { theme: preferences.theme === "auto" && resolvedTheme === "dark" ? "auto" : "dark", darkPalette: id as DisplayPreferences["darkPalette"] }
      : { theme: preferences.theme === "auto" && resolvedTheme === "light" ? "auto" : "light", lightPalette: id as DisplayPreferences["lightPalette"] };
    const result = host.setPreferences(patch);
    setError(result.ok ? null : "配色尚未保存，请重试。");
  };
  const group = (family: "dark" | "light", label: string, ids: readonly PaletteId[]) => {
    const chosen = paletteFor(family, preferences);
    return <div role="group" aria-label={`${label}配色`}>
      <p className="text-xs font-medium text-neutral-600">{label}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ids.map(id => {
          const palette = ATMOSPHERE_PALETTES[id];
          const selected = chosen === id;
          return <button key={id} type="button" disabled={readonly} aria-pressed={selected}
            onClick={() => choose(family, id)} data-vivic-palette={id} data-vivic-palette-shown={shown === id ? "true" : undefined}
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors disabled:opacity-50 ${selected ? "border-neutral-900 bg-neutral-50 text-neutral-900" : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400"}`}>
            <span aria-hidden="true" className="h-7 w-7 shrink-0 rounded-full border-2 border-white shadow-[0_0_0_1px_#e5e7f0]"
              style={{ background: `conic-gradient(${palette.swatch[0]} 0 30%, ${palette.swatch[1]} 30% 65%, ${palette.swatch[2]} 65% 100%)` }} />
            <span className="min-w-0 flex-1">{palette.name}</span>
            {selected && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
          </button>;
        })}
      </div>
    </div>;
  };
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4" data-vivic-background-settings>
      <h2 className="text-sm font-semibold">背景配色</h2>
      <p className="mt-1 text-xs text-neutral-500">
        展示窗口、聊天页和设置页共用同一背景，动态效果固定为「流光以太」。选择配色会切换到对应的深色或浅色；主题设为「自动」时，白天用所选浅色、夜间用所选深色。
      </p>
      <fieldset disabled={readonly} className="mt-3 space-y-4">
        {group("dark", "深色", DARK_PALETTE_IDS)}
        {group("light", "浅色", LIGHT_PALETTE_IDS)}
      </fieldset>
      <p className="mt-3 text-xs text-neutral-500" data-vivic-palette-current>当前显示：{ATMOSPHERE_PALETTES[shown].name}（{resolvedTheme === "dark" ? "深色" : "浅色"}）</p>
      {error && <p role="status" className="mt-2 text-xs text-red-700">{error}</p>}
    </section>
  );
};
