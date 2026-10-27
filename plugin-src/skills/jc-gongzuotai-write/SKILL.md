---
name: jc-gongzuotai-write
description: 用户要求读回创作页、处理手改批注、逐句建议、录完稿或包装时使用。
---

# jc-gongzuotai-write：完整方法与运行适配

本入口 role 为 business-method。执行前先读[业务执行边界](../../plugin-src/resources/business-skills-contract.md)与[方法适配契约](../../plugin-src/resources/method-adaptation-contract.md)，再完整读取[原方法正文](upstream/current/METHOD.md)。原文不是摘要：按原方法分支读取同目录 references、schema、模板及必要资源，完成其人的判断、停等和质量核验；[本地适配](references/method.md)只映射运行，不替代原文。

固定工作台任务由 `nova-content-writing-execution` 读取冻结请求、context 和当前 attempt，依据方法保留中途确认，再经受控 checkpoint / submit 交回并核对回执。直接文字讨论只在当前聊天给候选，不猜库、不自动 claim 或 submit；涉及真实保存先取得明确绑定的工作台任务。

原文旧路径、原 CLI、Python 服务、安装、采集、付费与发布命令只读，执行行为使用当前 adapter 和冻结权限；缺少对应能力时交付可读候选并明确未保存/未执行。完整文件来源与 hash 见[来源清单](../../plugin-src/resources/method-sources.json)，不以随包原件声称原服务已安装、宿主已支持或业务验收已通过。
