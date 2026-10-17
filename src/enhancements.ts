import type { Extension, LiveStatus } from "./types";

const tagColors: Record<string, string> = {
  tomato: "#cf634b",
  red: "#c35e5a",
  ruby: "#be4d6c",
  crimson: "#bb526d",
  pink: "#b85d92",
  plum: "#9d649a",
  purple: "#9265a6",
  violet: "#7c6eac",
  iris: "#6d70b4",
  indigo: "#5f72ad",
  blue: "#4c86b2",
  cyan: "#3e94a6",
  teal: "#3d927f",
  jade: "#3b9271",
  green: "#45855e",
  grass: "#648b48",
  lime: "#839545",
  mint: "#3f977e",
  sky: "#4f95b3",
  amber: "#a67b31",
  yellow: "#9d8836",
  orange: "#bc7840",
  gold: "#98834b",
  bronze: "#9e7b61",
  gray: "#7e8880",
  slate: "#73838d",
  mauve: "#867a89",
  sage: "#6a8878",
};
export function parseTags(raw = "") {
  return raw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((value) => {
      const match = value.match(/^(.*?)<([a-z]+)>$/i);
      return {
        text: (match?.[1] || value).trim(),
        color: tagColors[match?.[2].toLowerCase() || ""] || "#648370",
      };
    });
}
export function duration(value?: number | null) {
  if (value == null || !Number.isFinite(value) || value < 0) return "—";
  const days = Math.floor(value / 86400),
    hours = Math.floor((value % 86400) / 3600);
  return days
    ? `${days} 天 ${hours} 小时`
    : `${hours} 小时 ${Math.floor((value % 3600) / 60)} 分`;
}
export function extensionMessage(
  ext: Extension | null,
  error: boolean,
  enabled: boolean,
  loading: boolean,
) {
  if (!enabled) return "扩展检测已关闭";
  if (loading) return "正在读取检测快照";
  if (error) return "检测快照读取失败，可刷新重试";
  if (!ext)
    return "服务端未提供 Mint 扩展，请升级 Nekomari；官方 Komari 保留基础监控";
  if (!ext.unlock) return "Agent 尚未上报流媒体检测快照";
  if (ext.unlock.stale) return "检测快照已过期，等待 Agent 下一轮上报";
  return `检测于 ${new Date(ext.unlock.probed_at).toLocaleString("zh-CN")} · 回程${ext.routes ? "已有探测" : "尚未配置 Agent 目标"}`;
}
export function healthyConnections(live?: LiveStatus) {
  return live?.connections != null && live.quality?.connections !== "unknown"
    ? live.connections
    : null;
}
