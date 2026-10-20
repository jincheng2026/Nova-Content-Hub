# 0.3.31 最终交付与实际安装

当前实际安装已完成，原库保留，正常退出重开通过。安装树1817项与冻结归档/DMG一致，事务complete；原库1781项安装前后及本轮正常退出后SHA256均为773cc2bb6ee2d7d669f97d58d68825447005e5ca80561582e9476210db765527。没有把之后用户可能的编辑纳入不变声明。

0.3.30与0.3.31隔离构建工作树均已通过原生工具归档，所需忽略产物已先复制并核验；下方构建阶段的“尚未归档/未安装”保留当时状态。

实际CUA核对：4内容/1合集；封面3候选（含本轮Codex新图）完整无遮挡、旧图仍选用；资料/渠道置首；大日历选21日保持页头可见；当天与展开面板五列和来源清楚；Semi分类列表及自定义草稿正常，清回原空分类后关闭，未保存业务修改。Finder和原生关于显示0.3.31、正确N图标、完整公司版权；Finder实际672,867,112字节、672.9MB、修改2026-10-20 15:00。

两宿主磁盘插件通过官方CLI更新并精确配对4项，原配置有私有备份，无关启用/安装/内置配置记录保留；不强制重启宿主或声称当前会话已重载。真实生图在.29本轮完成，.31保留并显示其候选，不重复计为.31新生图。

实际Dock读取工具超时，未宣称Dock显示已验；物理中文输入法、Intel/Windows原生运行、Developer ID/公证仍待独立验收。当前ad hoc预览属性保留，不能填公司名称代替可信签名。

记录：installation.json、plugins.json、native-observation.json、normal-quit.json、final-integrity.json；CUA实际截图在本对话工具记录，本目录不伪造截图文件。最新逐页建议以用户本轮七图要求为准，剩余建议等待用户选择。

---

以下为安装前冻结/打包阶段记录，阶段性的未安装字段保留原事实：

# 0.3.31 统一 UI 预览包：冻结与产物核验

本记录遵守根目录 `AGENTS.md`，只覆盖 **darwin-arm64 / preview / 免登录**候选。UI 源码及既有验收证据冻结于 `cbf203437b10d5d41dc3b53480b51b46286eb9f6`，六处版本元数据冻结提交为 **`4c230eb3a4175d2c4fbb1c3311cdce2a36c9abfd`**。两者真实 diff 仅六个版本文件，8 增/8 删；本轮没有另改业务 TS/CSS。主目录分支保留 `qoder/review`，未操作未跟踪 `AGENTS.md`。

## 产物

- 原生 managed worktree：`/Users/mac/.codex/worktrees/ui-0331-build/Nova-Content-Hub`，构建前后干净；保留等待主线程复核，尚未归档。
- 主归档应用：`workbench/release/darwin-arm64/preview/.packaged-apps.noindex/build-0331-4c230eb/mac-arm64/自媒体工作台.app`。
- DMG：`workbench/release/darwin-arm64/preview/Nova-Content-Hub-0.3.31-darwin-arm64-preview.dmg`。
- 同事交付目录：`/Users/mac/Downloads/自媒体工作台-0.3.31-同事交付-Mac苹果芯片`，仅 DMG、安装与使用说明、SHA256SUMS 三文件。
- DMG SHA256：`880bc6a0e4a1aab35d07b90c6434c208fc9fee47fea4542d5f37fcb92b308258`。
- 完整应用树 **1817** 项，隔离构建＝主归档＝只读挂载 DMG。树摘要：`35fcb8ed2d8f69d2cd59241355b2bc8010f9078ddc62888bb5c122680134b6fc`。
- DMG 实际大小 `478799022` bytes；应用普通文件字节总和 `672866819`，不等于 Finder 分配大小。修改时间和完整路径见 [产物 receipt](package.json)。

0.3.30 产物及原验收记录保留，本记录不改写旧版结论。

## 最终包与已测 UI 的关系

在修改版本前，保存了主目录 `workbench/dist-desktop/auth-disabled/workbench/dist/renderer` 的完整五项树和副本。该构建对应 UI 提交 `cbf2034`、版本元数据 `0.3.30`；本轮最终包 release 为 `0.3.31`。

最终包 renderer 与本轮冻结构建、此前已测构建均 **逐项字节完全一致**，没有以替换版本号后的摘要代替真实比较。五项包含 index.html、JS、CSS、图标与 assets 目录；共同树 SHA256 为 `5403fb3b45a2afae767284c37c9380943f119c94f208fe00a1e705b451e3b761`。本轮版本元数据变化没有改变 renderer 字节；App/插件 release 和系统 bundle 版本另行核对为 0.3.31。

- [此前已测 renderer 树](tested-renderer.json)、[最终比较](renderer-comparison.json)
- 已测字节副本：`.local-probes/ui-0331/tested-renderer`。
- 五个 UI probe 源码副本保存在 [probe-source](probe-source)，[摘要清单](probe-source-hashes.json)逐一匹配 `cbf2034`。这些是审计副本，未进入最终应用。
- 实际 UI 行为证据仍以 [统一 UI 验收记录](../2026-10-20-ui-final/README.md)及其引用的各项 probe 为准；本轮没有再执行真实用户窗口操作。

## 检查结果与日志

根目录和 workbench 均执行 `npm ci`，未添加或升级依赖。复制官方 Node 缓存后，经现有 `verifyArchive` 校验 SHA256 `40e5607e5ecb3db9192723776da2d75d966260fc74a7a9e731c1bd67dda96bc8`；构建流程自身仍保留校验。

- 六版本文件/pairId 检查、`npm run check` 通过。
- 分发与完整性回归 **15/15**，包括真实 builder schema/file matcher 与工程文件排除。
- handoff Schema 回归 **10/10**。首次在干净 worktree 运行时因缺少双模式 dist-prototype/plugin contract 输入而 ENOENT；[原始失败日志](schema-prerequisite-missing.log)保留。补 `npm run build:both` 后重跑通过，未作源码修复。
- `npm run dist:preview --prefix workbench -- --platform darwin --arch arm64` 与产物核验脚本退出码均为 0。
- 最终 Info.plist：名称「自媒体工作台」，版本和构建版本均为 `0.3.31`，版权精确为「© 2026 杭州新岛橙灵智能科技有限责任公司」。最终 app/package.json 的 author.name 为完整公司名称。
- `codesign --verify --deep --strict` 通过，实际为 arm64 / ad hoc，无 Developer ID、TeamIdentifier 或公证。填写公司名称不代表正式签名发布者身份。
- 桌面/插件 release 精确配对，sealed marketplace 通过；两处共享文件库实现字节匹配冻结提交。
- 只在临时目录打开从只读 DMG 复制的示例库：20 模板、52 提示词、1 示例、2 原图，原图摘要匹配 provenance，plans/publications 均为 0。
- 工程 tests/probes 和桌面工程源码未进入最终应用负载。

证据索引：[构建上下文](build-context.json)、[版本](version-check.log)、[冻结检查](frozen-check.log)、[分发回归](distribution-tests.log)、[Schema 回归](schema-tests.log)、[Schema 输入构建](schema-prerequisite-build.log)、[Node 缓存](node-archive.log)、[根依赖](npm-ci-root.log)、[桌面依赖](npm-ci-workbench.log)、[完整构建](build.log)、[产物核验](package-verification.log)、[签名详情](codesign.log)。核验脚本为 `.local-probes/ui-0331/verify-package.mjs`，拒绝覆盖已有归档/交付目录。

依赖安装报告根依赖 0 漏洞、workbench 锁定依赖 8 moderate 审计项，本轮未自动升级。构建保留既有 Vite 大 chunk 与 asar=false 提示。

## 尚未覆盖

| 平台 | 已构建 | 已安装 | 原生运行 | 系统信息展示 |
|---|---|---|---|---|
| darwin-arm64 | 是；本记录包核验通过 | 否 | 否 | Finder/Quick Look/About/Dock 待主线程实测 |
| darwin-x64 | 否 | 否 | 否 | 待独立 Intel Mac 验收 |
| win32-x64 | 否 | 否 | 否 | 待 Windows 属性/已安装应用/快捷方式验收 |
| win32-arm64 | 未纳入本轮 | 否 | 否 | 未支持或待单列验收 |

本轮未跑全量 313/1067 套，未安装或启动 `/Applications` 应用，未读写实际业务库、插件、宿主配置，未进行 CUA、push 或 tag。实际 Finder/About、安装升级及真实宿主闭环由主线程另验；`experimental=true`、`productionReady=false`，不得由包核验宣布公共生产发行或全平台通过。
