# 普通资料回收与原位恢复

普通资料回收列表与恢复已接入桌面 IPC，并挂到「资料与定位 → 资料范围 → 回收区」。本记录证明源码接线、临时库恢复链路与组件行为；没有执行安装后 GUI 或跨平台验收。

- Root真实trash API新回归经历RED；新请求将vaultId/root dev/ino放进requestHash，锁内复核源版本，恢复同锁核验原回执与bytes、原路径空闲。独立restore回执幂等，后来手改不被重放覆盖。
- 升级旧trash请求精确重放单独RED→GREEN，旧回执始终不提升为可恢复。Root曾引入嵌套锁导致NOT_READY，已定位runMutation自加锁，在持有同库锁的本地core路径使用private runMutationUnlocked；最终真实API+独立模块23/23。
- 既有Vault/pending-index与注入UI兼容回归47/47；组间有不同覆盖，不合并为一次全库通过。全部临时库，无作者原库写入、无网络/模型/GUI。
- 正式资产、内容专属回收、正式发布档案/分析来源、linked、跨库/换根、篡改/缺失/符号/硬链接、同名占用均拒绝普通恢复。原回收对象仍保留。

## 桌面接线收尾

- `listVaultDocumentTrash()` 与 `restoreVaultDocument({trashId,expectedHash})` 已注册 boundary、preload、controller、worker、共享契约和严格参数校验。renderer 不能提交路径、库根、原字节、回执或 mutationId。
- 恢复沿用持久 `vaultPending`。丢失响应后可重开核验原 mutation；已恢复原件的后来手改不被重放覆盖。认证、其他待处理意图、库与物理根身份均保留原有门禁。
- 列表复用有限只读队列，排队时固定原库 binding，等待期间切库则拒绝。worker 对只读 `VAULT_BUSY` 有界重试，不重放恢复写入。
- 资料页显示回收区，恢复后更新原列表与回执状态；原路径占用时可定位既有文件。库作用域变化会丢弃旧异步回收结果。外部来源变化和恢复事件会刷新回收区。
- 两个收尾缺口先复现为 RED：后台读取占用导致列表立刻 `BUSY`；`nova-vault-source-changed` 后回收区仍显示旧状态。修复与新增行为断言见 [RED 摘要](desktop-red-summary.md) 和 [GREEN 日志](desktop-green.log)。

## 本轮验证

| 范围 | 命令／证据 | 结果 |
| --- | --- | --- |
| core、真实 trash API、独立回收组件 | `node --test plugin-src/src/lib/vault/test/document-trash-core.test.mjs plugin-src/src/lib/vault/test/document-trash.test.mjs workbench/test/vault-trash-panel.test.mjs`；[日志](core-ui-regression.log) | 27/27 |
| 桌面恢复、认证／pending／binding、只读队列／重试、实际 preload 与资料页组件接线 | `node --test workbench/test/vault-trash-desktop.test.mjs`；[日志](desktop-green.log) | 9/9 |
| 相关 boundary、既有 Vault、编辑恢复、worker 争用 | [日志](related-green.log) | 29/29；与上两组有重叠，不作为全库通过 |
| 扩大到有界原文阅读接线 | [日志](desktop-regression.log) | 38/39；linked 根替换预期 `CONFLICT`、实际 `SOURCE_NOT_AVAILABLE`，均拒绝读取；定位在未由本轮修改的 `document-reading.mts` |
| renderer 类型检查 | `workbench/node_modules/.bin/tsc -p workbench/tsconfig.renderer.json --pretty false`；[日志](typecheck-renderer.log) | exit 0 |
| native 类型检查 | `workbench/node_modules/.bin/tsc -p workbench/tsconfig.native.json --noEmit --pretty false`；[日志](typecheck-native.log) | 当前被 U2 范围外的 `desktop.mts:225` handoff nullable URL、`production-controller.mts:84` ASR 字段错误阻断；未越界修改 |

所有库与绑定写入仅发生于临时 fixture；组件通过真实 TSX 的注入 hook harness 执行，preload 通过实际编译产物在隔离 VM 执行。没有开启 Electron 窗口、访问网络、调用付费能力、改写作者原库或重新打包。

## 设计规则与未覆盖项

- Controls-01/02：恢复、刷新与范围切换沿用公共 Semi 控件；查询、分类、20/50/100 分页、禁用和错误保留已有行为覆盖。
- Reading-02：保留资料名与原路径，长路径允许换行；原路径占用说明可见，并保留定位入口。
- Surface-03：本轮直接挂入资料页，没有新增模态；既有资料编辑模态的行为由相关恢复回归覆盖。
- Acceptance-01：上表区分本轮通过、扩大回归差异及非 U2 类型阻断；不宣称全量测试或构建通过。
- Acceptance-02/03：页面实际截图、窄窗口、真实键盘／焦点、安装后删除→恢复→重启，以及 macOS／Windows 各目标架构仍待实际环境验收。打包与交付要求以根 `AGENTS.md` 为准。
