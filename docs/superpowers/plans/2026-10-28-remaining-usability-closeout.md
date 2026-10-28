# 剩余业务可用性收口 Implementation Plan

> **For agentic workers:** 使用 `executing-plans` 或 `subagent-driven-development` 逐项执行。先遵守下文文件所有权与冻结门禁；独立模块通过不等于页面已接通。本轮只编写本计划，不实施产品或测试改动。

**Goal:** 在 0.5.3 轻量预览交付之后，闭合普通资料、账号与报告生命周期、图文阅读、作者状态编辑和原方法阶段交付，并取得可复核的真实使用证据。

**Architecture:** 复用现有原位库、来源绑定、事务回执、CAS、报告沙箱和阶段账本。独立阅读服务与纯 renderer 组件可分开实现；共享 IPC、core、production、详情页和执行 Skill 只在完整聊天主线负责人 J 停写并交接后由 Root 串行集成。普通写稿检查点与固定阶段交付归入 J 的既有主线，不另建第二套流程引擎。

**Tech Stack:** 现有 Electron、React、TypeScript、Node.js 文件库、Semi UI；不引入新的全文检索数据库、任意本地文件协议或模型服务。

**Spec:** [同事可用版计划 Task 5 / Task 6](2026-10-28-colleague-model-free-release.md)、[完整聊天主线计划](2026-10-28-content-journey-continuation.md)、[审查总报告](../../reviews/2026-10-28-colleague-readiness-review/README.md)、[CRUD 审查](../../reviews/2026-10-28-colleague-readiness-review/crud-ui.md)、[工作流审查](../../reviews/2026-10-28-colleague-readiness-review/workflow.md)、[设计标准](../../design/内容工作台设计标准.md)；全局交付要求以根 [AGENTS.md](../../../AGENTS.md) 为准。

## Global Constraints

- **当前 0.5.3 正在冻结出包，所有下述产品、测试改动均等待 Root 明确解除冻结。** 不改版本、冻结快照、真实内容库、用户设置、凭证或活跃助手缓存；本次没有运行全量测试、构建或真实业务旅程。
- 每个文件始终只有一个写入负责人；共享文件交接以实际停止写入、提交或明确 diff 清单为准，不能只按任务名称推断无冲突。
- 规划与关键安全审查采用 Astra/high；已规划实现与联调采用 Sol/high，局部修复 medium；机械整理才采用 Luna。模型不可用时如实说明。
- 用户原件、作者手改、原来源身份、已发生的录制和发布事实优先；候选、作者安排、任务终态、正式事实分别保存。任何通用编辑和恢复都不得覆盖托管最终资产、正式发布档案或作者保护字段。
- 所有读写复核 libraryId、rootIdentity、Vault/source 身份；写入复用现有 mutation 回执、锁和 CAS。切库、旧异步结果、旧 capability、目录替换均不能串库。
- 外部 linked 来源继续只读；内置来源与用户手工数据按现有权限处理。投影对象不能通过删改、恢复或“另存”伪装成原来源可写记录。
- 独立测试仅创建临时小库；最终旅程使用授权的可丢弃副本与独立 userData。原生 UI、真实助手质量、各平台产物分别记录，不以单测或开发机结果替代。

## 1. 当前基线：关闭项与真正余项

本计划依据 2026-10-28 当前源码只读核对，历史审查只作问题来源。主线程已报告并验收的以下项目**不再列作待修缺口**：报告只读 tab position 与 linked 报告页／CSV 导航 11/11、`stageArtifact.path/hash` 回执 4/4、source projection claim 30/30。它们只在后续触及对应入口时做必要回归。这里引用的是主线程验证结果，本规划未重复执行。

| 余项 | 当前源码依据 | 收口任务 |
| --- | --- | --- |
| 普通知识资料删除后缺可达恢复 | `vault-workspace.tsx` 只有 trash；`vault-contracts.ts` 无普通回收列表／恢复 IPC。core 已有恢复原件原语，可复用 | U2 |
| 外改冲突保留草稿却不更新基线 | `vault-controller.mts` 的 discarded 返回 `current:null`；`vault-editor-recovery.ts` 清 conflict 并沿用旧 current | U1 |
| 账号删除恢复、既有报告编辑删除恢复缺 UI；报告 restore 缺契约 | `production-workspace.tsx` 账号仅主页／拆解／编辑，报告仅阅读／详情；`production-contracts.ts` 无 restoreReport | U4 |
| Markdown 图片／Obsidian 嵌入与双链缺阅读闭环 | `document-markdown.tsx` 的 inline 输出图片说明和 link span，没有资源解析或导航 | U3 |
| 报告查询承诺与行为不符 | `production-workspace.tsx` 报告只 `matching(report.title)`，公共输入声明标题／账号／正文 | U4 |
| 作者状态没有可编辑枚举 | `jincheng-content-directory.tsx` 的 `DirectoryUIState.status`、`setStatus` 只更新筛选；行内为推导 badge。`VaultInputs` 无作者状态 mutation | U5 |
| 评论快卡指定导入链不通 | `research-runtime/index.mjs` render reference-card 为 `.md`；production-report 导入要求 UTF-8 HTML | U6 |
| 素材包／访谈缺版本确认对象，固定完整交付可被泛用 draft 回执代替 | `workflow.mjs` KINDS 无材料／访谈；`jincheng-workflow.mjs` writing 仅允许 complete-draft；原审查 F4/F5 | U7，交 J 收口 |

“至少一次真实作者／模型生成质量验收尚缺”是独立证据缺口，**不是已确认的代码 bug**。严格媒体验收、外置 ASR、综合调研与封面设计接线等由现有 0.5.3／主线工作负责，本计划不据旧审查另开重复修复。

## 2. 唯一负责人、独立工作与延后集成

下表为实施时分派槽位，不要求同时开满代理。默认一个执行者；只有 Root 确认文件集合互斥后才并行。所有“可独立”均指解除 0.5.3 冻结之后。

| 模块／owner | 可独立写入 | 与 J 重叠，必须延后 |
| --- | --- | --- |
| V：资料编辑恢复，Sol/high | `vault-workspace.tsx`、`vault-workspace.css`、`shared/vault-editor-recovery.ts`；新 `vault-trash-panel.tsx`；相应专属测试 | vault controller／worker／contracts／validation、core 与其导出；U1、U2 由 V 顺序改同一资料页 |
| R：有界阅读，Sol/high | 新 `main/document-reading.mts`、`shared/document-reading-contracts.ts`、`renderer/document-source-reader.tsx`；`document-markdown.tsx/.css` 与专属测试 | app、详情页、vault 页挂载、protocol/HTTP capability、controller／worker／preload／boundary；只消费注入接口，不抢改这些入口 |
| P：账号报告管理／查询，Sol/high | 新 `renderer/production-record-management.tsx`、`shared/report-search.ts`、`main/report-search-reader.mts` 及专属测试 | `production-workspace.tsx`、production core／contracts／validation／controller／worker、IPC；现有报告页只由 Root 后接 |
| S：作者状态，Sol/high | 新 `renderer/author-planning-status.tsx`、`shared/author-planning-status.ts` 和专属测试 | `jincheng-content-directory.tsx` 若 J 未声明不触及也先留给 Root；work detail、core、workflow、bridge、IPC 全部延后 |
| C：快卡格式，Sol/high | 新 `research-runtime/reference-card-delivery.mjs`、`.d.mts` 与专属测试 | `research-runtime/index.mjs/.d.mts`、production CLI／存储、运行说明与 Skills 由 J 或 Root 串行接入 |
| J：完整聊天主线，Sol/high | 保持 [主线计划 §4](2026-10-28-content-journey-continuation.md#4-接口与文件责任) 独占文件清单；U7 作为该主线验收要求 | 任何其他 owner 均不同时改 J 清单中的 core／production／shared IPC／preload／controller／app／detail／skills 等 |
| Root：整合与交付 | J 明确停写后接全部必要 IPC、领域 mutation 和调用点；检查真实 diff，执行 U8 | 不能在 J 仍改文件时“顺便接一个按钮” |

新共享类型文件是独立接口草案，尚未注册 IPC；不能提前加入 preload 或声称页面已上线。若实际实施发现依赖 J 未稳定的数据形状，先完成组件／服务的输入输出测试，等交接后一次接线。保留现有大模块结构，只提取本次确有独立责任的新增组件与服务。

## U1：外部编辑冲突可在保留本人草稿时收敛

**Files / owner:** V：`workbench/src/shared/vault-editor-recovery.ts`、`workbench/src/renderer/vault-workspace.tsx`、`workbench/test/vault-editor-recovery.test.mjs`；Root 延后修改 `main/vault-controller.mts`，并新增 `workbench/test/vault-conflict-closeout.test.mjs`。

**接口决策：** 沿用 `VaultRecovery.current`，不新建第二套保存协议。discard 已确认“未提交”后，controller 在同一库身份下重读准确 documentId；成功时返回 latest `VaultText`。`reconcileVaultEditor` 保留当前 `text/title/category`，以 latest 更新 `current`，在新旧源 hash 不同时保持 `conflict:true`。新建失败、原件失踪、读取权限变化与普通 source conflict 分开，不把 `current:null` 当作“允许覆盖”。

- [ ] 扩充现有最小测试，先复现 discarded 后原有草稿与外改版本共存的失败用例：

```js
const latest = {document: {...document, hash: 'b'.repeat(64)}, text: '外部修改'};
const state = {...initial, current: committed, text: '本人草稿',
  submission: {method: 'saveVaultDocument', input: {id: document.id,
    expectedHash: document.hash, text: '本人草稿'}}};
const next = reconcileVaultEditor(state, {...recovery,
  method: state.submission.method, input: state.submission.input,
  outcome: 'discarded', result: null, current: latest});
assert.equal(next.text, '本人草稿');
assert.equal(next.current.document.hash, latest.document.hash);
assert.equal(next.conflict, true);
```

- [ ] 实现三种清晰动作：“比较当前原文”“继续编辑本人草稿”“放弃本人草稿并载入原文”。继续编辑只在用户看见最新原文并明确选择后解除本次 conflict，下一保存使用 latest hash；丢弃草稿需二次危险确认。不能自动三方合并，也不能静默把本人稿当新原文。
- [ ] 保存冲突后的 pending 先走已有核验；uncertain 仍阻止新写入。只有证实 missing／discarded 或 committed 后才可解除 pending。读取 latest 失败时保留草稿与身份，显示恢复原件／重试／复制草稿入口。
- [ ] 用临时库跑“读 A→本人输入→外改 B→保存冲突→核验未提交→读 B→本人合并→按 B 保存 C→重开 C”；再插入第二次外改 D，必须再拒绝覆盖。切库和错误 submission 事件不得更新本页。
- [ ] 定向验证：`node --test workbench/test/vault-editor-recovery.test.mjs workbench/test/vault-conflict-closeout.test.mjs`。通过后 V 独立交付，Root 接 controller 并复跑真实边界测试。

**验收：** 不需要把草稿复制到应用外再关窗重开；双方文本可见，保存确实使用新基线，错误和取消都不丢输入。视觉按 Surface-03、Reading-02、Controls-01/02 留证。

## U2：普通知识资料回收区与原位恢复

**Files / owner:** V 新建 `workbench/src/renderer/vault-trash-panel.tsx`，串行挂入资料页；Root 新建 `plugin-src/src/lib/vault/document-trash.mjs/.d.mts`，修改 core 必要恢复事务、vault 导出、controller／worker／contracts／validation；新测试 `plugin-src/src/lib/vault/test/document-trash.test.mjs`、`workbench/test/vault-trash-desktop.test.mjs`。

**新增窄接口：** `listVaultDocumentTrash()` 返回受信回执派生的 `{trashId,documentId,title,relativePath,section,hash,deletedAt,restorable,issue}` 列表；`restoreVaultDocument({trashId,expectedHash})` 走 controller 生成的持久 mutationId。renderer 不提交恢复目标路径、源字节、库根或任意 receipt。

- [ ] 写临时库测试：创建普通资料→trash→普通回收列表唯一可见→restore→原路径原 hash→重开仍可读。覆盖定位、素材、规律三个 section，并证明内容回收站不重复显示同一笔受管内容回收。
- [ ] 列表只接受当前 Vault 已校验的 committed trash receipt，重新核对回收文件 bytes/hash 与路径边界。用 receipt 而不是扫隐藏目录名猜原文件；篡改／缺失／未提交回执只显示明确不可恢复原因。
- [ ] 复用 `validateVaultRestoreSource`／`restoreVaultSource` 的锁与事务原语，但把 receipt 身份、源 hash、原路径空闲检查放在同一受控恢复事务内；不能先校验后在无锁窗口调用一个信 renderer 的 source 对象。恢复必须有自己的幂等回执，旧 trash 记录可追溯并标为已恢复。
- [ ] 同名路径已被新文件占用时拒绝覆盖，显示原路径与冲突原因，允许定位已有文件、保留回收项、处理冲突后重试；本版不自动改名或覆盖。源被篡改、符号链接／硬链接、旧库身份、目录替换均拒绝。已恢复 mutation 重放不得复制第二份，也不得把后来删除／编辑的原件再覆盖回来。
- [ ] 在资料页提供“正常资料／回收区”、分类／查询／现有分页；删除成功关闭编辑器，恢复成功刷新并可打开原件；删除末页最后一项夹取合法页。失败保留选择和恢复机会。
- [ ] 定向验证：`node --test plugin-src/src/lib/vault/test/document-trash.test.mjs workbench/test/vault-trash-desktop.test.mjs`，再做一次 Electron 删除→恢复→重启。记录 Controls-01、Controls-02、Surface-03、Acceptance-01/02。

**验收：** 普通资料回收不再藏在事务目录里；原件字节不变、冲突不覆盖、同一动作可恢复、重试不重复。linked 只读资料和托管最终资产不进入此可写恢复路径。

## U3：Markdown 图片、Obsidian 嵌入与双链的有界阅读

**Files / owner:** R 的独立文件见 §2；新测试 `workbench/test/document-reading.test.mjs`、`workbench/test/document-source-reader.test.mjs`；更新 `workbench/test/document-markdown.test.mjs`。Root 延后接 `vault-workspace.tsx`、`jincheng-work-detail.tsx`、共享 IPC 及现有本地资源能力服务。

**接口决策：** `readDocumentView(binding, {documentId,expectedHash})` 在主进程／worker 侧重新读取保存的原文，返回 `{documentId,hash,text,references}`。每条引用 `{refId,kind,label,state,targetIdentity}`，state 为 `ready | missing | ambiguous | unsupported | stale`。`readDocumentReference(binding,{documentId,expectedHash,refId,targetIdentity})` 只接受这张清单的引用 ID，再核验当前源与目标；不接受 renderer 提供 absolutePath／URL。图片结果经现有受控资源能力发布，组件只消费该 URL 与失效状态。

- [ ] 在独立服务用临时 internal 与显式 linked 根构造真实图片、Markdown、同名笔记及缺失附件；证明合法相对路径可解析，`../../` 越界、Windows 盘符／UNC、`file:`、编码路径绕过、符号链接、替换根、旧 hash、跨库 refId 均不可读。资源授权以规范化后仍位于所绑定来源内为准，允许有意义的同源 `../images/a.png`，不能一刀切禁止所有父目录引用。
- [ ] 解析 `![说明](相对路径)`、`![[图片.png|说明或宽度]]`、`[[笔记|别名]]`、`[[笔记#标题]]` 和 `![[笔记#标题]]`；代码块／行内代码中的语法保持字面量。相对完整路径优先；无路径名仅在当前已绑定 source 内唯一匹配才可解析，重名展示候选来源而不自动选第一条。不同 source 不互相搜索补齐。
- [ ] 图片按原顺序完整显示并复用 `ImagePreviewButton`；不改原字节。Markdown 笔记嵌入使用同一安全阅读树，最大深度 3、每次展开最多 100 个引用；循环和超限显示具体引用及可手动进入目标的入口，不能静默删去内容。heading 精确定位，重复标题／不存在标题明确提示；块引用 `#^id` 支持唯一显式块标记，未知语法显示原引用与能力限制。
- [ ] 本轮自动内嵌仅支持经内容类型检测的 PNG/JPEG/WebP/GIF 和有界 UTF-8 文本；沿用现有资源尺寸／解码限制，文本不超过 8 MiB。SVG、PDF、音视频和未知二进制显示名称及受控定位／已有查看入口，不执行或伪装成可播放。原引用永远保留可查看说明。
- [ ] 原始 HTML 继续转义，禁止 iframe／脚本、远程图片自动加载及任意网络访问。合法 HTTP(S) 文本链接由显式点击交给主进程，在准确源 hash 下核对其来自清单、无凭据、协议白名单，再调用现有系统浏览器入口；不为图片阅读增加通用 URL opener。
- [ ] `DocumentMarkdown` 没有传入受信 references 时保持当前安全文本回退，因此账号备注等所有既有调用者不会突然获得文件读取能力。未保存草稿预览只显示文字与已保存同一引用的可核验资源；新加或改动的引用提示保存后解析，不把草稿内容当目录授权。
- [ ] 切库、源改动、target hash 变动、linked 根暂时不可用时立即使旧引用失效；返回来源恢复后重新读，不复用旧 capability。测试摘要 `markdownSummary` 不触发图片、网络或文件加载。
- [ ] 定向验证：`node --test workbench/test/document-reading.test.mjs workbench/test/document-source-reader.test.mjs workbench/test/document-markdown.test.mjs`。Root 接入后在真实 Electron 读普通资料、内容正文和 linked 来源，检查末图、返回原位置、缺目标、长路径及键盘预览。

**验收：** 明确支持的图文可读，失败保留精确原因，原文不被规范化写回。按 Image-01/02、Reading-02、Foundation-02/03、Surface-03 留实际截图；跨平台触摸板／滚轮操作分别标实测或待验。

## U4：账号、报告生命周期及查询语义

**Files / owner:** P 新组件与服务见 §2；Root 延后修改 `production-workspace.tsx`、`plugin-src/src/lib/file-library/production.mjs`、`production.d.ts`、shared production contracts／validation 和必要 controller。新测试 `workbench/test/production-record-management.test.mjs`、`workbench/test/report-search.test.mjs`、`plugin-src/src/lib/file-library/test/production-record-lifecycle.test.mjs`。

**接口决策：** 账号沿用 `trashAccount/restoreAccount`，报告补 `restoreReport({id})`，均沿用 manual mutation expectedToken。管理组件接收 `{record,snapshotToken,onSave,onTrash,onRestore}`，不自行持久化。报告查询入口 `searchProductionReports({query,type,from,scope,cursor})` 仅搜索当前库注册报告，返回匹配 IDs、命中字段、游标和 `complete/partial` 状态；cursor 绑定库与快照版本，不能成为任意资产读取令牌。

- [ ] 组件先用注入回调验证正常／回收区切换、准确 id/token、取消保留草稿、危险确认、末页删除与恢复。账号删除不删共用报告、头像、截图或原件；报告删除不删账号或共用资产。恢复保留原 id、页序、关联与历史回执。
- [ ] 后端补 restoreReport，并复核所有四个 trash/restore 入口的来源限制，不能只在按钮隐藏只读对象。library 手工记录可操作，linked/source projection 不可经直接 IPC 修改；源缺失不等于已回收。雷达与受控任务原报告保留专属事实和决定规则，普通表单不能改写 receipt 或雷达结果。
- [ ] 既有报告编辑使用 record.id 与最新 token。手工 Markdown 从 `meta.manualMarkdown` 原样读回并沿用 `saveReport({id,...,markdown})`；标题、类型、来源、日期、**多个**关联账号和完整 metadata 必须往返保留。不要用现有单 accountId 表单把多关联静默降为一个。
- [ ] HTML 报告编辑元信息和显式替换选定页；保留未改页的 id、顺序、assetHash、当前阅读页及未知 metadata，不把 HTML 转 Markdown 覆盖。来源投影仍只读；用户主动“创建手工副本”若实施，应有新 id 和来源标记，不能继承原任务已验收身份。修改派生副本后旧 receipt 仍指旧 hash，页面展示“已修改副本”，不冒充原回执认证的新内容。
- [ ] 选择稳定查询语义：**标题、关联账号名、当前注册正文**；输入提示改为这一准确范围。纯函数处理标题／账号／手工 Markdown；有界 reader 读取注册 HTML 页的可见文本，不执行脚本，不查任意 raw metadata／隐藏脚本／未注册附件。剔除 script/style/template 等内容后解码文本，保留正文命中片段。
- [ ] 查询在过滤后的全集上进行，再分页；不只搜当前页。每批最多 20 个页、每页沿用 8 MiB 上限，返回可续查 cursor；索引缓存仅限当前库内存且以 report page hash／账号版本失效，不建磁盘搜索真源。未完成或某页不可读时显示“仍在检索／部分正文不可读”，保留已命中项，不能显示误导的“没有匹配”。新查询、切库和源变更取消旧批次；报告回收／恢复后范围和计数一致。
- [ ] 测试正文独有词、第二页独有词、账号名独有词、标题不含词、大小写／中文、HTML 实体、脚本诱饵、外部同名报告、回收区、源变更、查询中切库。只读 tab position 与 linked CSV 导航是已修边界，只有本次改到其调用时重跑现有专项。
- [ ] 定向验证：`node --test workbench/test/production-record-management.test.mjs workbench/test/report-search.test.mjs plugin-src/src/lib/file-library/test/production-record-lifecycle.test.mjs`；串行接线后再跑 `workbench/test/production-pagination.test.mjs` 与 `workbench/test/manual-report.test.mjs`。

**验收：** 正常手工账号／报告可完整管理并重开恢复；多关联与未知元信息不丢，来源不可越权，UI 查询名与实际命中范围一致。按 Controls-01/02、Reading-02/03、Surface-03、Acceptance-01/02 验收。

## U5：最小安全的作者状态枚举编辑

**Files / owner:** S 只实现独立状态模型／控件；Root 延后接 `jincheng-content-directory.tsx`、work detail、vault core／bridge／contracts／validation。新领域文件 `plugin-src/src/lib/vault/author-planning.mjs/.d.mts`，新测试 `plugin-src/src/lib/vault/test/author-planning.test.mjs` 与 `workbench/test/author-planning-status.test.mjs`。

**决定：** 增加字段“作者安排”，枚举 `todo | paused | written`，标签“待做／暂缓／已写”；另有“按来源推导”操作，存储为清除作者覆盖，不增加第四个业务状态。卡片显示标签与编辑入口，列表显示可编辑状态列，顶部现有下拉明确标为“筛选作者安排”。作者安排不含已录制／已发布，不改变教程检查点或主线完成状态。

**持久化接口：** `setAuthorPlanningStatus({contentId,status,reason,expectedRevision,sourcePins})`，status 可为上述三个枚举或 null（清除覆盖）。服务端按稳定库身份＋T 解析目标，保存到同 T 的独立 `作者安排.json` 受管记录，包含历史决定、原状态依据 hash 和修改时间；使用现有锁、CAS、持久 mutation 回执，不直接改原卡自由文本或总览表。新文件格式与恢复动作由 Root 注册，组件不能自选保存路径。

- [ ] 先测只读推导状态仍遵守原卡暂缓、hasDraft、recorded、published 的既有优先级。无作者覆盖时行为不变；读取失败不默认当“待做”。
- [ ] 作者显式选枚举才产生记录；保存失败保留当前选择与说明。已写只是“本人标记已写”，没有实际当前稿时显示“尚未找到稿件”，不能满足 build／发布／主线阶段验收。暂缓或待做不抹掉已录制／已发布，事实标签与已发布目录继续按真实证据显示。
- [ ] 作者覆盖可决定选题目录的安排过滤／待办排序，真实发布分类优先；“在做”仍依据真实稿件与录制情况，不仅凭作者选已写创造稿件事实。详情并列显示作者安排、原卡依据、录制／发布事实，避免用一个 badge 代表四种含义。
- [ ] 来源卡或总览的相关 pins 改变时标记作者安排“来源已变化，待核对”；保留上次选择与原依据但不静默覆盖新的源状态。用户读回后重新确认，生成新 revision。多源冲突、T 不明确、删除内容或另一库同号 T 均拒绝写入。
- [ ] 测试重复 mutation、并发两次选择、原件外改、清除覆盖、重开／切库，尤其用有正式发布档案的样本依次选三个状态；原卡、正文、录制字段、发布档案、stage ledger、任务 receipt 的 hash 必须不变。
- [ ] 定向验证：`node --test plugin-src/src/lib/vault/test/author-planning.test.mjs workbench/test/author-planning-status.test.mjs`。整合后回归 `workbench/test/vault-topic-status.test.mjs`、`plugin-src/src/lib/vault/test/topic-status.test.mjs`；卡片／列表／过滤分页均原生验证。

**验收：** 用户能够实际保存枚举字段，而非仅改变筛选。Controls-02 的固定枚举无需搜索；Controls-03 的状态来自真实字段，Foundation-04 不以颜色代替文字。作者安排与正式事实的区分需在界面可见。

## U6：评论快卡 render → import → submit 的一致产物

**Files / owner:** C 独立新增 `plugin-src/src/lib/research-runtime/reference-card-delivery.mjs/.d.mts`、`test/reference-card-delivery.test.mjs`；J 完成其 runtime 变更后，Root 串行接 `research-runtime/index.mjs/.d.mts`、运行说明／执行 Skill。完整测试新建 `plugin-src/src/lib/research-runtime/test/reference-card-submission.test.mjs`。

**决定：** 保留现有 `renderReferenceCard(payload)` 的 Markdown 原件；新增 `renderReferenceCardDelivery(payload)` 返回 `{markdown,html}`，HTML 使用已有安全 Markdown 报告渲染器。runtime render 的主交付 `relativePath/sha256` 指向静态 HTML，同时返回 `sourceMarkdown:{relativePath,sha256}`，保留 findingsHash。原有 production-report 导入白名单不放宽为任意文本。

- [ ] 用现有真实 schema 的评论 fixture 验证 Markdown 与 HTML 均保留 cid、同源引文、证据等级、未知钩子判断和空的作者判断；错误引文仍拒绝，转换不能把 L2 快卡提升为 L3/L4 或代填本人意见。
- [ ] 用实际 runtime.render→production CLI import→submit 的隔离链验证 HTML assetHash／findingsHash／原 Markdown hash 一致；保留 Markdown 原件可读回。测试错误扩展、篡改字节、其他 task／attempt 的资产、失效 claim、无 comments 许可和旧 receipt，不能用直接 artifact.text 提交代替本链验收。
- [ ] 更新执行说明让助手导入 render 返回的 HTML 主路径，再读取导入回执并提交对应 assetHash。老任务的 `.md` 结果保持可读；需要重新交付时显式重新 render，不能改旧请求或旧回执为“已是 HTML”。
- [ ] 定向验证：`node --test plugin-src/src/lib/research-runtime/test/reference-card-delivery.test.mjs plugin-src/src/lib/research-runtime/test/reference-card-submission.test.mjs plugin-src/src/lib/research-runtime/test/comment-report.test.mjs`。

**验收：** 文档规定的实际链可跑通，报告页可读，原文和来源仍可追溯。静态 HTML 格式通过不等于评论洞察内容质量已经通过。

## U7：普通写稿检查点与固定阶段交付，交 J 单线实现

**Files / owner:** J 独占 `vault/workflow.mjs/.d.mts`、`commands/jincheng-workflow.mjs`、`commands/jincheng-creation.mjs`、file-library production、content-journey、method-adapters、shared／main stage 契约及执行 Skills；本计划不另派实现者。Root 在 J 交接后检查实际实现是否覆盖本节，缺口由 Root 串行补齐，不能把主线 panel 完成视为这些契约自动完成。

**阶段对象合同：** 普通 `jc-content-writer` 增加 `material-pack` 与 `author-interview` artifact kind，沿用同 T artifacts／checkpoint ledger，每版有 artifactId、path、hash、methodId、taskId／attempt 归属和依赖 pins。素材包包含问题、来源文件／图片及可用材料，访谈保留逐问本人回答、待确认与未回答项；整理后的素材包引用准确访谈 hash。确认的是这版素材包及依赖，而非泛用 waiting-user 文字。

- [ ] J 在普通写稿主线加入：保存初始素材包→一次一问访谈→保存访谈与整理后的素材包→工作台作者确认准确版本→构建初稿。不得强套教程叙事／重点段，也不得由助手自填 author evidence 使确认生效。
- [ ] 确认入口沿用可信作者 controller；展示来源及该版全文。素材包／访谈／源材料改动使旧确认失效；拒绝或 reopen 后再 build 必须停住。退出／重启／同聊天继续／显式换助手都能读回问题、本人答案和未确认版本；旧 attempt/epoch 不能追写。
- [ ] 新任务冻结 `deliveryContract:{version:1,kind:...}`，kind 至少区分 `candidate-text`、`complete-creation`、`stage-artifact`。由可信启动侧按明确请求选定，助手不能在 submit 时自行降级。历史无该字段任务保持旧结果可读，不能倒填“已满足完整业务交付”的证明。
- [ ] 对 `complete-creation` 的 submit 与 accept 都验证同一 work、固定 stage/method、task/attempt、当前源 pins、受控 build receipt、pageId、页面 hash、对应 complete-draft artifact 与必要作者检查点；用真实当前 bytes 验证，不只检查结果对象出现字段。accept 前再次核验，提交后外改必须提示结果过期。
- [ ] `candidate-text` 允许普通讨论／摘要候选提交，UI 明确为候选；不能推进完整主线。教程要求已确认 narrative/key-segments，科普依赖其现有 framework/segment/readthrough 门禁，普通写稿依赖本节材料确认，各自复用原 gate。发布／录制事实仍不由完整稿或 accepted 自动创建。
- [ ] J 定向测试必须包含：无材料对象、未确认、确认后材料／访谈外改、旧确认、错误 T／库／method、伪 build、空泛短 draft、别 task 的 HTML、改页面 hash、submit 后外改、旧 claim；合法候选仍可提交，合法完整任务可读回真实页并通过。现有 stageArtifact path/hash 修复只做调用回归，不重开旧问题。
- [ ] 记录到 J 主线的既有测试与验收矩阵，建议新增 `plugin-src/src/lib/vault/test/writing-checkpoints.test.mjs`、`plugin-src/src/lib/file-library/test/production-stage-delivery.test.mjs`。命令：`node --test plugin-src/src/lib/vault/test/writing-checkpoints.test.mjs plugin-src/src/lib/file-library/test/production-stage-delivery.test.mjs`。

**验收：** 普通写稿材料阶段可中断恢复、只能确认准确版本；“完整教程／完整稿任务已人工验收”可追溯到实际必要交付，而非一个通用短文回执。生成质量仍进入 U8 单列验收。

## U8：串行整合、真实页面与业务质量证据

**Owner:** Root；本节是前述模块的共同最终门禁，不增加无关重构或平台工作。

- [ ] 0.5.3 交付落定后记录其冻结提交与产物，不将后续源码能力写进已发包说明。J 交付并停写后核对文件清单，串行接 U1–U6 所需 IPC：类型、白名单验证、controller、worker、preload、边界注册、UI 调用点全部成对闭合；不开放内部路径／任意操作。浏览器环境缺少原生能力时清楚展示限制。
- [ ] 每个独立模块先跑自己的定向集合，接线后跑实际受影响旧测试与 `npm run typecheck --prefix workbench`。最终冻结只做一次所需整合回归；失败按具体修改复验，不在无变化时循环全仓测试。保留最初失败和修复结果，不把不同快照的通过数合成一个全绿结果。
- [ ] 用同一可丢弃第二大脑副本逐实体做生命周期和重开：定位／普通素材／规律走 U1/U2；账号／报告走 U4；选题／正文／原创作页检查已有编辑、回收、来源选择；模板／封面沿用各自已有回收或选用；任务只验证状态流转，发布档案只验证事实撤销／修订的专用入口。任务和正式档案不增加通用硬删除。记录变动对象、关联数量、T 与未涉及原件 hash，不能只看列表行数。
- [ ] GUI 证据最少覆盖 960×680、1280×860，卡片／列表、空态／多页／末页、长文／多图／末图、外改冲突与回收恢复、查询中切库、键盘焦点／Esc／取消脏稿。按下表逐项写实际结果，不用“风格一致”或 CSS 断言代替。

| 规则 ID | 本计划实际验收位置 | 当前规划状态 |
| --- | --- | --- |
| Foundation-02/03/04 | 冲突提示、安排／事实标签、阅读正文 | 待读真实页面核验 |
| Controls-01/02/03 | 删除恢复、报告查询、枚举编辑及状态筛选 | 待读真实页面核验 |
| Surface-03、Reading-02/03 | 长文编辑与比较、报告管理、脏稿焦点保护 | 待读真实页面核验 |
| Image-01/02 | 原文嵌图、完整预览、末图与缩放 | 待读真实页面及目标平台输入设备核验 |
| Acceptance-01 | 模块、边界、类型检查、冻结回归 | 本规划未运行测试 |
| Acceptance-02 | 上述视口及具体页面截图 | 本规划未采集新截图 |
| Acceptance-03 | 最终安装版与 OS／架构 | 沿根 AGENTS.md 分别记录，不能由开发 UI 推定 |

- [ ] 固定至少一条授权的真实内容样本，由作者参与普通写稿：逐一读取材料图片→访谈→准确版本确认→初稿→本人手改→逐句建议→标题／简介／封面→最终资产。用原片／转写／时码与来源证据核事实、不明项、本人原话与停点；没有素材／回答的部分允许保留缺口，不编造补齐。教程、科普、评论快卡分别用其要求验证，不拿普通写稿一条样本宣称全部方法质量通过。
- [ ] Codex 与 WorkBuddy 分别验证成功、waiting-user／waiting-permission 及恢复、取消、失败重试、原聊天继续、显式切换助手。复用 J 的真实主线证据，只补本计划新增入口和交付物；没有可靠 session 标识继续如实使用手动定位。任务 submit／聊天结束不算作者确认或实际发布。
- [ ] 付费采集、生图、平台发布及观测只按已有授权执行；缺少真实外部结果就保留未验，不能制造发布档案。真实作者／模型生成质量由作者审定，协议测试不代签。
- [ ] 最终报告按“代码完成、隔离验证、原生页面、真实宿主／质量、最终包与平台”分栏。后续版本、随包插件、构建安装、系统应用信息和 SHA256 按根 AGENTS.md 留证；没有 Intel Mac／Windows 环境就单列待验，不影响如实交付已验目标，也不写全平台通过。

## 3. 收口顺序与完成定义

1. **本轮：** 仅完成本计划，交 Root；当前 0.5.3 冻结不受影响。
2. **解除冻结后：** J 按原主线计划推进；Root 按独立文件边界择一执行 U1/U2 或 U3 等模块。尚未接线的模块只标“组件／服务验证完成”。
3. **J 明确停写交接后：** Root 逐模块接必要领域 mutation、IPC 和调用点，并核 U7 的真实实现。每模块过其验收再收下一模块，避免把数个未接线改动一次堆入公共入口。
4. **功能整合后：** U8 用固定副本与真实作者样本完成业务证据；冻结后续版并按目标交付。0.5.3 预览和后续完整能力有不同发布记录。

完成必须同时能证明：普通资料与结构化记录可恢复；外改冲突保留双方且能继续保存；图文／双链在明确来源内可读；报告查询与提示一致；作者可保存安排枚举且不改业务事实；快卡走通指定导入链；普通写稿材料确认与固定阶段完整交付不可被泛用回执替代；至少一次真实作者／模型流程的质量与停点有记录。没有证据的层次继续明确待验，不使用完成百分比。

本计划仅新增本文档；只读核对未访问同事真库、未调用外部模型／收费服务、未修改产品或测试文件，也未重复执行全量回归。
