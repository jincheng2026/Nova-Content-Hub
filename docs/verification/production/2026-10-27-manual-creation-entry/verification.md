# 高级区手动启用入口修复

2026-10-27。真实 CUA 验收发现：新建并保存内容后进入“创作”，展开高级区为空。原因是高级区所有工具受 `draft &&` 控制，而简单主按钮会先创建整篇助手任务才初始化 creation。用户无法先导入音视频或手动整理参考。

修复只在 `ContentProduction` 高级区的 `draft === null` 空态增加说明和次按钮“启用参考与手动编辑”。点击使用读取时的 `state.productionToken` 调用现有 `ensureCreation`，随后 `reload`；不创建助手任务、不唤起助手、不改写正文。按钮沿用 blocked/dirty/loading 保护，冲突和失败沿用当前提示及恢复入口，需求输入保留。

先添加 Electron 回归断言，旧页面因缺失 `#enable-manual-creation` 失败，见 `red.log`。修复后 `final-electron-probe.log` 和 `electron/receipt.json` 记录：初始0 creation/0 task → 手动启用 → 添加参考 → 原保存入口 CAS 保存；得到1 creation/1 reference，0 task/0 launch/0 focus，正文保持原样。原整套回归曾通过；后续重复截图运行的旧夹具在库外同步注入任务时遇到与后台读取的锁竞争，保留于 qa 日志。本次最终使用独立最小探针，仅覆盖真实页面初始化和参考保存路径，避免无关的跨进程任务注入；生产文件锁规则未变。

规则验收：

- **Layout-01、Controls-01**：1280×860 与960×680 简单页主动作首屏可达；高级默认折叠，新增按钮为次按钮，初始整页仍只有一个实心主按钮。
- **Surface-01、Reading-03**：空态使用既有白色 Card 与清晰说明，启用后恢复原参考和手动表单；没有增加全局样式。
- **Interaction-01/03**：复用原异步 busy/error 与 CAS，不直接调用 AI/CLI，不扩大服务权限。
- **Acceptance-01/02**：renderer typecheck 和 diff 检查通过；独立临时 Electron 包重新编译本次 native/renderer，保留空态与参考保存截图。测试数据和助手回调为合成，不宣称实际音视频转写服务、宿主聊天或最终包通过。
- **Acceptance-03**：本轮仅macOS darwin-arm64临时Electron环境。未打包、未改版本；最终包重建、安装及其他平台验收由主线程按根 AGENTS.md 记录。
