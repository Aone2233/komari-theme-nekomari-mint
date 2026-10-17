import { test } from "node:test";
import assert from "node:assert/strict";
import {
  customQueryHours,
  historyLimit,
  localDateInput,
  validateHistoryRange,
} from "../src/historyRange";

const hour = 3600000;
const now = new Date(2026, 9, 17, 12, 0).getTime();
test("history retention is bounded and unknown retention uses a conservative default", () => {
  for (const value of [undefined, null, "24", -1, 0, NaN, Infinity])
    assert.equal(historyLimit(value), 168);
  assert.equal(historyLimit(24), 24);
  assert.equal(historyLimit(20000), 8784);
});
test("custom dates round-trip in browser-local time and query lookback, not just duration", () => {
  const start = now - 30 * hour,
    end = now - 24 * hour;
  const checked = validateHistoryRange(
    localDateInput(start),
    localDateInput(end),
    168,
    now,
  );
  assert.deepEqual(checked, { range: { start, end }, error: "" });
  assert.equal(customQueryHours(checked.range!, 168, now), 30);
  assert.equal(
    customQueryHours({ start: now - hour / 2, end: now }, 168, now),
    1,
  );
  assert.equal(customQueryHours({ start: start - 1, end }, 168, now), 31);
});
test("custom dates reject impossible, reversed, future and beyond-retention ranges", () => {
  const from = localDateInput(now - hour),
    to = localDateInput(now);
  for (const [start, end] of [
    ["2026-02-30T01:00", to],
    ["2026-10-17T25:00", to],
    ["invalid", to],
    [to, from],
    [to, to],
    [from, localDateInput(now + hour)],
    [localDateInput(now - 25 * hour), to],
  ]) {
    assert.equal(validateHistoryRange(start, end, 24, now).range, null);
  }
  assert.ok(
    validateHistoryRange(localDateInput(now - 24 * hour), to, 24, now).range,
  );
  for (const range of [
    { start: now, end: now },
    { start: NaN, end: now },
    { start: now - hour, end: now + 1 },
    { start: now - 25 * hour, end: now },
  ])
    assert.throws(() => customQueryHours(range, 24, now));
});
