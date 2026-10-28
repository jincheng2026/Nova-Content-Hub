# 内容连续主线与受控接续 Implementation Plan

> **For agentic workers:** 使用 `executing-plans` 或 `subagent-driven-development` 逐项执行。产品实施在 0.5.3 轻量 preview 冻结、构建与交付之后开始；本文件只做规划，没有改变任何产品能力。默认一个执行代理按顺序负责全部产品文件，不能与仍在收敛封面或打包的负责人并写。

**Goal:** 新建内容后，在同一助手聊天连续完成研究、真实媒体与转写、拆解、作者观点、写稿、逐句改稿和包装；封面生成独立执行，最终回到同一内容的已核验资产。用户明确库和稳定 T 时，可通过一次显式授权在新聊天接续。

**Architecture:** 新增内容主线协调记录，按顺序生成现有受限研究/阶段任务，保持每个子任务 request 不可变。协调层只管理阶段衔接、总预算、版本依赖和会话所有权；不把现有 stage 执行器升级为任意跨阶段执行器。下一 handoff 返回当前聊天，只有首次启动、用户明确换聊天或封面生成才走新聊天入口。

**Tech Stack:** 现有 Electron / TypeScript / React、Node ESM、file-library mutation/CAS、vault workflow 决定账本、production broker、固定 handoff 与随包业务 Skills；不新增服务端、模型依赖或宿主自动化框架。

**Spec:** 用户已明确的内容主线与接续要求（本文件下述约束）；根 `AGENTS.md`；`docs/design/内容工作台设计标准.md`；`docs/superpowers/plans/2026-10-28-colleague-model-free-release.md`。既有阶段、确认及发布规则继续生效。

## Global Constraints

- 当前首先交付 0.5.3 无模型权重轻量 preview；版本、冻结、安装和平台验收遵守根 AGENTS。不能将本计划功能写入该包“已完成”清单。
- 新主线在后续独立冻结版本交付；版本号由发布负责人在实际冻结时确定，不预占已使用版本。
- 默认同一聊天，封面生图可独立任务。没有可信宿主 session ID 时不猜聊天、不搜索近似标题后跳转、不把打开宿主应用描述为定位原会话。
- 新聊天只因用户明确授权而接续。读取库与 T 不等于拿到执行权；不自动取消、抢占、复制旧 claim 或批准宿主权限。
- 全主线预算固定、评论许可独立、工具范围逐阶段收窄；真实 Qwen 转写、解码、时间码是不同能力；不下载模型、不静默转云端、不伪造时间码。
- 作者确认来自现有可信工作台控制器与准确版本决定；助手转述“用户已同意”不是确认凭据。保留手改、批注、CAS、旧 claim 与迟到结果保护。
- 本次新增流程以有稳定 `vaultId + T` 的原位内容为首个支持范围；旧 file-library 内容和单 stage 仍按原功能运行，不悄悄迁移或推断 T。
- 普通写稿为本次完整路径。教程、科普只有用户显式选择时才走其独立方法和现有停点；不能因通用主线而绕过它们。

## 1. 已读代码与真实缺口

| 位置 | 当前实际行为 | 本计划改变的边界 |
| --- | --- | --- |
| `workbench/src/renderer/app.tsx` 的 `save()` | 新建内容使用 `createContent`，标题可暂为“未定标题内容” | 内容先持久化，再解析稳定 T、明确启动主线；不以占位名确认标题 |
| `workbench/src/shared/content-creation-workflow.ts` | 提示词写同聊天整篇，但禁止 suggestions/annotations，最后要求一套泛用 artifacts | 保留历史契约，不把它当成新主线完成依据 |
| `workbench/src/renderer/production-workspace.tsx` | 现有整篇任务入口已标“历史整篇任务”；独立动作调用 startProductionTask | 增加主线入口和状态摘要；旧入口兼容 |
| `plugin-src/src/commands/jincheng-workflow.mjs` | `fixedStageContext` 只允许 `jincheng-stage`，`allowed` 按固定 stage；作者门禁独立 | 不放宽这些判定；协调层产生下一份合法单 stage 请求 |
| `plugin-src/src/commands/jincheng-creation.mjs` | 同 T 原创作页读回、逐句建议、版本 CAS、作者字段保护 | 新主线写稿/审稿子步骤直接复用 |
| `plugin-src/src/bridge/production-handoff.mjs` | prepare 要求 created attempt；URL 固定为 `codex://new` / WorkBuddy start | 分开“准备固定 envelope”和“启动新聊天”，允许当前聊天获取下一 handoff |
| `workbench/src/main/desktop.mts`、`production-controller.mts` | created 时 launch，其他运行态只 focus 应用；无可靠会话定位 | 保留诚实的手动返回语义，新增复制当前接续文本；不虚构 session 能力 |
| `plugin-src/src/lib/file-library/production.mjs` | retry 换 attempt；预算按 task 汇总；媒体 grant 绑定 attempt | 新增受控主线事务与跨子任务总账；不能用 retry 直接冒充接续 |
| `plugin-src/src/lib/vault/workflow.mjs` | 稳定 `{vaultId, workId:T...}`、artifact/hash/decision、当前源与版本 | 作为上游产物和作者决定真源，不另建“已确认”布尔值 |
| `workbench/src/main/production-services.mts` | task/attempt/worker/claim、服务设置、请求预算、媒体来源门禁 | 对主线成员追加父所有权与总预算校验，旧任务不受影响 |
| `production-controller.mts` + `research-runtime/common.mjs/index.mjs` | topic 关键词路径只冻结 `douyin-search`；sampleLimit/deriveSamples 只支持 account 的 user-posts；search receipt 无法授权后续视频 | 新增明确冻结的搜索派生策略与同源 broker 证据，最多 3 条；不是向现有请求偷偷追加 video/tools |
| `plugin-src/src/lib/final-assets/index.mjs` | 真正核验所选最终资产与 manifest、当前 bytes | 完成条件引用真实已采用 bundle，不用聊天结束/泛用 submit 代替 |

## 2. 架构选择

采用“主线协调 + 现有受限子任务”。备选的“给 content-creation 放开全部 stage”会使 allowed 和确认边界失效；“每阶段都启动聊天”无法满足用户主线。协调层增加少量状态，但复用现有成熟业务执行器，也能单独测试所有权和预算。

对用户是一篇内容、一条主线、一个正在进行的聊天。内部阶段 task ID 是审计身份，不要求用户管理一串任务。新主线只拥有自己创建的子任务，不能接管任意历史任务。

### 2.1 状态与不可变请求

新增 `content-journey` 根任务，类型用现有 writing，执行壳继续使用 writing execution Skill；根任务 `tools=[]`，禁止直接调用 TikHub/ASR/media。根请求冻结：

```text
journeyVersion: 1
work: {libraryId, vaultId, workId, contentId}
initialSource: {documentId, relativePath, hash}
method: ordinary-writing | explicitly-selected-tutorial | explicitly-selected-kepu
researchPlan: bounded list of existing ResearchBrief / allowed derivations
limits: {maxRequestsTotal, commentsAllowed, mediaCount, mediaBytes}
serviceConfig: original authorized ASR settings + external identity
allowedStepKinds: exact versioned plan, not arbitrary operations
```

根任务另有可变 `journeyState`，在同一 production 存储事务内维护，包含 `revision`、`ownerEpoch`、`activeStepId`、唯一活跃子任务身份、阶段历史、产物/决定 pins、接续挑战摘要及终态。`requestHash` 永远不因推进或接续改变。不要在 `创作过程.json` 复制预算/claim；那里仍仅维护现有业务产物和作者决定。

子任务仍是现有 `jincheng-research` 或 `jincheng-stage` 请求；冻结具体 stage、businessSkill/version、source、tools、局部预算、父 `journeyId/ownerEpoch/stepId`。成员关系由受控创建事务记录到根状态，不能只信子任务任意 parameters 声称的 parentId。普通 `createTask` 禁止调用者自行植入受信主线成员关系。

任何时刻至多一个可写业务子步骤。根 attempt 保持聊天所有权；当前子 attempt 拥有具体业务 claim。两者 workerId、host、ownerEpoch 绑定；下一阶段可在同一聊天接新子 claim，但不能用一个旧 claim执行下一阶段。

### 2.2 最小阶段表

| 步骤 | 复用契约/方法 | 推进所需证据 |
| --- | --- | --- |
| 开始/选题 | 保存内容、稳定 T；按需 `xindao-xuanti` | 材料与用户目标，作者选定方向；占位标题不算最终标题 |
| 研究 | 顺序运行固定账号/视频/问题研究；`jincheng-research` 与 `jc-media-research`，受众评论使用明确授权的 comments brief | 来源清单、已登记响应、费用状态、所选素材 pins；没有评论授权只做已有材料判断并标明局限 |
| 媒体与转写 | 既有媒体 grant、production asr/研究 runtime；已有外部 Qwen | 原片 hash、真实结果、能力与缺口；原始文本、校正版、时码分别保留 |
| 拆解 | 固定 `analysis-ai` / 明确选择的 `analysis-author`，`jc-video-analysis` | 结构、开头、方法、判断与证据引用；作者先拆路线保留原门禁 |
| 作者观点与写稿 | `jc-content-writer` 的材料/访谈，再固定 writing；显式教程/科普才启用各自框架与逐段门禁 | 作者本人观点、当前材料与决定 pins；生成可读回原创作页，不拿材料摘要代替全文 |
| 逐句改稿 | 固定 `review-page` / revision，`jc-review-page`、`nova-workbench-writing-method` | 原句精确匹配、当前页 revision、逐条候选和作者取舍；不复制作者确认字段、不覆盖手改 |
| 包装 | 固定 cover-copy / `jc-cover-copy`；明确 cover-design 子步 | 当前已确认稿、标题/简介/封面文字候选与人工选定版本；先正文后最终标题 |
| 封面独立分支 | 现有已确认设计 → cover request → 生图候选 → 用户选用 | 同 work、稿件与包装 hash、设计 hash、封面 request/receipt/asset hash；该分支不获得研究/写稿权限 |
| 最终资产 | 现有 FinalAssets preview/adopt/verify | 最终稿、已选标题/简介、所选封面，当前 bytes 与 manifest 均核验；未齐则等待，不虚报完成 |

研究可以由多个顺序子步骤组成，但总请求和最多 3 个授权视频/每个 64 MiB 等上限按主线共同计算，不能每开一个子任务重置。新增范围外账号/关键词/视频、评论许可或额度扩展必须形成工作台上的新范围确认；初版不做无界“自主探索”。从已冻结账号响应派生样本可复用现有 deriveResearchVideoIds 的受控证据。关键词主线在开始时明确冻结“从本关键词搜索回执派生最多 3 条真实视频并读取/下载”的策略，按下述交付 A2 落地；在该预授权范围内不再要求用户重复选择同一个已授权动作。

缺少真实时间码时，文字写稿可按实际能力推进并保留局限；需要精确时间结论、完整视频拆解或 strict intake 的步骤继续被现有门禁阻止。助手不得填 segments 或“人工校正时码”来假装补齐。跳过参考只能由用户明确选择，并记录对后续判断的限制；正式素材入库不是每次写稿的强制动作，做入库时沿用 v2 严格门禁。

### 2.3 推进事务与幂等

建议新增内部接口 `journeyAdvance({rootClaim, expectedJourneyRevision, expectedStepId, mutationId})`。不接收任意 nextStage、tools、budget、路径或“confirmed:true”。服务端按固定计划计算下一步，重读准确 artifact/hash/decisionId 和源字节，构造唯一合法子请求。

先记录当前步骤的可核验完成凭据，再在同一 production 事务中封闭旧子 attempt、推进指针、创建新子 task。保留所有旧结果用于只读审计；不使用泛用 `acceptTask` 自动应用正文或包装。主线子步骤的完成/采用走专用受限处理器：仅将已存在的作者决定与持久化产物记入 checkpoint receipt，不重复写作者正文。通用 accept/retry/cancel 对主线成员须路由协调层或拒绝，避免绕过所有权。

写库后 envelope 文件生成失败时，重试同 mutationId 从已保存子身份重建 handoff，不再创建新子任务。多进程 CAS 只允许一次成功。下一 handoff 作为结构化结果交给当前聊天，**推进不调用 launch/openExternal**；同一聊天读取对应业务 Skill、context 后领取子 attempt 继续。

每个独立写命令和服务请求在提交前检查父活跃 attempt、epoch、activeStepId、子 attempt/claim，以及源/决定 pins。不能只在 `journeyAdvance` 校验；旧 envelope 仍可能被直接拿去调用 `jincheng-creation`、研究 CLI、production submit 或服务 broker。把共同 guard 接入这些边界，旧单 stage 没有主线成员关系则执行原校验。

### 2.4 总预算、费用与迟到结果

budget authority 放在现有 `reserveCost` 同一库锁/事务：核对当前子局部额度、主线所有成员所有 attempts 的总 consumed/reserved/unknown，再预留。不要只在 main 内存求和，也不要在父子同时记一笔费用造成双计。父仅聚合相同 cost record，原 receipt/requestId 保持可追溯。

`unknown` 按现有规则占用额度并阻止接续/追加付费请求，人工核验后继续；retry、下一阶段、换助手、新 attempt 均不重置总账。评论开关、当前 Key/设置和 frozen config 检查保持原规则。

切换所有权后迟到业务结果不可写正文、候选或推进步骤。已经实际发生的调用仍必须能对原始 reservation 结算：保留当前 recordCost 的合法迟到结算语义，只允许匹配原 task/attempt/request 的同一费用，不因此恢复执行权。不得把“旧 claim 一律拒绝”实现成丢弃真实计费。

### 2.5 来源与恢复

每步读取当前合法源后冻结 document/hash 和输入 artifact pins；历史步骤原 hash 不重写。作者改稿后旧阶段的写入 CAS 失败；“继续最新稿”须重新读源并生成新的步骤版本，未确认的下游包装/设计/封面引用标过期。选择另一原件继续沿用 `selectWorkSource` 明确决定，不能以 T 相同自动替换 documentId。

接续不直接复制旧 mediaGrants/claim。已经落库的公共响应、原片、转写可在同一 work/主线内经服务端重新校验后登记为新 attempt 的来源引用：核对原 task/attempt/requestHash、已结算成功 receipt、videoId、响应 hash、资产当前 bytes、现阶段授权及总媒体额度。不新增付费调用、不重置计数；没有可复核来源时保留缺口，要求显式重采。为此新增窄 `rebindJourneyEvidence` 内部路径，旧 `registerMediaGrant` 的来源校验保持不变，禁止助手提交任意旧 grant 来继承权限。

## 3. 同聊天与新聊天接续契约

### 3.1 当前聊天正常推进

首次开始主线可以使用现有 new-chat URL。之后工作台只展示“继续本篇 / 复制接续文本”，已领取根任务的当前聊天通过 `content-journey context/advance` 取得下一受限 handoff。阶段推进、作者确认、等待权限恢复均不自动打开新聊天。

没有可靠 session ID 时，点击“回到原聊天”只 focus 对应宿主并明确提示用户手动选原聊天；复制文本含明确库、T、journeyId、当前非秘密 handoff locator 和“读取最新 context 后继续”。同一根 attempt 的秘密 claim 不进入 UI 公共快照或复制文本。原聊天保存的 claim 若丢失，走显式新聊天接续，不推断其所有权。

### 3.2 只读定位

新增 CLI `content-journey lookup --library <用户明确给出的绝对库路径> --work T123`。两个参数必需，不从 cwd、最近打开库、聊天名或 T 全盘扫描猜库。验证 libraryId/root identity/vaultId，稳定 T 解析多个当前源或多条活跃主线时返回歧义列表，不能自动选第一条。

lookup 只返回内容/主线摘要、待确认项、非秘密身份和工作台接续说明；不返回旧 claim、接续秘密、服务凭据、可写授权。插件说明必须要求真实用户明确库路径与 T；本地工具无法凭自由文本自动证明“作者身份”，所以它没有迁移权限。

### 3.3 显式换聊天/助手

1. 用户在工作台对明确 work/journey 选择“在新聊天接续”，预览当前步骤、目标助手、费用与待确认项。只读 lookup 不能触发此动作。
2. 工作台作者确认后调用 `prepareJourneyContinuation`，带 expected revision、当前根/子 attempt 和 mutationId。若有 reserved/unknown，拒绝迁移并保留旧状态，先结算；submitted 的待采用结果先在原准确 receipt 上处理，不能偷偷当作已接受。
3. 在同一事务内关闭旧可写根/子 attempt、ownerEpoch + 1、创建新的根 attempt 和当前步骤 attempt，保持固定请求/总预算/已确认 checkpoint 不变。生成至少 32 随机字节的一次性 challenge，只持久化 hash，15 分钟有效，绑定库/work/journey/new attempt/epoch/host。业务执行处于待接续领取状态。
4. 返回给用户的接续文本包含新 handoff UUID 和 challenge，由用户明确复制到新聊天，或用户选“打开新聊天”时发送给所选宿主。属于受控 bearer 授权，不进常规日志、公共 snapshot、错误消息或报告。可重新签发并立即失效旧 challenge；过期不会恢复旧 claim。
5. 新聊天先读取固定 context，再 `content-journey claim-continuation --handoff UUID` 提交 challenge 和新 claim/workerId。事务内消耗 challenge、核对 host/epoch/revision，只有一个领取者成功；通用 production claim 不能跳过该要求。
6. 新 owner 取得当前步骤的合法 handoff；旧 root/child claim、旧 challenge、旧宿主继续写、旧提交全部拒绝。审计只保存挑战摘要/消费状态，不保存秘密。接续失败可回到工作台重新签发，不自动再开聊天。

“新聊天知道绝对库+T”仅能定位并获得授权指引；**实际执行仍必须有 UUID handoff、active attempt 和新的有效 claim**。不提供猜会话、自动审批、自动抢 claim 或后台向旧会话发消息的功能。

## 4. 接口与文件责任

默认 **J（GPT-6.1 Sol，high）** 为唯一产品实现者；Root 负责串行集成、检查真实 diff、发布及隔离验收；**R（GPT-6 Astra，high）** 只做最终关键风险审查，不与 J 并改代码。机械整理才可另派 Luna；没有独立交付前不增加执行代理。下表同一文件始终只归 J，Root 需要修复时先停止 J 并明确交接。

| 文件/文件族 | 唯一写入 owner | 职责 |
| --- | --- | --- |
| 新 `plugin-src/src/lib/file-library/content-journey.mjs`、`.d.mts`、`test/content-journey.test.mjs`；现有 `production.mjs`、`production.d.ts`、必要 metadata 校验入口 | J | 有界计划、状态、成员关系、epoch、推进/迁移事务、总费用约束；接现有锁与恢复回执，不新建旁路库写入器 |
| 新 `plugin-src/src/commands/content-journey.mjs` 及 CLI 路由注册；`bridge/production-handoff.mjs` | J | 只读绝对库+T定位、主线 context/advance/领取接续；拆分 prepare envelope 与 launch |
| `commands/production.mjs`、`jincheng-workflow.mjs`、`jincheng-creation.mjs`、research operation 入口；`lib/service-tools/` 对应 broker 调用 | J | 父 epoch/当前步守卫；保持原 stage 白名单和输入 schema |
| 新 `plugin-src/src/lib/research-runtime/samples.mjs`；`common.mjs/common.d.mts`、`index.mjs/index.d.mts`、`operations.mjs`；main production-controller/services/worker、shared research brief 校验及对应测试 | J（独立交付 A2，串行） | 关键词 search receipt→有界视频派生→视频/媒体授权；直接视频和账号旧路径保持兼容 |
| 新 `workbench/src/main/content-journey-controller.mts`、必要 worker 入口；`production-controller.mts`、`production-worker.mts`、`production-services.mts`、`jincheng-research-services.mts` | J | 作者入口、固定子请求构造、迁移授权、证据重绑定、broker 追加校验 |
| 新 shared `content-journey-contracts.ts` / `content-journey-validation.ts`；现有 shared contracts/validation、preload、controller/boundary 注册 | J | 严格新 IPC；public projection 擦除 claim/challenge，不影响 worker 私有 context |
| `desktop.mts`、`assistant-runtime.mts`/`assistant-skill.mts`（必要时） | J | 首次/显式新聊 launch；原聊 focus + copy fallback；确认随包 writing/research 两执行 Skill 均可用 |
| 新 renderer `content-journey-panel.tsx`；`app.tsx`、`jincheng-work-detail.tsx`、`production-workspace.tsx`、必要 action 绑定 | J | 新建后的主线入口、准确等待/恢复/最终状态、复制与显式迁移；旧独立动作继续可用 |
| `plugin-src/skills/nova-content-writing-execution/`、`nova-content-research-execution/`、相关 references；resources/jincheng-runtime.md、business-skills.json | J | 当前聊天拿新 handoff、业务方法读取、作者停点和显式接续说明；不只改提示词 |
| 新定向测试及现有 production/stage/handoff/research/service/final-assets 对应回归 | J | 下节矩阵，必须覆盖真实入口和直接调用绕过 |
| `docs/verification/production/<实际日期>-content-journey/` 与后续发布记录 | Root | 隔离端到端/宿主/平台证据，最终版本与安装产物冻结 |

IPC 最小集合：`startContentJourney`、`readContentJourney`、`copyJourneyContinuation`（同聊天非秘密文本）、`prepareJourneyContinuation`（作者迁移授权）、`reissueJourneyContinuation`、`cancelContentJourney`。逐阶段 advance/claim 只在受控 CLI/worker 路径；不开放 renderer 自由指定阶段/工具或绕过作者决定。所有写入带 mutationId 与 CAS expectedRevision。

## 5. 分交付实施步骤

### 交付 A：协调内核与预算/所有权（无新 UI 上线）

- [ ] 先写失败用例：父 request 不可变、普通 createTask 不能伪造成员、两个 advance 竞争、旧子 claim、跨子任务预算与未知费用、重启幂等。
- [ ] 在 production 存储模型加可选主线状态与专用 mutation，历史任务缺该字段时完全按旧路径读取执行。所有主线操作复用同一库锁/事务与 mutation 回执。
- [ ] 抽出单个共享 membership/epoch guard，接子任务 claim/progress/submit/fail、stage/creation 写入、research/service 入口；费用结算保留窄迟到路径。
- [ ] 实现冻结计划→当前子请求构造与本地源/决定 pins 核对，根工具为空。普通写稿先覆盖固定顺序；显式教程/科普不改变原门禁。
- [ ] 定向测试通过后提交独立 commit。**验收：尚不宣称主线 UI 可用，只证明不可越权的内核。**

### 交付 A2：关键词搜索到真实视频的受控派生（独立可审查 commit）

**Owner：J，Sol/high。** 属于关键词研究闭环缺口，不是同聊天文案；0.5.3 preview 不等待它，后续完整主线交付 B 依赖它。涉及 main production-controller/services/worker 与 A/B 重合，必须串行实施，不能另一个代理同时写。

- [ ] 写失败用例复现当前 `route=topic` 关键词任务搜索成功后 derive/download 被拒；保留 direct-video 与 account-user-posts 作为通过对照。
- [ ] 为新 topic/douyin 请求增加精确可选策略 `sampleDerivation:{version:1,sourceOperation:'douyin-search',limit:1..3,selection:'response-order'}`，每个研究子步冻结一个准确关键词、搜索参数/分页边界、`douyin-search` 和 `video`，以及本地 asr/media 工具、媒体限额与既有总预算。只有启动时明确启用该策略才加入这些权限；历史仅 search 请求不升级、不重写 requestHash。comments 仍单独许可。
- [ ] 新 `samples.mjs` 从已识别的真实 Douyin response envelope 提取数字视频 ID，复用/抽出 `normalize.mjs` 使用的 `douyinRows` 已知 shape 解析，避免 common↔normalize 循环依赖。不把广告、作者 ID、无视频图文或任意 URL 数字当视频；去重后按响应顺序最多 3 个，不宣称它们已满足内容质量判断。未知 shape 报明确不支持，保留原始响应。
- [ ] broker 在成功搜索结算时，以原始响应精确 hash 及实际固定 request 派生记录：`taskId/attemptId/requestHash/sourceRequestId/operation/keyword/searchParamsHash/responseHash/policyHash/videoIds`；只由服务端生成，`usage.ok=true` 且 measured/缓存有成功来源，不能信助手写入的 IDs。搜索成本正常结算，派生过程本身零外部请求。
- [ ] runtime 的 `derive-samples` 对此策略仍接受空 input，从本步骤准确关键词/参数匹配的已完成注册搜索回执派生；比较归档 raw response hash 和 broker 证据。首次确定的 sourceRequestId/responseHash 持久化，后续分页/刷新不悄悄换来源或累计超过 3 个；要换批次须新明确范围。不能加入 caller-supplied videoIds。
- [ ] `researchVideoAuthorized`、`researchMediaAuthorized`、runtime download、productionAsset/registerMediaGrant 与 broker video/media 路径全部核验同一派生身份和当前 attempt/epoch；查询视频详情产生的独立 sourceReceipt 也必须是该派生集合成员。搜索证明只授权 ID 的后续详情查询，不直接把搜索中任意下载 URL 当受信媒体源。实际视频来源仍走已有详情→下载→注册 hash 链。
- [ ] 模型请求、评论权限、任务/主线预算均不放开。搜索一次之后余额不足则在任何下一次收费查询的 reserve 前报 `BUDGET_EXCEEDED`；不能用“已获搜索样本”跳过视频详情费用。媒体总数、请求额度不能随 source receipt、子任务、attempt 重置。
- [ ] 核对跨 receipt/别关键词、另一 task/attempt、修改 raw response、改 responseHash/policyHash、extra ID、第 4 个视频、重复 ID、未知 shape、图文/广告、预算只够搜索、并发 reserve、旧请求无策略、派生后接续重绑定；每项应有正/负例。broker 与 runtime 直接调用都测，不只测 parser。
- [ ] 通过定向 research/runtime + production broker 测试后独立提交，并将“关键词→真实媒体→ASR”纳入 B 的实际入口链。单测通过不宣称已发生真实付费采集，真实 TikHub 只按已有明确授权执行。

### 交付 B：真实同聊天推进与内容闭环

- [ ] 写真实 controller→handoff→CLI→workflow 的失败集成用例，证明阶段 1 的 claim 不能写阶段 2，advance 返回下一 handoff 且 launch 次数保持 1。
- [ ] 将 envelope 准备与 URL 打开分离；当前聊天按执行 Skill 读取下一 context，再领取下一个子 attempt。创建后信封失败重试只重建，不重复计费/建任务。
- [ ] 接通研究、转写、拆解、作者材料/观点、原创作页、逐句建议和包装。对当前库中的 T 使用实际 sourceResolution/hash；已有原创作页只原位读改。
- [ ] 为需要反复改稿的步骤提供显式新 revision/reopen，不允许旧决定继续支撑新正文的包装。无时码保留能力限制，不能让不足的 transcript 通过 strict intake。
- [ ] 封面请求仍用现有受控 bridge 独立 launch，主线等待已采用封面回执；最终资产用真实 preview/adopt/verify 完成，不由泛用 draft receipt 终结。
- [ ] 加主线 panel 和新建内容后的入口，确认/选择仍使用现有作者控制器，保存脏稿后才启动/推进。最小普通写稿完成路径通过后提交。**验收：同一已知聊天可走完整主线；接续尚未验收时按钮不得声称可换聊继续。**

### 交付 C：新聊天定位、显式接续与原 claim 失效

- [ ] 写失败用例：缺绝对库、缺 T、错误库同号 T、歧义、无 token、过期/重放/错误 host、并发领取、旧 claim 迟到、reserved 费用阻止迁移。
- [ ] 实现只读 lookup；实现工作台作者确认事务、一次 challenge、epoch 轮换、当前子步骤接续及原 owner 撤销。不是调用现有 retryTask 后马上 new-chat 的别名。
- [ ] 实现已核验媒体/转写来源的窄重绑定；恢复只能读同主线已登记证据，缺 hash/成功 receipt/当前 bytes 即拒绝。费用不重复计数。
- [ ] 实现无 session ID 的手动返回与复制；换助手必须单独显式选择，复用同一授权/消费语义。不承诺自动定位会话。
- [ ] 验证重复点击、重启、取消、挑战过期后再签发，测试通过后提交。**验收：完成真正的受控换聊继续，全部旧 claim 都失效。**

### 交付 D：端到端与后续发行

- [ ] 在独立库副本走新建→研究/真实已有媒体→转写→拆解→观点→写稿→逐句确认→标题简介→独立封面→最终 bundle；无真实服务授权时只记离线契约通过，不宣称 TikHub/生图实测。
- [ ] Codex、WorkBuddy 分别跑下表宿主矩阵，记录当前聊天保持、显式新聊、手动 fallback 的实际行为。任一宿主未通过则仅该能力待验，不把另一宿主结果代用。
- [ ] Root 检查真实 diff 和关键风险，定向修复后做一次冻结版所需整合回归；不在无变化时无限重复全审。
- [ ] 通过后才冻结后续版本、构建无权重产物、安装副本验收并记录真实交付状态。0.5.3 的已发包与后续源码分开记录。

建议定向命令按落地文件实际名称运行：

```sh
node --test plugin-src/src/lib/file-library/test/content-journey.test.mjs
node --test workbench/test/content-journey-desktop.test.mjs
node --test workbench/test/content-journey-continuation.test.mjs
npm run typecheck:desktop
```

相关已有 production、stage、research、service、handoff、final-assets 测试由执行者在各交付选择一次必要集合；最终冻结再按项目既有回归命令运行。不为纯文本说明写镜像断言测试。

## 6. 必须验收的矩阵

| 面 | 成功与拒绝条件 |
| --- | --- |
| 旧契约 | 无主线字段的单 stage、旧 content-creation、历史 receipt、旧研究正常；旧 stage 仍拒绝跨阶段 artifact |
| 新建与身份 | 未命名内容可开始；稳定 T 持久化；库切换、root 替换、同号 T、多源冲突、删除内容均不能串写 |
| 阶段权限 | 只有当前 step；伪造 parent/epoch/step、绕过 journey CLI 直接调旧 CLI/broker、旧 handoff 继续写均拒绝 |
| 业务确认 | 作者观点和材料可读回；未确认/撤销/换 hash 阻止依赖步骤；助手不能写 approved、decision、final 等保护字段 |
| 手改 | CAS 冲突保留双方内容；逐句原句不存在/重名拒绝；下一稿必须重新读准确源；旧包装/设计失效 |
| 研究/服务 | 白名单对象与派生样本、comments 许可、Key、local identity、无云授权、真实媒体 source/hash；同任务更换设置继续遵守既有冻结配置检查 |
| 关键词派生 | 准确关键词/参数/固定 request 的注册 search receipt→最多 3 个实际返回视频；跨 receipt、改 response/策略、extra ID、第 4 条、预算耗尽均拒绝；旧仅搜索任务不得下载；详情 receipt 与 media grant 同源 |
| 预算 | 子任务单笔及总额、所有 attempts、并发 reserve、缓存零成本、unknown、超额、retry/换聊不重置；迟到费用只结算原 reservation |
| 推进恢复 | mutation 重放、prepare envelope 中断、上一步已完成但 UI 未刷新、重复 advance、重启后唯一活跃子步骤 |
| 换聊 | 绝对库+T 只读定位；显式确认+challenge 后才可领取；一次消费、过期、重签发、错误 host、并发领取、旧 claim 失效、旧提交拒绝 |
| 媒体恢复 | 同主线旧 receipt+当前 bytes 才重绑定；不得从不相关任务借 grant，不新增隐藏采集，不伪造时码 |
| 每个宿主 | 首次成功、waiting-user→继续、waiting-permission→继续、取消、失败→重试、提交→作者处理、原聊天继续、显式新聊天/切助手；会话结束不算成功 |
| 封面与完成 | 独立封面任务失败/取消不破坏正文；旧正文封面不得挂新最终资产；所有必要文本与封面当前 bytes 校验后才 complete |
| UI | Foundation-02/03/04、Controls-01/02/03、Surface-03、Reading-02/03；960×680、1280×860、长库路径/T/文本、忙碌/等待/错误、键盘焦点、复制反馈、脏稿保护；按 Acceptance-01/02/03 留证据 |

## 7. 发布描述边界与完成定义

0.5.3 首包按其自身真实冻结证据说明“无权重轻量试用”，已接入外部 ASR/独立 codec、严格入库或封面修复的项目由 Root 逐项根据最终产物填写；这份计划不代替该验收。旧 content-creation 提示词、单阶段入口或助手能自由聊天均不足以证明新主线已完成。

后续完整主线必须同时满足：真实入口触发；同聊天跨步骤受控执行；逐句改稿保留作者决定；封面独立回流；最终资产核验；绝对库+稳定 T 可定位且经一次显式授权换聊继续；旧 claim/预算/来源边界全部通过。任何未满足项明确展示待验，不能用“全流程已支持”概括。

本计划不新建宿主能力、不新增自动审批、不改变生产发布授权，也不把首次轻量包延后到本主线全部实现之后。主执行者已明确认可本架构方向；实施按既有用户授权继续，不再为本计划提出额外确认问题。

## 执行裁定 · 2026-10-28

Ruling：0.5.3 产品已冻结在 `3c73e80eb6c4cd53d7e9ccc19f503a1627ba32f2`，由独立 managed worktree 按该提交构建；主目录允许并行开始 0.5.4 实现。该调整只改变排程，后续主目录改动不进入 0.5.3 快照，也不改变首包优先验收和交付。原目录版本升为0.5.4，0.5.3产物/安装/插件依旧只取其固定源码。这样减少串行等待，不用共享正在变化的源码打包。
