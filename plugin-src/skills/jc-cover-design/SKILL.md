---
name: jc-cover-design
description: 用户要求封面设计方案、封面提示词或对现有封面提出修改判断时使用。
---

# jc-cover-design：完整方法与运行适配

本入口 role 为 business-method、executable:false。先读[业务执行边界](../../plugin-src/resources/business-skills-contract.md)、[方法适配契约](../../plugin-src/resources/method-adaptation-contract.md)，先读取[本地映射](references/method.md)与独立[运行上下文映射](../../plugin-src/resources/method-runtime-context.json)，再完整读取[原方法正文](upstream/current/METHOD.md)。按原分支读取同目录 references、模板、schema 或必要资源，完整方法不以摘要替代。

当前 writing 任务只承载设计候选、提示词和人工确认。真正制图另走明确绑定的固定 cover 请求及既有 nova-content-cover-execution；作者确认准确设计id/hash后从同T封面入口自动传入独立固定请求，writing 任务不直接生图，也不冒充 cover submit。原作者四张本人照片与个人 config 不随运行包分发；它们在仓库中作为完整来源保留。案例中的真人只观察构图、转译文字，不能充当用户身份。用户身份、比例、VI、张数与预算来自本轮冻结请求。需要本人照片但请求中没有匹配的 own-photo 时进入 waiting-user，不从作者素材或案例回退。

直接对话按方法在当前聊天给候选；固定工作台任务才由 `nova-content-writing-execution` 读取显式 handoff、冻结请求、context 和 attempt，完成 doctor/context/claim，按真实回复保留 waiting-user / waiting-permission 及恢复，再由受控 checkpoint / submit 写入并核对 taskId、attemptId、requestHash、结果 hash 和回执。已有版本与作者手改沿用 CAS，冲突先回读。

原安装说明、脚本、旧路径、secret 读取和 Python 服务均为只读来源，不执行、不安装。仓库完整来源文件逐字节保留；运行包来源清单只列实际随包的原字节子集，distribution 记录原始完整清单 SHA256、源树摘要语义及五项未分发理由/hash，见[来源清单](../../plugin-src/resources/method-sources.json)。runtimeStatus=contract-unverified；文件随包与方法可发现不等于宿主安装、业务支持或跨平台验收。
