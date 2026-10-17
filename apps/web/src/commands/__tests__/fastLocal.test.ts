import { createCanvasStore } from "@/state/canvasStore";
import { describe, expect, it } from "vitest";
import { fastLocalCommand, parseCommand } from "../parse";
import { emptyVivicState } from "@/persistence/canvasRecord";
import { testCards } from "@/cards/__tests__/fixtures";
const ctx = { state: { ...emptyVivicState(), stage: "WORKSPACE" as const, cards: [{ record: testCards.TodoCard }, { record: testCards.CountdownCard }] }, canvasId: "TEST" };

describe("exact local actions bypass the decision and LLM network", () => {
  it.each(["显示全部", "恢复原视图", "删除待办", "聚焦倒计时", "撤销"])("resolves %s with live card identities", text => {
    expect(fastLocalCommand(text, ctx)).not.toBeNull();
  });
  it("pauses by exact reminder name and never substitutes a different existing timer", () => {
    const timer = { ...testCards.CountdownCard, sourceData: { ...testCards.CountdownCard.sourceData, reminderText: "喝水" } };
    const context = { ...ctx, state: { ...ctx.state, cards: [{ record: timer }] } };
    expect(fastLocalCommand("暂停喝水提醒", context)?.kind).toBe("envelope");
    expect(fastLocalCommand("暂停开会提醒", context)?.kind).toBe("unknown");
    expect(fastLocalCommand("暂停倒计时", context)?.kind).toBe("envelope");
    expect(fastLocalCommand("暂停第二个提醒", context)?.kind).toBe("unknown");
  });
  it("keeps ambiguous targets as local clarification", () => {
    expect(fastLocalCommand("删除那个卡片", ctx)?.kind).toBe("clarify");
  });
  it.each(["删除待办然后显示全部", "聚焦待办并且删除倒计时", "删除待办；创建便笺", "删除待办但不要删除倒计时", "删除待办，创建便笺", "删除待办和倒计时"])("never runs a partial %s", text => {
    expect(fastLocalCommand(text, ctx)).toBeNull(); expect(parseCommand(text, ctx).kind).toBe("unknown");
  });
  it.each(["十分钟倒计时", "待办：测试", "上海天气", "帮我安排待办优先级"])("leaves extraction/data work %s to its owning adapter", text => {
    expect(fastLocalCommand(text, ctx)).toBeNull();
  });
  it.each(["打开展示页", "打开展示页面。", "请打开副屏", "帮我打开副屏界面", "打开 Vivic 展示窗口", "打开大屏", "打开第二块屏幕", "把展示页打开", "投屏"])("opens the Display window for %s without the network", text => {
    expect(fastLocalCommand(text, ctx)?.kind).toBe("openDisplay");
  });
  it.each(["展示全部卡片", "打开展示页然后显示全部", "不要打开展示页", "展示页是什么", "打开展示卡片"])("does not read %s as opening the Display", text => {
    expect(parseCommand(text, ctx).kind).not.toBe("openDisplay");
  });
});

it("deletes every card locally and restores the whole 60-card batch with one undo", () => {
  const state = { ...ctx.state, cards: Array.from({ length: 60 }, (_, i) => ({ record: { ...testCards.TodoCard, id: `TEST-${i}` } })) };
  const result = fastLocalCommand("删除所有卡片", { ...ctx, state });
  expect(result?.kind).toBe("envelope");
  if (result?.kind !== "envelope") throw new Error("missing local deletion");
  const store = createCanvasStore(); store.loadState(state);
  expect(store.dispatch({ schemaVersion: "0.6", canvasId: "TEST", requestId: "all", actions: result.actions }).ok).toBe(true);
  store.internal({ type: "card.delete.commit", requestId: "all" }); expect(store.getState().cards).toHaveLength(0);
  store.internal({ type: "undo" }); expect(store.getState().cards).toHaveLength(60);
  expect(fastLocalCommand("不要删除所有卡片", { ...ctx, state })).toBeNull();
});
