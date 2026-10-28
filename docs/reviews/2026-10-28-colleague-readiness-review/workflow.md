# Nova 内容工作流只读核查（当前源码）

审查时间：2026-10-28；HEAD `d16277972dfad01bbef5d5b98cda1be0c26def4a`，工作树有并发未提交修改。本报告核对实际源码、原方法 upstream/current、旧审查报告及隔离运行结果；旧报告是线索，不是本次结论。未调用付费 API、未启动外部助手执行内容任务、未写真实内容库、未改产品文件。审查过程中 intake 新增了 v2 契约，最后复现已包含该版本；关键源 SHA 见复现 JSON。

## 核心判断

当前实现已经不是旧 gap-audit 所描述的“只投影正文+整套 bundle”。完整 jc-doc 读取、原模板 build/regenerate、逐格 CAS、作者建议决定、意见版本回复、阶段文件与确认 ledger、研究运行接口、正式发布档案与复盘候选均已存在。将旧报告 R1—R5 原样列为未修 P0 不符合当前源码。

但“原方法已随包、能启动相应 Skill”仍不能等同“完整业务已在两个助手真实跑通”。当前最清晰的剩余问题是：严格媒体验收未完成就进入正式素材库；评论快卡的指定回传链路不兼容 Markdown；首稿构建回执缺少文档要求的路径和 HTML hash；普通写稿的素材包确认仍缺少与叙事同等的可恢复对象。任务 submitted/accepted 仍是通用回执及人工验收，不能单独证明完整 HTML、原方法阶段或实际发布完成。

## 1. Skill、工具与模型到底如何接线

实际链路为：桌面动作 → 固定 ProductionTask（workflow/stage/businessSkill/creatorContext/tools/budget/bodyHash/requestHash）→ 配套插件与完整性检查 → 宿主 URL → 宿主 Agent 读 execution Skill → 读 business Skill/upstream/current 原方法 → 调用受控 Node CLI → 读取真实 receipt。

- `workbench/src/renderer/jincheng-stage-actions.tsx:16` 有明确的动作到方法映射；例如 writing→jc-content-writer，tutorial→jc-jiaocheng-video，revision→nova-workbench-writing-method。不是把全部动作都标成同一业务 Skill。
- `plugin-src/src/lib/file-library/production-creator-context.mjs:22` 根据 registry 核对方法存在及 executor 一致；`production.mjs:312` 冻结实际个人资料与定位上下文，定位/选题强制零工具、零预算。
- `workbench/src/main/assistant-skill.mts:53` 起检查宿主安装配置、发布版本/平台/架构、manifest、integrity 和 execution Skill SHA；`assistant-runtime.mts:67` 起核对随包代码快照。检查说明“可发现且安装匹配”，不证明模型已阅读或遵循方法。
- `plugin-src/src/bridge/production-handoff.mjs:29` 按 research / account-analysis 选择 research executor，其余选择 writing；`:45` 把业务 Skill ID 放进提示词。Codex 使用 `codex://new` 与 `$nova-content-…-execution`；WorkBuddy 使用 `workbuddy://task?action=start&skills=…`。这些是宿主派发，不是桌面直接运行一个名为 jc-content-writer 的程序。
- `plugin-src/skills/nova-content-writing-execution/SKILL.md:15` 要求读取 registry、对应 SKILL.md、methodBody 的 upstream/current/METHOD.md、原 schema/模板及适配契约。原脚本作为来源证据，不是任意执行授权；当前 Node adapter 实现了可用动作。
- `plugin-src/resources/business-skills.json` 多项仍为 `runtimeStatus: contract-unverified`；`method-adaptation-contract.md:26` 明确两个宿主业务旅程尚不能据打包通过宣称已验收。因此“名字是真接线”可确认，“每个业务 Skill 在 Codex 与 WorkBuddy 均真实执行成功”本次不能确认。

### 本地 Qwen 的职责

Qwen3-ASR 只负责音频转文字，不负责定位访谈、选题、研究推理、写稿或改稿；这些由用户在 Codex / WorkBuddy 当前选择的 Agent 模型执行。`production-contract.md:3` 与实际实现一致。

研究链 `research-runtime/index.mjs:68` 将已登记媒体 assetHash 传给 `tool:'asr'`、`allowCloud:false`。`workbench/src/main/production-services.mts:81` 验证本地模式、Qwen 引擎/随包运行时、零云端请求。`service-tools.mts:271` 起实际启动 Python 的 qwen_asr / mlx_audio，并只返回文字；`:276` 起若找到 timing payload，再启动本地 faster-whisper，`word_timestamps=True`，将词级时间轴加入结果。也就是说，当前“本地 Qwen 转写带时间轴”实际上是 **Qwen 文字 + faster-whisper 时间轴**，不是 Qwen 自身输出原生词时间。

`local-asr-runtime.mts:27` 的自动随包发现目前明确只接受 `darwin-arm64` 且匹配 macOS 主版本；其他平台可能手工配置 qwen_asr，但本次没有原生运行证据。引擎存在/import 成功是 readiness，不能当本次原片已识别。未运行真实 ASR，本报告不以 mock 的合成时间轴证明质量或速度。

## 2. 逐阶段与原工作法对比

| 阶段 | 原方法关键语义 | 当前实际接点 | 当前判断 |
|---|---|---|---|
| 定位 | xindao-interview 四关、逐问、每关本人确认；已有定位续访 | `positioning-checkpoint.mjs:38` 精确 documentId/hash、受管块、mutation replay；任务冻结 creatorContext | 有真实保存接点；确认原话由宿主 Agent 报送，未有独立宿主确认事件证明；需真实双宿主访谈验收 |
| 自主立题 | 核心想法/目的/受众先建 T，其余渐进，不强制十条素材 | 桌面直接建内容与 topic-suggestion 是分支；stage action 提示保留自主立题 | 没有证据把旧批量门槛强加所有新内容 |
| 资料选题 | 新岛 1—4 候选、逐层选择，选题名不等于最终发布标题 | `topic-worker.mts` 从 submitted/accepted receipt 投影候选；人工选定后建 T；零预算 | 方法有实际冻结与采用路径；不等同原 jc-topic-generator 首次5—10条批量选题，后者是另一个方法 |
| 找参考/账号研究 | 真实对象、选样、原文深读、对照/反例、范围/费用可追溯 | `production-controller.mts:115` 冻结 researchRuntime；collect/derive-samples/download/normalize-content/save-dataset/freeze/render | 真实工具链存在。账号原片上限3是当前产品限制，不能称原方法全部大样本能力都完成 |
| 评论洞察 | L2材料诊断、L3人群深读、L4本人应用、单条快卡；先冻结对象发现再本人建议 | `research-runtime/index.mjs:112` 保存数据、freeze、personal-advice、render | 已有层级与同源引文校验；快卡 render→import 指定路径有 F2 不兼容 |
| 素材入库 | 选定来源三层去重；file/ffprobe/短解码；字幕严格验收后正式入库 | download先去重；Qwen→correct→SRT→finalize；v2要求已登记来源元数据 | 核心链已接，抖音视频范围有限；F1：完整媒体验收未做仍正式搬入并 finalized |
| 转写校对 | 原始识别、复核、校正版、纠错依据、原片和时间来源保留 | research-runtime/transcript.mjs、subtitles.mjs；普通参考转写绑定 referenceId/baselineHash | 有实际服务与版本保护；精确时间不凭空生成，字幕插值明确 precise_timing:false；真实多格式/口音质量未测 |
| AI拆参考 | 必须原片/字幕/画面证据；逐段及全片，禁止编画面 | jc-video-analysis 原文已随包；stage analysis-ai 保存 analysis-comparison，支持受控参考 | 保存路径存在；“真的看过每个画面”仍是宿主执行质量，不由任意分析文本的合法 schema 证明 |
| 作者先拆 | AI先隐藏，读作者判断后比较，作者裁决再推进 | `jincheng-workflow.mjs:36` 以 authorAnalysisConfirmed 拦截助手差异产物；桌面作者入口写原判断 | 比旧扁平模型明显补齐；可阻止受控文件先泄露AI差异，不能阻止宿主聊天先把答案说出来，真实行为待验 |
| 普通写稿 | jc-content-writer 素材包→一次一问访谈→本人确认素材包→初稿→本人修改 | 完整原方法读取；writing 允许 complete-draft/build | F4：素材包/访谈版本缺专用阶段保存/确认；等待可保留聊天，但与完整同T文件接续不等价 |
| 教程/观点共创 | 只有显式选择；叙事确认→开头/重点/结尾确认→全文 | `assertStageGate` tutorial 显式门禁，hash绑定 ledger 确认后才 build | 真实 gate 存在；普通写稿不被默认强套教程。F5：通用任务回执不验证这些业务结果，不能作为方法通过证据 |
| 原创作页/改稿 | 完整 jc-doc 为真源，稳定 ID/order、mine/note、建议决定、未知字段；手改保护 | `creation-document/parse.mjs:68` 保留 raw；`:77` 按 order；build/regenerate/suggest/reply；原模板与 iframe | 旧“只读body投影”判断已过时。F3：build回执契约不一致；当前功能需真实旧页完整旅程再验 |
| 批注与采纳 | 意见改过重新待处理；先改建议再采用、部分采纳、原句唯一命中 | `feedback.mjs:4` 比较 handled_note；`:5` 提案修改/部分采纳/唯一引用；reply按指纹 | 代码与隔离测试证明相应机制已存在，不应继续列旧 R2 为未实现 |
| 包装 | 当前稿/录完稿为依据；标题、封面字、简介及最终采用分别记录，不改正文 | jc-cover-copy；原页 pubslot/pubcand/final 与 `creation-document/packaging.mjs`；实际封面另 executor | 人工字段保护存在；“设计提示词”与“实际生图”分开，未真实跑图。标题/简介独立需求仍要核对方法分支，不能只凭按钮名认为都执行了 |
| 发布收口 | 用户实际发布后核实平台链接、时间、真实包装与成片；任务结束≠发布 | `jincheng-publish.mjs:9` 要求正式 archive ready；publication-runtime 单列平台、资产、快照 | 已存在正式档案路径，不是旧任务包冒充；外部平台发布仍人工，本次没有发布操作 |
| 复盘/知识 | 12h/7d真实数据、事实/观察/假设分开，最多三动作，作者确认后写正式档案 | `publication-runtime/index.mjs:58` 验证快照证据；`:61` 候选六块/比较引用/hash；人工采用另事务 | 有真实门禁和正式候选写入；自动观察是否在休眠/重开/各平台成功，本次未验；知识采用不自动改 Skill |

原方法证据主要读取：`plugin-src/skills/jc-content-writer/upstream/current/METHOD.md`、`jc-benchmark-intake/upstream/current/METHOD.md`、`jc-gongzuotai-write/upstream/current/schema/creation-page.md` 及源包真相审查所列原件。原锦成桌面主要负责打开/恢复创作页，AI在外部聊天共创；Nova增加固定任务与预算是新适配，不能仅因存在 task 就认定偏离，但需要把业务对象/人的确认接实。

## 3. 当前确定问题与修复方向

### F1 [P1] 完整媒体验收未完成仍正式入库并封闭当前任务

- **触发**：合法的 intakeContractVersion=2 任务，来源元数据、媒体 hash、校正版和字幕通过现有校验，但 file/ffprobe/短解码/封面检查未完成。
- **代码**：`/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/src/lib/research-runtime/index.mjs:101` 搬入 `02_内容素材/未参考`；`:104` 移走中间证据；`:107` 回执同时写 `status:'published'` 与 `strictValidation:{ok:false}`；`:108` 将单条任务标 `intake-finalized`；`:38`、`:69` 对已 finalized 的后续操作/修订拒绝。
- **原约束**：`/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/skills/jc-benchmark-intake/upstream/current/METHOD.md:25`、`:83`、`:93`、`:126`：先完成媒体检查，严格验收后才迁正式目录，失败保留暂存。
- **实测**：v2 + 已登记 source 仍得到 published、intake-finalized、strictValidation.ok=false、formalFileExists=true、intermediateArchived=true。测试模拟的是受控媒体入口，不声称模拟字节通过了真实 broker 的媒体格式检测；缺失的严格检查由运行时自身也明确报告。
- **影响**：完整验收未通过的素材进入后续扫描视为正式素材的位置；修复剩余检查还需新固定任务，原“失败留暂存继续”的语义丢失。返回限制文字是诚实的，但没有纠正文件/状态过早晋级。
- **修复方向**：完整严格检查未通过保持 staging / validation-pending；只有检查收据与同一媒体hash一致才正式移动、封存。若产品明确降级契约，应另设部分入库区域/状态，避免复用 finalized 正式状态。
- **并发修复核对**：v2新增 `media.source`门禁只补来源身份，不改变上述结论。最后复现含该分支。

### F2 [P2] 评论快卡的文档指定 render→production import 回传链不兼容

- **触发**：comments + commentMode=reference-card，按当前运行说明 render-report 后将返回文件导入。
- **代码**：`/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/src/lib/research-runtime/index.mjs:123` 快卡输出 `洞察卡-*.md`；`/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/resources/jincheng-runtime.md:58` 无分支要求 import 该文件并交 report assetHash；`/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/src/commands/production.mjs:51` 只允许 purpose=production-report；`/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/src/lib/file-library/production.mjs:353` 报告要求HTML页。
- **实测**：Markdown快卡以 production-report 导入报 `INVALID_INPUT: Production report requires UTF-8 HTML of at most 8 MiB`。
- **影响边界**：快卡可正常生成在库内，且可作为普通 research artifact.text 合法提交；不是彻底无法交付。问题是助手严格按指定链执行会失败，且快卡不能按同链进入报告资产索引。
- **修复方向**：文档与接口为快卡单列文本提交/索引路径，或渲染为静态HTML再沿现有报告导入；补完整 render→import/submit 的快卡测试。

### F3 [P2] 首稿 build 返回的 stageArtifact 缺文档要求的 HTML path/hash

- **触发**：首次 `jincheng-creation build` 成功后执行规定的回读/提交核对。
- **代码**：`/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/src/commands/jincheng-creation.mjs:20` 将 appendStageArtifact 的返回值原样作为 stageArtifact；`/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/src/lib/vault/workflow.mjs:54` 的 appendStageArtifact 最终只返回 ledger `revision` 和 artifactId；`/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/resources/jincheng-runtime.md:42` 明确要求核对 stageArtifact.path/hash。
- **实测**：`Object.keys(build.stageArtifact)` 仅为 `revision,artifactId`，无 path/hash。其 revision 是创作过程 ledger 的 revision，不是 HTML 文件 hash（HTML hash在build顶层revision）。
- **影响边界**：页面生成成功；完整 entry 已存在 workflow 中，可以额外 read 后按 artifactId 找回。因此是回执合同不一致，非产物丢失。照文档取字段的助手会无法核对、遗漏证据或误把 ledger hash 当 HTML hash。
- **修复方向**：直接返回已写入完整 entry（artifactId/path/hash）并单列 workflowRevision；或改文档要求按ID查回 entry。测试应覆盖教程交付实际使用的字段。

### F4 [P2] 普通口播方法的素材包确认还没有同 T 的阶段对象与版本检查点

- **触发**：选择 jc-content-writer，从素材包/逐问访谈开始，并在素材包确认前退出或切助手。
- **代码**：`/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/src/commands/jincheng-workflow.mjs:43` writing 只允许 complete-draft，不能保存 materials/interview；`/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/src/lib/vault/workflow.mjs:5` KINDS 无素材包/访谈；`/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/src/commands/jincheng-workflow.mjs:29` 首稿 gate仅判断显式教程/已选叙事/重点段/作者先拆，没有素材包版本确认。
- **原约束**：`/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/skills/jc-content-writer/upstream/current/METHOD.md` 第2—4步要求素材包与本人原话落同一文件、停等本人确认；`method-adaptation-contract.md` 又承诺素材包/本人回答/初稿/最终稿同T保存。
- **实测/边界**：尝试通过阶段接口保存 material-pack 报 STAGE_FORBIDDEN；助手仍可在聊天出素材包并waiting-user，也可在任务最终结果text保留材料，所以不是无法按对话法写稿。但通用waiting状态没有绑定正在确认的素材包版本；切助手后的恢复上下文不能从一个正式阶段对象核对已确认内容。
- **修复方向**：添加materials/interview阶段产物、准确hash的作者确认与读回，或明确、实现等价的可恢复确认对象。不要以强制教程叙事/重点段代替普通写稿原方法。

### F5 [P2] 明确教程完整交付的任务验收没有绑定业务产物证明

- **触发**：冻结 workflow=jincheng-stage、stage=tutorial、businessSkill=jc-jiaocheng-video，助手没有生成HTML、没有完成叙事/重点段检查点，仅以普通draft短文提交。
- **代码**：`/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/src/lib/file-library/production.mjs:345` 只校验通用结果、资产存在和部分reference归属；`:350`生成submitted回执；`:364` accept仅校验当前提交回执。没有核对固定阶段所需 pageId/revision/stageArtifact 与真实页/ledger。
- **实测**：隔离教程任务开始时 artifacts=0；普通短draft成功submitted；人工accept成功accepted；最终creationDocuments=0。
- **准确边界**：普通draft作为候选本身合法。UI `/Users/mac/code/dashboard/Nova-Content-Hub/workbench/src/renderer/production-workspace.tsx:43` 显示“结果已提交·待验收”和“已人工验收”，没有自动把教程阶段、正文或发布标完成；`jincheng-creation build`自身的教程检查点门禁有效。本项不能描述为“绕过build后生成了未经确认HTML”或“UI自动谎报发布”。问题是**明确要求完整HTML的任务可以只交摘要就进入人工验收终态，机械回执无法核实这一必要交付**，而使用者/验收工具容易把accepted当完整旅程通过。
- **修复方向**：保留候选与业务完成区别；对固定完整交付任务增加实际页身份/版本/受控build证据检查，或将“部分候选提交”另标，阻止其被作为完整任务验收证据。普通文字讨论/阶段候选不强制完整HTML。

## 4. 等待、恢复、取消与宿主一致性

本次隔离状态测试确实覆盖了 Codex 与 WorkBuddy 两个host值：claim、waiting-user→claimed、waiting-permission→claimed、提交、人工验收、取消/重试后旧attempt拒绝。冻结工具/预算、REQ预留、unknown阻止重复调用、备份恢复退役旧attempt也有通过证据。它们证明共享内核，不证明实际宿主执行了两次完整业务。

`workbench/src/main/production-controller.mts:59` 的 launch 在claimed/两种waiting时仅focus助手，明确返回“当前无法自动定位原聊天”；不冒充创建新聊天为恢复。`production-handoff.mjs:35` 仅created可创建新handoff。没有发现可靠的原宿主session ID/审批事件监听链；宿主权限等待依赖Agent主动回写。缺能力当前有提示，不能写成“已自动恢复原会话”或“已自动识别宿主审批”。

用户换助手走retry，新attempt/claim重新开始，旧身份退役；服务费用unknown/reserved先阻止重试。这比单纯依靠聊天结束判断成功可靠。仍需两个真实宿主分别执行成功、两种等待恢复、取消、失败重试、原任务继续与切换，并保留同task/attempt/requestHash/receipt证据；registry的contract-unverified标记应保持到该验收完成。

## 5. 验证与证据文件

复现脚本：`/Users/mac/code/dashboard/Nova-Content-Hub/docs/reviews/2026-10-28-colleague-readiness-review/evidence/nova-review-workflow-repro.mjs`；结果：`/Users/mac/code/dashboard/Nova-Content-Hub/docs/reviews/2026-10-28-colleague-readiness-review/evidence/nova-review-workflow-recheck.json`。命令：

```text
node /Users/mac/code/dashboard/Nova-Content-Hub/docs/reviews/2026-10-28-colleague-readiness-review/evidence/nova-review-workflow-repro.mjs > /Users/mac/code/dashboard/Nova-Content-Hub/docs/reviews/2026-10-28-colleague-readiness-review/evidence/nova-review-workflow-recheck.json
```

脚本只创建并清理临时库，所有媒体与ASR由本地stub提供；无HTTP、无付费服务、无外部助手调用。JSON含四个关键源码SHA、时间和五个探针结果，供后续改动后复跑。首次编写该脚本时临时vault目录未创建导致ENOENT，已修正脚本并成功完成全程；不是产品失败。

已有定点回归35/35通过：file-library production、vault workflow、creation-document feedback、research-runtime intake。包含两个host的共同状态合同、精确检查点、部分采纳、字幕/入库等。主线程并发运行曾观察v2两个新用例失败；本次完整定点运行及随后单独重跑这两个用例均通过（2/2），所以不能将旧失败继续报告为当前确定回归。当前工作树持续变化，源码SHA不同应重跑对应小探针，不据本报告声明新版本通过。

未验证：真实Codex/WorkBuddy逐阶段模型执行/完整阅读方法；实际网络采集与费用账单；真实Qwen识别、解码与时间轴质量；实际封面生图；真实平台发布/12h与7d观测；旧库真实多人/多轮手改完整旅程；各架构安装与系统展示；GUI视觉规则验收。本次只静态读取UI行为，没有视觉通过结论。
