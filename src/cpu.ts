export interface CpuProfile {
  model: string;
  scope: "型号规格" | "架构信息";
  range: string;
  specs: string[];
  suitable: string;
  caution: string;
  source: { label: string; url: string };
}

const intel = (sku: string, slug: string) => ({
  label: "Intel 官方规格",
  url: `https://www.intel.com/content/www/us/en/products/sku/${sku}/${slug}/specifications.html`,
});
const google = {
  label: "Google Cloud 官方 CPU 平台文档",
  url: "https://cloud.google.com/compute/docs/cpu-platforms",
};
const profiles: { match: RegExp; profile: CpuProfile }[] = [
  {
    match: /\bEPYC\s+9275F\b/i,
    profile: {
      model: "AMD EPYC 9275F",
      scope: "型号规格",
      range: "高响应至并行计算区间 · 高频服务器型",
      specs: [
        "第 5 代 EPYC / Turin",
        "整颗 24 核 / 48 线程",
        "基频 4.10 / 最高加速 4.80 GHz",
      ],
      suitable: "适合编译、计算密集服务及兼顾单线程响应的并行任务。",
      caution:
        "规格来自整机厂商官方产品表；当前虚拟机只能使用分配的逻辑 CPU，不能等同整颗 24 核性能。",
      source: {
        label: "Lenovo 官方服务器处理器规格表",
        url: "https://lenovopress.lenovo.com/lp1608-thinksystem-sr665-v3-server",
      },
    },
  },
  {
    match: /\bNeoverse[ -]N1\b/i,
    profile: {
      model: "Arm Neoverse N1",
      scope: "架构信息",
      range: "通用服务区间 · 云端能效型",
      specs: ["Armv8.2-A", "面向云与边缘基础设施的核心 IP"],
      suitable: "适合网站、监控、容器与常驻服务；软件需支持 ARM64。",
      caution:
        "仅识别到核心架构，无法确认具体芯片、主频或整机核心数；不能据此认定为某款 Ampere 处理器。",
      source: {
        label: "Arm 官方 Neoverse N1 介绍",
        url: "https://www.arm.com/products/silicon-ip-cpu/neoverse/neoverse-n1",
      },
    },
  },
  {
    match: /\bCore\b.*\bUltra\s+7\s+265K\b/i,
    profile: {
      model: "Intel Core Ultra 7 265K",
      scope: "型号规格",
      range: "高响应区间 · 桌面性能型",
      specs: [
        "Arrow Lake",
        "整颗 20 核 / 20 线程（8P + 12E）",
        "最高睿频 5.50 GHz",
      ],
      suitable: "适合交互服务、编译与偏重单线程响应的应用。",
      caution:
        "P 核与 E 核能力不同，虚拟机无法仅凭型号判断分配到哪类核心；最高睿频不代表持续频率。",
      source: intel(
        "241063",
        "intel-core-ultra-7-processor-265k-30m-cache-up-to-5-50-ghz",
      ),
    },
  },
  {
    match: /\bXeon\b.*\bGold\s+6138\b/i,
    profile: {
      model: "Intel Xeon Gold 6138",
      scope: "型号规格",
      range: "通用服务区间 · 多核服务器型",
      specs: [
        "Skylake",
        "整颗 20 核 / 40 线程",
        "基频 2.00 / 最高睿频 3.70 GHz",
      ],
      suitable: "适合常规建站、容器与并行后台服务。",
      caution:
        "较早一代服务器平台；不宜只凭整颗核心数推断当前虚拟机的单核或多核能力。",
      source: intel(
        "120476",
        "intel-xeon-gold-6138-processor-27-5m-cache-2-00-ghz",
      ),
    },
  },
  {
    match: /\bXeon\b.*\bE3-1270\s+v6\b/i,
    profile: {
      model: "Intel Xeon E3-1270 v6",
      scope: "型号规格",
      range: "通用服务区间 · 小型高频服务器",
      specs: [
        "Kaby Lake",
        "整颗 4 核 / 8 线程",
        "基频 3.80 / 最高睿频 4.20 GHz",
      ],
      suitable: "适合中小型网站、轻量数据库和少量并发服务。",
      caution: "较早一代四核平台，大规模并行计算的扩展空间有限。",
      source: intel(
        "97479",
        "intel-xeon-processor-e31270-v6-8m-cache-3-80-ghz",
      ),
    },
  },
  {
    match: /\bCore\b.*\bi5-6200U\b/i,
    profile: {
      model: "Intel Core i5-6200U",
      scope: "型号规格",
      range: "轻量服务区间 · 低功耗移动型",
      specs: [
        "Skylake",
        "整颗 2 核 / 4 线程",
        "基频 2.30 / 最高睿频 2.80 GHz",
        "TDP 15 W",
      ],
      suitable: "适合个人站点、监控探针与轻量常驻应用。",
      caution: "老一代低功耗双核，不建议据此期待高并发编译或重型计算能力。",
      source: intel(
        "88193",
        "intel-core-i56200u-processor-3m-cache-up-to-2-80-ghz",
      ),
    },
  },
  {
    match: /\bEPYC\s+7B13\b/i,
    profile: {
      model: "AMD EPYC 7B13 / Milan",
      scope: "型号规格",
      range: "通用服务区间 · 云端服务器型",
      specs: ["第 3 代 EPYC / Milan", "平台基频 2.45 / 单核最高 3.50 GHz"],
      suitable: "适合通用云服务、容器和并行任务。",
      caution:
        "频率来自云平台官方文档，不代表所有供应商的配置或当前实例的持续频率。",
      source: google,
    },
  },
  {
    match: /\bEPYC[- ]Genoa\b/i,
    profile: {
      model: "AMD EPYC Genoa",
      scope: "架构信息",
      range: "通用至并行计算区间 · 服务器架构",
      specs: ["第 4 代 EPYC / Genoa"],
      suitable: "面向通用云服务和并行工作负载；实际吞吐仍取决于实例配额。",
      caution:
        "虚拟化上报的是架构名称，不能确认具体 SKU、主频、缓存或物理核心数。",
      source: google,
    },
  },
];

export function cpuProfile(name?: string): CpuProfile | null {
  if (!name || name.length > 512) return null;
  return profiles.find(({ match }) => match.test(name))?.profile || null;
}
