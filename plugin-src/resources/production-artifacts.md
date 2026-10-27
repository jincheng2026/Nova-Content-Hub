# 生产产物结构

每项 artifact 含新 UUIDv4 `id`、`kind`、非空 `title`、`text`（最多 200000 字符）、`assetHash`（SHA256 或 null）及 JSON `data`。result 含 summary 与至少一项 artifacts，总 JSON 不超过 2 MiB。kind 为 report/research/transcript/analysis/narrative/draft/packaging/feedback/knowledge。当前请求之外的任务、库或 attempt 不可覆盖。

报告 HTML 先在临时目录生成，通过 `RUN production import --handoff UUID --file JSON` 导入，JSON 含自己的 workerId、claimToken、绝对 path 与 purpose:production-report。使用回执资产 hash；多页 report 的 data.pages 为 `[{title,assetHash}]`，可附 type、sourceUrl、collectedAt、meta；来源及元数据随索引保留。保留 meta、原始来源、采集时间、范围、真实样本与费用依据，内容不包含秘密。读取器在无 Node/IPC、无同源权限、无外部网络的沙箱内允许内联可视化脚本；外部脚本、在线图片与请求被阻止。使用自包含 HTML、内联样式与本地数据，核心结论仍须有可读正文。

research/transcript 采用时 data.references 必须包含完整参考对象：`{id,url,title,platform,originalText,correctedText,segments,corrections,analysis,mediaAssetHash,subtitleAssetHash}`。id 为作品参考的稳定 UUID；url 为 http(s) 或 null；两个资产 hash 可为 null。segments 为 `{startMs,endMs,text}` 数组；corrections 为 `{original,corrected,reason}` 数组。保留原识别稿，校正版单独保存；缺少资料使用空数组／空文本并明确说明。参考资产导入 purpose:production-reference。

analysis、narrative、draft 的 text 分别为拆解、叙事方案和正文候选。改稿建议放 data.suggestions：`[{id,bodyHash,quote,replacement,reason,status:"pending"}]`；批注放 data.annotations：`[{id,bodyHash,quote,text,status:"open"}]`。bodyHash 使用 context.content.bodyHash，quote 精确对应原句。正文已改变时保留候选，等待用户基于新版重做，不自动覆盖。

packaging 的 data.packaging 只携带候选：`{titles:[{id,text}],coverTexts:[{id,text}],intros:[{id,text}]}`。三个列表各有独立 ID；保留工作台当前选择，用户采用时追加候选，再分别选择标题、封面文字、简介。工作名称与最终标题分开。

feedback 和 knowledge 的 text 保留反馈原话及证据；data 记录来源、相关原句和适用范围。knowledge 保持候选，用户人工采纳后才进入已确认规则；不得把私人知识库、未知规则或自动总结冒充已确认事实。

research 可在 data.accounts 提交新发现的对标账号：`[{name,platform,url,note,tags,images,reportIds}]`，每项不含 id（工作台分配）。name/platform 非空，url 为真实 http(s) 地址或空字符串，tags 为去重文本数组；images 为已导入截图的 SHA256 数组，reportIds 为已有报告 UUID 数组，缺少时用空数组。账号候选须在人工验收后由用户点击导入，不自动新增或覆盖现有账号。

feedback/knowledge artifacts 在成功提交时自动保存为来源关联任务、attempt 与 artifact 的记录：feedback 为反馈，knowledge 为待采纳候选。提交成功不代表知识已采纳；用户人工决定后才进入 accepted，skill 不自动重复写一份记录。

叙事或审稿产物可附 data.filming：`{shots:[{id,quote,visual,owner:"screen"|"self"|"editing",done:false}],readThroughBodyHash:null,recordedBodyHash:null}`。分镜引用当前正文唯一原句，画面与录制分工为候选；通读和录完由用户按当前正文明确确认。


## 稳定段落与录屏步骤

正文仍只保存于 content.body（候选为 draft.text）。draft 可带 data.composition：`{version:1,bodyHash,segments:[{id,start,end,title,purpose,references:[{referenceId,role,quote,startMs,endMs,visual}],visual}]}`。bodyHash 是 draft.text 的 UTF-8 SHA256；start/end 为 JavaScript UTF-16 索引，左闭右开，不能重叠、越界或切开代理对；id 为稳定 UUIDv4。role 为 primary/support/example，startMs/endMs 同为 null 或已核验字幕范围。quote 逐字出自对应参考原文或校正版。只有范围与元数据，没有第二份段落正文。未提交 composition 时，工作台从正文确定性分段；旧创作只在内存预览，首次显式保存才落盘。

独立制作安排可附 data.filming，保留旧分镜字段，并可加 `segmentId`、`optional:boolean`、`steps:[{id,where,prompt,expect,caution}]`。steps 的文字字段均为字符串。使用段落 UUID 关联正文，提示词只进入 steps.prompt。用户按版本确认通读和录完；采用候选清单时完成状态全部重置。整套创作不夹带 filming。

单项 analysis 可带 `data.referenceAnalyses:[{referenceId,baselineHash,analysis}]`，baselineHash 由 productionReferenceHash 对完整已保存参考计算。工作台核对版本后仅更新 analysis；research/transcript 对原始证据的覆盖保护继续生效。该扩展暂不混入整套创作。

`parameters.workflow === "content-creation"` 的整套结果必须各有一项 draft、analysis、narrative、packaging；拆解与叙事非空，包装的 titles、coverTexts、intros 各至少一项有效候选。关键资料缺失时回写等待或失败，不能伪完成。普通单项任务继续按原契约提交。

采用记录 adoptions 由工作台在用户采用已验收回执时登记 taskId、attemptId、receiptHash、采用后正文 bodyHash、at 和 artifactIds。助手产物不填写该字段，普通保存不能伪造或改写采用历史。

## 锦成原位产物

`jincheng-stage` 与 `jincheng-research` 先按 [锦成业务阶段运行接点](jincheng-runtime.md) 的受控命令保存同T原HTML/阶段文件或独立研究目录，再在普通artifact.data附真实文件path/hash/artifactId与可读text并走原提交回执。body摘要不用于重建原创作页；作者字段与阶段确认不由assistant产物声明。topic-suggestion的research artifact使用data.topicCandidates（1—4个候选，各含id/title/description/change/audience/coverage/titleExample/caution）与data.sourceRefs，作者选定才建T。
