import type {
  Carrier,
  LiveStatus,
  NodeInfo,
  PingRecord,
  PingSeries,
  PingTask,
  Site,
  UnlockItem,
} from "./types";

export const carriers: Record<Carrier, string> = {
  telecom: "电信",
  unicom: "联通",
  mobile: "移动",
};
export function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
export function percent(used: unknown, total: unknown): number | null {
  const u = number(used),
    t = number(total);
  return u !== null && t !== null && t > 0
    ? Math.max(0, Math.min(100, (u / t) * 100))
    : null;
}
export function measured(
  status: LiveStatus | undefined,
  field: keyof LiveStatus,
  quality: string,
): number | null {
  if (
    !status ||
    (status.quality?.[quality] && status.quality[quality] !== "ok")
  )
    return null;
  return number(status[field]);
}
export function bytes(value: number | null | undefined, rate = false): string {
  if (value == null || !Number.isFinite(value) || value < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(i === 0 ? 0 : value < 10 ? 1 : 0)} ${units[i]}${rate ? "/s" : ""}`;
}
export function online(status?: LiveStatus): boolean {
  const age = status?.time ? Date.now() - Date.parse(status.time) : NaN;
  return (
    status?.online === true &&
    Number.isFinite(age) &&
    age >= -30_000 &&
    age < 90_000
  );
}
function selected(value: unknown): number[] {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value.filter((v) => typeof v === "number") : [];
}
export function carrierFor(
  task: PingTask,
  settings: Site["theme_settings"] = {},
): Carrier | undefined {
  for (const carrier of Object.keys(carriers) as Carrier[]) {
    if (selected(settings?.[`${carrier}Tasks`]).includes(task.id))
      return carrier;
  }
  if (/电信|telecom|chinanet|\bct\b/i.test(task.name)) return "telecom";
  if (/联通|unicom|\bcu\b/i.test(task.name)) return "unicom";
  if (/移动|mobile|\bcm\b/i.test(task.name)) return "mobile";
}
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    i = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2;
}
export function pingSeries(
  records: PingRecord[],
  tasks: PingTask[],
  uuid: string,
  settings?: Site["theme_settings"],
): PingSeries[] {
  const grouped = new Map<
    string,
    { task: PingTask; protocol: string; records: PingRecord[] }
  >();
  for (const record of records) {
    const age = Date.now() - Date.parse(record.time);
    if (
      record.role === "reference" ||
      !Number.isFinite(record.value) ||
      !Number.isFinite(age) ||
      age < -30_000 ||
      age > 3_600_000
    )
      continue;
    const task = tasks.find((t) => t.id === record.task_id);
    if (!task || (task.clients?.length && !task.clients.includes(uuid)))
      continue;
    const protocol = record.ping_type || task.type;
    const key = `${task.id}:${protocol}:${record.family || ""}`;
    if (!grouped.has(key)) grouped.set(key, { task, protocol, records: [] });
    grouped.get(key)!.records.push(record);
  }
  return [...grouped.entries()]
    .map(([key, group]) => {
      const sorted = group.records.sort(
        (a, b) => Date.parse(a.time) - Date.parse(b.time),
      );
      const values = sorted.filter((r) => r.value >= 0).map((r) => r.value);
      const failures = sorted.length - values.length;
      const middle = median(values);
      return {
        key,
        name: group.task.name,
        carrier: carrierFor(group.task, settings),
        protocol: group.protocol,
        family: sorted.at(-1)!.family,
        records: sorted,
        latest: sorted.at(-1)!.value < 0 ? null : sorted.at(-1)!.value,
        loss: (failures / sorted.length) * 100,
        failures,
        total: sorted.length,
        median: middle,
        jitter:
          middle === null
            ? null
            : median(values.map((v) => Math.abs(v - middle))),
      };
    })
    .sort((a, b) => (a.carrier || "z").localeCompare(b.carrier || "z"));
}
// Each bar represents a time bucket. Empty buckets are unknown, never green.
export function historyBuckets(
  records: PingRecord[],
  count = 30,
  now = Date.now(),
): (number | null)[] {
  const start = now - 3_600_000,
    size = 3_600_000 / count;
  const bins: number[][] = Array.from({ length: count }, () => []);
  for (const r of records) {
    const i = Math.floor((Date.parse(r.time) - start) / size);
    if (i >= 0 && i < count) bins[i].push(r.value);
  }
  return bins.map((bin) =>
    !bin.length ? null : bin.some((v) => v < 0) ? -1 : Math.max(...bin),
  );
}
export function scores(series: PingSeries[]) {
  const valid = series.filter((s) => s.total > 0),
    samples = valid.reduce((n, s) => n + s.total, 0);
  if (!samples) return { stability: null, latency: null, overall: null };
  const stability = Math.round(
    100 * (1 - valid.reduce((n, s) => n + s.failures, 0) / samples),
  );
  const med = median(
    valid.flatMap((s) => (s.median === null ? [] : [s.median])),
  );
  const latency = med === null ? null : Math.round(Math.max(0, 100 - med / 5));
  return {
    stability,
    latency,
    overall:
      latency === null ? null : Math.round(stability * 0.7 + latency * 0.3),
  };
}
export function unlockState(item: UnlockItem | undefined, stale = false) {
  if (!item) return { label: "未检测", tone: "muted" };
  if (stale) return { label: "已过期", tone: "muted" };
  if (item.basis === "region")
    return {
      label:
        item.status === "blocked"
          ? "地区受限"
          : item.status === "unknown"
            ? "地区判断"
            : "地区判断",
      tone: "region",
    };
  if (item.basis !== "probe") return { label: "依据未知", tone: "muted" };
  if (["unlocked", "ok"].includes(item.status))
    return { label: "可用", tone: "good" };
  if (item.status === "partial")
    return {
      label: item.kind === "ai" ? "页面可达" : "部分可用",
      tone: "warn",
    };
  if (item.status === "blocked") return { label: "受限", tone: "bad" };
  return { label: "未知", tone: "muted" };
}
export function traffic(
  status: LiveStatus | undefined,
  node: NodeInfo,
): { value: number | null; basis: string } {
  const up = measured(status, "traffic_up", "traffic_cycle"),
    down = measured(status, "traffic_down", "traffic_cycle");
  if (up === null || down === null)
    return { value: null, basis: "本期流量未上报" };
  const type = node.traffic_limit_type || "max";
  return {
    value:
      type === "sum"
        ? up + down
        : type === "min"
          ? Math.min(up, down)
          : type === "up"
            ? up
            : type === "down"
              ? down
              : Math.max(up, down),
    basis: `本期 · ${type}`,
  };
}
export { monthlyTotal } from "./cost";

export function sumRates(statuses: (LiveStatus | undefined)[]) {
  const valid = statuses.filter(online).flatMap((status) => {
    const rx = measured(status, "net_in", "net_rate"),
      tx = measured(status, "net_out", "net_rate");
    return rx === null || tx === null ? [] : [{ rx, tx }];
  });
  return {
    rx: valid.length ? valid.reduce((n, s) => n + s.rx, 0) : null,
    tx: valid.length ? valid.reduce((n, s) => n + s.tx, 0) : null,
    measured: valid.length,
  };
}
