# 2026-10-28 Vault 读取与长期编辑性能验收

## 范围和环境

本次仅验收 Vault 读取、内置资源初始化和事务恢复性能；未构建或安装发行包，也不代表 Intel Mac 或 Windows 原生验收通过。环境为 darwin-arm64、Node.js v24.20.0；验收源码为 `88b392557fb3cc620593841fe4f14bb4e8822093` 上的当前未提交工作区，最终冻结提交由发布记录关联。测量期间其他验收任务也在运行，以下均为实际单次 wall-clock 耗时，不作固定性能承诺。

原用户 Vault 未写入。测试从交付候选副本再复制专用副本，两个副本保留相同逻辑 Vault ID，并分别更新自身物理身份与 runtime 绑定；未绕过身份校验。

- 逻辑 Vault ID：`74d0b77a-895b-4850-ba1f-6c5b15cd58c2`。
- 只读性能副本：`/private/var/folders/vl/nhqtk_8s6vl5j679xhv_z3n80000gn/T/nova-jincheng-delivery-candidate-dDAbqv/perf-read-agent`；Vault `dev=16777231, ino=83279386`；runtime `dev=16777231, ino=83289354`。
- 缺 26 条 builtin 的初始化副本：同目录下 `perf-seed26-agent`；Vault `dev=16777231, ino=83349423`；runtime `dev=16777231, ino=83359383`。仅在该副本删除待重装的 26 条 builtin 原位文件及其运行投影，保留来源映射、其余资源和用户内容。

## 变更与安全约束

- 复用 bound handle；每次有限 IPC 仍验证当前运行库身份。读取原位文件不使用 TTL 快照缓存，保留现有字节/hash/CAS 校验。
- 只有 topics/drafts 创建需要扫描 T 编号；提示词等普通知识文件不再为一个不会使用的 T 编号扫描全库。路径、8 MiB 正文限额、返回文档 ID/hash 和事务幂等契约保留。
- 新事务顺序为：完整带校验和/逻辑 Vault 身份的 pending 索引 → 原 pending 日志 → CAS apply → 原 committed 日志 → 删除 pending 索引并同步目录。原日志永久保留。
- 无迁移 marker 的旧库扫描所有旧日志，把所有 pending 完整写入索引后才发布 marker；之后恢复仅枚举 pending 目录。索引与原日志 request/完整计划不一致一律拒绝。已 committed 的相同计划只清理残留索引，不重放后来已被用户改过的文件。
- 日志原子写入的未发布临时文件位于 `.workbench` 暂存位置；真实进程在 pending rename 前退出不会留下破坏严格 pending 索引的未知文件。
- 有限 Vault 快照、文档和任务上下文读取与写入使用同一跨进程锁。仅复用当前同步栈真实持有的锁；`withVaultLock` 本身仍非 reentrant。
- working-draft/publication-runtime 的 CONFLICT 保留 pending 意图，允许读库并返回包含 mutationId/action/path 的问题；显式重试同 ID 会再次执行 frozen plan，不能返回 pending result 冒充提交成功。其他恢复错误仍抛出。

## 真实整库指标

只读副本有 7,772 个文档、46 条内容、56 个账号、31 份报告。下面 native 测量直接调用实际 `executeVault`、`executeProduction`、`executeWorkspace`，先在明确打开阶段 prime bound handle。

| 操作 | 实测耗时 | 数据校验 |
| --- | ---: | --- |
| prime bound handle（打开阶段） | 4,004 ms | 当前副本运行库身份验证 |
| native vaultRead | 470 ms | 7,772 文档 |
| native productionRead | 2,189 ms | 46 内容、31 报告 |
| native workspaceLibrary | 6,027 ms | 53 提示词 |
| 再次 native vaultRead | 355 ms | 7,772 文档 |
| core snapshot warm | 306 ms | 7,772 文档、121 条来源/格式问题保留 |
| 已存在 builtin 的幂等 seed | 5,223 ms | 新增 0 条 |

未修改原 15 秒读取 deadline。这里验证的是直接 native operation；真实 Electron 两进程 UI/probe 与最终安装包需合并主线程证据。

26 条缺失 builtin 的同等全库副本：初始化前 7,746 文档、46 内容、56 账号、31 报告、27 提示词；`openLibrary` 为 3,223 ms；`installBuiltins` 为 **14,373 ms**，准确新增 **26 条**；初始化后 7,772 文档、46 内容、56 账号、31 报告、53 提示词。对照任务开始时主线程同规模实测的 51,788 ms（已使用 batch、仍为每条 prompt 读全库），现在不再执行这些不必要的 T 扫描。更早未 batch 的 >180 秒只作为原问题背景，不混作同等基准。

此外以 SHA256 对比上述两个副本中除重新生成 builtin 外的 **7,804 个原位文件**，差异为 **0**。来源映射和 runtime 管理目录必须随库保留；丢弃整个 `.workbench` 的重建试验不作为完整数据等价或 seed 对照证据。

## 长期 journal 指标

专用临时库构造 1,000 条 committed 创作页日志，总字节数 160,496,000（每条包含旧 HTML 和新 HTML）。模拟原恢复方式，逐条读取并 JSON.parse 全部历史日志一次为 220 ms；新 `recoverVault` 为 30 ms（含实际锁/目录同步）。随后 20 次新写入在这 1,000 条历史存在时，中位 126 ms、最大 157 ms、合计 2,503 ms。测试还直接拦截文件打开，证明迁移后常规恢复不再打开 committed 历史日志。

此测量只说明历史日志不再加入每次恢复的读取成本；完整创作历史展示仍按既有契约读取历史，不在本次优化范围。

## 自动验证

以下命令均实际运行并检查退出码：

```sh
node --test plugin-src/src/lib/vault/test/pending-index.test.mjs
node --test plugin-src/src/lib/vault/test/pending-index.test.mjs plugin-src/src/lib/vault/test/working-draft.test.mjs plugin-src/src/lib/vault/test/vault.test.mjs plugin-src/src/lib/vault/test/backup.test.mjs plugin-src/src/lib/publication-runtime/test/runtime.test.mjs plugin-src/src/lib/creation-document/test/*.test.mjs
node --test plugin-src/src/lib/vault/test/topics.test.mjs plugin-src/src/lib/vault/test/current-source.test.mjs plugin-src/src/lib/vault/test/resources.test.mjs
node --test workbench/test/vault-desktop.test.mjs workbench/test/vault-working-draft.test.mjs workbench/test/vault-editor-recovery.test.mjs workbench/test/worker-read-timeout.test.mjs workbench/test/production-worker-client.test.mjs
npm run typecheck:native --prefix workbench
node --check plugin-src/src/lib/vault/core.mjs
```

完整 core/working-draft/backup/creation/publication 组合 94/94 通过；topics/current-source/resources 组合 38/38 通过；native desktop/recovery/read-timeout 组合 19/19 通过；native typecheck 和语法检查通过。组合运行后补充真实进程退出和 pending backup/restore；最终 pending 专项 **20/20 通过**，耗时 106,401 ms（此轮与主线程完整验证高度并发；单独 backup/restore 项亦通过）。

专项覆盖：pending、原日志、源文件和 committed 四个持久化边界；旧日志完整迁移与迁移中断；orphan pending 无旧日志仍可恢复且不能误判 missing；committed 后残留索引不覆盖后续人工改动；checksum/身份/requestHash/完整计划矛盾/未知文件拒绝；跨进程读锁；非 T 创建不扫描用户目录且保留限额；publication 冲突仍可读并显式重试；真实子进程在 pending 发布前直接 exit；带 pending 意图的完整备份恢复与新物理身份校验。

本机临时测量脚本与原始日志（供本次会话复核，不作为永久运行依赖）：`/tmp/nova-vault-native-perf-agent.mjs`、`/tmp/nova-vault-native-perf-agent.log`、`/tmp/nova-vault-seed26-agent.mjs`、`/tmp/nova-vault-seed26-agent.log`、`/tmp/nova-vault-journal-perf-agent.mjs`、`/tmp/nova-vault-journal-perf-agent.log`、`/tmp/nova-vault-owner-regression-final.log`、`/tmp/nova-vault-additional-regression.log`、`/tmp/nova-vault-native-regression.log`、`/tmp/nova-pending-fault-final20.log`。
