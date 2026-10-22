# 0.3.40 助手交接、任务进度、封面性能与下拉圆角预览

本轮按用户请求先提交现有代码，再从冻结提交重新打包安装。源码包含此前完成的封面交互/加载优化、简短助手提示与完整固定请求读取、本地任务进度显示；新增修复下拉圆角外壳与列表背景不一致导致的漏角，沿用共享弹层结构。

目标仅为 Apple Silicon Mac（darwin-arm64）预览：AUTH_MODE=disabled、productionReady=false、adhoc 临时签名。Intel Mac、Windows、真实助手生图、正式 Developer ID、公证及生产发行不计入本轮验收。

权威交付标准见仓库 AGENTS.md。旧版源码、tag、安装包与证据独立保留。本目录 scripts 为本轮独立执行，不写入旧记录。

冻结源码、最终 SHA256、实际大小/时间、安装事务、插件匹配和原库保护结果将在对应 JSON 与日志产生后补记。系统实际界面验收记录位于 system/；源码与静态检查不能代替原生界面验收。

## 打包前验证

- 现有原型生成机制同步六处源码/生成版本，两个 lockfile 根包均为 0.3.40；见 logs/version-check.log。
- distribution、distribution-integrity、native-payload、installation、mac-installation 共 98/98 项通过；见 logs/packaging-install-tests.log。本次未修改这些生产逻辑。
- 当前机器绑定指向的原库重新独立备份，2243 个条目，完整 SHA256 `e5561ba8abe3997a8fd12511c2cb5419603fc2466a2d93c3a599fef7c4ffce13`，备份与原库字节一致；见 library-protection.json。未套用 0.3.39 的旧快照。

- 主线程新增检查：native/renderer TypeScript 与 bridge/模板镜像检查退出 0，桌面全套 361/361，handoff source 与 clean-output-skills 40/40；见 logs/source-*。桌面全套运行于新增下拉 CSS 修复之前，不能替代最终 CSS 的视觉核验。
- 下拉修复证据见 [下拉圆角专项记录](../2026-10-22-dropdown-corners-0340/README.md)。最终 CSS 仅 semi-controls.css 两行：主线程独立重跑实际弹层 probe 退出 0，真实 PromptsPage 首末项 hover 与全部代表场景通过（logs/dropdown-final.log）；最终 native/renderer TypeScript 再次通过（logs/source-typecheck-final.log），diff-check 通过。隔离 probe 不能代替安装后的系统 UI 验收。
