import type { PingRecord, PingSeries } from "./types";

export const MIN_PING_SAMPLES = 30;

export function failureLabel(protocol?: string) {
  return protocol === "icmp"
    ? "丢包率"
    : protocol === "tcp"
      ? "连接失败率"
      : protocol === "http"
        ? "请求失败率"
        : "探测失败率";
}

export function qualifiedPingSeries(series: PingSeries[], now = Date.now()) {
  return series.filter((row) => {
    const age = now - Date.parse(row.records.at(-1)?.time || "");
    return row.total >= MIN_PING_SAMPLES && age >= -30000 && age <= 300000;
  });
}

export function pingSummary(records: PingRecord[]) {
  const values = records
    .filter((r) => Number.isFinite(r.value) && r.value >= 0)
    .map((r) => r.value)
    .sort((a, b) => a - b);
  const percentile = (fraction: number) => {
    if (!values.length) return null;
    const position = (values.length - 1) * fraction,
      low = Math.floor(position),
      high = Math.ceil(position);
    return values[low] + (values[high] - values[low]) * (position - low);
  };
  const times = records.map((r) => Date.parse(r.time)).filter(Number.isFinite);
  return {
    min: values[0] ?? null,
    max: values.at(-1) ?? null,
    average: values.length
      ? values.reduce((sum, value) => sum + value / values.length, 0)
      : null,
    p95: percentile(0.95),
    success: values.length,
    first: times.length ? times.reduce((a, b) => Math.min(a, b)) : null,
    last: times.length ? times.reduce((a, b) => Math.max(a, b)) : null,
  };
}

export function pingGapMs(
  interval?: number,
  records: PingRecord[] = [],
  hours = 1,
): number {
  // Legacy APIs can return minute rollups even for sub-minute tasks.
  // Recognize their timestamp grid, not arbitrary long gaps between sparse records.
  const minuteGrid =
    records.length >= 3 &&
    records.every((r) => Date.parse(r.time) % 60000 === 0);
  // Long-window legacy APIs omit rollup resolution. Require a standard UTC
  // grid and consecutive buckets, not just a large median gap between samples.
  const times = [...new Set(records.map((r) => Date.parse(r.time)))].sort(
    (a, b) => a - b,
  );
  const coarse =
    hours > 1
      ? [3600, 300].find(
          (seconds) =>
            times.length >= 3 &&
            times.every((time) => time % (seconds * 1000) === 0) &&
            times.filter(
              (time, i) => i > 0 && time - times[i - 1] === seconds * 1000,
            ).length >= 2,
        )
      : undefined;
  return (
    Math.max(
      1,
      Number.isFinite(interval) && interval! > 0 ? interval! : 60,
      minuteGrid ? 60 : 0,
      coarse || 0,
    ) * 2500
  );
}

export function nearestPing(
  records: PingRecord[],
  time: number,
  tolerance: number,
): PingRecord | null {
  let low = 0,
    high = records.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (Date.parse(records[mid].time) < time) low = mid + 1;
    else high = mid;
  }
  const candidates = [records[low - 1], records[low]].filter(Boolean);
  const nearest = candidates.sort(
    (a, b) =>
      Math.abs(Date.parse(a.time) - time) - Math.abs(Date.parse(b.time) - time),
  )[0];
  return nearest && Math.abs(Date.parse(nearest.time) - time) <= tolerance
    ? nearest
    : null;
}
