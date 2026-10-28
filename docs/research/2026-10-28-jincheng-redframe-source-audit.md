# 锦成红框范围：原件与当前源码核对

核对日期：2026-10-28。源码观察截止约 11:50—11:55（Asia/Shanghai）。当时 HEAD 为 `9eb49c96268dbc72123847105fd1acd2491fa8ed`，工作区有其他开发任务的未提交修改，尤其创作页保存、详情资料分组与方法登记。本文针对**当时工作区**，不等于此提交、0.5.0 安装包或下一次交付都已具备同样能力。

本次只读代码、已提取方法原件和相关第二大脑材料；未运行原包、页面脚本、采集、转写、安装器或服务器，未改原库与产品代码，未重新执行功能测试。仅新增本文。下文“已存在”指有实际源码实现和接线；“原件规则”指方法要求；两者均不冒充真人操作验收。

## 一、本次必须采用的新边界

本次主线只有：**调研对标 → 拆解对标 → 形成本人观点与角度 → AI 草稿和人工反复修改 → 制作封面 → 保存最终逐字稿、标题、简介、封面**。X 账号／收藏、私域、运动不在本次范围；拍摄、剪辑、实际发布和发布后复盘不是本轮主功能。旧资料里这些环节是真实历史背景，不能继续充当本轮完成门槛。

“第二大脑协作”是同一篇内容的材料、决定、手改、最终资产可以被人和助手准确读回，而非必须新增一个知识管理模块。独立“创作知识”栏目撤下不意味着删掉对既有本人判断的只读利用；也不意味着本轮要自动提炼并写入判断库。

## 二、原工作法到底怎样工作

| 环节 | 作者实际决定／操作 | 助手责任 | 真实读写关系 |
|---|---|---|---|
| 调研对标 | 给问题、账号、作品或已选素材；挑哪些值得继续 | 根据真实来源研究，保留原链接、原文、原片与证据；区分对方事实和推断 | 第二大脑 `01_对标账号`、`02_内容素材` 是上游；研究报告可以独立于一篇 T 内容存在。原工作台提供账号、报告与来源入口，不等于已在后台自动完成研究 |
| 拆对标 | 可让 AI 独立拆；也可“我先拆，再比较” | 后一分支不能提前泄露 AI 答案；读回本人拆解，分相同、本人独有、AI 独有，后者给人逐条批；每条判断有原话／画面时间证据 | 完整 AI 拆解与 `参考拆解.md` 分开保存于同一 T 草稿目录；卡片保存原视频和汇总链接。纠正能成为以后拆解的依据，但不是本轮默认修改全局方法的授权 |
| 形成本人观点与角度 | 明确我为什么讲、讲给谁、我自己的判断、选哪种角度、看完得到什么 | 先读定位、参考、本人回答和既有决定，提出有依据的候选；不能把 AI 总结冒充“本人说过” | 选题卡保留简短决定和渐进元问题；具体拆解、讨论与框架在同一 T 草稿目录；本人经历与跨篇判断另有原件真源 |
| AI 初稿 | 确认材料和自己的观点，选择需要的方法 | 普通写稿方法先素材包、逐问访谈、确认再初稿；教程方法只有显式选择才用，并先确认叙事、重点段，再完整稿 | `jc-content-writer` 与 `jc-jiaocheng-video` 是不同方法，不能把所有内容强制套同一流程。旧 writer 的三位编号命名已被较新 Vault 的同一 T 文件夹规则替代 |
| 人工反复改 | 在创作页直接改 `mine`，写 `note`／整体意见；逐条采纳、不采纳、先改再采纳 | 每轮先读当前页面；先处理意见，再回复；建议引用当前原句且保留依据。用户手改是当前基准，不能凭旧聊天整篇覆盖 | HTML 内 `jc-doc` 是页面数据真源：`baseline` 为 AI 上次交稿，`mine` 为当前作者稿；`handled_note` 记 AI 实际处理的意见版本。人再改意见，自动恢复待处理。建议采用同时提交正文和决定 |
| 标题、简介、封面 | 确认逐字稿；选择、手改包装；选择最终封面图 | 不因做包装改正文。较新教程规则明确：已有创作页并勾内容确认时，一次给标题／封面文字／简介候选；封面图另由设计／生图环节完成 | 标题／简介／封面字是独立选择；`pubslot.fields.final` 等保留选定值。原 VI 是挑图、历史图与人物素材入口，不等于自动生成当前封面 |
| 保存最终结果 | 明确这一版为最终稿、哪张为最终封面 | 从当前真源取稿，不从聊天抄旧版；给出同一内容下可重新打开的最终资产 | 原教程方法要求同 T 根目录一份 `定稿.md`；本轮按新范围验收“最终逐字稿＋标题＋简介＋封面可找、可读、可继续”，不附加发布事实或复盘要求 |

直接来源：

- [原视频拆解方法](/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/skills/jc-video-analysis/upstream/current/METHOD.md:26)：26—36 为两种拆法；42—60 为真实证据与交付；72—80 为落盘。
- [原普通写稿方法](/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/skills/jc-content-writer/upstream/current/METHOD.md:10)：10—19 为本人判断、手改保护；27—55 为材料／访谈／确认；57—78 为初稿／反复改／最终稿。
- [原教程方法](/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/skills/jc-jiaocheng-video/upstream/current/METHOD.md:85)：85—91 为沿用参考与来源分层；93—126 为本人叙事、确认、重点段与定稿；142—153 为标题封面简介。
- [原页协作循环](/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/skills/jc-gongzuotai-write/upstream/current/METHOD.md:243)：247—284 为先读、先做后回和引用原句；290—310 为整段换稿保护；326—334 为定稿及仅候选的知识提炼。
- [原字段合同](/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/skills/jc-gongzuotai-write/upstream/current/schema/creation-page.md:68)：68—98 为 info／段落／意见版本；100—114 为建议与同组采用。
- [独立交接 Vault 的规则](/Users/mac/Downloads/第二大脑交接包_2026-10-16/第二大脑/AGENTS.md:18)：18—26 为同 T 文件夹及跨篇原件；28—40 为定位、显式教程、选题和渐进元问题；44—60 为真实材料、导航和当前稿。这里只读取其规则与已给资料，不把包内旧机器路径当成本机可用来源。

## 三、工作台与第二大脑分工不能混淆

旧工作台是“找回同一篇内容并打开真实页面”的承载层，助手在外部聊天中共创，保存服务让页面改动成为助手下次可读的文件。原 [actions.mjs](/Users/mac/Downloads/锦成工作台-同事版/数据和程序/AIJinCheng/工具项目/内容工作台/lib/actions.mjs:1) 直接写明 AI 会话／Skill 已退出动作面，`dispatch` 仅支持 `open`（17—21）。新工作台的“打开助手、固定任务、回执”是新增适配能力，应服务原业务，不可据旧按钮反推原本已经有整套任务编排。

真实原件之间也存在矛盾：旧 [works.mjs](/Users/mac/Downloads/锦成工作台-同事版/数据和程序/AIJinCheng/工具项目/内容工作台/lib/works.mjs:1134) 的“接着写”按修改时间排序，独立 Vault 的 [AGENTS.md](/Users/mac/Downloads/第二大脑交接包_2026-10-16/第二大脑/AGENTS.md:54) 却明确不得按修改时间选当前版本。应保留“能接回正确当前稿”的习惯和显式来源选择，不能把旧排序缺陷当作必须复刻的功能。

第二大脑至少有四种不同事实，不能压平：

1. 外部对标事实与原片：来自谁、什么时间、说了什么。
2. 本人回答与确认：用户实际说过、选过、否决过什么。
3. AI 候选：拆解、框架、建议、包装尚未被人采用。
4. 当前采用版本：人手改后正文、已选标题简介、最终封面。

导航和索引只负责找到原件，不是原件正文；任务提交／验收记录也不是作者采用。跨篇判断库与 `03_内容规律` 的市场写法候选权威不同。缺了外部判断库应说明缺口，不能偷偷将市场样本变成作者立场。

原 UI 观察的限制仍成立：[只读观察记录](/Users/mac/code/dashboard/Nova-Content-Hub/docs/research/2026-10-28-jincheng-original-ui-observations.md:1) 记录当时 T020 创作页因保存服务未开而未实际编辑；不能引用该记录证明旧页保存或本轮新页保存通过。

## 四、当前代码已不再是旧 gap-audit 描写的扁平模型

以下以实际实现为依据，保留运行验收边界。

| 当前可确认的源码能力 | 位置 | 能证明什么／不能证明什么 |
|---|---|---|
| 完整解析 `jc-doc`，保留 raw 和扩展字段，只替换原 HTML 数据块 | [parse.mjs](/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/src/lib/creation-document/parse.mjs:68)，68—89 | 已非“只抽 body”；尚不能仅据解析函数断言每篇旧页全功能等价 |
| 原页逐格写回、同组提交、历史读回、意见版本核验 | [store.mjs](/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/src/lib/creation-document/store.mjs:40)，40—88；[feedback.mjs](/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/src/lib/creation-document/feedback.mjs:4)，4—17 | 已有 handled_note、reply、采纳／部分采纳、原句唯一性；旧“只有 resolved 标记”只适用于仍保留的旧通用创作模型 |
| 冻结模板校验、生成完整 HTML、重生成保护 | [build.mjs](/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/src/lib/creation-document/build.mjs:125)，125—162 | 有生成实现，应用外明确只读；不代表外部 Chrome 可编辑 |
| 同一内容详情打开原页、回到正确来源、原件冲突让人选 | [jincheng-work-detail.tsx](/Users/mac/code/dashboard/Nova-Content-Hub/workbench/src/renderer/jincheng-work-detail.tsx:149)，149—204；[creation-controller.mts](/Users/mac/code/dashboard/Nova-Content-Hub/workbench/src/main/creation-controller.mts:14)，14—69 | 已接入原页与受控保存入口；该详情文件正在其他任务修改，外观和保存回归须绑定冻结版本 |
| 阶段产物和作者确认绑定具体文件 hash、版本 | [workflow.mjs](/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/src/lib/vault/workflow.mjs:32)，32—78 | 有独立确认事实，内容变化后不沿用旧确认；不是单一 stage 字符串 |
| 分阶段助手操作与读回原页 | [jincheng-stage-actions.tsx](/Users/mac/code/dashboard/Nova-Content-Hub/workbench/src/renderer/jincheng-stage-actions.tsx:16)，16—46；[jincheng-creation.mjs](/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/src/commands/jincheng-creation.mjs:12)，12—41 | 支持拆解、叙事、重点段、写稿、批注、包装等分阶段；旧 content-creation 整套终点协议不是唯一入口 |
| 作者先拆与教程确认门 | [jincheng-workflow.mjs](/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/src/commands/jincheng-workflow.mjs:24)，24—46；[stage-worker.mts](/Users/mac/code/dashboard/Nova-Content-Hub/workbench/src/main/stage-worker.mts:14)，14—19 | 本人拆解落同 T，未确认时不允许该路径写 AI 结论；但聊天是否提前泄露答案仍属助手行为验收 |
| 来源角色和权威区分 | [source-map.mjs](/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/src/lib/vault/source-map.mjs:6)，6—55 | 区分 market-patterns 候选、判断、本人材料和只读分析副本；存在角色不表示缺失外部文件已获取 |

因此旧 [gap-audit](/Users/mac/code/dashboard/Nova-Content-Hub/docs/research/2026-10-28-nova-jincheng-workflow-gap-audit.md:1) 中“没有完整原页模型”“没有原页读写”“只有通用等待、没有阶段确认”“原 schema/scripts 未取得”等不能作为当前全部代码结论。它们可保留为当时问题及重构动机。

## 五、当前仍需纠偏或证明的连接

### 1. 原页选定封面字与新封面任务存在两个模型的接缝

原创作页采用包装落在 `pubslot.fields.final`；当前制作封面窗口却从通用创作数据读取 `packaging.coverTexts[selectedCoverTextId]`：[covers.tsx](/Users/mac/code/dashboard/Nova-Content-Hub/workbench/src/renderer/covers.tsx:100) 100—109、285—290。[production.mjs](/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/src/lib/file-library/production.mjs:112) 的 `readProductionCreation` 返回 `content.productionState` 或 `production.creations`，该函数未解析原页 pubslot。[app.tsx](/Users/mac/code/dashboard/Nova-Content-Hub/workbench/src/renderer/app.tsx:592) 的 `startCover` 592—600 只切到封面操作。

在上述读取链内未见将原页当前选定文字转换为封面请求的桥接。至少必须验证：用户在原页改选封面字后，“制作封面”冻结的到底是哪一版；不得以两个地方各自能保存证明相互贯通。若无法自动贯通，必须明确让人选择并显示当前采用文字，不能静默使用空值或旧通用模型。

### 2. 本轮终点应明确包含简介与最终四项资产

当前 [stage-actions:26](/Users/mac/code/dashboard/Nova-Content-Hub/workbench/src/renderer/jincheng-stage-actions.tsx:26) 包装动作只明确“标题／封面文字”，并强调不强制一次全套；原教程方法 146 行的**已确认创作页分支**却要求标题、封面文字、简介同时出候选。不能把“各阶段按需”误解为遗漏用户最终要求的简介。

当前已有原页包装条目、通用包装、封面候选等存储，仍需证明人能在同一篇内容中明确“这版最终逐字稿／标题／简介／这张最终封面”，关闭重开后四者一致、可导出或定位原件。本次源码阅读未找到一个足以独自证明“原页定稿与四项最终资产已统一收口”的端到端入口；不据此断言所有保存能力不存在。不得用“已发布／归档”来代替本轮“最终资产保存完成”。

### 3. 方法规则与机器确认仍需分层

`jincheng-workflow` 已校验作者先拆、教程叙事与重点段；普通 `jc-content-writer` 的素材包／本人访谈确认主要仍由方法和助手执行，不在该 gate 中有独立同名 checkpoint（见其 24—37 行）。必须用真实对话验证：AI 不把自己归纳的观点直接写成“本人回答”，以及模糊认可不会被当成素材包确认。

“我先拆”也不能只验一个作者文本框：原合同还包括独立分析隐藏、三类差异、只让用户批 AI 独有项、批后回读与回复。机器挡写不等于这些业务行为自动做到。

### 4. 详情仍有超出本轮主线的辅助操作

本次观察的 [jincheng-work-detail:198](/Users/mac/code/dashboard/Nova-Content-Hub/workbench/src/renderer/jincheng-work-detail.tsx:198) 仍展示“发布与档案”，199 行含“发布计划”；[stage-actions:33](/Users/mac/code/dashboard/Nova-Content-Hub/workbench/src/renderer/jincheng-stage-actions.tsx:33) 默认方法仍包括 closeout、review。这是当前源码与新红框范围的产品取舍点，不要求删除历史数据，但不能把它们继续放大成主流程或本轮验收门槛。

### 5. 真实宿主、保存与平台状态不靠方法导入推定

最新 [接续记录](/Users/mac/code/dashboard/Nova-Content-Hub/docs/handoffs/2026-10-28-continuation-progress.md:10) 已记四个原包取得及 621 文件核验；不得再写“四包缺失”。同文 24—28 明确方法接入、实际运行及封面设计到生成链仍需分别验收，不能将导入原件写成生成成功。

当前保存关闭链有其他任务正在修复、验证，不把旧探针失败直接判作当前故障，也不把修复说明当作冻结版本通过。本轮只读报告保留这个状态，验收时看实际磁盘、回执和重开结果。

## 六、被新边界替代的历史建议

| 历史建议／说法 | 本轮处理 |
|---|---|
| 以完整“选题—拍摄—发布—12h/7d—复盘”闭环作为交付完成 | 退回历史背景；本轮完成止于最终四项资产保存 |
| 为忠实原导航恢复 X 收藏、私域、运动 | 不做；用户已排除 |
| 新建独立创作知识中心、自动提炼判断入库作为主线 | 不做；可按需读取已有判断，写回候选和全局知识维护另定 |
| 所有内容都必须走教程方法的叙事与重点段门 | 不成立；教程方法须显式选择，普通写稿和已有稿续写各按当前状态 |
| 只导入正文／普通 textarea 就算原创作页迁移 | 仍不成立；但当前已存在原页模型，优先完成贯通和回归，不能重新按旧缺口从零重建 |
| 所有结果都交一个整套 bundle 然后一次采用 | 只保留兼容能力；不能压过反复手改、局部建议和分阶段接续 |
| 原脚本、schema、四个方法包均未取得 | 来源事实已过时；应区分取得、接入、真实运行三个状态 |
| 默认取最新修改文件就是正确续写 | 原代码有这种实现，但与较新 Vault 规则冲突；当前显式来源选择是应保留的修正 |

## 七、最重要的收敛验收场景

下面是本轮建议验收，不声称本次已执行。用隔离原库副本与空白库，分别冻结源码、助手、库身份；不在原库里试写。

1. **一个真实参考到本人观点**：选择一条真实作品，完整读原文／原片；研究与拆解的每个关键判断能回到证据；作者说出自己的角度，AI 候选与本人原话分别保存。没有材料的地方明确未知，不虚构。
2. **作者先拆**：AI 结论先隐藏；作者写完后回读，给出三类差异，只对 AI 独有项要求裁决；作者批注后逐条处理。中途退出后同一 T、同一分析版本继续。
3. **初稿—手改—再建议两轮**：从第一版完整稿生成原页；人改正文并写意见；AI 必须读到真实新版；先产生建议再标回复。人再次改意见时恢复待处理；采纳、拒绝、先改再采纳保留各自事实。
4. **并发与关闭**：输入法未结束、刚写批注、刚采用建议、保存被拒、另一窗口改同一原句等情形下关页／换内容／重开；明确区分“可恢复暂存”和“已写回 HTML”，不丢最后确认的输入、不覆盖外部新版。
5. **已有稿直接续写**：T020 一类旧页与较新工作稿并存时明确选择；“只改这一句”不补造完整调研、叙事或包装，不另建平行正文。T029 一类多参考页保留 refnote、skeleton 和原裁决。
6. **原页包装到封面**：人选标题、改封面字、填简介；从同篇点制作封面，核对冻结文字逐字等于刚选值；生成候选后选最终图，再改选时旧图不被误称最终。重点覆盖第五节第一项接缝。
7. **最终四项重开**：最终逐字稿、标题、简介、封面分别有明确采用版本；关闭应用后重新打开、换助手读取，结果一致且可定位文件／资产。没有发平台也应完成本轮目标，不能要求伪造发布时间。
8. **两助手的同等契约**：Codex、WorkBuddy 分别跑成功提交、等待用户、等待权限及恢复、失败／取消／重试、原任务继续与切换。缺可靠会话标识就说明，不能猜原聊天或以聊天结束代表提交成功。桌面平台运行另按根 AGENTS 留痕，不以本机静态审查覆盖所有平台。

收敛方向是围绕同一篇内容把**证据 → 本人决定 → 当前稿 → 已选包装 → 最终封面**接通；沿用已实现的原页、版本校验和固定助手请求。无需再次扩大为全生命周期管理，也不应再用按钮数量或测试数量替代这几条真人旅程。
