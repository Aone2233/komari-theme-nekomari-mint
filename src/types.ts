export interface NodeInfo {
  uuid: string;
  name: string;
  region?: string;
  group?: string;
  tags?: string;
  os?: string;
  cpu_name?: string;
  cpu_cores?: number;
  arch?: string;
  virtualization?: string;
  mem_total?: number;
  disk_total?: number;
  traffic_limit?: number;
  traffic_limit_type?: string;
  price?: number;
  currency?: string;
  billing_cycle?: number;
  expired_at?: string;
  weight?: number;
  public_remark?: string;
}
export interface LiveStatus {
  client: string;
  time?: string;
  online?: boolean;
  cpu?: number | null;
  ram?: number | null;
  ram_total?: number | null;
  disk?: number | null;
  disk_total?: number | null;
  net_in?: number | null;
  net_out?: number | null;
  net_total_up?: number | null;
  net_total_down?: number | null;
  traffic_up?: number | null;
  traffic_down?: number | null;
  tcp_retrans_percent?: number | null;
  connections?: number | null;
  swap?: number | null;
  swap_total?: number | null;
  uptime?: number | null;
  load?: number | null;
  quality?: Record<string, string>;
}
export interface PingTask {
  id: number;
  name: string;
  type: string;
  interval?: number;
  clients?: string[];
}
export interface PingRecord {
  task_id: number;
  time: string;
  value: number;
  ping_type?: string;
  role?: string;
  family?: string;
}
export interface UnlockItem {
  id: string;
  name: string;
  kind: string;
  status: string;
  basis: string;
  region?: string;
  detail?: string;
}
export interface RouteItem {
  carrier: string;
  target: string;
  label: string;
  reached: boolean;
  hops: number;
  error?: string;
}
export interface Extension {
  version: number;
  unlock: { probed_at: string; stale: boolean; results: UnlockItem[] } | null;
  routes: { probed_at: string; stale: boolean; results: RouteItem[] } | null;
  ip: {
    network: string;
    organization: string;
    country: string;
    source: string;
    stale?: boolean;
  } | null;
}
export interface Site {
  sitename?: string;
  description?: string;
  private_site?: boolean;
  logged_in?: boolean;
  theme_settings?: Record<string, unknown>;
}
export type Carrier = "telecom" | "unicom" | "mobile";
export interface PingSeries {
  key: string;
  name: string;
  carrier?: Carrier;
  protocol: string;
  family?: string;
  records: PingRecord[];
  latest: number | null;
  loss: number | null;
  failures: number;
  total: number;
  median: number | null;
  jitter: number | null;
}
