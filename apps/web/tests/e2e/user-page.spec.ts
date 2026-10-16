import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { activeCanvasId, sendCommand, showChat, showSettings } from "./helpers1";

// TEST context only: local rules, no model, no microphone, no audio.
const evidence = path.resolve(process.cwd(), "../../evidence/user-page-20261017");
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    HTMLMediaElement.prototype.play = async () => { throw new Error("TEST audio disabled"); };
    navigator.mediaDevices.getUserMedia = async () => { throw new Error("TEST microphone disabled"); };
  });
});
const root = (page: Page) => page.locator("[data-vivic-control]");
const atmosphere = (page: Page) => page.locator("[data-vivic-atmosphere]");

test("user page is only settings, avatar, conversation and one text/voice input; settings keeps the rest", async ({ page }, info) => {
  await page.goto("/");
  await expect(root(page)).toHaveAttribute("data-vivic-owner", "owner");
  await expect(root(page)).toHaveAttribute("data-vivic-view", "chat");
  const settings = page.getByRole("button", { name: "设置", exact: true });
  const avatar = page.getByRole("img", { name: "我的头像" });
  const viewport = page.viewportSize()!;
  const s = (await settings.boundingBox())!, a = (await avatar.boundingBox())!;
  expect(s.x).toBeLessThan(80); expect(s.y).toBeLessThan(80);
  expect(a.x + a.width).toBeGreaterThan(viewport.width - 80); expect(a.y).toBeLessThan(80);
  const input = page.locator("[data-vivic-command-input]");
  await expect(input).toBeVisible();
  await expect(input).toHaveAttribute("placeholder", "给 Vivic 发消息");
  const bar = (await page.locator(".vivic-composer-bar").boundingBox())!;
  expect(bar.y + bar.height).toBeGreaterThan(viewport.height - 120);
  for (const control of [page.getByRole("button", { name: "添加图片" }), page.locator("[data-vivic-ptt]"), page.locator("[data-vivic-command-send]")]) {
    const box = (await control.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(bar.y); expect(box.y + box.height).toBeLessThanOrEqual(bar.y + bar.height);
  }
  // Settings-only controls are not part of the user page.
  await expect(page.locator("[data-vivic-ai-connect]")).toBeHidden();
  await expect(page.locator("[data-vivic-canvas-list]")).toBeHidden();
  await page.screenshot({ path: path.join(evidence, info.project.name || "edge", "TEST-user-page.png") });

  await settings.click();
  await expect(page).toHaveURL(/\/control$/);
  await expect(page.getByRole("heading", { name: "设置", exact: true })).toBeVisible();
  await expect(page.locator("[data-vivic-ai-connect]")).toBeVisible();
  await expect(input).toBeHidden();
  await expect(page.locator("[data-vivic-ptt]")).toBeHidden();
  await page.goBack();
  await expect(root(page)).toHaveAttribute("data-vivic-view", "chat");
  await expect(input).toBeVisible();
  await page.goForward();
  await expect(root(page)).toHaveAttribute("data-vivic-view", "settings");
  await page.locator("[data-vivic-open-chat]").click();
  await expect(page).toHaveURL(/\/$/);
});

test("each sent message keeps its own reply, and drafts survive a trip to settings", async ({ page, context }) => {
  await page.goto("/");
  await expect(root(page)).toHaveAttribute("data-vivic-owner", "owner");
  const feedback = page.locator("[data-vivic-command-feedback]");
  await expect(feedback).toContainText("你好，我是 Vivic");
  const display = await context.newPage(); await display.goto(`/display?canvasId=${await activeCanvasId(page)}`);
  await sendCommand(page, "十分钟倒计时");
  await expect(feedback).toHaveText("10分倒计时已就位");
  await expect(display.locator(".vivic-card")).toHaveCount(1);
  await page.locator("[data-vivic-command-input]").fill("TEST 尚未发送的草稿");
  await showSettings(page);
  await expect(page.locator("[data-vivic-reminder]")).toHaveCount(1);
  await showChat(page);
  await expect(page.locator("[data-vivic-command-input]")).toHaveValue("TEST 尚未发送的草稿");
  await sendCommand(page, "加待办：买菜");
  await expect(feedback).toHaveText("已记下 1 条待办");
  const log = page.locator("[data-vivic-chat-log]");
  await expect(log.locator("[data-vivic-chat-user]")).toHaveText(["十分钟倒计时", "加待办：买菜"]);
  await expect(log.locator(".vivic-bubble-assistant").first()).toHaveText("10分倒计时已就位");
  await expect(display.locator(".vivic-card")).toHaveCount(2);
  await display.close();
});

test("tapping a numbered choice answers the question as the user, keeping the question in the log", async ({ page }) => {
  await page.goto("/");
  await expect(root(page)).toHaveAttribute("data-vivic-owner", "owner");
  const added = async (text: string) => { await sendCommand(page, text); await expect(page.locator("[data-vivic-command-feedback]")).toHaveText("已记下 1 条待办"); };
  await added("加待办：合同初审");
  await added("添加待办：周报大纲");
  await sendCommand(page, "删除那个卡片");
  const candidates = page.locator("[data-vivic-clarify-candidate]");
  await expect(candidates).toHaveCount(2);
  const question = (await page.locator("[data-vivic-command-feedback]").textContent())!;
  expect(question).toContain("请回复几号");
  const label = (await candidates.first().textContent())!;
  await candidates.first().click();
  await expect(page.locator("[data-vivic-command-feedback]")).toContainText("可撤销");
  const log = page.locator("[data-vivic-chat-log]");
  await expect(log.locator("[data-vivic-chat-user]").last()).toHaveText(label);
  await expect(log.locator(".vivic-bubble-assistant").filter({ hasText: question })).toHaveCount(1);
  await expect(page.locator("[data-vivic-clarify]")).toHaveCount(0);
  await added("加待办：第三项");
  await sendCommand(page, "删除那个卡片");
  await expect(candidates).toHaveCount(2);
  await page.locator("[data-vivic-clarify]").getByRole("button", { name: "取消", exact: true }).click();
  await expect(log.locator("[data-vivic-chat-user]").last()).toHaveText("取消");
  await expect(page.locator("[data-vivic-command-feedback]")).toHaveText("已取消选择");
});

test("a palette choice changes the shared 流光以太 background on Display, user page and settings at once", async ({ page, context }, info) => {
  await page.goto("/control");
  await expect(root(page)).toHaveAttribute("data-vivic-owner", "owner");
  const display = await context.newPage(); await display.goto(`/display?canvasId=${await activeCanvasId(page)}`);
  const displayBackground = display.locator('[data-vivic-layer="background"]');
  // Default: dark 午夜蓝紫 everywhere, one WebGL surface per page.
  await expect(atmosphere(page)).toHaveAttribute("data-vivic-atmosphere", "midnight");
  await expect(displayBackground).toHaveAttribute("data-vivic-atmosphere", "midnight");
  await expect(root(page)).toHaveAttribute("data-appearance", "dark");
  await expect(atmosphere(page).locator("canvas")).toHaveCount(1);
  await expect(displayBackground.locator("canvas")).toHaveCount(1);
  const settings = page.locator("[data-vivic-background-settings]");
  await expect(settings.locator("[data-vivic-palette]")).toHaveCount(12);
  await expect(settings).toContainText("流光以太");
  await expect(page.getByText(/云雾光晕|丝绸柔光|漫游烟雾|晨曦极光|柔粒渐变/)).toHaveCount(0);

  await settings.locator('[data-vivic-palette="peach"]').click();
  await expect(atmosphere(page)).toHaveAttribute("data-vivic-atmosphere", "peach");
  await expect(root(page)).toHaveAttribute("data-appearance", "light");
  await expect(displayBackground).toHaveAttribute("data-vivic-atmosphere", "peach");
  await expect(display.locator("[data-vivic-stage]")).toHaveAttribute("data-vivic-theme", "light");
  await expect(settings).toContainText("当前显示：奶油蜜桃（浅色）");
  await settings.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(evidence, info.project.name || "edge", "TEST-settings-peach.png") });

  await settings.locator('[data-vivic-palette="ocean"]').click();
  await expect(displayBackground).toHaveAttribute("data-vivic-atmosphere", "ocean");
  await showChat(page);
  await expect(atmosphere(page)).toHaveAttribute("data-vivic-atmosphere", "ocean");
  await expect(root(page)).toHaveAttribute("data-appearance", "dark");
  await display.reload();
  await expect(display.locator('[data-vivic-layer="background"]')).toHaveAttribute("data-vivic-atmosphere", "ocean");
  await page.reload();
  await expect(atmosphere(page)).toHaveAttribute("data-vivic-atmosphere", "ocean");
  await display.close();
});
