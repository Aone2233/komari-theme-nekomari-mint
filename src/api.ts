import type {
  Extension,
  LiveStatus,
  NodeInfo,
  PingRecord,
  PingTask,
  Site,
} from "./types";

let nextID = 0;
export class ApiError extends Error {
  constructor(
    message: string,
    public code?: number,
  ) {
    super(message);
  }
}
export async function rpc<T>(
  method: string,
  params: object = {},
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch("/api/rpc2", {
    method: "POST",
    credentials: "same-origin",
    signal: signal || AbortSignal.timeout(20_000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: ++nextID }),
  });
  const body = await response.json();
  if (body.error) throw new ApiError(body.error.message, body.error.code);
  if (!response.ok || !("result" in body))
    throw new ApiError(`接口响应异常 (${response.status})`);
  return body.result as T;
}
export async function loadOverview() {
  const [site, nodes, live, tasks] = await Promise.all([
    rpc<Site>("public:getPublicSettings"),
    rpc<Record<string, NodeInfo>>("common:getNodes"),
    rpc<Record<string, LiveStatus>>("common:getNodesLatestStatus", {
      include_ping: false,
    }),
    rpc<PingTask[]>("public:getPublicPingTasks"),
  ]);
  return {
    site,
    nodes: Object.values(nodes).sort(
      (a, b) => (b.weight || 0) - (a.weight || 0),
    ),
    live,
    tasks,
  };
}
export async function loadPings(uuid: string): Promise<PingRecord[]> {
  const result = await rpc<{ records: PingRecord[] }>("public:getPingRecords", {
    uuid,
    hours: "1",
  });
  return result.records || [];
}
export async function loadExtension(uuid: string): Promise<Extension | null> {
  try {
    return await rpc<Extension>("public:getNodeInsights", {
      uuid,
      include_ip: true,
    });
  } catch (error) {
    if (error instanceof ApiError && error.code === -32601) return null;
    throw error;
  }
}

export function isPrivateError(error: unknown): boolean {
  return (
    error instanceof Error &&
    ((error instanceof ApiError && error.code === -32003) ||
      /private site|please login/i.test(error.message))
  );
}
