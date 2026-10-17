import { cpuProfile } from "./cpu";

export default function CpuInsight({ name }: { name?: string }) {
  const profile = cpuProfile(name);
  return (
    <section className="cpu-insight" aria-label="处理器能力说明">
      <div className="cpu-insight-heading">
        <span className="eyebrow">PROCESSOR GUIDE</span>
        <span className="cpu-basis">规格解读 · 非实测</span>
      </div>
      <h3>{profile?.range || "能力区间暂未归类"}</h3>
      {profile ? (
        <>
          <p>{profile.suitable}</p>
          <div className="cpu-specs" aria-label={profile.scope}>
            {profile.specs.map((spec) => (
              <span key={spec}>{spec}</span>
            ))}
          </div>
          <a href={profile.source.url} target="_blank" rel="noreferrer">
            {profile.source.label} ↗
          </a>
        </>
      ) : (
        <p>
          当前型号暂无已核实的官方规格映射，保留原始上报，不猜测代际、主频或性能排名。
        </p>
      )}
      <details className="cpu-limits">
        <summary>规格口径与限制</summary>
        {profile && <p className="cpu-caution">{profile.caution}</p>}
        <p className="cpu-disclaimer">
          能力区间为主题根据公开规格给出的定性参考，并非厂商评级或跑分。
          上方核数是系统可见的逻辑 CPU（虚拟机通常为
          vCPU），不等于整颗处理器规格；共享、限频、超售及内存限制均会影响实际表现。
        </p>
      </details>
    </section>
  );
}
