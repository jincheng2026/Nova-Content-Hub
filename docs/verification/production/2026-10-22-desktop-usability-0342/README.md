# 0.3.42 桌面可用性修复预览准备

本目录用于下一版 Apple Silicon Mac（darwin-arm64）预览；AUTH_MODE=disabled、productionReady=false。权威交付要求见根 AGENTS.md。0.3.41 的冻结源码、tag、交付与验收证据独立保留，本目录不修改旧版记录。

当前仅完成版本准备，源码修复、测试与主线程审查仍在进行；未提交冻结、未构建、未安装。版本入口、两个 lockfile 根包与生成 prototype 的 pairId 由 prepare.mjs 独立核验，结果见 preparation.json 和 logs/preparation.log。准备脚本只读取源码元数据、写入本目录，不读取当前机器绑定或用户内容库。

## 后续执行顺序

1. 主线程完成测试与真实 diff 审查，明确允许冻结后，再提交版本与当前修复；从干净 checkout 执行现有 `npm run dist:preview:payload --prefix workbench -- --platform darwin --arch arm64`。构建日志写入 ignored release 目录，避免破坏 sourceIdentity 的干净工作区约束。
2. 复用 native-payload、package-snapshot、validateInstallerMarketplace 与 export-colleague-delivery，核对冻结提交/锁文件、原生架构、版本公司信息、签名、DMG/归档全树及三文件交付；具体路径与 SHA256 以最终实际产物为准。保留新独立负载/归档，不清理其他版本或历史恢复副本。
3. 主线程正常退出旧应用并确认精确进程停止后，安装阶段重新读取实际 machine-binding，核对当前库 ID，独立复制并比较完整库快照；不套用旧版基线、不恢复或覆盖用户业务文件。重新检查精确进程后调用产品 installMacApplication 事务安装，保留旧应用恢复事务。
4. 显式进入插件阶段后，通过官方 CLI 更新 Codex、WorkBuddy 配套插件；先私下备份配置，核对两端 cover/template 及不相关插件设置。只有版本匹配与技能校验通过才能记为配套就绪；当前会话重载和真实生成分别记录。
5. 主线程完成 Finder 名称/图标/版本/版权/实际大小与时间、实际启动、正常退出重开验收。最终产物完整性、安装事务 complete、原库完整字节变化分开记录。若并发业务或 Finder 元数据变化，保留严格失败和精确差异，不能忽略 .DS_Store 或改写安装前基线；采用带观测时间的有限快照，避免追逐移动目标。

本轮计划包含 Finder 元数据兼容、旧内置模板的逻辑退役（用户原目录保持）、共享图片查看/缩放、渠道选择与表单控件修复，以及桌面包移除旧网页导入与浏览器执行负载。最终纳入范围以冻结 diff 和测试证据为准，不在准备阶段宣称实现或发布完成。

| 目标 | 构建 | 安装 | 原生验收 |
|---|---|---|---|
| darwin-arm64 预览 | 待主线程允许冻结后执行 | 待正常退出与新备份 | 待实际系统验收 |
| darwin-x64 | 本轮未进行 | 未进行 | 未验收 |
| win32-x64 | 本轮未进行 | 未进行 | 未验收 |
| win32-arm64 | 未纳入本轮 | 未进行 | 未支持/未验收 |

未进行正式 Developer ID 签名、公证或生产发行。准备记录不证明任何新安装产物已通过。
