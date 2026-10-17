import { carrierFor } from "./data";
import type { PingSeries, PingTask, Site } from "./types";

function parsed(value: unknown): unknown {
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return null;
  }
}
function taskID(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

export function primaryPing(
  uuid: string,
  tasks: PingTask[],
  series: PingSeries[],
  settings?: Site["theme_settings"],
) {
  const bindings = parsed(settings?.primaryPingByNode);
  const override =
    bindings &&
    typeof bindings === "object" &&
    !Array.isArray(bindings) &&
    Object.hasOwn(bindings, uuid)
      ? taskID((bindings as Record<string, unknown>)[uuid])
      : null;
  const priorities = parsed(settings?.primaryPingTasks);
  const eligible = tasks.filter(
    (task) => !task.clients?.length || task.clients.includes(uuid),
  );
  const preferred = Array.isArray(priorities)
    ? priorities
        .map(taskID)
        .filter((id) => id !== null)
        .find((id) => eligible.some((task) => task.id === id))
    : undefined;
  // Choose by configuration/identity, never fastest or last-successful latency.
  const task =
    override !== null
      ? eligible.find((task) => task.id === override)
      : preferred !== undefined
        ? eligible.find((task) => task.id === preferred)
        : [...eligible].sort((a, b) => {
            const rank = (t: PingTask) =>
              !carrierFor(t, settings) && t.type !== "icmp"
                ? 0
                : t.type !== "icmp"
                  ? 1
                  : 2;
            return rank(a) - rank(b) || a.id - b.id;
          })[0];
  const rows = task
    ? series.filter((row) => row.records[0]?.task_id === task.id)
    : [];
  const rankRow = (row: PingSeries) =>
    (row.protocol === "tcp" ? 0 : row.protocol === "http" ? 1 : 2) * 10 +
    (row.family === "ipv4" ? 0 : row.family === "ipv6" ? 1 : 2);
  return {
    task,
    series: [...rows].sort(
      (a, b) => rankRow(a) - rankRow(b) || a.key.localeCompare(b.key),
    )[0],
    configured: override !== null || preferred !== undefined,
    missing: override !== null && !task,
  };
}
