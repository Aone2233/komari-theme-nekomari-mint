import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { rpc } from "./api";
import {
  acquisitionTime,
  costSettingKeys,
  ignoredCostNodes,
  monthlyTotal,
  premiumSettings,
  type Premium,
} from "./cost";
import type { NodeInfo, Site } from "./types";

type Draft = { amount: string; acquiredAt: string; months: string };
const signature = (s: Site["theme_settings"]) =>
  JSON.stringify(costSettingKeys.map((key) => s?.[key]));

export default function CostPanel({
  nodes,
  settings,
  hideAmounts,
  onClose,
  onSaved,
}: {
  nodes: NodeInfo[];
  settings: Site["theme_settings"];
  hideAmounts: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [admin, setAdmin] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [initial] = useState(settings);
  const parsed = premiumSettings(initial?.costPremiums);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      nodes.map((node) => {
        const p = parsed.entries[node.uuid];
        return [
          node.uuid,
          {
            amount: p ? String(p.amount) : "",
            acquiredAt: p?.acquiredAt || "",
            months: p?.months ? String(p.months) : "",
          },
        ];
      }),
    ),
  );
  const [ignored, setIgnored] = useState(() =>
    ignoredCostNodes(initial?.costIgnoredNodes),
  );
  const [includePremium, setIncludePremium] = useState(
    initial?.costIncludePremium === true,
  );
  const [rates, setRates] = useState(() =>
    typeof initial?.exchangeRates === "string"
      ? initial.exchangeRates
      : JSON.stringify(initial?.exchangeRates || {}),
  );
  const summary = monthlyTotal(nodes, settings);
  const money = (value: number | null) =>
    hideAmounts ? "••••" : value === null ? "—" : `¥ ${value.toFixed(2)}`;
  const today = new Date().toISOString().slice(0, 10);
  useEffect(() => {
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const controller = new AbortController();
    fetch("/api/me", { credentials: "same-origin", signal: controller.signal })
      .then(async (r) => r.ok && (await r.json()).logged_in === true)
      .then((yes) => {
        if (!controller.signal.aborted) setAdmin(!!yes);
      })
      .catch(() => {});
    return () => {
      controller.abort();
      document.body.style.overflow = previous;
    };
  }, []);
  function patch(uuid: string, field: keyof Draft, value: string) {
    setDrafts((current) => ({
      ...current,
      [uuid]: { ...current[uuid], [field]: value },
    }));
    setSaved(false);
  }
  async function save() {
    setError("");
    setSaved(false);
    setBusy(true);
    try {
      if (parsed.warnings.length)
        throw Error(
          "已有溢价配置含无效项，请先在 Mint 主题设置中修正，避免覆盖原记录。",
        );
      const rateObject = JSON.parse(rates);
      if (
        !rateObject ||
        typeof rateObject !== "object" ||
        Array.isArray(rateObject) ||
        Object.values(rateObject).some(
          (v) => typeof v !== "number" || !Number.isFinite(v) || v <= 0,
        )
      )
        throw Error("汇率须为 JSON 对象，所有汇率须是大于 0 的数字。");
      const premiums: Record<string, Premium> = { ...parsed.entries };
      for (const [uuid, draft] of Object.entries(drafts)) {
        if (!draft.amount.trim()) {
          if (draft.acquiredAt || draft.months.trim())
            throw Error("填写收购日期或摊销月数前，请先填写对应溢价金额。");
          delete premiums[uuid];
          continue;
        }
        const amount = Number(draft.amount);
        if (!Number.isFinite(amount))
          throw Error("溢价金额须为有限数字，可用负数表示折价。");
        if (
          draft.acquiredAt &&
          (acquisitionTime(draft.acquiredAt) === null ||
            draft.acquiredAt > today)
        )
          throw Error("收购日期须为有效日期，且不能晚于今天（UTC）。");
        const months = draft.months.trim() ? Number(draft.months) : undefined;
        if (
          months !== undefined &&
          (!Number.isFinite(months) ||
            months <= 0 ||
            !Number.isFinite(amount / months))
        )
          throw Error("摊销月数须大于 0，且月摊金额不能超出范围。");
        premiums[uuid] = {
          amount,
          ...(draft.acquiredAt ? { acquiredAt: draft.acquiredAt } : {}),
          ...(months !== undefined ? { months } : {}),
        };
      }
      // The standard host API replaces all theme settings. Merge a fresh snapshot
      // and reject concurrent cost edits rather than overwriting another tab.
      const latest = await rpc<Site>("public:getPublicSettings");
      if (signature(latest.theme_settings) !== signature(initial))
        throw Error("费用设置已在其他页面修改，请关闭此窗口并刷新后重新编辑。");
      const me = await fetch("/api/me", { credentials: "same-origin" });
      if (!me.ok || (await me.json()).logged_in !== true) {
        setAdmin(false);
        throw Error("登录会话已失效，请重新登录后保存。");
      }
      const response = await fetch(
        "/api/admin/theme/settings?theme=nekomari-mint",
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...latest.theme_settings,
            // Managed selectors are arrays on reads but JSON-array text on writes.
            ...Object.fromEntries(
              ["telecomTasks", "unicomTasks", "mobileTasks"]
                .filter((key) => Array.isArray(latest.theme_settings?.[key]))
                .map((key) => [
                  key,
                  JSON.stringify(latest.theme_settings?.[key]),
                ]),
            ),
            exchangeRates: JSON.stringify(rateObject),
            costIgnoredNodes: JSON.stringify(ignored),
            costPremiums: JSON.stringify(premiums),
            costIncludePremium: includePremium,
          }),
        },
      );
      if (!response.ok)
        throw Error(`保存失败 (${response.status})，请确认管理员会话仍有效。`);
      const body = await response.json();
      if (body.status === "error" || body.error)
        throw Error("服务端未接受费用设置。");
      setSaved(true);
      setEditing(false);
      onSaved();
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? "汇率 JSON 格式错误，未保存任何修改。"
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="detail cost-panel"
      aria-labelledby="cost-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
      onClick={(e) => {
        if (e.target === dialog.current && !busy) onClose();
      }}
    >
      <div className="dialog-head">
        <div>
          <span className="eyebrow">COST & PREMIUM</span>
          <h2 id="cost-title">费用与溢价</h2>
        </div>
        <button
          className="icon-button"
          aria-label="关闭费用详情"
          disabled={busy}
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      <p className="cost-explainer">
        续费月费与一次性收购溢价分开统计。溢价按指定月数摊销，不会全额重复计入每个月；正数为溢价，负数为折价。
      </p>
      <div className="cost-totals">
        <div>
          <small>续费月费</small>
          <b>{money(summary.included ? summary.recurring : null)}</b>
        </div>
        <div>
          <small>一次性溢价合计</small>
          <b>{money(summary.premium)}</b>
        </div>
        <div>
          <small>当前溢价月摊</small>
          <b>{money(summary.premiumMonthly)}</b>
        </div>
        <div>
          <small>含溢价月均估算</small>
          <b>
            {money(
              summary.included || summary.amortized ? summary.effective : null,
            )}
          </b>
        </div>
      </div>
      {hideAmounts && (
        <p className="cost-explainer">
          费用已隐藏。请先关闭此窗口，使用顶栏“显示费用”后查看金额或编辑。
        </p>
      )}
      {summary.warnings.map((w) => (
        <p role="alert" key={w}>
          {w}
        </p>
      ))}
      {admin && !hideAmounts && !saved && (
        <button
          className="cost-edit-button"
          onClick={() => setEditing(!editing)}
        >
          {editing ? "收起编辑" : "编辑费用设置"}
        </button>
      )}
      {!admin && (
        <p className="cost-explainer">
          管理员登录后可在这里编辑，或在后台的 Mint 主题设置中配置。
        </p>
      )}
      {editing && admin && !hideAmounts && (
        <div className="cost-settings">
          <label className="cost-check">
            <input
              type="checkbox"
              checked={includePremium}
              onChange={(e) => setIncludePremium(e.target.checked)}
            />
            月度支出包含当前溢价月摊
          </label>
          <label>
            人民币汇率 JSON
            <textarea
              aria-label="人民币汇率 JSON"
              rows={3}
              value={rates}
              onChange={(e) => setRates(e.target.value)}
              spellCheck={false}
            />
          </label>
          <p className="cost-explainer">
            例如 {`{"USD":7.2,"EUR":7.8}`}，表示 1
            单位外币折合人民币。币种代码和常用符号自动对应，人民币固定为 1。
          </p>
          <p className="cost-explainer">
            请填写“额外支付的溢价”，不是完整收购价。摊销按每月 30 天、自收购日期
            UTC
            零时开始，期满停止；留空日期或月数只记录总额，不猜测摊销周期。续费不自动延长摊销。
          </p>
        </div>
      )}
      <div className="cost-node-list">
        {summary.details.map((d) => (
          <section className="cost-node" key={d.uuid}>
            <div className="cost-node-heading">
              <strong>{d.name}</strong>
              <span>{d.note || "已计入续费月费"}</span>
            </div>
            {editing && admin && !hideAmounts ? (
              <div className="cost-node-fields">
                <label className="cost-check">
                  <input
                    type="checkbox"
                    checked={ignored.includes(d.uuid)}
                    onChange={(e) =>
                      setIgnored((current) =>
                        e.target.checked
                          ? [...current, d.uuid]
                          : current.filter((id) => id !== d.uuid),
                      )
                    }
                    aria-label={`${d.name} 排除统计`}
                  />
                  排除统计
                </label>
                <label>
                  溢价 / 折价（人民币）
                  <input
                    type="number"
                    step="any"
                    value={drafts[d.uuid]?.amount || ""}
                    onChange={(e) => patch(d.uuid, "amount", e.target.value)}
                    aria-label={`${d.name} 溢价金额`}
                  />
                </label>
                <label>
                  收购日期（UTC）
                  <input
                    type="date"
                    max={today}
                    value={drafts[d.uuid]?.acquiredAt || ""}
                    onChange={(e) =>
                      patch(d.uuid, "acquiredAt", e.target.value)
                    }
                    aria-label={`${d.name} 收购日期`}
                  />
                </label>
                <label>
                  摊销月数
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    value={drafts[d.uuid]?.months || ""}
                    onChange={(e) => patch(d.uuid, "months", e.target.value)}
                    aria-label={`${d.name} 摊销月数`}
                  />
                </label>
                <button
                  className="cost-clear-button"
                  onClick={() =>
                    setDrafts((current) => ({
                      ...current,
                      [d.uuid]: { amount: "", acquiredAt: "", months: "" },
                    }))
                  }
                >
                  清除溢价
                </button>
              </div>
            ) : (
              <p className="cost-node-values">
                续费 {money(d.monthly)} / 月 · 一次性溢价 {money(d.premium)} ·
                当前月摊 {money(d.premiumMonthly)}
                {d.premiumNote ? ` · ${d.premiumNote}` : ""}
              </p>
            )}
          </section>
        ))}
      </div>
      <p className="cost-explainer">
        主题设置为公开数据；隐藏金额仅是当前浏览器的显示开关，不是访问控制。缺价格、周期或汇率的节点不冒充零支出；人民币溢价独立统计。
      </p>
      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">费用设置已保存，关闭窗口后可重新打开核对。</p>}
      {editing && admin && !hideAmounts && (
        <button
          className="primary-button"
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? "保存中…" : "保存费用设置"}
        </button>
      )}
    </dialog>
  );
}
