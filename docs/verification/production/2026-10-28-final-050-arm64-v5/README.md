# 0.5.0 最终 Apple Silicon 本地预览验收

冻结源码 `c1e3c3c7a07425186848bd1d2823248d3b355d6c`，分支 `codex/second-brain-workbench-rebuild`。最终 DMG SHA256 `1640c4cbe93b0d8697fcfb2e7b919f93dac84311fb0fdc2c1b87679f693cf1e5`，3,200,837,792 字节。仅 Apple Silicon / macOS 26 交付范围；这是有明确限制的本地预览，不代表生产发行或全平台验收通过。

## 本轮实际安装验收

- 从最终 DMG 安装到 `/Applications/自媒体工作台.app`。镜像校验及安装后 deep strict codesign 通过，安装事务已 complete。使用 ad-hoc 签名，未完成 Developer ID / 公证。
- 原生明确选库、取消后恢复、选择演示第二大脑、47 篇内容显示通过。同一安装正常退出重开及 Finder 移除/还原后重开均自动恢复原库，无需再次选择。
- 实际 Chrome 原生工具栏：原 AI 科普大 HTML → Markdown → Back 完整报告 → Forward 同一附件 → Back → 再次点击附件 → Back → `#data` 锚点通过。见 `native-root-back-settled.txt`、`native-root-forward-settled.txt`、`native-root-reclick.txt`、`native-root-anchor.txt/png`。
- **剩余自动化历史异常**：使用工具 `Tab.back()` / CDP 的路径曾长期显示空白 iframe，也由原生窗口确认过；原因未建立，不能改写为单纯 stale handle，也不能说所有历史触发路径均已修复。原生正常路径另有上述独立通过证据。早期 blank 证据保留于 `report-back*.txt/png`。本轮报告逐字稿弹窗因原生操作索引失效未完成，不计 v5 通过；baf 版本原报告弹窗的实际通过证据保持原身份。
- 最终安装版原生打开 T029，原稿、建议、参考、分工、对照/通读/录制/标题封面简介视图、已连接保存服务状态均可见，见 `native-t029-original-frame.txt/png`。本轮只读，不冒称重新完成旧候选的编辑/重开全套测试。
- Finder 对最终 App 与 DMG 实际“显示简介”验收。App 显示 Apple 芯片、0.5.0、公司版权、4,201,506,416 字节、2026-10-28 08:32；DMG 显示 3,200,837,792 字节、08:39。截图见 `finder-installed-app-info.png` / `finder-final-dmg-info.png`。应用图标可见；Dock 单独 UI 尚未核验。
- 应用停止后，实际 Finder Move to Trash，确认 `/Applications` 中应用不存在；知识库和设置 12,396 个文件逐项 SHA256 未变。Cmd+Z 原样还原，Info.plist 相同，deep strict codesign 再次通过并正常重开。废纸篓未清空，未永久删除。见 `recoverable-removal-preservation.json`、`restored-signature-verify.txt`、`restored-reopen-second-brain.txt/png`。

## 变更范围与证据复用

实际已安装 baf 版本与最终安装版的 627 个运行文件/清单逐一核对，仅 `production-pages.mjs` 改变，详见 `installed-runtime-delta.json`。最后源码修复对应 15 项专项及 native/renderer 类型检查通过，源码 fixture 原生 Chrome 连续历史路径另有 `source-chrome-history-acceptance.json`。真实大报告诊断 fixture 后来建立但主线程未打开，日志零行，已停止，不算通过证据。

- 插件清单仍为 `b106be7b4da43ca24f2e5c835ef5c0f6428629971d0ab7f573754080a5b1d9ab`，两宿主的原实际安装、8 项 doctor/空 callback 按字节未变范围引用；没有在 v5 重跑宿主模型生成。
- ASR 源码与封存清单未变，构建对完整载荷逐文件校验且最终签名通过。引用 baf 实际安装 MP4→PyAV→Qwen→5 个真实词时间段 17.778s 证据，不改写成 v5 新运行。只覆盖 macOS major 26 / arm64。
- 19 个原模板/创作运行文件仍与早期 2a 定点编辑保存/独立重开证据逐字节一致，见 `creation-scope-comparison.json`。不将旧整套运行改标为本轮运行。
- ZIP 中全部 11,448 个原文件与实际 Demo 的原件逐项相同，`demo-source-preservation.json`；移除保全另含运行时资料与设置，共 12,396 项。

## 设计规则记录

- `Layout-01`：最终原生侧栏、N 图标、当前内容入口可见，见总览与 T029 截图。
- `Interaction-03`：原 HTML 的功能划分与作者内容依用户优先要求保留；外壳使用现有 Semi 控件。最后变更仅报告导航恢复，不重新设计原报告/创作页。
- `Acceptance-01`：最后报告交互专项及两套类型检查通过，最终构建完成；非平凡历史操作有源码与实际安装原生浏览器证据及剩余异常。
- `Acceptance-02`：本轮保存实际总览、选库、原创作页、原报告与系统属性截图。图片像素尺寸独立记于 `screenshot-dimensions.json`；本轮未重新量取 CSS viewport，也未重跑所有页面/窄窗/减少动画矩阵，旧广泛视觉记录保持原提交身份。
- `Acceptance-03`：区分源码、fixture、实际安装版、旧版本范围复用；Intel Mac 与 Windows 本轮未构建/安装/原生验收，Windows ARM 未纳入交付。

## 未包含在“通过”中的内容

四个完整原技能包 `jc-zhuanxie`、`jc-review-page`、`jc-cover-design`、`jc-kepu-video` 全机可访问范围补查仍未取得，详见缺失原技能跟踪记录；用户稍后向同事索取再补齐。受保护系统目录并非全部可检索。付费实时 TikHub 采集、宿主模型端到端生成、实际平台发布未执行；部分原始 VI 图片、音视频和较新 X 数据库未提供。私域客服和运动按用户要求不纳入。以上不包装成“原全部技能100%收齐”或“全部功能端到端实测”。
