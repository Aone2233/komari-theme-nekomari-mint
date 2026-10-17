import { test } from "node:test";
import assert from "node:assert/strict";
import { pingSeries, scores } from "../src/data";
import { failureLabel, pingSummary, qualifiedPingSeries } from "../src/latency";
import type { PingRecord } from "../src/types";

const now = Date.now();
const task = { id: 1, name: "Test", type: "tcp", clients: ["n"] };
const records = (count: number, age = 1000, value = 20): PingRecord[] =>
  Array.from({ length: count }, (_, i) => ({
    task_id: 1,
    value,
    time: new Date(now - age - (count - i - 1) * 60000).toISOString(),
  }));
test("ratings require 30 returned records per fresh series without erasing failures", () => {
  const insufficient = pingSeries(records(29, 1000, -1), [task], "n");
  assert.equal(insufficient[0].failures, 29);
  assert.deepEqual(qualifiedPingSeries(insufficient, now), []);
  assert.equal(scores(qualifiedPingSeries(insufficient, now)).overall, null);
  const sufficient = qualifiedPingSeries(
    pingSeries(records(30), [task], "n"),
    now,
  );
  assert.equal(sufficient.length, 1);
  assert.equal(scores(sufficient).stability, 100);
  const failed = qualifiedPingSeries(
    pingSeries(records(30, 1000, -1), [task], "n"),
    now,
  );
  assert.equal(scores(failed).stability, 0);
  assert.equal(scores(failed).overall, null);
  assert.equal(
    qualifiedPingSeries(pingSeries(records(30, 300001), [task], "n"), now)
      .length,
    0,
  );
});
test("invalid, empty or implausibly future latest records never qualify", () => {
  const row = pingSeries(records(30), [task], "n")[0];
  assert.equal(qualifiedPingSeries([{ ...row, records: [] }], now).length, 0);
  for (const time of ["invalid", new Date(now + 60000).toISOString()]) {
    assert.equal(
      qualifiedPingSeries(
        [{ ...row, records: [{ ...row.records[0], time }] }],
        now,
      ).length,
      0,
    );
  }
});
test("statistics preserve zero, failures and actual timestamps without inventing coverage", () => {
  const input = records(5).map((r, i) => ({
    ...r,
    value: [0, 10, -1, 20, 100][i],
  }));
  const summary = pingSummary(input.slice().reverse());
  assert.equal(summary.min, 0);
  assert.equal(summary.max, 100);
  assert.equal(summary.average, 32.5);
  assert.ok(Math.abs(summary.p95! - 88) < 1e-10);
  assert.equal(summary.success, 4);
  assert.equal(summary.first, Date.parse(input[0].time));
  assert.equal(summary.last, Date.parse(input.at(-1)!.time));
  const failed = pingSummary(records(3, 1000, -1));
  assert.equal(failed.min, null);
  assert.equal(failed.average, null);
  assert.equal(failed.p95, null);
  assert.equal(failed.success, 0);
  assert.equal(pingSummary([]).first, null);
  assert.equal(pingSummary([{ ...input[0], value: Infinity }]).max, null);
});
test("failure terminology is protocol-specific, not a general packet-loss claim", () => {
  assert.equal(failureLabel("icmp"), "丢包率");
  assert.equal(failureLabel("tcp"), "连接失败率");
  assert.equal(failureLabel("http"), "请求失败率");
  assert.equal(failureLabel("dual"), "探测失败率");
});
