# 0.3.40 助手交接、任务进度、封面性能与选择器优化预览

本轮按用户请求先提交现有代码，再从冻结提交重新打包安装。源码包含此前完成的封面交互/加载优化、简短助手提示与完整固定请求读取、本地任务进度显示；新增修复下拉圆角外壳与列表背景不一致导致的漏角，沿用共享弹层结构；持续增长数据的选择器支持输入搜索，日程发布内容可按文字定位，收藏构图筛选保留已勾选项与失效项。

目标仅为 Apple Silicon Mac（darwin-arm64）预览：AUTH_MODE=disabled、productionReady=false、adhoc 临时签名。Intel Mac、Windows、真实助手生图、正式 Developer ID、公证及生产发行不计入本轮验收。

权威交付标准见仓库 AGENTS.md。旧版源码、tag、安装包与证据独立保留。本目录 scripts 为本轮独立执行，不写入旧记录。

冻结源码、最终 SHA256、实际大小/时间、安装事务、插件匹配和原库保护结果已记录在本目录对应 JSON 与日志中。系统实际界面验收记录位于 system/；源码与静态检查不能代替原生界面验收。

## 最终状态（已完成原生启动与明确用户变更对账）

用户确认已允许文稿访问后，主线程在安装的 0.3.40 实际验证原库加载、设置版本与 macOS ARM64、WorkBuddy 封面/模板就绪、封面“已选用”紧凑按钮、5 篇内容的日程搜索“AI”命中与清空恢复、Esc 只关闭下拉、提示词分类圆角。正常 super+q 后精确进程确认旧 PID 67112 停止，再次启动后 5 篇内容、1 个合集、原封面及日程重新加载；见 `system/native-acceptance.json`、`system/native-normal-quit.json`、`system/native-reopened-overview.*` 及各项原生截图/AX。安装事务已 complete，系统权限不再 pending。

最终 `final-integrity.mjs --reconcile-library` 退出 0，状态为 `PASS_WITH_RECONCILED_USER_CHANGE`：安装/冻结归档/DMG 的 1859 条目一致，签名、DMG SHA256、三文件交付、两端四项技能及原绑定仍严格通过。原库在并发人工操作后为 2288 条目，摘要 `e30e75e715726d4d67b4922ab531329d091f481f0449b33658bd6dd0ed04f180`；已明确保留且逐字节核对唯一照片软删除与对应已提交事务，不能宣称全库 unchanged。原安装前 2283 条目摘要和备份未改写。见 `final-integrity.json`、`final-integrity-reconciliation.json` 与 `logs/final-integrity-reconciled.log`。

本轮仅验收 Apple Silicon Mac 预览；真实助手生成、当前会话插件重载、Intel Mac、Windows、正式 Developer ID/公证未覆盖。后续未打包的媒体表单源码修改不属于此冻结安装包。

## 打包前验证

- 现有原型生成机制同步六处源码/生成版本，两个 lockfile 根包均为 0.3.40；见 logs/version-check.log。
- distribution、distribution-integrity、native-payload、installation、mac-installation 共 98/98 项通过；见 logs/packaging-install-tests.log。本次未修改这些生产逻辑。
- 首轮按当时机器绑定重新独立备份，2243 个条目，完整 SHA256 `e5561ba8abe3997a8fd12511c2cb5419603fc2466a2d93c3a599fef7c4ffce13`，备份与当时原库字节一致；原收据现为 library-protection-before-final.json。最终安装前重新读取当前库并新增备份，见下文；未套用 0.3.39 的旧快照。

- 主线程新增检查：native/renderer TypeScript 与 bridge/模板镜像检查退出 0，桌面全套 361/361，handoff source 与 clean-output-skills 40/40；见 logs/source-*。361 项桌面全套是新增下拉 CSS 与搜索优化之前的基线，不能称为最终搜索源码的全套回归；后续变更由专项 probe 与类型复核覆盖。
- 下拉修复证据见 [下拉圆角专项记录](../2026-10-22-dropdown-corners-0340/README.md)。最终 CSS 仅 semi-controls.css 两行：主线程独立重跑实际弹层 probe 退出 0，真实 PromptsPage 首末项 hover 与全部代表场景通过（logs/dropdown-final.log）；最终 native/renderer TypeScript 再次通过（logs/source-typecheck-final.log），diff-check 通过。隔离 probe 不能代替安装后的系统 UI 验收。

## 首轮中间产物保全（未交付、未安装）

首轮冻结 `5ce518e538c31086c08f219c2d9d547bba90fff4` 已构建并通过包核验。随后用户新增日程“选择要发布内容”及其他持续增长数据选择器的输入搜索要求，因此本轮产物被新需求取代，未安装、未更新配套插件、未打 tag。该中间阶段实际安装版本仍为 0.3.39。最终版本 0.3.40 已从新冻结源码重新构建并安装，不能将本中间包当作最终交付。

首轮 DMG 与原 Downloads 三文件目录已移至 ignored `workbench/release/darwin-arm64/preview/intermediate-5ce518e.noindex/`，精确三文件与 SHA256 在移动前后核验一致，DMG 字节数/修改时间不变：414,996,071 字节、SHA256 `8e7b1c7e5d558bb87e649a1d071b15706cdf515cd9069d8b92d4bfa4f012edc1`。原归档 `.app` 与 native payload 保留。

原 package.json 与 codesign.log 原字节转存为 `intermediate-5ce518e-package.json`、`intermediate-5ce518e-codesign.log`；原收据保留原路径，迁移后的准确路径和未交付状态见 `intermediate-5ce518e-status.json`。中间产物转存时移除了其原 `package.json`；当前同名文件仅记录最终冻结构建，避免误认。本轮构建/验证日志见 `logs/intermediate-5ce518e-dist.log` 与 `logs/intermediate-5ce518e-package-verify.log`。

## 最终搜索源码专项验证

搜索范围与证据见 [可搜索选择器专项记录](../2026-10-22-searchable-selects-0340/README.md)。显式 searchable 不受 7 项门槛控制，虚拟化开关独立；复合标签采用 plain 文本用于搜索，动态数据选择器补齐搜索入口。收藏构图使用 Input 筛选，已勾选和失效项在筛选期间仍可见。

主线程审查最终四个 renderer 文件的真实 diff，并独立重跑可搜索选择器、原收藏构图、下拉圆角三项实际 UI probe，全部退出 0；见 `logs/search-final.log`、`logs/composition-search-final.log`、`logs/dropdown-search-final.log`。最终 native/renderer TypeScript 通过，见 `logs/search-typecheck-final.log`。这些是最终搜索变更的专项证据，加上前述 361/361 桌面基线，不能合称最终全套回归；安装后的实际系统界面由本轮新冻结产物另行验收。

## 最终冻结构建与事务安装（原生界面验收前）

最终源码冻结 `c9820a496f615ea23e7a2603994add4b967f2f2c`，由干净工作区独立导出 darwin-arm64 native payload 并构建 DMG。冻结负载、归档 `.app`、挂载 DMG 内应用全树 1859 条目一致，Electron/Node/sharp 为 arm64，配套 marketplace 匹配，版本/公司版权及工程文件排除通过；见 package.json、logs/dist-final.log、logs/package-verify-final.log。adhoc 签名通过严格核验，未进行 Developer ID 签名或公证。

最终 DMG `Nova-Content-Hub-0.3.40-darwin-arm64-preview.dmg`：414,995,744 字节，SHA256 `0befa02ff4e47f587ee693c898a115b5146b932ff893674896d88935c8e78b3b`。Downloads 的 `自媒体工作台-0.3.40-同事交付-Mac苹果芯片` 为最终三文件目录；与上文 ignored 中间包区分保存，未覆盖首轮中间证据。实际路径和修改时间以 package.json 为准，Finder 系统展示另见 system/。

主线程通过 CUA 正常退出用户重新打开的旧版，随后产品 lsof 再次确认停止。安装前从实际 machine-binding 重新取库，发现已增至 2283 条目，因此保留原 2243 条目备份，另建当前完整备份；摘要为 `b59082a08f68172c8853987c2ec83afc93085c6148683bf4f26b82287c832ec4`。新备份与当前库全树字节一致，没有恢复或覆盖用户新增数据；见 library-protection.json、library-protection-before-final.json、logs/library-backup-final.log。

产品事务安装器已将最终包发布到 `/Applications/自媒体工作台.app`，安装后完整树与冻结归档一致，2283 条目与原绑定不变，旧版恢复事务保留；见 installation.json、logs/install-final.log。安装完成尚不等于原生启动验收，事务 complete 与正常退出重开由后续实际界面与严格 final-integrity 记录确认。

Codex、WorkBuddy 均通过官方 CLI 更新配套插件，四项 cover/template 技能匹配 0.3.40，不相关插件记录与启用设置保留；见 plugins.json、logs/plugins-final.log。当前助手会话未重新加载，未运行本版本真实生成。

## 原生启动等待系统授权（较早中间状态）

主线程已通过 Finder 实际检查最终归档及安装后应用：名称/图标、Apple 芯片、0.3.40 与完整公司版权一致，均显示 673,309,201 字节、修改时间 2026-10-22 12:40；见 `system/archive-finder-info.*` 与 `system/installed-finder-info.*`。Finder 展示值与文件树字节求和的算法不同，分别留痕。归档应用的 AX 文本仅为 no-change diff，归档元数据依据实际截图观察；安装后应用同时保留完整 AX 树。汇总见 `system/native-acceptance-pending.json`。

实际启动新版本后主进程运行，但 CUA 页面读取超时，事务仍为 published。主线程记录系统 TCC 在 12:47:08 提示新签名 requirement 不匹配并触发 DocumentsFolder 的 AUTHREQ_PROMPTING，已请用户亲自在原始系统弹窗允许。该中间阶段尚不能宣称原生页面、正常退出重开或安装事务 complete 已验收；后续最终状态见本文顶部。系统权限由用户处理，不绕过授权、不改权限数据库、不强制结束进程。

显式 `final-integrity.mjs --awaiting-system-permission` 退出 0，仅记为 `ARTIFACTS_VERIFIED_RUNTIME_PENDING`：安装/归档全树、最终 DMG 与三文件目录、严格签名核验、两端插件及 2283 条目原库/绑定全部一致，但 `transactionPhase=published`、`systemPermissionPending=true`、`installationConfirmedByApp=false`；见 `final-integrity-awaiting-permission.json` 与 `logs/final-integrity-awaiting-permission.log`。其后用户已允许并完成实际界面/正常重开；默认严格 final-integrity 因并发人工业务变更而如实失败，最终以明确单笔事务 reconciliation 验证收尾，见本文顶部及下文。

本地 annotated tag `v0.3.40-preview-mac-arm64` 指向最终冻结源码 `c9820a496f615ea23e7a2603994add4b967f2f2c`，用于绑定本次 DMG SHA256、adhoc 与非生产预览身份；tag 不代表原生启动/事务 complete 已通过。tag 创建时仍待系统文稿访问授权；该 pending 收据独立保留，不代表当前仍待授权。未向远端推送，首轮中间包和旧版 0.3.39 的产物/tag 保留。

## 并发人工照片软删除与严格对账

主线程开始原生验收时再次确认原库仍是安装基线 2283 条目、摘要 `b59082a08f68172c8853987c2ec83afc93085c6148683bf4f26b82287c832ec4`；见 `system/acceptance-library-baseline.json`。之后 CUA 明确提示 user changed app，设置照片从 5 项变 4 项；观测与根线程未调用照片管理/删除动作的范围见 `system/concurrent-user-change.json`。这是观测与事务相互对应，不等于独立取得用户对具体删除操作的口头确认。

原默认严格 final-integrity 因完整库摘要从 `b59082…` 变为 `e30e75…` 失败。根线程原 stdout 日志为空，错误曾返回在工具输出；本轮在修改脚本前用同一无参数命令重新执行，退出 1，完整 stderr 已保存在 `logs/final-integrity-strict-baseline-failure.log`，说明见 `final-integrity-baseline-failure.json`。不将该失败抹去或改记为通过。

专用 `final-integrity-reconciliation.mjs` 只允许事务 `0fab52d6-0a47-413c-aeac-004b95d4d475`：照片 `a62b4874-ec22-486b-bf3d-480ebe7071b4` 的 revision 1→2、updatedAt/deletedAt 均为 `2026-10-22T05:44:27.321Z`，其他业务字段保持一致。独立核验 intent 的 schema/library/object/operation/requestDigest、before/after 原字节、captured-0 与原备份 hash、COMMITTED 与 intent 原字节 SHA256 匹配；差异集合严格限定一份照片 JSON 和该事务目录及其四个文件，共 6 项，其余原条目逐字节不变。原图资产没有被改写或删除。

显式 reconciliation 收据绑定原/现完整摘要、确切 6 项差异和人工观测/原生验收证据 hash；最终脚本再次从实际库与原备份独立核验收据，任何进一步变化都拒绝通过。`userLibrary.unchanged=false`，仅 `allOtherEntriesUnchanged=true`，不修改安装前收据、不回滚用户数据。模拟额外库变化和篡改原基线的负例自检均被拒绝，见 `logs/final-integrity-reconciliation-self-check.log`。

主线程审查最终脚本与精确差异边界后，独立重新运行 `node docs/verification/production/2026-10-22-handoff-progress-0340/final-integrity.mjs --reconcile-library`，退出 0；完整结果见 `logs/final-integrity-independent.log`。源码图片边缘/表单内框优化保留为后续未打包修改，不属于此冻结安装版。
