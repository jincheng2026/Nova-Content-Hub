# 整篇创作：同一聊天完成

固定请求 `parameters.workflow === 'content-creation'` 时必读本分支，普通分阶段任务继续使用原方法。按共同任务契约完成 context 与 claim 后，在当前助手聊天、同一个 taskId/attemptId 中连续推进整篇。

1. 读取用户需求、已保存正文、参考、拆解、叙事与已采纳知识。已有明确输入直接沿用；只有实质影响成稿的缺口才在原聊天澄清，按共同契约回写 waiting-user。宿主权限问题回写 waiting-permission，获准后在原尝试恢复；助手选择、工具清单、评论许可与预算仍以冻结请求为准。
2. 读[参考接入](reference-intake.md)，复用已有可信材料；用户要求研究时在已授权工具内寻找可核验来源。涉及音视频时读[转写与纠错](transcription.md)，涉及作品结构比较时读[视频拆解](video-analysis.md)。用户明确跳过参考则直接创作并保留证据缺口。
3. 读[叙事与写稿](writing-method.md)，在同一聊天完成拆解、叙事和一份当前完整正文；让受众收获、结构、证据和表达相互对应。保留可核实引用与不确定处，避免用阶段摘要冒充成稿。
4. 读[包装方法](packaging-method.md)，基于本次最终正文准备标题、封面短文与简介候选，保留人工选用。涉及用户否决、纠正和取舍时读[反馈与知识](feedback-method.md)，在交付说明中保留反馈依据；本轮整套采用只承载下述创作字段。
5. 读[产物结构](../../../plugin-src/resources/production-artifacts.md)，最后一次 submit 提交同一 result.artifacts 数组：研究参考用 research（data.references 完整结构）、整体拆解用 analysis、叙事用 narrative、唯一完整稿用 draft、包装用 packaging（data.packaging 的三组候选）。实际跳过的研究不伪造引用；analysis/narrative/draft/packaging 各至多一项，draft 必须有且是完整稿。一个编号只交一个明确版本，避免同一字段多候选造成覆盖歧义。
6. 提交前回读 context 核对固定正文 bodyHash，必要变化按共同契约停止并提示重新生成；提交后回读真实 status/receipt。说明已交回整套结果，等待用户在工作台完整预览并一次确认采用。聊天结束与任务验收均不代表已采用，更不代表发布成功。

整套提交使用同一原始正文版本。审稿建议、批注和拍摄确认遵循各自的独立版本和人工确认流程，整套结果不夹带 suggestions、annotations 或 filming，也不替用户选定包装候选。需要独立审稿时读取[创作协作与审稿](review-method.md)并说明下一步；不能将受旧稿约束的批注与新正文在一次采用中混套。

工作流不拆成多个助手任务或新聊天。created 尝试可从原入口重开；claimed 和两种 waiting 状态回到原聊天继续。缺少可靠会话定位时明确提示，不能把新建聊天称为恢复原会话，不能自动批准宿主权限。
