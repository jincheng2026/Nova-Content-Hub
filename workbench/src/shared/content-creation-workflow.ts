// Frozen instructions for one content-bound task; this adds no tools or spending consent.
export function contentCreationPrompt(requirement: string): string {
    return `${requirement}\n\n整篇创作流程：在同一个助手聊天、同一任务与尝试中连续完成研究与参考→分析拆解→叙事方案→完整正文→标题、封面文字和简介包装。没有标题也可以开始；若只有资料或想法，先读取插件里的 xindao-xuanti 选题方法，结合固定个人定位推荐方向，在原聊天以 waiting-user 等用户选择后继续，不把未命名占位或建议选题当成已确认标题。最终标题在正文明确后再推荐并由用户决定。按需读取写作技能的方法；若用户明确跳过参考则遵从并说明材料缺口。沿用固定请求的工具、评论许可和预算，不扩大权限。必要澄清与权限等待在原聊天回写并恢复，不拆成多个新任务或新聊天。最后一次 submit 提交完整产物数组：可核验参考用 research 的 data.references、拆解用 analysis、叙事用 narrative、唯一完整稿用 draft、包装用 packaging 的 data.packaging。只提交一份 draft、一份 analysis、一份 narrative 与一份 packaging，不夹带审稿 suggestions/annotations 或 filming；需要这些独立能力时说明另行处理。包装保留人工选择，不直接修改或发布内容。交付前核对固定正文 bodyHash，回读真实 receipt，等待工作台整套预览和一次确认采用。`;
}
