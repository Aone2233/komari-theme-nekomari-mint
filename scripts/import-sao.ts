import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { acquisitionTime, premiumSettings } from "../src/cost";
import type { NodeInfo, PingTask } from "../src/types";

type Settings = Record<string, unknown>;
const object = (value: unknown): Settings => {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw Error("Expected settings object");
  return parsed as Settings;
};

export function prepareSaoImport(input: {
  sao: Settings;
  mint: Settings;
  nodes: NodeInfo[];
  tasks: PingTask[];
  rates: { base: string; quote: string; rate: number; date: string }[];
  rateSource: string;
  acquisitionOffsetMinutes: number;
}) {
  const { sao, nodes, tasks } = input;
  const settings = structuredClone(input.mint);
  const premiums = object(settings.costPremiums ?? {});
  const source = object(sao.costPremiums ?? {});
  let importedPremiums = 0;
  for (const [uuid, raw] of Object.entries(source)) {
    if (!nodes.some((node) => node.uuid === uuid)) continue;
    if (Object.hasOwn(premiums, uuid))
      throw Error("Existing Mint premium conflicts with SAO import");
    const entry = typeof raw === "number" ? { amount: raw } : object(raw);
    if (
      entry.acquiredAt !== undefined &&
      acquisitionTime(entry.acquiredAt) === null
    )
      throw Error("Invalid SAO acquisition date");
    const imported = {
      ...entry,
      amortization: "sao",
      acquiredOffsetMinutes: input.acquisitionOffsetMinutes,
    };
    const validated = premiumSettings({ [uuid]: imported });
    if (validated.warnings.length || !validated.entries[uuid])
      throw Error("Invalid SAO premium metadata");
    premiums[uuid] = validated.entries[uuid];
    importedPremiums++;
  }
  settings.costPremiums = JSON.stringify(premiums);
  const ignoredRaw =
    typeof sao.costIgnoredNodes === "string"
      ? (() => {
          try {
            return JSON.parse(sao.costIgnoredNodes);
          } catch {
            return sao.costIgnoredNodes.split(/[\n,，;；]+/);
          }
        })()
      : (sao.costIgnoredNodes ?? []);
  if (!Array.isArray(ignoredRaw)) throw Error("Invalid SAO exclusion list");
  const ignored = new Set<string>(
    JSON.parse(
      typeof settings.costIgnoredNodes === "string"
        ? settings.costIgnoredNodes
        : JSON.stringify(settings.costIgnoredNodes ?? []),
    ),
  );
  for (const identity of ignoredRaw) {
    if (typeof identity !== "string" || !identity.trim()) continue;
    const matches = nodes.filter((node) =>
      [node.uuid, node.name, node.public_remark].some(
        (v) => v?.trim().toLowerCase() === identity.trim().toLowerCase(),
      ),
    );
    if (matches.length !== 1)
      throw Error(
        "SAO exclusion is missing or ambiguous; manual review needed",
      );
    ignored.add(matches[0].uuid);
  }
  settings.costIgnoredNodes = JSON.stringify([...ignored]);
  const bindings = object(sao.homepagePingBindings ?? {});
  const selected = object(settings.primaryPingByNode ?? {});
  let importedBindings = 0;
  const warnings: string[] = [];
  for (const node of nodes) {
    if (Object.hasOwn(selected, node.uuid)) continue;
    const ids = Object.entries(bindings)
      .filter(
        ([id, uuids]) =>
          /^\d+$/.test(id) &&
          Number.isSafeInteger(Number(id)) &&
          Number(id) > 0 &&
          Array.isArray(uuids) &&
          uuids.includes(node.uuid),
      )
      .map(([id]) => Number(id))
      .sort((a, b) => a - b);
    if (!ids.length) continue;
    const id = ids[0];
    const task = tasks.find((t) => t.id === id);
    if (!task || (task.clients?.length && !task.clients.includes(node.uuid))) {
      warnings.push(`主任务 ${id} 未分配或已删除，未迁移 ${node.name}`);
      continue;
    }
    selected[node.uuid] = id;
    importedBindings++;
  }
  settings.primaryPingByNode = JSON.stringify(selected);
  if (
    settings.exchangeRates === undefined ||
    Object.keys(object(settings.exchangeRates)).every((key) =>
      ["CNY", "RMB", "¥"].includes(key),
    )
  ) {
    const rates: Record<string, number> = { CNY: 1 };
    const cny = input.rates.find(
      (row) => row.base === "USD" && row.quote === "CNY",
    );
    if (
      !cny ||
      !Number.isFinite(cny.rate) ||
      cny.rate <= 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(cny.date)
    )
      throw Error("Missing dated CNY rate");
    for (const row of input.rates) {
      // Snapshot one as-of date, never mix older quotes into it.
      if (row.date !== cny.date) continue;
      if (
        row.base !== "USD" ||
        !/^[A-Z]{3}$/.test(row.quote) ||
        !Number.isFinite(row.rate) ||
        row.rate <= 0
      )
        throw Error("Inconsistent exchange rate response");
      if (row.quote !== "CNY") rates[row.quote] = cny.rate / row.rate;
    }
    if (!rates.USD) rates.USD = cny.rate;
    const aliases: Record<string, string> = {
      $: "USD",
      US$: "USD",
      "€": "EUR",
      "¥": "CNY",
      "￥": "CNY",
      RMB: "CNY",
    };
    for (const node of nodes) {
      if (node.price === -1 || !node.price || node.billing_cycle === -1)
        continue;
      const key = (node.currency || "").trim().toUpperCase();
      if (!rates[aliases[key] || key])
        throw Error("Required node currency has no same-date exchange rate");
    }
    settings.exchangeRates = JSON.stringify(rates);
    settings.costRateSnapshot = `${input.rateSource} · ${cny.date} · 静态快照（原 SAO 同源）`;
  }
  // Preserve an existing choice; imported premiums remain separate in both totals.
  settings.costIncludePremium ??= true;
  return {
    settings,
    importedPremiums,
    importedBindings,
    ignored: ignored.size,
    warnings,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output)
    throw Error(
      "Usage: node --import tsx scripts/import-sao.ts INPUT.json OUTPUT.json (prepare only; never writes a server)",
    );
  const result = prepareSaoImport(JSON.parse(await readFile(input, "utf8")));
  await writeFile(output, JSON.stringify(result, null, 2) + "\n", {
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      importedPremiums: result.importedPremiums,
      importedBindings: result.importedBindings,
      ignored: result.ignored,
      warnings: result.warnings,
    }),
  );
}
