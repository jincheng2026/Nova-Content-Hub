# 调研选择与创作页易用性验收

日期：2026-10-27。根据用户确认的设计实施，并按“减少冗余按钮、减少操作和输入”收敛。基于当前工作区源码，不代表已安装应用更新或发布。

## 本轮改动

- 简单／精细调研同时展示用途、交付内容与投入差异。普通调研的 UI 和冻结任务共用 `research-depth.ts` 定义，助手方法按冻结深度执行；不修改用户问题，不扩大预算或自动授权评论。
- 研究问题是唯一必填输入；标题默认从问题生成，可展开自定义。关闭弹窗保留问题、深度、标题与评论选择。
- 参考锦成工作台已有设计，创作页提供对照写稿、通读审稿、录制准备三个视图，沿用一个正文与原保存协议。
- 主要保存动作固定在顶部；读取最新收进更多、历史折叠。选中正文直接带入批注或录制原句，减少复制粘贴。移除与视图切换重复的返回按钮。

## 验证记录

- `node --test workbench/test/research-depth.test.mjs workbench/test/production-desktop.test.mjs`：11/11，通过真实文件库验证深度要求冻结、保留原问题／预算／评论限制、非研究任务不附加调研要求，以及默认标题生成。日志见 `research/contracts-test.log`。
- `node --test plugin-src/tests/resources/production-creation.test.mjs workbench/test/production-pages.test.mjs`：最终24/24，包含视图、选句、正文保存、冲突、版本、媒体与能力URL隔离，以及未提交批注／画面禁止重绑、隐藏重复的常规成功通知。日志见 `creation/contracts-test.log`。
- `npm run typecheck --prefix workbench`：native 与 renderer 通过。
- `npm run build --prefix workbench -- --auth disabled`：darwin-arm64 开发构建通过，见 `build.log`。Vite保留大分块提示；没有新增依赖，本轮未做无关分包调整。
- `workbench/scripts/compact-research-probe.mjs`：隔离库与本机 Electron，1440×1000／960×680。调研默认焦点、两张选择卡可读、单选框／标题几何、取消恢复、无标题提交、精细模式冻结与预算权限边界通过。真实助手启动被替代，无付费服务请求。
- 视觉复查发现原生单选框继承全局输入框100%宽度，补充几何检查先复现失败，再固定单选框16px并复跑通过。最终截图覆盖失败截图。

## 规则 ID 与结果

- **Foundation-01/02/03、Surface-01**：冷灰页面、实白卡、蓝选中态、13–15px辅助及正文，沿用字体和颜色；截图人工核对。
- **Layout-01/02、Surface-03**：调研正文内部滚动、标题与底部提交按钮保持可达，两个窗口尺寸已截图；创作保存固定顶部。
- **Controls-01/02、Reading-03**：调研两个选项同时可读，无额外说明按钮；原生radio提供键盘语义；自定义标题为低频折叠项。
- **Reading-02、Interaction-03**：保留完整参考、历史与正文；不新建第二份正文，不自动保存、不自动批准助手任务。
- **Acceptance-01/02**：以上类型与行为检查及截图留痕；创作三视图、原句批注、录制、冲突、空稿已截图；详见 `creation/receipt.json`。
- **Acceptance-03**：本机 darwin-arm64 开发环境；未打包、安装、升级或替换 `/Applications` 应用。Intel Mac、Windows及系统应用信息展示未验收，不宣称跨平台通过。打包要求引用根 `AGENTS.md`。

## 证据

调研图与回执在 `research/`；创作页图与回执在 `creation/`。测试资料为合成内容，未改动真实用户内容库。
