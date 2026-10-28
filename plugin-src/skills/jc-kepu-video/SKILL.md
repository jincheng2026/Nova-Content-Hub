---
name: jc-kepu-video
description: 仅当用户显式选择科普视频逐段口述共创方法时使用；普通概念解释不启用视频写稿流程。
---

# jc-kepu-video：完整方法与运行适配

本入口 role 为 business-method、executable:false。先读[业务执行边界](../../plugin-src/resources/business-skills-contract.md)、[方法适配契约](../../plugin-src/resources/method-adaptation-contract.md)，再完整读取[原方法正文](upstream/current/METHOD.md)与[本地映射](references/method.md)。按原分支读取同目录 references、模板、schema 或必要资源，完整方法不以摘要替代。

仅在用户显式选择本方法时启用，普通写稿、解释概念、content-creation 或稿件类型本身不构成选择。完整保留叙事确认、框架确认、先摆真实参考、本人逐段口述整理和改稿日志；当前用户的定位与经历来自本人已授权资料，原作者的合集和样本不成为新用户默认定位。

直接对话按方法在当前聊天给候选；固定工作台任务才由 `nova-content-writing-execution` 读取显式 handoff、冻结请求、context 和 attempt，完成 doctor/context/claim，按真实回复保留 waiting-user / waiting-permission 及恢复，再由受控 checkpoint / submit 写入并核对 taskId、attemptId、requestHash、结果 hash 和回执。已有版本与作者手改沿用 CAS，冲突先回读。

原安装说明、脚本、旧路径、secret 读取和 Python 服务均为只读来源，不执行、不安装。完整来源文件逐字节保留，来源状态与 hash 见[来源清单](../../plugin-src/resources/method-sources.json)。runtimeStatus=contract-unverified；文件随包与方法可发现不等于宿主安装、业务支持或跨平台验收。
