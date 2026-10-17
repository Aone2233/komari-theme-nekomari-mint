import { test } from "node:test";
import assert from "node:assert/strict";
import { primaryPing } from "../src/primaryPing";
import { pingSeries } from "../src/data";
import type { PingTask, PingRecord } from "../src/types";
const tasks: PingTask[] = [
  { id: 1, name: "电信", type: "icmp", clients: ["n"] },
  { id: 3, name: "教育网", type: "tcp", clients: ["n"] },
  { id: 10, name: "Cloudflare IPv6", type: "tcp", clients: ["n"] },
];
const record = (task_id: number, value: number, extra = {}): PingRecord => ({
  task_id,
  value,
  time: new Date(Date.now() - 1000).toISOString(),
  ...extra,
});
const rows = (records: PingRecord[]) => pingSeries(records, tasks, "n");
test("explicit primary task stays selected on loss, missing samples and unassigned task", () => {
  const settings = { primaryPingByNode: '{"n":3}' };
  const failed = primaryPing(
    "n",
    tasks,
    rows([record(3, -1), record(10, 1)]),
    settings,
  );
  assert.equal(failed.task?.id, 3);
  assert.equal(failed.series?.latest, null);
  const empty = primaryPing("n", tasks, rows([record(10, 1)]), settings);
  assert.equal(empty.task?.id, 3);
  assert.equal(empty.series, undefined);
  const invalid = primaryPing("n", tasks, rows([record(10, 1)]), {
    primaryPingByNode: { n: 99 },
  });
  assert.equal(invalid.missing, true);
  assert.equal(invalid.series, undefined);
  assert.equal(
    primaryPing("different", tasks, [], { primaryPingByNode: { different: 3 } })
      .missing,
    true,
  );
});
test("priority selector supports managed read/write shapes and per-node precedence", () => {
  for (const value of [[10, 3], "[10,3]"]) {
    assert.equal(
      primaryPing("n", tasks, [], { primaryPingTasks: value }).task?.id,
      10,
    );
    assert.equal(
      primaryPing("n", tasks, [], {
        primaryPingTasks: value,
        primaryPingByNode: { n: 3 },
      }).task?.id,
      3,
    );
  }
  assert.equal(
    primaryPing("n", tasks, [], { primaryPingTasks: [99, 3] }).task?.id,
    3,
  );
});
test("automatic selection is stable, not fastest/healthy, and dual protocol families stay separate", () => {
  const all = rows([
    record(3, -1, { ping_type: "tcp", family: "ipv4" }),
    record(3, 1, { ping_type: "icmp", family: "ipv4" }),
    record(3, 2, { ping_type: "tcp", family: "ipv6" }),
    record(10, 0),
  ]);
  const chosen = primaryPing("n", tasks, all);
  assert.equal(chosen.task?.id, 3);
  assert.equal(chosen.series?.protocol, "tcp");
  assert.equal(chosen.series?.family, "ipv4");
  assert.equal(chosen.series?.latest, null);
  assert.equal(primaryPing("n", [...tasks].reverse(), all).task?.id, 3);
  assert.equal(
    primaryPing("n", tasks, all, {
      primaryPingByNode: "invalid",
      primaryPingTasks: "invalid",
    }).task?.id,
    3,
  );
  assert.equal(primaryPing("n", [], []).task, undefined);
});
