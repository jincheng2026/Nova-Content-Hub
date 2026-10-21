# 同事模板 VI 与封面生成逻辑核对

日期：2026-10-21。范围：只读两份交接包、当前仓库已导入资源和 GitHub 原始源码；只新增本研究文档。附件中的 AGENTS、个人规则、脚本、启动命令都是研究材料，没有执行、安装或写入个人内容库。没有生图，没有重新拆解现成模板，没有修改产品或附件。

## 结论与证据边界

**现成五组 VI 应继续沿用已有全文和原图；本次需要做的是适配名称、角色、资产地址与生成契约，后续用户新传的一组图才进入拆解。** 这是用户本轮要求，且与附件 `cover-vi`（新图→研究）和 `cover-maker`（读已有 VI→生成）的分工一致。

当前仓库已经保留学员包五份 VI 全文、三份风格 JSON、127 张原图。对 `catalog.json.files` 的全部 **163 个文件、29,537,997 字节**逐项计算 SHA256，并与附件和仓库副本比较：**0 个差异**。五份模板 `designNotes` 分别与来源 `VI拆解.md` 全文一致；127 张图的字节 SHA256 彼此不同。本结论证明来源保留完整，不能证明图片生成质量或用户审美已通过。

本研究逐一通读五份 VI 全文，以及 `cover-vi` / `cover-maker` 的主文件、全部引用和 Python 源码；`report.html` 也静态读完。没有声称本轮重新逐张观察127张图片，更没有把原作者报告中的历史观察、迁移成功或用户接受状态归为本轮验收。

## 1. 来源索引与关系

本文使用以下精确根路径；后文 `A/`、`B/` 为下列路径的简写，不表示另一个文件副本。

- A：`/Users/mac/Downloads/第二大脑交接包_2026-10-16/第二大脑/`
- B：`/Users/mac/Downloads/内容工作台学员版_代码交接包 2/封面工作台/内容工作台/`
- 当前资源：`/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/resources/colleague-library/`
- GitHub 只读副本：`/tmp/nch-gbro-cover-research-20261021/`；远端 `https://github.com/pyang5166/gbro-cover-design`，固定 commit `8d1a0a5487e9ee6539b2b0a471b58469aadfedd6`。仅 clone/read，没有安装 Skill 或执行其内容。

| 来源 | 实际内容 | 与封面任务的关系 |
| --- | --- | --- |
| A `skills/` | 7 项：`jc-benchmark-intake`、`jc-broll-judge`、`jc-content-writer`、`jc-media-review`、`jc-pattern-extractor`、`jc-topic-generator`、`shengcai-positioning-interview` | 提供内容定位、素材、标题与正文边界；该指定目录没有 `cover-vi` / `cover-maker`，不能把内容规律提取当成封面 VI 生成器 |
| A `AGENTS.md` | 个人 Vault 目录、固定 T 编号、来源与最终稿规则 | 仅借鉴不编造、源材料与工作稿分离、现有内容不重建；个人路径、发布档案、服务不可直接带入本产品 |
| A `SOURCE_OF_TRUTH.md` | 任务导航、本机服务、当前稿与备份边界 | 索引不是正文；其中服务端口和绝对路径属于原机环境，不应执行或冒充本机入口 |
| B `.codex/skills/cover-vi/` | 主文件、3 份方法引用、3 个 Python 脚本、1 个 HTML 模板 | 新图组的证据型拆解流程 |
| B `.codex/skills/cover-maker/` | 主文件、3 份方法引用、6 个 Python 文件（含公共模块） | 读现成 VI、选单图参考、双输入图生成、逐张自检、交给人挑选 |
| B `.codex/skills/needs-clarifier/` | 需求澄清技能与一个例子 | 是上游通用需求工具，不负责 VI 规则或生图 |
| B `.codebuddy/skills/` | 同样3项技能，共20个文件 | 与 `.codex/skills/` 逐文件字节完全相同；迁移时不需要两份业务规则 |
| B `项目/02_内容素材/对标封面/` | 5 组、127图、5份 VI、3份风格名 | 本次内置模板的实际来源 |
| B `项目/05_内容草稿/T001_课堂案例/` | 10张 JPEG 候选、选定文件和短记录 | 教具，不是科技姐25图模板生成测试；其记录明确用了鹿一家＋锦成照片 |
| B `项目/06_提示词/` | 26 条非说明 Markdown、2份格式/分类说明 | 已吸收资源的一部分；是通用思考提示词，不是5组VI或10个生图风格 |

A `skills/jc-pattern-extractor/SKILL.md:20-38`、`references/field-rules.md:15-38` 区分平台标题、文案、封面字和口播原文；A `skills/jc-content-writer/SKILL.md:12-16` 明确图片文字仅作内容素材、不分析图片设计。故 A 的写作流程和 B 的视觉流程互补，不能互相覆盖。

## 2. 五组现成模板与当前资产映射

源目录均为 B `项目/02_内容素材/对标封面/<来源组>/`。当前目录保持该相对结构于 `plugin-src/resources/colleague-library/sources/`。所有编号按实际文件名解析，不能从文字猜扩展名。

| 来源组 | 来源风格名 | 当前产品名称与稳定 ID | 实际资产 | 原研究范围与可用边界 |
| --- | --- | --- | --- | --- |
| AI大白话 | 风格.json：助手同框风 | AI大白话 · 助手同框风；`builtin-colleague-assistant-scene` | K01–K19，19 JPEG | VI研究19张；角色分工/共同空间可用，但固定3D女孩不是用户自动拥有的身份资产 |
| 秋芝 | 风格.json：大头短标题风 | 秋芝 · 大头动作风；`builtin-colleague-big-head-action` | K01–K30，30 JPEG | VI研究90张，使用 QZ 编号；未随包提供QZ→K映射、另60张或原研究数据。保留完整来源规则，不能说本包有90张或把QZ075直接绑定K图 |
| 科技姐聊AI | 未附风格.json | 科技姐聊AI · 空间操作风；`builtin-colleague-spatial-operation` | K01–K25，9 JPEG＋16 WebP | 文中25图全部在包内，逐图Markdown链接全部可解析；最适合直接按编号选择操作关系 |
| 鹿一家 | 风格.json：橙绿描边风 | 鹿一家 · 橙绿生活海报；`builtin-colleague-orange-green-life` | K01–K30，30 JPEG | VI研究32张；K31/K32未交付，也未给旧文件名映射/源表。仅以实际30图为可选图 |
| Seven研究社 | 未附风格.json | Seven研究社 · 蓝紫新闻拼贴；`builtin-colleague-news-collage` | K01–K23，23 JPEG | VI研究23图；01–17新闻侧栏、18–23平面图窗是独立分支，不应全部变成科技蓝侧栏 |
| 合计 | 三份来源风格名 | 五个稳定模板，均v1 | 127图：111 JPEG、16 WebP | 五份VI全文完整，历史研究附件不齐 |

名称适配属于目录元数据；例如「大头短标题风」→「大头动作风」、「橙绿描边风」→「橙绿生活海报」可建立别名映射，不能据此改掉原始VI或让旧模板ID失效。当前导入实现见 `plugin-src/scripts/import-colleague-resources.mjs:12-18,29-73`；目录原文与哈希见 `plugin-src/resources/colleague-library/catalog.json`。

## 3. 每组需要保留什么，哪些只随内容变化

以下是**来源报告的结论**，不是本轮新做的视觉判断。

| 模板 | 应保留的关系 | 允许变化与禁止泛化 |
| --- | --- | --- |
| AI大白话 | 真人体验者＋助手的任务分工；工作对象实体化；上下标题分读点；共同光线与接触关系 | 助手尺度可大可小，题材物、场景和标题色随案例变；没有自有角色参考时不沿用源女孩。不可固定为两个人并排看镜头 |
| 秋芝 | 具体本人身份；夸张头身比例；醒目短标题；人物参与动作；标题给头和动作让位 | 场景融合、白边拼贴、平面背景三种处理成组选择；不拼凑每张的最大头、最大字、最多道具；源黄白色是常见组合，不是所有图的必选 |
| 科技姐聊AI | 一张原图中3–5个空间关系；近远体量、动作接触点、文字字形/层级、光效附着于对象 | K07/K20俯视全身、K16搭建、K17揭膜、K24跨框不同；不能统一大头半身、银灰展厅、三张空白卡片或蓝色粒子 |
| 鹿一家 | 照片中的人物关系/情绪先成立；橙绿双层阅读、粗黑描边、暖框构成主要识别分支 | 真实照片决定文字位置；家庭关系、年龄标签和小英文不是所有用户都要继承的规则。报告中的「删词」建议不能覆盖本次已确认标题不可改字 |
| Seven研究社 | 事件/观点上下分层；背景一个主要隐喻；人物常为评论者；视线朝对象 | 不强行把评论者改成实际抓握/操作；无侧栏的6图保持独立；源 TECH BLOGGER/SEVEN/QIQIAI 字标不可自动抄入 |

规则正文说明「为什么和怎样变化」；完整样图给出可见的体量、字宽、遮挡、接触、光线细节。两者互补：只给原图可能混脸/复制旧字，只给泛化规则会丢空间。生图时不需要127张全部当参考图；应该先读组规则，再为**每张候选**选择一张主要原图。

来源定位：B 五份 `VI拆解.md` 全文；科技姐「逐图保留关系」「选图建议」；秋芝第2–6节及例外；AI大白话「识别核心」「空间系统」「人物与助手」；Seven「形象与角色」「版式骨架」「一致性与变化」；鹿一家第1–8节。

## 4. 后续新图的拆解流程（不要回头重学现成模板）

来源 B `.codex/skills/cover-vi/SKILL.md:10-89`，三份 references 和脚本逐一核对。

1. 确认一个图组、作者/来源、实际图片与样本边界；默认按提供顺序前30张，少于10张说明局限，单图只作单图分析。没有日期就不声称「最新」或风格演变。
2. 清单记录稳定图片ID、原名/来源、格式尺寸、原字节SHA256、作品ID与时间（未知明确空值）；相同作品的不同版本不可默默合并。
3. 逐张在看清细节的尺寸打开；记录可见文字、主体动作、空间、字形处理、色材、解释、迁移建议，以及实际检查动作与看不清处。统计校验不代替看图。
4. 归纳每条规则的范围、证据、例外、边界、置信度；频次的命中/未命中/不可判互斥且覆盖范围。案例记录适用内容、必须成立的关系、保留、替换、所需输入、失败表现。
5. 校验文件、字节、尺寸、引用、完整观察与统计；再输出可点证据的研究页和 `VI拆解.md`。事实自检、迁移试图、用户审美分别记录。
6. 用户的新模板命名、默认设置与当前产品现有入口对接；人没接受不能标成已验收。来源脚本的个人配置写入、改原图名和本机网页生成不是当前产品的必要实现。

来源脚本注意：`建清单.py` 实际会重命名原图并写清单，不是纯读；`导出VI拆解.py` 直接写输出文件。原文有「不删不覆盖原图」不代表任意调用脚本不会改变来源目录。本次没有运行这些脚本。当前产品宜保留原字节并由自己的资产ID映射，沿用现有版本/学习结果契约，避免拷贝一个新的个人文件系统流程。

## 5. 基于现成模板生成封面的完整链路

| 阶段 | B 的原始做法 | 适配当前产品的建议与验收点 |
| --- | --- | --- |
| 内容与标题 | 只给标题即可开工；生成骨架另有一句 CONTENT；标题逐字锁定 | 正文/附件提供事实和画面语义；标题、辅助文字为本次明确授权可画文字。正文出现一句话不等于允许追加到封面，不能用源旧文案凑底部字 |
| 配置与本次输入 | 默认对标、照片、张数从 `封面配置.md` 读，本次指令覆盖默认；默认10张、3:4 | 复用当前选择的模板版本、本人照、资料、比例、张数；不可把10张或3:4写死覆盖用户请求。来源只证明3:4流程，其他比例须重新排版和验收 |
| 图组与单图选择 | 读完整VI，再打开选中原图；10张尽量选不同图，每对至少两项可见区别 | 每候选绑定一个主要构图参考与其ID/资产，说明选它的内容原因、3–5个保留关系、与近似候选的差别；不可一份套话重复N张 |
| 身份与素材分工 | 图1本人照，唯一身份参考；图2选中的完整原图，仅构图美术参考 | 资料附件、产品截图和自有角色分别说明用途。源案例「锦成」「女孩」「蓝衬衫」属于被替换的身份/衣着，不应压过本人照。不选人像按当前产品无人版能力处理 |
| 提示词 | 主题、双手/目光、保留关系、前中后景、光材、标题几何、逐字文案、禁止追加字 | 当前命名/字段只做映射，完整用户输入和换行保留；不能把源码里的说明文当成用户可见提示词缺席的替代 |
| 调用 | 两图实际传给当前宿主可用生图工具；人物、文案、道具、场景一次完整生成 | 「看过图」和「调用传了图」分别留证据。具体图序与提示词一致；工具不支持两图或混脸时只传本人照并详细转写构图，明确记录文字回退 |
| 批次执行 | 生成一张保存一张；最早2–3张查混脸/错字/空间；坏图保留，连续3次工具错误停止 | 默认不在一批内无限重做；以当前任务契约检查数量、实际文件和比例。工具错误、视觉不合格、用户不喜欢是不同状态 |
| 自检 | 身份、文案、手、空间、动作、遮挡、180×240可读性、同批差异；记录具体问题 | 源「每人两手」应按可见角色和遮挡理解，不能把多人/画外手案例机械判成错误。原图边缘裁切或挡字不是必须继承 |
| 登记与挑选 | 候选/完整提示词/记录保存；用户工作台打分；仅按明确反馈选定或修改；改图用新编号 | 复用当前库/候选/生成任务/批注入口；源 `Txxx` Markdown、工作台数据JS和浏览器打开命令不是本产品新真源。保留全部候选与反馈，不替人选 |

原始依据：B `.codex/skills/cover-maker/SKILL.md:6-105`；`references/生成方法.md:1-44`；`references/验收.md:1-19`；`项目/00_个人背景/封面配置.md:1-21`。B 对全文正文解析、任意比例、无人物版并无完整设计，表中对应项明确属于当前适配建议，不能标为同事已验证。

提示词适配应保留来源骨架的实质：唯一身份＋构图参考角色声明；一句具体内容；每只手/视线的明确动作；3–5条原图关系；镜头/前中后景/体量/接触/材质；标题位置、分行、字形效果；本次准确文字；未授权额外文字为空；缩图与人体/空间检查。不是把「XX风格，高级科技感」当作生成逻辑。

## 6. 可复制内容与必须映射的内容

| 来源内容 | 处理 |
| --- | --- |
| 五份VI原文、3份风格名、127原图 | 继续原字节保存，来源hash不变；已有仓库资源已满足，本轮不用再次导入或拆解 |
| 观察事实、例外、适用选题、保持/替换关系、失败判据 | 在模板完整说明/参考规则中原文复用；对绑定不到实际图的历史编号标清不可直接选图 |
| 生成骨架、身份/构图分工、标题锁定、无虚假数据、自检维度、坏图留存 | 以当前术语/字段适配执行，维持原意；不照抄机器命令 |
| 「锦成」、源博主发型/服装、源卡通IP、源账号名和Logo | 从案例观察保留为出处；进入实际生成时改为本次获准的主体/身份/素材。不能只替换姓名却留下「白衬衫女孩」等身份指令 |
| 原机 `/Users/hejincheng/...`、127.0.0.1:8769、com.hejincheng.* | 保留在来源档案而不执行；UI链接应是本产品可读资产/说明，不能跳已不存在的个人服务 |
| B 配置文件、默认锦成照、课堂默认确认/清理脚本 | 映射到当前本人照/偏好/模板选择。不能静默用同事照片，不能把课堂默认清理技能装进本产品 |
| B 原版固定10张、固定3:4 | 作为源默认/源验证范围记录；本次请求优先，跨比例不宣称已验收 |
| A 个人目录、发布复盘、服务、飞书链接 | 只用于理解上下游，不复制为本产品的运行依赖或操作授权 |
| Source `accepted` / migration / 旧测试口吻 | 来源历史状态保留；当前模板是否接受、当前生成是否通过由本次真实记录决定 |

## 7. 冲突、缺失、重复逐项列表

| 编号 | 核实事实 | 影响与处理建议 |
| --- | --- | --- |
| C01 | 两包职责不同：A指定skills是内容流水线，B是封面流水线 | 没有两套相互竞争的封面VI真源；以B现成VI复用，A只补事实/标题/正文边界 |
| C02 | B秋芝报告90张/QZ编号；实际30张/K编号 | 缺60图、原数据、QZ↔K映射、两张历史验证图和原 localhost 页面。保留完整规则，不猜编号对应、不重新拆整套；必要时只补单个对应关系 |
| C03 | B鹿一家报告32张，实际30张 | 缺K31/K32和原源表/下载记录；本轮不补下载，不按32张宣称资产完整 |
| C04 | AI大白话/Seven的报告声明附 index.html、社媒助手导出.xlsx、作品数据.json、逐张观察.json、构图案例.json、总览 | 这些不在对应交付组目录；报告是已拆内容，可沿用；无法据附件重算互动统计/最近作品选择，不把来源宣称算成本轮核验 |
| C05 | 五组目录都没有 `VI研究/records.json` / `study.json` / 导出网页 | 不能因为报告存在就宣称新格式证据JSON齐全，不能运行导出器从缺失数据重建原规则 |
| C06 | 科技姐报告25张链接全部可解析，含混合jpg/webp | 本组无链接缺失；用清单实际扩展名，不能统一改为jpg |
| C07 | B `.codex` 和 `.codebuddy` 20文件一一相同 | 这是宿主镜像，不是40份规则；当前使用一套共享逻辑即可 |
| C08 | 127图没有字节重复；163个来源文件与已导入副本全相同 | 无需重复导入；完整SHA表已有当前catalog，可用于逐项验证 |
| C09 | B README最快开始写「选定/修改」，maker要求先好/不好评分再复制反馈 | 来源入口描述有版本不一致；当前应用采用自己现有真实UI入口，不能原样拷贝教案话术 |
| C10 | B AGENTS写课堂素材只读，但删默认脚本会移动课堂照和科技姐目录 | 不迁入该脚本，不能把源流程的清理授权带进产品 |
| C11 | B cover-maker硬规则称一批不重做，生成方法又有身份修复 | 解释为普通批次先保留坏图，用户要求改/明确修复任务再留新版本；不是无边界自动重试 |
| C12 | B 配置说明称用户可自己改值，AGENTS/Skill让AI必须脚本改配置 | 针对不同操作者的约束；当前使用现有设置API，不引入源文本配置双真源 |
| C13 | 鹿一家建议长标题删词；maker要求标题一字不改 | 锁定本次授权文字优先；可换行/排版，未经授权不删词 |
| C14 | 源案例可复制段含固定锦成、女性衣着、源IP；当前全文保存正确但直接拼接会带入这些内容 | 保留出处原文，生成执行时明确本次主体与仅参考关系；必要时按字段适配选中案例，而非删掉整份VI |
| C15 | 原图含发光、粒子、局部贴边和挡字；GitHub通用规则禁发光且要求10%安全区 | 用户现成VI分支优先；GitHub不能成为覆盖全部同事模板的统一过滤器，关键字仍应可读 |
| C16 | 来源VI有表情/动作固定特征，当前本人照仅身份参考 | 身份沿用，姿势、衣着和表情随本次构图；未授权不继承源人的外观 |

## 8. GitHub参考核对：可借鉴的结构，不能替代现成VI

固定提交所有引用都可打开，不依赖未来HEAD：[README](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/README.md)、[SKILL](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/SKILL.md)、[examples](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/references/examples.md)。已通读主文件、README、10个风格文件、8组示例、LICENSE和.gitignore。

事实：该Skill读文章→三轮选风格/标题、参考图、视觉细节→按需读风格＋示例→产出中文提示词，**不直接生图**。固定3:4；默认本人图1，图2起是产品/UI素材；首次配置保存个人脸和模型。与B的区别：B图2是整张构图原图，GitHub图2是内容素材，不能共用未标角色的「图2」字段。[SKILL原始流程](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/SKILL.md#L8-L118)

| GitHub风格（references/style-XX-*.md） | 固定关系与适用输入 |
| --- | --- |
| 01 深色渐变风 | 居中半身、背后大字、深色渐变 |
| 02 纯色扁平风 | 半身、纯色不渐变、道具强透视 |
| 03 产品主视觉风 | 必须有产品/UI图2；产品60–70%，人物偏小引导 |
| 04 对比卡片风 | 两卡一大亮一小暗、双手形成比较 |
| 05 极简留白风 | 留白大于60%，人物20–25%，少元素、中细字 |
| 06 海报拼贴风 | 前中后景遮挡，建议额外素材 |
| 07 人物侧置留白风 | 人物占宽25–35%，对侧留60–70%标题区 |
| 08 背影构图风 | 不露脸，人物朝目标、空间纵深 |
| 09 局部出镜风 | 手/半脸/侧脸在边缘，产品为主 |
| 10 正面对视风 | 正面直视，上下文字不挡眼嘴 |

十个风格文件均在 `## 固定` 中约定3:4和约10%边距。只在选中的风格范围内应用，不把半身/10%/禁止发光当成所有现成VI的硬规则。[style-01](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/references/style-01-%E6%B7%B1%E8%89%B2%E6%B8%90%E5%8F%98%E9%A3%8E.md#L10-L23)、[style-03](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/references/style-03-%E4%BA%A7%E5%93%81%E4%B8%BB%E8%A7%86%E8%A7%89%E9%A3%8E.md#L10-L24)

建议借鉴：按需加载一个构图模板；清楚的固定/变量分离；样例只示范姿势、物件、空间描述的具体程度；抽象主题转具象动作；逐字标题与生图后核对。当前用户已经选好模板与标题时，不应强插三轮问答/重写4–8字标题，也不必新增十个风格资源。[SKILL提示词要求](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/SKILL.md#L113-L137)

GitHub内部也有边界：主规范说避免发光，而examples 2/6/8及部分style模板含发光/光效；风格01让文字部分被人挡，主规范要求中文准确；不存在自动视觉验收。适配应保留当前选定模板的画面逻辑，落实关键字可读、身份与事实边界，不宣称上游Skill保证每次正确。

## 9. License与来源留痕

GitHub LICENSE 明确 MIT，版权含 `2026 狗哥笔记` 和上游 `oh-my-cover-design / 2026 feitangyuan`。若未来复制其代码或大段说明，保留该版权与MIT许可文本；本轮只研究引用，没有复制其资源到产品。[固定提交LICENSE](https://github.com/pyang5166/gbro-cover-design/blob/8d1a0a5487e9ee6539b2b0a471b58469aadfedd6/LICENSE#L1-L21)

两个本地附件研究根中未找到名为 LICENSE / LICENSE.md / LICENSE.txt / COPYING 的文件。当前仓库 `provenance.license: user-authorized-reuse` 记录用户授权复用，是项目来源记录；它不等于第三方公开封面、人物、商标或IP自动成为MIT授权。来源VI自己也声明属于观察归纳而非作者官方规范。继续保留原文、作者、来源路径/hash，并按已授权用途作风格参考；不把公开作者头像加入本人照库，不复制源字标和事实承诺。这里记录已知来源状态，不提出新的审批流程。

## 10. 本轮实际检查与未覆盖

已做：读目录与全文；核对5组计数/扩展名/VI链接；两宿主技能镜像20文件逐字节比较；163个来源文件/hash/字节数对照；5份catalog设计全文比较；127图SHA去重；固定GitHub commit并通读原始参考；静态核对拆解与生成脚本的真实行为。

未做：127图重新视觉拆解、缺失QZ映射补证、来源Excel/历史研究重算、真实生图/迁移/审美/跨比例验收、宿主/Electron端到端、打包安装或用户库写入。当前产品生成链路的真实可见提示词和资产传参，仍需主线程按当前diff与本次请求核查；本研究不能替代该运行证据。此后若有实施变化，需另行验证，不由本研究证明。

## 附录A：核心来源文件SHA256

B两份宿主镜像哈希相同；以下只列`.codex`规范副本。五份完整VI哈希同时可在当前catalog的`validation.ruleSourceSha256`查到。

| 精确来源（相对上文A/B根） | SHA256 |
| --- | --- |
| `A/AGENTS.md` | `7851c0c157a9704a0f9365778ebcf71d2cd65cc6667eed3ea326aa3813695f59` |
| `A/SOURCE_OF_TRUTH.md` | `9b22d863450e041cb3fa8170428e0521485fdc8e0cdcd8c9662cb487911bbad1` |
| `A/skills/jc-pattern-extractor/SKILL.md` | `d38e84894db147e912ecd76b29e7ef1f468aa8421d8ebd567a5d96a045b836f5` |
| `A/skills/jc-pattern-extractor/references/field-rules.md` | `dacf85bfe9b5e70605a6e0a7afb30687b040526cf787c33e319c7e5b711924cc` |
| `A/skills/jc-content-writer/SKILL.md` | `2766784438aafb79ee9ecf0048996012de53e187932d20ca648036dc1a7850b6` |
| `B/AGENTS.md` | `222b0c6c0d406dbd1b1307e7d862e43779bd6cf185579f5a951c51d947289cef` |
| `B/README_FIRST.md` | `9b1d534f60fa3c126e6aabfae32126c1f1558a38b8907adf2efa496c75f22caf` |
| `B/项目/00_个人背景/封面配置.md` | `bd6cda97167c5f0a45c10ed7235776a63949cd51deadd90c597ebc237f1bef78` |
| `B/项目/05_内容草稿/T001_课堂案例/生成记录.md` | `3fcbe8631e2e04797eca8557178f894780c6af4efe584386e66e0d6b450c6dcf` |
| `B/.codex/skills/cover-maker/SKILL.md` | `cb062b22f0cffa150bf0230b17da543560fda6a95b2e1eb54d0f996e4082f45b` |
| `B/.codex/skills/cover-maker/references/引导原文.md` | `5fa560ce8de9b3f810041d7eea4b6f37f5b1e2144e10c55c2c3829e7bc07c7c6` |
| `B/.codex/skills/cover-maker/references/生成方法.md` | `ff08a5e4ab85888f11e1b468479eb245a5cb95135835fcd263240d2966628f0b` |
| `B/.codex/skills/cover-maker/references/验收.md` | `a5e8ee15cdb056e060c4d3d2629db34bd0a3570547f9dda27e54732c4034b4f4` |
| `B/.codex/skills/cover-maker/scripts/公共.py` | `5051cf91832326dbd4efc7bd44c403084ce3cd96addf5ab7a0177b2dc7514670` |
| `B/.codex/skills/cover-maker/scripts/删默认.py` | `9b6e16285dfadd94303b753758a9276532f4b6d63346d1ef24e0f40bc5479658` |
| `B/.codex/skills/cover-maker/scripts/检查配置.py` | `817795136bf28c453d8fafa8b78473ae27abf75d4daef54749a8ca6e6445da4e` |
| `B/.codex/skills/cover-maker/scripts/确认默认.py` | `f214d73c8f5fccda1b8e4b6bc2e921e79418f1bf8e43835d8c3cae6acc476c38` |
| `B/.codex/skills/cover-maker/scripts/设对标.py` | `3b40cb9e3c50d56de7408ca9ca681b6d98d2b695a0526e0c3bb13595ca05221e` |
| `B/.codex/skills/cover-maker/scripts/设照片.py` | `d976be942e72ab3e60d5408ffc1709ae05b2fe3ade0c92c248255e7961a723ba` |
| `B/.codex/skills/cover-vi/SKILL.md` | `0b5e70a08478219c460c1138a1c10a06d86df61d56caddf94dfcc2048618df04` |
| `B/.codex/skills/cover-vi/assets/report.html` | `f7b416528830b675a1cbce2a6c19f862befeb7e0aaac555aa4e13f5d051fbf80` |
| `B/.codex/skills/cover-vi/references/delivery.md` | `754e373d9aacaccd36980b0340b19771af3f6bdbeb5d275b6714e50aea8b5a99` |
| `B/.codex/skills/cover-vi/references/evidence.md` | `6caa50e89ab26bf3c43cf79918e15a507ee997bd3bb1ae09fb0a6d2a2a2548a5` |
| `B/.codex/skills/cover-vi/references/observation.md` | `c187a746ecb12e20d64fdc798c30b9a3d33378c6facf57031e0bcd3374da0e17` |
| `B/.codex/skills/cover-vi/scripts/vi.py` | `2d28213fecc5819c5ed8a97a07569dccc10861c3eaaadde7efb60cbbc2c3497a` |
| `B/.codex/skills/cover-vi/scripts/导出VI拆解.py` | `c852aff89c9f85a81681c888ad68e9cbd30a34286dce14454687061ea10e6d1c` |
| `B/.codex/skills/cover-vi/scripts/建清单.py` | `689b2afc0a018c95bedf52af3a85afd190fe9d1b2248b62732ee7c97c50cbcdd` |
| `B/项目/02_内容素材/对标封面/AI大白话/VI拆解.md` | `185b0e6f2829888f5bab2bcc3c501293b5afe90c36ee6ab0284ab34446242a83` |
| `B/项目/02_内容素材/对标封面/AI大白话/风格.json` | `91e2759f38ba6a3d2ebab4f7938be42373c98944fa82e42dccf74f186fddc1aa` |
| `B/项目/02_内容素材/对标封面/Seven研究社/VI拆解.md` | `d58a31e46067e1d73b7f9698380306a53f42d345b69a7605dfc26f5d460a36aa` |
| `B/项目/02_内容素材/对标封面/秋芝/VI拆解.md` | `ff3c3d42ce90f514373e2eeafa27a1a4bd00156bce8bad5c8c8d895fbee125b6` |
| `B/项目/02_内容素材/对标封面/秋芝/风格.json` | `9fb297ad79e9490ddda9c2d76dbdb71400e09e4c928b51a3aa8f969506f6703c` |
| `B/项目/02_内容素材/对标封面/科技姐聊AI/VI拆解.md` | `d36c94cbc4f03ca3169d224a266ee0208e8087161165dbaccc2068fd35787963` |
| `B/项目/02_内容素材/对标封面/鹿一家/VI拆解.md` | `604b6631861e85386cc6f5ea0403ef776ec69460b213e8ad32010bfaaabb0586` |
| `B/项目/02_内容素材/对标封面/鹿一家/风格.json` | `2aa4568e9958ba7a99f58a4e95a07c6c2c5ca7894e3cf505a472c70b5e158394` |

## 附录B：127图逐项资产与SHA256

以下文件均相对 B `项目/02_内容素材/对标封面/`，当前副本位于资源根 `sources/项目/02_内容素材/对标封面/`。核验的是来源字节；不代表本轮逐张视觉接受。完整163文件还包含26条通用提示词及2份说明，逐项表见仓库 `catalog.json.files`。

| 资产路径 | 字节数 | SHA256 |
| --- | ---: | --- |
| `AI大白话/K01.jpg` | 218663 | `e027026a8318c0fa515a188f827e19b1e053a212f8bf808f3e9771604ef7ee24` |
| `AI大白话/K02.jpg` | 204668 | `4c48ef2c54247844a8a7629fa84ca87db64c9baccfe10176901a549587df6402` |
| `AI大白话/K03.jpg` | 113265 | `837c686eb9cbd934af23a72b07138fe12a01b0f262e4a84dbe5a79d0bc90eda3` |
| `AI大白话/K04.jpg` | 125996 | `145f8141fe192996f7078e794b367c2ef1ffb8a880797cf1cae21d97de4adf37` |
| `AI大白话/K05.jpg` | 164977 | `c2c32dac179e2035abb3da2339b2df72b5924feba431b0d723ef5932ed59cdd8` |
| `AI大白话/K06.jpg` | 155005 | `67e4d2b4a6c0d26591e18845af3fd3e7ce4f1a630df1b3c8bea47e179d27cd9e` |
| `AI大白话/K07.jpg` | 190595 | `03172ddf04c9b0724b5947c67a3f93e98021b26d90fad734a51fd94e566bf466` |
| `AI大白话/K08.jpg` | 238107 | `3d96fab000a776ed87bb2682963551be3a539b45f420e75524b25eea0f216095` |
| `AI大白话/K09.jpg` | 214843 | `e96d05e8947936cd4155dd54eef51ef838335c682dd416a2331a63a132937faf` |
| `AI大白话/K10.jpg` | 227041 | `35b5b0401bca7fbdfab4671b73f705657108b6b48346868dba96202eede45424` |
| `AI大白话/K11.jpg` | 208044 | `a919aa7c25abee35b8a177ad11f56718fa5e3b20a4a4708cd266f9488c63a6ff` |
| `AI大白话/K12.jpg` | 293095 | `8016483070352270741c1a89b9364d68f29bca4fa86ec554c7d19c9d04ecd4e4` |
| `AI大白话/K13.jpg` | 318509 | `dbe4fe0ca9a5441c4c4bbfa06f7b7051baf5087c25c5e66f75b6a14cb2507e26` |
| `AI大白话/K14.jpg` | 240369 | `d0854b9aa97551422f599ef5d008500547c8025bad7630b534b04664387eaf11` |
| `AI大白话/K15.jpg` | 279584 | `d30792d250e1cb8fd843cc7b306c33c993fd581236c196416f76ec4ae28d048d` |
| `AI大白话/K16.jpg` | 277247 | `545341d0f2186fe00ba771ccda721763b432f7b4201b0e4c9634d5a659640f34` |
| `AI大白话/K17.jpg` | 174717 | `5e53268827ca3d30f4c5e115151a49db8c875919d3d972bff888d0008c3f753c` |
| `AI大白话/K18.jpg` | 149167 | `5e240094080499c7bb032b370ccadb434612323141e9ce8a93d6ae15cceceaef` |
| `AI大白话/K19.jpg` | 267048 | `4eb30e965a87885723f980031d5fd258c7301c39789f3ef37da42ac485b927fd` |
| `秋芝/K01.jpg` | 183786 | `5bc12b31d4f0c7472c2c028dec18a57e1a290cb0c60d2b2c8226963a500abec5` |
| `秋芝/K02.jpg` | 261046 | `34a61cd517f008d564842c138b571495f7b2d17d323412771fc56a1f146575d5` |
| `秋芝/K03.jpg` | 265964 | `530a23aa386e1b5a3f1ec5ab9f186f632fab23f39ffebccd7dce770882d3695e` |
| `秋芝/K04.jpg` | 240788 | `15150ad1524dded0e254ab2161b360e6f31b2a77fa3a64fadca8c995ffe5f700` |
| `秋芝/K05.jpg` | 263316 | `fdf0673510b5c43b9202c6ee0fe87b2d2d4461a1610cac71e13fa6213e31ab94` |
| `秋芝/K06.jpg` | 178788 | `31c8bde6e31069d7ab7e2abeea61792ef30f6e8f5ba72caf7f66e598803d29c1` |
| `秋芝/K07.jpg` | 254026 | `a79c47491e88cd31937931fd17bfef0e8edb4c191870c7f8bdbc7caf48c94466` |
| `秋芝/K08.jpg` | 241034 | `10c5bce590e83e0bdd08b35c3e8f14399ff58a1383df5a7c60158a578581a5df` |
| `秋芝/K09.jpg` | 383944 | `7635bff4ede1d922a3a0d005812e2c7d289d8452808a1d53434e13af02f06b7e` |
| `秋芝/K10.jpg` | 223499 | `8d6ef18d834a0ab9d928e0603e4f524e1c77229b63110e12d66ace3d903d8f13` |
| `秋芝/K11.jpg` | 181877 | `2e2b1edee3f8c81a292609504d3efbad4fb0c2382edeb3de2423623fb64133d2` |
| `秋芝/K12.jpg` | 197051 | `3297afb6a4ce7fefce175b122cadf077ae4291fe4c580cd9fbdc069b19719b1d` |
| `秋芝/K13.jpg` | 188523 | `84026690564001aae1dd4ab21572198e9fe6e1ca98a660fb67a785ae80f8e6bc` |
| `秋芝/K14.jpg` | 241889 | `37af844ba39b8e3c86692f7c502ee5e2c74771c858ccbff588cc7d9d40b0974c` |
| `秋芝/K15.jpg` | 236355 | `9aac3e195c42c80e27fbaaff9c5302e37f2d83e9a0aa45a0c237cdf0bd19986a` |
| `秋芝/K16.jpg` | 233074 | `273a20d906c9fdcc24ee5da53e83592b74ef051b3b84434d1eeb2039d20d68e3` |
| `秋芝/K17.jpg` | 254747 | `6b334c5ba9badc76b0fcd3d5a2df4a5181dc36cb91e933439dad89ae498f7011` |
| `秋芝/K18.jpg` | 229808 | `a75793b7a3335f1a590b7c2d828a5cb00ac34937026e696ed5be6b0302f0713c` |
| `秋芝/K19.jpg` | 267207 | `536750e5463fab35c4230698efd450b7006a68b5580877120bbe251df03d9f74` |
| `秋芝/K20.jpg` | 167426 | `8585e5af7d52e9c3fcbc4998de4eb0e0b9e623b515399fcc7f413074e2d0cf1f` |
| `秋芝/K21.jpg` | 224995 | `d8f368b4b1c95086764cd9ef1893d7190ca8a9c77357adceed4b767370191db1` |
| `秋芝/K22.jpg` | 259896 | `c3bd62d335b1edeec19321bcb6abdcbaebd94c29bba27dfcb23d83c395518edf` |
| `秋芝/K23.jpg` | 222281 | `24383c75a654bcf9c8a04f0398fd33bfd74a82f539d60a3c0702f0a14111b78a` |
| `秋芝/K24.jpg` | 208442 | `53107d4909c2a235d927611912bba3f191d2565481f00d84b6b217137add06e3` |
| `秋芝/K25.jpg` | 223426 | `5a35c50895f0bd9eb04c9437bb083e17a4a61c07053265b62874b373cbefded0` |
| `秋芝/K26.jpg` | 251087 | `8c845745c65252c84c7bad5222cbb991528635c0610aef2322a6adfc18e5fe5b` |
| `秋芝/K27.jpg` | 261087 | `f622ed6492c469776a3d4026e285c2cc884bace0c1b9d4ab7e7c74da53b6159b` |
| `秋芝/K28.jpg` | 241496 | `065666edd9ad0e4693543dfc7f1c071fbbd893f8883b386e9ab66319a7925a10` |
| `秋芝/K29.jpg` | 238147 | `90199f58b2a114fb1296672ca86f42d5f10e704df10b00b14b549dff84f6d044` |
| `秋芝/K30.jpg` | 174826 | `44030f9cd64ce6be743c9cecaeaefb139b3d58e32d59b606b3262daf34a14ef8` |
| `科技姐聊AI/K01.webp` | 197638 | `4a8725b6eccf2247a5a315ef89cda1f34a7dc7648fe8bd9f63e1dfd01840b06b` |
| `科技姐聊AI/K02.webp` | 195118 | `ea931f56614c263d21141416506a8dc5732fb24f6260fb74318d9bab28b920b8` |
| `科技姐聊AI/K03.jpg` | 84782 | `fb8243a3a63eb069c0c5762baed2bcca43436c43d7204402a65a4b892c056f87` |
| `科技姐聊AI/K04.jpg` | 88300 | `083cbbe0af5126ff5a1fa0aaf6eaae48600bcb509ce3d75d987675ca16d51e5c` |
| `科技姐聊AI/K05.jpg` | 106789 | `83d42eeec8fbd1ab4474d835316b29aa5694531e5ab0d35d0723b0535b27ec8d` |
| `科技姐聊AI/K06.jpg` | 89419 | `e64a9dc75fa0ce7452c94dd3771be39e1cb1a952d924a81e1232d335c144f129` |
| `科技姐聊AI/K07.webp` | 211076 | `efcf38cfa0c2f6dc81d41faeb80a34d56373d592a41a4bd2ae9142853c21acdf` |
| `科技姐聊AI/K08.webp` | 238912 | `40f1f5611ae267423ba7065e94e4bf767c993ce4cf148ef745a827fb2a0140a3` |
| `科技姐聊AI/K09.jpg` | 61163 | `4f4a122a8c257fa3bb4da81214edf46baae350693b7361d87be7bdfc1447fcb0` |
| `科技姐聊AI/K10.jpg` | 73826 | `c10a316f7b2138d2e17e9bf222cfc23cd802a6107bf4f6a20511d5fd1875f544` |
| `科技姐聊AI/K11.jpg` | 59677 | `1ff1ec51525e967b1b78fa79485480ce3ccc3252041bbb5c51a12a4acf2ec197` |
| `科技姐聊AI/K12.jpg` | 83719 | `00149d4d1ef1f19a09b23761222514938cc7ad0e09c80f0b4431b4fa6f49e0aa` |
| `科技姐聊AI/K13.jpg` | 69362 | `23a7e58b29d4f773a6c92e469ad5b4f52e0647bfc18f36cddd3e471fe950e22e` |
| `科技姐聊AI/K14.webp` | 213912 | `eb36c369f3cabf0a69df24a25efb03d3d13a0d010f489176014b86d653b99c33` |
| `科技姐聊AI/K15.webp` | 234522 | `5e06f69fbc8db7e6285fb90d12c4b5c58e2faa6a336e04b7b5e5304235a7043f` |
| `科技姐聊AI/K16.webp` | 266684 | `80cfaac2f32bc5de2ff00b4b0f2a43a767278e7ffa2d2e38f40affb377e436f7` |
| `科技姐聊AI/K17.webp` | 233348 | `2ec6e74d075fe41b4f0860385b0d18cd2e65a1a3e06e0d49056bc7e8263c6f55` |
| `科技姐聊AI/K18.webp` | 181742 | `472d44b37daea04be1a60ca9c0a694942b766da6eddcc4d39b6600c911f10348` |
| `科技姐聊AI/K19.webp` | 215416 | `d67f4e6567129d6155ecd25d52ba8819fb2b1211f5757bde37f0cb88859885f2` |
| `科技姐聊AI/K20.webp` | 181094 | `2362ca32243ac0fe8f96f2436630379d2d3cf04c7f8ee3e1a3e26512df0821f8` |
| `科技姐聊AI/K21.webp` | 179868 | `732b2a782a3cfe73d60a0d0a26b4e3ab6f93b52dfbeb8ef6f57413be8c5e09e5` |
| `科技姐聊AI/K22.webp` | 186606 | `01674f7e6c6153d75e9871724d5ad03c0e90e1d5f09a7890ab39b703e119d556` |
| `科技姐聊AI/K23.webp` | 238098 | `96cb26060e309d5ec18f6735d4fae6f85b8ed4c2e042c5c64498a632c86fa790` |
| `科技姐聊AI/K24.webp` | 270610 | `e868c6ede6c781051192a5ab91145dd860443a03692db4ae36b1290c0eb1cfdf` |
| `科技姐聊AI/K25.webp` | 223104 | `a73796cb5921d5ebc72888516fb71796edb59071b52bd507196a77720f75a42e` |
| `鹿一家/K01.jpg` | 233621 | `1966cfae06713e7af94a7321e87f7558ecc150a4cd4e64b9596012fb2b62a227` |
| `鹿一家/K02.jpg` | 314550 | `8b42bf4149c63f59b26e79b3dae7f7905800f90b509e3e6ec3cacb436c012443` |
| `鹿一家/K03.jpg` | 302044 | `85f95df96033ad8f9757cf1b6f32396cf469fc78e2ca86a1d19ee9526aed9a7d` |
| `鹿一家/K04.jpg` | 278284 | `2fbbcfa031cd902667e9b76417efd09ccdd871733337b092bed6da6263b1d8f1` |
| `鹿一家/K05.jpg` | 299052 | `9e6f2fda1cb90706fa4372a6465f3de6c815232721a208fa41ddc1abe2da9eab` |
| `鹿一家/K06.jpg` | 372064 | `574658cc5e0747be47a3558d6d3efbb85449d89db1196be7007f3297319d6c67` |
| `鹿一家/K07.jpg` | 309069 | `670dfea578eb8f9c6e9bfb127d29c02d47c8d3870bb5528cbc9370b66a94d077` |
| `鹿一家/K08.jpg` | 264301 | `5b242c1d77a59e25ee051f0e97ac14d71e61d80a439be368c364573d7056caa2` |
| `鹿一家/K09.jpg` | 331882 | `086c7411a73972c9a3f2b73106751b78b396732802559e344602ccbf13ff253e` |
| `鹿一家/K10.jpg` | 323682 | `fc521302d6f261040ba730ff4cd876246a650d0aa7ae1f728969b304ff73ad8a` |
| `鹿一家/K11.jpg` | 290657 | `c4ddd0bfbf446d338be760db5667ed00410fa24fc2095178cff8cb9fc01aebff` |
| `鹿一家/K12.jpg` | 272614 | `580827650db703b212c55b7b3fee5971219aa2f5bf42fdfdb4f4f2208719e8a1` |
| `鹿一家/K13.jpg` | 246448 | `164a103e83d60576fb6f6fed5d0f1d043abb19042e4636f099533e833797493e` |
| `鹿一家/K14.jpg` | 302328 | `64c4a685e0e3a9c74f5152a1e3ce8389c17df8de3c56b68c758cd385fc44d6d4` |
| `鹿一家/K15.jpg` | 327164 | `c1a4a77c09866e92d234e2b51c60d761dc68368e8d6a4a2a9a3617a0b2aca1ae` |
| `鹿一家/K16.jpg` | 179454 | `a82fd19a3dfb267cf315bb0719bbdfe11a4b7176f03580bc07565db26ff064a3` |
| `鹿一家/K17.jpg` | 270638 | `3963d97a6c725eaa16ce37e062e6c3f03474b7f7d7f17d7fa18ffdc11b462a8b` |
| `鹿一家/K18.jpg` | 349869 | `924edd499ccaff554ec2a4ed78834d5b7b2aa1c6a2c1997213287bb97b5b27b4` |
| `鹿一家/K19.jpg` | 334134 | `2fd1993edf7b308061cd30e71bd0df274da07510ff0a16c9423a71f64147891c` |
| `鹿一家/K20.jpg` | 218055 | `3ca6f3ae0d038d2713712c0f7c04929affb91c06cb6b3d9090c5ae291b6f73ae` |
| `鹿一家/K21.jpg` | 255178 | `d44451003f0c2741d53f6667c38ddbbc09176467ec5a0f155624382970a4b84e` |
| `鹿一家/K22.jpg` | 489208 | `75dfa5032bc154e7b223bf5e0bcab6f6d909c1b90050e7508fda81e11775741c` |
| `鹿一家/K23.jpg` | 355985 | `957569ec7cd89521b9df6233ffb4ed55f218ec2f84790f5c2dc7dd0a85d07548` |
| `鹿一家/K24.jpg` | 237125 | `c944ade11006a2378ce2d92e2dcafab43772c528cc7ac375f996d0a31c40e661` |
| `鹿一家/K25.jpg` | 420622 | `721cc2f842a0f4e8745a0896aa3e25af104f54d0d77be4c6719b64768fb575f1` |
| `鹿一家/K26.jpg` | 307692 | `6a9743cbef0ecad94075d673776ce13fcc93988a9ce313e99265c03060ffccd5` |
| `鹿一家/K27.jpg` | 279585 | `c75b9c4eb33f21bd8491b86c42f1c4f086a0b7fa24864002f007cf1001e325f7` |
| `鹿一家/K28.jpg` | 355932 | `0db279f2bdcbfef8b516cd3342108bcdf01858c9d4bf96bfb3bd2d051c59df58` |
| `鹿一家/K29.jpg` | 263626 | `78adbda83e8989a98c5ecafbbe75f51ec94b79f11a3ab9636f28a2e0818720bd` |
| `鹿一家/K30.jpg` | 235139 | `e4ac84b7eb1a9ada7d565553147d9a08511a0b8d30225c30e40d89d19bf92356` |
| `Seven研究社/K01.jpg` | 130580 | `d292c57b306103409dff0c9a5391fab0f8115f609ab10f08dfe8e5d690ead3f0` |
| `Seven研究社/K02.jpg` | 186281 | `6f1d09074e692fca9d795158bb5e7a744b414d5e9ec3dbbf7c51f39f478192cd` |
| `Seven研究社/K03.jpg` | 206060 | `1a4bd522bf474fadf8c910eb5e0156445a3c8cdd5fd7ecfeb7388371205cc1cc` |
| `Seven研究社/K04.jpg` | 161574 | `cb7a9b106e47990f6d8a402b872212b55b8c595ece900dcf8e484fdacddb2213` |
| `Seven研究社/K05.jpg` | 205188 | `9d181681453ea7eedc59900d725da9b0ee6d9e733979d07407894d89cfc085e9` |
| `Seven研究社/K06.jpg` | 232589 | `f83ea75e6c566c44976a4499fd59fb1f045abfd9cdc745d5465ac8ccf49104dc` |
| `Seven研究社/K07.jpg` | 289633 | `f3b262a4e3cc164f2389644d8f3555a8e147834d7119b9da14a29b125889ff98` |
| `Seven研究社/K08.jpg` | 231261 | `4b08f388f3ad79886581871f4945a7b9afa781a3905bc595f0e4dd67b981750a` |
| `Seven研究社/K09.jpg` | 275536 | `5e0f1e65400329bf4e9865ca654d306730e12eb96b8691a5c19d89d2d834bc22` |
| `Seven研究社/K10.jpg` | 241641 | `4f59264184fda1db776237c0f3bdfb97c0e94b7bc6c254e245f2bb87b1e08866` |
| `Seven研究社/K11.jpg` | 263626 | `7a6de5259e6a79b02c468c1ccae50f37d96396bafa2b0aa5fac541516244e570` |
| `Seven研究社/K12.jpg` | 238275 | `71c3d8e5d96a6a13ea665b3d78fe45d70fc0e8281e7f6f67fd0049a8b84a5c6b` |
| `Seven研究社/K13.jpg` | 270405 | `d07f3a3d3c7f130bcc8c74cfd734ee027d5ceea348046c5232a1a6ed9469bebd` |
| `Seven研究社/K14.jpg` | 277133 | `3dbfa5d76f6307ba7245216ca5d46645f859ff3a7f2aefb89232caa0734e5187` |
| `Seven研究社/K15.jpg` | 288569 | `92e26cf5b6422e33fe683471876b646ea9071cacca74fa2a6e4109aad4f28bb0` |
| `Seven研究社/K16.jpg` | 251508 | `91900e6c86a2690783e39944ee03fdb514bc159e03894e6051134aec48f73383` |
| `Seven研究社/K17.jpg` | 283845 | `0bac98c08d3c489e69c8d8959d2e6dc9612b60c2e758505ef5554108fb47c5f8` |
| `Seven研究社/K18.jpg` | 180814 | `1953865e3a967256d61c35eb0baae221656e07743c13d0015de3567fcb60c47d` |
| `Seven研究社/K19.jpg` | 169074 | `86cf70396c08e10a73fccc805714df9dd6e0395d6392ac1c550d386f56fa21e5` |
| `Seven研究社/K20.jpg` | 121485 | `b2f0995f157fae8fd441233a4bc82dffb412369c3c9348d494db790d9ce95788` |
| `Seven研究社/K21.jpg` | 246369 | `a39b2987bcf382be59f490b05008efd51dde8bbbac53beff6f085f58b1f2f8c2` |
| `Seven研究社/K22.jpg` | 183802 | `9267ba2c2c6726dcf464a42449e104ea323fdd2a4d7ed84737750e4e7d983de5` |
| `Seven研究社/K23.jpg` | 196826 | `32f72330a27d708b2c85c794c856b0a36d8f6106655f38da48c19661aff4b790` |

## 附录C：GitHub固定提交文件SHA256

| 文件 | SHA256 |
| --- | --- |
| `README.md` | `141de1c65d23322dd22d44bf52e8af84f5a51eb5cf81e40ff33b51ca0dc45bcc` |
| `SKILL.md` | `f7bb698bd5ca3386a0fe7bb12947b25158e196708b41396bcc8311aaef66d793` |
| `LICENSE` | `89fe5ae8d5faeda939e392638d21ef1ab5084b3ecb8df96c8bbcb38416291958` |
| `references/examples.md` | `0723c654a12a649cdabd9261ab3fd1e8dc3a1c68a9e26182a0f435ec5e088d94` |
| `references/style-01-深色渐变风.md` | `b242d750c6da817aa0d707b36fe448e8772660b20d7fddce1f776e0d9be6c57f` |
| `references/style-02-纯色扁平风.md` | `e15019a8464a85bd8afabd73bb2c72b6646ff073c865ad797ea22468937acbee` |
| `references/style-03-产品主视觉风.md` | `5ca156eca901486d2a19ac57f161e1a65691a6801e7ef61f7bc01b3d3ae532e1` |
| `references/style-04-对比卡片风.md` | `dcb63dd8274e7f217a50c1224cb23e506a9c73d370ac09997974e42c69955653` |
| `references/style-05-极简留白风.md` | `4f44a106809e6ad88897be1195aa555eda673b37ef4998108339318c62547cbe` |
| `references/style-06-海报拼贴风.md` | `fe55875deae901c9c9c36fd22cacc4d77957a8836a85b7fe9cb2c9ab2d0b368e` |
| `references/style-07-人物侧置留白风.md` | `44b5c3a80f2c96bbf278b18d922b0029e134df2cdd343b915ee2736a5d7681c1` |
| `references/style-08-背影构图风.md` | `3e33e7fd3dc9baa4c08be82d6afa34c6eb2a4849c284c7c29cc37b8902565ebd` |
| `references/style-09-局部出镜风.md` | `939dc0394ed6e1625254384c0405eddf2be0a2d8f7904090bd9aab4324ac61fb` |
| `references/style-10-正面对视风.md` | `5ff95f0aac0a065637e2f6f5ac9c8d64159a981145e8d3e941443d6208293e3b` |
