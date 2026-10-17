# 处理器能力说明

节点详情从 Agent 上报的 `cpu_name` 匹配一个随主题打包的规格目录，不运行压力测试，
也不请求第三方跑分接口。浏览器不自动访问厂商网站，只有点击来源链接才会跳转。

## 显示语义

- **型号规格**：精确匹配型号，展示厂商 / 官方云平台 / 整机厂商公开的规格。
- **架构信息**：只识别到核心 IP 或架构名称，不反推具体芯片 SKU。
- **能力区间**：主题根据公开规格做的定性用途解读，不是官方性能等级、实测、跑分或跨架构排名。
- **逻辑 CPU**：系统可见的逻辑处理器数量；虚拟机通常是分配的 vCPU，并非整颗物理 CPU 的核心数。
- **未归类**：未核实来源、隐藏型号、通用虚拟 CPU 名称不猜测性能，保留原始上报。

主题没有把最高睿频当成持续性能，也没有把整颗物理 CPU 的核心数赋给虚拟机。
共享、超售、CPU 限额、P/E 核分配、频率、内存、软件架构支持等均可改变实际表现。
“轻量 / 通用 / 高响应 / 并行计算”是用途范围，可以重叠，不组成一条伪造的性能天梯。

## 已核实目录

核查日期：2026-10-17。规格目录位于 `src/cpu.ts`；匹配带型号边界，不把 265KF 当作 265K。

| 匹配型号          | 来源                                                                                                                                                     | 使用的信息                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Neoverse-N1       | [Arm 官方](https://www.arm.com/products/silicon-ip-cpu/neoverse/neoverse-n1)                                                                             | Armv8.2-A、云 / 边缘核心 IP；没有推断 Ampere 型号或频率                |
| Core Ultra 7 265K | [Intel 官方](https://www.intel.com/content/www/us/en/products/sku/241063/intel-core-ultra-7-processor-265k-30m-cache-up-to-5-50-ghz/specifications.html) | Arrow Lake、20 核 20 线程、8P+12E、最高 5.50 GHz                       |
| Xeon Gold 6138    | [Intel 官方](https://www.intel.com/content/www/us/en/products/sku/120476/intel-xeon-gold-6138-processor-27-5m-cache-2-00-ghz/specifications.html)        | Skylake、20 核 40 线程、2.00 / 3.70 GHz                                |
| Xeon E3-1270 v6   | [Intel 官方](https://www.intel.com/content/www/us/en/products/sku/97479/intel-xeon-processor-e31270-v6-8m-cache-3-80-ghz/specifications.html)            | Kaby Lake、4 核 8 线程、3.80 / 4.20 GHz                                |
| Core i5-6200U     | [Intel 官方](https://www.intel.com/content/www/us/en/products/sku/88193/intel-core-i56200u-processor-3m-cache-up-to-2-80-ghz/specifications.html)        | Skylake、2 核 4 线程、2.30 / 2.80 GHz、15 W TDP                        |
| EPYC 7B13         | [Google Cloud 官方](https://cloud.google.com/compute/docs/cpu-platforms)                                                                                 | 第 3 代 Milan、平台基频 2.45 / 单核最高 3.50 GHz；不保证其他供应商配置 |
| EPYC-Genoa        | [Google Cloud 官方](https://cloud.google.com/compute/docs/cpu-platforms)                                                                                 | 第 4 代架构名称，不套用 Google 的具体 SKU / 频率                       |
| EPYC 9275F        | [Lenovo 官方 SR665 V3 产品指南](https://lenovopress.lenovo.com/lp1608-thinksystem-sr665-v3-server)                                                       | 第 5 代 Turin、24 核 48 线程、基频 4.10 / 最高加速 4.80 GHz            |

AMD 产品站本次访问超时，9275F 改用整机厂商 Lenovo 官方规格表，并在界面明确标注来源。
EPYC 7A23、7K62、Xeon Platinum 8374C 及泛化的 `AMD EPYC Processor` 暂不归类，
没有以邻近型号、非官方跑分或名称中的核数替代官方资料。

添加映射时，应打开实际来源并核对页面标题 / 型号，不能只根据 URL 或搜索摘要推测。
新增规格和匹配边界应补充 `tests/insights.test.ts` 测试。
