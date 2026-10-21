// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalDecisionSettings } from "../LocalDecisionSettings";

let root: Root, container: HTMLDivElement;
const kevStatus = { phase: "absent", enabled: false, model: "Kev-0.8B", bytes: 0, gpuBytes: 0, lastMs: null, error: null };
const providerStatus = { ...kevStatus, mode: "provider", phase: "cached", model: "受控决策服务" };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const render = (disabled = false) => act(async () => root.render(<LocalDecisionSettings disabled={disabled} />));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("LocalDecisionSettings", () => {
  it("preserves Kev prepare behavior and disables mutating controls in read-only mode", async () => {
    const fetch = vi.fn(async () => response(kevStatus));
    vi.stubGlobal("fetch", fetch);
    await render();
    await act(async () => container.querySelector<HTMLButtonElement>("[data-vivic-decision-prepare]")!.click());
    expect(fetch).toHaveBeenCalledWith("/api/decision/prepare", { method: "POST" });
    await render(true);
    expect([...container.querySelectorAll("button")].every(button => button.disabled)).toBe(true);
  });

  it("uses provider enable/stop routes without exposing model downloads or claiming health", async () => {
    const fetch = vi.fn(async (url: string) => {
      return response(url === "/api/decision/enable" ? { ...providerStatus, phase: "ready", enabled: true } : providerStatus);
    });
    vi.stubGlobal("fetch", fetch);
    await render();
    expect(container.querySelector("h2")?.textContent).toBe("决策路由");
    expect(container.querySelector("[data-vivic-decision-prepare]")).toBeNull();
    expect(container.querySelector("[data-vivic-decision-clear]")).toBeNull();
    expect(container.textContent).not.toContain("Apple Silicon");
    expect(container.textContent).toContain("不确定或服务失败时交给原有流程");
    expect(container.textContent).toContain("暂停请求 30 秒");
    const enable = container.querySelector<HTMLButtonElement>("[data-vivic-decision-enable]")!;
    const stop = container.querySelector<HTMLButtonElement>("[data-vivic-decision-stop]")!;
    expect(enable.textContent).toBe("启用决策服务");
    expect(stop.textContent).toBe("停用决策服务");
    expect(enable.disabled).toBe(false);
    expect(stop.disabled).toBe(true);
    await act(async () => enable.click());
    expect(fetch).toHaveBeenCalledWith("/api/decision/enable", { method: "POST" });
    expect(container.querySelector("[data-vivic-decision-status]")?.textContent).toBe("受控决策服务 · 已启用（服务状态待请求确认）");
    expect(enable.disabled).toBe(true);
    expect(stop.disabled).toBe(false);
    await act(async () => stop.click());
    expect(fetch).toHaveBeenCalledWith("/api/decision/stop", { method: "POST" });
    expect(container.querySelector("[data-vivic-decision-status]")?.textContent).toBe("受控决策服务 · 未启用");
    expect(enable.disabled).toBe(false);
    expect(stop.disabled).toBe(true);
    expect(fetch.mock.calls.some(([url]) => url === "/api/decision/prepare" || url === "/api/decision/clear")).toBe(false);
  });

  it("keeps provider controls disabled for a read-only owner", async () => {
    const fetch = vi.fn(async (_url: string) => response({ ...providerStatus, phase: "ready", enabled: true }));
    vi.stubGlobal("fetch", fetch);
    await render(true);
    const buttons = [...container.querySelectorAll("button")];
    expect(buttons).toHaveLength(2);
    expect(buttons.every(button => button.disabled)).toBe(true);
    await act(async () => buttons.forEach(button => button.click()));
    expect(fetch.mock.calls.every(([url]) => url.endsWith("/status"))).toBe(true);
  });

  it("preserves cached Kev enable/stop controls when mode is omitted", async () => {
    const cachedKev = { ...kevStatus, phase: "cached" };
    const fetch = vi.fn(async (url: string) => {
      return response(url === "/api/decision/enable" ? { ...cachedKev, phase: "ready", enabled: true } : cachedKev);
    });
    vi.stubGlobal("fetch", fetch);
    await render();
    expect(container.querySelector("h2")?.textContent).toBe("决策路由");
    expect(container.querySelector("[data-vivic-decision-prepare]")).not.toBeNull();
    expect(container.querySelector("[data-vivic-decision-clear]")).not.toBeNull();
    expect(container.querySelector("[data-vivic-decision-status]")?.textContent).toBe("Kev-0.8B · 已准备，未启用");
    const enable = container.querySelector<HTMLButtonElement>("[data-vivic-decision-enable]")!;
    const stop = container.querySelector<HTMLButtonElement>("[data-vivic-decision-stop]")!;
    expect(enable.textContent).toBe("启用本地决策");
    expect(stop.textContent).toBe("停止并释放内存");
    await act(async () => enable.click());
    expect(fetch).toHaveBeenCalledWith("/api/decision/enable", { method: "POST" });
    expect(container.querySelector("[data-vivic-decision-status]")?.textContent).toBe("Kev-0.8B · 已启用");
    await act(async () => stop.click());
    expect(fetch).toHaveBeenCalledWith("/api/decision/stop", { method: "POST" });
    expect(container.querySelector("[data-vivic-decision-status]")?.textContent).toBe("Kev-0.8B · 已准备，未启用");
  });
});
