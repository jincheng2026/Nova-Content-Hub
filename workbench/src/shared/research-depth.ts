// UI descriptions and frozen assistant requirements share one definition.
export const researchDepths = {
    simple: {
        label: '简单调研', goal: '先判断方向',
        suitable: '适合初步了解领域、筛选值得继续研究的方向。',
        deliverables: ['相关账号与代表作品，附真实来源', '主要内容方向、初步观察与选题建议'],
        effort: '优先已有资料，围绕问题做重点梳理。',
    },
    detailed: {
        label: '精细调研', goal: '为具体创作做准备',
        suitable: '适合确定对标、拆解表达，形成下一篇的创作依据。',
        deliverables: ['相关账号与代表作品，附真实来源', '代表作品原文深读与适用画面分析', '开头、结构、表达的对照；样本允许时比较高表现与普通作品', '可借方法、适用条件与证据缺口'],
        effort: '深读与交叉对照通常更耗时，也可能增加采集请求。',
    },
} as const;
export type ResearchDepth = keyof typeof researchDepths;
export function researchDepthRequirements(mode: ResearchDepth) {
    return {...researchDepths[mode], constraints: '围绕用户本轮问题，不自动扩大平台、时间或样本范围。样本不足时如实交付缺口，不凑数；评论须本任务单独授权，所有采集遵守冻结预算，不保证固定时长或费用。'};
}
export function researchTaskTitle(title: string, prompt: string): string {
    return title.trim() || prompt.trim().replace(/\s+/g, ' ').slice(0, 80);
}
