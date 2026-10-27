# 成功导航后清除过期草稿保护提示

2026-10-27 真实 CUA 发现：调研输入后取消保留，点击雷达被未保存保护拦住；明确放弃填写再成功切页，旧的全局“还有未保存…”提示仍留在新页面。

根因是 `app.guard` 用普通全局 error 存储导航保护提示，而 `navigate` 成功时未区分和清理此来源。仅修改 `app.tsx`：为该保护提示标记 `managedDraftGuard`；导航动作实际执行后，状态更新只清理仍带该标记的旧提示。其他业务错误不带标记，原样保留；仍有草稿或处于确认离开阶段时不提前清理。

最小独立 Electron 探针先红后绿：`red.log` 的失败实际值为遗留的“还有未保存…”完整文本。`electron-probe.log` 和 `electron/receipt.json` 记录3项通过：保留的调研阻断导航；放弃后切雷达清除旧保护提示；注入真实 IPC 读取错误后再切页，业务错误文本仍原样保留。`typecheck.log` 为 renderer 类型检查，diff 检查通过。

本轮只调整提示生命周期，无布局、权限、保存或助手行为变更。按设计规则 **Interaction-03、Acceptance-01/02** 留痕；截图为 `blocked-navigation.png` 与 `successful-navigation.png`。测试在重新编译 native/renderer 的 macOS arm64 临时 Electron 包中执行，数据与读取失败为合成，未打包或修改版本，不替代最终包及其他平台验收（**Acceptance-03**）。
