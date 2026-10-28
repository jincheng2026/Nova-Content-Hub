# 完整业务方法来源与适配状态

冻结登记日：2026-10-28。此文件替换此前“完整指南是摘要适配、未复制原程序、创作页只有历史快照”的过时声明。当前包把完整原件和当前运行适配明确分开，不据此声明全部业务或宿主已验收。

## 实际随包内容

21 个可发现 business-method，另有 7 个既有 contract/executor，共 28 个顶层 Skill 入口。完整来源 manifest 登记 53 个来源版本、418 个文件；当前方法正文、references、schema、模板、必要素材、校验/协议源码保留原字节。扫描以 SKILL.md 的 frontmatter.name 为准，不限父目录 `jc-*`：包含 `creation-page` 中的 jc-gongzuotai-write、`shengcai-pattern-extractor` 中同名方法的历史变体，以及候选改动目录的教程草稿。历史 Markdown 快照另列，不按文件mtime激活。

精确统计、逐文件 SHA256、字节数、内容树hash、全部同内容副本、选定状态与引用分类以 [method-sources.json](method-sources.json) 为准。安装/完整性按真实随包文件验证，不只数入口或Markdown。来源路径使用包内逻辑路径，不是产品的默认用户目录。

| 来源标识 | 选定依据与随包状态 |
| --- | --- |
| V：第二大脑交接包_2026-10-16/第二大脑 | benchmark-intake、pattern-extractor、topic-generator、content-writer、media-review 的完整当前原件及全部目录资源。停用B-roll仅档案。 |
| J：锦成工作台-同事版/数据和程序/AIJinCheng | video-analysis、cover-copy、publish-closeout、flowchart、creation-page 当前实现；澄清/冷水/交接/方法治理/综合调研是可用公开快照，不声称原机器当前已安装。其他历史/草稿/独立外部工具只读归档。 |
| T：jc-jiaocheng-video-分享包 | 用户指定教程完整五文件；与J当前教程五个实文件一致。J内备份与候选改动单列，不替换当前原文。 |
| C：评论区洞察Skill公开版 | media-research、comment-visualize 完整原件、全部12份references、报告模板/CSS/JS、脚本、测试与fixture。不同于J九月研究验收区版本，分别登记。 |
| I：xindao-interview.zip | 原完整SKILL、README、agents配置；四关模板与确认纪律完整保留。当前固定context/checkpoint/CAS另映射。 |
| X：xindao-xuanti.zip | 五实文件原字节与现有入口/reference/manifest一致，正式来源仍声明draft。直接文字模式与固定工作台任务模式保留；选题只决定讲什么，最终发布标题另属包装。 |

## 完整原件与运行入口

每个入口完整读取同目录 `upstream/current/SKILL.md` 与原分支依赖；`references/method.md` 是运行映射，不再冒充完整业务方法。`xindao-xuanti` 为保留原五文件，入口仍为原文，并由外围 [业务边界](business-skills-contract.md) 与 [适配契约](method-adaptation-contract.md) 约束保存和权限。工作台跳转应明确原方法ID、任务身份、用户本轮提示词及完整方法入口。

`jc-gongzuotai-write` 已取得 creation-page 当前源实现：完整schema、creation_doc.py、brain_page.py、build_page.py、模板、kit、保存服务与测试均随包作为只读协议源。`nova-workbench-writing-method` 继续兼容旧任务ID，但同步指向完整当前原方法，不再声称仅取得历史文本。当前产品使用自己的受控Node adapter；原Python服务、旧端口、launchd未安装，来源存在不能替代实际功能验收。

完整方法继续保留原作者判断与口气样本机制；其中原作者个人事实、历史平台经验和商业目的只是来源，不成为新用户事实或现行平台政策。当前用户自己的定位、已授权本人样本和事实优先。方法外判断库/正式档案按用户选择的库与明确关联来源读取，不能按旧HOME自动扫描。

## 权限与状态

- 完整原件中的命令保持可审计；随包脚本均以 `executable:false` 登记，安装/服务/采集/付费/自动批准/自动发布不因原文存在获得授权。本次只复制与静态核对，没有执行原脚本。
- 当前业务入口可发现，role=business-method，执行权仍属于共同契约允许的executor。直接讨论可以文字交付；固定task才领取/提交，真实写入需显式库绑定和版本/CAS。
- `sourceStatus` 区分 current、public-snapshot、historical、draft、disabled；`selected` 仅说明本轮选取；`bundleStatus=complete-source-bundled` 说明字节齐备；`runtimeStatus=contract-unverified` 说明真实业务与宿主契约尚待逐项验收。
- jc-chendian、jc-broll-judge依据原库明确决定停用；jc-video-broll仍草稿；备份手绘PPT不作当前方法启用；飞书计划/周报、群日报、微信CLI是独立外部业务，只读档案且不路由。dbskill不接入。
- 2026-10-28 用户提供 jc-skills-4个.zip 后，jc-zhuanxie、jc-review-page、jc-cover-design、jc-kepu-video 四个完整方法共620份原件及根安装说明已按621份逐字节登记并随源封存；ZIP SHA256和逐文件证据见method-sources.json。四项已加入registry，runtimeStatus仍为contract-unverified，不声称已安装或宿主等价支持。原脚本不执行；封面案例/人像只作来源，真实用户任务数据仍留绑定库。jc-qiepian-chupian/scripts/transcribe_chars.mjs外部分支仍未取得。

## 验证边界

完整性测试验证全部原文字节与依赖引用分类、发现入口、原名映射、两种模式、停用路由和权限边界。源码验证不等于真实Codex/WorkBuddy安装、业务质量、视频播放、报告视觉质量、原服务替代或跨平台运行。每个受支持助手仍须独立验证成功、两种等待及恢复、终态、原任务继续和切换；发布事实、归档、人工采用分别回读。原脚本测试也作为源证据随包，本次没有运行其安装/服务/采集测试。
