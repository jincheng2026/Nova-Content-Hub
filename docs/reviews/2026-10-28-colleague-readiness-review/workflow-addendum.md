# 0.5.3新增业务方法接线增补审查

唯一审查对象：冻结副本 `/var/folders/vl/nhqtk_8s6vl5j679xhv_z3n80000gn/T/nova-review-frozen-81r0blvv`，不以之后活动工作树替换证据。仅检查新增 method-adapters、科普逐段、综合调研、封面设计与对应 upstream/current。没有改产品、运行付费服务或新增大套测试。主线程负责该快照测试；本增补不将纯函数合同测试通过等同实际助手旅程通过。

结论：新增方法具有实质代码，不能说只加了Skill名字。科普已有框架/逐段/通读、作者确认、完整页构建与伴随文档链；综合调研有独立编译器，但桌面输入与controller未接通；封面设计有候选与确认读取函数，但“自动送入固定cover请求”的调用链尚未接上。后三者均不能宣称两个助手已完整业务验收。

以下文件路径若使用相对路径，均相对于上述唯一冻结目录；确定问题另列绝对路径。

## 新增阶段状态表

| 方法/环节 | 原方法要求 | 冻结副本实际代码 | 状态与边界 |
|---|---|---|---|
| 科普显式选择 | 普通概念解释不建内容包；按叙事→框架→逐段确认推进 | stage-actions增加kepu，绑定jc-kepu-video；stage gate识别kepu | 方法分支已接，未默认强加给一般写稿 |
| 科普叙事/框架 | 叙事确认后给一个框架，明确每段目的、开头、结尾、预计时长 | method-adapters/index.mjs validateKepuCandidate校验framework；runtime.mjs:41要求已确认最新叙事；workflow新增framework类型 | 有实际结构与作者确认门禁，不只是提示词 |
| 科普逐段口述 | 先摆2—3家参考原话/范式，作者口述，逐句标AI新增，四查与最多一条建议，作者定了再下一段 | index.mjs校验authorSpeech、text、additions、2—3条reference及四查；runtime.mjs:44—46要求此前每段已确认，JSON保存在同T目录 | 可保存及恢复候选；schema验证原话属于所给sourceText，但不证明助手真实看过原来源、未虚构作者口述；需真实宿主逐段验收 |
| 科普通读与HTML | 全篇定后生成对照页通读，保留稿、准确说法、改稿日志，手改后读回 | runtime.mjs:47—49验证全段精确pin；assertKepuReady核对通读/框架/叙事确认；jincheng-creation.mjs:39要求HTML段正文/段名等于确认段；:45写伴随文档 | 已有首稿完整构建接点。最终定稿/提词器导出、对照页后续逐句手改日志仍需端到端验收，不能由候选保存测试代替 |
| 科普原文特殊分支 | 作者坚持“你先写一版”可AI起稿并记日志；旧包参考检索脚本、原对照服务 | 现adapter不执行旧Python；segment字段含initiation但未见明确验证或使用该分支；authorSpeech强制非空 | 原Python替换允许，但AI起稿例外如何表达、参考检索等价性仍需明确；不据此自动判硬缺陷 |
| 综合调研问题冻结 | 真问题、用途、时间/地域行业边界；定位式/议题式/生成式三层 | SynthesisBrief与UI表单已定义；compileSynthesisReport覆盖各层必需段落 | 编译器与UI声明存在，实际启动被字段白名单拒绝，见A1 |
| 综合调研来源与交付 | 区分事实/共识/争议/判断，时效信息联网核验，References及边界 | 编译器校验source文本SHA、claim引用ID和精确quote；输出MD/转义HTML/来源账本；runtime写.workbench/method-results | 有持久化adapter，但controller仍落社媒jincheng-research路径，不能正常到达该runtime。verified-online目前是助手声明，非采集回执验证；真实联网质量待验 |
| 封面设计方案 | 读完整案例，选构图锚点，保留空间结构，转译视觉命题及整体画面规格；身份/文案保护 | validateCoverDesign约束3—5项preserve、replace/exclude/evidence、3:4、identity；runMethodArtifact存同T JSON；桌面精确artifactId/hash确认 | 候选保存链实质存在；不证明已观察参考图或达到审美标准 |
| 设计交接实际生图 | 提示词模式可只交方案；明确制图使用授权图像工具；候选与实际图片分开 | readConfirmedCoverDesign读取最新确认版本并生成prompt/designSource；函数注释称供desktop cover builder消费 | 冻结树未有消费调用者；UI新指令声称自动传入固定cover请求，与实接线不符，见A2。原有独立cover任务能力仍存在 |

## A1 [P2] 综合调研新输入被桌面白名单拒绝，且controller没有冻结专用workflow

**触发**：按新综合调研表单填好synthesisBrief，调用startProductionTask。

**直接代码**：

- `/var/folders/vl/nhqtk_8s6vl5j679xhv_z3n80000gn/T/nova-review-frozen-81r0blvv/workbench/src/renderer/jincheng-stage-actions.tsx:52` 构造synthesisBrief，`:53`将其传给IPC。
- `/var/folders/vl/nhqtk_8s6vl5j679xhv_z3n80000gn/T/nova-review-frozen-81r0blvv/workbench/src/shared/production-validation.ts:48` startProductionTask可选字段无synthesisBrief，因此直接返回false。
- `/var/folders/vl/nhqtk_8s6vl5j679xhv_z3n80000gn/T/nova-review-frozen-81r0blvv/workbench/src/shared/production-contracts.ts:16` ProductionStart也没有该字段。
- `/var/folders/vl/nhqtk_8s6vl5j679xhv_z3n80000gn/T/nova-review-frozen-81r0blvv/workbench/src/main/production-controller.mts:117` 所有research任务进入researchWorkflow；`:119`默认route=topic/manual；`:126`覆盖workflow为jincheng-research且未保存synthesisBrief。
- 专用运行时 `/var/folders/vl/nhqtk_8s6vl5j679xhv_z3n80000gn/T/nova-review-frozen-81r0blvv/plugin-src/src/commands/jincheng-workflow.mjs:17` 要求workflow=jincheng-stage；`method-adapters/runtime.mjs:27`另要求有效synthesisBrief。

**验证**：主线程冻结副本边界探针得到“含synthesisBrief=false、移除后=true”，结果保存 `/Users/mac/code/dashboard/Nova-Content-Hub/docs/reviews/2026-10-28-colleague-readiness-review/evidence/nova-review-synthesis-validation.json`。本子任务静态核对了其完整调用前后链，不另跑重复测试。

**影响**：独立综合调研编译器能工作，但正常桌面任务无法携带所选深度与边界进入它。只把白名单放开还不够，controller会继续转错workflow。不能把三层报告纯函数测试通过写成“综合调研端到端已接通”。

**修复方向**：给ProductionStart/验证器/controller统一增加独立synthesis分支，冻结完整brief、保持jincheng-stage及显式method，确保独立无T任务可执行；补桌面启动→固定context→method保存→report回传测试。

## A2 [P2] 封面设计确认后自动带入cover请求的桥接尚未消费

**触发**：完成cover-design候选并由作者确认准确版本，按新指令在当前T发起独立固定cover任务。

**直接代码**：

- `/var/folders/vl/nhqtk_8s6vl5j679xhv_z3n80000gn/T/nova-review-frozen-81r0blvv/workbench/src/renderer/jincheng-stage-actions.tsx:27` 明确承诺“设计自动传入，不要求用户复制prompt”。
- `/var/folders/vl/nhqtk_8s6vl5j679xhv_z3n80000gn/T/nova-review-frozen-81r0blvv/plugin-src/src/lib/method-adapters/runtime.mjs:55` 的readConfirmedCoverDesign具备读取确认、提取prompt/title/ratio/identity/designSource的实现。
- 对冻结源workbench/src与plugin-src/src检索，该函数仅在runtime.mjs及runtime.d.mts定义/声明；没有任何desktop cover request builder调用，也没有designSource进入实际cover控制器/冻结输入。

**影响边界**：设计候选与人工确认能够保存；原有封面生成任务仍可独立工作。缺失的是新承诺的“已确认设计→自动冻结同一设计到图片任务”桥接，而非整个封面生成能力失效。用户/助手仍需手工转述或复制，无法靠实际cover请求证明生成使用了哪份已确认设计。

**修复方向**：由可信桌面控制器接收同T的artifactId/hash，调用readConfirmedCoverDesign，冻结designSource及完整规格到cover请求，继续原有本人照片/比例/张数/模板/CAS门禁；否则暂时明确仅交设计方案，删除自动传入承诺。

## 非确定缺陷与待验收项

1. **科普版本策略需专项核对**：assertKepuReady要求通读/框架/叙事最新，但段落按通读内精确pin回到已确认版本；新段落候选出现后，旧通读仍可引用此前已确认段。若“新候选未采用不影响已确认稿”是期望，此行为可成立；若作者已确认新段或明确重开，则应核对旧通读是否应失效。本次不将未经澄清的版本策略列确定P2。
2. **JSON不是阻塞原因**：方法候选存.json；vault/core.mjs:284明确支持JSON文档扫描，不能断言阅读按钮必然找不到。实际多段逐项阅读/重新讨论/复开仍未GUI验收。
3. **文档接点待同步**：新增UI要求`jincheng-workflow method`，命令已支持该operation；冻结jincheng-runtime说明未见完整新增payload schema/步骤。宿主是否能不读实现源码即正确构造framework/segment/synthesis/cover-design输入，需要补接口说明与真实宿主验证。
4. **来源真实性不是hash本身证明**：综合调研source hash只绑定助手交来的文本；verified-online是声明。科普authorSpeech、sourceText、cover evidence均为输入，需Agent执行证据与作者确认支撑，不能仅据schema有效认定真看、真说、真核验。
5. **显式状态仍正确保留contract-unverified**：runMethodArtifact返回该状态。主线程在冻结副本运行的14项新增方法/阶段测试通过，不覆盖真实Codex/WorkBuddy长旅程、视觉审美、外部来源与图像生成。

本增补仅更新三条新增方法的状态，不推翻主报告在同一冻结副本重跑仍成立的五项既有探针；不同快照不得混合宣布通过。
