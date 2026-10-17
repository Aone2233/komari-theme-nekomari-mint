import type { PingRecord } from "./types";

export function pingGapMs(interval?: number): number {
  return (
    Math.max(1, Number.isFinite(interval) && interval! > 0 ? interval! : 60) *
    2500
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
