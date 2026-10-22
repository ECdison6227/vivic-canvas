import { expect, test } from "@playwright/test";
import type { ProvidersStatusResponse } from "../../src/ai/api";

test("the card catalog follows the selected model, disconnects and backend availability without creating cards", async ({ page, context }) => {
  // Isolated TEST status fixtures; no model calls, real location or microphone.
  await context.addInitScript(() => {
    localStorage.setItem("vivic.deviceLocation.v1", "off");
    localStorage.setItem("vivic.voice.providers.v1", JSON.stringify({ stt: "none", tts: "none", browserVoice: "" }));
  });
  await context.route("https://huggingface.co/**", route => route.abort());
  let offline = false, intents = 0;
  let status: ProvidersStatusResponse = { activeProvider: "stepfun", providers: [
    { name: "stepfun", connected: true, capabilities: ["structured", "chat"], defaultModel: "TEST-step-cards", models: ["TEST-step-cards"] },
    { name: "gpt", connected: true, capabilities: ["structured", "chat"], defaultModel: "TEST-gpt-cards", models: ["TEST-gpt-cards"] },
  ], degradations: [] };
  await page.route("**/api/providers/status", route => offline ? route.abort() : route.fulfill({ json: status }));
  await context.route("https://edsionc.top/vivic/store", route => route.fulfill({ contentType: "text/html", body: "<title>TEST Vivic Store destination</title><p>TEST navigation fixture only; the store is not launched.</p>" }));
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/intent") intents++; });
  await page.goto("/control");
  const catalog = page.locator("[data-vivic-available-cards]");
  await expect(catalog).toContainText("24 类已接入");
  await expect(catalog.locator("[data-vivic-available-card]")).toHaveCount(24);
  await expect(catalog.locator('[data-vivic-card-group="model"] [data-availability="ready"]')).toHaveCount(17);
  await expect(catalog.locator('[data-vivic-available-card="WeatherCard"]')).toContainText("需联网");
  await expect(catalog.locator('[data-vivic-available-card="TableCard"]')).toContainText("需提供数据");
  await catalog.screenshot({ path: "../../evidence/settings/available-cards.png" });

  const popupPromise = page.waitForEvent("popup");
  await catalog.getByRole("link", { name: "打开 Vivic Store，添加新卡片（新标签页）", exact: true }).click();
  const store = await popupPromise;
  await expect(store).toHaveURL("https://edsionc.top/vivic/store");
  await expect(page).toHaveURL(/\/control$/);
  await store.close();

  status = { ...status, activeProvider: "gpt" };
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(catalog.locator("[data-vivic-card-model-status]")).toContainText("TEST-gpt-cards");
  status = { ...status, providers: status.providers.map(provider => provider.name === "gpt" ? { ...provider, connected: false } : provider) };
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(catalog.locator('[data-vivic-card-group="model"] [data-availability="requires-model"]')).toHaveCount(17);
  await expect(catalog.locator('[data-vivic-card-group="local"] [data-availability="ready"]')).toHaveCount(3);
  offline = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(catalog.locator('[data-vivic-card-group="data"] [data-availability="requires-backend"]')).toHaveCount(4);
  await expect(catalog.locator('[data-vivic-card-group="local"] [data-availability="ready"]')).toHaveCount(3);
  expect(intents).toBe(0);
});
