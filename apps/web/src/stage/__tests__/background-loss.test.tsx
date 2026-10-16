// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { BackgroundLayer } from "../BackgroundLayer";

const atmosphere = vi.hoisted(() => ({ instances: [] as Array<{ canvas: HTMLCanvasElement; options: Record<string, unknown>; paused: boolean; destroyed: boolean }> }));
vi.mock("@/components/atmosphere/pastelAtmosphere", () => ({
  PastelAtmosphere: class {
    canvas: HTMLCanvasElement; options: Record<string, unknown>; paused = false; destroyed = false; gl = null;
    constructor(canvas: HTMLCanvasElement, options: Record<string, unknown>) { this.canvas = canvas; this.options = options; atmosphere.instances.push(this); }
    setOptions(updates: Record<string, unknown>) { this.options = { ...this.options, ...updates }; }
    setPaused(paused: boolean) { this.paused = paused; }
    destroy() { this.destroyed = true; }
  },
}));
const preferences = vi.hoisted(() => ({ current: { reducedMotion: true } as Record<string, unknown> }));
vi.mock("@/state/canvasStore", () => ({ useDisplayPreferences: () => preferences.current }));
vi.mock("motion/react", () => ({ useReducedMotion: () => false }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ""; atmosphere.instances.length = 0; });

it("handles driver loss during another render without React updates or allocating a probe context", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const Label = () => { host.querySelector("canvas")?.dispatchEvent(new Event("webglcontextlost", { cancelable: true })); return <span>TEST</span>; };
  const Scene = ({ trigger }: { trigger: boolean }) => <><BackgroundLayer theme="dark" />{trigger && <Label />}</>;
  await act(async () => root.render(<Scene trigger={false} />));
  await act(async () => root.render(<Scene trigger={true} />));
  expect(getContext).not.toHaveBeenCalled();
  expect(host.querySelector("canvas")?.style.visibility).toBe("hidden");
  expect(host.querySelector('[data-vivic-gl-lost="true"]')).not.toBeNull();
  expect(atmosphere.instances.at(-1)?.destroyed).toBe(true);
  expect(errors.mock.calls.flat().join(" ")).not.toContain("Cannot update");
  await act(async () => root.unmount());
});

it("always runs 流光以太 with the chosen palette, defaulting to 午夜蓝紫, and pauses for reduced motion", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  preferences.current = { reducedMotion: true };
  await act(async () => root.render(<BackgroundLayer theme="dark" />));
  const effect = atmosphere.instances.at(-1)!;
  expect(effect.options).toMatchObject({ mode: 1, dark: 1, colors: ["#0C1224", "#20466B", "#5A52A2", "#AF6E9E"] });
  expect(effect.paused).toBe(true);
  expect(host.querySelector('[data-vivic-layer="background"]')?.getAttribute("data-vivic-atmosphere")).toBe("midnight");
  preferences.current = { reducedMotion: false, lightPalette: "mint" };
  await act(async () => root.render(<BackgroundLayer theme="light" />));
  expect(atmosphere.instances.at(-1)).toBe(effect);
  expect(effect.options).toMatchObject({ mode: 1, dark: 0, colors: ["#F8FFFC", "#C5EAD9", "#CBE9F7", "#E9D6F5"] });
  expect(effect.paused).toBe(false);
  await act(async () => root.unmount());
  expect(effect.destroyed).toBe(true);
  expect(host.querySelector("canvas")).toBeNull();
});
