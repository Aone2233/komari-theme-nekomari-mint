import { test } from "node:test";
import assert from "node:assert/strict";
import {
  carrierFor,
  historyBuckets,
  measured,
  monthlyTotal,
  percent,
  pingSeries,
  scores,
  traffic,
  unlockState,
  online,
  sumRates,
} from "../src/data.ts";
import type { PingRecord, PingTask } from "../src/types.ts";

const now = Date.now(),
  task: PingTask = {
    id: 1,
    name: "电信 上海",
    type: "dual",
    clients: ["node"],
  };
test("AI page reachability never claims working conversations", () => {
  assert.equal(
    unlockState({
      id: "gemini",
      name: "Gemini",
      kind: "ai",
      basis: "probe",
      status: "partial",
    }).label,
    "页面可达",
  );
  assert.equal(
    unlockState({
      id: "netflix",
      name: "Netflix",
      kind: "media",
      basis: "probe",
      status: "partial",
    }).label,
    "部分可用",
  );
});
const record = (value: number, extra = {}): PingRecord => ({
  task_id: 1,
  value,
  time: new Date(now - 1000).toISOString(),
  ...extra,
});
test("unknown values stay unknown while measured zero stays zero", () => {
  assert.equal(percent(null, 100), null);
  assert.equal(percent(0, 100), 0);
  assert.equal(
    measured({ client: "node", cpu: 0, quality: { cpu: "ok" } }, "cpu", "cpu"),
    0,
  );
  assert.equal(
    measured(
      { client: "node", cpu: 0, quality: { cpu: "unknown" } },
      "cpu",
      "cpu",
    ),
    null,
  );
});
test("dual protocols and reference targets must not be mixed", () => {
  const rows = pingSeries(
    [
      record(-1, { ping_type: "icmp" }),
      record(20, { ping_type: "tcp" }),
      record(1, { role: "reference", ping_type: "tcp" }),
    ],
    [task],
    "node",
  );
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.protocol === "tcp")!.loss, 0);
  assert.equal(rows.find((r) => r.protocol === "icmp")!.loss, 100);
  assert.equal(pingSeries([record(1)], [task], "different-node").length, 0);
});
test("latest failed probe must not reuse the last successful latency", () => {
  const rows = pingSeries(
    [record(30, { time: new Date(now - 5000).toISOString() }), record(-1)],
    [task],
    "node",
  );
  assert.equal(rows[0].latest, null);
  assert.equal(rows[0].loss, 50);
});
test("history buckets represent time, and gaps are not healthy samples", () => {
  const bins = historyBuckets(
    [record(20), record(-1, { time: new Date(now - 240_000).toISOString() })],
    30,
    now,
  );
  assert.equal(bins.at(-1), 20);
  assert.equal(bins.filter((v) => v === null).length, 28);
  assert.equal(bins.filter((v) => v === -1).length, 1);
});
test("no observations produce no score", () => {
  assert.equal(scores([]).overall, null);
});
test("stale and implausibly future reports are never online", () => {
  const status = {
    client: "node",
    online: true,
    time: new Date().toISOString(),
  };
  assert.equal(online(status), true);
  assert.equal(
    online({ ...status, time: new Date(Date.now() - 91_000).toISOString() }),
    false,
  );
  assert.equal(
    online({ ...status, time: new Date(Date.now() + 60_000).toISOString() }),
    false,
  );
});
test("address families and out-of-window ping records stay separate", () => {
  const rows = pingSeries(
    [
      record(10, { family: "ipv4" }),
      record(50, { family: "ipv6" }),
      record(999, { time: new Date(Date.now() - 3_700_000).toISOString() }),
      record(999, { time: new Date(Date.now() + 60_000).toISOString() }),
    ],
    [task],
    "node",
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.family).sort(), ["ipv4", "ipv6"]);
});
test("an unmeasured aggregate is not a measured zero", () => {
  assert.equal(sumRates([]).rx, null);
  const status = {
    client: "node",
    online: true,
    time: new Date().toISOString(),
    net_in: 0,
    net_out: 0,
  };
  assert.equal(sumRates([status]).rx, 0);
  assert.equal(
    sumRates([{ ...status, quality: { net_rate: "unknown" } }]).rx,
    null,
  );
});
test("region-only and stale evidence never imply an actual unlock", () => {
  const item = {
    id: "chatgpt",
    name: "ChatGPT",
    kind: "ai",
    status: "unlocked",
    basis: "region",
  };
  assert.equal(unlockState(item).label, "地区判断");
  assert.equal(unlockState(item, true).label, "已过期");
  assert.equal(unlockState({ ...item, status: "blocked" }).label, "地区受限");
  assert.equal(unlockState({ ...item, status: "unknown" }).label, "地区判断");
  assert.equal(unlockState({ ...item, basis: "unreviewed" }).tone, "muted");
  assert.equal(unlockState(undefined).label, "未检测");
});
test("kernel counters are not billing-cycle traffic", () => {
  const node = { uuid: "node", name: "Node", traffic_limit_type: "sum" };
  assert.equal(
    traffic({ client: "node", net_total_up: 200, net_total_down: 300 }, node)
      .value,
    null,
  );
  assert.equal(
    traffic({ client: "node", traffic_up: 0, traffic_down: 0 }, node).value,
    0,
  );
  assert.equal(
    traffic({ client: "node", traffic_up: 20, traffic_down: 30 }, node).value,
    50,
  );
});
test("missing exchange rates are excluded, not silently converted", () => {
  const nodes = [
    {
      uuid: "n",
      name: "USD node",
      price: 12,
      billing_cycle: 30,
      currency: "USD",
    },
  ];
  assert.equal(monthlyTotal(nodes).skipped, 1);
  assert.equal(monthlyTotal(nodes, { exchangeRates: '{"USD":7}' }).total, 84);
});
test("explicit carrier mapping overrides task-name recognition", () => {
  assert.equal(carrierFor(task), "telecom");
  assert.equal(carrierFor(task, { mobileTasks: [1] }), "mobile");
});

import { parseTags, duration, extensionMessage } from "../src/enhancements";
import { chartSegments } from "../src/chart";
test("tag markup is text with an allowlisted color, never HTML", () => {
  assert.equal(parseTags("CN2GIA<Blue>;生产<Green>")[0].text, "CN2GIA");
  assert.equal(parseTags("test<invalid>")[0].color, "#648370");
  assert.equal(duration(90061), "1 天 1 小时");
  assert.match(extensionMessage(null, false, true, false), /升级/);
});
test("charts preserve unknown and time gaps instead of connecting them", () => {
  const time = (n: number) => new Date(n).toISOString();
  const paths = chartSegments(
    [
      { time: time(1000), value: 2 },
      { time: time(2000), value: null },
      { time: time(3000), value: 4 },
      { time: time(9000), value: 5 },
    ],
    0,
    10000,
    10,
    2000,
  );
  assert.equal(paths.length, 3);
});
