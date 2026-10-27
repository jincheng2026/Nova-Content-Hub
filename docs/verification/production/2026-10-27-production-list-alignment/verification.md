# 账号头像、列表摘要与逐字稿保护验收

2026-10-27；本批责任源码在 `source-freeze.json` 按 SHA256 冻结。当前仓库基线为 `45c7d25`，不是已安装 .56 的变更声明。无升版、提交、安装或真实用户库写入；未纳入其他执行者的服务、ASR、桥接、launcher 及技能变更。真实 .56 整篇会话验收由主线程另行记录。

## 已实现

- 独立可选 `avatarAssetHash`：旧库省略兼容，旧调用省略字段保留头像，显式 null 移除；PNG/JPEG/WebP、缺失状态、独立 URL grant、原 CAS、备份与恢复完整贯通。头像不借用首张截图。
- 账号使用固定头像/标题、截图、两行摘要、标签、报告入口与底部主页/拆解/编辑槽位。报告、助手任务、内容目录、全部内容表格与雷达摘要操作位置固定；完整文本和所有图片/页仍通过已有预览或新详情弹窗读取，原业务操作保留。
- 账号报告仅按 accountIds/reportIds 明确关联；验收状态核对真实 active task/attempt/receipt、唯一 report artifact 及有序页面，不用名字匹配或 reportIds 数量冒称已验收。手工保存不能注入保留的回执出处键。
- 逐条参考提供提取、纠错、重新提取；空 URL 不可提取，缺失源字节也被拒绝。重新提取先明确确认。controller 冻结 referenceId、intent、全参考 baselineHash，不把长原文写进 parameters；复用同一活跃尝试，保留预算与评论设置，不给文字分析开放模型 API。
- 采用前调用专用异步工厂并冻结完整前后预览；采用只使用该预览的 editToken/bodyHash/productionToken。发生冲突保留预览，无部分写入；明确处理原恢复意图和新预览后才允许基于新正文采用。历史任务兼容预览明确不具有相同参考 hash 冻结保证。
- readProduction 缺失资产检查、备份枚举覆盖已保存参考以及提交的 research/transcript 候选里的合法媒体/字幕 hash，避免仅检查账号图片。敏感工厂规则及固定 hash helper 由 live_service_validation 唯一负责。

## 验证命令与结果

- `node --test plugin-src/src/lib/file-library/test/production-avatar.test.mjs workbench/test/production-transcript-task.test.mjs workbench/test/production-report-status.test.mjs workbench/test/content-creation-workflow.test.mjs`：11/11，`domain-tests.log`。
- 补强 URL-only / 缺字节 / 混 accountId 的 controller 断言后，`node --test workbench/test/production-transcript-task.test.mjs`：3/3，`transcript-controller-tests.log`。
- `node --test plugin-src/src/lib/file-library/test/production.test.mjs plugin-src/src/lib/file-library/test/production-bundle.test.mjs workbench/test/production-desktop.test.mjs`：38/38，`regression-verified.log`；含两助手的 created、claimed、两等待、submitted、继续与切换既有链路。
- `npm --prefix workbench run typecheck`：native + renderer 均通过，`typecheck.log`。`git diff --check` 通过。
- 隔离原生 Electron：`node workbench/scripts/production-list-ui-probe.mjs`，6 项场景通过；证据 `electron/receipt.json`。长/短/空账号、独立头像/仅截图/缺图、报告状态、长任务、内容表格、雷达、焦点归还、头像导入保存均覆盖。表格在窄窗保留容器内横向滚动。
- 隔离原生 Electron：`node workbench/scripts/production-transcript-ui-probe.mjs`，2 项复合场景通过；证据 `transcript-electron/receipt.json`。覆盖 intent 绑定、URL-only 禁用、重新提取确认、前后差异、外部正文更改导致 CAS 拒绝、无部分采用、失败预览保留、明确新预览后仅应用校正版。
- 最初 RED：`red.log` 捕获旧卡片没有固定动作槽位；头像/状态域测试亦先以未知字段/缺 helper 失败，再实现。最后一轮缺图和 URL-only 加强断言不宣称独立 RED。

## 设计规则留痕

- Foundation-01/02/03/04：沿既有公共颜色与 13/14/15px 信息层级，验收状态有文字，不新造业务成功状态。截图人工查看通过；本批没有修改公共对比 token。
- Layout-01/02、Surface-01：1280×860 与 960×680 均检查页面无外层横溢出，卡片同排动作 y 坐标差小于 2px，表格与雷达动作 x 坐标差小于 2px。见 accounts 两尺寸、account-aligned-actions、content-table 两尺寸、radar 两尺寸。
- Surface-03：复用原生 modal 及现有焦点边界；标题长词可换行并滚动，正文独立滚动，底部关闭保持可达。原生 cancel 事件与焦点返回自动化覆盖；实体键盘 Esc 与跨平台真实设备未在本批操作。
- Image-01/02：账号头像和截图等比 contain；继续调用既有 ImagePreviewButton，不更改原图或缩放语义。用户提供的小曾头像仅作为隔离临时库输入/截图证据，不硬编码路径或打入资源。
- Controls-01/02/03：底部固定操作区保留 Semi 按钮、busy/dirty，候选确认在固定底栏；标签与状态摘要保留完整阅读入口。
- Reading-02/03：长标题、完整备注、标签、所有报告页、任务原文/产物、雷达来源证据可通过详情访问。创作默认简单主操作不变；逐字稿工具仅高级区显示，单条候选须前后预览。
- Interaction-01/02/03：无新动效、依赖或自动发布行为；不扩大预算、评论、助手权限，也不以新聊天冒充进行中任务恢复。

## 平台与能力边界

本批仅在开发机器 `darwin-arm64` 的隔离 Electron 上自动化运行，assistant launch/focus 使用模拟回调，不代表真实 Codex/WorkBuddy 交接或已安装版验收。Intel Mac、Windows x64/ARM、同事 macOS 26 的最终安装/运行及系统属性展示均由目标发布另验；此处不标为通过。未触碰用户启用的预算、评论或现存设置。
