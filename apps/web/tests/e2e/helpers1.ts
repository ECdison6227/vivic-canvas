import { expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
export const EVIDENCE1 = path.resolve(here, "../../../../evidence/phase1");

fs.mkdirSync(EVIDENCE1, { recursive: true });

const fixedNow = "2026-10-15T08:00:00.000Z";

export const todoCardRecord = (id: string, texts: string[]) => ({
  id,
  type: "TodoCard",
  variant: "minimal",
  displayProps: {
    items: texts.map((text, i) => ({ id: `${id}-i${i + 1}`, text, done: false })),
  },
  sourceData: {},
  sources: [],
  layout: { x: 0, y: 0, width: 288, height: 160, pinned: false },
  metadata: { createdAt: fixedNow, updatedAt: fixedNow },
});

let seq = 0;
export const rid = (tag: string) => `e2e-p1-${tag}-${Date.now()}-${(seq += 1)}`;

/** Dispatch a validated envelope through the control owner (returns DispatchResult). */
export const controlDispatch = async (
  control: Page,
  tag: string,
  canvasId: string,
  actions: Array<Record<string, unknown>>,
) => {
  const envelope = {
    schemaVersion: "0.6",
    requestId: rid(tag),
    canvasId,
    actions,
  };
  const result = await control.evaluate(
    (raw) =>
      (window as unknown as { __vivic: { dispatch: (r: unknown) => unknown } })
        .__vivic.dispatch(raw),
    envelope,
  );
  expect(result).toEqual({ ok: true, deduplicated: false });
  return envelope;
};

export const activeCanvasId = async (control: Page): Promise<string> =>
  control.evaluate(
    () =>
      (
        window as unknown as {
          __vivicControl: { snapshot: () => { activeCanvasId: string } };
        }
      ).__vivicControl.snapshot().activeCanvasId,
  );

export const gotoControl = async (context: import("@playwright/test").BrowserContext) => {
  const page = await context.newPage();
  await page.goto("/control");
  await expect(page).toHaveTitle("Vivic");
  await expect(page.getByRole("heading", { name: "设置", exact: true })).toBeVisible();
  await page.waitForSelector('[data-vivic-control="ready"]');
  return page;
};

/** `/` (user page) and `/control` (settings) are one owner window; switch in place like a user. */
const showView = async (page: Page, view: "chat" | "settings") => {
  const root = page.locator("[data-vivic-control]");
  if (await root.getAttribute("data-vivic-view") !== view) {
    await page.locator(view === "chat" ? "[data-vivic-open-chat]" : "[data-vivic-open-settings]").click();
  }
  await expect(root).toHaveAttribute("data-vivic-view", view);
};
export const showChat = (page: Page) => showView(page, "chat");
export const showSettings = (page: Page) => showView(page, "settings");

export const gotoDisplay = async (
  context: import("@playwright/test").BrowserContext,
  canvasId: string,
) => {
  const page = await context.newPage();
  await page.goto(`/display?canvasId=${encodeURIComponent(canvasId)}`);
  return page;
};

export const sendCommand = async (control: Page, text: string) => {
  await showChat(control);
  await control.locator('[data-vivic-command-input]').fill(text);
  await control.locator('[data-vivic-command-input]').press("Enter");
};
