# 调研与创作方法来源登记

整理日期：2026-10-28。用途：说明随包方法的参考来源、重新组织方式和能力边界。此文件不包含源资料私人样本、账号内容、绝对路径或服务凭据。

## 来源与落点

下表的路径是参考资料包内部的逻辑名称，供维护者识别；不是运行时依赖，也不是要求用户安装原包。实际写入入口仍为本插件的两个 production executor。独立业务方法已随包安装并由 registry 路由，见下节。

| 参考资料 | 提取的方法要点 | 本项目落点 |
| --- | --- | --- |
| 评论区洞察 Skill 公开版，jc-media-research/references/search-and-selection.md | 问题驱动搜索、真实门槛、稳定 ID 去重、快照时点、高低样本可比性 | research-execution/references/research-method.md |
| 同包 evidence-analysis.md、account-report.md | 原文深读、账号身份/持续价值/内容选择、独立重复证据、评论层级与分母、相关不代替因果 | research-method.md、report-method.md、writing-execution/references/video-analysis.md |
| 同包 routes-and-gates.md、reporting-and-security.md | 按任务范围路由、证据不足降级、明细与图表一致、费用未知停止 | 两个 SKILL.md、research-method.md、report-method.md |
| 同包 writing-and-feedback.md | 本人材料与参考区分、当前内容续接、局部修改、反馈保留证据 | reference-intake.md、writing-method.md、feedback-method.md |
| 同事包 content-feedback-loop/skills/jc-video-analysis/SKILL.md 及 references/拆法.md、analysis-method.md | 分段问观众与作者问题、画面真实查看、信任与表达证据、开头/正文/结尾和整片分析、多参考与人工先拆 | writing-execution/references/video-analysis.md |
| 同事包 content-feedback-loop/skills/jc-jiaocheng-video/SKILL.md 及 references/rafael-model-v1.md、evaluation.md | 具体收获与可信证明、教程/口播分支、叙事与完整稿、来源核对、制作分工、轻量自检、反馈及规则边界 | writing-method.md、review-method.md、feedback-method.md |
| 同事包 content-feedback-loop/skills/jc-cover-copy/SKILL.md | 标题和封面互补、不同角度候选、短字数/换行、锁定文字交接 | writing-execution/references/packaging-method.md |
| 同事包工作台需求重建中的分工总表、创作页设计决定；可读创作页模板 | 同一内容编号、原稿保护、批注读回、逐句决定、历史与制作交接 | review-method.md、feedback-method.md；具体 UI 另按代码与验收记录判断 |
| 本项目《Qoder 调研与内容创作逐项实施清单》与生产任务/产物契约 | 本地优先、两宿主一致、显式人工采用、受控工具、候选回流与本期排除范围 | 全部方法的最终约束 |

## 适配决定

- 方法用本项目任务语言重新组织为步骤、证据要求和完成条件；没有复制原程序、模板代码或私人案例全文。此登记不替第三方资料作版权/再分发授权声明。
- 原包的默认付费预算、自动授权、云端优先、安装命令和私人目录均未移植。服务范围只认当前冻结请求、设置和共同契约。
- 研究公开包的直接给稿与原写稿包的叙事确认存在差异。本项目依实施清单默认少量叙事对话；用户已给明确方向或要求直接给稿时直接执行，不再加确认环节。
- 原包脚本图表不直接用于当前静态报告阅读器；关键数值和正文需要静态可读，图表另经真实数据转换与验收。
- 口气样本、私人判断编号、身份故事与真实内容包未随包。个性化从用户自己的已授权材料和已采纳知识获得。
- 科普、独立标题和简介采用可用资料上的通用适配，不宣称已取得同事完整私人规则。平台规则只按当前可靠来源核对，不把旧经验固化为现行政策。
- 反馈总结、知识人工采纳和修改 skill 是不同动作。当前人工采纳不自动改代码、技能或旧规则。

## 能力与验证边界

方法文档能指导 Agent 生成和核对产物，但不能代替媒体下载/播放、分段编辑、版本恢复、录制清单 UI 等实现。现有 schema 承载不了的分析和制作安排以 artifact 文本/允许的数据交付；不添加未支持字段，不承诺已经有对应控件。

方法落地需要在真实任务中逐项验证来源读取、反馈回写和结果质量。Markdown 校验、引用链接检查与资源完整性只能证明文档可发现且随包，不能证明与原工作台质量一致。

X 收藏、私域客服、运动、独立发布前评审页面、自动剪辑及自动社媒发布仍不属于本期方法新增授权。


## 2026-10-28 业务方法安装登记

本次实际新增14个business-method，连同原7个contract/executor共21个Skill。Codex通过skills目录发现，WorkBuddy通过显式manifest清单及同一skills目录发现。精确机器清单、source哈希、executor、workflow与依赖以[business-skills.json](business-skills.json)为准。

各方法references/method.md是从已读真实原件重新整理的执行指南，同时链接现有Nova references；不是原Skill安装包的逐文件镜像。上游引用的私人知识库、真实口气样本、特定账号案例、凭据、默认HOME、安装/后台服务/自动批准/任意文件搬移脚本均不复制。其本来承担的写入、ASR、采集、CAS与回执责任统一转给当前executor；本次没有引入原包可执行脚本，也未执行原包脚本。构建递归校验实际随包的全部Skill文件与相对引用，不仅校验SKILL.md或Markdown后缀。

| 随包方法 | 已取得的原件来源 | 适配状态 |
| --- | --- | --- |
| jc-media-research | 评论区洞察Skill公开版 2 / jc-media-research/SKILL.md | original-skill-adaptation |
| jc-comment-visualize | 评论区洞察Skill公开版 2 / jc-comment-visualize/SKILL.md | original-skill-adaptation |
| jc-benchmark-intake | 第二大脑交接包_2026-10-16 / jc-benchmark-intake/SKILL.md | original-skill-adaptation |
| jc-pattern-extractor | 第二大脑交接包_2026-10-16 / jc-pattern-extractor/SKILL.md | original-skill-adaptation |
| jc-topic-generator | 第二大脑交接包_2026-10-16 / jc-topic-generator/SKILL.md | original-skill-adaptation |
| jc-content-writer | 第二大脑交接包_2026-10-16 / jc-content-writer/SKILL.md | original-skill-adaptation |
| jc-video-analysis | 锦成工作台-同事版/content-feedback-loop / jc-video-analysis/SKILL.md | original-skill-adaptation |
| jc-jiaocheng-video | 锦成工作台-同事版/content-feedback-loop / jc-jiaocheng-video/SKILL.md | original-skill-adaptation |
| jc-cover-copy | 锦成工作台-同事版/content-feedback-loop / jc-cover-copy/SKILL.md | original-skill-adaptation |
| jc-media-review | 第二大脑交接包_2026-10-16 / jc-media-review/SKILL.md | original-skill-adaptation |
| jc-publish-closeout | 锦成工作台-同事版/content-feedback-loop / jc-publish-closeout/SKILL.md | original-skill-adaptation |
| nova-workbench-writing-method | 锦成工作台-同事版/Skill历史版本 / jc-gongzuotai-write/2026-09-30T0803_1e8d3bef2b.md | historical-adaptation |
| xindao-interview | xindao-interview.zip / xindao-interview/SKILL.md | original-skill-adaptation |
| xindao-xuanti | Nova-Content-Hub/workspace / xindao-xuanti/SKILL.md | workspace-source |

`jc-gongzuotai-write`只取得历史Markdown快照，原件声明的schema、build_page/brain_page/creation_doc及保存服务未完整取得，因此不以原名安装，明确使用`nova-workbench-writing-method`的当前运行时适配；旧目录与服务能力不能声称已具备。`jc-broll-judge`、`jc-video-broll`保持停用，dbskill不接入。未安装其他只被原件提到的Skill，不把引用等同已经取得。

`xindao-interview`来自用户提供ZIP，保留四阶段、一次一问、真实事实、公开边界、逐关确认、续访与局部调整；原来从CWD找库、创建目录直接写文件、全局首次强制拦截改为冻结context、受控checkpoint、真实回读与按请求启动。已有`定位总览_v0.1.md`可沿用；每个后续任务读适用定位摘要，不把完整访谈发给采集服务。`xindao-xuanti`为当前工作区资料先行方法，原文件保留，由research executor外围契约限定固定请求、候选提交、零采集工具与零采集预算。

原件中固定赛道、最低素材数、固定输出数量、默认付费额度、指定ASR与旧平台规则均改为本轮实际用户输入、冻结权限和当前可靠事实。资料先行、标题可空；现有用户无需先完成全访谈才能继续明确任务。后续新增标题或选题方法通过registry扩展，不要求页面添加一排Skill按钮。

业务方法role=business-method，始终不获得独立executable权限；仅executor在disabled模式可执行其既有命令。required模式继续拒绝业务读写，contract-only包仍只包含原3个非执行契约Skill。本次构建与静态验证证明发现/依赖/完整性，不证明Codex或WorkBuddy真实安装、定位续访与切换助手已通过；真实宿主验收仍须逐项进行。
