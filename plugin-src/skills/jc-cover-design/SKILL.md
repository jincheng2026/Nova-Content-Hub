---
name: jc-cover-design
description: 用户要求封面设计方案、封面提示词或对现有封面提出修改判断时使用。
---

# jc-cover-design：完整方法与运行适配

本入口 role 为 business-method、executable:false。先读[业务执行边界](../../plugin-src/resources/business-skills-contract.md)、[方法适配契约](../../plugin-src/resources/method-adaptation-contract.md)，再完整读取[原方法正文](upstream/current/METHOD.md)与[本地映射](references/method.md)。按原分支读取同目录 references、模板、schema 或必要资源，完整方法不以摘要替代。

当前 writing 任务只承载设计候选、提示词和人工确认。真正制图另走明确绑定的固定 cover 请求及既有 nova-content-cover-execution；本方法不新增自动路由，writing 任务不直接生图，也不冒充 cover submit。包中作者照片与案例只用于来源证据，用户身份、比例、VI、张数与预算来自本轮冻结请求。

直接对话按方法在当前聊天给候选；固定工作台任务才由 `nova-content-writing-execution` 读取显式 handoff、冻结请求、context 和 attempt，完成 doctor/context/claim，按真实回复保留 waiting-user / waiting-permission 及恢复，再由受控 checkpoint / submit 写入并核对 taskId、attemptId、requestHash、结果 hash 和回执。已有版本与作者手改沿用 CAS，冲突先回读。

原安装说明、脚本、旧路径、secret 读取和 Python 服务均为只读来源，不执行、不安装。完整来源文件逐字节保留，来源状态与 hash 见[来源清单](../../plugin-src/resources/method-sources.json)。runtimeStatus=contract-unverified；文件随包与方法可发现不等于宿主安装、业务支持或跨平台验收。
