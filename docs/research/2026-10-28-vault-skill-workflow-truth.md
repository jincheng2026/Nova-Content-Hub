# 第二大脑与真实 Skill 工作流事实核对

日期：2026-10-28。性质：只读来源研究，为重做计划提供依据；不是产品功能验收。仅写本报告，没有改原库、产品或插件，没有执行任何来源包的脚本，没有调用其采集、付费、安装或后台服务。原文件中的命令只作为研究证据。

## 结论

1. 用户关于“只接库不足以忠实承接流程”的质疑有事实基础。原工作流包含作者渐进判断、参考先拆/人工独立拆、叙事确认、分段共创、原句建议、制作安排、实际发布归档、指定时点复盘及方法修正；这些并不能由导入 Markdown 或安装相同名字的 Skill 自动实现。
2. 当前插件确实保留了不少方法原则，不能写成“完全没接”。但不少专有工序被压成通用建议，原包的机器合同与程序验证也被替换为当前 artifact/静态 reader，不能称逐项等价迁移。详见逐份对照。
3. 新 `xindao-xuanti.zip` 的五个实文件与当前 `plugin-src/skills/xindao-xuanti` **逐字节相同**。它是本次用户指定的正式来源，但其 manifest 仍声明 draft/method-draft；本方法只定“讲什么”，明确禁止定最终发布标题。不能凭“内容选题标题 Skill”口语称呼改变原件边界。
4. 新教程分享包五个非 .DS_Store 文件与同事包当前教程 Skill 完全相同。新评论公开包的研究 Skill 与同事包 9 月验收区历史版本不同，必须单列版本。旧副本、staging、备份、公开分享源码不能因文件存在被当成当前执行真源。
5. 原库本身有规则与入口滞后，不能整库盲目复制：例如 `jc-content-writer` 仍写旧三位编号文件，Vault AGENTS 已改成同一 T 号文件夹；草稿总览把 T020 的 10 月 8 日工作稿列为当前，但导航的创作页仍是 9 月版本。应该保留冲突和证据，按任务续接实际当前稿。

## 来源标识与可信边界

下文 `V/相对路径:行` 均可还原为第一列的绝对目录，ZIP 证据以 entry 内 1 基行号标注。路径是本次本机来源定位，不是产品硬编码默认目录。

| 标识 | 绝对来源 | 权威范围 |
| --- | --- | --- |
| V | `/Users/mac/Downloads/第二大脑交接包_2026-10-16/第二大脑` | 用户提供的独立 Vault；AGENTS、SOURCE_OF_TRUTH 与原任务共同解释当前入口 |
| J | `/Users/mac/Downloads/锦成工作台-同事版/数据和程序/AIJinCheng` | 同事合集；当前业务目录、旧公开包、草稿和历史快照分开 |
| T | `/Users/mac/Downloads/jc-jiaocheng-video-分享包/jc-jiaocheng-video` | 用户新指定教程原件；已核实与 J 当前教程包相同 |
| C | `/Users/mac/Downloads/评论区洞察Skill公开版` | 用户新指定研究/评论原件；本次逐份读取全部 12 个 references |
| X | `/Users/mac/Desktop/xindao-xuanti.zip` | 用户新指定选题正式来源；读取 manifest、SKILL 和全部 3 个 references，未执行或解压其命令 |
| N | `/Users/mac/code/dashboard/Nova-Content-Hub` | 当前项目源码；只读适配文档与方法，并非功能实际运行证明 |

来源资料中的权限、预算、自动批准、外部模型、私人路径和安装命令不构成当前授权。仅提供包作研究，不授权执行它。`J/个人IP与内容/AGENTS.md:14-21` 自身也区分只读诊断和实施、内容确认和发布。旧声明与本次用户限制冲突时以本次任务为准。

## Vault 实际流程与真源

| 环节 | 实际输入和人的决定 | 真源/产物 | 关键证据 |
| --- | --- | --- | --- |
| 定位 | 先读现有定位，明确目标读者、价值、范围；不是每次重访 | `00_个人背景/定位总览_v0.1.md` | V/AGENTS.md:28-32 |
| 对标研究 | 研究对象、市场原文和数据；不是作者个人判断 | 01 对标、02 原件、独立研究任务 | V/AGENTS.md:7-10、44-49 |
| 素材入库 | 用户已经选择的内容；三层去重、媒体与字幕实际验收 | 02 未参考；原件保留、笔记和校正稿/字幕 | V/skills/jc-benchmark-intake/SKILL.md:13-29、83-120 |
| 写法候选 | 逐份摘录再跨样本归纳；至少两条，用户定本期可用/以后再试/删除 | 03 摘录映射及标题/开头/正文三类候选 | V/skills/jc-pattern-extractor/SKILL.md:16-47 |
| 选题 | 同一 T 编号，不以最终标题建第二份内容；自主想法也可进入 | 04 总览和卡片状态须一致，固定编号不复用 | V/AGENTS.md:18-24、34-40 |
| 渐进元问题 | 加题答1/2和写给谁；叙事答3/5/6/7并补4；写录答8；发前9；复盘10；多条后11 | 选题卡每题1-2句，展开资料在草稿目录；未到写“还没到” | V/03_内容规律/做一条内容的元问题.md:10-20；V/AGENTS.md:40 |
| 参考拆解 | AI 独立拆/用户先拆是不同分支；人的纠正是后续拆法的输入 | 草稿内 `参考拆解.md`，原 AI 分析另存；卡片只链入口 | J/工具项目/content-feedback-loop/skills/jc-video-analysis/SKILL.md:28-36、72-80 |
| 教程/口播创作 | 用户显式调用教程 Skill；先确认叙事，再分段稿；真实作者判断、制作条件需本人决定 | 一条 T 草稿文件夹：工作稿、改稿日志、定稿、包装、录制安排 | V/AGENTS.md:32；T/SKILL.md:15-31、93-161 |
| 创作页协作 | AI读回手改/批注，提逐句理由；采纳由人；读写需版本防覆盖 | 同 T 的当前页面/状态，一条内容一个日常入口 | J/工具项目/内容工作台/creation-page/SKILL.md:49-54；历史快照另记，V/AGENTS.md:56-60 |
| 人工发布 | 已锁稿、已录、已保存均不等于已发布 | 实际平台发布事实 | J/个人IP与内容/AGENTS.md:39-50；V/README.md:82-85 |
| 发布收口 | 明确请求；识别真实发布版本，归档、平台发现、12h/7d观察；后台能力另验 | 视频项目 `内容.md`、`.system/manifest.json`、snapshots | J/工具项目/content-feedback-loop/skills/jc-publish-closeout/SKILL.md:114-138、201-253 |
| 复盘与学习 | 先给本人看；用同题/同类比例对照，最多3个下一条动作候选，人决定 | 正式视频项目 `内容.md` 最终复盘；不得手改程序区 | V/skills/jc-media-review/SKILL.md:18-30、47-77 |

`03_内容规律/` 的市场候选与锦成知识库个人判断是不同真源。元问题是作者确认清单，仍明确“未经实际创作检验”，不应写成验证成熟规则（V/03_内容规律/做一条内容的元问题.md:3-6）。教程规则顺序：当前真实材料与本轮确认 → 教程硬规则 → C/T/E个人判断参考 → 市场写法候选（T/SKILL.md:69）。

一条内容的发布前材料归 T 文件夹，录屏原件例外留固定 `录屏素材/`；发布后草稿文件夹挪已做并同步引用。最终稿实际采用的素材才由未参考变已参考，进选题库/规律库不算用过（V/AGENTS.md:20-26、46-47）。标题、封面、简介、教程是同一对象的独立资产，不能因为切环节重建内容；包装无权改逐字稿（J/个人IP与内容/AGENTS.md:32-60）。

## 真实 T 篇证明：流程不是统一流水线状态

| 案例 | 读到的真实材料 | 对重建计划的含义 |
| --- | --- | --- |
| T046 Human 3.0 | V/05_内容草稿/T046_用AI做DanKoe的Human3.0人生模型/参考拆解.md:3-4 记录人和AI互不看各拆；15-29分“只有本人/只有AI”；32-34纠正逐句套元问题；40-52保留真实分歧；70-90保留提示词选择；105记录第二条参考时吸收“取舍也是判断”的纠正 | 不只显示参考库，要保留独立分析不提前泄题、回读人写内容、差异批注、纠正来源与后续应用。每段观众问题与整条作者元问题不能混为一个表 |
| T048 vibe账号弊端 | V/04_选题库/口播观点/已做/T048_✅vibe知识大赏这类号的三个弊端.md:5 是草稿/已录待发；33-63是渐进元问题，含“本人没单独确认”“待本人答”；V/05_内容草稿/T048_vibe知识大赏这类号的三个弊端/视频框架_2026-10-14.md:3-15保留框架确认、AI概括与口述来源；逐字稿第三版改稿标记文件:37-55有原句改动、理由和数字待核实 | 已做目录/✅不等于已发布；事实核验、作者强判断、AI归纳、尚未单独确认分别存；不能由页面摘要填平 |
| T020 AI杠杆 | V/05_内容草稿/00_草稿总览.md:11明确10-08重口述与最新工作稿，创作页标“9-28那版”；其10-08视频框架:123-137保留时间线/第一桶金口径冲突与后续本人澄清。V/SOURCE_OF_TRUTH.md:19仍以旧创作页作导航 | 导航只能定位，不能替代读取任务正文。续写要检查当前稿、最新决定和日志，不能凭旧HTML/修改时间定真源 |
| T044/T047/T030 | V/05_内容草稿/00_草稿总览.md:29-31分别记真实发布、未做收口/未建档 | 发布事实与归档成功是独立事实，不能“缺档案=未发布”，也不能“已发=收口完成” |

V/README.md:60 指向的 `07_如何做自媒体/2026-10-12_创作流程复盘/创作流程复盘.md` 在独立 V 包内未找到，未据这个缺失链接编造内容。J另有已确认流程模板：`个人IP与内容/skills/jc-flowchart/references/content-loop-template.md:7-18`，保留“发布前预测→发布后验证→定位问题”三个节点，且 :24-33 明确人/AI与Skill/工作台/平台四种责任，工作台是承载不进内容主线。它是9月确认模板，不能据此覆盖10月更具体规则或自动承诺当前产品有预测/监控。

## 核心 Skill 的触发、停等、产物与调用链

以下以所读当前真源为主；旧版本冲突见下一节。对应工作台环节是应承载的业务职责，不表示现已实现。

| Skill | 触发与前置 | 人的确认/停止边界 | 原件产物/schema与调用链 | 工作台环节 |
| --- | --- | --- | --- | --- |
| jc-benchmark-intake | 用户已选链接、复制信息、媒体；需稳定身份可去重 | 无身份才追问；损坏/转写/字幕校验失败停staging；全库补字幕需另明确批准 | 笔记信息.md、原媒体、校正版md+srt、入库检查报告；调用jc-zhuanxie，strict校验后正式入库（V原件:10-29、95-139） | 素材接入/质量状态 |
| jc-pattern-extractor | 已入库素材，提炼/增量更新 | 已确认规律不覆盖；候选状态由用户定 | `_规律提取汇总.md`＋标题/开头/正文三文件；原件叫六字段但列七项，来源映射不能丢（V:18、31-39） | 知识候选与证据 |
| jc-topic-generator | 已定位、从已有素材批量出选题 | 旧首次门槛≥10素材，增量可少给；只新增，不重排旧题 | 5-10候选T卡＋总览＋生成批次已读清单；只“准备讲什么”，不优化标题（V:28-46、48-92） | 批量素材驱动选题 |
| xindao-xuanti | 一句话/笔记/已验收调研/雷达/已有内容，以具体事实开题 | 完全开不了题只问一项；菜单默认不停等；用户选择/合并/新想法确认 | 最多4层递进卡，七字段；定题交接六字段；研究类候选，工作台验收后建内容（X候选菜单:5-15、37-77） | 资料驱动定题；不是最终标题 |
| jc-video-analysis | 可读原片/链接；拆视频、人工先拆、批量拆 | 人先拆时AI不展示，回读后只重点批AI独有，等批再响应；不代定叙事 | 一句话价值、逐段八问+三补充、首中尾、整条、下一步；两份独立分析＋参考拆解汇总；需转写接jc-zhuanxie，写稿交教程/对应Skill（J当前:22-60、72-93） | 参考拆解/人工对照 |
| jc-jiaocheng-video | **仅用户显式调用**；用户说明教程或口播；先复用分析 | 必须明确叙事确认才完整稿；不把方向性认可当确认；锁稿不再发散；评论必须本轮另明确要求 | 工作稿＋每轮改稿日志＋叙事切换快照＋唯一定稿.md；教程画面表；独立包装状态；feedback.md；jc-video-analysis→本方法→创作页/封面文字→发布前评审（T:17-31、81-91、116-161、163-220） | 叙事/写稿/录制/反馈 |
| jc-content-writer | 已有选题，素材包→本人访谈→初稿→手改→最终稿 | 一次一问3-5题；素材包确认和初稿修改真实停等；手改唯一基准 | 素材包、本人回答、AI初稿、最终发布稿；旧命名与现AGENTS不一致；锁稿后移动实际使用素材并更新引用；发布收口交closeout（V:23-86） | 另一条材料访谈写稿方法，不与教程规则混同 |
| jc-cover-copy | 定稿/SRT、主标题、核心判断、禁词、历史台账 | 人确认后才设计交接；指定字逐字保留 | 三角度候选，主方案/依据/备选/锁定文字/强调/禁误导；设计交jc-cover-design，发布后真值入内容.md（J原件:12-73） | 封面文字，与生图区分 |
| jc-media-research | 搜索方向、账号、单视频、已有数据、多原稿、共同写稿等，先路由最小任务 | 新原件默认后台选样和直接完整交付；只有关键输入/超预算/失败三种追问；**共同写稿不强制叙事确认** | schema_version2；content/comments/sources/analysis/questions/baseline/selection；独立任务raw/normalized/transcript/reports/feedback；独立评论报告调用comment，原件render/qa入口（C研究SKILL:12-113） | 研究/比较/演化/评论机会 |
| jc-comment-visualize | 至少具体视频或已有评论；不负责找选题/写口播；仅抖音端点验证 | 对象分析独立代理隔离、冻结findings后主会话做本人建议；无本人材料只一般建议；线下口径不明要核对 | 报告页L4、人群页L3、快版md卡；schema2 comments/topics/sources/findings/recommendations；hash冻结、统一生成器、publish_check；采集复用研究账本（C评论SKILL:8、31-46、98-156、158-178） | 评论深读报告/人群/单条卡 |
| jc-publish-closeout | 人工发布后用户显式归档/收口 | 不自动发布、不改历史包装；多候选才一次澄清；程序区hash冲突停 | 一个video_id目录、内容.md、校正字幕/封面、manifest、snapshots、12h/7d任务、知识副本/台账；自动建档与手动收口并存（J原件:3-64、79-138、201-267） | 真实发布归档/监控，须另外验证能力 |
| jc-media-review | 满7天且后台12h/7d齐，用户请求复盘 | 先候选给人看，确认后专用事务写；无对照不写原因；缺时点不先写 | 事实/会议/观察/原因对照/未知/下一条六块，最多3动作候选；write-review→verify-project hash（V原件:14-30、47-89） | 复盘和下一条决策 |
| jc-gongzuotai-write | 已取得J中creation-page的SKILL和源实现，另有两份历史md；第一版完整稿、口播叙事确认后，或回读页面意见 | 本人版锁、删条目锁、CAS before；只建议不替改；内容确认后推进 | 单文件jc-doc页面；实际存在schema/creation-page.md、creation_doc.py、brain_page.py、build_page.py、server/brain_save.py、template/app.js，见下表 | 创作协作方法及源实现可供对照；未据此取得或验证原机器installed brain-save/current，也不声称完整原Skill安装包 |

创作页来源补核（2026-10-28）：此前“仅有历史快照、schema和脚本未取得”的结论不准确。可用的来源实现位于 **J/工具项目/内容工作台/creation-page/**；以下文件均已只读确认存在并读取相应内容，未导入或执行它们。

| 来源文件 | 证据行号与实际内容 |
| --- | --- |
| SKILL.md（467行） | :2-3声明name=jc-gongzuotai-write及触发；:26-45定义jc-doc、mine/baseline、批注/建议/回复、保存状态和历史；:49-54规定唯一真源、本人稿锁、统一脚本；:74-75规定生成和写入锁 |
| schema/creation-page.md（304行） | :1-5定义单文件jc-doc与共享逐格规则；:169起字段责任；:231-232重新生成保护旧字段/拒绝错内容；:246改本人字段需明确批准；:256-304定义保存服务接口、变更载荷、日志和备份 |
| creation_doc.py（298行） | :1-9声明共用业务规则，build/brain_page共用并引用保存服务；:215起底稿diff，:266起显式根目录定位 |
| brain_page.py（487行） | :1-8明确AI读回/建议/改格子、共享锁与原子写法，默认拒写本人格子；:124起render_read，:255回复，:273建议，:352-362带before的受控写入 |
| build_page.py（739行） | :1-13声明单文件生成、模板/kit/app内联、输入校验与重生成保留；:54输入validate，:382 assemble，:569 check_page，:635 build |
| server/brain_save.py（991行） | :1-19声明回环保存服务、group事务、重复page_id返回409；:173锁、:182备份、:189提交、:259-300逐格及分组判断、:339-381变更合并/冲突重试 |
| template/app.js（2193行） | :1-10声明界面主干/枝干、由jc-doc渲染、交kit保存、group原子操作和向后兼容；:85读取jc-doc，:834-838建议替换，:1986-2003改动历史展示 |

**源实现、历史技能文本与原机器安装状态分开记录。** 此处的源代码可用于方法与数据合同对照，不代表已在本机运行或通过功能验收。源SKILL.md:81仍指原机器 `/Users/hejincheng/Library/Application Support/JinCheng/brain-save/current`；:91记代码发布需复制版本并切换current。此次没有取得或验证该原机器installed current的实际负载、VERSION及运行状态，也不因上述源文件齐在就声称取得完整原 `jc-gongzuotai-write` 安装包。

历史文本另有两份快照；具体证据为J/个人IP与内容/内容数据统计/教程视频迭代/2026-10-04_写稿诊断/证据/Skill历史版本/jc-gongzuotai-write/2026-09-30T0803_1e8d3bef2b.md:5-15、69-70、113-130、151-192、241-329、408-441。N/plugin-src/resources/production-methods-provenance.md:59-63仍把来源描述成仅有历史快照，这是**当前登记过时**，本报告只纠正研究事实，未修改该产品/插件文件。使用 `nova-workbench-writing-method` 适配名称并不能替代对可用源实现的逐项比较。

## 新 xindao-xuanti 逐文件核对

ZIP只有5实文件；不依赖脚本、不采集平台、不采评论、不付费。method自身保留工作台模式和直接对话模式（X/SKILL.md:12-18），当前executor外围是否仍允许直接对话应另外验收，文件一致不证明路由一致。

| ZIP entry | 深读后应保留的实质 | 当前比对 |
| --- | --- | --- |
| xindao-xuanti/manifest.json | 0.1.0、draft/method-draft、light；read-workbench-context/chat-delivery；纯文本信任边界；发布文本不带第三方方法名和内部术语（:3-18） | 完全相同 |
| xindao-xuanti/SKILL.md | research类选题；无具体资料不开；不承诺流量；菜单一屏；多数不停等；选定后止于交接（:14-57） | 完全相同 |
| references/material-intake.md | 八项素材清单：兑现、原表达、具体细节、大主题、谁看、事实分层、公开边界、已否决；不把外部经历当本人事实（:14-34） | 完全相同 |
| references/topic-expansion.md | 从原说法每次只改一处，3-4层真实扩受众；数字/成绩/身份/反差等；问底气但不编；松限定词；承诺可兑现/人群对口/评论偏题/空话四检（:14-73） | 完全相同 |
| references/candidate-menu.md | 七字段卡，第一层原样；最多4且不凑；推荐1、最多2问；用户选题与六字段交接；未选保留；不写开头/结构/最终标题/封面（:5-77） | 完全相同 |

ZIP内部 `../../plugin-src/resources/...` 是工作区语境链接，独立安装时不能仅因文本相同就断言链接能解析。当前构建如何改写/打包由父任务另核。此处只证明源文件一致。

## 新教程分享包逐份对照：被压缩的不是文件数

T包含SKILL、3 references、agents/openai.yaml；全部与J当前目录逐字节一致。N业务Skill只有17行入口和14行method，另链接共享writing/review/packaging/feedback。以下比较**同时读了共享文档**，不是只比SKILL行数。

| 原件 | 原件实质 | 当前N落点和差异 |
| --- | --- | --- |
| T/SKILL.md:15-31、93-126 | 明确叙事确认硬门；先开头/关键段/结尾；每轮日志和唯一干净定稿；用户调用时说明教程/口播 | N/jc-jiaocheng-video/references/method.md:3、6允许从context判断类型、已明方向/直接稿不重复确认；writing-method.md:22、36允许直接全文。这是**改变方法门槛**，非仅宿主适配 |
| T/SKILL.md:57-69 | 每阶段精确读取C/T/E索引，终审不新加载；个人判断低于当前材料和硬规则，高于市场候选 | 当前保留“按阶段、适用已采纳知识”，未保留C/T/E具体问题体系及其映射。移除私人编号合理，但应把对应业务问题完整抽象出来而不是只留“读相关判断” |
| T/SKILL.md:102-116 | 需求集合体、购买理由、C/B线、意识五阶段和四股力、收获、证明、不讲、作者判断、制作条件；AI先给答案候选；前两项生死线 | writing-method.md:15-22保留场景/判断/证据/条件；缺购买理由、业务线与需求阶段完整工序。是方法覆盖减少，不能称完整保真 |
| T/SKILL.md:83-91 | 优先复用参考拆解；评论仅本轮明确授权；运营稿**首回复来源表**；引号程序搜逐字稿；有创作页不再另做审稿页 | 当前保留来源分类和引号核对，但“首回复来源表”变成writing-method.md:9后台标清；交付可见性变化。当前评论权限收紧符合范围约束，不应恢复隐式抓取 |
| T/references/锦成的口气.md:7-26、28-79 | 按类型读1-2条真实发布稿；已改前/后对比，多种书面腔/开头/作者判断纠正；逐句对照；样本不是禁词表 | 当前writing-method.md:7只读用户指定可用同类作品/偏好，未携带这份真实样本和对照机制。不能未经授权复制作者故事，但应提供用户自己样本与改稿证据入口，才能等价承接个性化 |
| T/references/rafael-model-v1.md:8-90 | 价值翻译；三载体、三收获、L1/2/3深度；默认L2；正片交付与资料承接；五检查 | 共享写稿保留价值翻译、主要收获、真实任务、深度随承诺；未显式保留载体/深度选择完整分支。不能把所有教程改成长手册或一条工作流 |
| T/references/evaluation.md:15-47 | 五门：收获开头、真实口播、事实证据、承诺资产、平台承接；未实测标注；最多3必改；通过/改后通过/暂缓 | 当前review-method.md:21-31基本保留轻审内核，结论用当前范围表达；旧平台经验改当前事实可接受，但作者本人的发布边界不能因“旧政策”一概去掉 |
| T/references/evaluation.md:49-97；T/SKILL.md:163-220 | 反馈事件及时入库；原话/改动/归纳/采用/结果；更新判断对照原文、跨内容验证；新增/改范围要本人决定 | feedback-method.md保留候选与证据、两条独立内容、人工采用；把原反馈写库改成artifact候选是权限适配，需保证实际回读和下条消费，不应只显示知识条目数 |
| T/agents/openai.yaml | 助手展示/提示配置 | 当前未保留原配置；不涉及业务算法，但需区分“功能安装”与“原包逐份镜像” |

T口气参考末行仍写“同意替换前不进正在用Skill”，而V/SOURCE_OF_TRUTH.md:11已记录10月4日同意换入。单文件注释也会滞后，要由真实任务状态解释；不能机械据末行宣布未授权。

## 新评论公开包：研究 Skill 逐份深比

C/jc-media-research：SKILL113行、7 references（合计57,963字节）、15脚本、10资产、9测试文件（含fixture）、evals和agents。原包结构是**语义方法+数据schema+确定计算/验证+报告模板+渲染验收**，不是一段研究提示词。

| 来源文件 | 具体机制 | 当前适配保留/丢失/改变 |
| --- | --- | --- |
| SKILL.md:12-22、48-61、86-113 | 路由最小任务；直接完成；三种追问；研究与评论共享数据；报告和机器/视觉验证 | 研究method与shared方法保留范围、语义、缺口、静态交付；无同等原schema/生成器审计链，不能据“已读方法”宣称完整等价 |
| references/routes-and-gates.md:5-16、38-68 | 8输入路由；仅“完整研究”串链；候选不等于强制停顿；已完成不需人再次回复 | 当前路由受workflow冻结，需保留“交付前不迫用户再选样”；原120请求/$1自动批准不得移植。研究共同写稿的直接交付与教程包叙事硬确认本来冲突，应按方法名明确分流而非隐式合并 |
| references/search-and-selection.md:29-51、89-103 | 抖音AI教程100-20000粉、≥1000赞、direct；90天优先；稳定身份+批次分组；排目标、近90天/满7天最新30条、至少10有效；1高+2中位普通、最多2同题他人 | 当前jc-method:5明确只在冻结请求采用原阈值；research-method:47允许自定义窗，不保留原算法默认/完整缺失原因。赛道阈值通用化合理，但若声称复现原基线须增加可复算政策与记录 |
| references/data-contract.md:15-21、25-128、177-217 | schema2作品/评论/回复覆盖/来源、questions回答判定、analysis演化、写稿revision/locked；旧字段未知不填0 | 当前artifact换schema，研究正文保留原则；原专用字段需显式映射，不可把text兜底等同机器检查；question unresolved需完整转写及回复覆盖条件并未以原结构继承 |
| references/evidence-analysis.md:14-22、50-95、147-177 | 三层转写/manifest corrected_validated/text-vs-timing；三层定位；六维对照；演化拆合调序；回复不全强制unknown；负面“视频没讲”需全稿 | 当前保留大部分语义原则和八问拆法；原validate-analysis精确引用、时间能力/完整覆盖验证无等价随包程序；不能粗ASR冒充精确时间 |
| references/account-report.md:5-18、22-52 | 内容表达/定位/方向/需求/借鉴/商业证据；3-6图组；n与分母可见；account_analysis卡片及own_citations；主报告/评论报告同输入摘要、审计hash | 当前research/report方法保留身份/价值/内容与证据建议；账号数据驱动图组、same-input审计、评论回指及交互合同未完整迁移 |
| references/writing-and-feedback.md:15-55、72-118 | 核心本人判断+真实经历足够就完整稿；自动选当前最值得一题；不确认提纲；每段references/borrowed_logic/own_facts/expression_change；revision409/锁段/history/语义待复核 | 当前共享方法吸收部分，且与原教程确认门槛折中。不能称这是教程原方法本身。当前CAS/paragraph能力另按真实代码验收，不把新字段存在当原页实现 |
| references/reporting-and-security.md:14-63、84-118、137-155 | 离线自包含ECharts、报告类型对应图；previewPNG、分屏亮暗/手机检查；输入/来源隐私扫描；账本/plan hash | N/report-method.md改静态reader，允许表/图像转换；这是明确交付形式改变。可以不复制原脚本，但必须保留数据/图/明细一致的替代检查，截图和视觉验收不能变成“HTML存在” |
| scripts、assets、tests、evals、agents | 详见文件清单；静态读代码/测试名证明原包落实了某些机器门槛，未执行 | 当前不携带原程序是已声明边界；本报告未跑原脚本，不声称其在本机可运行或测试通过 |

原公开包内部还有应保留的冲突：研究 reporting-and-security.md:19-21/54-59写梯形/多边形漏斗；同包评论 chart-choice.md:19、30-41禁止用失真形状编码数值。重做应明确选择真实比例的长度/位置，不把所有原视觉规则同时当无冲突标准。

## 新评论公开包：评论 Skill 逐份深比

C/jc-comment-visualize：SKILL207行、5 references（31,036字节）、4脚本、4资产、1测试。当前N为16行入口+13行method及共享研究/报告/反馈。

| 来源文件 | 原件实质 | 当前适配差异 |
| --- | --- | --- |
| SKILL.md:31-75 | 评论分页按平台总数，≥2回复楼必须抓、平台与实抓对账；≥35字非刷屏全读；本人账号必须内容↔反应、既有调研对表、uid跨片分层；逐份线下材料口径和覆盖 | 当前保留回复覆盖/实抓对账/长评语义，但没有≥2必抓机制、本人账号三层工序与跟进名单合同；35字改本轮口径可选。范围授权优先，不能为补流程擅采 |
| SKILL.md:77-123 | **对象分析独立子代理**只知对象数据与方法；多材料每份全读并合成；findings冻结哈希；主会话才加本人建议，再验证未变 | 当前method:3写先对象后个人，但没有信息隔离/独立代理和冻结哈希机制。这是核心分析防污染保障缺失，不能靠页面分两章替代 |
| SKILL.md:125-178 | 完整报告L4、人群L3、快卡三产物；快卡有钩子承接证据、用户判断；人群跨材料全读；用户反馈/7天真实结果回到卡 | 当前快卡内容大致保留；人群页独立输入/总表同步/全量深读与L3/L4门禁未等价移植，输出被收为泛report/analysis候选 |
| references/report-contract.md:7-27、29-40 | schema2 comments/topics/sources/findings/recommendations；个人建议必须own_material；引文逐字；frozen_findings_sha256；每次按input重渲染防HTML漂移 | 当前保留ID与原话原则，没有原冻结/生成器审计合同；artifact hash不是对象分析冻结hash，作用不同 |
| references/labeling.md:7-56 | 长短分流、短评有实质也深读、规则可重算、每主题前三赞核对、旧计数重算、证据标签 | 当前保留全读实质长评、复算分母；删去具体误分纠错工序、历史统计强制复核、证据卡字段完整结构。需抽象为质量门，不能只留“读评论” |
| references/expression.md:5-52 | 保留连贯解释、原话和其他解释；不用隐秘心理/购买推断/口号；风格检查不改真实引文 | 当前大部分表达原则保留，但无独立完整参考；应保证真实交付可读而非只塞标签 |
| references/page-spec.md:7-22、62-101 | 范围/主发现/单行导航；条数与赞数分单位；关键原话直显；presentation不改冻结数据；thread必须核根/回复/身份；实际桌面/窄屏看页 | 静态reader替换样式/交互是宿主变化，但关键原文就近可见、范围、分母、建议回指应完整保留；当前无原完整展示/筛选合同 |
| references/chart-choice.md:5-9、15-41、57-80 | 信息句→关系→选图；排序横条、零基线、图自足、其他灰、数据与示意分开；遮标题/落点/比例/灰度验收；不把定性强中弱编数字 | 当前仅保留比较条形/时间折线/分母等摘要，未完整保留12硬规则与人工五测。无需搬品牌/历史案例，但应保留方法本身 |
| scripts/render_report.py:84-155；tests/test_report.py:20-104 | 校验错引文、重复cid、未复核评论支撑、个人建议缺本人源、冻结变化、HTML与input漂移、恶意文本、强调不改原字 | 原件具有可检查的确定机制；当前原则摘要不等于拥有这些失败用例。未运行原测试，不能声称通过 |
| assets/report-template.html、reading.css、report.js、example-report.html | 模板、阅读排版、筛选、合成预览；真实数据必须任务外置 | 当前不复制原模板可接受，但不得把合成示例或模板当真实报告 |

## 应恢复的方法与应保留的适配边界

- 恢复到计划中：按方法明确触发与产物；作者渐进问题；参考独立拆/读回差异；教程明确叙事确认；作者样本与改稿证据；评论对象分析隔离和冻结；数据schema到artifact逐字段映射；基线政策、负面证据/回复覆盖门；报告/图/原文明细一致验证；发布、归档、监控、学习各自真实状态。
- 合理适配，不能一概“恢复原包”：默认私人HOME、磁盘扫描、原后台服务/定时器、任意文件搬移、原自动付费批准、原API凭据、特定赛道全局阈值、固定样本数量、未经授权作者私人案例全文、旧平台条款写死。当前冻结权限、受控CAS、回执与人工采用继续保留。
- 需要显式产品选择：jc-media-research默认一次完整稿与jc-jiaocheng-video明确叙事确认冲突；原素材清理证据与新研究始终保留三层转写冲突；旧素材包文件编号与现T文件夹冲突。不能由一个“通用写稿method”悄悄裁掉其中一条方法。
- 不在本次授权执行：任何原包命令、外部采集、付费、自启安装、平台发布、私有库改写、skill自动改写；jc-chendian已停用，jc-broll-judge已停用，jc-video-broll仍草稿；dbskill不接入。未取得完整包的jc-kepu-video、jc-review-page、jc-cover-design、jc-zhuanxie等仅是引用，不能报“已经安装/支持”。

N/plugin-src/resources/production-methods-provenance.md:23-35、44、63-69已说明这不是镜像、私有样本未随包、算法默认被改、静态校验不证明质量一致。报告应承认这个边界；“14个方法/21个Skill已打包”只证明发现和依赖，不证明真实流程覆盖。

## 验证边界

本次验证了来源存在、文本、ZIP条目、哈希、当前适配内容和真实案例文档；没有运行来源包脚本、网页服务、联网采集、产品UI或助手完整任务。没有把测试文件存在写成测试通过。没有改动任何来源内容，也没有commit。下面的程序化清单记录按内容hash去重的版本；hash用于识别，不决定哪份业务更权威。

## 其他真实 jc 名称：不把“出现过”当本期要接入

下表来源除注明外均为 J 的 `个人IP与内容/内容创作/成稿/2026-08-11-十个jc-Skill分享教程/public-src/<name>/SKILL.md`。这是公开分享源码，业务范围通常不属于本次内容闭环。已读触发、流程、停止与输出定义，仅做清点。

| Skill | 触发/前置和人工边界 | 输出/调用链 | 本期工作台关系 |
| --- | --- | --- | --- |
| jc-clarifier | 模糊需求/提示词；只澄清不执行；镜像确认后充分性检查，非Goal不擅出Goal合同（:3、34-73） | BROK执行提示词/问题版/决策prompt；references路由→澄清→输出合同 | 可选前置工具，不是所有内容必须填的PRD |
| jc-cold-shower | 显式泼冷水，复述核心押注、隐含假设，按场景反审（:24-124） | 冷水结论、失败点、假设、危险自信、必须验证、修正版下一步（:124-162） | 可选判断审查，不替代发布前轻审 |
| jc-synthesis-research | 综合调研/Deep Research，多来源；定位式/议题式/生成式（:3、20-69） | 结论、真问题、电梯致辞、理解、争议、判断、下一步、References（:106-134） | 泛研究；不等于社媒采集 |
| jc-chendian | 保存会话已确认正式资产；不收草稿/未确认，不重复建对象（:3、14-61） | 唯一待发布内容包、脚本回执，供closeout读取（:63-129） | **J/个人IP与内容/AGENTS.md:36、78明示9/30停用**，不可因公开包存在复活 |
| jc-feishuplan | 记录/加入飞书；任务与非任务分类；一次确认；明确加入且无歧义即确认（:3、31-47） | Base schema→字段映射→去重→dry-run→写入→回读；可能按授权顺延 | 私人计划工具，非内容必经链，不自动连外部Base |
| jc-group-digest | 群日报站；真实消息、策略拍板、审美选择、上线前脱敏/边界确认（:3、27-85） | Cloudflare站、macOS launchd日更、运维说明；wechat-cli→规则试3天→建站→部署 | 独立项目，非本期内容工作台职责 |
| jc-wechatcli | 本地微信只读查询；3命令找不到就停；init涉及sudo/内存/重签需人确认（:3、70-108） | 聊天/联系人/群/收藏/统计/导出；禁wx替代 | 引用能力不授权扫描私人微信 |
| jc-handoff | 交接、打包上下文；默认提取确认，可显式quick跳过（:22-38、83-123） | 证据交接文档+新会话启动包；chat/file模式 | 会话续接工具，非另建正式内容对象 |
| jc-meta-skill | 创建/改善Skill、架构提示、评估治理公开；排除普通文档（:3-7、14-104） | 方法结构、验证和发布合同，references按阶段读 | Skill治理工具；用户采用知识不自动授权改Skill |
| jc-flowchart | 流程/总控图；默认飞书画板或本地Mermaid；只排版不改逻辑；实际渲染验收 | J/个人IP与内容/skills/jc-flowchart/SKILL.md:18-75；内容闭环模板→本地渲染→画板写入/导出验收 | 讲清责任和闭环；飞书写入不是本研究授权 |
| jc-weekly-report | 更新周报；一次问卷一次确认；先读上一周真实报告，确认后写飞书回读 | J/飞书计划/skills/jc-weekly-report/SKILL.md:3-29、33-145；证据→初稿/审核→确认→写回 | 独立业务周报，不应嵌入单内容产线 |
| jc-broll-judge | 逐句判画面，原锁稿优先；不生图；歧义两案等人 | V/skills/jc-broll-judge/SKILL.md:3、10-60；分镜标注md、AIGC比例/隐喻/待拍板 | **V/SOURCE_OF_TRUTH.md:12记9/30同意停用** |
| jc-video-broll | 已定稿→画面计划→图/首帧→视频→自检→生成记账；人的比喻/首帧确认、预算失败止线 | J/个人IP与内容/调研报告库/2026-09-29_AIGC-B-roll生产方案/原始证据/第三轮_方案/草稿/jc-video-broll/SKILL.md:3-18、40-75、100-115；md计划、csv生成记录、剪辑镜头表→Flova/Seedance | metadata 1.0.0-draft；V导航:12明确未替换草稿，不进入本期 |
| jc-shouhui-ppt | 手绘水彩/整页AI图PPT或拆风格；页面清单确认、1页样张确认后批量；逐张文字白名单/错字/圈重点/风格/裁切质检 | J/个人IP与内容/第二大脑/交付物/2026-09-11_PPT参考风格/work/backups/2026-09-11_jc-shouhui-ppt_120827/jc-shouhui-ppt/SKILL.md:3、28-47、61-113；内容→版式/风格锁→原生生图或Seedream→build_pptx，prompts/slides/pptx，讲稿可选 | 只取得备份；方法已读，但不据此宣称当前安装或本期支持 |

`jc-gongzuotai-write` 的源SKILL位于目录名为 `creation-page` 的源实现中，前次按 `jc-*` 目录名前缀清点时漏掉，现已补登记；它另外还有2份历史md。`jc-jiaocheng-video`另有10份历史md。可用源码、历史文本、完整安装包和原机器installed状态分别记录。

## 按内容 SHA256 去重的同事包 jc SKILL.md 清单（目录前缀扫描与创作页补登记）

原扫描遍历整个J树、排除node_modules与.git，以父目录名 `jc-*` 收集，包含备份、staging和公开副本，不以目录mtime挑当前；原范围为24个名称、29个内容版本、30份SKILL.md。补入目录名不带jc前缀的creation-page/SKILL.md后，下表共 **25** 个名称、**30** 个不同“名称+SKILL内容hash”版本、**31** 份SKILL.md；此统计明确保留原目录筛选口径，不宣称已按所有文件frontmatter重新全量清点。这是内容去重，不声称所有目录的references也一致。V/skills的六个jc原件与J当前第二大脑/skills对应SKILL hash相同。新增C/jc-comment-visualize另计，C/jc-media-research新hash另计。

| 名称 | SHA256前12位 | 副本数 | J内来源（首份；不同副本保留分类） |
| --- | --- | --- | --- |
| jc-benchmark-intake | `0c1f5ee02a4d` | 1 | `个人IP与内容/第二大脑/skills/jc-benchmark-intake/SKILL.md` |
| jc-broll-judge | `66ec231a4d82` | 1 | `个人IP与内容/第二大脑/skills/jc-broll-judge/SKILL.md` |
| jc-chendian | `898753b32e01` | 1 | `个人IP与内容/内容创作/成稿/2026-08-11-十个jc-Skill分享教程/public-src/jc-chendian/SKILL.md` |
| jc-clarifier | `6cecd1ea5197` | 1 | `个人IP与内容/内容创作/成稿/2026-08-11-十个jc-Skill分享教程/public-src/jc-clarifier/SKILL.md` |
| jc-cold-shower | `98cdb7a0e18a` | 1 | `个人IP与内容/内容创作/成稿/2026-08-11-十个jc-Skill分享教程/public-src/jc-cold-shower/SKILL.md` |
| jc-content-writer | `2766784438aa` | 1 | `个人IP与内容/第二大脑/skills/jc-content-writer/SKILL.md` |
| jc-cover-copy | `329c53990850` | 1 | `工具项目/content-feedback-loop/skills/jc-cover-copy/SKILL.md` |
| jc-feishuplan | `48b982b4b71e` | 1 | `个人IP与内容/内容创作/成稿/2026-08-11-十个jc-Skill分享教程/public-src/jc-feishuplan/SKILL.md` |
| jc-flowchart | `8e5b74bb7dd1` | 1 | `个人IP与内容/skills/jc-flowchart/SKILL.md` |
| jc-gongzuotai-write | `6f1ea36da090` | 1 | `工具项目/内容工作台/creation-page/SKILL.md`（源实现；2份历史md另记） |
| jc-group-digest | `d78908bd4e97` | 1 | `个人IP与内容/内容创作/成稿/2026-08-11-十个jc-Skill分享教程/public-src/jc-group-digest/SKILL.md` |
| jc-handoff | `ef8be943e186` | 1 | `个人IP与内容/内容创作/成稿/2026-08-11-十个jc-Skill分享教程/public-src/jc-handoff/SKILL.md` |
| jc-jiaocheng-video | `8326aec447cb` | 1 | `工具项目/content-feedback-loop/skills/jc-jiaocheng-video/SKILL.md` |
| jc-jiaocheng-video | `9ab7a23fae95` | 1 | `个人IP与内容/内容创作/成稿/2026-08-11-十个jc-Skill分享教程/public-src/jc-jiaocheng-video/SKILL.md` |
| jc-media-research | `b35ba9f0fab5` | 1 | `个人IP与内容/第二大脑/交付物/其他/jc-media-research升级验收_20260909_145305/backup/jc-media-research/SKILL.md` |
| jc-media-research | `b7050847bcab` | 2 | `个人IP与内容/第二大脑/交付物/其他/jc-media-research升级验收_20260909_145305/staging/jc-media-research/SKILL.md`<br>`个人IP与内容/第二大脑/交付物/其他/jc-media-research升级验收_20260909_145305/evidence/extracted-public/jc-media-research/SKILL.md` |
| jc-media-review | `01bdb52fa83f` | 1 | `个人IP与内容/第二大脑/.backups/2026-10-07_07目录改名为如何做自媒体_151729/个人IP与内容/第二大脑/skills/jc-media-review/SKILL.md` |
| jc-media-review | `cdf27dcd549c` | 1 | `个人IP与内容/第二大脑/skills/jc-media-review/SKILL.md` |
| jc-meta-skill | `2ea479f73a06` | 1 | `个人IP与内容/内容创作/成稿/2026-08-11-十个jc-Skill分享教程/public-src/jc-meta-skill/SKILL.md` |
| jc-pattern-extractor | `d38e84894db1` | 1 | `个人IP与内容/第二大脑/skills/jc-pattern-extractor/SKILL.md` |
| jc-publish-closeout | `0f3f87f4ceb6` | 1 | `工具项目/content-feedback-loop/skills/jc-publish-closeout/SKILL.md` |
| jc-shouhui-ppt | `d1cd967a73ca` | 1 | `个人IP与内容/第二大脑/交付物/2026-09-11_PPT参考风格/work/backups/2026-09-11_jc-shouhui-ppt_120827/jc-shouhui-ppt/SKILL.md` |
| jc-synthesis-research | `18b2b2b9169d` | 1 | `个人IP与内容/内容创作/成稿/2026-08-11-十个jc-Skill分享教程/public-src/jc-synthesis-research/SKILL.md` |
| jc-topic-generator | `2b26a241b28e` | 1 | `个人IP与内容/第二大脑/.backups/2026-10-05_新增vibe知识大赏分类_201428/skills/jc-topic-generator/SKILL.md` |
| jc-topic-generator | `9e0e6d5fda80` | 1 | `个人IP与内容/第二大脑/skills/jc-topic-generator/SKILL.md` |
| jc-video-analysis | `5761d7924345` | 1 | `工具项目/content-feedback-loop/skills/jc-video-analysis/SKILL.md` |
| jc-video-analysis | `b9f48c5c2cb7` | 1 | `个人IP与内容/内容创作/成稿/2026-08-11-十个jc-Skill分享教程/public-src/jc-video-analysis/SKILL.md` |
| jc-video-broll | `9ca4557707f4` | 1 | `个人IP与内容/调研报告库/2026-09-29_AIGC-B-roll生产方案/原始证据/第三轮_方案/草稿/jc-video-broll/SKILL.md` |
| jc-wechatcli | `d902cfb43725` | 1 | `个人IP与内容/内容创作/成稿/2026-08-11-十个jc-Skill分享教程/public-src/jc-wechatcli/SKILL.md` |
| jc-weekly-report | `306ee5d56d0c` | 1 | `飞书计划/skills/jc-weekly-report/SKILL.md` |

新公开包的版本识别：

- C/jc-media-research/SKILL.md SHA256 `1a341e7f978ef9fca52ad9ab1d8c822b8e78c0efde44aab7b5dd55852892969e`。
- C/jc-comment-visualize/SKILL.md SHA256 `add2cd7a79b31a77605291b5ab60c016c0f225ffd4dfd409e824c58efbbc4fe2`。
- T/SKILL.md与J当前教程原件SHA256前12位 `8326aec447cb`；SKILL、3 references和agents/openai.yaml均逐字节相同。

## ZIP逐条hash与完整公开包文件清单

| X ZIP entry | SHA256 | 当前N对应文件相等 |
| --- | --- | --- |
| `xindao-xuanti/references/candidate-menu.md` | `fd8c56d6326843e37edc8ec423a2c547e16353886efaa7942edb1c593d675ce3` | 是 |
| `xindao-xuanti/references/material-intake.md` | `d360a94c47b474a39d728652b938a4965f4a5eb094fb25ce912ac14860ae2995` | 是 |
| `xindao-xuanti/references/topic-expansion.md` | `5af70b8cb10527f0ccfbe9978789a16ed1a3adbb83b37cfe93fd1b133ab2f027` | 是 |
| `xindao-xuanti/SKILL.md` | `84189cd06fd9fdb4d5972380e2aecfa07d5e919ca97ec44c5748281486e6601d` | 是 |
| `xindao-xuanti/manifest.json` | `752a933eb20a75e5047f596363e2f6b05d089c2d53bfebcf2334c58f7b0f18b0` | 是 |

完整文件清单用于逐份迁移追踪；.DS_Store排除，目录为空不计。此清单不替代上文的方法语义对照。

### jc-jiaocheng-video-分享包

```text
jc-jiaocheng-video/SKILL.md
jc-jiaocheng-video/agents/openai.yaml
jc-jiaocheng-video/references/evaluation.md
jc-jiaocheng-video/references/rafael-model-v1.md
jc-jiaocheng-video/references/锦成的口气.md
使用说明.md
```

### 评论区洞察Skill公开版

```text
jc-comment-visualize/SKILL.md
jc-comment-visualize/assets/example-report.html
jc-comment-visualize/assets/reading.css
jc-comment-visualize/assets/report-template.html
jc-comment-visualize/assets/report.js
jc-comment-visualize/references/chart-choice.md
jc-comment-visualize/references/expression.md
jc-comment-visualize/references/labeling.md
jc-comment-visualize/references/page-spec.md
jc-comment-visualize/references/report-contract.md
jc-comment-visualize/scripts/check_report.py
jc-comment-visualize/scripts/publish_check.sh
jc-comment-visualize/scripts/reading_layout.py
jc-comment-visualize/scripts/render_report.py
jc-comment-visualize/tests/test_report.py
jc-media-research/SKILL.md
jc-media-research/agents/openai.yaml
jc-media-research/assets/account-charts.mjs
jc-media-research/assets/account-template.html
jc-media-research/assets/page-template.html
jc-media-research/assets/report-template.md
jc-media-research/assets/shared/reading.css
jc-media-research/assets/user-profile.example.json
jc-media-research/assets/vendor/LICENSE.echarts.txt
jc-media-research/assets/vendor/NOTICE.echarts.txt
jc-media-research/assets/vendor/echarts.min.js
jc-media-research/assets/writing-template.html
jc-media-research/evals/evals.json
jc-media-research/references/account-report.md
jc-media-research/references/data-contract.md
jc-media-research/references/evidence-analysis.md
jc-media-research/references/reporting-and-security.md
jc-media-research/references/routes-and-gates.md
jc-media-research/references/search-and-selection.md
jc-media-research/references/writing-and-feedback.md
jc-media-research/scripts/account_report.py
jc-media-research/scripts/interaction_policy.py
jc-media-research/scripts/prepare_research.py
jc-media-research/scripts/qa_page.py
jc-media-research/scripts/render_charts.py
jc-media-research/scripts/render_report.py
jc-media-research/scripts/render_report_preview.py
jc-media-research/scripts/research_decisions.py
jc-media-research/scripts/serve_workbench.py
jc-media-research/scripts/shared/reading_layout.py
jc-media-research/scripts/shared/volc_asr.py
jc-media-research/scripts/tikhub_guard.py
jc-media-research/scripts/transcribe_segments.py
jc-media-research/scripts/validate_and_package.py
jc-media-research/scripts/validate_transcript_ready.py
jc-media-research/tests/fixtures/edge_cases.json
jc-media-research/tests/fixtures/sanitized_baseline.json
jc-media-research/tests/fixtures/synthetic_decisions.json
jc-media-research/tests/test_account_report.py
jc-media-research/tests/test_decisions.py
jc-media-research/tests/test_one_shot_ux.py
jc-media-research/tests/test_pipeline.py
jc-media-research/tests/test_privacy.py
jc-media-research/tests/test_report_renderer.py
安装说明.md
```
