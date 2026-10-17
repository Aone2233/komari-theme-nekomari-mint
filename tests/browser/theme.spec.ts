import { test, expect, type Page } from "@playwright/test";

test("private login retains the Passkey plugin mount contract", async ({
  page,
}) => {
  await fixture(page, "private");
  await page.goto("/");
  const dialog = page.locator(".km-restricted-login-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".km-restricted-login-form")).toBeVisible();
  // The real plugin owns WebAuthn. Mint only provides its documented mount point.
  await page.evaluate(() => {
    const form = document.querySelector(
      ".km-restricted-login-dialog .km-restricted-login-form",
    )!;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "km-passkey-login";
    button.textContent = "通过通行密钥登录";
    form.appendChild(button);
  });
  const button = page.getByRole("button", { name: "通过通行密钥登录" });
  await expect(button).toBeVisible();
  await button.focus();
  await expect(button).toBeFocused();
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

export async function fixture(
  page: Page,
  mode: "nekomari" | "official" | "private" | "empty" = "nekomari",
  options: {
    settings?: Record<string, unknown>;
    loggedIn?: boolean;
    cpuName?: string;
    arch?: string;
  } = {},
) {
  await page.route("**/api/me", (route) =>
    route.fulfill({ json: { logged_in: options.loggedIn === true } }),
  );
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
          cpu_name: options.cpuName ?? "AMD EPYC 7B13",
          cpu_cores: 2,
          arch: options.arch || "amd64",
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
            theme_settings: options.settings || {},
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

test("cost details keep hidden amounts hidden and guests cannot edit", async ({
  page,
}) => {
  await fixture(page, "nekomari", {
    settings: { costPremiums: '{"node-0":120}' },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "费用与溢价设置" }).click();
  const dialog = page.getByRole("dialog", { name: "费用与溢价" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".cost-totals")).toContainText("••••");
  await expect(dialog.locator(".cost-totals")).not.toContainText("120");
  await expect(
    dialog.getByRole("button", { name: "编辑费用设置" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("cost editor saves premiums through host API and preserves unrelated settings and absent nodes", async ({
  page,
}) => {
  const settings: Record<string, unknown> = {
    headline: "保留我的标题",
    showExtensions: false,
    exchangeRates: '{"USD":7}',
    costPremiums:
      '{"absent-node":{"amount":75,"acquiredAt":"2026-01-01","months":12}}',
    costIgnoredNodes: ["absent-node"],
    unrelatedExtension: { keep: true },
    telecomTasks: [17],
  };
  await fixture(page, "nekomari", { settings, loggedIn: true });
  let saved: Record<string, unknown> | undefined;
  await page.route(
    "**/api/admin/theme/settings?theme=nekomari-mint",
    async (route) => {
      saved = route.request().postDataJSON();
      Object.assign(settings, saved);
      await route.fulfill({ json: { status: "success", data: null } });
    },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "显示费用", exact: true }).click();
  await page.getByRole("button", { name: "费用与溢价设置" }).click();
  await page.getByRole("button", { name: "编辑费用设置" }).click();
  await page.getByLabel("vpsTaxi · 东京软银 溢价金额").fill("120");
  await page
    .getByLabel("vpsTaxi · 东京软银 收购日期")
    .fill(new Date().toISOString().slice(0, 10));
  await page.getByLabel("vpsTaxi · 东京软银 摊销月数").fill("12");
  await page.getByLabel("CloudLane · 香港 排除统计").check();
  await page.getByLabel("月度支出包含当前溢价月摊").check();
  await page.getByRole("button", { name: "保存费用设置" }).click();
  await expect(page.getByRole("status")).toContainText("费用设置已保存");
  expect(saved?.headline).toBe("保留我的标题");
  expect(saved?.unrelatedExtension).toEqual({ keep: true });
  expect(JSON.parse(saved?.costIgnoredNodes as string)).toEqual([
    "absent-node",
    "node-1",
  ]);
  expect(JSON.parse(saved?.telecomTasks as string)).toEqual([17]);
  const premiums = JSON.parse(saved?.costPremiums as string);
  expect(premiums["absent-node"].amount).toBe(75);
  expect(premiums["node-0"]).toMatchObject({ amount: 120, months: 12 });
  await page.getByLabel("关闭费用详情").click();
  await expect(page.locator(".cost-overview")).toContainText("261.00");
  await expect(page.locator(".cost-overview")).toContainText("含当前溢价月摊");
  await page.getByRole("button", { name: "费用与溢价设置" }).click();
  await expect(page.locator(".cost-totals")).toContainText("120.00");
  await page.setViewportSize({ width: 320, height: 1000 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .locator(".cost-panel")
      .evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
});

test("invalid financial input is rejected without a settings write", async ({
  page,
}) => {
  await fixture(page, "nekomari", { loggedIn: true });
  let writes = 0;
  await page.route(
    "**/api/admin/theme/settings?theme=nekomari-mint",
    async (route) => {
      writes++;
      await route.fulfill({ json: { status: "success" } });
    },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "显示费用", exact: true }).click();
  await page.getByRole("button", { name: "费用与溢价设置" }).click();
  await page.getByRole("button", { name: "编辑费用设置" }).click();
  await page.getByLabel("人民币汇率 JSON", { exact: true }).fill("not json");
  await page.getByRole("button", { name: "保存费用设置" }).click();
  await expect(page.getByRole("alert")).toContainText("JSON 格式错误");
  expect(writes).toBe(0);
});

test("cost editor refuses stale-session and concurrent settings writes", async ({
  page,
}) => {
  const settings: Record<string, unknown> = { exchangeRates: "{}" };
  await fixture(page, "nekomari", { settings, loggedIn: true });
  let writes = 0;
  await page.route(
    "**/api/admin/theme/settings?theme=nekomari-mint",
    async (route) => {
      writes++;
      await route.fulfill({ json: { status: "success" } });
    },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "显示费用", exact: true }).click();
  await page.getByRole("button", { name: "费用与溢价设置" }).click();
  await page.getByRole("button", { name: "编辑费用设置" }).click();
  settings.costIncludePremium = true;
  await page.getByRole("button", { name: "保存费用设置" }).click();
  await expect(page.getByRole("alert")).toContainText("其他页面修改");
  expect(writes).toBe(0);
  delete settings.costIncludePremium;
  await page.route("**/api/me", (route) =>
    route.fulfill({ json: { logged_in: false } }),
  );
  await page.getByRole("button", { name: "保存费用设置" }).click();
  await expect(page.getByRole("alert")).toContainText("登录会话已失效");
  expect(writes).toBe(0);
});

test("cost editor preserves the draft after an HTTP save failure", async ({
  page,
}) => {
  await fixture(page, "official", { loggedIn: true });
  await page.route("**/api/admin/theme/settings?theme=nekomari-mint", (route) =>
    route.fulfill({ status: 500, json: { status: "error" } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "显示费用", exact: true }).click();
  await page.getByRole("button", { name: "费用与溢价设置" }).click();
  await page.getByRole("button", { name: "编辑费用设置" }).click();
  await page.getByLabel("vpsTaxi · 东京软银 溢价金额").fill("-20");
  await page.getByRole("button", { name: "保存费用设置" }).click();
  await expect(page.getByRole("alert")).toContainText("保存失败 (500)");
  await expect(page.getByLabel("vpsTaxi · 东京软银 溢价金额")).toHaveValue(
    "-20",
  );
});

test("private session revocation closes the cost panel and clears node names", async ({
  page,
}) => {
  await fixture(page, "nekomari", { loggedIn: true });
  await page.goto("/");
  await page.getByRole("button", { name: "显示费用", exact: true }).click();
  await page.getByRole("button", { name: "费用与溢价设置" }).click();
  await expect(page.getByRole("dialog", { name: "费用与溢价" })).toBeVisible();
  await fixture(page, "private");
  await expect(page.locator(".login-panel")).toBeVisible({ timeout: 12000 });
  await expect(page.locator(".cost-panel")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("vpsTaxi · 东京软银");
});

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

test("detail shows sourced CPU guidance and interactive latency lines, never card bars", async ({
  page,
}) => {
  await fixture(page, "nekomari", { cpuName: "Neoverse-N1", arch: "arm64" });
  await page.goto("/");
  await expect(page.locator(".node-card .history").first()).toBeVisible();
  await page
    .getByRole("button", { name: "节点详情", exact: true })
    .first()
    .click();
  const dialog = page.locator("dialog");
  await expect(dialog.getByLabel("处理器能力说明")).toContainText(
    "通用服务区间",
  );
  await expect(dialog.getByLabel("架构信息")).toContainText("Armv8.2-A");
  await expect(dialog.getByLabel("处理器能力说明")).toContainText(
    "非厂商评级或跑分",
  );
  await expect(dialog.getByRole("link", { name: /Arm 官方/ })).toHaveAttribute(
    "href",
    "https://www.arm.com/products/silicon-ip-cpu/neoverse/neoverse-n1",
  );
  await expect(dialog.locator(".history, .ping-row")).toHaveCount(0);
  await expect(
    dialog.getByRole("img", { name: /延迟折线图，3 条线路/ }),
  ).toBeVisible();
  await expect(dialog.locator(".latency-failures").first()).toHaveAttribute(
    "d",
    /M/,
  );
  await dialog.locator(".latency-legend button").first().click();
  await expect(
    dialog.getByRole("img", { name: /延迟折线图，2 条线路/ }),
  ).toBeVisible();
  const scrubber = dialog.getByLabel("线路采样时刻");
  await scrubber.focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowRight");
  await expect(dialog.locator(".latency-readout b").first()).toContainText(
    "ms",
  );
  await dialog
    .locator(".latency-legend button[aria-pressed=true]")
    .first()
    .click();
  await dialog
    .locator(".latency-legend button[aria-pressed=true]")
    .first()
    .click();
  await expect(
    dialog.getByText("已隐藏全部线路，点击图例恢复显示。"),
  ).toBeVisible();
  await dialog.locator(".latency-legend button").first().click();
  await page
    .getByLabel("切换深色模式")
    .evaluate((button: HTMLButtonElement) => button.click());
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
  }
  await dialog.locator(".cpu-insight").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/cpu-guide-mobile.png" });
  await dialog.locator(".latency-plot").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/latency-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await dialog
    .locator(".latency-legend button[aria-pressed=false]")
    .first()
    .click();
  await dialog.locator(".latency-plot").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/latency-desktop.png" });
});

test("unknown CPU stays unclassified, latency failures stay distinct across protocols and families", async ({
  page,
}) => {
  await fixture(page, "official", { cpuName: "AMD EPYC Processor" });
  await page.route("**/api/rpc2", async (route) => {
    const req = route.request().postDataJSON();
    if (req.method !== "public:getPingRecords") return route.fallback();
    const records = [
      { value: -1, ping_type: "icmp", family: "ipv4" },
      { value: 0, ping_type: "tcp", family: "ipv4" },
      { value: 15, ping_type: "tcp", family: "ipv6" },
      { value: 999, ping_type: "http", role: "reference" },
    ].map((r) => ({
      task_id: 1,
      time: new Date(Date.now() - 1000).toISOString(),
      ...r,
    }));
    await route.fulfill({
      json: { jsonrpc: "2.0", id: req.id, result: { records } },
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "节点详情", exact: true })
    .first()
    .click();
  const dialog = page.locator("dialog");
  await expect(dialog.getByLabel("处理器能力说明")).toContainText(
    "能力区间暂未归类",
  );
  await expect(dialog.getByLabel("处理器能力说明").locator("a")).toHaveCount(0);
  await expect(
    dialog.getByRole("img", { name: /延迟折线图，3 条线路/ }),
  ).toBeVisible();
  await expect(dialog.locator(".latency-legend")).toContainText("ICMP · IPV4");
  await expect(dialog.locator(".latency-legend")).toContainText("TCP · IPV6");
  const scrubber = dialog.getByLabel("线路采样时刻");
  await scrubber.focus();
  await page.keyboard.press("End");
  await expect(dialog.locator(".latency-readout")).toContainText("探测失败");
  await expect(dialog.locator(".latency-readout")).toContainText("0.0 ms");
  await expect(dialog.locator(".latency-readout")).not.toContainText("999");
  await page.route("**/api/rpc2", async (route) => {
    if (route.request().postDataJSON().method !== "public:getPingRecords")
      return route.fallback();
    await route.fulfill({ status: 503, json: { message: "Unavailable" } });
  });
  await dialog.getByRole("button", { name: "刷新", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("保留上次样本");
  await expect(dialog.getByRole("img", { name: /延迟折线图/ })).toBeVisible();
});

test("detail latency handles all-loss, empty and stale histories without implying success", async ({
  page,
}) => {
  await fixture(page);
  let mode: "loss" | "empty" | "stale" = "loss";
  await page.route("**/api/rpc2", async (route) => {
    const req = route.request().postDataJSON();
    if (req.method !== "public:getPingRecords") return route.fallback();
    const records =
      mode === "empty"
        ? []
        : [
            {
              task_id: 1,
              time: new Date(
                Date.now() - (mode === "stale" ? 600000 : 1000),
              ).toISOString(),
              value: mode === "loss" ? -1 : 12,
            },
          ];
    await route.fulfill({
      json: { jsonrpc: "2.0", id: req.id, result: { records } },
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "节点详情", exact: true })
    .first()
    .click();
  const dialog = page.locator("dialog");
  await expect(
    dialog.getByRole("img", { name: /延迟折线图，1 条线路/ }),
  ).toBeVisible();
  await expect(dialog.locator(".latency-legend")).toContainText("丢包 100.0%");
  await expect(dialog.locator(".latency-line")).toHaveCount(0);
  await expect(dialog.locator(".latency-failures")).toHaveAttribute("d", /M/);
  mode = "empty";
  await dialog.getByRole("button", { name: "刷新", exact: true }).click();
  await expect(dialog.getByText(/暂无历史。请在后台/)).toBeVisible();
  await expect(dialog.locator(".latency-plot")).toHaveCount(0);
  mode = "stale";
  await dialog.getByRole("button", { name: "刷新", exact: true }).click();
  await expect(dialog.locator(".latency-legend")).toContainText("样本过期");
  await expect(dialog.locator(".latency-line")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toHaveCount(0);
});
