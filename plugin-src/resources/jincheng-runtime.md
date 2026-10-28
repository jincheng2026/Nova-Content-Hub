# 锦成业务阶段运行接点

本页只定义当前工作台的可执行接口。业务方法、原文 references/schema/模板仍从固定业务 Skill 读取。`RUN` 表示共同任务契约指定的随包运行命令；先用 `RUN production context --handoff UUID` 完整读请求，再按共同契约 claim，所有命令使用同一 handoff 和当前 `{claimToken,workerId}`。

## 原位创作与阶段产物

`request.parameters.workflow=jincheng-stage` 时，`stage` 固定本次业务环节。以下命令统一为：

```text
RUN jincheng-creation OP --handoff UUID (--file ABSOLUTE_JSON | --stdin)
RUN jincheng-workflow OP --handoff UUID (--file ABSOLUTE_JSON | --stdin)
```

JSON 顶层只有 `{claimToken,workerId,input?}`。库、T 内容、当前来源、模板及写入目录由固定任务与所选 Vault 解析，输入不接受 root/path/source/actor。来源冲突或作者切换当前入口时，先回工作台重新冻结任务。取消、失败或换 attempt 后旧身份不能继续。

先运行 `jincheng-creation read`（`input:{}`），读回 `document` 的完整 jc-doc/items/fields/locked/ai_state，以及 `buildData` 和 `workflow`。`document` 保留 mine/note/refnote/suggestions/作者决定/未知字段；`buildData` 为原模板构建输入。正文摘要不能替代原页。尚无HTML时读取原资料和 workflow，完成阶段确认后才能首次build。

| 操作 | input | 用途 |
| --- | --- | --- |
| `jincheng-workflow read` | `{}` | 读真实阶段产物、精确版本决定、作者先拆和原页权威状态 |
| `jincheng-workflow artifact` | `{kind,text,title?}` | 保存本次阶段的可读 Markdown 和 hash，返回 artifactId/revision；不会代作者确认 |
| `jincheng-creation build` | `{data,mutationId}` | writing/tutorial 首次原模板完整HTML；data为原schema，content_id固定为当前T |
| `jincheng-creation regenerate` | `{data,expectedRevision,mutationId}` | 精确版本再生成，旧mine与全部作者字段保全，禁止删旧item |
| `jincheng-creation suggest` | `{suggestion,expectedRevision,mutationId}` | 追加原schema逐句建议；引用必须精确回到当前mine |
| `jincheng-creation reply` | `{itemId,handledNote,reply,expectedFingerprint,mutationId}` | 按最新意见指纹追加AI回复；意见变化后重新处理 |
| `jincheng-creation append-item` | `{item,expectedRevision,mutationId}` | 原schema的refnote/skeleton/step，或cover-copy阶段的pubslot/pubcand |

阶段kind映射：narrative→narrative；key-segment→key-segments；writing/tutorial/revision→complete-draft；analysis-ai/analysis-author→analysis-comparison；cover-copy→packaging；review/patterns→review；closeout→archive。显式选择stage=tutorial或业务方法jc-jiaocheng-video时，先交叙事，再交重点段（开头、最需判断的一段和结尾），准确版本均由作者确认后才生成完整稿/完整HTML。普通jc-content-writer按原方法的素材包→逐问访谈→本人确认素材包→AI初稿推进，不额外强加教程叙事/重点段检查点，也不因缺少这些教程产物阻止从已有真实资料续写。用户已明确开展并登记的叙事、重点段或作者先拆仍须沿用准确版本的作者确认；产物变化、重新打开或未确认时，先回到对应阶段，不能借普通写稿绕过已选择的阶段。素材包的本人确认继续按原方法与共同等待契约真实停等，不由assistant产物自述为已确认。approved、recorded、发布事实仍使用各自原件字段，阶段ledger不替代它们。

作者先拆路线先运行read，提示作者在工作台“阶段确认与作者先拆”写下自己的判断，然后按共同契约回写waiting-user。作者保存后再读workflow；authorAnalysisConfirmed为true后才提交AI差异。差异产物由作者继续确认/拒绝/重新讨论。助手命令不接受author-analysis产物或作者evidence，不能把聊天中的自述当作者已确认。

产物保存不等于生产任务提交。阶段文件回执的artifactId/hash/path放入普通production结果的data并保留可读text，继续用共同契约submit与status/receipt核对；阶段版本确认与task结果验收分别保留。作者mine/note/decision/approved/recorded/最终选择只能通过可信桌面作者入口维护。

### 完整原创作 HTML 交付

知识库内容的 writing/tutorial 任务使用本节交付；读取冻结 workflow 后按此分支完成，同一任务继续使用原助手聊天及领取身份。

1. 先读 `jincheng-workflow read` 和 context 的 `vault.content.creationDocuments`。已有页用 `jincheng-creation read` 取得完整 `document` 和 `buildData`；尚无 HTML 时从绑定资料准备首稿。素材包、访谈和必要确认沿用当前业务方法；教程检查点仅在显式选中教程时使用。
2. 首稿形成后读取 `jc-gongzuotai-write/upstream/current/schema/creation-page.md`。按原结构准备 `data`：同一 T 的 `content_id`、实际 type/stage/title、narrative、分段 segments，以及实际需要的 suggestions/items。每段保留稳定 id、段名、作用、完整 mine、baseline 和 refs；引用保留 source_type、who、time、text、url，教程画面与步骤用原 schema 的扩展字段。数据中的事实和作者决定均须有来源，未知项按原 schema 留空。
3. 尚无 HTML 时执行 `jincheng-creation build`，input 为 `{data,mutationId}`。由工作台冻结模板生成 `05_内容草稿/<当前内容目录>/创作页.html`，包含原对照、通读、录制、标题封面简介、批注与建议等模块；不自行拼写 HTML，也不执行旧 Python 服务。build 回执的 `stageArtifact` 就是完整稿 HTML 证据，普通阶段 Markdown 仅作伴随说明。
4. 已有 HTML 时先回读当前作者 mine/note/decision 与未知字段。局部改稿使用 `suggest`，批注答复使用 `reply`；确需更新结构或锁定资料时导出 `buildData`，沿用所有旧 id、作者字段和条目，以准确 `expectedRevision` 执行 `regenerate`。生成器保护作者正文和全部可改字段，缺失旧条目时拒绝覆盖。
5. build/regenerate 后再次 `jincheng-creation read`，核对页面身份、当前版本、完整分段、原参考、建议、画面步骤和包装条目。首次 build 需要核对 `stageArtifact.path/hash` 对应本次生成页；重生成核对返回 revision。只有回读一致才说明页面已生成或更新。
6. 用允许的普通 production artifact 保存可独立读懂的交付说明，在其 data 中保留真实 `pageId/revision`；首次 build 同时附返回的 `stageArtifact`，regenerate 记录本次 revision，不复用旧 HTML hash。再 `production submit`、回读 status/receipt。说明用户可回当前内容打开原创作页继续编辑；页面保存、任务验收、正文确认和发布仍分别核对。冻结为 `content-creation` 的旧任务继续原候选采用协议，不改写旧回执，也不将其摘要称为完整原页。

## 研究、评论和素材

`workflow=jincheng-research` 读取冻结 `researchRuntime` 后，使用相同handoff/claim：

```text
RUN jincheng-research OP --handoff UUID (--file ABSOLUTE_JSON | --stdin)
```

1. `prepare`，已有研究则`status`恢复，不重复prepare。
2. 根据固定operations/targetIds/预算运行`collect`；输入 `{operation,id,cursor?,search?}`。手工资料任务operations为空、预算为0，只读取已给材料。
3. 账号研究允许冻结`sampleLimit` 1—3（桌面当前明确上限3）。先collect已授权账号的user-posts，再`derive-samples`（input为空）取得真实responseHash、requestId、videoIds。broker把相同样本写入本attempt已结清费用receipt；其他账号、其他attempt、第四条或自造ID不获许可。需要更多原片时明确分批新建固定任务。
4. `download {videoId}`只接受冻结videoIds或上述receipt派生样本，经过现有来源receipt、安全下载、媒体grant、SHA核对。`transcribe {videoId}`只用已登记本attempt原片及本地Qwen，allowCloud=false。未安装模型、无时间轴、字幕未通过时按真实缺口停等。
5. `correct`、`finalize-intake`、`save-dataset`、`freeze-findings`、`personal-advice`、`render-report`按 [Node研究运行接口](../src/lib/research-runtime/README.md) 的具体schema执行；原方法的引用、L1—L4与素材字幕验收继续生效。
6. render-report返回relativePath/sha256及真实visualValidation。按production import导入该生成文件并提交报告assetHash，status核对成功后回工作台人工验收。文件生成不会自动等于验收或发布；视觉未检查保留pending。

账号/视频链接或关键词在桌面明确填写后冻结；短链接先由作者展开。留空时只处理已有资料，需要新增对象时新建固定任务，不能在助手中扩写冻结scope。小红书只授权已接通的profile/search；其原片/评论能力按实际限制说明。

## 资料先行选题

`workflow=topic-suggestion` 始终零外部工具和零采集预算。使用production submit的research artifact，`data.topicCandidates`含1—4项，每项 `{id,title,description,change,audience,coverage,titleExample,caution}`；id稳定且去重，七个业务文本字段保留原选题卡含义。`data.sourceRefs`保存可核对来源。工作台从submitted/accepted真实receipt投影菜单，作者明确选定才创建正式T；候选名称和titleExample不是最终发布标题。

## 真实发布、正式复盘与知识候选

`closeout`、`review`、`patterns` 阶段使用专用运行链（同一固定 handoff 与 claim）：

```text
RUN jincheng-publish OP --handoff UUID (--file ABSOLUTE_JSON | --stdin)
```

先 `read`（`input:{}`），完整读取 `publication/archive/observations/snapshots/review/externalArchives/knowledge`。实际发布、录完、正式档案与正式复盘是独立事实。原卡已经发布但无正式档案时仍显示已发布；请作者在桌面「记录真实发布并建立正式档案」补齐真实 URL、时间、采用标题/简介/封面和完整定稿，不把阶段 Markdown、任务归档或分析副本升级成正式档案。身份分别为原待发布包 `content_id`、T 编号 `work_id`、正式视频 `video_id`。

- `closeout`：`input:{mutationId}`。仅核对作者已建的正式档案与观测计划，返回正式引用。没有真实包装事实时明确缺口；助手不能伪造作者决定或直接宣布发布。
- `review-candidate`：`input:{mutationId,expectedRevision,review:{sections:[{heading,text}×6],actions:[最多3条],comparisons:[{source,hash,quote}]}}`。`source` 是 read/context 已取得的本库相对证据路径，hash 和 quote 必须命中真实原文。12h 与 7d 的真实快照及原始证据 hash 不齐时拒绝正式复盘候选；晚补采保留实际 collected_at、age_hours 与 delay_reason。六块标题与顺序固定为「已确认的事实、会上说过的、初步观察、可能的原因（附对照）、还不能判断、下一篇怎么调」；事实/观察/原因假设/未知仍按完整原方法撰写，不能靠六个空标题过门。候选仅写专用 draft 登记与证据文件，作者在桌面看过并确认准确 hash 后才事务写入 `内容.md` 程序区并保留 review-history。程序区被手改时冲突停等，程序区外作者补充不覆盖。
- `knowledge-candidate`：`input:{mutationId,kind:'market-pattern'|'personal-judgment'|'case',text,evidence:[{path,hash,quote}]}`。建议与证据写同 T 待过目记录；作者在桌面明确采纳/拒绝，分别保存市场写法候选库、个人判断库或案例库。采纳不可转换类型，不能自动改 Skill，也不能把一条数据好的案例变永久判断。

JSON 不接受 `authorDecision/decision/actor`；助手说「用户同意」不构成决定证据。保存候选后，仍按共同 production submit/status/receipt 交任务回执，业务采纳另记。`jincheng-workflow artifact` 的 review/archive 只可能是普通阶段材料，不是上述正式档案或已确认复盘。

桌面可手工导入真实 snapshot，指标未知填 null，不补零。自动观测须作者在对应正式档案明确启用：仅本次已确认抖音作品 ID，12h/7d 各最多一次 TikHub video 只读请求（1 REQ，实际费用以账单为准）。本地 observer 到时先持久预约，再由 native-observer 固定生产任务的 claim/费用 broker 执行；无 Key/服务配置时明确缺口并保留手工入口。失败或结果未知不会自动重复付费；应用晚开/唤醒补采如实记录延迟。自动观测不是模型任务，不执行平台发布或任何平台写操作。

## 四项独立方法

冻结stage=kepu/review-page/cover-design/synthesis时，必须先读[专用运行协议](jincheng-method-adapters.md)，再选择jincheng-workflow method或jincheng-creation review；本页通用artifact不替代专用逐段门禁、原稿保留、设计交接和综合来源账本。综合调研不调用社媒researchRuntime。
