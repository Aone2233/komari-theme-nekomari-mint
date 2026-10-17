import { test } from "node:test";
import assert from "node:assert/strict";
import { cpuProfile } from "../src/cpu";
import { nearestPing, pingGapMs } from "../src/latency";
import { chartSegments } from "../src/chart";

test("N1 identifies architecture, not an invented host SKU or clock", () => {
  const profile = cpuProfile("Neoverse-N1")!;
  assert.equal(profile.scope, "架构信息");
  assert.match(profile.specs.join(" "), /Armv8.2-A/);
  assert.doesNotMatch(profile.specs.join(" "), /GHz|Altra|128/);
  assert.match(profile.source.url, /^https:\/\/www.arm.com\//);
});
test("exact models match suffix-safe and never guess OEM or masked CPUs", () => {
  for (const name of [
    "AMD EPYC 9275F 24-Core Processor",
    "Intel(R) Core(TM) Ultra 7 265K",
    "Intel(R) Xeon(R) Gold 6138 CPU @ 2.00GHz",
    "Intel(R) Core(TM) i5-6200U CPU @ 2.30GHz",
    "Intel(R) Xeon(R) CPU E3-1270 v6 @ 3.80GHz",
    "AMD EPYC 7B13",
  ]) {
    assert.equal(cpuProfile(name)?.scope, "型号规格", name);
  }
  for (const name of [
    undefined,
    "",
    "AMD EPYC Processor",
    "AMD EPYC 7A23",
    "Intel Xeon Platinum 8374C",
    "Intel Core Ultra 7 265KF",
    "Intel Xeon Gold 61380",
    "QEMU Virtual CPU",
  ]) {
    assert.equal(cpuProfile(name), null, name);
  }
  assert.equal(cpuProfile("AMD EPYC-Genoa Processor")?.scope, "架构信息");
  assert.match(cpuProfile("Intel Core Ultra 7 265K")!.source.url, /241063/);
});
test("latency cursor keeps zero, failures and missing timestamps distinct", () => {
  const records = [
    { task_id: 1, time: new Date(1000).toISOString(), value: 0 },
    { task_id: 1, time: new Date(3000).toISOString(), value: -1 },
  ];
  assert.equal(nearestPing(records, 1100, 500)?.value, 0);
  assert.equal(nearestPing(records, 2900, 500)?.value, -1);
  assert.equal(nearestPing(records, 2000, 500), null);
  assert.equal(nearestPing([], 0, 500), null);
  assert.equal(pingGapMs(10), 25000);
  assert.equal(pingGapMs(300), 750000);
  assert.equal(pingGapMs(NaN), 150000);
});
test("latency paths break on packet loss and missing intervals without dropping zero", () => {
  const points = [
    { time: new Date(1000).toISOString(), value: 0 },
    { time: new Date(2000).toISOString(), value: -1 },
    { time: new Date(3000).toISOString(), value: 10 },
    { time: new Date(20000).toISOString(), value: 20 },
  ];
  const paths = chartSegments(points, 0, 30000, 30, 5000);
  assert.equal(paths.length, 3);
  assert.match(paths[0], /,89\.0/);
  assert.equal(
    chartSegments(
      points.filter((p) => p.value < 0),
      0,
      30000,
      30,
      5000,
    ).length,
    0,
  );
});

test("minute-aligned history rollups do not look like sub-minute outages", () => {
  const records = [0, 60000, 120000, 600000].map((time) => ({
    task_id: 1,
    time: new Date(time).toISOString(),
    value: 10,
  }));
  assert.equal(pingGapMs(15, records), 150000);
  assert.equal(
    chartSegments(records, 0, 700000, 20, pingGapMs(15, records)).length,
    2,
  );
  assert.equal(
    pingGapMs(
      15,
      records.map((r) => ({
        ...r,
        time: new Date(Date.parse(r.time) + 1000).toISOString(),
      })),
    ),
    37500,
  );
});
test("long-range rollup grids connect consecutive buckets but never bridge sparse or off-grid history", () => {
  const records = [0, 300000, 600000, 3600000].map((time) => ({
    task_id: 1,
    time: new Date(time).toISOString(),
    value: 10,
  }));
  assert.equal(pingGapMs(60, records), 150000);
  assert.equal(pingGapMs(60, records, 24), 750000);
  assert.equal(
    chartSegments(records, 0, 3700000, 20, pingGapMs(60, records, 24)).length,
    2,
  );
  assert.equal(
    pingGapMs(
      60,
      records.filter((_, i) => i !== 1),
      24,
    ),
    150000,
  );
  assert.equal(
    pingGapMs(
      60,
      records.map((r) => ({
        ...r,
        time: new Date(Date.parse(r.time) + 60000).toISOString(),
      })),
      24,
    ),
    150000,
  );
  const hourly = [0, 3600000, 7200000].map((time) => ({
    task_id: 1,
    time: new Date(time).toISOString(),
    value: 10,
  }));
  assert.equal(pingGapMs(60, hourly, 24), 9000000);
});
