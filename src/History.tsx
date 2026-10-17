import { useEffect, useState } from "react";
import { ApiError, rpc } from "./api";
import { bytes, number } from "./data";
import { chartSegments } from "./chart";

export interface MetricPoint {
  time: string;
  value: number | null;
}
interface Series {
  metric_key: string;
  interval_seconds?: number;
  points: MetricPoint[];
}
const keys = ["cpu.usage", "memory.used", "net.in.rate", "net.out.rate"];
async function fetchHistory(
  uuid: string,
  hours: number,
  signal: AbortSignal,
): Promise<Series[]> {
  try {
    const result = await rpc<{ series: Series[] }>(
      "public:queryMetrics",
      {
        entity_id: uuid,
        metric_keys: keys,
        hours,
        max_points: 120,
        aggregation: "avg",
        fill_empty: true,
      },
      signal,
    );
    return result.series || [];
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== -32601) throw error;
    const result = await rpc<{
      records: Record<string, Record<string, unknown>[]>;
    }>(
      "common:getRecords",
      { type: "load", uuid, hours, maxCount: 120 },
      signal,
    );
    const records = result.records?.[uuid] || [];
    return keys.map((metric_key, i) => ({
      metric_key,
      points: records.map((r) => ({
        time: String(r.time),
        value: number(r[["cpu", "ram", "net_in", "net_out"][i]]),
      })),
    }));
  }
}
export default function History({
  uuid,
  active = true,
}: {
  uuid: string;
  active?: boolean;
}) {
  const [hours, setHours] = useState(1),
    [series, setSeries] = useState<Series[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let alive = true;
    setBusy(true);
    setError("");
    setSeries([]);
    const timer = setTimeout(() => controller.abort(), 20000);
    fetchHistory(uuid, hours, controller.signal)
      .then((result) => {
        if (alive) setSeries(result);
      })
      .catch((e) => {
        if (!alive) return;
        if (!controller.signal.aborted) setError(e.message || "读取失败");
        else setError("读取超时");
      })
      .finally(() => {
        clearTimeout(timer);
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [uuid, hours, active]);
  const end = Date.now(),
    start = end - hours * 3600000;
  return (
    <section className="resource-history">
      <div className="history-heading">
        <h3>资源与吞吐历史</h3>
        <select
          aria-label="历史时间范围"
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
        >
          {[1, 6, 24].map((h) => (
            <option key={h} value={h}>
              近 {h} 小时
            </option>
          ))}
        </select>
      </div>
      <p className="empty-note">
        真实样本均值 · 断档不连线 · 时间为浏览器本地时区
      </p>
      {busy ? (
        <p role="status">正在读取历史…</p>
      ) : error ? (
        <p role="alert">历史读取失败：{error}</p>
      ) : (
        <div className="history-charts">
          {keys.map((key, i) => {
            const row = series.filter((s) => s.metric_key === key),
              points = row
                .flatMap((s) => s.points)
                .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
            const valid = points.filter(
              (p) => p.value !== null && Number.isFinite(p.value),
            );
            const max =
              i === 0 ? 100 : Math.max(1, ...valid.map((p) => p.value!));
            const format = (v: number) =>
              i === 0 ? `${v.toFixed(1)}%` : bytes(v, i > 1);
            return (
              <div className="history-chart" key={key}>
                <div>
                  <b>{["CPU", "内存", "下载", "上传"][i]}</b>
                  <span>
                    {valid.length
                      ? `峰值 ${format(Math.max(...valid.map((p) => p.value!)))}`
                      : "无有效样本"}
                  </span>
                </div>
                <svg
                  viewBox="0 0 400 90"
                  role="img"
                  aria-label={`${["CPU", "内存", "下载", "上传"][i]}历史，${valid.length} 个有效点`}
                  preserveAspectRatio="none"
                >
                  <path d="M0 89H400M0 45H400" className="chart-grid" />
                  {row.flatMap((s, j) =>
                    chartSegments(
                      s.points,
                      start,
                      end,
                      max,
                      s.interval_seconds
                        ? s.interval_seconds * 2500
                        : Math.max(180000, (hours * 3600000) / 40),
                    ).map((path, k) => (
                      <path
                        key={`${j}-${k}`}
                        d={path}
                        className={`chart-line line-${i}`}
                      />
                    )),
                  )}
                </svg>
                <div className="chart-times">
                  <span>
                    {new Date(start).toLocaleTimeString("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span>
                    {new Date(end).toLocaleTimeString("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
