// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileConsole } from "./MobileConsole";
import type { MobileClient, MobileState } from "@vivic/mobile-console-prototype/client";

vi.mock("@/components/atmosphere/AtmosphereBackground", () => ({ AtmosphereBackground: () => <div data-atmosphere /> }));

const snapshot: NonNullable<MobileState["snapshot"]> = {
  computerName: "我的电脑", ownerAvailable: true, ownerEpoch: "owner-epoch", activeCanvasId: "canvas-1", version: 4,
  canvases: [{ id: "canvas-1", title: "今日计划", version: 4 }, { id: "canvas-2", title: "第二张画布", version: 2 }],
  cards: [{ id: "note-1", type: "NoteCard", title: "待整理的想法", pinned: false }],
};
let root: Root;
let container: HTMLDivElement;
let state: MobileState;
let client: MobileClient;
const button = (label: string) => Array.from(container.querySelectorAll("button")).find(item => item.textContent === label)!;
const render = async () => { await act(async () => root.render(<MobileConsole client={client} initialRelayUrl="ws://127.0.0.1:8791/relay" />)); };
const input = async (selector: string, value: string) => {
  await act(async () => {
    const field = container.querySelector<HTMLInputElement>(selector)!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  state = { status: "connected", snapshot, requests: [], error: null, expiresAt: Date.now() + 60000 };
  client = {
    getSnapshot: () => state, subscribe: () => () => {}, pair: vi.fn(), reconnect: vi.fn(), disconnect: vi.fn(), revoke: vi.fn(),
    submit: vi.fn(() => "request-new"), cancel: vi.fn(), query: vi.fn(), refresh: vi.fn(),
  };
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("mobile execution feedback", () => {
  it("does not present relay acceptance as computer execution", async () => {
    state.requests = [{ requestId: "request-1", canvasId: "canvas-1", operation: { kind: "text.submit", text: "记下我的想法" }, status: "accepted", message: "中继已送达，等待电脑执行确认。" }];
    await render();
    expect(container.textContent).toContain("中继已接收，等待电脑确认");
    expect(container.textContent).not.toContain("电脑已执行");
    expect(button("请求取消")).toBeDefined();
  });

  it("queries an uncertain write and blocks a new write instead of replaying", async () => {
    state.requests = [{ requestId: "request-1", canvasId: "canvas-1", operation: { kind: "text.submit", text: "创建便笺" }, status: "unknown", message: "执行结果未确认" }];
    await render();
    await input('[aria-label="发送给电脑的文字指令"]', "再创建一张");
    expect(container.querySelector<HTMLButtonElement>('[aria-label="发送指令"]')!.disabled).toBe(true);
    expect(button("固定").disabled).toBe(true);
    expect(container.querySelector<HTMLSelectElement>("#mobile-canvas")!.disabled).toBe(true);
    expect(button("重新发送")).toBeUndefined();
    await act(async () => button("查询执行结果").click());
    expect(client.query).toHaveBeenCalledWith("request-1");
    expect(client.submit).not.toHaveBeenCalled();
  });

  it("disables all write controls when the existing computer owner is unavailable", async () => {
    state.snapshot = { ...snapshot, ownerAvailable: false };
    await render();
    expect(container.textContent).toContain("电脑控制页不可用");
    expect(container.querySelector<HTMLInputElement>('[aria-label="发送给电脑的文字指令"]')!.disabled).toBe(true);
    expect(button("固定").disabled).toBe(true);
    expect(container.querySelector<HTMLSelectElement>("#mobile-canvas")!.disabled).toBe(true);
    expect(client.submit).not.toHaveBeenCalled();
  });

  it("submits only whitelisted text and provides touch card pinning", async () => {
    await render();
    await input('[aria-label="发送给电脑的文字指令"]', "  记下明天的会议  ");
    await act(async () => container.querySelector("form.mobile-composer")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(client.submit).toHaveBeenCalledWith({ kind: "text.submit", text: "记下明天的会议" });
    await act(async () => button("固定").click());
    expect(client.submit).toHaveBeenCalledWith({ kind: "card.pin", cardId: "note-1", pinned: true });
  });

  it("clears pairing input immediately and never stores the code", async () => {
    state = { ...state, status: "unpaired", snapshot: null };
    const storage = vi.spyOn(Storage.prototype, "setItem");
    await render();
    await input("#mobile-pair-code", "ABCD1234");
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(client.pair).toHaveBeenCalledWith("ws://127.0.0.1:8791/relay", "ABCD1234");
    expect(container.querySelector<HTMLInputElement>("#mobile-pair-code")!.value).toBe("");
    expect(storage).not.toHaveBeenCalled();
  });
});
