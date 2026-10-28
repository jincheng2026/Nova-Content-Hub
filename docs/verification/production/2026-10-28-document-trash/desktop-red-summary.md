# U2 桌面收尾 RED 摘要

运行 `node --test workbench/test/vault-trash-desktop.test.mjs`，当时 6 项中 4 项通过、2 项失败（exit 1）。以下为该次实际失败的摘要，不是完整终端日志。

1. `trash reads queue behind a finite desktop operation instead of failing during background refresh`：持有一个有限 `DesktopController.exclusive` 操作时请求回收列表，期望等待后返回 `[]`；实际得到 `BUSY`，调用栈进入 `VaultController.listVaultDocumentTrash → DesktopController.exclusive`。
2. `actual vault workspace exposes receipt restore, refreshes committed results and follows external source changes`：注入新的原路径占用状态并触发 `nova-vault-source-changed`，期望回收条目 issue 为「外部占用原路径」；实际仍为上一次「已恢复」。

修复仅涉及已授权的 U2 接线文件：列表入口复用现有有限只读队列并固定原 binding；回收列表 effect 增加来源变化监听及对应清理。随后增加排队切库、worker 只读重试、preload／sender 边界测试，最终 9/9 通过，见 `desktop-green.log`。
