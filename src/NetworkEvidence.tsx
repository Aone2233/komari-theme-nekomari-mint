import { networkEvidence } from "./network";
import type { Extension, NodeInfo } from "./types";

export default function NetworkEvidence({
  node,
  ip,
}: {
  node: NodeInfo;
  ip?: Extension["ip"] | null;
}) {
  const evidence = networkEvidence(node, ip);
  return (
    <details className="network-evidence" aria-label="网络类型依据">
      <summary>
        网络类型依据 · {evidence.label} <small>（{evidence.basis}）</small>
      </summary>
      <p>{evidence.reason}</p>
      <dl>
        <dt>管理员类别标签</dt>
        <dd>{evidence.manual || "未设置"}</dd>
        <dt>自动类型摘要</dt>
        <dd>
          {evidence.automatic || "未能确认"}
          {evidence.stale ? "（已过期，不用于分类）" : ""}
        </dd>
        <dt>网络组织</dt>
        <dd>
          {ip?.organization || "暂无摘要"}
          {evidence.stale && ip?.organization ? "（已过期）" : ""}
        </dd>
        <dt>组织资料来源</dt>
        <dd>{ip?.source || "未提供"}（不等于类型分类来源）</dd>
      </dl>
      <p>
        “未标记机房”不等于“住宅 IP”。旧版自动分类依赖 ip-api.com 的 hosting /
        mobile 标记， 两者均为 false
        时不会认证为家宽。教育网、家宽等手动标签和自动结果可以不同，二者分开保留。
      </p>
      <p>
        摘要查询面板保存的节点地址，优先 IPv4、缺省 IPv6，不一定是 NAT
        或代理后的真实业务出口。 CN2 / 9929 是线路信息，IPv6 是地址族，KVM / LXC
        是虚拟化方式，均不作为网络类型。
      </p>
    </details>
  );
}
