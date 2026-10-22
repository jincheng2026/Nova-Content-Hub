# 0.3.40 助手交接、任务进度、封面性能与选择器优化预览

本轮按用户请求先提交现有代码，再从冻结提交重新打包安装。源码包含此前完成的封面交互/加载优化、简短助手提示与完整固定请求读取、本地任务进度显示；新增修复下拉圆角外壳与列表背景不一致导致的漏角，沿用共享弹层结构；持续增长数据的选择器支持输入搜索，日程发布内容可按文字定位，收藏构图筛选保留已勾选项与失效项。

目标仅为 Apple Silicon Mac（darwin-arm64）预览：AUTH_MODE=disabled、productionReady=false、adhoc 临时签名。Intel Mac、Windows、真实助手生图、正式 Developer ID、公证及生产发行不计入本轮验收。

权威交付标准见仓库 AGENTS.md。旧版源码、tag、安装包与证据独立保留。本目录 scripts 为本轮独立执行，不写入旧记录。

冻结源码、最终 SHA256、实际大小/时间、安装事务、插件匹配和原库保护结果将在对应 JSON 与日志产生后补记。系统实际界面验收记录位于 system/；源码与静态检查不能代替原生界面验收。

## 打包前验证

- 现有原型生成机制同步六处源码/生成版本，两个 lockfile 根包均为 0.3.40；见 logs/version-check.log。
- distribution、distribution-integrity、native-payload、installation、mac-installation 共 98/98 项通过；见 logs/packaging-install-tests.log。本次未修改这些生产逻辑。
- 当前机器绑定指向的原库重新独立备份，2243 个条目，完整 SHA256 `e5561ba8abe3997a8fd12511c2cb5419603fc2466a2d93c3a599fef7c4ffce13`，备份与原库字节一致；见 library-protection.json。未套用 0.3.39 的旧快照。

- 主线程新增检查：native/renderer TypeScript 与 bridge/模板镜像检查退出 0，桌面全套 361/361，handoff source 与 clean-output-skills 40/40；见 logs/source-*。361 项桌面全套是新增下拉 CSS 与搜索优化之前的基线，不能称为最终搜索源码的全套回归；后续变更由专项 probe 与类型复核覆盖。
- 下拉修复证据见 [下拉圆角专项记录](../2026-10-22-dropdown-corners-0340/README.md)。最终 CSS 仅 semi-controls.css 两行：主线程独立重跑实际弹层 probe 退出 0，真实 PromptsPage 首末项 hover 与全部代表场景通过（logs/dropdown-final.log）；最终 native/renderer TypeScript 再次通过（logs/source-typecheck-final.log），diff-check 通过。隔离 probe 不能代替安装后的系统 UI 验收。

## 首轮中间产物保全（未交付、未安装）

首轮冻结 `5ce518e538c31086c08f219c2d9d547bba90fff4` 已构建并通过包核验。随后用户新增日程“选择要发布内容”及其他持续增长数据选择器的输入搜索要求，因此本轮产物被新需求取代，未安装、未更新配套插件、未打 tag。当前实际安装版本仍为 0.3.39。最终仍用版本 0.3.40，从新冻结源码重新构建，不能将本中间包当作最终交付。

首轮 DMG 与原 Downloads 三文件目录已移至 ignored `workbench/release/darwin-arm64/preview/intermediate-5ce518e.noindex/`，精确三文件与 SHA256 在移动前后核验一致，DMG 字节数/修改时间不变：414,996,071 字节、SHA256 `8e7b1c7e5d558bb87e649a1d071b15706cdf515cd9069d8b92d4bfa4f012edc1`。原归档 `.app` 与 native payload 保留。

原 package.json 与 codesign.log 原字节转存为 `intermediate-5ce518e-package.json`、`intermediate-5ce518e-codesign.log`；原收据保留原路径，迁移后的准确路径和未交付状态见 `intermediate-5ce518e-status.json`。目录中暂不留最终 `package.json`，避免误认。本轮构建/验证日志见 `logs/intermediate-5ce518e-dist.log` 与 `logs/intermediate-5ce518e-package-verify.log`。

## 最终搜索源码专项验证（待新冻结打包）

搜索范围与证据见 [可搜索选择器专项记录](../2026-10-22-searchable-selects-0340/README.md)。显式 searchable 不受 7 项门槛控制，虚拟化开关独立；复合标签采用 plain 文本用于搜索，动态数据选择器补齐搜索入口。收藏构图使用 Input 筛选，已勾选和失效项在筛选期间仍可见。

主线程审查最终四个 renderer 文件的真实 diff，并独立重跑可搜索选择器、原收藏构图、下拉圆角三项实际 UI probe，全部退出 0；见 `logs/search-final.log`、`logs/composition-search-final.log`、`logs/dropdown-search-final.log`。最终 native/renderer TypeScript 通过，见 `logs/search-typecheck-final.log`。这些是最终搜索变更的专项证据，加上前述 361/361 桌面基线，不能合称最终全套回归；安装后的实际系统界面仍待本轮新冻结产物验收。
