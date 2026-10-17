import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { isPrivateError, loadPings } from "./api";
import { chartSegments } from "./chart";
import { pingSeries } from "./data";
import {
  failureLabel,
  MIN_PING_SAMPLES,
  nearestPing,
  pingGapMs,
  pingSummary,
} from "./latency";
import {
  customQueryHours,
  HISTORY_PRESETS,
  historyLimit,
  localDateInput,
  validateHistoryRange,
  type FixedRange,
} from "./historyRange";
import type { PingRecord, PingTask, Site } from "./types";

const localTime = (time: number, withDate = false) =>
  new Date(time).toLocaleString("zh-CN", {
    ...(withDate ? ({ month: "2-digit", day: "2-digit" } as const) : {}),
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
  active = true,
  preserveHours,
}: {
  uuid: string;
  initialRecords: PingRecord[];
  tasks: PingTask[];
  settings?: Site["theme_settings"];
  active?: boolean;
  preserveHours?: number;
}) {
  const limit = historyLimit(preserveHours);
  const [choice, setChoice] = useState("1");
  const [custom, setCustom] = useState<FixedRange | null>(null);
  const [from, setFrom] = useState(() =>
    localDateInput(Date.now() - Math.min(24, limit) * 3600000 + 60000),
  );
  const [to, setTo] = useState(() => localDateInput(Date.now()));
  const [rangeError, setRangeError] = useState("");
  const customMode = choice === "custom";
  const hours = customMode
    ? custom
      ? (custom.end - custom.start) / 3600000
      : 1
    : Number(choice);
  const rangeKey = customMode
    ? custom
      ? `${custom.start}:${custom.end}`
      : "pending"
    : choice;
  const rangeLabel = customMode ? "自定义区间" : `近 ${hours} 小时`;
  const initialEnd = Date.now();
  const [snapshot, setSnapshot] = useState({
    uuid,
    key: "1",
    records: initialRecords,
    start: initialEnd - 3600000,
    end: initialEnd,
    fetchedAt: initialEnd,
  });
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!active || rangeKey === "pending") {
      setBusy(false);
      return;
    }
    let alive = true;
    let controller: AbortController;
    let timer: ReturnType<typeof setTimeout>;
    let timeout: ReturnType<typeof setTimeout>;
    async function refresh() {
      controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 20000);
      setBusy(true);
      setError("");
      try {
        const queryHours = customMode
          ? customQueryHours(custom!, limit)
          : hours;
        const records = await loadPings(uuid, controller.signal, queryHours);
        const end = customMode ? custom!.end : Date.now();
        if (alive)
          setSnapshot({
            uuid,
            key: rangeKey,
            records,
            start: customMode ? custom!.start : end - hours * 3600000,
            end,
            fetchedAt: Date.now(),
          });
      } catch (e) {
        if (!alive) return;
        if (isPrivateError(e))
          setSnapshot({
            uuid,
            key: rangeKey,
            records: [],
            start: 0,
            end: Date.now(),
            fetchedAt: Date.now(),
          });
        setError(
          isPrivateError(e)
            ? "会话已失效，请重新登录"
            : `${rangeLabel}更新失败；仅保留此范围上次样本（如有），请重试`,
        );
      } finally {
        clearTimeout(timeout);
        if (alive) {
          setBusy(false);
          if (!customMode) timer = setTimeout(refresh, 60000);
        }
      }
    }
    void refresh();
    return () => {
      alive = false;
      controller?.abort();
      clearTimeout(timer);
      clearTimeout(timeout);
    };
  }, [
    uuid,
    hours,
    rangeKey,
    customMode,
    custom,
    limit,
    rangeLabel,
    revision,
    active,
  ]);
  // A range's old response must never masquerade as the newly selected range.
  const current =
    snapshot.uuid === uuid && snapshot.key === rangeKey ? snapshot : null;
  const end = current?.end ?? (customMode && custom ? custom.end : Date.now());
  const start =
    current?.start ??
    (customMode && custom ? custom.start : end - hours * 3600000);
  const rows = useMemo(
    () =>
      pingSeries(current?.records || [], tasks, uuid, settings, {
        start,
        end,
      }).map((row, i) => ({
        ...row,
        summary: pingSummary(row.records),
        color: `var(--ping-${i % 8})`,
        dash: i < 8 ? undefined : "5 3",
        gap: pingGapMs(
          tasks.find((t) => t.id === row.records[0].task_id)?.interval,
          row.records,
          customMode ? Math.max(2, hours) : hours,
        ),
      })),
    [current, tasks, uuid, settings, start, end, hours, customMode],
  );
  const visible = rows.filter((row) => !hidden.has(row.key));
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
        <h3>线路观测</h3>
        <div className="latency-controls">
          <div
            className="range-presets"
            role="group"
            aria-label="线路历史时间范围"
          >
            {HISTORY_PRESETS.map((h) => (
              <button
                key={h}
                type="button"
                aria-pressed={choice === String(h)}
                disabled={h > limit}
                title={h > limit ? `面板保留时长为 ${limit} 小时` : undefined}
                onClick={() => {
                  setChoice(String(h));
                  setCursor(null);
                  setError("");
                  setRangeError("");
                }}
              >
                近 {h} 小时
              </button>
            ))}
            <button
              type="button"
              aria-pressed={customMode}
              onClick={() => {
                setChoice("custom");
                setCursor(null);
                setError("");
              }}
            >
              自定义
            </button>
          </div>
          <button
            className="latency-refresh"
            disabled={busy || rangeKey === "pending"}
            onClick={() => setRevision((v) => v + 1)}
          >
            {busy ? "更新中…" : "刷新"}
          </button>
        </div>
      </div>
      {customMode && (
        <form
          className="custom-range"
          onSubmit={(event) => {
            event.preventDefault();
            const checked = validateHistoryRange(from, to, limit);
            setRangeError(checked.error);
            if (checked.range) {
              setCustom(checked.range);
              setCursor(null);
              setError("");
              setRevision((v) => v + 1);
            }
          }}
        >
          <label>
            开始时间
            <input
              type="datetime-local"
              aria-label="线路图开始时间"
              value={from}
              max={localDateInput(Date.now())}
              onChange={(e) => setFrom(e.target.value)}
              required
            />
          </label>
          <label>
            结束时间
            <input
              type="datetime-local"
              aria-label="线路图结束时间"
              value={to}
              max={localDateInput(Date.now())}
              onChange={(e) => setTo(e.target.value)}
              required
            />
          </label>
          <button className="latency-refresh" type="submit">
            应用区间
          </button>
          <p className="empty-note">
            浏览器本地时区 · 旧接口从当前回溯到开始时间后精确裁剪，最大回溯{" "}
            {limit} 小时；自定义区间不自动刷新。
          </p>
          {rangeError && <p role="alert">{rangeError}</p>}
        </form>
      )}
      <p className="empty-note">
        {rangeLabel}真实延迟 · 点击图例显隐 · 失败与断档不连线 · ×
        表示失败，不是 0 ms
        {hours > 1 && " · 标准聚合时间网格适配，不把稀疏记录当连续采样"}
      </p>
      <p className="empty-note">
        ICMP 统计丢包率，TCP 统计连接失败率，HTTP
        统计请求失败率；均不代表业务流量损失或持续时间 SLA。
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
              : rangeKey === "pending"
                ? "请设置自定义起止时间并应用区间。"
                : "暂无历史。此范围内未返回样本，请确认历史保留时长、任务已配置并分配给此节点。"}
        </p>
      ) : (
        <>
          <p className="empty-note latency-window">
            请求范围：{localTime(start, true)} — {localTime(end, true)}
            。逐线路实际返回起止与样本数见下方统计；不以首尾跨度冒充完整覆盖。
          </p>
          <div className="latency-selection">
            <span>
              显示 {visible.length} / {rows.length} 条线路
            </span>
            <button type="button" onClick={() => setHidden(new Set())}>
              全选
            </button>
            <button
              type="button"
              onClick={() => setHidden(new Set(rows.map((row) => row.key)))}
            >
              全不选
            </button>
          </div>
          <div className="latency-legend">
            {rows.map((row) => {
              const latestTime = Date.parse(row.records.at(-1)!.time);
              const age = Date.now() - latestTime;
              const fresh = age >= -30000 && age <= 300000;
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
                    {customMode
                      ? "历史样本"
                      : fresh
                        ? row.latest === null
                          ? "探测失败"
                          : ms(row.latest)
                        : "样本过期"}
                    <small>
                      {failureLabel(row.protocol)} {row.loss?.toFixed(1)}%
                    </small>
                    <small>
                      {row.total < MIN_PING_SAMPLES
                        ? `${customMode ? "样本不足" : "采集中"} ${row.total}/${MIN_PING_SAMPLES}`
                        : "历史统计"}
                    </small>
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
                  aria-label={`延迟折线图，${visible.length} 条线路，失败与断档不连线`}
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
                  <span>{localTime(start, customMode || hours > 1)}</span>
                  <span>
                    {localTime((start + end) / 2, customMode || hours > 1)}
                  </span>
                  <span>{localTime(end, customMode || hours > 1)}</span>
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
                  aria-valuetext={localTime(
                    selectedTime ?? end,
                    customMode || hours > 1,
                  )}
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
                    <time>
                      {localTime(selectedTime, customMode || hours > 1)}
                    </time>
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
                              （
                              {localTime(
                                Date.parse(point.time),
                                customMode || hours > 1,
                              )}
                              ）
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
            <summary>
              样本统计与观测依据 · {rangeLabel} · {rows.length} 条线路
            </summary>
            {rows.map((row) => (
              <div className="latency-stat-row" key={row.key}>
                <p>
                  {row.name} · {row.protocol.toUpperCase()} /{" "}
                  {row.family?.toUpperCase() || "地址族未知"} · 样本 {row.total}{" "}
                  · 失败 {row.failures} · 中位 {ms(row.median)} · 抖动 MAD{" "}
                  {ms(row.jitter)}
                </p>
                <div className="latency-stat-grid">
                  <span>
                    最新样本值
                    <b>{row.latest === null ? "探测失败" : ms(row.latest)}</b>
                  </span>
                  <span>
                    最小 / 最大
                    <b>
                      {ms(row.summary.min)} / {ms(row.summary.max)}
                    </b>
                  </span>
                  <span>
                    平均 / P95
                    <b>
                      {ms(row.summary.average)} / {ms(row.summary.p95)}
                    </b>
                  </span>
                  <span>
                    {failureLabel(row.protocol)}
                    <b>{row.loss?.toFixed(1)}%</b>
                  </span>
                </div>
                <p className="latency-coverage">
                  实际返回范围：
                  {row.summary.first === null
                    ? "无样本"
                    : `${localTime(row.summary.first, true)} — ${localTime(row.summary.last!, true)}`}{" "}
                  · 成功 {row.summary.success} / 返回 {row.total} ·{" "}
                  {row.total < MIN_PING_SAMPLES
                    ? `采集中，至少 ${MIN_PING_SAMPLES} 个返回样本后参与评级`
                    : "样本数达标，当前评级还需样本新鲜"}
                  。
                </p>
                <p>
                  时间跨度不代表连续覆盖；最新样本值不等于当前状态，统计量仅针对已返回记录，聚合点不代表原始探测次数。
                </p>
              </div>
            ))}
          </details>
          <p className="empty-note">
            查询完成于 {localTime(current?.fetchedAt ?? end, true)} ·{" "}
            {customMode ? "固定自定义区间，手动刷新" : "每 60 秒刷新"} ·
            时间为浏览器本地时区；失败比例仅统计已返回的样本，不把缺测计为成功。
            实际历史长度取决于面板保留设置，旧记录可能已聚合，不补造缺失样本。
          </p>
        </>
      )}
    </section>
  );
}
