# Nova 0.4 与锦成工作流差距审查

日期：2026-10-28。只读审查源码基线 `ba00bf8c0c3d52b2312274aedad951f8838360fd`（`codex/second-brain-workbench-rebuild`）。唯一新增文件为本报告；未改产品源码、未执行原包脚本、未操作原第二大脑、未安装或重建应用、未提交 Git。

结论：**当前实现具备可保留的安全文件适配、助手任务和候选采用内核，但还不能交付为“打开原第二大脑，就像使用自己的锦成工作台”。** 可读取原正文、能启动配套 Skill、结果能进入同一内容目录，是三个已经有实现的技术环节；它们不等于原业务对象、逐环节协作和原产物语义已完整接入。主要问题不是按钮或颜色，而是当前稿件协议被压缩成通用正文模型，再用方法文案补充协议未承载的行为。

## 1. 五项主要偏差

1. **原创作页只投影人工正文，实际历史协作状态没有迁入。** `htmlBody()` 只拼 `segment.fields.mine`；首次投影的创作状态由空默认值建立。原页的参考、建议决定、用户给 AI 的话、AI 回应、录完稿、包装候选等仍在原件中，但新工作区并不接着这些状态工作。
2. **原“对照／通读＋逐段反馈＋读回响应”被简化成逐段稿件、来源对照、录制分工。** 有新段落编辑与普通批注，缺少原参考讲法分析、骨架对照、部分采纳、先改建议再采纳、意见再次变更自动待处理等业务能力。
3. **同一聊天的连续推进被产品化为最后一次整套提交。** 研究、拆解、叙事、正文、包装的候选可以统一归档；但叙事等阶段确认没有专用确认记录，整套采用还要求 analysis/narrative/draft/packaging 全齐。默认入口变少不应把中间成果和人工决策压成一个最终结果。
4. **Skill 适配是方法重写与封装，未证明业务等价。** registry 仍把 `jc-gongzuotai-write` 声称为只取得历史快照，而原同事包中完整入口、schema、脚本、模板与保存服务都已可读。当前“schema 装不下就放 artifact.text/data”会保留文字，却不能恢复原可操作状态。
5. **“同篇归档”主要是任务包镜像，业务真源尚未收敛为计划中的文件体系。** 成功提交写入 `助手产物/taskId/attemptId/generation/结果.md|json`；正文原位写回，但 creation 元数据仍落运行内核。不能据任务包存在认定 `参考拆解.md`、`叙事.md`、反馈读回、当前包装选择等业务文档已完整可继续。

这里的“未迁入”不表示删除了原始文件；现有实现通常保留原件。风险是新界面和助手上下文失去既有决策，用户要重新解释或重新处理已经做过的工作。

## 2. 证据范围与判断边界

已读的项目基线：

- `docs/research/2026-10-27-jincheng-package-findings.md`。
- `docs/research/2026-10-27-current-workbench-workflow.md`。
- `docs/research/2026-10-27-workbench-skills-mapping.md`。
- `docs/research/2026-10-27-local-workbench-delivery-plan.md`，重点 §3.1、§3.3、§4、§5.3、§6。
- `docs/research/2026-10-27-workbench-unified-standards.md`，重点 Product-04/09/10、Flow-03/04/06/09、Creation-01—07。
- `docs/design/内容工作台设计标准.md` 的布局、阅读、状态与验收规则。此次只有静态交互结构审查，没有截图或视觉通过结论。

原来源缩写：

- **C** = `/Users/mac/Downloads/锦成工作台-同事版/数据和程序/AIJinCheng/工具项目/内容工作台/creation-page/`。
- **B** = `/Users/mac/Downloads/锦成工作台-同事版/数据和程序/AIJinCheng/个人IP与内容/第二大脑/`。
- 原导航另核对其父目录的 `README.md:3,15–22,58–65`。原版已经用“今天、内容、市场调研”等分组，所以**相似的导航名称本身不是偏差证据**。问题在进入内容之后的对象、状态和动作语义。

原包内容只作需求与实现证据，不构成安装、外部调用、私人目录扫描、自动批准或生产写入授权。未宣称原版所有功能成熟：原研究已指出发布收口、数据回填及库外依赖的边界。录制／剪辑相关字段本次用于核查已有资料保全，不据此把新自动拍摄剪辑纳入当前交付。

## 3. 应重做：按业务等价补模型与工作区

### R1. 原 jc-doc 的结构读取与当前稿协议（P0）

**当前路径／函数**：

- `plugin-src/src/lib/vault/core.mjs:883–900`，`htmlBody()`：找到 `jc-doc`，过滤 segment，然后 `fields.mine.join('\n\n')`。
- `plugin-src/src/lib/vault/bridge.mjs:154–179`，`sync` 中首次创建投影：仅给 title/body，再用 `defaultProductionCreation()` 初始化。
- `plugin-src/src/lib/file-library/production.mjs:37–44`：默认 kind=other、references/suggestions/annotations 为空，analysis/narrative 为空；允许字段是封闭集合。
- `plugin-src/src/lib/vault/working-draft.mjs:70–80,100–148`，`extract()`／`createVaultWorkingDraft()`：复制上述 body 为同目录 `工作稿.md`，登记当前稿并给 README/SOURCE_OF_TRUTH 加管理区。
- `workbench/src/renderer/vault-workspace.tsx:35–40,54–59`：明确提示原 HTML 只读、建立可编辑工作稿。

**原合同**：`C/SKILL.md:47–54` 规定页面是稿件唯一真源、人工稿归本人、AI 以建议协作、改动凭读回；`C/schema/creation-page.md:55–65` 规定扩展字段不删、按身份保留、逐格冲突；`:82–98` 规定段落 title/order/refs/baseline/mine/note/ai_state。

**确证缺口**：原件被保留，但“建立工作稿”的输入只含正文，并没有转换原建议、意见、回复和参考关联。新页不是接续原创作状态。`htmlBody()` 还按 items 数组顺序拼接，而原 schema `:86` 明确按 `locked.order` 排序；合法原页的数组顺序不同会导致投影顺序不等价。此项是源码可证条件风险，未声称当前十个样例都实际乱序。

**应做**：设计完整 jc-doc reader、稳定 item ID 映射和受控写回／迁移协议；先声明保留哪些可编辑字段、哪些只读、未知字段如何无损保留，再实现新 UI。任何切换当前稿必须可对账到原内容和全部仍有效的人工作业，不能用单次 body 提取完成“迁移”。生产化可替换旧 Python/常驻服务，但不能替换掉它们承担的业务合同。

### R2. 逐段改稿、意见回写与双视图（P0）

**当前路径／函数**：

- `plugin-src/src/lib/file-library/production.d.ts:8–17`：suggestion 仅 quote/replacement/reason/status；annotation 仅 quote/text/open|resolved；segment 仅范围、用途、references、visual。
- `production.mjs:40–50,139`：校验与 patch 白名单不接受原 note、baseline、handled_note/reply、建议类别／依据／裁决等字段。
- `workbench/src/renderer/segment-workspace.tsx:24,43,49–51`：writing/sources/recording 三视图；按当前单段编辑；sources 中显示原话与整体 analysis/narrative。
- `workbench/src/renderer/production-workspace.tsx:327,337–341`：`AnchoredReview` 能高亮原句、采纳或拒绝、标记处理，但不是原逐格回应模型。

**原合同／实现**：

- `C/schema/creation-page.md:90–98`：baseline 与用户 mine 分开；note 与 handled_note 比较，用户改过意见后自动重新待处理。
- `:100–118`：建议具有 category/source/basis/verdict；proposed 可先人工修改，decision 可部分采纳；采用正文和决定同组提交。
- `:146–167`：每段 refnote 与全片 skeleton，按讲法和多家来源组织；事实引文校验，借鉴点可关联具体建议；未使用参考另存 spare_refs（`:80`）。
- `C/template/app.js:468–469,1184–1229`：真实“对照／通读”切换，通读基于全稿且能定位回段落、选字反馈；`:1297–1305`：意见更新后显示旧回复并恢复待 AI 处理。

**确证缺口**：普通 annotations 的 resolved 只表示处理标记，不能回答 AI 处理的是哪一版意见、回复是什么、用户后来是否改过意见。当前“来源对照”也不是 refnote/skeleton 的业务等价；“复制提词稿”不等于可交互通读页。当前版本历史有整篇前后记录，但不是原逐格归属、baseline 和回复账本。

**应做**：把段落反馈、回复版本、建议依据/裁决、参考分析建成一等状态；对照／通读共用同一当前稿和意见数据。不要另存第二份正文。模板化布局、Semi 控件和现代样式可继续用，但原业务信息不能靠一个总 analysis 文本替代。

### R3. 分阶段产物与人工确认链（P0）

**当前路径／函数**：

- `workbench/src/renderer/production-workspace.tsx:257–288`，`startCreation`／`adoptBundle`：同一个 content-creation 任务，最终整套预览并采用；任务验收与采用有明确区分，这是可保留能力。
- `plugin-src/resources/production-artifacts.md:30`、`plugin-src/src/lib/file-library/production-artifacts.mjs:66–113`：整套必须 analysis/narrative/draft/packaging 各一项；不接受 suggestions/annotations/filming 混入；analysis/narrative 只能有空 data，正文只允许 composition。
- `plugin-src/skills/nova-content-writing-execution/references/content-creation.md:5–14`：最后一次 submit 汇总；在聊天中澄清；跳过研究仍必须有实质 analysis。
- `plugin-src/src/lib/file-library/production.mjs:130–136,323,341–360`：有通用等待／恢复／提交／验收，以及专用定位 checkpoint；没有同等明确的素材包、本人叙事、用户先拆的结构化业务 checkpoint。
- `plugin-src/skills/jc-content-writer/references/method.md:5–6`：素材包确认被改写成“用户明确指定素材包确认节点时”才等待；原方法的默认素材包确认停止点已弱化。
- `plugin-src/skills/jc-video-analysis/references/method.md:9`：用户先拆时先隐藏 AI 分析、等用户反馈的流程存在于说明；ProductionCreation 没有其隐藏／已交用户拆解／差异待裁决的数据状态。

**原合同**：包研究 §4.5／4.7／4.8 分别记录素材包确认、叙事确认、初稿后改稿页。`C/SKILL.md:60,74–76,154–156` 有明确进入条件、人工格子权限、删除确认。

**确证缺口**：通用 waiting-user 能表达“正在等人”，不能独立证明“对哪份叙事、哪个版本、哪些取舍已经确认”。整套结果齐全检查证明结构满足 Nova 契约，不能证明原阶段门经过。直接创作／已有稿件修改还受到最终必交拆解与包装的固定包限制，与 Flow-03/04 的多起点需进一步对齐。

**应做**：保留一个主入口与同一任务上下文，补可持久读回的阶段产物／决策／版本关系；用户已有明确输入可跳过无意义环节，但每个实际发生的确认要能恢复。把“任务 accepted”“叙事已确认”“正文已锁”“包装已选”保持为不同事实。不是新增十几个 Skill 按钮，也不是强制每篇走全流程。

### R4. Skill 来源与方法接线（P0）

**确证矛盾**：

- `plugin-src/resources/business-skills.json:433–461,546–550` 将改稿方法登记为历史适配，称原 schema/scripts/服务依赖未完整取得。
- `plugin-src/resources/production-methods-provenance.md:59,63`、`plugin-src/skills/nova-workbench-writing-method/references/method.md:3` 重复该结论。
- 当前指定的本地来源实际有 `C/SKILL.md`、`schema/creation-page.md`、`brain_page.py`、`build_page.py`、`creation_doc.py`、`server/brain_save.py`、`template/app.js`；前一日包研究 §4.8 也已经明确说明这些文件实存。

**能力边界证据**：`business-skills-contract.md:8,14` 明确 methods 是重新提炼指南，超出 schema 的字段放 text/data；`production-methods-provenance.md:31–35` 自己明确文档校验不能证明业务质量等价。对整套创作，`production-artifacts.mjs:88–89` 甚至限制 analysis/narrative 不带额外 data，所以“放 data”也不是全路径通用的承载方案。

**应做**：修正来源清单，逐项做“原业务规则→新类型→保存入口→UI动作→助手读回→验收”映射。可以用新版运行内核替代旧脚本，不能把旧脚本的校验、权限和读回职责省略后标为适配完成。只保留范围内的方法；私人赛道阈值、付费默认和旧 HOME 不照搬，旧 B-roll/dbskill 停用决定不因此反转。

### R5. 知识库真源、业务归档与重新接续（P0）

**当前路径／函数**：

- `plugin-src/src/lib/file-library/production-vault-archive.mjs:38–77`，`publishVaultProductionArchive()`：同内容结果进入 `内容目录/助手产物/taskId/attemptId/generation`，仅复制 `结果.md`、`结果.json`，另有 manifest；资产链接转向 runtime 内容寻址资产。
- `plugin-src/src/lib/vault/bridge.mjs:417–446`：内容事务向源文件写回的是 body 字节；`production.mjs:413–426` 把 creationPatch 存入 runtime content metadata 的 productionState。
- `plugin-src/src/lib/vault/resources.mjs:77–107,209–269`：结构化资源投影专门覆盖账号／报告／提示词，没有原 jc-doc 创作状态导入。
- `plugin-src/src/lib/vault/core.mjs:1042–1124`：任务 Vault context 有当前来源和 relatedDocuments 的 ID/路径/hash；不等于已经读出全部原创作状态。

**与计划的差异**：交付计划 §3.3 要求同篇参考拆解、素材包、叙事、工作稿、标题简介、反馈版本等实际产物可查，§3.4 规定运行投影可重建；§3.1 要求旧 HTML 结构化数据通过适配器进入编辑界面。当前已经达到“候选任务包可追溯”，未达到“这些业务对象以现有文件为真源完整接续”。

**风险**：日常仅按原第二大脑文件或旧创作页继续的助手读不到运行元数据里的选择和意见；仅重建 file projection 得到默认 creation，不能恢复全部状态。完整 Vault 备份可能包含 runtime，并非断言现有备份丢数据；这里质疑的是“运行数据只是可重建投影”的语义承诺。

**应做**：先确定每类业务状态的唯一真源及从原件迁移策略。不可变任务包继续保留作证据；业务视图通过稳定关系定位已提交、已验收、已采用、当前稿，而不是靠文件名或最新时间猜测。不能把所有结果重写成另一套普通 Markdown后，就丢弃原字段与历史。

### R6. 原阶段与来源选择不应降级成通用状态（P1，部分影响 P0）

- `vault/core.mjs:902–938` 只从卡片/总览提取“已发布／草稿／待写”；`bridge.mjs:175–178,200–212` 映成 published/writing/idea。原页写稿／审稿／定稿／录制准备、info.approved、recorded 没有参与该投影。
- `core.mjs:967–1010` 先用总览链接，再按文件名和列表顺序选择；无明确当前稿时退到第一个候选，不是完整读取 SOURCE_OF_TRUTH 的权威规则。已有缺失／冲突保护值得保留，但还需对歧义明确选择，避免“可读”被误认成“正确当前稿”。
- `workbench/src/renderer/app.tsx:665–714` 的项目阶段筛选和内容页最终承接以上模型；`production-workspace.tsx:354–368` 目录还结合真实 publications，而非仅凭 stage 宣称发布，这一点不应移除。

应把“编辑阶段”“内容锁定”“录完稿”“实际发布”“归档状态”分别识别，旧库无法确认时显示未知或冲突。保留原已录未发／closeout_pending 等真实差别，不能因目录叫“已做”视为全流程完成。

## 4. 原实际资料证明缺口已发生在历史工作，而非只是假想需求

本次用只读 Python 解析 B 下十个 `*创作页.html` 的 `jc-doc` JSON，仅统计结构和非空状态，没有运行页面脚本或公开正文。以下均为实际原件条目数：

| 原文件（相对 B/05_内容草稿） | 可验证的原状态 | 当前仅 body 投影的影响 |
| --- | --- | --- |
| `T020_AI是00后最值得抓住的杠杆/T020_创作页.html` | 8 段、66 建议、63 个非空 suggestion decision、2 段非空 note、2 条 AI reply、24 条段落引用；另有 2 pubslot、5 pubcand | 已裁决建议、意见回应、包装候选无法从默认 creation 接续 |
| `T029_WorkBuddy必装三个Skill/T029_创作页.html` | 7 段、16 建议且 16 个非空 decision、7 refnote、1 skeleton、4 step、14 引用；含 todo_editor/todo_me | 多参考讲法分析与已经作出的裁决不只是缺 UI，还没进入结构模型 |
| `已做/T026_书籍蒸馏成Skill/T026_创作页.html` | 6 段、7 step、5 建议决定、非空 info.recorded、18 引用 | 单一 body 不表示录完定稿；已有制作信息须保留可查 |
| `已做/T044_AI变现与执行力/T044_创作页.html` | 6 段、30 建议、3 pubslot、29 pubcand、非空 recorded、3 final、1 AI reply | 原已定包装与实际录完稿不能由空 packaging 和 confirmedBodyHash 代替 |

其他已解析 T030、T031、T034、T041、T042、T046 也有各自段落、建议和扩展数据。本次未据这些结构统计判断内容质量或实际发布成功。T044 的 32 个非空 decision 跨建议与包装条目，不能全部算成建议决定；上表刻意不混用该总数。

## 5. 应保留：现有内核不是全部推翻

| 可保留能力 | 已检查的位置 | 保留理由与边界 |
| --- | --- | --- |
| Vault 根身份、路径限制、CAS、mutation journal、回收恢复 | `vault/core.mjs:33–168,538–666,774–881`；`working-draft.mjs:153–200` | 防跨库、覆盖和半完成；重做业务模型时应复用事务原则，不回到任意文件写入 |
| 明确当前稿迁移的保护与冲突保留 | `working-draft.mjs:40–68,100–148` | 现有迁移内容不足，但原件保留、提交后生效、来源变化拒绝是正确保障 |
| 助手固定任务、两类等待、回执、验收与采用分离 | `production.mjs:124–138,323–365`；`production-artifacts.mjs:18–23,120–125` | 可承载新的阶段契约；真实宿主能力仍需分别验收，不据源码存在宣称成功 |
| 引用/转写证据与段落版本保护 | `production.mjs:140–149,413–426`；`production-artifacts.mjs:26–47`；`segment-workspace.tsx:30–41` | 逐字引文、字幕范围、段落迁移、版本冲突处理有价值；扩充原字段而非丢掉这些保护 |
| 整篇版本记录、候选预览、正文变化撤销锁定 | `production-workspace.tsx:244–252,303–327` | 能防候选覆盖人工新输入，仍需补原逐格和回复语义 |
| 不可变任务归档与摘要校验 | `production-vault-archive.mjs:13–35,65–114`；`workbench/src/main/production-archive.mts:9–19` | 继续做提交证据层，不能充当全部业务真源 |
| 雷达、受控采集和资格／采用证据 | `production.mjs:113–123,206–233,270–285`；`workbench/src/renderer/radar-workspace.tsx` | Nova 优势应作为创作主线的参考来源接入，不为复刻原版而移除 |
| 独立包装字段、封面模板和人工发布记录 | `production.d.ts:6–7`；`production-workspace.tsx:228–229,302,354–368`；`app.tsx:713–714` | 标题／封面文字／简介和实际发布事实分开是正确方向；需导入原有选择 |
| 完整 Vault 备份与资源投影 | `vault/backup.mjs:46–96,137–142`；`vault/resources.mjs:209–269` | 可继续完善平台验收；本审查未运行备份恢复，不给通过结论 |

## 6. 应隔离：0.4 作为技术实验基线，不作为这次业务交付

1. **隔离交付结论**：既有 0.4 安装包、安装截图、构建和测试记录保留真实版本与用途，标为技术验证／旧方案证据；不能改名后当作“锦成同事工作台已完成”。本报告没有更改发行记录或安装包。
2. **隔离旧正文转换入口**：`createVaultWorkingDraft` 可作为明确的“仅抽取正文继续写”的兼容能力，不应在主路径中暗示完整原创作页迁移。正式新路径先有字段对账与可回读证明。
3. **隔离整套终点协议**：当前 content-creation bundle 可保留为一种交付方式，不能成为所有新建／续写／只改一句的唯一业务协议；阶段任务及原产物继续有自己的身份和确认状态。
4. **隔离过时来源声明**：registry/provenance 的“原件没取得”只保留为历史结论，修正后再纳入新来源冻结。不能因为既有构建通过就继续沿用错误事实。
5. **隔离库外个人服务**：原私域、运动、飞书、X、独立视频档案、缺失媒体和未提供凭据按实际依赖显示；不把这些设为内容主线前提，不把缺失显示成正常空数据。

“隔离”是交付范围和证据标注，不是删除旧代码、旧库或用户文件。

## 7. 收敛验收：用真实工作证明等价

以下应在原库隔离副本和空白库上执行；当前均为待执行。本报告不以测试数量给产品完成结论。

1. **原状态读回**：以 T020/T029/T026/T044 样例逐项核对段落顺序、人工正文、原建议裁决、意见／回复、参考分析、录完稿与包装选择；未知扩展键仍可导出对账。对应 Product-04/09、Creation-01/04/07。
2. **原工作继续**：在原已有意见上改一次文字，AI 必须看到具体新版并逐项回应；只处理过旧版的意见自动保持待处理；重新打开和切助手仍定位到同条意见。对应 Flow-09、Creation-04。
3. **双视图同源**：对照和通读切换不改变正文；通读选字反馈回到同一段；建议先改再采纳／拒绝／部分采纳保留决定，重复引用不能错改第一处。对应 Creation-02/03、Reading-02、Layout-02。
4. **分阶段继续**：从想法、已有拆解、已确认叙事、已有完整稿、只改一句分别开始；该跳过的步骤不补造，该确认的版本有确切记录；中途退出能从阶段产物继续。对应 Flow-03/04/06/09、Product-10。
5. **产物和真源**：提交未采用也能找到候选；采用后界面、文件与助手读回一致；移除并重建约定为“投影”的数据后业务状态不丢，或者明确把不可重建业务数据升级为正式真源并纳入文档和备份。对应 Creation-06/07、交付计划 §3.3/3.4。
6. **Nova 优势不退化**：雷达筛选／排除／采用仍有真实来源，能进入明确 T 内容；封面、模板、账号和报告继续关联同篇。对应 Research-05/10/11。
7. **桌面与宿主另验**：Codex、WorkBuddy 分别真实执行成功、两类等待恢复、失败取消重试、原任务继续与切换；目标平台逐项构建／安装／原生运行。对应根 AGENTS、Acceptance-03，不以本次静态审查替代。

建议实施顺序是：先冻结原业务字段／状态／写入所有权映射，再完成一个真实旧创作页的无损继续纵切；通过后重做工作区与其余阶段。继续在现有扁平模型上补说明文案和按钮，只会把原业务合同继续推给助手记忆。
