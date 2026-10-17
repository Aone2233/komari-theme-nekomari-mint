const HOUR = 3600000;
export const HISTORY_PRESETS = [1, 6, 12, 24];

export interface FixedRange {
  start: number;
  end: number;
}

export function historyLimit(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(8784, value)
    : 168;
}

export function localDateInput(time: number): string {
  const date = new Date(time);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseLocal(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && localDateInput(time) === value ? time : null;
}

export function validateHistoryRange(
  startInput: string,
  endInput: string,
  limit: number,
  now = Date.now(),
): { range: FixedRange | null; error: string } {
  const start = parseLocal(startInput),
    end = parseLocal(endInput);
  if (start === null || end === null)
    return { range: null, error: "请填写有效的开始和结束时间。" };
  if (start >= end) return { range: null, error: "结束时间须晚于开始时间。" };
  if (end > now) return { range: null, error: "结束时间不能晚于当前时间。" };
  if (start < now - limit * HOUR)
    return {
      range: null,
      error: `开始时间超出可查询范围（最近 ${limit} 小时）。`,
    };
  return { range: { start, end }, error: "" };
}

export function customQueryHours(
  range: FixedRange,
  limit: number,
  now = Date.now(),
): number {
  if (
    !Number.isFinite(range.start) ||
    !Number.isFinite(range.end) ||
    range.start >= range.end ||
    range.end > now ||
    range.start < now - limit * HOUR
  )
    throw Error("自定义区间已超出可查询范围，请重新选择。");
  // The standard legacy endpoint accepts hours, not start/end. Query back to
  // the selected start, then crop exact bounds; never pretend it supports dates.
  return Math.min(8784, Math.max(1, Math.ceil((now - range.start) / HOUR)));
}
