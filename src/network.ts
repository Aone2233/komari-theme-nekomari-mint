import { parseTags } from "./enhancements";
import type { Extension, NodeInfo } from "./types";

const manualTypes = new Set([
  "家宽",
  "住宅",
  "住宅IP",
  "住宅 IP",
  "住宅网络",
  "住宅 / 商宽",
  "商宽",
  "商业宽带",
  "教育网",
  "校园网",
  "数据中心",
  "机房",
  "移动网络",
  "蜂窝网络",
]);
const unknownType =
  /^(?:网络类型未知|未知|未分类|unknown|unavailable|n\/?a|[-—])$/i;

export function networkEvidence(
  node: Pick<NodeInfo, "tags">,
  ip?: Extension["ip"] | null,
) {
  // Node tags express the administrator's intent, not a third-party verification.
  // Never classify from the node name, organization, ASN, route, speed or hypervisor.
  const manual = parseTags(node.tags).find((tag) =>
    manualTypes.has(tag.text),
  )?.text;
  const raw = ip?.network?.trim();
  const automatic = raw && !unknownType.test(raw) ? raw : null;
  const usable = automatic && !ip?.stale ? automatic : null;
  const label = manual || usable || "未分类";
  const basis = manual ? "管理员标签" : usable ? "网络摘要" : "未能确认";
  const reason = manual
    ? "使用节点中明确填写的网络类别标签；这是管理员标注，不代表第三方已验证住宅属性。"
    : usable
      ? "来自服务端网络摘要；供应商分类可能不完整，不是住宅或独享出口认证。"
      : ip?.stale
        ? "网络摘要已过期，暂不使用旧分类。"
        : raw && unknownType.test(raw)
          ? "旧版 Nekomari 只区分机房和移动网络，其余统一返回未知；此值无法区分分类未命中与分类源不可用，不能据此认定为住宅。"
          : "暂无可用的网络类型摘要；组织名称、线路和虚拟化方式不能作为住宅属性的依据。";
  return {
    label,
    basis,
    reason,
    manual: manual || null,
    automatic,
    stale: !!ip?.stale,
    unknown: !manual && !usable,
    title: `${label} · ${basis}。${reason}`,
  };
}
