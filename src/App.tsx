import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Database,
  ExternalLink,
  Leaf,
  LoaderCircle,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Wifi,
  X,
} from "lucide-react";
import {
  ApiError,
  loadExtension,
  loadOverview,
  loadPings,
  rpc,
  isPrivateError,
} from "./api";
import {
  bytes,
  carriers,
  historyBuckets,
  measured,
  monthlyTotal,
  online,
  percent,
  pingSeries,
  scores,
  traffic,
  unlockState,
  sumRates,
} from "./data";
import type {
  Extension,
  LiveStatus,
  NodeInfo,
  PingRecord,
  PingSeries,
  PingTask,
  Site,
} from "./types";

import {
  parseTags,
  duration,
  extensionMessage,
  healthyConnections,
} from "./enhancements";
import CpuInsight from "./CpuInsight";
import NetworkEvidence from "./NetworkEvidence";
import { networkEvidence } from "./network";
import { primaryPing } from "./primaryPing";
import { failureLabel, MIN_PING_SAMPLES, qualifiedPingSeries } from "./latency";
import ColorModeSwitch from "./ColorModeSwitch";
type DetailSection = "overview" | "resources" | "latency" | "evidence";
const detailSections = [
  ["overview", "概览"],
  ["resources", "资源历史"],
  ["latency", "线路观测"],
  ["evidence", "检测依据"],
] as const;
const History = lazy(() => import("./History"));
const LatencyHistory = lazy(() => import("./LatencyHistory"));
const CostPanel = lazy(() => import("./CostPanel"));

const services = [
  ["chatgpt", "ChatGPT"],
  ["claude", "Claude"],
  ["gemini", "Gemini"],
  ["netflix", "Netflix"],
  ["youtube", "YouTube"],
];
const regionNames = new Intl.DisplayNames(["zh-CN"], { type: "region" });
function regionName(value = "") {
  if (!value) return "地区未知";
  const points = [...value];
  const code =
    points.length === 2 &&
    points.every(
      (p) => p.codePointAt(0)! >= 0x1f1e6 && p.codePointAt(0)! <= 0x1f1ff,
    )
      ? points
          .map((p) => String.fromCharCode(p.codePointAt(0)! - 0x1f1e6 + 65))
          .join("")
      : value;
  try {
    return /^[A-Z]{2}$/.test(code) ? regionNames.of(code) : value;
  } catch {
    return value;
  }
}
function Metric({ name, value }: { name: string; value: number | null }) {
  return (
    <div className="metric">
      <div>
        <span>{name}</span>
        <b>{value === null ? "—" : `${Math.round(value)}%`}</b>
      </div>
      <div className="meter">
        <i
          className={value !== null && value >= 90 ? "hot" : ""}
          style={{ width: `${value ?? 0}%` }}
        />
      </div>
    </div>
  );
}
function PingLine({ series, name }: { series?: PingSeries; name: string }) {
  const buckets = historyBuckets(series?.records || []);
  return (
    <div
      className="ping-row"
      title={
        series
          ? `${series.name} · ${series.protocol.toUpperCase()} · 近 1 小时 ${series.total} 个样本`
          : `${name}未配置任务或尚无样本`
      }
    >
      <span className="carrier">
        {name}
        <small>
          {series
            ? `${series.protocol.toUpperCase()}${series.family ? ` · ${series.family.toUpperCase()}` : ""}`
            : "未检测"}
        </small>
      </span>
      <span className="latency">
        <b>
          {!series ||
          Date.now() - Date.parse(series.records.at(-1)!.time) > 300_000 ||
          series.latest == null
            ? "—"
            : series.latest}
        </b>
        {series?.latest != null &&
          Date.now() - Date.parse(series.records.at(-1)!.time) <= 300_000 && (
            <small>ms</small>
          )}
      </span>
      <div className="history" aria-label={`${name}近一小时延迟历史`}>
        {buckets.map((v, i) => (
          <i
            key={i}
            className={
              v === null ? "unknown" : v < 0 ? "lost" : v > 250 ? "slow" : "ok"
            }
            title={
              v === null
                ? "该时段无样本"
                : v < 0
                  ? "该时段有失败样本"
                  : `${v} ms`
            }
          />
        ))}
      </div>
      <span className="loss" title={failureLabel(series?.protocol)}>
        {series?.loss == null ? "—" : `${series.loss.toFixed(1)}%`}
      </span>
    </div>
  );
}
function NodeCard({
  node,
  live,
  tasks,
  settings,
  index,
  hideCosts,
  onOpen,
}: {
  node: NodeInfo;
  live?: LiveStatus;
  tasks: PingTask[];
  settings?: Site["theme_settings"];
  index: number;
  hideCosts: boolean;
  onOpen: (
    node: NodeInfo,
    records: PingRecord[],
    ext: Extension | null,
    section?: DetailSection,
  ) => void;
}) {
  const [records, setRecords] = useState<PingRecord[]>([]);
  const [extension, setExtension] = useState<Extension | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [extError, setExtError] = useState(false);
  const [extLoading, setExtLoading] = useState(true);
  const cardRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setVisible(true);
      },
      { rootMargin: "150px" },
    );
    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    if (settings?.showExtensions === false) setExtension(null);
    else setExtLoading(true);
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      if (!document.hidden) {
        await Promise.all([
          (async () => {
            try {
              const data = await loadPings(node.uuid);
              if (!stopped) {
                setRecords(data);
                setHistoryError(false);
              }
            } catch {
              if (!stopped) setHistoryError(true);
            }
          })(),
          (async () => {
            if (settings?.showExtensions === false) return;
            try {
              const data = await loadExtension(node.uuid);
              if (!stopped) {
                setExtension(data);
                setExtError(false);
              }
            } catch {
              if (!stopped) {
                setExtError(true);
                setExtension(null);
              }
            } finally {
              if (!stopped) setExtLoading(false);
            }
          })(),
        ]);
      }
      if (!stopped) timer = setTimeout(refresh, 60_000);
    }
    timer = setTimeout(refresh, index * 120);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [node.uuid, visible, index, settings?.showExtensions]);
  const isOnline = online(live);
  const series = pingSeries(records, tasks, node.uuid, settings);
  const primary = primaryPing(node.uuid, tasks, series, settings);
  const failures = series.reduce((sum, s) => sum + s.failures, 0),
    total = series.reduce((sum, s) => sum + s.total, 0);
  const bill = traffic(live, node);
  const days =
    node.expired_at && Date.parse(node.expired_at) > 0
      ? Math.ceil((Date.parse(node.expired_at) - Date.now()) / 86_400_000)
      : null;
  const tags = parseTags(node.tags);
  const network = networkEvidence(node, extension?.ip);
  const extensionNote = extensionMessage(
    extension,
    extError,
    settings?.showExtensions !== false,
    extLoading,
  );
  const recentPing = series.some(
    (s) =>
      s.records.at(-1) &&
      Date.now() - Date.parse(s.records.at(-1)!.time) < 300_000,
  );
  const qualified = qualifiedPingSeries(series);
  const qualifiedTotal = qualified.reduce((sum, row) => sum + row.total, 0);
  const qualifiedFailures = qualified.reduce(
    (sum, row) => sum + row.failures,
    0,
  );
  const score = scores(historyError ? [] : qualified);
  const statusLabel = !isOnline
    ? "离线"
    : historyError
      ? "数据异常"
      : !recentPing
        ? "待检测"
        : !qualified.length
          ? "采集中"
          : qualifiedFailures / qualifiedTotal > 0.05
            ? "需留意"
            : "良好";
  const cpu = isOnline ? measured(live, "cpu", "cpu") : null;
  const ram = isOnline
    ? percent(measured(live, "ram", "ram"), live?.ram_total ?? node.mem_total)
    : null;
  const disk = isOnline
    ? percent(
        measured(live, "disk", "disk"),
        live?.disk_total ?? node.disk_total,
      )
    : null;
  const unlock = extension?.unlock;
  return (
    <article
      ref={cardRef}
      className={`node-card ${!isOnline ? "offline" : ""}`}
      style={{ "--delay": `${Math.min(index, 5) * 70}ms` } as CSSProperties}
    >
      <div className="card-head">
        <button
          className="node-title"
          onClick={() => onOpen(node, records, extension)}
        >
          <i className={`status-dot ${isOnline ? "up" : ""}`} />
          <h2 title={node.name}>{node.name}</h2>
        </button>
        <div className="card-rating">
          <button
            className="grade"
            onClick={() => onOpen(node, records, extension)}
            title={`Mint 观测分：稳定性 70% + 延迟 30%；${qualified.length}/${series.length} 条线路达到至少 30 个返回样本且最新样本在五分钟内；不是 IP 信誉评分`}
          >
            <span>
              {score.overall === null
                ? "·"
                : score.overall >= 90
                  ? "A"
                  : score.overall >= 75
                    ? "B"
                    : "C"}
            </span>
            {score.overall ?? "—"}
          </button>
          <span
            className={`health ${!isOnline ? "muted" : statusLabel === "良好" ? "good" : "warn"}`}
          >
            {statusLabel}
          </span>
        </div>
      </div>
      <div className="node-meta">
        <b>{regionName(node.region)}</b>
        <span
          className={`network-tag ${network.unknown ? "unclassified" : ""}`}
          title={network.title}
        >
          {network.label}
          {network.manual && <small> · 手动</small>}
        </span>
        <span
          className="operator"
          title={
            (!extension?.ip?.stale ? extension?.ip?.organization : undefined) ||
            node.group
          }
        >
          {(!extension?.ip?.stale ? extension?.ip?.organization : undefined) ||
            node.group ||
            "独立节点"}
        </span>
      </div>
      {!!tags.length && (
        <div className="node-tags">
          {tags.map((tag, i) => (
            <span key={i} style={{ "--tag-color": tag.color } as CSSProperties}>
              {tag.text}
            </span>
          ))}
        </div>
      )}
      <div className="score-row">
        <span title="仅对达标且新鲜的线路计算：延迟分 = max(0, 100 − 各线路中位延迟 / 5)">
          线路 <b>{score.latency ?? "—"}</b>
        </span>
        <span title="仅对达标且新鲜的线路计算：稳定分 = 成功样本数 / 全部样本数 × 100">
          稳定 <b className="green">{score.stability ?? "—"}</b>
        </span>
        <span title="仅实际探测，不将地区政策判断算作实测可用">
          实测{" "}
          <b className="green">
            {unlock && !unlock.stale
              ? unlock.results.filter(
                  (r) =>
                    r.basis === "probe" &&
                    ["ok", "unlocked"].includes(r.status),
                ).length
              : "—"}
            <small>{unlock && !unlock.stale ? "项" : ""}</small>
          </b>
        </span>
        <span title="未接入独立 IP 信誉数据库，不生成伪评分">
          IP <b>—</b>
        </span>
      </div>
      <div className={`path-status ${historyError ? "warning" : ""}`}>
        <i
          className={`status-dot ${qualified.length > 0 && !historyError && qualifiedFailures === 0 ? "up" : "pending"}`}
        />
        <strong>
          {historyError
            ? "延迟历史读取失败"
            : !total
              ? "等待线路检测"
              : !recentPing
                ? "线路样本已过期"
                : !qualified.length
                  ? `采集中 · 至少 ${MIN_PING_SAMPLES} 个样本后评级`
                  : qualifiedFailures
                    ? "达标线路存在波动"
                    : "达标线路样本稳定"}
        </strong>
        <span>
          近 1 小时 {total ? `失败 ${failures} / ${total}` : "暂无样本"}
        </span>
      </div>
      <div className="ping-table primary-ping">
        <div className="ping-caption">
          <span>主线路延迟</span>
          <span>
            近 1 小时 ·{" "}
            {failureLabel(primary.series?.protocol || primary.task?.type)}
          </span>
        </div>
        <PingLine
          name={
            primary.task?.name ||
            (primary.missing ? "主线路未分配" : "暂无主线路")
          }
          series={primary.series}
        />
        <button
          className="all-lines-button"
          onClick={() => onOpen(node, records, extension, "latency")}
        >
          查看全部线路{series.length ? `（${series.length}）` : ""}{" "}
          <ArrowUpRight size={12} />
        </button>
      </div>
      <div className="routes">
        <span>回程</span>
        <div>
          {(Object.keys(carriers) as (keyof typeof carriers)[]).map(
            (carrier) => {
              const route = extension?.routes?.results.find(
                (r) => r.carrier === carrier,
              );
              return (
                <span
                  className={`route-tag ${route?.label && !extension?.routes?.stale ? "" : "muted"}`}
                  key={carrier}
                  title={
                    route
                      ? `${route.target} · ${route.reached ? "已到达" : "未到达"} · ${route.error || ""}`
                      : "需要配置 Agent 回程探测目标"
                  }
                >
                  {carriers[carrier]}{" "}
                  {extension?.routes?.stale
                    ? "过期"
                    : route?.label ||
                      (route
                        ? route.error
                          ? "检测失败"
                          : route.reached
                            ? "未识别"
                            : "未到达"
                        : settings?.showExtensions === false
                          ? "已关闭"
                          : extLoading
                            ? "读取中"
                            : extError
                              ? "读取失败"
                              : !extension
                                ? "待升级"
                                : "未配置")}
                </span>
              );
            },
          )}
        </div>
        <span
          className="retrans"
          title="Linux 内核 TCP 重传段数 / 发出段数的采样区间比例；不是单条线路丢包率"
        >
          重传{" "}
          <b>
            {isOnline && live?.tcp_retrans_percent != null
              ? `${live.tcp_retrans_percent.toFixed(1)}%`
              : "—"}
          </b>
        </span>
      </div>
      <p
        className={`extension-note ${extError ? "warning" : ""}`}
        title={extensionNote}
      >
        {extensionNote}
      </p>
      <div className="services">
        {services.map(([id, name]) => {
          const item = unlock?.results.find(
            (r) =>
              r.id === id || (id === "youtube" && r.id.startsWith("youtube")),
          );
          const state = item
            ? unlockState(item, unlock?.stale || extError)
            : {
                label:
                  settings?.showExtensions === false
                    ? "已关闭"
                    : extLoading
                      ? "读取中"
                      : extError
                        ? "读取失败"
                        : !extension
                          ? "待升级"
                          : id === "gemini"
                            ? "未接入"
                            : "未上报",
                tone: "muted",
              };
          return (
            <span
              className={`service ${state.tone}`}
              key={id}
              title={`${name}：${state.label}${item?.detail ? ` · ${item.detail}` : ""}`}
            >
              <span>{name}</span>
              <small>{state.label}</small>
            </span>
          );
        })}
      </div>
      <div className="metrics">
        <Metric name="CPU" value={cpu} />
        <Metric name="内存" value={ram} />
        <Metric name="磁盘" value={disk} />
      </div>
      <div className="node-runtime">
        <span>运行 {duration(isOnline ? live?.uptime : null)}</span>
        <span>连接 {isOnline ? (healthyConnections(live) ?? "—") : "—"}</span>
        {!hideCosts && node.price != null && node.price > 0 && (
          <span>
            {node.currency} {node.price} / {node.billing_cycle}天
          </span>
        )}
      </div>
      <div className="card-bottom">
        <div className="network-rates">
          <span className="download">
            <ArrowDown size={16} />
            {bytes(
              isOnline ? measured(live, "net_in", "net_rate") : null,
              true,
            )}
          </span>
          <span className="upload">
            <ArrowUp size={16} />
            {bytes(
              isOnline ? measured(live, "net_out", "net_rate") : null,
              true,
            )}
          </span>
        </div>
        <div className="traffic" title={bill.basis}>
          {bill.value === null ? (
            <span>
              本期 <b>未上报</b>
            </span>
          ) : (
            <span>
              本期 <b>{bytes(bill.value)}</b> /{" "}
              {node.traffic_limit ? bytes(node.traffic_limit) : "不限量"}
            </span>
          )}
        </div>
      </div>
      <div className="card-foot">
        <span className={days !== null && days < 14 ? "expiry soon" : "expiry"}>
          <Clock3 size={13} />
          {days === null ? (
            "未设置到期"
          ) : days < 0 ? (
            `已到期 ${Math.abs(days)} 天`
          ) : (
            <>
              续费 <b>{days}</b> 天
            </>
          )}
        </span>
        <button onClick={() => onOpen(node, records, extension)}>
          节点详情 <ArrowUpRight size={14} />
        </button>
      </div>
    </article>
  );
}
function Detail({
  node,
  live,
  records,
  tasks,
  settings,
  extension,
  initialSection = "overview",
  preserveHours,
  onClose,
}: {
  node: NodeInfo;
  live?: LiveStatus;
  records: PingRecord[];
  tasks: PingTask[];
  settings?: Site["theme_settings"];
  extension: Extension | null;
  initialSection?: DetailSection;
  preserveHours?: number;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<DetailSection>(initialSection);
  const [visited, setVisited] = useState<Set<DetailSection>>(
    () => new Set([initialSection]),
  );
  function selectSection(next: DetailSection) {
    setSection(next);
    setVisited((current) => new Set([...current, next]));
    body.current?.scrollTo({ top: 0 });
  }
  useEffect(() => {
    dialog.current?.showModal();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="detail node-detail"
      aria-labelledby="node-detail-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <header className="node-detail-header">
        <div className="dialog-head">
          <div>
            <span className="eyebrow">NODE INSIGHTS</span>
            <h2 id="node-detail-title" title={node.name}>
              {node.name}
            </h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="关闭详情"
          >
            <X />
          </button>
        </div>
        <div className="detail-state">
          <span className={`status-dot ${online(live) ? "up" : ""}`} />
          {online(live) ? "节点在线" : "节点离线"}
          <span title={`${regionName(node.region)} · ${node.os || "系统未知"}`}>
            {regionName(node.region)} · {node.os || "系统未知"}
          </span>
        </div>
        <div className="detail-tabs" role="tablist" aria-label="节点详情分区">
          {detailSections.map(([id, label], index) => (
            <button
              key={id}
              id={`detail-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={section === id}
              aria-controls={`detail-panel-${id}`}
              tabIndex={section === id ? 0 : -1}
              onClick={() => selectSection(id)}
              onKeyDown={(event) => {
                const next =
                  event.key === "ArrowRight"
                    ? (index + 1) % 4
                    : event.key === "ArrowLeft"
                      ? (index + 3) % 4
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? 3
                          : null;
                if (next === null) return;
                event.preventDefault();
                selectSection(detailSections[next][0]);
                document
                  .getElementById(`detail-tab-${detailSections[next][0]}`)
                  ?.focus();
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      <div className="node-detail-body" ref={body}>
        <section
          className="detail-panel"
          role="tabpanel"
          id="detail-panel-overview"
          aria-labelledby="detail-tab-overview"
          hidden={section !== "overview"}
        >
          <div className="hardware">
            <div>
              <span>处理器</span>
              <b>{node.cpu_name || "尚未上报"}</b>
              <small>
                {node.cpu_cores || "—"} 逻辑 CPU · {node.arch || "—"}
              </small>
            </div>
            <div>
              <span>内存 / 磁盘</span>
              <b>
                {bytes(node.mem_total)} / {bytes(node.disk_total)}
              </b>
              <small>
                最后上报{" "}
                {live?.time ? new Date(live.time).toLocaleString("zh-CN") : "—"}
              </small>
            </div>
          </div>
          <CpuInsight name={node.cpu_name} />
          <NetworkEvidence node={node} ip={extension?.ip} />
          {node.public_remark && (
            <p className="public-remark">{node.public_remark}</p>
          )}
          <div className="node-runtime">
            <span>运行时间 {duration(live?.uptime)}</span>
            <span>连接数 {healthyConnections(live) ?? "—"}</span>
            <span>负载 {live?.load ?? "—"}</span>
          </div>
          <div className="explanation">
            <ShieldCheck size={19} />
            <div>
              <b>分数来自观测，不是保证</b>
              <p>
                稳定分 = 成功样本比例 × 100；线路分 = max(0, 100 − 中位延迟 /
                5)；总分 = 稳定分 × 70% + 线路分 × 30%。每条线路至少 30
                个返回样本且最新样本在五分钟内才参与评级；未达标线路不计分，但仍显示其失败记录。仅统计实际收到的主目标记录，聚合点不代表原始探测次数，断档不当作成功；“地区判断”不代表该
                IP 已解锁。IP 信誉未接入，因此不评分。
              </p>
            </div>
          </div>
        </section>
        <section
          className="detail-panel"
          role="tabpanel"
          id="detail-panel-resources"
          aria-labelledby="detail-tab-resources"
          hidden={section !== "resources"}
        >
          {visited.has("resources") && (
            <Suspense fallback={<p>正在载入历史图表…</p>}>
              <History uuid={node.uuid} active={section === "resources"} />
            </Suspense>
          )}
        </section>
        <section
          className="detail-panel"
          role="tabpanel"
          id="detail-panel-latency"
          aria-labelledby="detail-tab-latency"
          hidden={section !== "latency"}
        >
          {visited.has("latency") && (
            <Suspense fallback={<p>正在载入线路图表…</p>}>
              <LatencyHistory
                uuid={node.uuid}
                active={section === "latency"}
                preserveHours={preserveHours}
                initialRecords={records}
                tasks={tasks}
                settings={settings}
              />
            </Suspense>
          )}
        </section>
        <section
          className="detail-panel"
          role="tabpanel"
          id="detail-panel-evidence"
          aria-labelledby="detail-tab-evidence"
          hidden={section !== "evidence"}
        >
          <h3>回程证据</h3>
          <p className="empty-note">
            {extension?.routes
              ? `探测于 ${new Date(extension.routes.probed_at).toLocaleString("zh-CN")} · 每 24 小时检测 · ${extension.routes.stale ? "已过期" : "ASN 观察，不保证全程或 CN2 GIA"}`
              : extension
                ? "Agent 未配置回程目标或未上报；延迟任务不等于回程探测。"
                : "服务端未提供 Mint 摘要接口，请升级 Nekomari。"}
          </p>
          {extension?.routes?.results.map((route, i) => (
            <p className="route-evidence" key={i}>
              {carriers[route.carrier as keyof typeof carriers] ||
                route.carrier}{" "}
              · {route.target} · {route.label || "未识别 ASN"} ·{" "}
              {route.reached ? "已到达" : "未到达"} · {route.hops} 跳
              {route.error ? ` · ${route.error}` : ""}
            </p>
          ))}
          <h3>检测依据</h3>
          <p className="empty-note">
            {extension?.unlock
              ? `探测于 ${new Date(extension.unlock.probed_at).toLocaleString("zh-CN")} · ${extension.unlock.stale ? "已过期" : "快照有效"}`
              : "尚无可读取的检测快照"}
          </p>
          <div className="evidence">
            {services.map(([id, name]) => {
              const item = extension?.unlock?.results.find(
                (r) => r.id === id || (id === "youtube" && r.id.startsWith(id)),
              );
              const state =
                id === "gemini" && !item
                  ? { label: "未接入", tone: "muted" }
                  : unlockState(item, extension?.unlock?.stale);
              return (
                <div key={id}>
                  <b>{name}</b>
                  <span className={`evidence-label ${state.tone}`}>
                    {state.label}
                  </span>
                  <p>
                    {item?.detail ||
                      (id === "gemini"
                        ? "Agent 尚未实现此服务的探测。"
                        : "尚未收到此服务的检测结果。")}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="history-key">
            <span>
              <i className="ok" />
              正常 ≤ 250 ms
            </span>
            <span>
              <i className="slow" />
              高延迟
            </span>
            <span>
              <i className="lost" />
              存在失败
            </span>
            <span>
              <i className="unknown" />
              无样本
            </span>
          </div>
        </section>
      </div>
    </dialog>
  );
}
function Login({ site, onDone }: { site: Site; onDone: () => void }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="login-panel km-restricted-login-dialog">
      <ShieldCheck size={36} />
      <h2>这是一个私有监控站点</h2>
      <p>登录后查看节点状态，凭据仅发送到当前站点。</p>
      <form
        className="km-restricted-login-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            const response = await fetch("/api/login", {
              method: "POST",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(Object.fromEntries(data)),
            });
            const body = await response.json();
            if (!response.ok || body.status === "error")
              throw Error(body.message || "登录失败");
            onDone();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          用户名
          <input name="username" autoComplete="username" required />
        </label>
        <label>
          密码
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <label>
          两步验证码（如已开启）
          <input
            name="2fa_code"
            autoComplete="one-time-code"
            inputMode="numeric"
          />
        </label>
        <button className="primary-button" disabled={busy}>
          {busy ? "正在登录…" : `登录 ${site.sitename || "Nekomari"}`}
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
      <a href="/admin">
        其他登录方式 <ExternalLink size={13} />
      </a>
    </div>
  );
}
export function App() {
  const [site, setSite] = useState<Site>({}),
    [nodes, setNodes] = useState<NodeInfo[]>([]),
    [live, setLive] = useState<Record<string, LiveStatus>>({}),
    [tasks, setTasks] = useState<PingTask[]>([]);
  const [loading, setLoading] = useState(true),
    [refreshing, setRefreshing] = useState(false),
    [error, setError] = useState(""),
    [privateSite, setPrivateSite] = useState(false);
  const [search, setSearch] = useState(""),
    [group, setGroup] = useState("all"),
    [onlyOnline, setOnlyOnline] = useState(false),
    [sort, setSort] = useState("weight");
  const [detail, setDetail] = useState<{
    node: NodeInfo;
    records: PingRecord[];
    ext: Extension | null;
    section?: DetailSection;
  } | null>(null);
  const [view, setView] = useState(
    () => localStorage.getItem("mint-view") || "cards",
  );
  const [hideCosts, setHideCosts] = useState(
    () => localStorage.getItem("mint-hide-costs") !== "false",
  );
  const [costOpen, setCostOpen] = useState(false);
  useEffect(() => {
    localStorage.setItem("mint-view", view);
    localStorage.setItem("mint-hide-costs", String(hideCosts));
  }, [view, hideCosts]);
  const [updated, setUpdated] = useState<Date | null>(null),
    [help, setHelp] = useState(false);
  // A failed request may repeat the same error; the clock must still expire stale reports.
  const [, setClock] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  const accessEpoch = useRef(0);
  const refresh = useCallback(async () => {
    const epoch = ++accessEpoch.current;
    setRefreshing(true);
    try {
      const data = await loadOverview();
      if (epoch !== accessEpoch.current) return;
      setSite(data.site);
      setNodes(data.nodes);
      setLive(data.live);
      setTasks(data.tasks);
      setUpdated(new Date());
      setError("");
      setPrivateSite(false);
      document.title = `${data.site.sitename || "Nekomari"} · Mint`;
    } catch (e) {
      const err = e as ApiError;
      if (epoch !== accessEpoch.current) return;
      if (isPrivateError(err)) {
        ++accessEpoch.current;
        setNodes([]);
        setLive({});
        setDetail(null);
        setCostOpen(false);
        setPrivateSite(true);
        try {
          setSite(await rpc<Site>("public:getPublicSettings"));
        } catch {
          /* The login screen still works without site metadata. */
        }
      } else setError(err.message || "连接失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    async function tick() {
      if (!document.hidden && !privateSite) {
        const epoch = accessEpoch.current;
        try {
          const data = await rpc<Record<string, LiveStatus>>(
            "common:getNodesLatestStatus",
            { include_ping: false },
          );
          if (!stopped && epoch === accessEpoch.current) {
            setLive(data);
            setUpdated(new Date());
            setError("");
          }
        } catch (e) {
          if (!stopped && epoch === accessEpoch.current) {
            setError((e as Error).message);
            if (isPrivateError(e)) {
              ++accessEpoch.current;
              setNodes([]);
              setLive({});
              setDetail(null);
              setCostOpen(false);
              setPrivateSite(true);
            }
          }
        }
      }
      if (!stopped) timer = setTimeout(tick, 5000);
    }
    timer = setTimeout(tick, 5000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [privateSite]);
  const groups = [
    ...new Set(nodes.map((n) => n.group).filter(Boolean)),
  ] as string[];
  const shown = nodes
    .filter(
      (n) =>
        (group === "all" || n.group === group) &&
        (!onlyOnline || online(live[n.uuid])) &&
        `${n.name} ${n.group} ${n.region} ${n.tags}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "expiry"
          ? (Date.parse(a.expired_at || "") || Infinity) -
            (Date.parse(b.expired_at || "") || Infinity)
          : sort === "cpu"
            ? (online(live[b.uuid]) ? (live[b.uuid]?.cpu ?? -1) : -1) -
              (online(live[a.uuid]) ? (live[a.uuid]?.cpu ?? -1) : -1)
            : sort === "speed"
              ? (online(live[b.uuid])
                  ? (live[b.uuid]?.net_in ?? 0) + (live[b.uuid]?.net_out ?? 0)
                  : -1) -
                (online(live[a.uuid])
                  ? (live[a.uuid]?.net_in ?? 0) + (live[a.uuid]?.net_out ?? 0)
                  : -1)
              : (b.weight || 0) - (a.weight || 0),
    );
  const onlineCount = nodes.filter((n) => online(live[n.uuid])).length;
  const monthly = monthlyTotal(nodes, site.theme_settings);
  const rates = sumRates(nodes.map((n) => live[n.uuid]));
  const rx = rates.rx,
    tx = rates.tx;
  const expiring = nodes.filter(
    (n) =>
      n.expired_at &&
      Date.parse(n.expired_at) > Date.now() &&
      Date.parse(n.expired_at) - Date.now() < 30 * 86_400_000,
  ).length;
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="/">
            <span className="brand-mark">
              <Leaf size={20} />
            </span>
            <strong>
              {site.sitename || "Nekomari"}
              <span>Mint</span>
            </strong>
          </a>
          <nav>
            <button
              className="privacy-button"
              onClick={() => setHideCosts(!hideCosts)}
              aria-label={hideCosts ? "显示费用" : "隐藏费用"}
            >
              {hideCosts ? "显示费用" : "隐藏费用"}
            </button>
            <a className="active" href="/">
              <Activity size={15} />
              总览
            </a>
            <button onClick={() => setHelp(!help)}>
              <CircleHelp size={16} />
              <span>使用说明</span>
            </button>
            <span className="nav-divider" />
            <ColorModeSwitch />
            <a className="admin-link" href="/admin">
              管理后台 <ArrowUpRight size={14} />
            </a>
          </nav>
        </div>
      </header>
      <main>
        <section className="hero">
          <div>
            <div className="eyebrow">
              <span className="tiny-line" />
              YOUR NETWORK, AT A GLANCE
            </div>
            <h1>
              {String(
                site.theme_settings?.headline || "每一条线路，都心中有数。",
              )}
            </h1>
            <p>
              {String(
                site.theme_settings?.subtitle ||
                  "节点状态、线路质量与到期提醒，一眼看清。",
              )}
            </p>
          </div>
          <div className={`live-badge ${error ? "disconnected" : ""}`}>
            <i className="status-dot up" />
            <div>
              <b>{error ? "连接中断" : "实时监测中"}</b>
              <small>
                {updated
                  ? `${updated.toLocaleTimeString("zh-CN", { hour12: false })} 更新`
                  : "正在连接节点"}
              </small>
            </div>
            <Activity size={23} />
          </div>
        </section>
        {help && (
          <section className="help-panel">
            <button
              className="icon-button"
              onClick={() => setHelp(false)}
              aria-label="关闭说明"
            >
              <X size={18} />
            </button>
            <h3>看得清，也要测得准。</h3>
            <p>
              在后台创建带“电信 / 联通 /
              移动”的延迟任务，或在主题设置中指定任务。历史条为真实时间桶：绿 ≤
              250 ms、黄为高延迟、红为存在失败、灰为无样本。Nekomari
              的扩展检测需更新服务端和 Agent；官方 Komari 自动显示基础监控。
            </p>
            <p>
              地区判断 ≠ 实测解锁；回程未配置即显示未检测；IP
              信誉不凭空评分。点开节点可查看公式和检测依据。
            </p>
          </section>
        )}
        {privateSite ? (
          <Login site={site} onDone={() => void refresh()} />
        ) : (
          <>
            <section className="overview">
              <div className="overview-item">
                <div className="stat-label">
                  <Server size={16} />
                  在线节点
                </div>
                <div className="stat-value">
                  {loading ? "—" : onlineCount}
                  <span>/ {nodes.length}</span>
                  <em>
                    {nodes.length && onlineCount === nodes.length
                      ? "全部在线"
                      : `${nodes.length - onlineCount} 台离线`}
                  </em>
                </div>
                <small>每 5 秒刷新实时状态</small>
              </div>
              <div className="overview-item">
                <div className="stat-label">
                  <Wifi size={16} />
                  实时流量
                </div>
                <div className="stat-value traffic-stat">
                  <span>
                    <ArrowDown size={19} />
                    {loading ? "—" : bytes(rx, true)}
                  </span>
                  <span>
                    <ArrowUp size={17} />
                    {loading ? "—" : bytes(tx, true)}
                  </span>
                </div>
                <small>
                  在线节点收发速率合计 · {rates.measured} / {onlineCount} 台有效
                </small>
              </div>
              <div className="overview-item cost-overview">
                <div className="stat-label">
                  <Database size={16} />
                  月度支出
                  <button
                    className="cost-details-button"
                    aria-label="费用与溢价设置"
                    onClick={() => setCostOpen(true)}
                  >
                    明细
                  </button>
                </div>
                <div className="stat-value">
                  <sup>¥</sup>
                  {hideCosts
                    ? "••••"
                    : monthly.included ||
                        (monthly.includePremium && monthly.amortized > 0)
                      ? monthly.total.toFixed(2)
                      : "—"}
                  <span>/ 月</span>
                </div>
                <small>
                  {monthly.included} 台已计入
                  {monthly.skipped
                    ? ` · ${monthly.skipped} 台缺汇率未计入`
                    : ""}
                  {monthly.unpriced ? ` · ${monthly.unpriced} 台未填价格` : ""}
                  {monthly.invalidCycle
                    ? ` · ${monthly.invalidCycle} 台周期无效`
                    : ""}
                  {monthly.ignored ? ` · ${monthly.ignored} 台已排除` : ""}
                </small>
                <small className="cost-basis">
                  {monthly.includePremium
                    ? "含当前溢价月摊 · 月均估算"
                    : "续费月费 · 不含一次性溢价"}
                  {monthly.pendingPremiums
                    ? ` · ${monthly.pendingPremiums} 笔待摊销配置`
                    : ""}
                  {monthly.warnings.length ? " · 配置异常，见明细" : ""}
                </small>
              </div>
              <div className="overview-item">
                <div className="stat-label">
                  <Clock3 size={16} />
                  即将到期
                </div>
                <div className="stat-value">
                  {expiring}
                  <span>台节点</span>
                </div>
                <small>未来 30 天内需要续费</small>
              </div>
            </section>
            <section className="fleet-section">
              <div className="section-title">
                <div>
                  <h2>
                    我的节点 <span>{shown.length}</span>
                  </h2>
                  <p>让每一份资源，都运行在掌握之中。</p>
                </div>
                <button
                  className="refresh-button"
                  onClick={() => void refresh()}
                  disabled={refreshing}
                >
                  <RefreshCw size={15} className={refreshing ? "spin" : ""} />
                  刷新
                </button>
              </div>
              <div className="toolbar">
                <div className="group-tabs">
                  <button
                    className={group === "all" ? "selected" : ""}
                    onClick={() => setGroup("all")}
                  >
                    全部节点<span>{nodes.length}</span>
                  </button>
                  {groups.map((g) => (
                    <button
                      className={group === g ? "selected" : ""}
                      onClick={() => setGroup(g)}
                      key={g}
                    >
                      {g}
                    </button>
                  ))}
                </div>
                <div className="toolbar-right">
                  <button
                    className="view-toggle"
                    onClick={() => setView(view === "cards" ? "list" : "cards")}
                    aria-label={
                      view === "cards" ? "切换列表视图" : "切换卡片视图"
                    }
                  >
                    {view === "cards" ? "列表" : "卡片"}
                  </button>
                  <label className="search">
                    <Search size={16} />
                    <input
                      placeholder="搜索节点…"
                      aria-label="搜索节点"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <label className="sort">
                    <SlidersHorizontal size={14} />
                    <select
                      aria-label="节点排序"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="weight">默认排序</option>
                      <option value="name">名称排序</option>
                      <option value="expiry">到期时间</option>
                      <option value="cpu">CPU 占用</option>
                      <option value="speed">实时吞吐</option>
                    </select>
                    <ChevronDown size={12} />
                  </label>
                  <button
                    className={`online-filter ${onlyOnline ? "checked" : ""}`}
                    onClick={() => setOnlyOnline(!onlyOnline)}
                    aria-pressed={onlyOnline}
                  >
                    <span>{onlyOnline && <Check size={11} />}</span>仅在线
                  </button>
                </div>
              </div>
              {error && (
                <div className="error-banner" role="alert">
                  连接异常：{error}。保留最后收到的数据，90
                  秒后状态自动判为离线。
                  <button onClick={() => void refresh()}>重试</button>
                </div>
              )}
              {loading ? (
                <div className="loading-state">
                  <LoaderCircle className="spin" size={27} />
                  <p>正在读取节点状态…</p>
                </div>
              ) : shown.length ? (
                <div
                  className={`node-grid ${view === "list" ? "list-view" : ""}`}
                >
                  {shown.map((n, i) => (
                    <NodeCard
                      key={n.uuid}
                      node={n}
                      live={live[n.uuid]}
                      tasks={tasks}
                      settings={site.theme_settings}
                      index={i}
                      hideCosts={hideCosts}
                      onOpen={(node, records, ext, section) =>
                        setDetail({ node, records, ext, section })
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <Server size={36} />
                  <h3>
                    {nodes.length
                      ? "没有匹配的节点"
                      : "第一台节点，从这里开始。"}
                  </h3>
                  <p>
                    {nodes.length
                      ? "试试其他分组、关键词，或关闭“仅在线”。"
                      : "在管理后台添加服务器并连接 Agent，监测数据将在这里出现。"}
                  </p>
                  <a href="/admin">
                    打开管理后台 <ArrowUpRight size={15} />
                  </a>
                </div>
              )}
              <div className="fleet-note">
                <ShieldCheck size={14} />
                真实样本 · 无数据不伪装正常
                <span>
                  <i className="ok" />
                  正常
                  <i className="slow" />
                  高延迟
                  <i className="lost" />
                  失败
                  <i className="unknown" />
                  无样本
                </span>
              </div>
            </section>
          </>
        )}
        <footer>
          <span className="footer-brand">
            <Leaf size={15} />
            Nekomari Mint <span>v0.7.1</span>
          </span>
          <p>
            {String(
              site.theme_settings?.footer || "数据有据可查，状态不靠猜测。",
            )}
          </p>
          <a
            href="https://github.com/Aone2233/komari-theme-nekomari-mint"
            target="_blank"
            rel="noreferrer"
          >
            开源主题 <ArrowUpRight size={13} />
          </a>
        </footer>
      </main>
      {detail && !privateSite && (
        <Detail
          key={detail.node.uuid}
          initialSection={detail.section}
          preserveHours={site.ping_record_preserve_time}
          node={detail.node}
          records={detail.records}
          extension={detail.ext}
          live={live[detail.node.uuid]}
          tasks={tasks}
          settings={site.theme_settings}
          onClose={() => setDetail(null)}
        />
      )}
      {costOpen && !privateSite && (
        <Suspense
          fallback={
            <div className="cost-loading" role="status">
              正在加载费用明细…
            </div>
          }
        >
          <CostPanel
            nodes={nodes}
            settings={site.theme_settings}
            hideAmounts={hideCosts}
            onClose={() => setCostOpen(false)}
            onSaved={() => void refresh()}
          />
        </Suspense>
      )}
    </>
  );
}
