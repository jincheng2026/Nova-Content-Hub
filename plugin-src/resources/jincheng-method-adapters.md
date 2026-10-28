# 四项原方法的受控运行协议

仅适用于冻结 workflow=`jincheng-stage`、stage=`kepu|review-page|cover-design|synthesis`。先完整读该业务 Skill 的 METHOD 与当前分支 references，再执行共同 production doctor/context/claim。所有调用沿用原 handoff、claimToken、workerId；候选保存、本人版本确认、production submit/receipt 与最终业务采用分别核验。当前 runtimeStatus 为 contract-unverified：代码门禁和测试不代表两个宿主或真实模型业务质量已经验收。引用验证范围为所交来源文本、hash与引文的一致性；来源获取真实性、语音确为本人、外部核验与审美必须留本轮真实证据，结构校验不能替代这些业务验收。

## 科普：kepu / jc-kepu-video

1. 用 `jincheng-workflow artifact` 保存 `{kind:'narrative',text}`，读 workflow 得到 `{artifactId,hash}`。回写 waiting-user，由本人在工作台确认准确版本。重新讨论、拒绝、文件变化后先重读，不由助手代签。
2. 用 `jincheng-workflow method`，input=`{mutationId,kind:'framework',data:{narrative:{artifactId,hash},segments:[{id,title,purpose}],opening,ending,duration}}`。段落至少1项、id唯一。框架绑定当前已确认叙事；本人确认框架后才进入段落。
3. 每段仍用 method，kind=`kepu-segment`，data=`{framework:{artifactId,hash},index,title,previous?:{artifactId,hash},authorSpeech,text,additions:[],references:[{who,text,sourceText,time,patterns:[],url?}],checks:{continuity,repetition,facts,bannedWords},suggestion}`。index从0开始，段名与框架一致；第二段起previous绑定上一段当前已确认版本，前段变化后后续衔接须重新整理确认；references为两三家本轮真实取得原话（sourceText保留完整出处文本，text逐字命中），patterns列编号与名称；authorSpeech保留本人原话，additions逐项列AI新增句；suggestion最多一条。先真实摆参考，再本人口述、整理四查；本人逐段确认准确版本后才能下一段。每段按framework/id+index分别保留当前版本和确认入口；本人可重新讨论早先段落。候选由程序冻结上游decisionId，早段重开再确认即使hash相同，原后段与通读也需重新整理确认。原包样本不构成用户经历或今日热度。
4. 全部段确认后，kind=`kepu-readthrough`，data=`{framework:{artifactId,hash},segments:[{artifactId,hash}],checks,accurateNotes,changeLog}`。segments严格按框架顺序列本轮最新段落；checks含全篇承接、重复、开头独立性、结尾复述/动作、禁用词与字数，accurateNotes留后台准确说法；changeLog忠实记录变更，解释原因标「AI归纳」。本人通读确认后才build。
5. `jincheng-creation build` 用原schema，type=`AI科普`，段数/段名/mine须逐字等于已确认段落。HTML refs由生成器从已确认段落的references编译who/time/text/url/source_type及来源文本SHA256，助手build入参不能将左侧参考省空或替换。返回完整原模板HTML、stageArtifact及同T `助手任务/科普过程-准确版本/` 的叙事框架、逐字稿、准确说法和改稿日志路径/hash。read回完整原页，作者手改和批注继续原CAS/历史。提词稿用原页「复制提词稿」；后续改动逐条记录，原方法反馈只交规则候选。

## 审稿：review-page / jc-review-page

先read context 的 creationDocuments；有页读完整 `jincheng-creation read`。少量修改按原方法直接给建议，不为了造页凑数。

调用 `jincheng-creation review`，input=`{mutationId,expectedRevision,spec:{title,original,changes:[{old,new,verdict,reasons:[{type,text,time?,quote?,sourceText?}],confirmation?}]}}`。新加内容用 `insert_after` 替代old；old/锚句必须在原稿唯一，不允许重叠。new空表示删除。

- reason.type严格为voice/frame/caption/meet/you/rule/plat/op/ai；voice必须给time、quote、sourceText，原话逐字命中来源文本；caption明确发布文字并非视频原话。九类完整原结构保存在reviewReasons，原页可读依据同时逐条写出类型。
- verdict为must/optional/keep/wait，映射「已定要改/待你定/不用改/等录屏再定」。must需confirmation `{artifactId,hash}` 指向本库作者已确认的review产物，其中JSON `data.changes`逐字含同一old/new；助手自述“已确认”无效。其余判断继续等待本人裁决。
- 无页：expectedRevision为当前源hash，original须与冻结原文件UTF-8逐字相同；在同T `助手任务/审稿页.html` 生成唯一受控审稿入口，完整保留原稿，保留原Markdown和当前源决定。原模板支持直接改字、逐条采纳/拒绝、复制提词稿、改动与批注读回。
- 有页：expectedRevision为完整原页revision，original为原页段落mine按两个换行拼接；一次CAS向同页追加建议，旧mine/note/decision/未知字段保留。后续局部建议与批注走suggest/reply，禁止另造第二HTML。review-page的suggest仍须locked.reviewReasons九类原结构；must须locked.reviewConfirmation绑定准确作者确认，全部新增建议先经同一compileReviewPage校验，原schema的verdict不能绕过。只选明确当前jc-doc或本方法固定审稿入口；其他历史HTML必须先由作者选择，不能猜列表首项。当前jc-doc写权限由原协议解析与同T身份验证决定，不继承摘要正文的readonly投影。已有页review的mutationId与原请求摘要绑定，响应丢失可安全重放同回执，改变请求拒绝。当前稿的复制与改动导出沿原模板；将编辑结果落回Markdown工作稿须走作者明确采用与原CAS入口，review命令不会自行覆盖原稿。

## 设计：cover-design / jc-cover-design

method input=`{mutationId,kind:'cover-design',data:{title,style,visualProposition,caseId,preserve:[],replace:[],exclude:[],specification,evidence:[],identity:'none'|'own-photo-required',ratio:'本次冻结的正整数比例'}}`。

任务需明确冻结coverDesignRatio（现有3:4/1:1/16:9及用户自定义正整数比例），data.ratio必须逐字等于该值；原包3:4不覆盖本轮选择。完整案例caseId可追溯；preserve含3至5个缩略图可见结构关系，replace/exclude写清替换与不得继承内容，specification为完整一体化画面规格，evidence写真实产品/数据与局限。设计候选只写文字，不触发制图。作者在工作台确认准确artifactId/hash后，由同T封面入口传入设计身份，桌面调用readConfirmedCoverDesign重核最新版本、同T、文件hash与作者确认，自动冻结prompt和designSource到独立cover请求。设计title仅为方案元信息，真正图片的文字只取固定cover请求的coverText/title；规格内旧文案视作占位，不能覆盖已确认包装。本人照片、模板、数量、预算、生成/选图/CAS继续cover契约；用户无需手工复制prompt。

缺少本轮本人照片时waiting-user，权限缺口waiting-permission；案例真人仅观察并转译结构。生成后须实际查看图与原案例，分别核身份、中文、事实与整体审美，不以设计字段齐全宣布图片合格。

## 综合：synthesis / jc-synthesis-research

独立于社媒researchRuntime与topicCandidates；无需先建T。冻结synthesisBrief=`{depth:'orientation'|'issue'|'generative',question,purpose,timeBoundary,scopeBoundary}`，所有边界明确。只使用固定请求已授权工具与预算，能力不足按真实状态停等。

method input=`{mutationId,kind:'synthesis-report',data:{title,sections,claims:[{kind:'fact'|'consensus'|'dispute'|'judgment',text,sourceIds:[],quotes?:[{sourceId,text}]}],sources:[{id,title,url?,accessedAt:'YYYY-MM-DD',text,sha256}],externalVerification:'verified-online'|'provided-materials-only'|'no-external-sources'}}`。

sections每项为实际完整正文。所有深度都含conclusions/elevator/understanding/debates/judgment/next；定位式另含consensus/misconceptions/oneMinute；议题式另含issues/schools/agreement/power/bottlenecks/action；生成式另含puzzle/relationships/gaps/hypothesis/limits/validation。来源text为本轮真实读过的完整材料，sha256为其UTF-8摘要；引文必须逐字命中该来源。事实/共识/争议必须有来源，判断明确标类，不能把AI生成材料作为证据。

返回同一固定任务attempt下 `.workbench/method-results/<task>/<attempt>/<mutation>/` 的报告MD、静态可读HTML、来源账本（含任务/requestHash/brief）及各SHA256。相同mutation相同输入可重放，改变输入冲突。先核静态阅读，再用既有production import导入返回HTML，提交report artifact与真实assetHash、来源账本/文件hash，最后status核receipt；候选文件保存不会自动入正式报告库。externalVerification须反映真实核验，联网声明本身不是工具执行回执；未联网不能断言时效事实已验证。
