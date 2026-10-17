import type { PingRecord } from "./types";

export function pingGapMs(
  interval?: number,
  records: PingRecord[] = [],
): number {
  // Legacy APIs can return minute rollups even for sub-minute tasks.
  // Recognize their timestamp grid, not arbitrary long gaps between sparse records.
  const minuteGrid =
    records.length >= 3 &&
    records.every((r) => Date.parse(r.time) % 60000 === 0);
  return (
    Math.max(
      1,
      Number.isFinite(interval) && interval! > 0 ? interval! : 60,
      minuteGrid ? 60 : 0,
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
