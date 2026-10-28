# 内容主线执行契约

适用于固定 `workflow=content-journey` 根任务，以及带可信 `journeyMember` 的子任务。Codex、WorkBuddy 使用同一业务契约；实际宿主与平台支持以验收记录为准。业务方法继续完整读取原方法正文与当前阶段资源。

## 根与当前聊天

1. 从明确 handoff 读取 `production context --handoff UUID`。根 `tools=[]`，它只协调当前内容，不执行业务或通用 submit。
2. 首次根 attempt 为 `created` 且无待接续挑战时，通过 `production claim` 提交自己生成的 UUID claimToken 和稳定 workerId，保存身份供当前聊天后续操作。两种等待状态使用原 progress 合同；恢复不批准宿主权限、不创建聊天。
3. 执行 `content-journey context --handoff ROOT_UUID --stdin`，stdin 为 `{}`。完整读返回的 root、child 与 handoff。对新 child 使用返回的 UUID 读 production context；通过 `production claim` 领取，workerId 与 root 相同，另生成 child claimToken，并带 `rootClaimToken`。每步身份各自绑定，旧 child 权限不能用于后继。
4. 按 child 冻结的 workflow/stage/businessSkill 执行受限研究或原页命令。业务方法的确认点必须等作者在工作台对准确版本作决定。助手转述同意不构成确认。
5. 当前步骤产物已落库并经作者决定后，在根 handoff 上执行 `content-journey advance`，stdin：

```json
{"claimToken":"ROOT_CLAIM_UUID","workerId":"SAME_WORKER","input":{"expectedJourneyRevision":1,"expectedStepId":"CURRENT_STEP_UUID","mutationId":"NEW_UUID"}}
```

成功回读返回的准确 root/child/handoff，下一步继续步骤3。`handoff.url=null` 表示在当前聊天继续；阶段推进不会打开新聊天。失败或响应丢失，保留原mutationId和完整输入重放，不创建替代任务。泛用 submit 不能完成主线或子步骤。根只有核验作者保存的最终资产后才进入 complete。

## 作者材料与观点

`author-materials` 是素材包与本人访谈阶段。按 jc-content-writer 逐个提出3—5问，每次复述后再问下一题，保留本人回答、明确取舍和待核查事项。通过 `jincheng-workflow materials` 保存以下固定 data，不写完整初稿：

```json
{"claimToken":"CHILD_CLAIM_UUID","workerId":"SAME_WORKER","input":{"data":{"version":1,"work":{"vaultId":"FIXED_VAULT","workId":"T123"},"audience":"具体读者","goal":"本篇解决的问题","materials":[{"id":"current","source":{"kind":"current-source","documentId":"FIXED_DOCUMENT","relativePath":"FIXED_PATH","hash":"FIXED_HASH"},"summary":"来源中的事实或作者原话","use":"use","reason":"作者采用或排除的理由"}],"interview":[{"question":"第一问","authorAnswer":"本人回答原话","understanding":"只复述，不增加观点"},{"question":"第二问","authorAnswer":"本人回答原话","understanding":"复述"},{"question":"第三问","authorAnswer":"本人回答原话","understanding":"复述"}],"choices":[{"choice":"本人明确选择","reason":"本人依据"}],"gaps":[],"draftBrief":{"promise":"读者收获","angle":"作者切入判断","voice":"作者口气"}}}}
```

来源变体各有固定字段，完整引用实际已登记证据，hash均为当前字节SHA256：

- `research`：kind、taskId、attemptId、requestHash、researchId、reportHash。只接受同主线已核验报告。
- `analysis`：kind、artifactId、hash。只接受已确认拆解checkpoint。
- `media`：kind、taskId、attemptId、requestHash、researchId、videoId、mediaHash。原片须对应成功结算的来源与真实资产；缺转写须加 `TRANSCRIPT_UNAVAILABLE` 缺口，detail写明videoId。
- `transcript`：media字段加rawHash、correctedHash（没有校正版为null）、timing（`none`或`segments`）。对应真实转写原稿、校正版及原始时间轴；缺时间码必须加 `TIMING_UNAVAILABLE`，不能填造segments。

每个已完成研究与拆解都要进入材料清单，可用 `use=exclude` 配合作者理由说明不采用。研究未取得原片时加 `MEDIA_UNAVAILABLE`，detail写明researchId。gaps条目固定为code、detail、impact。保存成功后回读材料包与阶段回执，等待工作台对该准确版本确认；不以材料包代替完整原页。

## 原页、包装与最终资产

写稿首次通过原jincheng-creation build生成同T完整原创作页。已有页先完整read，以同条目建议、回复和精确revision再生成处理；mine、note、decision、approved、final等作者字段由原页保护。主线review-page先通过原 `jincheng-creation review` 将逐句建议写回同一原页，由作者逐条决定。作者保存后在工作台明确继续最新稿，再运行 `jincheng-workflow review-checkpoint --handoff CHILD_UUID --stdin`，input固定为 `{"expectedRevision":"CURRENT_HTML_HASH","mode":"suggestions","summary":"逐句审定说明"}`。服务端核对真实原页、受控review回执、每条作者决定，并把完整原文与准确版本保存进审定产物；再等作者确认。确实无需修改时mode为`no-changes`，服务端同样读取完整当前原页并保存逐句全文，作者需对这个准确“本版无需修改”产物明确确认；有未决建议、旧revision、摘要Markdown均不能推进。

作者保存改变了原页时，先回工作台明确“继续我的最新稿”。该动作必须引用准确作者保存回执；正文改变退回写稿，包装选择改变使依赖它的下游失效。旧attempt不能替代新步骤领取。未明确选择教程/科普时沿用普通写稿；明确选择时保留其全部框架与逐段门禁。

cover-copy只添加候选，作者在原页选定标题、简介和封面文字。cover-design等待准确设计确认；封面生成使用独立封面任务，失败或取消不改正文。final-assets阶段等待作者在工作台预览并保存最终资产。advance核验同work、当前原页/包装、准确设计、当前已选生成封面、author-save receipt、manifest与每份文件当前bytes；缺失或旧资产继续等待，聊天结束和普通draft不算完成。

## 明确换聊天或换助手

`content-journey lookup --library ABSOLUTE_VAULT --work T123`仅只读定位；库与T都必须由用户明确给出。它不领取、不迁移、不修复待恢复事务、不访问凭证或服务。歧义与待恢复状态交工作台核对。

作者在工作台明确准备接续后，新的root handoff和一次性challenge仅交给所选聊天。先读固定context，再 `content-journey claim-continuation --handoff NEW_ROOT_UUID --stdin`：

```json
{"claimToken":"NEW_ROOT_CLAIM_UUID","workerId":"NEW_WORKER","input":{"challenge":"AUTHOR_TRANSFERRED_ONE_TIME_CHALLENGE","expectedJourneyRevision":2,"mutationId":"NEW_UUID"}}
```

挑战15分钟有效，一次消费；通用production claim不能跳过。不要把挑战、claim、服务凭证写入进度、报告或公共复制文本。过期或响应不明回工作台显式重新签发；旧身份不会复活。没有可靠宿主session ID时，打开助手只表示聚焦应用，用户手动选择原聊天。已登记研究/媒体继续使用前，领取当前child，再运行 `production rebind-evidence --handoff CHILD_UUID --stdin`，输入 `{"claimToken":"NEW_CHILD_CLAIM","workerId":"NEW_WORKER","sourceTaskId":"ORIGINAL_SAME_PLAN_TASK","sourceAttemptId":"ORIGINAL_ATTEMPT","mutationId":"NEW_UUID"}`。从root成员历史与原研究回执核对sourceTaskId/attemptId，不猜其他任务。服务端重核同主线、同固定计划、已成功结算请求、原始响应hash与当前原片/转写字节，登记只读来源绑定。之后用原researchId读取status/derive-samples等，已有原片和转写复用而不重复花费。缺证据时保持缺口，不复制旧claim/grant、不扩大媒体额度。
