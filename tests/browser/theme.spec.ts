import { test, expect, type Page } from "@playwright/test";

export async function fixture(
  page: Page,
  mode: "nekomari" | "official" | "private" | "empty" = "nekomari",
) {
  const names = [
    "vpsTaxi · 东京软银",
    "CloudLane · 香港",
    "OakNode · 洛杉矶",
    "Kumo · 新加坡",
    "Hetzner · 德国",
    "备用节点 · 大阪",
  ];
  const groups = [
    "亚洲节点",
    "亚洲节点",
    "美洲节点",
    "亚洲节点",
    "欧洲节点",
    "亚洲节点",
  ];
  await page.route("**/api/rpc2", async (route) => {
    const req = route.request().postDataJSON();
    const now = Date.now();
    const nodes = Object.fromEntries(
      names.map((name, i) => [
        `node-${i}`,
        {
          uuid: `node-${i}`,
          name,
          group: groups[i],
          region: ["JP", "HK", "US", "SG", "DE", "JP"][i],
          tags: ["CN2GIA<Blue>;生产<Green>", "数据中心", "原生 IPv6"][i % 3],
          price: 25 + i * 9,
          currency: "CNY",
          billing_cycle: 30,
          cpu_name: "AMD EPYC 7B13",
          cpu_cores: 2,
          arch: "amd64",
          os: "Debian 13",
          mem_total: 4294967296,
          disk_total: 42949672960,
          traffic_limit: 1073741824000,
          traffic_limit_type: "sum",
          expired_at: new Date(
            now + [362, 124, 27, 91, 12, -2][i] * 86400000,
          ).toISOString(),
        },
      ]),
    );
    const live = Object.fromEntries(
      names.map((_, i) => [
        `node-${i}`,
        {
          client: `node-${i}`,
          time: new Date(now - (i === 5 ? 180000 : 1000)).toISOString(),
          online: i !== 5,
          cpu: [4, 12, 8, 31, 7, 0][i],
          ram: ([24, 42, 18, 59, 35, 0][i] / 100) * 4294967296,
          ram_total: 4294967296,
          disk: 42949672960 * (0.14 + i * 0.06),
          disk_total: 42949672960,
          net_in: 3686 + i * 27411,
          net_out: 2355 + i * 6382,
          traffic_up: 6442450944,
          traffic_down: 10737418240,
          uptime: 935280,
          connections: 42,
          tcp_retrans_percent: mode === "official" ? undefined : 1.1,
        },
      ]),
    );
    const tasks = [1, 2, 3].map((id, i) => ({
      id,
      name: ["电信 上海", "联通 北京", "移动 广州"][i],
      type: "tcp",
      interval: 60,
      clients: Object.keys(nodes),
    }));
    let result: unknown;
    let error: unknown;
    if (mode === "private" && req.method !== "public:getPublicSettings")
      error = {
        code: -32003,
        message: "Private site enabled, please login first",
      };
    else
      switch (req.method) {
        case "public:getPublicSettings":
          result = {
            sitename: "Nekomari",
            private_site: mode === "private",
            theme_settings: {},
          };
          break;
        case "common:getNodes":
          result = mode === "empty" ? {} : nodes;
          break;
        case "common:getNodesLatestStatus":
          result = mode === "empty" ? {} : live;
          break;
        case "public:getPublicPingTasks":
          result = tasks;
          break;
        case "public:getPingRecords":
          result = {
            records: Array.from({ length: 180 }, (_, j) => ({
              task_id: (j % 3) + 1,
              ping_type: "tcp",
              time: new Date(
                now - (60 - Math.floor(j / 3)) * 60000 + 1000,
              ).toISOString(),
              value:
                j % 47 === 0
                  ? -1
                  : j % 29 === 0
                    ? 310
                    : [92, 129, 69][j % 3] + (j % 7) * 2,
            })),
          };
          break;
        case "public:queryMetrics":
          result = {
            series: [
              "cpu.usage",
              "memory.used",
              "net.in.rate",
              "net.out.rate",
            ].map((metric_key, i) => ({
              metric_key,
              interval_seconds: 60,
              points: Array.from({ length: 20 }, (_, j) => ({
                time: new Date(now - (20 - j) * 60000).toISOString(),
                value: j === 8 ? null : (i + 1) * 20 + j,
              })),
            })),
          };
          break;
        case "public:getNodeInsights":
          if (mode === "official")
            error = { code: -32601, message: "Method not found" };
          else
            result = {
              version: 1,
              ip: {
                network: "住宅 / 商宽",
                organization: "SoftBank",
                country: "JP",
                source: "fixture",
              },
              unlock: {
                probed_at: new Date(now).toISOString(),
                stale: false,
                results: [
                  ["chatgpt", "ChatGPT", "region"],
                  ["claude", "Claude", "region"],
                  ["netflix", "Netflix", "probe"],
                  ["youtube", "YouTube", "probe"],
                ].map(([id, name, basis]) => ({
                  id,
                  name,
                  basis,
                  status: "unlocked",
                  kind: "media",
                  detail:
                    basis === "region"
                      ? "出口地区 JP 支持服务；未验证该 IP 实际可用性"
                      : "服务页面包含可用性标记",
                })),
              },
              routes: {
                probed_at: new Date(now).toISOString(),
                stale: false,
                results: [
                  {
                    carrier: "telecom",
                    label: "163",
                    reached: true,
                    target: "1.1.1.1",
                    hops: 12,
                  },
                  {
                    carrier: "mobile",
                    label: "CMI",
                    reached: true,
                    target: "8.8.8.8",
                    hops: 10,
                  },
                ],
              },
            };
          break;
        default:
          error = { code: -32601, message: "Method not found" };
      }
    await route.fulfill({
      json: { jsonrpc: "2.0", id: req.id, ...(error ? { error } : { result }) },
    });
  });
}

test("desktop: real data states, search, grouping, details and dark mode", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await fixture(page);
  await page.goto("/");
  await expect(page.locator(".node-card")).toHaveCount(6);
  await expect(
    page
      .locator(".node-card")
      .first()
      .locator(".service")
      .filter({ hasText: "ChatGPT" }),
  ).toContainText("地区判断");
  await expect(
    page
      .locator(".node-card")
      .first()
      .locator(".service")
      .filter({ hasText: "Gemini" }),
  ).toContainText("未接入");
  await page.getByRole("button", { name: "美洲节点", exact: true }).click();
  await expect(page.locator(".node-card")).toHaveCount(1);
  await page.getByRole("button", { name: /全部节点/ }).click();
  await page.getByLabel("搜索节点").fill("东京");
  await expect(page.locator(".node-card")).toHaveCount(1);
  await page.getByLabel("搜索节点").fill("");
  await page.getByRole("button", { name: "仅在线", exact: true }).click();
  await expect(page.locator(".node-card")).toHaveCount(5);
  await page.getByRole("button", { name: "节点详情" }).first().click();
  await expect(page.locator("dialog")).toBeVisible();
  await expect(page.locator("dialog")).toContainText("总分 =");
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toHaveCount(0);
  await page.getByLabel("切换深色模式").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(errors).toEqual([]);
});
test("official Komari: unsupported insights degrade without breaking metrics", async ({
  page,
}) => {
  await fixture(page, "official");
  await page.goto("/");
  await expect(page.locator(".node-card")).toHaveCount(6);
  await expect(
    page.locator(".node-card").first().locator(".metric").first(),
  ).toContainText("4%");
  await expect(
    page.locator(".node-card").first().locator(".services"),
  ).toContainText("待升级");
  await expect(page.locator(".error-banner")).toHaveCount(0);
});
test("private site never renders node information", async ({ page }) => {
  await fixture(page, "private");
  await page.goto("/");
  await expect(page.locator(".login-panel")).toBeVisible();
  await expect(page.locator(".node-card")).toHaveCount(0);
  await expect(page.getByLabel("密码", { exact: true })).toBeVisible();
});
test("production HTTP 401 envelope prompts login instead of an empty dashboard", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/api/rpc2", async (route) => {
    await route.fulfill({
      status: 401,
      json: {
        status: "error",
        message: "Private site is enabled, please login first.",
      },
    });
  });
  await page.goto("/");
  await expect(page.locator(".login-panel")).toBeVisible();
  await expect(page.locator(".node-card")).toHaveCount(0);
  await expect(page.locator(".error-banner")).toHaveCount(0);
});
test("empty and filtered states are explicit", async ({ page }) => {
  await fixture(page, "empty");
  await page.goto("/");
  await expect(page.getByText("第一台节点，从这里开始。")).toBeVisible();
});
for (const width of [320, 390, 768, 1440])
  test(`no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await fixture(page);
    await page.goto("/");
    await expect(page.locator(".node-card")).toHaveCount(6);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
test("generate labeled preview screenshots", async ({ page }, testInfo) => {
  await page.addInitScript(() =>
    localStorage.setItem("mint-hide-costs", "false"),
  );
  const output = (name: string) =>
    process.env.MINT_UPDATE_SCREENSHOTS === "1"
      ? name
      : testInfo.outputPath(name.replaceAll("/", "-"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1170 });
  await fixture(page);
  await page.goto("/");
  await expect(
    page.locator(".node-card").first().locator(".service.good"),
  ).toHaveCount(2);
  for (const card of await page.locator(".node-card").all()) {
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator(".service.good")).toHaveCount(2);
  }
  await page.evaluate(() => scrollTo(0, 0));
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    const note = document.createElement("div");
    note.textContent = "演示数据 · 界面预览，非真实节点";
    note.style.cssText =
      "position:fixed;right:18px;bottom:12px;padding:7px 12px;border:1px solid #b7c8b0;border-radius:8px;background:#f5f9f0f0;color:#628254;font:11px sans-serif;z-index:100";
    document.body.append(note);
  });
  await page.screenshot({ path: output("preview.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 1520 });
  await page.screenshot({ path: output("docs/mobile.png"), fullPage: false });
  await page.getByLabel("切换深色模式").click();
  await page.setViewportSize({ width: 1440, height: 1170 });
  await page.screenshot({ path: output("docs/dark.png"), fullPage: true });
});

test("session revocation clears node information and an open detail", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/");
  await expect(page.locator(".node-card")).toHaveCount(6);
  await page
    .getByRole("button", { name: "节点详情", exact: true })
    .first()
    .click();
  await expect(page.locator("dialog")).toBeVisible();
  await fixture(page, "private");
  await expect(page.locator(".login-panel")).toBeVisible({ timeout: 12000 });
  await expect(page.locator(".node-card")).toHaveCount(0);
  await expect(page.locator("dialog")).toHaveCount(0);
});

test("SAO-inspired controls: cost privacy, list view, tags and lazy history", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/");
  await expect(page.locator(".overview")).toContainText("••••");
  await page.getByRole("button", { name: "显示费用", exact: true }).click();
  await expect(page.locator(".overview")).toContainText("285.00");
  await expect(page.locator(".node-tags").first()).toContainText("CN2GIA");
  await expect(page.locator(".node-tags").first()).not.toContainText("<Blue>");
  await page.getByRole("button", { name: "切换列表视图" }).click();
  await expect(page.locator(".list-view")).toBeVisible();
  await page
    .getByRole("button", { name: "节点详情", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("CPU历史，19 个有效点")).toBeVisible();
  await page.getByLabel("历史时间范围").selectOption("6");
  await expect(page.getByLabel("CPU历史，19 个有效点")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator(".list-view")).toBeVisible();
  await expect(page.locator(".overview")).toContainText("285.00");
  await page.setViewportSize({ width: 320, height: 1000 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("history falls back only for a missing method and ignores a cancelled range", async ({
  page,
}) => {
  await fixture(page, "official");
  const ranges: number[] = [];
  await page.route("**/api/rpc2", async (route) => {
    const req = route.request().postDataJSON();
    if (req.method === "public:queryMetrics") {
      await route.fulfill({
        json: {
          jsonrpc: "2.0",
          id: req.id,
          error: { code: -32601, message: "Method not found" },
        },
      });
    } else if (req.method === "common:getRecords") {
      ranges.push(req.params.hours);
      if (req.params.hours === 6)
        await new Promise((resolve) => setTimeout(resolve, 400));
      await route.fulfill({
        json: {
          jsonrpc: "2.0",
          id: req.id,
          result: {
            records: {
              [req.params.uuid]: Array.from(
                { length: req.params.hours === 24 ? 3 : 2 },
                (_, i) => ({
                  time: new Date(Date.now() - (i + 1) * 60000).toISOString(),
                  cpu: 12,
                  ram: 1024,
                  net_in: 5,
                  net_out: 6,
                }),
              ),
            },
          },
        },
      });
    } else await route.fallback();
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "节点详情", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("CPU历史，2 个有效点")).toBeVisible();
  await page.getByLabel("历史时间范围").selectOption("6");
  await expect.poll(() => ranges.includes(6)).toBe(true);
  await page.getByLabel("历史时间范围").selectOption("24");
  await expect(page.getByLabel("CPU历史，3 个有效点")).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByLabel("CPU历史，3 个有效点")).toBeVisible();
  await expect(page.locator(".resource-history [role=alert]")).toHaveCount(0);
});
