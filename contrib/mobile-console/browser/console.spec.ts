import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "../../../apps/web/node_modules/@playwright/test/index.mjs";
import { WebSocket } from "ws";
import { createRelayServer } from "../relay";
import { createComputerConnector, type ComputerHostAdapter } from "../connector";
import { createWebSocketTransport } from "../transport";
import type { CanvasSnapshot } from "../protocol";

const evidence = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../evidence/mobile-console");
fs.mkdirSync(evidence, { recursive: true });
const entry = "/src/control/mobile/index.html";
const origin = "http://127.0.0.1:5174";

/** Explicit DEMO computer adapter: actual WS relay/connector, simulated actions, no production owner. */
async function setupComputer() {
  const admissionSecret = randomBytes(32).toString("base64url");
  const relay = createRelayServer({ admissionSecret, allowedOrigins: [origin] });
  const address = await relay.listen(0);
  const url = `ws://127.0.0.1:${address.port}/relay`;
  const listeners = new Set<() => void>();
  const state: CanvasSnapshot = {
    computerName: "DEMO · 测试电脑", ownerAvailable: true, ownerEpoch: "demo_owner",
    activeCanvasId: "demo_canvas", version: 0,
    canvases: [{ id: "demo_canvas", title: "DEMO · 今日想法", version: 0 }, { id: "demo_other", title: "DEMO · 第二画布", version: 0 }],
    cards: [{ id: "demo_card", title: "DEMO · 一条很长但可完整换行的便笺卡片名称", type: "NoteCard", pinned: false }],
  };
  const calls: string[] = [];
  let textGate: Promise<void> | undefined;
  const publish = () => listeners.forEach(listener => listener());
  const bump = () => { state.version++; state.canvases.find(canvas => canvas.id === state.activeCanvasId)!.version = state.version; publish(); };
  const host: ComputerHostAdapter = {
    getSnapshot: () => structuredClone(state),
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    submitText: async (text, context) => {
      if (textGate) await textGate;
      if (context.signal.aborted || !context.isCurrent()) return { ok: false, message: "DEMO · 提交前取消，未执行" };
      calls.push(text); bump(); return { ok: true, message: "DEMO · 模拟电脑已处理文字；未调用生产模型" };
    },
    switchCanvas: id => { state.activeCanvasId = id; state.version = state.canvases.find(canvas => canvas.id === id)!.version; state.cards = []; publish(); return { ok: true, message: "DEMO · 模拟电脑已切换画布" }; },
    setCardPinned: (id, pinned) => { state.cards.find(card => card.id === id)!.pinned = pinned; calls.push(`pin:${pinned}`); bump(); return { ok: true, message: "DEMO · 模拟电脑已更新固定状态" }; },
  };
  const transport = createWebSocketTransport(url, value => new WebSocket(value, { origin }));
  const connector = createComputerConnector({ transport, deviceId: "demo_computer", deviceName: state.computerName, accessKey: admissionSecret, host });
  connector.start();
  await expect.poll(() => connector.getSnapshot().status).toBe("connected");
  return {
    url, connector, calls, state,
    code: () => connector.getSnapshot().pairCode!,
    setOwner(available: boolean) { state.ownerAvailable = available; publish(); },
    holdText() { let release!: () => void; textGate = new Promise(resolve => { release = resolve; }); return release; },
    async close() { connector.stop(); await relay.close(); },
  };
}

async function pair(page: Page, computer: Awaited<ReturnType<typeof setupComputer>>) {
  await page.goto(entry);
  await page.locator("#mobile-relay-url").fill(computer.url);
  await page.locator("#mobile-pair-code").fill(computer.code());
  await page.getByRole("button", { name: "连接我的电脑" }).click();
  await expect(page.getByRole("heading", { name: "DEMO · 测试电脑" })).toBeVisible();
  await expect(page.getByLabel("发送给电脑的文字指令")).toBeEnabled();
}

test("independent layout: narrow/light/landscape/error, no browser canvas or secrets", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(entry);
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole("button", { name: "连接我的电脑" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: path.join(evidence, `pair-dark-${width}.png`) });
  }
  await page.getByRole("button", { name: "打开设置" }).click();
  await page.locator("#mobile-theme").selectOption("light");
  await page.screenshot({ path: path.join(evidence, "settings-light-430.png") });
  await page.getByRole("button", { name: "返回控制台", exact: true }).first().click();
  await page.setViewportSize({ width: 844, height: 390 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(evidence, "pair-light-landscape.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#mobile-relay-url").fill("ws://192.168.1.1:8791/relay");
  await page.locator("#mobile-pair-code").fill("INVALIDCODE");
  await page.getByRole("button", { name: "连接我的电脑" }).click();
  await expect(page.getByRole("alert")).toContainText("WSS");
  await page.screenshot({ path: path.join(evidence, "pair-error-light.png") });
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
  expect(await page.evaluate(async () => (await indexedDB.databases()).map(database => database.name))).not.toContain("vivic");
  expect(errors).toEqual([]);
});

test("actual relay with DEMO host: pair, text, pin, canvas, owner offline and revoke", async ({ page }) => {
  const computer = await setupComputer();
  try {
    await pair(page, computer);
    await page.getByLabel("发送给电脑的文字指令").fill("DEMO · 请整理一下今天的想法");
    await page.getByRole("button", { name: "发送指令", exact: true }).click();
    await expect(page.getByText("DEMO · 模拟电脑已处理文字；未调用生产模型")).toBeVisible();
    expect(computer.calls).toEqual(["DEMO · 请整理一下今天的想法"]);
    await page.getByRole("button", { name: /^固定 DEMO/ }).click();
    await expect(page.getByRole("button", { name: /^取消固定 DEMO/ })).toBeEnabled();
    expect(computer.state.cards[0]!.pinned).toBe(true);
    await page.screenshot({ path: path.join(evidence, "connected-demo-390.png") });
    // Simulated reduced visual viewport tests layout math; this is not a physical IME claim.
    await page.setViewportSize({ width: 390, height: 420 });
    const send = await page.getByRole("button", { name: "发送指令", exact: true }).boundingBox();
    expect(send!.y + send!.height).toBeLessThanOrEqual(420);
    await page.screenshot({ path: path.join(evidence, "connected-demo-keyboard-height.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#mobile-canvas").selectOption("demo_other");
    await expect.poll(() => computer.state.activeCanvasId).toBe("demo_other");
    await expect(page.getByText("当前画布没有可操作的卡片。")).toBeVisible();
    computer.setOwner(false);
    await expect(page.getByLabel("发送给电脑的文字指令")).toBeDisabled();
    await expect(page.getByLabel("连接状态")).toContainText("电脑控制页不可用");
    await page.screenshot({ path: path.join(evidence, "owner-offline-demo.png") });
    computer.setOwner(true);
    await expect(page.getByLabel("发送给电脑的文字指令")).toBeEnabled();
    await page.getByRole("button", { name: "打开设置" }).click();
    await page.getByRole("button", { name: "撤销手机授权", exact: true }).click();
    await page.getByRole("button", { name: "确认撤销", exact: true }).click();
    await expect(page.getByRole("button", { name: "连接我的电脑" })).toBeVisible();
    await expect.poll(() => computer.connector.getSnapshot().controllers.length).toBe(0);
  } finally { await computer.close(); }
});

test("in-flight cancel has no commit; refresh discards credentials and needs fresh pairing", async ({ page }) => {
  const computer = await setupComputer();
  try {
    await pair(page, computer);
    const release = computer.holdText();
    await page.getByLabel("发送给电脑的文字指令").fill("DEMO · 取消这条测试");
    await page.getByRole("button", { name: "发送指令", exact: true }).click();
    await expect(page.getByText("电脑正在执行", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "请求取消" }).click();
    await expect(page.getByText("执行结果未知", { exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(evidence, "unknown-demo.png") });
    release();
    await expect(page.getByText("DEMO · 提交前取消，未执行")).toBeVisible();
    expect(computer.calls).toEqual([]);
    await page.reload();
    await expect(page.getByRole("button", { name: "连接我的电脑" })).toBeVisible();
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
    computer.connector.rotatePairing();
    await expect.poll(() => computer.code()).toBeTruthy();
    await pair(page, computer);
  } finally { await computer.close(); }
});

test("runnable computer DEMO page pairs with isolated phone browser and reflects actions", async ({ page, browser }) => {
  const admissionSecret = randomBytes(32).toString("base64url");
  const relay = createRelayServer({ admissionSecret, allowedOrigins: [origin] });
  const address = await relay.listen(0);
  const url = `ws://127.0.0.1:${address.port}/relay`;
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const phone = await phoneContext.newPage();
  try {
    await page.goto("/src/control/mobile/computer.html");
    await page.locator("#computer-relay-url").fill(url);
    await page.locator("#computer-admission-key").fill(admissionSecret);
    await page.getByRole("button", { name: "启动 DEMO 电脑连接" }).click();
    const code = page.locator("[data-computer-pair-code]");
    await expect(code).toHaveText(/^[A-Z0-9]{16}$/);
    const pairCode = await code.textContent();
    await phone.goto(entry);
    await phone.locator("#mobile-relay-url").fill(url);
    await phone.locator("#mobile-pair-code").fill(pairCode!);
    await phone.getByRole("button", { name: "连接我的电脑" }).click();
    await expect(phone.getByRole("heading", { name: "DEMO · 电脑连接原型" })).toBeVisible();
    await phone.getByLabel("发送给电脑的文字指令").fill("来自独立手机浏览器的测试便笺");
    await phone.getByRole("button", { name: "发送指令", exact: true }).click();
    await expect(page.getByText("DEMO · 来自独立手机浏览器的测试便笺", { exact: true })).toBeVisible();
    await expect(code).toHaveText("已使用或已过期");
    // No credential or pairing code is captured: input cleared, one-time code consumed.
    await expect(page.locator("#computer-admission-key")).toHaveCount(0);
    await page.screenshot({ path: path.join(evidence, "computer-demo-after-pairing.png") });
    await phone.getByRole("button", { name: "固定 DEMO · 来自独立手机浏览器的测试便笺", exact: true }).click();
    await expect(phone.getByRole("button", { name: "取消固定 DEMO · 来自独立手机浏览器的测试便笺", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "停止并结束本次连接" }).click();
    await expect(phone.getByRole("button", { name: "连接我的电脑" })).toBeVisible();
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
  } finally { await phoneContext.close(); await relay.close(); }
});
