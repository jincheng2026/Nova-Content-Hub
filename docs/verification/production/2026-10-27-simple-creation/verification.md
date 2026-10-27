# 简化整篇创作验收

2026-10-27，源码版本 0.3.54。改动仅涉及创作入口、固定任务 workflow、整套预览/采用与写作方法分支；内容库四分类及其他生产页面沿用既有实现。

## 行为证据

先运行新增测试观察缺失能力失败，再实现。`contracts-test.log` 中 37 项通过，覆盖 workflow 限制、首次内部 ensureCreation、同内容同 workflow 活跃任务复用、启动失败同 attempt 重开、Codex/WorkBuddy 两种等待状态、submitted 去重、冻结权限/预算、整套纯预览、单次 CAS 保存、旧正文拒绝、重复字段和混入审稿/拍摄拒绝、包装保留人工选择、验收后保存失败与版本冲突无部分采用。`typecheck.log` 记录 native 与 renderer 类型检查。

`electron/receipt.json` 与 `electron-probe.log` 来自独立临时 Electron 包，使用本次源代码重新编译 native 和 renderer，数据与助手启动为合成测试，不调用真实 AI，也不替代宿主实际聊天验收。覆盖首点创建、启动失败复用、两种等待状态、未保存保护、submitted 全套预览、验收后模拟保存失败、保留预览并重试采用。

## 设计规则逐项结果

- **Foundation-01/02/03、Surface-01**：沿用公共冷灰背景、白色卡片、蓝主操作和 14px 输入；读取实际截图，文字、输入和白卡边界清楚，未新增主题或全局配色。
- **Layout-01/02**：1280×860 与 960×680 初始滚动位置均能看见需求输入和主按钮，无横向溢出；截图为 `electron/simple-creation-1280x860.png` 与 `electron/simple-creation-960x680.png`。
- **Controls-01/02**：创作页整页首屏只有一个实心主按钮；外层制作封面降为次按钮。需求使用现有 Semi TextArea，保留 disabled/loading；高级编辑默认收起，主按钮处理首次启用。
- **Reading-02/03**：整套结果同一预览完整展示各 artifact 正文，长文区可聚焦并滚动，完整结构数据可展开；原参考、拆解、包装、历史、审稿与反馈都在高级区可访问。
- **Interaction-01/03**：沿用忙碌和草稿保护，未直接执行工作台 AI/CLI；正在执行或等待时继续原聊天，无法定位会话明确提示，不自动批准权限。
- **Acceptance-01/02**：新增契约与真实 Electron 合成交互通过。`bundle-before-adoption.png` 和 `bundle-adopted.png` 保留回传及采用后的页面证据。
- **Acceptance-03**：本轮 UI 证据仅 macOS darwin-arm64 Electron 临时测试环境；真实 Codex/WorkBuddy 会话、Intel Mac、Windows x64/ARM64、最终安装包、安装后系统信息及升级/卸载本文件不宣称通过，另按根 AGENTS.md 和主线程发行验收记录。

## 保存与恢复边界

预览时冻结 content.editToken、bodyHash、整套 creation 与任务回执。人工确认先验收原 receipt，再仅使用验收返回的 productionToken 发起一次 saveProductionDraft；正文与资料始终用预览时的版本。验收成功而保存失败显示“已验收，尚未采用”，保留原预览供重试；存在 pending 原操作时沿用既有恢复入口。不会读取最新正文后静默变基线，也不会逐项保存造成部分采用。

## 受控前置助手补验

主入口复用 claimed/waiting 任务与“打开助手”次入口均通过统一 launch 状态分支：created 才创建任务交接；claimed 和两种 waiting 仅前置系统登记的宿主应用；submitted 返回预览提示。所有相关通知优先展示返回 message，保留“当前无法自动定位原聊天”的能力边界。`focus-targeted.log` 双宿主 2 项通过，核对 focus 回调、task/attempt 数量、原 claimToken 与 workerId 保持不变；最终 Electron 合成探针同时点击主/次入口，确认 4 次 focus、0 次新增 launch，并完整显示能力提示。
