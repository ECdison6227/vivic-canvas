import { expect, test } from "@playwright/test";
import path from "node:path";
import { activeCanvasId, controlDispatch, sendCommand, showSettings, todoCardRecord } from "./helpers1";

test.use({ video: { mode: "on", size: { width: 1440, height: 900 } } });

test("explicit reset clears only isolated app data, cancels pending work, and refreshes all windows", async ({ page, context }, testInfo) => {
  const evidence = path.resolve(process.cwd(), "../../evidence/next-iteration-local-data", testInfo.project.name || "chromium");
  await context.addInitScript(() => {
    HTMLMediaElement.prototype.play = async () => { throw new Error("TEST audio disabled"); };
    navigator.mediaDevices.getUserMedia = async () => { throw new Error("TEST mic disabled"); };
  });
  await page.goto("/control");
  await expect(page.locator("[data-vivic-control]")).toHaveAttribute("data-vivic-owner", "owner");
  const originalId = await activeCanvasId(page);
  await controlDispatch(page, "TEST-reset-seed", originalId, [
    { type: "stage.awaken" }, { type: "card.create", card: todoCardRecord("TEST-reset-todo", ["TEST 待清理卡片"]) },
  ]);
  const display = await context.newPage(); await display.goto(`/display?canvasId=${originalId}`);
  await expect(display.locator(".vivic-card")).toHaveCount(1);
  await page.getByRole("radio", { name: "深色", exact: true }).click();
  await page.getByLabel("语音输入服务").click();
  await page.getByRole("option", { name: "仅文字输入", exact: true }).click();
  await page.getByLabel("语音输出服务").click();
  await page.getByRole("option", { name: "仅卡片与字幕", exact: true }).click();
  await page.locator("[data-vivic-tts-speed]").press("End");
  await page.locator("[data-vivic-canvas-create]").click();
  await expect(page.locator("[data-vivic-canvas-list] li")).toHaveCount(2);
  await page.evaluate(async () => {
    localStorage.setItem("TEST.unrelated", "preserve");
    const open = indexedDB.open("vivic-local-speech-v1", 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    const tx = db.transaction(["models", "leases"], "readwrite");
    // Corrupt/legacy TEST cache rows must also be deleted. Avoid Blob/File
    // setup, which fails in this machine's headless WebKit IndexedDB backend.
    tx.objectStore("models").put({ id: "vad", bytes: 4, sha256: "TEST", blob: new Uint8Array([84, 69, 83, 84]) });
    tx.objectStore("models").put({ id: "TEST-legacy-model", bytes: 4, sha256: "TEST", blob: new Uint8Array([84, 69, 83, 84]) });
    tx.objectStore("leases").put("TEST-old-lease", "vad");
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); }); db.close();
  });
  const reader = await context.newPage(); await reader.goto("/control");
  await expect(reader.locator("[data-vivic-control]")).toHaveAttribute("data-vivic-owner", "readonly");
  await expect(reader.locator("[data-vivic-clear-local-data]")).toBeDisabled();
  const before = await activeCanvasId(page);
  await page.locator("[data-vivic-clear-local-data]").click();
  await expect(page.getByRole("alertdialog")).toContainText("此操作无法撤销");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  expect(await activeCanvasId(page)).toBe(before);
  await expect(page.locator("[data-vivic-canvas-list] li")).toHaveCount(2);

  let held: import("@playwright/test").Route | undefined;
  await page.route("**/api/intent", route => { held = route; });
  await sendCommand(page, "TEST 等待中的复杂请求");
  await expect.poll(() => Boolean(held)).toBe(true);
  await showSettings(page);
  await page.locator("[data-vivic-clear-local-data]").click();
  await page.getByRole("alertdialog").screenshot({ path: path.join(evidence, "TEST-confirmation.png") });
  await page.getByRole("button", { name: "清除全部", exact: true }).click();
  await expect(page.locator("[data-vivic-data-feedback]")).toContainText("已清除全部画布");
  await expect(page.locator("[data-vivic-canvas-list] li")).toHaveCount(1);
  await expect(reader.locator("[data-vivic-canvas-list] li")).toHaveCount(1);
  await expect(display.locator(".vivic-card")).toHaveCount(0);
  await expect(display.locator("[data-vivic-stage]")).toHaveAttribute("data-vivic-stage", "STANDBY");
  await expect(page.locator("[data-vivic-command-cancel]")).toHaveCount(0);
  await expect(page.locator("[data-vivic-tts-toggle]")).not.toBeChecked();
  await expect(page.getByLabel("语音输入服务")).toHaveText("StepFun Plan ASR");
  await expect(reader.getByLabel("语音输入服务")).toHaveText("StepFun Plan ASR");
  await expect(page.locator("[data-vivic-tts-speed]")).toHaveValue("1");
  const stored = await page.evaluate(async () => {
    const open = indexedDB.open("vivic-local-speech-v1", 1);
    const db = await new Promise<IDBDatabase>(resolve => { open.onsuccess = () => resolve(open.result); });
    const tx = db.transaction("models", "readonly"), req = tx.objectStore("models").count();
    const count = await new Promise<number>(resolve => { req.onsuccess = () => resolve(req.result); }); db.close();
    return { count, voice: localStorage.getItem("vivic.voice.providers.v1"), speech: localStorage.getItem("vivic.speech.preferences.v1"), unrelated: localStorage.getItem("TEST.unrelated") };
  });
  expect(stored).toEqual({ count: 0, voice: null, speech: null, unrelated: "preserve" });
  const freshId = await activeCanvasId(page);
  await held!.fulfill({ json: { kind: "envelope", envelope: { schemaVersion: "0.6", canvasId: before, requestId: "TEST-stale-after-reset",
    actions: [{ type: "card.create", card: todoCardRecord("TEST-stale", ["TEST must not return"]) }] } } }).catch(() => undefined);
  await display.reload();
  await expect(display.locator(".vivic-card")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("[data-vivic-control]")).toHaveAttribute("data-vivic-owner", "owner");
  expect(await activeCanvasId(page)).toBe(freshId);
  await expect(page.locator("[data-vivic-canvas-list] li")).toHaveCount(1);
  await reader.locator("[data-vivic-takeover]").click();
  await expect(reader.locator("[data-vivic-control]")).toHaveAttribute("data-vivic-owner", "owner");
  expect(await activeCanvasId(reader)).toBe(freshId);
  await reader.locator("[data-vivic-canvas-list]").screenshot({ path: path.join(evidence, "TEST-empty-canvas-list.png") });
  const video = display.video();
  await reader.close(); await display.close();
  if (video) await video.saveAs(path.join(evidence, "TEST-reset-display.webm"));
});
