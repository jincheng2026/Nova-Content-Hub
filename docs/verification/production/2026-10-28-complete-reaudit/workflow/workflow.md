# 原锦成工作台流程与 Nova 接线复核

审计日期：2026-10-28
冻结源码：Nova Content Hub HEAD 79bc2ce7f808ab79799780ccc46c0ea67e7fb7bd
结论性质：源码、manifest、随包文件和安装态静态核对；不是 UI 或助手端到端验收。

## 核对边界与根目录

- 原工作台源码：/Users/mac/Downloads/锦成工作台-同事版/数据和程序/AIJinCheng/工具项目/内容工作台
- 这份旧工作台代码运行时默认的第二大脑：~/AIJinCheng/个人IP与内容/第二大脑；提示词库：~/AIJinCheng/通用资源/工具与效率/提示词库/常用；调研报告：~/AIJinCheng/个人IP与内容/调研报告库；封面 VI：~/Documents/ChatGPT/锦成VI/视觉评审网站。这些是旧 paths.mjs 的默认值，不等同于 Downloads 下的副本。
- 本次实际读取的旧第二大脑副本：/Users/mac/Downloads/锦成工作台-同事版/数据和程序/AIJinCheng/个人IP与内容/第二大脑。另有单独交接包：/Users/mac/Downloads/第二大脑交接包_2026-10-16/第二大脑；它与源码副本是两个位置，不能默认为同一份当前数据。
- 当前 Nova 数据位置：由用户在桌面端明确选择的内容库或知识库根目录。代码禁止推测 Home 或扫描父目录。知识库的原位文件在此根目录；其 .workbench/runtime 是知识库绑定的可重建内容库投影及任务记录。关联的旧来源另外记在 .workbench/source-map.json。
- 当前安装态插件目录：/Applications/自媒体工作台.app/Contents/Resources/plugin-marketplace/nova-content-hub。当前仓库 plugin-src 与安装插件中，xindao-interview、xindao-xuanti、jc-jiaocheng-video、jc-comment-visualize 的 manifest 列出文件均与 SHA256 匹配，分别为 3/3、5/5、5/5、15/15。
- 本报告只核对指定业务流程，不核对私域客服和运动。没有启动旧服务、打开 UI、启动 Codex/WorkBuddy 任务、调用宿主模型、付费 TikHub、下载样本或运行本机 Qwen ASR。未运行测试。

## 逐流程核对

### 1. 今天、任务、日历

- 原入口与真源：旧 README 的「今天」下有今日任务；旧 lib/tasks.mjs 从飞书「07｜个人推进看板」读取任务，并提供受限的完成／改期写回。旧 lib/overview.mjs 将计划与其他旧工作区状态汇总。
- Nova 可见入口：左侧「今天」分组展开为「总览」「日程」「助手任务」；总览从当前内容、发布安排、封面状态和逾期发布计划生成待办；日程是内容发布日历；助手任务页显示 production task 的状态、恢复、取消、重试和结果验收。
- 保存位置：内容、合集和发布计划在用户选定的 Nova 内容库；绑定知识库时运行投影在 <知识库根>/.workbench/runtime，原位的 T 内容在 04_选题库、05_内容草稿、06_发布复盘。助手任务证据也保留于运行库并按 task 归档。
- 助手提示与技能：今日总览和日历不是 Skill 工作流；助手任务页使用 nova-content-writing-execution、nova-content-research-execution 与 production-contract 的固定任务协议。
- 核对结果：内容发布日程与助手任务可见；旧飞书个人任务流没有接线证据。Nova「任务」页是助手生产任务，不等于旧飞书任务。若“今天”仍要求旧个人推进看板，当前是实质流程缺口。

### 2. 选题、从资料出选题、候选确认

- 原入口与真源：旧第二大脑 README 指向 04_选题库/00_选题总览.md 与各 T 选题卡；日常流程允许先记录灵感、用已有素材找方向。
- Nova 可见入口：「内容项目」内有「选题」页和候选菜单；「资料与定位」页可新建／编辑资料，在资料编辑器点「保存并推荐选题」；该入口将选中资料的 documentId 和 expectedHash 冻结进 topic-suggestion 请求。
- 助手提示与技能：选题路由为 xindao-xuanti；请求固定 1—4 个候选、七项卡片字段和 sourceRefs，零工具、零采集预算。候选名称和 titleExample 均不是最终发布标题。
- 保存位置：候选在 <知识库根>/04_选题库/候选/<sessionId>.json；只有作者明确选定后才分配稳定 T 编号，并事务创建 04_选题库/口播观点/待做/Txxx_题名.md、05_内容草稿/Txxx_题名/创作过程.json、选题总览与草稿总览。任务请求和提交回执另在 <知识库根>/.workbench/runtime 归档。
- 核对结果：按已打开资料推荐选题、未选前不建正式 T、未选题时不要求最后发布标题，这条代码路径存在。空标题的新建内容也允许保存；那是通用内容库草稿，不等于稳定 T 选题卡。
- 真实限制：从「选题」总目录启动的「从资料定选题」动作没有资料选择器，调用时 contentId 和 source 均为空。此路径只冻结定位、来源目录清单和用户本次输入，不冻结任意资料正文。要让具体材料驱动选题，现有可靠路径是先打开资料并点「推荐选题」；总目录按钮不能冒充“已基于全库正文推荐”。这是可复现的源码接线差异。

### 3. 在做、参考采集、拆解与阶段创作

- 原入口与真源：旧第二大脑按 05_内容草稿 与原 T 目录恢复工作稿；README 的 T016/T018 等入口使用逐字稿对照 HTML 与本目录的保存服务。原稿、mine、note、refnote、作者决定和录制稿都作为原件保存。
- Nova 可见入口：「内容项目 → 在做」列出正在写及拍完未发的内容；每条详情内有原选题、安排、全部创作入口、参考附件和原 HTML；「参考素材入库」「我先拆，再和 AI 对照」「AI 先拆参考」「共创叙事方案」「打磨重点段」「共创口播稿」「教程／观点视频共创」「按批注逐句改稿」等操作。
- 助手提示与技能：参考入库 jc-benchmark-intake；参考视频拆解 jc-video-analysis；一般逐字稿共创 jc-content-writer；需显式选择的教程方法 jc-jiaocheng-video；逐句批注与创作页读取 nova-workbench-writing-method；执行器为 nova-content-writing-execution 或 nova-content-research-execution。每个方法在 registry 中有固定原文和适配入口。
- 原件编辑：CreationFrame 读取完整 jc-doc，受控保存原 HTML 字段；正文 body 是摘要时仍以 HTML 原页为真源。评论与 AI 建议分开，方法提示要求保留作者手改。旧 HTML 不自动转换 Markdown。Markdown 资料有单独的创建／编辑入口。
- 阶段保存：阶段产物和 hash 记在 <知识库根>/05_内容草稿/Txxx_题名/创作过程.json；助手产物在运行库，另归档到 <知识库根>/05_内容草稿/Txxx_题名/助手产物/<task>/<attempt>/<generation>/。作者确认检查点、手改字段和业务任务回执分别保存，不混为一个“完成”状态。
- 录制：原页的 recorded 字段被保留并读回，详情页显示录制状态；录制标记仍由作者在原创作页／原件中维护。工作台有独立的「记录实际发布」表单，不以录完推断发布。未发现独立录制执行器或替用户录制。
- 核对结果：原 HTML 通读、逐句修改、阶段确认和录制状态保留路径已接线；运行的是兼容适配而不是旧 HTML 服务整体迁入。已安装 jc-jiaocheng-video 原包文件完整，但其生产任务尚未 E2E 验收。

### 4. 改稿反馈、发布、归档与复盘

- 原流程：旧第二大脑中稿件和发布复盘分开；实际平台发布、录完、档案、12 小时／7 天观测和复盘均保留各自事实。
- Nova 可见入口：内容详情的「发布、观测与复盘」可记录实际发布链接、平台、UTC 时间、作品 ID、实际采用的标题／简介／封面及完整定稿；录完状态与发布分开。支持手工导入观测和明确启用抖音自动观测；另有「发布后收口」「复盘这条内容」方法，以及「内容项目 → 已发布」页。
- 助手提示与技能：发布收口 jc-publish-closeout；正式内容复盘 jc-media-review；知识／反馈候选可由知识页处理。发布必须有真实平台事实；复盘需 12h／7d 证据，否则保留待补缺口。
- 保存位置：正式事实写入 <知识库根>/06_发布复盘/正式发布档案；06_发布复盘/已发布视频档案只作分析副本。任务辅助文件按原 T 内容目录归档，真实事实与阶段产物不相互代替。
- 核对结果：代码把录制、真实发布、正式建档、数据观测与复盘分开；存在真实发布表单和作者确认路径。未做实际提交、平台发布或复盘任务。

### 5. 原封面 VI、历史图片和新 Nova 封面

- 原入口与真源：旧工作台原封面页面来自 ~/Documents/ChatGPT/锦成VI/视觉评审网站，旧 README 说明原服务管理图片与原页面选择记录。
- Nova 可见入口：「内容 → 封面」页有「Nova 模板与生成」和「原封面 VI 与历史图片」两个分支。原 VI 需要用户明确关联 visual-assets 目录，再打开 public/hub.html、public/index.html、public/cover-collection.html、public/face-expression-study/index.html。
- 保存位置：Nova 封面保存于当前内容库；原 VI 的图像与状态保留在显式绑定的原 VI 根目录。默认来源映射为 <知识库根>/12_视觉资产；外部目录绑定记入 .workbench/source-map.json。
- 助手提示与技能：新 Nova 封面有 nova-content-cover 等独立技能。封面文字方法 jc-cover-copy 与封面设计方法不是一回事。
- 核对结果：原资源入口是显式打开原页，不复制或改写原资产；Nova 新封面另有流程。旧 jc-cover-design 缺完整原包，不能标称等价恢复了旧设计方法。

### 6. 对标采集、TikHub、本地 ASR、调研 HTML 和评论洞察

- 原入口与真源：旧工作台市场调研含对标账号和以 HTML + meta.json 组织的调研报告；旧报告根默认是 ~/AIJinCheng/个人IP与内容/调研报告库/<日期_主题>/。
- Nova 可见入口：「市场调研 → 对标账号」「调研报告」「爆款雷达」；调研报告页可新建调研报告、手工新建报告、导入 HTML 报告；报告可继续阅读。其下有明确的「独立调研与评论洞察」动作，评论可选完整报告 L4、人群深读 L3、单条参考快卡或材料核对。
- 助手提示与技能：账号／话题研究 jc-media-research；评论洞察 jc-comment-visualize；选定来源入库 jc-benchmark-intake。通用执行器 nova-content-research-execution；题目、对象、预算和可用 operation 冻结在任务请求。
- 保存位置：研究 runtime 在显式绑定知识库根的调研报告库/<researchId> 或 02_内容素材/<researchId> 工作；素材入库把原片、校正版逐字稿、SRT 和笔记归入 02_内容素材。提交报告和助手回执归入当前内容库及任务档案；读写原始报告可走 10_调研报告或显式关联的报告根。原来源通过 source-map 记载，不猜本机路径。
- TikHub：设置页提供 Key、预算与评论授权；请求预算按任务冻结。账号抖音研究的冻结样本上限为 3 条，未授权或预算不足不应采集。雷达页显示筛选、平台和预算。此项只核代码，不代表设置了 Key 或实际调用成功。
- 本地 ASR：研究 runtime 有离线 Qwen3-ASR 调用路径，allowCloud=false；本机缺引擎／模型会报告未就绪。这里没有运行 ASR；也没有声称旧 jc-zhuanxie 原包已恢复。
- HTML 报告：可手工导入 HTML；报告资源在当前库和绑定报告来源之间登记，阅读时可对已绑定目录内的原页面及附件做离线处理。
- 评论洞察：报告页的动作确实可见，传入 comments route 并固定 jc-comment-visualize；此技能不是“只安装没有路由”。
- 综合报告：通用「新建调研报告」入口固定走 jc-media-research；未发现用户可见的 jc-synthesis-research 方法选择入口。当前 jc-synthesis-research 是 registry 的 public-snapshot 源，来源清单只有 1 个原始文件 SKILL.md，虽安装态另有复制后的 METHOD.md 与适配说明。不能据此声称取得完整私有原包或综合研究专用路由。建议同事确认该公开快照是否就是当前最终方法。

### 7. X 收藏、选中材料入库

- 原入口与真源：旧侧栏有「X 收藏」入口；原当前绑定数据目录应由用户明确选择。旧工作台源码的 lib/ 未见可核对的 X 数据库／同步 adapter。
- Nova 可见入口：「市场调研 → X 收藏」可关联 bookmarks 来源并打开 X书签工作台.html；旁边有「把已选收藏整理为素材」和「从资料定选题」动作。
- 保存位置：源目录由用户选择并存入 <知识库根>/.workbench/source-map.json；选定后入库的材料应该落在 02_内容素材。当前绑定只说明“路径可读”，不是收藏数据库已导入。
- 助手提示与技能：动作复用 jc-benchmark-intake 或 xindao-xuanti。当前调用没有将原页面中的已选条目 ID、正文、媒体 hash 或 source document 传入固定任务。
- 核对结果：只接了来源目录关联与原 HTML 打开，没有数据库连接、AI 分类、后台同步或“页面选择→素材入库”的确定性传输路由。工作台自身文案也明确表示新版依赖的原数据库未取得、分类和后台同步需分别接入、不自动启动旧服务。可人工复制链接／资料另起任务，但不能把它记为自动闭环。

### 8. 提示词、创作知识与定位访谈

- 原提示词真源：旧 paths.mjs 默认提示词根为 ~/AIJinCheng/通用资源/工具与效率/提示词库/常用；正文是 Markdown，使用事件写到旁边 JSONL。
- Nova 可见入口：「提示词与知识」有「提示词」「创作知识」两个页签；「资料与定位」提供「梳理定位／调整定位」，能恢复未结束的定位任务。
- 保存位置：当前提示词默认映射到 <知识库根>/11_提示词；知识候选和本人确认判断归当前内容库的知识状态及 09_创作知识分类；资料与定位原位保存 00_个人背景/定位入口.md 和已确认定位文件；访谈检查点归 00_个人背景/访谈记录 与任务回执。
- 助手提示与技能：定位访谈走 xindao-interview，一次一问、逐关确认；创作知识页区分候选、采纳和拒绝。提示词页读取已绑定来源；不自动扫描旧提示词路径。
- 技能核对：xindao-interview 源状态 current，3 个 manifest 文件均存在于仓库和已安装插件且 SHA256 匹配。xindao-xuanti 有 5 个 manifest 文件匹配，但 registry.sourceStatus=draft；当前不能把它描述成上游已批准 current 版本。两项均非缺包；runtimeStatus 仍为 contract-unverified。
- 核对结果：访谈与资料页都有方法路由；旧提示词文件是否进入当前库取决于明确导入或关联，不会自动从旧 Home 复制。

## 技能完整性结论

- 已核对安装态与 registry。当前 business-skills.json 的 unavailable 恰好列出四项；在 plugin-src/skills 与安装态插件技能目录中这四个目录都不存在。本轮不重复全机扫描；先前全机扫描结论见 docs/research/2026-10-28-missing-original-skills.md。
- jc-zhuanxie：缺完整原包；仍被 jc-video-analysis、jc-media-research、jc-publish-closeout 等原方法引用。Nova 有本地 ASR 适配，但这不等于取得旧 Skill、其校对／对齐逻辑或旧依赖。
- jc-review-page：缺完整原包；改稿方法仍为独立审稿页引用。当前有创作页内批注候选与作者确认流程，不等于恢复独立审稿页包。
- jc-cover-design：缺完整原包；jc-cover-copy 上游有交接引用。Nova 封面生成是另一能力，不能标为原 Skill 完整迁移。
- jc-kepu-video：缺完整原包；旧方法仍在拆解／写作方法中被引用。现在有 jc-jiaocheng-video 显式教程方法与通用写稿方法，不代表科普专用方法已迁入。
- 其余本次核对到的当前流程方法 jc-benchmark-intake、jc-video-analysis、jc-content-writer、jc-media-research、jc-comment-visualize、jc-cover-copy、jc-publish-closeout、jc-jiaocheng-video、jc-gongzuotai-write、nova-workbench-writing-method、xindao-interview、xindao-xuanti 均在 registry 中有对应 skill 目录；其中相应当前包登记为 complete-source-bundled。包在磁盘上不表示宿主端到端验收。
- jc-synthesis-research 是额外需确认项：不是 unavailable；但 registry 来源状态是 public-snapshot，清单只列一份原始 SKILL.md 文件，用户可见报告路由没有专用 method picker。若它是当前关键综合报告业务，请向同事确认公开快照是否完整；如有更完整源包，一并交接。

## 真实缺口和需要补齐的验收

1. 旧飞书「07｜个人推进看板」今日任务未接入；当前任务页面是助手任务。
2. 选题总目录的「从资料定选题」缺显式资料选择／冻结；当前有可靠资料输入的路径是在已打开资料编辑器内点「推荐选题」。
3. X 收藏缺真实数据库和选中条目导入／同步连接；不要把打开 HTML 页记为数据库功能验收。
4. 综合研究没有可见专用路由；需确认 jc-synthesis-research 的完整当前方法包和业务入口需求。
5. 四个已知 Skill 原包缺失，等待同事交付。

静态依赖与源码 route 已核；真实 assistant lifecycle、宿主等待／恢复、Codex 与 WorkBuddy 成功路径、原任务继续与切换、报表视觉检查、TikHub 付费请求、Qwen 模型 availability、应用可见 UI 和发布／安装验收均未在本审计执行。

## 可直接发给同事的索取内容

> 请把下列业务 Skill 的完整原始目录或完整 ZIP 发我，并保留目录名、层级和相对路径：jc-zhuanxie、jc-review-page、jc-cover-design、jc-kepu-video。请不要只发 SKILL.md。需要包含每个目录中原有的 SKILL.md、脚本、references、assets、templates、schema、evals／测试／样例数据，以及所需配置变量名与脱敏示例、数据文件、服务接口和运行时文件（不要提供真实密钥、密码或令牌）；无法一起打包的外部依赖请附明确版本、安装与启动方式、配置项、费用／权限要求和平台限制。另请给出这几份是否为目前最终有效版本的确认，以及每个目录完整文件清单和 SHA256。
>
> 请另行确认 jc-synthesis-research 当前只有公开快照这一份原始 SKILL.md 文件，是否已经是最终完整方法；如果还存在完整原始包，请按同样要求提供完整目录和运行依赖。
