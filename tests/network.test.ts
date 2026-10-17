import { test } from "node:test";
import assert from "node:assert/strict";
import { networkEvidence } from "../src/network";

const summary = (network: string, extra = {}) => ({
  network,
  organization: "Example ISP",
  source: "ipwho.is",
  country: "US",
  ...extra,
});

test("manual network category survives a legacy unknown, regardless of tag order", () => {
  const evidence = networkEvidence(
    { tags: "1Gbps;家宽<Green>;9929" },
    summary("网络类型未知"),
  );
  assert.equal(evidence.label, "家宽");
  assert.equal(evidence.basis, "管理员标签");
  assert.equal(evidence.unknown, false);
  assert.match(evidence.title, /不代表第三方已验证/);
  assert.equal(
    networkEvidence({ tags: "监控;教育网" }, summary("网络类型未知")).label,
    "教育网",
  );
});
test("explicit administrator categories and conflicting automatic evidence stay separate", () => {
  const evidence = networkEvidence({ tags: "教育网" }, summary("数据中心"));
  assert.equal(evidence.label, "教育网");
  assert.equal(evidence.manual, "教育网");
  assert.equal(evidence.automatic, "数据中心");
  assert.equal(
    networkEvidence({ tags: "家宽" }, summary("数据中心", { stale: true }))
      .label,
    "家宽",
  );
});
test("unknown network results never infer residential status from an ISP name", () => {
  for (const organization of [
    "Hytron Network Services Limited",
    "NetLab Global",
    "AT&T Enterprises, LLC",
    "China Education and Research Network",
    "SoftBank",
  ]) {
    const evidence = networkEvidence(
      { tags: "IPv6;9929;300Mbps;KVM;LAX" },
      summary("网络类型未知", { organization }),
    );
    assert.equal(evidence.label, "未分类", organization);
    assert.equal(evidence.unknown, true);
    assert.match(evidence.reason, /无法区分分类未命中与分类源不可用/);
  }
  for (const network of [
    "",
    " unknown ",
    "Unknown",
    "网络类型未知",
    "—",
    "N/A",
    "unavailable",
  ]) {
    assert.equal(networkEvidence({}, summary(network)).label, "未分类");
  }
});
test("fresh automatic evidence is used, stale types never leak into the displayed category", () => {
  for (const type of ["数据中心", "移动网络", "住宅 / 商宽"]) {
    assert.equal(networkEvidence({}, summary(type)).label, type);
    const stale = networkEvidence({}, summary(type, { stale: true }));
    assert.equal(stale.label, "未分类");
    assert.equal(stale.automatic, type);
    assert.equal(stale.stale, true);
  }
});
test("official or unavailable summaries still preserve manual labels without fake fallbacks", () => {
  for (const ip of [null, undefined]) {
    assert.equal(networkEvidence({ tags: "家宽" }, ip).label, "家宽");
    assert.equal(
      networkEvidence({ tags: "IPv6;独服;原生IP;软银线路;vps.taxi" }, ip).label,
      "未分类",
    );
  }
  assert.equal(
    networkEvidence({ tags: "伪家宽;非住宅;移动回程;教育网线路" }).label,
    "未分类",
  );
});
