---
name: nova-content-cover
description: 为内容项目按已验收模板或内置原创设计生成封面、校验图片并登记结果；用户要出封面或按模板换标题出图时使用。
---

先读 [请求契约](references/contract.md)，运行 `node scripts/content.mjs check-request --file REQUEST.json`。仅 `executable:true` 且真实库、授权、路径与图片工具可用时继续；当前包返回 `executable:false`，停止说明尚未生成或登记图片。

输入为 HANDOFF.json 时先按 [助手交接](references/handoff.md) 运行 `node scripts/content.mjs check-handoff --file HANDOFF.json`。缺文件不推测上下文，跨助手保留来源任务 ID。模板若是 `authored-design`，按其原创设计规则和换标题参考生成，明确 AI 还原未验证；不能将设计 SVG 冒充模型生成结果。

真实能力开放后，读 [自媒体模板设计](references/media-template.md)，按 [视觉工作流的封面部分](references/visual-workflow.md#封面) 工作：

1. 从已验收模板或可信内置设计快照核对标题、规格、数量、固定规则和本次变量，明确每张参考图的作用。优先级为用户本次要求、请求快照、模板约束；存在实质冲突先指出，不静默改模板或标题。
2. 用模板的 `generation.promptTemplate` 与已声明变量组织提示，核对区域叠层、固定/变化规则、主体和准确标题。通用与 AI 模板按实际内容结构处理，AI 实测的输入、结果、限制必须有资料依据。输入已完整时直接执行，避免重复询问已经选好的参数。
3. 在 CLI 返回的暂存区记录完整提示、参考清单与实际使用工具。调用用户指定且真实可用的图像工具；缺能力就报告缺项，不自动安装后端、读取其他产品密钥或改走收费 API。几何占位图不计作 AI 生成封面。
4. 查看每张实际图片；尺寸/数量由适配器校验，标题逐字、构图、安全区和风格由视觉检查并交用户验收。返工保留旧候选，只修改明确偏差；重试与新增调用须在用户授权数量内。

报告每张候选的文件与检查结论；部分失败单独保留，不伪装整批成功。适配器登记通过后仍待用户选定，不能自动记发布。方法来源与许可见 [借鉴说明](references/upstream-notices.md)。
