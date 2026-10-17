import type { NodeInfo, Site } from "./types";

const DAY = 86_400_000;
export const costSettingKeys = [
  "exchangeRates",
  "costIgnoredNodes",
  "costPremiums",
  "costIncludePremium",
  "costRateSnapshot",
] as const;

export interface Premium {
  amount: number;
  acquiredAt?: string;
  months?: number;
  amortization?: "sao";
  paidCny?: number;
  acquiredOffsetMinutes?: number;
}
export interface CostDetail {
  uuid: string;
  name: string;
  monthly: number | null;
  premium: number;
  premiumMonthly: number;
  note: string;
  premiumNote: string;
  ignored: boolean;
  paidCny?: number;
}

function object(value: unknown): Record<string, unknown> | null {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

export function acquisitionTime(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const time = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(time) &&
    new Date(time).toISOString().slice(0, 10) === value
    ? time
    : null;
}

export function premiumSettings(value: unknown) {
  const entries: Record<string, Premium> = Object.create(null);
  const warnings: string[] = [];
  const raw = object(value ?? "{}");
  if (!raw) return { entries, warnings: ["溢价配置不是有效的 JSON 对象"] };
  for (const [uuid, v] of Object.entries(raw)) {
    const entry = finite(v) ? { amount: v } : object(v);
    if (!entry || !finite(entry.amount)) {
      warnings.push("存在无效溢价金额，未计入");
      continue;
    }
    const item: Premium = { amount: entry.amount };
    if (entry.amortization !== undefined) {
      if (entry.amortization === "sao") item.amortization = "sao";
      else warnings.push("存在无效摊销模式，未使用");
    }
    if (entry.paidCny !== undefined) {
      if (finite(entry.paidCny) && entry.paidCny >= 0)
        item.paidCny = entry.paidCny;
      else warnings.push("存在无效收购价，未使用");
    }
    if (entry.acquiredOffsetMinutes !== undefined) {
      if (
        finite(entry.acquiredOffsetMinutes) &&
        Number.isInteger(entry.acquiredOffsetMinutes) &&
        Math.abs(entry.acquiredOffsetMinutes) <= 840
      )
        item.acquiredOffsetMinutes = entry.acquiredOffsetMinutes;
      else warnings.push("存在无效收购日期时区，未使用");
    }
    if (entry.acquiredAt !== undefined) {
      if (acquisitionTime(entry.acquiredAt) === null)
        warnings.push("存在无效收购日期，未摊销");
      else item.acquiredAt = String(entry.acquiredAt);
    }
    if (entry.months !== undefined) {
      if (!finite(entry.months) || entry.months <= 0)
        warnings.push("存在无效摊销月数，未摊销");
      else item.months = entry.months;
    }
    entries[uuid] = item;
  }
  return { entries, warnings: [...new Set(warnings)] };
}

export function ignoredCostNodes(value: unknown): string[] {
  try {
    const v = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(v)
      ? v.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

const aliases: Record<string, string> = {
  RMB: "CNY",
  "¥": "CNY",
  "￥": "CNY",
  人民币: "CNY",
  元: "CNY",
  "CN¥": "CNY",
  $: "USD",
  US$: "USD",
  美元: "USD",
  美金: "USD",
  "€": "EUR",
  欧元: "EUR",
  HK$: "HKD",
  港币: "HKD",
  港元: "HKD",
  NT$: "TWD",
  台币: "TWD",
  "JP¥": "JPY",
  日元: "JPY",
  円: "JPY",
  "£": "GBP",
  英镑: "GBP",
  S$: "SGD",
  A$: "AUD",
  C$: "CAD",
};
function currency(value: string) {
  const key = value.trim().toUpperCase();
  return Object.hasOwn(aliases, key) ? aliases[key] : key;
}

function exchangeRates(value: unknown) {
  const rates = new Map<string, number>([["CNY", 1]]);
  const raw = object(value ?? "{}");
  const warnings = raw ? [] : ["汇率配置不是有效的 JSON 对象"];
  for (const [key, value] of Object.entries(raw || {})) {
    if (currency(key) === "CNY") continue;
    if (finite(value) && value > 0) rates.set(key.trim().toUpperCase(), value);
    else warnings.push("存在无效汇率，相关币种未计入");
  }
  // Exact saved keys take precedence; aliases fill only missing canonical codes.
  for (const [key, value] of [...rates]) {
    if (!rates.has(currency(key))) rates.set(currency(key), value);
  }
  return { rates, warnings };
}

export function billingMonths(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value).trim().toLowerCase();
  if (!text) return null;
  if (["monthly", "month", "月", "月付"].includes(text)) return 1;
  if (["quarterly", "季度", "季付"].includes(text)) return 3;
  if (["yearly", "annual", "年", "年付"].includes(text)) return 12;
  if (["lifetime", "once", "一次性", "永久"].includes(text)) return 0;
  const days = Number(text);
  if (!Number.isFinite(days)) return null;
  if (days === -1) return 0;
  if (days <= 0) return null;
  if (days >= 28 && days <= 31) return 1;
  if (days >= 89 && days <= 93) return 3;
  if (days >= 180 && days <= 184) return 6;
  if (days >= 360 && days <= 366) return 12;
  if (days % 365 === 0) return (days / 365) * 12;
  if (days % 360 === 0) return (days / 360) * 12;
  return days / 30;
}

export function monthlyTotal(
  nodes: NodeInfo[],
  settings?: Site["theme_settings"],
  now = Date.now(),
) {
  const { rates, warnings } = exchangeRates(settings?.exchangeRates);
  const premiums = premiumSettings(settings?.costPremiums);
  warnings.push(...premiums.warnings);
  const ignored = new Set(ignoredCostNodes(settings?.costIgnoredNodes));
  const details: CostDetail[] = [];
  let recurring = 0,
    premium = 0,
    premiumMonthly = 0,
    included = 0,
    skipped = 0,
    unpriced = 0,
    invalidCycle = 0,
    ignoredCount = 0,
    amortized = 0,
    pendingPremiums = 0;
  for (const node of nodes) {
    const d: CostDetail = {
      uuid: node.uuid,
      name: node.name,
      monthly: null,
      premium: 0,
      premiumMonthly: 0,
      note: "",
      premiumNote: "",
      ignored: ignored.has(node.uuid),
    };
    details.push(d);
    if (d.ignored) {
      d.note = "已排除";
      ignoredCount++;
      continue;
    }
    const p = Object.hasOwn(premiums.entries, node.uuid)
      ? premiums.entries[node.uuid]
      : undefined;
    if (p) {
      d.premium = p.amount;
      d.paidCny = p.paidCny;
      premium += p.amount;
      const day = acquisitionTime(p.acquiredAt);
      const acquired =
        day === null ? null : day - (p.acquiredOffsetMinutes || 0) * 60000;
      if (p.amount !== 0) {
        if (p.amortization === "sao") {
          if (acquired === null || acquired > now) {
            d.premiumNote =
              acquired === null
                ? "SAO 口径：缺收购日期，仅计一次性溢价"
                : "尚未到收购日期";
            pendingPremiums++;
          } else {
            const expiry = node.expired_at ? Date.parse(node.expired_at) : NaN;
            const span =
              Number.isFinite(expiry) &&
              expiry > acquired &&
              expiry - acquired < 100 * 365 * DAY
                ? expiry - acquired
                : now - acquired;
            const months = Math.max(1, span / (30 * DAY));
            const amount = p.amount / months;
            if (Number.isFinite(amount)) {
              d.premiumMonthly = amount;
              premiumMonthly += amount;
              amortized++;
              d.premiumNote = `SAO 口径：${months.toFixed(2)} 个月（随到期日 / 持有时长变化）`;
            } else {
              d.premiumNote = "摊销数值超出范围，未计入";
              pendingPremiums++;
            }
          }
        } else if (acquired === null || !p.months) {
          d.premiumNote = "缺收购日期或摊销月数，仅计一次性溢价";
          pendingPremiums++;
        } else if (acquired > now) {
          d.premiumNote = "尚未到收购日期";
          pendingPremiums++;
        } else if (now >= acquired + p.months * 30 * DAY)
          d.premiumNote = "摊销已结束";
        else {
          const amount = p.amount / p.months;
          if (Number.isFinite(amount)) {
            d.premiumMonthly = amount;
            premiumMonthly += amount;
            amortized++;
            d.premiumNote = `按 ${p.months} 个月摊销`;
          } else {
            d.premiumNote = "摊销数值超出范围，未计入";
            pendingPremiums++;
          }
        }
      }
    }
    if (node.price === -1) {
      d.monthly = 0;
      d.note = "免费";
      included++;
      continue;
    }
    if (!finite(node.price) || node.price <= 0) {
      d.note = "未填有效价格";
      unpriced++;
      continue;
    }
    const months = billingMonths(node.billing_cycle);
    if (months === null) {
      d.note = "计费周期无效";
      invalidCycle++;
      continue;
    }
    if (months === 0) {
      d.monthly = 0;
      d.note = "一次性付费，不计续费月费";
      included++;
      continue;
    }
    const key = (node.currency || "").trim().toUpperCase();
    const rate = rates.get(key) ?? rates.get(currency(key));
    if (!rate) {
      d.note = "缺汇率或币种";
      skipped++;
      continue;
    }
    const amount = (node.price * rate) / months;
    if (!Number.isFinite(amount)) {
      d.note = "费用数值超出范围";
      unpriced++;
      continue;
    }
    d.monthly = amount;
    recurring += amount;
    included++;
  }
  const effective = recurring + premiumMonthly;
  const includePremium = settings?.costIncludePremium === true;
  return {
    total: includePremium ? effective : recurring,
    recurring,
    effective,
    premium,
    premiumMonthly,
    included,
    skipped,
    unpriced,
    invalidCycle,
    ignored: ignoredCount,
    pendingPremiums,
    amortized,
    includePremium,
    details,
    warnings: [...new Set(warnings)],
  };
}

export type CostSummary = ReturnType<typeof monthlyTotal>;
