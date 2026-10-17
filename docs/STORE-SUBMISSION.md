# Komari 主题商店申请（待人工确认提交）

官方商店通过 Issue 表单接收公开 GitHub 主题，不是直接修改目录。
本文件仅准备材料，**不代表已经提交或审核通过**。

提交前核对：仓库公开、最新 Release 的 ZIP 可下载、清单 short 唯一、版本一致，
并从官方 Komari 再次导入该 Release 产物。预览是明确标注的演示图。

## 表单内容

- GitHub 仓库地址：`https://github.com/Aone2233/komari-theme-nekomari-mint`
- 预览图链接：`https://raw.githubusercontent.com/Aone2233/komari-theme-nekomari-mint/v0.5.0/preview.png`
- 确认项：仓库公开且最新 Release 提供可下载主题包。

使用官方 [theme-market 仓库](https://github.com/komari-monitor/theme-market) 的
“提交在 GitHub 中开源的主题” Issue 表单。若官方仓库地址迁移，以 Komari 后台商店
链接与官方文档为准。请先核对维护方要求，再由作者确认并提交。

## 说明（可放在补充评论中）

Nekomari Mint，short `nekomari-mint`，MIT，版本 0.5.0。
独立 Komari 标准 ZIP，已使用官方 Komari 1.6.0 + 官方 Agent 1.5.11 做真实导入和采样验证。
不替换管理后台，不要求安装 Nekomari；可选 Nekomari 检测扩展不存在时安全降级。
无检测结果不显示正常，不生成 IP 信誉分。预览图使用明确标注的演示数据。

商店会定期（当前规则为每六小时）验证最新 Release 并为变更发起目录更新 PR；
提交 Issue 不等于立即上架。以后更新保持相同 short、递增清单版本，发布新的合法 ZIP。

## 完整申请稿（尚未提交）

标题：`[Theme] Nekomari Mint`

```markdown
### GitHub 仓库地址 / GitHub repository URL

https://github.com/Aone2233/komari-theme-nekomari-mint

### 预览图链接 / Preview image URL

https://raw.githubusercontent.com/Aone2233/komari-theme-nekomari-mint/v0.5.0/preview.png

### 我已确保 / I confirm

- [x] 仓库必须公开，且最新 Release 中必须提供可下载的主题包。 / The repository must be public and provide a downloadable theme package in its latest Release.
```

提交入口：<https://github.com/komari-monitor/theme-market/issues/new?template=submit-github-theme.yml>。
流程：作者提交表单 Issue → 官方工作流校验并生成目录 PR → 维护者审查 / 合并 → 官方源收录。
主题作者不能自行批准收录；仅将仓库加入 Nekomari 自定义源不等于官方收录。
发布就绪后仍需作者确认本稿，未获确认不创建 Issue 或 PR。
