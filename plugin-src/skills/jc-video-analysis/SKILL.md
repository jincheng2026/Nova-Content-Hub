---
name: jc-video-analysis
description: 按真实原片、逐字稿和画面证据逐段拆解参考视频，支持用户先拆后的对比。
---

## 入口与方法

本 Skill 的 role 为 business-method。由 `nova-content-writing-execution` 依固定请求选择并读取；用户直接指定本方法时也经同一执行入口。先读 [业务执行边界](../../plugin-src/resources/business-skills-contract.md)，再读 [本方法](references/method.md)。没有独立业务写入权限。

本轮详细方法与完成条件以 references/method.md 为准；按需结合以下随包参考：

- [video-analysis](../nova-content-writing-execution/references/video-analysis.md)
- [reference-intake](../nova-content-writing-execution/references/reference-intake.md)

按共同任务契约完成 context、claim、progress、两种等待和恢复，再 submit 并核对 receipt。仅提交本任务允许的候选或明确允许的受控检查点；当前稿由工作台人工采用。来源登记见 [方法来源](../../plugin-src/resources/production-methods-provenance.md)。
