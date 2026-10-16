import { test, expect } from "@playwright/test";
import path from "node:path";
import { activeCanvasId, controlDispatch, sendCommand, showSettings, todoCardRecord } from "./helpers1";
test.use({ video: { mode: "on", size: { width: 1440, height: 900 } } });
test("dated, recurring and canvas-condition reminders persist without model requests, and only owner notifies silently", async ({ page, context }, info) => {
  await context.addInitScript(() => {
    Object.assign(window, { __testNotifications: [] });
    class SilentNotification {
      static permission = "granted";
      static async requestPermission() { return "granted"; }
      constructor(_title: string, options: NotificationOptions) { (window as unknown as { __testNotifications: NotificationOptions[] }).__testNotifications.push(options); }
      close() {}
    }
    Object.defineProperty(window, "Notification", { value: SilentNotification });
    HTMLMediaElement.prototype.play = async () => { throw new Error("TEST audio forbidden"); };
    navigator.mediaDevices.getUserMedia = async () => { throw new Error("TEST mic forbidden"); };
  });
  const providers: string[] = [];
  page.on("response", async response => { if (response.url().endsWith("/api/intent")) providers.push((await response.json()).usedProvider); });
  await page.goto("/control"); await expect(page.locator("[data-vivic-control]")).toHaveAttribute("data-vivic-owner", "owner");
  const id = await activeCanvasId(page);
  await controlDispatch(page, "TEST-conditions", id, [{ type: "stage.awaken" }, { type: "card.create", card: todoCardRecord("TEST-condition-todo", ["TEST 完成项"]) }]);
  await sendCommand(page, "每天09:00提醒我TEST每日");
  await expect(page.locator("[data-vivic-reminder-schedule]")).toContainText("09:00");
  await sendCommand(page, "明天上午9点提醒我TEST明天"); await expect(page.locator("[data-vivic-reminder]")).toHaveCount(2);
  await sendCommand(page, "当待办第1项完成后提醒我TEST完成条件");
  const condition = page.locator("[data-vivic-reminder]").filter({ hasText: "TEST完成条件" });
  await expect(condition).toContainText("等待条件");
  await showSettings(page); await page.locator("[data-vivic-notification-toggle]").click(); await expect(page.locator("[data-vivic-notification-toggle]")).toHaveText("关闭系统通知");
  const reader = await context.newPage(); await reader.goto("/control");
  await expect(reader.locator("[data-vivic-control]")).toHaveAttribute("data-vivic-owner", "readonly");
  await sendCommand(page, "把待办第一项标记为完成");
  await expect(page.locator("[data-vivic-reminder-notice]")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __testNotifications: NotificationOptions[] }).__testNotifications.length)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { __testNotifications: NotificationOptions[] }).__testNotifications)).toEqual([expect.objectContaining({ silent: true, body: "TEST完成条件" })]);
  expect(await reader.evaluate(() => (window as unknown as { __testNotifications: NotificationOptions[] }).__testNotifications)).toEqual([]);
  await reader.close();
  await sendCommand(page, "每隔5秒提醒我TEST循环");
  const recurring = page.locator("[data-vivic-reminder]").filter({ hasText: "TEST循环" });
  await expect(recurring).toHaveCount(1); await showSettings(page); await recurring.getByRole("button", { name: "暂停TEST循环" }).click();
  await expect(recurring).toContainText("已暂停"); await recurring.getByRole("button", { name: "继续TEST循环" }).click();
  await expect.poll(async () => page.locator("[data-vivic-reminder-notice]").filter({ hasText: "TEST循环" }).count(), { timeout: 14000 }).toBe(2);
  await recurring.getByRole("button", { name: "暂停TEST循环" }).click();
  await page.reload(); await expect(page.locator("[data-vivic-reminder]")).toHaveCount(4);
  await expect(page.locator("[data-vivic-reminder-notice]")).toHaveCount(3);
  expect(providers.every(value => value === "rules")).toBe(true);
  await page.locator("[data-vivic-reminders]").screenshot({ path: path.resolve(process.cwd(), "../../evidence/next-plan", info.project.name || "chromium", "TEST-reminders.png") });
});
test("optional model settings expose explicit lifecycle and never enable automatically", async ({ page }) => {
  let phase = "cached", enabled = false; const calls: string[] = [];
  await page.route("**/api/decision/*", async route => {
    const action = route.request().url().split("/").at(-1)!;
    if (action !== "status") { calls.push(action); phase = action === "enable" ? "ready" : action === "clear" ? "absent" : "cached"; enabled = action === "enable"; }
    await route.fulfill({ json: { phase, enabled, model: "Kev-0.8B", bytes: 1825383500, gpuBytes: enabled ? 1504791242 : 0, lastMs: null, error: null } });
  });
  await page.goto("/control"); await expect(page.locator("[data-vivic-decision-status]")).toContainText("已准备，未启用"); expect(calls).toEqual([]);
  await page.locator("[data-vivic-decision-enable]").click(); await expect(page.locator("[data-vivic-decision-status]")).toContainText("已启用");
  await page.locator("[data-vivic-decision-stop]").click(); await expect(page.locator("[data-vivic-decision-status]")).toContainText("未启用");
  await page.locator("[data-vivic-decision-clear]").click(); expect(calls).toEqual(["enable", "stop"]);
  await page.getByRole("button", { name: "清理模型", exact: true }).click(); await expect(page.locator("[data-vivic-decision-status]")).toContainText("尚未准备");
});
test("model Blob cache survives native writes or byte fallback, while reset invalidates stale leases", async ({ page }) => {
  await page.goto("/control");
  const result = await page.evaluate(async () => {
    const { IndexedDbModelStorage } = await import("/src/ai/localSpeech/storage.ts");
    const storage = new IndexedDbModelStorage(); const record = { id: "vad" as const, sha256: "TEST", bytes: 4, blob: new Blob([new Uint8Array([1, 2, 3, 4])]) };
    const lease = await storage.begin("vad"); await storage.put(record, lease);
    const first = Array.from(new Uint8Array(await (await storage.get("vad"))!.blob.arrayBuffer()));
    // Exercise the fallback deterministically as well as native WebKit behavior.
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value: unknown, key?: IDBValidKey) {
      if (this.name === "models" && value && typeof value === "object" && "blob" in value) throw new DOMException("TEST Blob backing failure", "UnknownError");
      return key === undefined ? original.call(this, value) : original.call(this, value, key);
    };
    try { await storage.put(record, await storage.begin("vad")); } finally { IDBObjectStore.prototype.put = original; }
    const fallback = Array.from(new Uint8Array(await (await storage.get("vad"))!.blob.arrayBuffer()));
    const stale = await storage.begin("vad"); await storage.delete(); let rejected = false;
    try { await storage.put(record, stale); } catch { rejected = true; }
    return { first, fallback, rejected, empty: !await storage.get("vad") };
  });
  expect(result).toEqual({ first: [1, 2, 3, 4], fallback: [1, 2, 3, 4], rejected: true, empty: true });
});
test("output selection and voice cloning require clicks, route before playback, and never touch microphone", async ({ page }) => {
  await page.addInitScript(() => {
    const state = { picks: 0, microphone: 0, plays: 0, sink: "", unavailable: false };
    Object.assign(window, { __audioDeviceTest: state });
    const devices = Object.assign(new EventTarget(), { selectAudioOutput: async () => { state.picks++; return { deviceId: "TEST-headset", label: "TEST headphones" }; },
      enumerateDevices: async () => [], getUserMedia: async () => { state.microphone++; throw new Error("Mic forbidden"); } });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: devices });
    Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", { configurable: true, value: async () => {} });
    class SilentAudio {
      volume = 0; onended: (() => void) | null = null;
      async setSinkId(id: string) { if (state.unavailable) throw new Error("TEST unplugged"); state.sink = id; }
      async play() { if (state.sink !== "TEST-headset") throw new Error("Wrong sink order"); state.plays++; setTimeout(() => this.onended?.(), 20); }
      pause() {} removeAttribute() {} load() {}
    }
    Object.defineProperty(window, "Audio", { value: SilentAudio });
  });
  await page.route("**/api/providers/status", route => route.fulfill({ json: { providers: [{ name: "stepfun", connected: true, defaultModel: "step-3.5-flash", capabilities: ["text"] }], degradations: [] } }));
  let clones = 0;
  await page.route("**/api/speech/cloned-voices", route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { voices: [] } });
    clones++; expect(route.request().postDataJSON()).toMatchObject({ fileId: "file-TEST", authorized: true });
    return route.fulfill({ json: { ok: true, id: "voice-tone-TEST" } });
  });
  await page.route("**/api/speech", route => { expect(route.request().postDataJSON().clonedVoiceId).toBe("voice-tone-TEST"); return route.fulfill({ contentType: "audio/mpeg", body: Buffer.from("ID3-TEST") }); });
  await page.goto("/control"); await expect(page.locator("[data-vivic-output-choose]")).toBeEnabled(); expect(clones).toBe(0);
  await page.locator("[data-vivic-output-choose]").click(); await expect(page.locator("[data-vivic-audio-output]")).toContainText("已指定设备");
  await page.getByLabel("复刻音色 File ID").fill("file-TEST"); await expect(page.locator("[data-vivic-clone-submit]")).toBeDisabled();
  await page.locator("[data-vivic-clone-authorized]").check(); await page.locator("[data-vivic-clone-submit]").click();
  await expect(page.locator("[data-vivic-voice-clone]")).toContainText("音色已创建并选用"); expect(clones).toBe(1);
  await expect(page.locator("[data-vivic-tts-toggle]")).not.toBeChecked();
  await page.locator("[data-vivic-tts-preview]").click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __audioDeviceTest: { plays: number } }).__audioDeviceTest.plays)).toBe(1);
  await page.evaluate(() => { (window as unknown as { __audioDeviceTest: { unavailable: boolean } }).__audioDeviceTest.unavailable = true; });
  await page.locator("[data-vivic-tts-preview]").click(); await expect(page.locator("[data-vivic-tts-note]")).toContainText("本次没有播放");
  expect(await page.evaluate(() => (window as unknown as { __audioDeviceTest: { plays: number; microphone: number; picks: number } }).__audioDeviceTest)).toMatchObject({ plays: 1, microphone: 0, picks: 1 });
});
