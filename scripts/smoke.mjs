import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const origin = new URL(process.argv[2] || "http://127.0.0.1:25775").origin;
const output = resolve(
  process.env.MINT_SMOKE_OUTPUT || "test-results/real-smoke",
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const panelRoutes = {};
  if (process.env.MINT_SMOKE_PANEL_ROUTES === "1") {
    for (const path of ["/admin", "/install", "/terminal"]) {
      const response = await context.request.get(origin + path, {
        maxRedirects: 0,
      });
      const html = await response.text();
      if (
        response.status() !== 200 ||
        !html.includes('type="module"') ||
        html.includes("mint.svg")
      )
        throw Error(`Panel document was replaced at ${path}`);
      panelRoutes[path] = "panel";
    }
    const recovery = await context.request.get(origin + "/database-recovery", {
      maxRedirects: 0,
    });
    if (recovery.status() !== 307 || recovery.headers().location !== "/")
      throw Error("Normal server recovery route must keep its redirect");
    panelRoutes["/database-recovery"] = "panel redirect";
    const plugin = await context.request.get(
      origin + "/plugin/mint-route-test",
    );
    if (!plugin.ok() || !(await plugin.text()).includes("mint.svg"))
      throw Error("Plugin document ownership changed unexpectedly");
    panelRoutes["/plugin/*"] = "theme";
  }
  if (process.env.MINT_SMOKE_CREDENTIALS) {
    const credentials = JSON.parse(
      await readFile(process.env.MINT_SMOKE_CREDENTIALS, "utf8"),
    );
    const response = await context.request.post(origin + "/api/login", {
      data: credentials,
    });
    if (!response.ok() || (await response.json()).status === "error")
      throw Error("Login failed");
  }
  await page.goto(origin);
  await page.waitForSelector(".node-card", { timeout: 60000 });
  if (
    !(await page
      .locator(".node-card")
      .evaluateAll((cards) =>
        cards.every((card) => card.querySelectorAll(".ping-row").length === 1),
      ))
  )
    throw Error("Each card must show exactly one primary latency row");
  await page.waitForFunction(
    () => document.querySelector(".metric b")?.textContent !== "—",
  );
  await page.waitForFunction(
    () => !!document.querySelector(".history .ok"),
    null,
    { timeout: 60000 },
  );
  if (
    process.env.MINT_SMOKE_TASK &&
    !(await page.locator(".node-grid").innerText()).includes(
      process.env.MINT_SMOKE_TASK,
    )
  )
    throw Error("Required real task missing");
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw Error("Desktop overflow");
  await page.screenshot({
    path: resolve(output, "desktop.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "节点详情", exact: true })
    .first()
    .click();
  await page.waitForSelector("dialog[open]");
  await page.getByRole("img", { name: /CPU历史，/ }).waitFor();
  const historyLabel = await page
    .getByRole("img", { name: /CPU历史，/ })
    .getAttribute("aria-label");
  if (!historyLabel || /，0 个/.test(historyLabel))
    throw Error("Real CPU history is empty");
  await page.getByLabel("处理器能力说明").waitFor();
  await page.getByLabel("网络类型依据").waitFor();
  await page.getByRole("img", { name: /延迟折线图，/ }).waitFor();
  if (await page.locator("dialog .history, dialog .ping-row").count())
    throw Error(
      "Detail latency must use independent line charts, not card bars",
    );
  if (!(await page.locator(".latency-line").count()))
    throw Error("Real latency line paths are empty");
  const linePaths = await page
    .locator(".latency-line")
    .evaluateAll((paths) => paths.map((p) => p.getAttribute("d") || ""));
  if (!linePaths.some((d) => (d.match(/L/g) || []).length >= 3))
    throw Error(
      "Real latency charts contain only isolated dots; check history aggregation cadence",
    );
  await page.locator(".latency-plot").scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(output, "detail-latency.png") });
  await page.keyboard.press("Escape");
  let adminReachable = null;
  if (process.env.MINT_SMOKE_CREDENTIALS) {
    await page.goto(origin + "/admin");
    await page.goto(origin + "/admin/theme_managed");
    await page
      .getByText("首页标题", { exact: true })
      .waitFor({ timeout: 15000 });
    adminReachable = true;
    await page.screenshot({
      path: resolve(output, "settings.png"),
      fullPage: true,
    });
  }
  await page.goto(origin);
  await page.waitForSelector(".node-card");
  await page.setViewportSize({ width: 390, height: 1200 });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw Error("Mobile overflow");
  await page.screenshot({
    path: resolve(output, "mobile.png"),
    fullPage: true,
  });
  if (errors.length) throw Error("Browser page errors: " + errors.join("; "));
  const result = {
    origin,
    realMetrics: true,
    realPingHistory: true,
    realResourceHistory: true,
    realLatencyLines: true,
    onePrimaryLinePerCard: true,
    cpuGuidance: true,
    detail: true,
    adminReachable,
    panelRoutes,
    pageErrors: errors,
  };
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
