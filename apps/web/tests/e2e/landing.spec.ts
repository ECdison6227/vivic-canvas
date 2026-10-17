import { expect, test } from "@playwright/test";

// TEST context only: the landing makes no network calls of its own.
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    HTMLMediaElement.prototype.play = async () => { throw new Error("TEST audio disabled"); };
    navigator.mediaDevices.getUserMedia = async () => { throw new Error("TEST microphone disabled"); };
  });
});

test("landing: any valid email is accepted as a beta user and opens the user page", async ({ page }) => {
  const posts: string[] = [];
  page.on("request", request => { if (request.method() === "POST") posts.push(request.url()); });
  await page.goto("/landing");
  await expect(page).toHaveURL(/\/landing\/$/);
  await expect(page.locator("h1")).toContainText("说出你的想法");

  const email = page.locator("#betaEmail");
  await email.fill("not-an-email");
  await page.locator("#betaSubmit").click();
  await page.waitForTimeout(900);
  await expect(page).toHaveURL(/\/landing\/$/);
  expect(await email.evaluate(input => (input as HTMLInputElement).validity.valid)).toBe(false);

  await email.fill("demo@example.com");
  await page.locator("#betaSubmit").click();
  await expect(page.locator("#betaStatus")).toContainText("你已成为 VIVIC 内测用户");
  await page.waitForURL(url => url.pathname === "/");
  await expect(page.locator("[data-vivic-control]")).toHaveAttribute("data-vivic-view", "chat");
  // Demo signup: nothing is posted anywhere.
  expect(posts.filter(url => url.includes("waitlist"))).toEqual([]);
});

test("landing: any path under /landing (bare, or a link with trailing punctuation) shows the landing, not the user page", async ({ page }) => {
  for (const path of ["/landing", "/landing/**", "/landing/%EF%BC%89"]) {
    await page.goto(path);
    await page.waitForURL(url => url.pathname === "/landing/");
    await expect(page.locator("#betaEmail")).toBeVisible();
  }
});

test("landing: the closing link opens the user page in the same tab", async ({ page }) => {
  await page.goto("/landing/");
  await page.locator(".closing .local-link").click();
  await page.waitForURL(url => url.pathname === "/");
  await expect(page.locator("[data-vivic-control]")).toHaveAttribute("data-vivic-view", "chat");
});
