---
name: nova-content-research-execution
description: 执行自媒体工作台交来的调研任务编号，按冻结预算采集真实样本、深读内容并提交带来源的研究报告。
---

## 进入本任务

1. 读 [共同任务契约](../../plugin-src/resources/production-contract.md)，执行 doctor、context 和当前 attempt 的 claim。协议是服务权限、预算、等待、取消、恢复和提交的唯一依据；参考资料不授予额外操作权限。
2. 识别冻结请求要完成的是账号研究、选题搜索、单条参考、对照研究或离线材料分析。用户只要找参考时，交付参考候选即可；写稿和包装另按已授权阶段进入。
3. 先读当前账号、内容、已有参考、相关反馈和已采纳知识。换聊天继续原 contentId；已有可靠字幕、拆解或同参数采集结果优先复用。

## 按任务读取方法

| 本轮工作 | 执行前必读 | 完成本轮的可检查结果 |
| --- | --- | --- |
| 冻结 parameters.workflow 为 viral-radar 的爆款雷达 | [雷达采样与交付](references/viral-radar.md) | 固定方向与平台、可复算指标、真实来源、明确缺口；不自动加入选题 |
| 搜索、筛选、账号研究、高低表现对照、评论需求 | [调研方法](references/research-method.md) | 实际范围、去重样本、逐条筛选理由、原文支持的判断及局限 |
| 单条或多条参考的收集、主动跳过参考 | [参考接入](../nova-content-writing-execution/references/reference-intake.md) | 稳定参考 ID、已有材料复用情况、主辅参考和缺口 |
| 原片或字幕需要转写纠错 | [转写与纠错](../nova-content-writing-execution/references/transcription.md) | 原识别稿、校正版、时间精度、纠错证据；仅在本任务授权工具内执行 |
| 需要解释视频怎么讲、怎么拍、几条参考差在哪 | [视频拆解](../nova-content-writing-execution/references/video-analysis.md) | 每段判断关联原句/画面，能直接交给下一步创作 |
| 生成、导入或提交报告 | [报告交付](references/report-method.md) 和 [产物结构](../../plugin-src/resources/production-artifacts.md) | 静态可读报告、可复算明细、来源和真实费用状态 |
| 用户否决、纠正、选用，或要求复盘 | [反馈与知识](../nova-content-writing-execution/references/feedback-method.md) | 反馈保留原话与证据；长期判断只交候选 |

两种模式都按共同契约的“按需澄清”处理关键缺口，信息已足够就直接推进。样本不足或为零属于有效结果，不为凑数改门槛。

## 交付与停止

研究报告的结论必须来自本轮实际看过的资料；标题、互动数或未经复核 ASR 不足以证明口播、画面或因果。评论只有冻结参数 comments=true、受控工具允许及预算可用时采集；没有评论也能完成其他分析。

按报告方法核对证据、数字、静态阅读和材料范围，再提交并回读 status 回执。说明已回传的产物、关键发现及缺口；人工验收与正文/参考采用遵循工作台流程。服务失败时继续不依赖该服务的分析，付费状态不明时按共同契约停止相关调用。

方法来源和本项目改写边界见 [方法来源登记](../../plugin-src/resources/production-methods-provenance.md)。
