---
name: nova-content-writing-execution
description: 执行自媒体工作台的参考转写、视频拆解、内容共创、改稿、标题封面简介与反馈任务，将候选交回当前内容。
---

## 进入本任务

1. 按 [共同任务契约](../../plugin-src/resources/production-contract.md) 执行 doctor、context、claim；等待、恢复、取消、服务调用与提交均以它为准。Codex 与 WorkBuddy 使用同一流程。
2. 完整读冻结请求、当前正文、参考、叙事、批注、建议决定及已采纳知识；只追溯与当前问题相关的历史任务和反馈。用户已确认的观点、口气和制作条件直接沿用。
3. 根据本轮请求选择下面的方法；叙事等关键缺口按共同契约的“按需澄清”处理。明确要求直接写稿、局部修改或跳过参考时按其要求执行，已有明确输入直接沿用。

## 按阶段读取方法

| 本轮工作 | 执行前必读 | 完成条件 |
| --- | --- | --- |
| 找参考、复用已有作品、手动链接或无参考创作 | [参考接入](references/reference-intake.md) | 参考稳定 ID、来源、主辅用途、已有转写与拆解复用 |
| 语音转文字、字幕校对 | [转写与纠错](references/transcription.md) | 原稿、校正版、时间精度和逐条纠错依据齐全 |
| 拆视频、比多条参考、用户先拆再对比 | [视频拆解](references/video-analysis.md) | 段落和整片分析都有原文/画面依据，分清可借方法与适用条件 |
| 叙事、教程/口播/科普初稿、教程画面及录制清单 | [叙事与写稿](references/writing-method.md) | 明确的受众收获、可核实证据、当前完整稿和可执行制作安排 |
| 审稿、读回手改与批注、提出逐句建议 | [创作协作与审稿](references/review-method.md) | 基于最新正文的准确引用、修改理由、逐条批注回应及变更记录 |
| 独立标题、封面文字、简介、发布素材 | [包装方法](references/packaging-method.md) | 三组候选各自独立，用户选定值不被暗改 |
| 用户反馈、改稿取舍、阶段总结、复盘 | [反馈与知识](references/feedback-method.md) | 原话、变更、原因性质、采用证据和适用边界可追溯 |

反馈是各阶段伴随工作：发生明确否决、纠正、手改或确认时就读反馈方法，不等到发布后；用户要求只讨论时遵从本轮限制。

## 产物与验收

提交前读 [产物结构](../../plugin-src/resources/production-artifacts.md)。方法文档中的分析表和制作清单是内容组织方式，不自行给受校验的 creation/reference/packaging 对象增加字段。已有 schema 承载不了的详细方法证据放对应 artifact.text 或允许的 artifact.data，并在 text 保留能独立读懂的证据；不声称已显示成专用页面控件。

创作页始终使用工作台入口和同一正文；AI 提交 draft、建议及资料候选，用户人工采用后才更新正文。交付前重新读取 context 核对正文版本，按契约 submit 后回读 status/receipt；说明已交回什么、还需核对什么。素材缺失时保留真实缺口，不以填满阶段表代替完成。

方法来源和本项目改写边界见 [方法来源登记](../../plugin-src/resources/production-methods-provenance.md)。
