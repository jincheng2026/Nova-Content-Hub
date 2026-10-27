---
name: jc-jiaocheng-video
description: 仅当用户显式选择教程或观点口播共创方法时使用。
---

# jc-jiaocheng-video：完整方法与运行适配

本入口 role 为 business-method。执行前先读[业务执行边界](../../plugin-src/resources/business-skills-contract.md)与[方法适配契约](../../plugin-src/resources/method-adaptation-contract.md)，再完整读取[原方法正文](upstream/current/METHOD.md)。原文不是摘要：按原方法分支读取同目录 references、schema、模板及必要资源，完成其人的判断、停等和质量核验；[本地适配](references/method.md)只映射运行，不替代原文。

仅在用户显式选择本方法时启用；content-creation、叙事或写稿阶段本身不构成选择。完整原文中的叙事确认、重点段落通过再补完整稿、本人样本和手改对照均保留；新用户使用其本人已授权样本，原作者样本只作结构参考。

固定工作台任务由 `nova-content-writing-execution` 读取冻结请求、context 和当前 attempt，依据方法保留中途确认，再经受控 checkpoint / submit 交回并核对回执。直接文字讨论只在当前聊天给候选，不猜库、不自动 claim 或 submit；涉及真实保存先取得明确绑定的工作台任务。

原文旧路径、原 CLI、Python 服务、安装、采集、付费与发布命令只读，执行行为使用当前 adapter 和冻结权限；缺少对应能力时交付可读候选并明确未保存/未执行。完整文件来源与 hash 见[来源清单](../../plugin-src/resources/method-sources.json)，不以随包原件声称原服务已安装、宿主已支持或业务验收已通过。
