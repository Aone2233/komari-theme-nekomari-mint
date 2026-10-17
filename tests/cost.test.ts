import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acquisitionTime,
  billingMonths,
  monthlyTotal,
  premiumSettings,
} from "../src/cost.ts";
import type { NodeInfo } from "../src/types.ts";

const now = Date.parse("2026-10-17T12:00:00Z");
const node = (extra: Partial<NodeInfo> = {}): NodeInfo => ({
  uuid: "one",
  name: "Node",
  price: 120,
  billing_cycle: 365,
  currency: "CNY",
  ...extra,
});
const settings = (premium: unknown, extra = {}) => ({
  costPremiums: JSON.stringify({ one: premium }),
  costIncludePremium: true,
  ...extra,
});
const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test("month, quarter, year, multi-year and custom billing share a monthly basis", () => {
  for (const [days, months] of [
    [30, 1],
    [31, 1],
    [92, 3],
    [182, 6],
    [365, 12],
    [730, 24],
    [1095, 36],
    [45, 1.5],
    [360, 12],
    [720, 24],
  ]) {
    close(billingMonths(days)!, months);
    close(
      monthlyTotal([node({ price: months * 10, billing_cycle: days })]).total,
      10,
    );
  }
  assert.equal(billingMonths("monthly"), 1);
  assert.equal(billingMonths("yearly"), 12);
  assert.equal(billingMonths("nonsense"), null);
  assert.equal(billingMonths(""), null);
  assert.equal(billingMonths(null), null);
});

test("CNY is fixed and currency aliases resolve without inventing rates", () => {
  const nodes = [
    node({ currency: "$" }),
    node({ uuid: "two", currency: " eur " }),
    node({ uuid: "three", currency: "人民币" }),
  ];
  const result = monthlyTotal(nodes, {
    exchangeRates: '{"USD":7,"€":8,"CNY":99,"RMB":66}',
  });
  assert.equal(result.total, 160);
  assert.equal(result.skipped, 0);
  assert.equal(monthlyTotal([node({ currency: "" })]).skipped, 1);
  assert.equal(monthlyTotal([node({ currency: "JPY" })]).skipped, 1);
  assert.equal(
    monthlyTotal([node({ currency: "$" })], {
      exchangeRates: '{"USD":7,"$":8}',
    }).total,
    80,
  );
});

test("invalid or missing financial inputs stay excluded and explain why", () => {
  const result = monthlyTotal(
    [
      node({ price: 0 }),
      node({ price: undefined }),
      node({ price: NaN }),
      node({ price: -2 }),
      node({ billing_cycle: 0 }),
      node({ billing_cycle: Infinity }),
      node({ currency: "USD" }),
    ],
    { exchangeRates: '{"USD":"7"}' },
  );
  assert.equal(result.included, 0);
  assert.equal(result.unpriced, 4);
  assert.equal(result.invalidCycle, 2);
  assert.equal(result.skipped, 1);
  assert.ok(result.warnings.length);
});

test("annual fee remains separate from one-time premium and signed monthly amortization", () => {
  const result = monthlyTotal(
    [node()],
    settings({ amount: 120, acquiredAt: "2026-10-01", months: 12 }),
    now,
  );
  assert.equal(result.recurring, 10);
  assert.equal(result.premium, 120);
  assert.equal(result.premiumMonthly, 10);
  assert.equal(result.effective, 20);
  assert.equal(result.total, 20);
  const base = monthlyTotal(
    [node()],
    settings(
      { amount: 120, acquiredAt: "2026-10-01", months: 12 },
      { costIncludePremium: false },
    ),
    now,
  );
  assert.equal(base.total, 10);
  const discount = monthlyTotal(
    [node()],
    settings({ amount: -120, acquiredAt: "2026-10-01", months: 6 }),
    now,
  );
  assert.equal(discount.premiumMonthly, -20);
  assert.equal(discount.total, -10);
});

test("missing dates and periods record premium without fabricating amortization", () => {
  for (const entry of [
    120,
    { amount: 120 },
    { amount: 120, months: 12 },
    { amount: 120, acquiredAt: "2026-10-01" },
  ]) {
    const result = monthlyTotal([node()], settings(entry), now);
    assert.equal(result.premium, 120);
    assert.equal(result.premiumMonthly, 0);
    assert.equal(result.pendingPremiums, 1);
  }
});

test("amortization is stable, UTC based, stops at exact end and ignores renewal dates", () => {
  const s = settings({ amount: 120, acquiredAt: "2026-10-01", months: 1 });
  const start = Date.parse("2026-10-01T00:00:00Z");
  assert.equal(monthlyTotal([node()], s, start - 1).premiumMonthly, 0);
  assert.equal(monthlyTotal([node()], s, start).premiumMonthly, 120);
  assert.equal(
    monthlyTotal([node()], s, start + 30 * 86400000 - 1).premiumMonthly,
    120,
  );
  assert.equal(
    monthlyTotal([node()], s, start + 30 * 86400000).premiumMonthly,
    0,
  );
  assert.equal(
    monthlyTotal([node({ expired_at: "2027-10-01" })], s, start + 30 * 86400000)
      .premiumMonthly,
    0,
  );
});

test("premiums do not depend on free, missing-price or missing-FX recurring charges", () => {
  for (const n of [
    node({ price: -1 }),
    node({ price: 0 }),
    node({ currency: "JPY" }),
    node({ billing_cycle: -1 }),
  ]) {
    const result = monthlyTotal(
      [n],
      settings({ amount: 120, acquiredAt: "2026-10-01", months: 12 }),
      now,
    );
    assert.equal(result.premium, 120);
    assert.equal(result.premiumMonthly, 10);
    assert.equal(result.total, 10);
  }
});

test("ignored nodes leave both recurring and premium aggregates, absent UUIDs never contribute", () => {
  const s = settings(
    { amount: 120, acquiredAt: "2026-10-01", months: 12 },
    { costIgnoredNodes: '["one"]' },
  );
  const r = monthlyTotal([node()], s, now);
  assert.equal(r.total, 0);
  assert.equal(r.premium, 0);
  assert.equal(r.ignored, 1);
  assert.equal(r.details[0].note, "已排除");
  assert.equal(
    monthlyTotal([node({ uuid: "other" })], settings(120), now).premium,
    0,
  );
});

test("malformed financial JSON never crashes or coerces booleans and null to money", () => {
  for (const v of [
    "oops",
    "[]",
    "null",
    '{"one":true}',
    '{"one":null}',
    '{"one":{"amount":"120"}}',
  ]) {
    const r = monthlyTotal([node()], { costPremiums: v }, now);
    assert.equal(r.premium, 0);
    assert.ok(r.warnings.length);
  }
  assert.equal(
    premiumSettings({ one: { amount: -50 } }).entries.one.amount,
    -50,
  );
  assert.equal(monthlyTotal([node()], { exchangeRates: "broken" }).total, 10);
  assert.equal(acquisitionTime("2026-02-30"), null);
  assert.equal(
    acquisitionTime("2024-02-29"),
    Date.parse("2024-02-29T00:00:00Z"),
  );
});

test("invalid premium dates and periods never create active monthly costs", () => {
  for (const p of [
    { amount: 120, acquiredAt: "bad", months: 12 },
    { amount: 120, acquiredAt: "2026-10-01", months: -1 },
    { amount: 120, acquiredAt: "2026-10-01", months: true },
  ]) {
    const r = monthlyTotal([node()], settings(p), now);
    assert.equal(r.premiumMonthly, 0);
    assert.ok(r.warnings.length);
  }
});
