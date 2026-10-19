---
name: nova-content-template-restore
description: 依据已拆解模板做原样还原或换标题测试，并对照参考图等待人工验收；用户要验证模板学得是否准确时使用。
---

先读 [请求契约](references/contract.md)，运行 `node scripts/content.mjs check-request --file REQUEST.json`。仅
`executable:true` 且真实路径、授权与生成能力可用时继续；当前包返回 `executable:false`，遇到 unavailable、AUTH_NOT_CONFIGURED
或 NOT_IMPLEMENTED 即停止，说明尚未生成或更新模板状态。

输入为 HANDOFF.json 时先按 [助手交接](references/handoff.md) 运行
`node scripts/content.mjs check-handoff --file HANDOFF.json`。完整文件与可执行检查缺一则停止。内置 `authored-design`
参考是原创矢量设计，`aiTested:false`；不能将其已有“可用”状态当成 AI 还原验收通过。

真实能力开放后，读 [自媒体模板设计的还原与泛化](references/media-template.md#还原与泛化)
，按 [视觉工作流的还原部分](references/visual-workflow.md#还原) 工作：

1. 固定模板版本、规则与原图快照；逐张标明是版式参考、配色参考还是获准复用的主体。来源人物与账号信息默认不复用。
2. 按用户指定工具及宿主真实能力选择生成路径；在适配器返回的任务暂存区保存本次完整提示与参考对应关系。无法落盘或缺少参考能力时明确报告，不把文字描述冒充已加载的图片。
3. 先按用户指定目标做还原；来源原图与已有来源标记保留为对照基线，不将还原变为去水印。换标题新创封面遵循 `media-template.md` 的“新创封面的干净输出”，原样还原则只请求不额外添加本次工具品牌或水印，保持其余约束固定。三个差异标题测试需要用户已授权该数量，不自动扩大一次出图或重试范围。
4. 保留工具返回的全部原字节、标识和元数据，复制时核对 SHA256；不裁切、缩放、重编码或去水印。宿主仍叠加标识时说明位置与不能保证关闭的限制。查看真实结果，按尺寸、标题逐字准确性、层级、构图与固定规则逐项对照。修订只改一个主要变量，保留上一候选。未经用户允许不改写标题，不以遮盖位图文字伪造修复。

输出实际图、所用提示与参考、逐项偏差和失败原因；未检查的项记为未知。只有用户明确验收后才可由适配器记录模板可用；工具返回、Hook
停止和自评相似均不能代替人工验收。方法来源与许可见 [借鉴说明](references/upstream-notices.md)。
