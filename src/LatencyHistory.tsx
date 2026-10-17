import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { isPrivateError, loadPings } from "./api";
import { chartSegments } from "./chart";
import { pingSeries } from "./data";
import { nearestPing, pingGapMs } from "./latency";
import type { PingRecord, PingTask, Site } from "./types";

const localTime = (time: number) =>
  new Date(time).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
const ms = (value: number | null | undefined) =>
  value == null ? "—" : `${value.toFixed(1)} ms`;

export default function LatencyHistory({
  uuid,
  initialRecords,
  tasks,
  settings,
}: {
  uuid: string;
  initialRecords: PingRecord[];
  tasks: PingTask[];
  settings?: Site["theme_settings"];
}) {
  const [snapshot, setSnapshot] = useState({
    records: initialRecords,
    end: Date.now(),
  });
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let controller: AbortController;
    let timer: ReturnType<typeof setTimeout>;
    let timeout: ReturnType<typeof setTimeout>;
    async function refresh() {
      controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 20000);
      setBusy(true);
      setError("");
      try {
        const records = await loadPings(uuid, controller.signal);
        if (active) setSnapshot({ records, end: Date.now() });
      } catch (e) {
        if (!active) return;
        if (isPrivateError(e)) setSnapshot({ records: [], end: Date.now() });
        setError(
          isPrivateError(e)
            ? "会话已失效，请重新登录"
            : "更新失败，当前保留上次样本；请重试",
        );
      } finally {
        clearTimeout(timeout);
        if (active) {
          setBusy(false);
          timer = setTimeout(refresh, 60000);
        }
      }
    }
    void refresh();
    return () => {
      active = false;
      controller?.abort();
      clearTimeout(timer);
      clearTimeout(timeout);
    };
  }, [uuid, revision]);
  const rows = useMemo(
    () =>
      pingSeries(snapshot.records, tasks, uuid, settings).map((row, i) => ({
        ...row,
        color: `var(--ping-${i % 8})`,
        dash: i < 8 ? undefined : "5 3",
        gap: pingGapMs(
          tasks.find((t) => t.id === row.records[0].task_id)?.interval,
          row.records,
        ),
      })),
    [snapshot, tasks, uuid, settings],
  );
  const visible = rows.filter((row) => !hidden.has(row.key));
  const start = snapshot.end - 3600000,
    end = snapshot.end;
  const peak = visible.reduce(
    (max, row) => row.records.reduce((m, r) => Math.max(m, r.value), max),
    0,
  );
  const max = Math.max(10, Math.ceil((peak * 1.1) / 10) * 10);
  const selectedTime =
    cursor === null ? null : start + (cursor / 1000) * (end - start);
  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  return (
    <section className="latency-history" aria-label="线路观测">
      <div className="history-heading">
        <h3>
          线路观测 <small>近 1 小时</small>
        </h3>
        <button
          className="latency-refresh"
          disabled={busy}
          onClick={() => setRevision((v) => v + 1)}
        >
          {busy ? "更新中…" : "刷新"}
        </button>
      </div>
      <p className="empty-note">
        真实延迟 · 点击图例显隐 · 丢包与断档不连线 · × 表示失败，不是 0 ms
      </p>
      {error && (
        <p role="alert" className="empty-note">
          {error}
        </p>
      )}
      {!rows.length ? (
        <p className="empty-note" role="status">
          {busy
            ? "正在读取线路历史…"
            : error
              ? "暂无可显示的样本。"
              : "暂无历史。请在后台添加延迟监测任务，并分配给此节点。"}
        </p>
      ) : (
        <>
          <div className="latency-legend">
            {rows.map((row) => {
              const latestTime = Date.parse(row.records.at(-1)!.time);
              const fresh =
                Date.now() - latestTime <= Math.max(300000, row.gap);
              return (
                <button
                  key={row.key}
                  aria-pressed={!hidden.has(row.key)}
                  onClick={() => toggle(row.key)}
                  style={{ "--series-color": row.color } as CSSProperties}
                >
                  <i aria-hidden="true" />
                  <span>
                    <b>{row.name}</b>
                    <small>
                      {row.protocol.toUpperCase()} ·{" "}
                      {row.family?.toUpperCase() || "地址族未知"}
                    </small>
                  </span>
                  <span className="latency-legend-value">
                    {fresh ? ms(row.latest) : "样本过期"}
                    <small>丢包 {row.loss?.toFixed(1)}%</small>
                  </span>
                </button>
              );
            })}
          </div>
          {visible.length ? (
            <div className="latency-plot">
              <div className="latency-axis" aria-hidden="true">
                <span>{max} ms</span>
                <span>{max / 2}</span>
                <span>0</span>
              </div>
              <div className="latency-canvas">
                <svg
                  viewBox="0 0 400 90"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label={`延迟折线图，${visible.length} 条线路，丢包与断档不连线`}
                  onPointerMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setCursor(
                      Math.round(
                        Math.max(
                          0,
                          Math.min(1, (e.clientX - rect.left) / rect.width),
                        ) * 1000,
                      ),
                    );
                  }}
                  onPointerLeave={() => setCursor(null)}
                >
                  <path
                    d="M0 6H400M0 47.5H400M0 89H400"
                    className="chart-grid"
                  />
                  {visible.map((row) => (
                    <g key={row.key} style={{ color: row.color }}>
                      {chartSegments(row.records, start, end, max, row.gap).map(
                        (path, i) => (
                          <path
                            key={i}
                            d={path}
                            className="latency-line"
                            strokeDasharray={row.dash}
                          />
                        ),
                      )}
                      <path
                        className="latency-failures"
                        d={row.records
                          .filter(
                            (r) =>
                              r.value < 0 &&
                              Date.parse(r.time) >= start &&
                              Date.parse(r.time) <= end,
                          )
                          .map((r) => {
                            const x =
                              ((Date.parse(r.time) - start) / (end - start)) *
                              400;
                            return `M${x - 1},85L${x + 1},89M${x - 1},89L${x + 1},85`;
                          })
                          .join("")}
                      />
                    </g>
                  ))}
                  {cursor !== null && (
                    <path
                      d={`M${cursor / 2.5} 0V90`}
                      className="latency-cursor"
                    />
                  )}
                </svg>
                <div className="chart-times">
                  <span>{localTime(start)}</span>
                  <span>{localTime((start + end) / 2)}</span>
                  <span>{localTime(end)}</span>
                </div>
              </div>
              <label className="latency-scrubber">
                查看采样时刻
                <input
                  type="range"
                  min="0"
                  max="1000"
                  value={cursor ?? 1000}
                  aria-label="线路采样时刻"
                  aria-valuetext={localTime(selectedTime ?? end)}
                  onFocus={() => setCursor((value) => value ?? 1000)}
                  onChange={(e) => setCursor(Number(e.target.value))}
                />
              </label>
              <div
                className="latency-readout"
                aria-live="polite"
                aria-atomic="true"
              >
                {selectedTime === null ? (
                  <span>悬停图表，或拖动时间轴 / 使用方向键查看采样。</span>
                ) : (
                  <>
                    <time>{localTime(selectedTime)}</time>
                    {visible.map((row) => {
                      const point = nearestPing(
                        row.records,
                        selectedTime,
                        row.gap / 5,
                      );
                      return (
                        <span
                          key={row.key}
                          style={
                            { "--series-color": row.color } as CSSProperties
                          }
                        >
                          <i aria-hidden="true" />
                          {row.name} · {row.protocol.toUpperCase()} /{" "}
                          {row.family?.toUpperCase() || "未知"}：
                          <b>
                            {!point
                              ? "无邻近样本"
                              : point.value < 0
                                ? "探测失败"
                                : ms(point.value)}
                          </b>
                          {point && (
                            <small>
                              （{localTime(Date.parse(point.time))}）
                            </small>
                          )}
                        </span>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          ) : (
            <p className="empty-note">已隐藏全部线路，点击图例恢复显示。</p>
          )}
          <details className="latency-stats">
            <summary>样本统计与观测依据 · {rows.length} 条线路</summary>
            {rows.map((row) => (
              <p key={row.key}>
                {row.name} · {row.protocol.toUpperCase()} /{" "}
                {row.family?.toUpperCase() || "地址族未知"} · 样本 {row.total} ·
                失败 {row.failures} · 中位 {ms(row.median)} · 抖动 MAD{" "}
                {ms(row.jitter)}
              </p>
            ))}
          </details>
          <p className="empty-note">
            更新于 {localTime(end)} · 每 60 秒刷新 ·
            时间为浏览器本地时区；丢包率仅统计已返回的样本，不把缺测计为成功。
          </p>
        </>
      )}
    </section>
  );
}
