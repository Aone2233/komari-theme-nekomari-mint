import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareSaoImport } from "../scripts/import-sao";
const input = () => ({
  sao: {
    costPremiums: {
      one: { amount: 33, paidCny: 55, acquiredAt: "2026-09-27" },
    },
    costIgnoredNodes: ["Node Two"],
    homepagePingBindings: { "3": ["one", "two"], "99": ["deleted"] },
  },
  mint: { headline: "Keep", telecomTasks: "[17]" } as Record<string, unknown>,
  nodes: [
    { uuid: "one", name: "Node One" },
    { uuid: "two", name: "Node Two" },
  ],
  tasks: [{ id: 3, name: "Main", type: "tcp", clients: ["one", "two"] }],
  rates: [
    { base: "USD", quote: "CNY", rate: 7, date: "2026-10-17" },
    { base: "USD", quote: "EUR", rate: 0.875, date: "2026-10-17" },
  ],
  rateSource: "https://api.frankfurter.dev/v2/rates?base=USD",
  acquisitionOffsetMinutes: 480,
});
test("SAO proposal keeps frozen values, exact UUID bindings, exclusions and inverse FX", () => {
  const data = input(),
    before = JSON.stringify(data),
    result = prepareSaoImport(data);
  assert.equal(JSON.stringify(data), before);
  assert.equal(result.importedPremiums, 1);
  assert.equal(result.importedBindings, 2);
  assert.deepEqual(JSON.parse(result.settings.costPremiums as string).one, {
    amount: 33,
    paidCny: 55,
    acquiredAt: "2026-09-27",
    amortization: "sao",
    acquiredOffsetMinutes: 480,
  });
  assert.deepEqual(JSON.parse(result.settings.exchangeRates as string), {
    CNY: 1,
    USD: 7,
    EUR: 8,
  });
  assert.equal(result.settings.headline, "Keep");
  assert.equal(result.settings.telecomTasks, "[17]");
  assert.deepEqual(JSON.parse(result.settings.costIgnoredNodes as string), [
    "two",
  ]);
  assert.deepEqual(JSON.parse(result.settings.primaryPingByNode as string), {
    one: 3,
    two: 3,
  });
});
test("SAO proposal refuses conflicting premiums, ambiguous exclusions and invalid rates", () => {
  const conflict = input();
  conflict.mint.costPremiums = '{"one":{"amount":1}}';
  assert.throws(() => prepareSaoImport(conflict), /conflicts/);
  const ambiguous = input();
  ambiguous.nodes[0].name = "Node Two";
  assert.throws(() => prepareSaoImport(ambiguous), /ambiguous/);
  const rates = input();
  rates.rates[1].rate = -1;
  assert.throws(() => prepareSaoImport(rates), /Inconsistent/);
  const meta = input();
  meta.acquisitionOffsetMinutes = 9999;
  assert.throws(() => prepareSaoImport(meta), /metadata/);
});
test("SAO proposal preserves Mint FX, totals choice and primary overrides without guessing deleted bindings", () => {
  const data = input();
  data.mint = {
    exchangeRates: '{"CNY":1,"USD":8}',
    costIncludePremium: false,
    primaryPingByNode: '{"one":10}',
  };
  data.tasks = [];
  const result = prepareSaoImport(data);
  assert.equal(result.settings.exchangeRates, data.mint.exchangeRates);
  assert.equal(result.settings.costIncludePremium, false);
  assert.deepEqual(JSON.parse(result.settings.primaryPingByNode as string), {
    one: 10,
  });
  assert.equal(result.warnings.length, 1);
});
test("SAO proposal does not mutate object settings or mix FX dates", () => {
  const data = input();
  data.mint = { costPremiums: {}, primaryPingByNode: {} };
  data.rates.push({ base: "USD", quote: "JPY", rate: 145, date: "2026-10-16" });
  const before = structuredClone(data);
  const result = prepareSaoImport(data);
  assert.deepEqual(data, before);
  assert.equal(
    JSON.parse(result.settings.exchangeRates as string).JPY,
    undefined,
  );
  Object.assign(data.nodes[0], {
    price: 100,
    currency: "JPY",
    billing_cycle: 30,
  });
  assert.throws(() => prepareSaoImport(data), /same-date/);
});
