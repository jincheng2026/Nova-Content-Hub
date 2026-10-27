# 第二大脑专门页面与维护补齐

基础提交 `7d356fd`；需求以完整交付计划和后续用户补充为准。所有原始资料只读，真实验证使用隔离副本。此处两项为独立owner，前期类型和数据保护检查，后期集中回归，不开子代理、不自行提交。

## Task 1 结构化资源进入原有专门页面

所有权：新增 `plugin-src/src/lib/vault/resources.mjs` 及声明/定向测试，修改 `plugin-src/src/lib/vault/bridge.mjs` 以加载和接入资源投影。不得改core.mjs/index.mjs、workbench、builder/skills；需要共享接口时先通知主线程。bridge基础owner已完成并移交。

现有适配仅T内容进入现有内容页面。必须让01账号、库内报告和提示词真实进入原有账号/报告/提示词页面，并且界面创建/编辑能原位保存，不仅从“资料与定位”通用文件列表读取。

bridge有 `registerVaultResourceProjector(projector)`；sync拿单次 `snapshot` 后、T指纹早退前调用 `projector({runtimeRoot,vaultRoot,snapshot,rawApi,mutate})`。这里尚无runtime锁，syncing=true。资源模块按自己的source hash差异投影，不重开、不重扫、不调用包装API造成重入。可按需替换注册为默认静态导入，确保在应用和CLI均自动加载。

账号：导入可辨识的账号档案/说明Markdown/JSON，不将01中每个附件或研究副本都伪造为账号。最小稳定字段name/platform/url/note，未知保留未知；原文与来源可追溯。明确写入的管理块或独立标准档案支持原位往返，保存保留人工正文。提示词：按文件标题/frontmatter/category/tags/body映射现有prompt对象；修改仍保留未知frontmatter/原文。报告：已有HTML及Markdown报告进入production reports，Markdown转换安全可读HTML资产作为显示投影，原文保持权威；真实来源和关联保留。普通素材/字幕/备份不能都变报告。

必须用稳定ID/映射和原文件hash；未知、缺失与冲突不能伪造空数据。工作台新建账号、提示词、报告应创建库内可读档案。source改动投影更新，runtime新修改必须以持久原位变更接入，不能长期保留两份独立当前值。

重点：`index.mjs` 已在 `applyTransaction` 调用 `applyVaultSourceTransaction(root,tx)`，目前bridge只处理content。可在bridge扩展资源事务hook，从已持久化的workspace/prompt事务获取固定before/after与mutationId，在runtime capture前执行原位CAS；投影自身写入必须带可辨识的projection intent，避免回写循环。原件已提交而runtime未捕获时必须能用同mutation恢复；不得简单在API成功后做一次无法核验的副作用。

最低验证：新Vault预置账号/报告/提示词→现有API列出、原位修改后更新、通过旧API编辑后原文件回读、新建正确落盘、重复mutation和外部冲突保护；旧库功能不回归。真实第二大脑副本按来源统计每类识别/排除，保留完整来源清单。不要为通过而重写同事文件或绕开原有production报告资产校验。

## Task 2 完整知识库备份 恢复与迁移

所有权：新增 `plugin-src/src/lib/vault/backup.mjs` 及声明/测试，必要时修改 `plugin-src/src/lib/vault/index.mjs` 增加明确恢复/迁移入口；`workbench/src/main/maintenance-controller.mts`、`maintenance-worker.mts`、`shared/maintenance-contracts.ts`、`maintenance-validation.ts` 与必要 `renderer/maintenance-panel.tsx`。不得改bridge/core、其他workbench文件、builder、skills或其他owner新资源模块。若必须扩展file-library旧公开函数先通知主线程。

当前维护只备份.workbench/runtime，不能显示“完整知识库已备份”。实现新Vault完整backup/verify/restore，普通旧库仍原样走既有实现。复用现有维护UI与有限IPC/worker/queue/pending，不能绕过边界或不明结果新建重复操作。

备份覆盖00—06及用户附加目录、AGENTS/README/SOURCE_OF_TRUTH/skills、自建资源及.workbench持久状态；缓存/锁只按明确规则排除。凭据和机器设置本来不在库中，不加入包。采用版本化manifest、每文件SHA256、完整树核对及来源稳定性检查，拒绝symlink/越界，目标必须在整个Vault之外，不只是runtime之外。备份若遇外部修改不宣布成功，保留可核验现场。

恢复到新的目标目录，先verify再复制/验证，最后显式重绑定Vault根/运行根身份并退休活跃助手尝试，旧claim不得用于新位置。保全原文件、自定义规则、当前稿件、历史与内容ID；来源不动，不覆盖现有目标。原有库备份仍能验证/恢复；新Vault备份必须由正确format识别，不能用旧“只备份运行资料”冒充完整备份。

移动/复制到另一台机器后，提供明确的迁移接入/恢复路线；仅明确操作后重绑定，不自动接受同路径被替换。新写入始终检查当前根身份；不能直接把descriptor的旧identity忽略掉。

最低验证：备份包含用户文件与隐藏运行数据、SHA篡改检测、目标在Vault内拒绝、symlink拒绝、复制中源变化拒绝、完整恢复新目录后open/read/edit、活跃attempt失效、重复/丢响应恢复和旧库维护回归。适用native类型检查与现有维护定向测试；不跑全套/不构建应用。

## 提交与报告

每项先读对应brief。报告写 `.superpowers/sdd/2026-10-28-vault-followup-tasks/task-N-report.md`，列文件、真实命令与结果、限制。主线程审查diff、分段commit、集中回归与安装。原资料、其他聊天的xindao-xuanti方法和未分配文件保持原状。
