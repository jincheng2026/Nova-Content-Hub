# 0.3.30 公司信息候选：隔离构建与产物核验

本记录遵守根目录 `AGENTS.md`，只覆盖 **darwin-arm64 / preview / 免登录**候选。公司元数据修复为 `e9574af`；六处版本冻结提交为 **`7d1eb85783356ed83aab7601c91eed1faca75e79`**。构建时使用该提交的干净原生 managed worktree，未把未跟踪的 `AGENTS.md` 复制或提交进去。

## 产物与验证

- worktree：`/Users/mac/.codex/worktrees/company-0330-build/Nova-Content-Hub`，保留等待主线程复核，尚未归档。
- 归档应用：`workbench/release/darwin-arm64/preview/.packaged-apps.noindex/build-0330-7d1eb85/mac-arm64/自媒体工作台.app`。
- 安装镜像：`workbench/release/darwin-arm64/preview/Nova-Content-Hub-0.3.30-darwin-arm64-preview.dmg`。
- 同事交付目录：`/Users/mac/Downloads/自媒体工作台-0.3.30-同事交付-Mac苹果芯片`，仅含 DMG、安装与使用说明、SHA256SUMS 三文件。
- DMG SHA256：`b4098c51ddf4ae24f43dc8dc025b379ca06eab2a61d272355e030153b6625012`。
- 完整应用树 1817 项；隔离构建、主目录归档及只读挂载 DMG 三者相同。树摘要：`f1e25aad04b862f59c80a05c0d3b94a25979f996fabdb3eccfc3309fbbc04e90`。
- 最终 Info.plist 名称为「自媒体工作台」，版本和构建版本均为 `0.3.30`，版权精确为「© 2026 杭州新岛橙灵智能科技有限责任公司」；最终 app/package.json 的 author.name 为完整公司名。这里只证明产物字段，Finder 与 About 实际展示另验。
- `codesign --verify --deep --strict` 通过，签名为 ad hoc、arm64；没有 Developer ID、TeamIdentifier 或公证。公司字段不代表正式签名发布者身份。
- 配套插件 release 与桌面 release 精确配对，sealed marketplace 验证通过。两处共享文件库实现摘要取自冻结提交并匹配包内字节。
- 只在临时目录打开从 DMG 复制的示例库：20 模板、52 提示词、1 示例内容、2 原图，原图摘要匹配 provenance；plans/publications 均为 0。工程 tests/probes、桌面工程源码未进入应用负载。
- 实际 DMG 大小 `478802714` bytes；应用普通文件字节总和 `672862072`（不是 Finder 分配大小）。修改时间与完整路径见 [package.json](package.json)，Finder 大小及时间另验。

## 命令与证据

根目录和 workbench 均执行 `npm ci`；未添加或升级依赖。已复制缓存 `node-v24.20.0-darwin-arm64.tar.gz`，通过现有 `verifyArchive` 校验 SHA256 `40e5607e5ecb3db9192723776da2d75d966260fc74a7a9e731c1bd67dda96bc8`，构建自身仍保留缓存校验。

`npm run check`、六版本文件与 pairId 一致性检查通过。分发与完整性两文件共 **15/15** 项通过；未重跑全量 313/1067 套。`npm run dist:preview --prefix workbench -- --platform darwin --arch arm64` 退出码 0，随后产物核验脚本退出码 0。

- [冻结上下文](build-context.json)、[版本核验](version-check.log)、[静态检查](frozen-check.log)、[15 项回归](distribution-tests.log)
- [根依赖安装](npm-ci-root.log)、[桌面依赖安装](npm-ci-workbench.log)、[完整构建日志](build.log)
- [产物 receipt](package.json)、[核验日志](package-verification.log)、[签名详情](codesign.log)
- 可复核脚本：`.local-probes/company-0330/verify-package.mjs`。此脚本拒绝覆盖已有归档/交付目录，应阅读 receipt 复核，勿直接重复运行。

`npm ci` 报告根依赖 0 漏洞、workbench 锁定依赖 8 moderate 审计项；本轮没有执行自动升级。构建日志保留 Vite chunk 大小和既有 asar=false 提示。

## 独立验收缺口

| 平台 | 已构建 | 已安装 | 原生运行 | 系统信息展示 |
|---|---|---|---|---|
| darwin-arm64 | 是；本记录包验证通过 | 否 | 否 | Finder/Quick Look/About/Dock 待主线程实测 |
| darwin-x64 | 否 | 否 | 否 | 待对应 Intel Mac 环境 |
| win32-x64 | 否 | 否 | 否 | 待 Windows 属性/安装应用/快捷方式验收 |
| win32-arm64 | 未纳入本轮 | 否 | 否 | 未支持或待单列验收 |

本步骤未安装、启动或替换 `/Applications` 应用，未读取或写入实际用户业务库、插件与宿主配置；未 push、tag，也未执行计算机界面操作。`experimental=true`、`productionReady=false`，不得据此宣布公共生产发行或全平台通过。后续 Finder/About、安装及真实宿主闭环证据由主线程独立记录。
