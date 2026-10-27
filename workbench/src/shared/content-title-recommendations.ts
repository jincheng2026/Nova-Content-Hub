import type {Content, Draft} from './contracts.ts';
import type {ProductionCreation, ProductionCreationState, ProductionTask} from './production-contracts.ts';

export interface ContentTitleRecommendation {
    key: string; text: string; source: string; stale: boolean; contentId: string; editToken: string;
}
const validTitle = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 500;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

// Read the existing packaging contract. Submission is never enough to offer adoption.
export function collectTitleRecommendations({content, creation, tasks}: {
    content: ProductionCreationState['content']; creation: ProductionCreation | null; tasks: ProductionTask[];
}): ContentTitleRecommendation[] {
    const titles: ContentTitleRecommendation[] = [];
    const add = (values: unknown, prefix: string, source: string, stale: boolean) => {
        if (!Array.isArray(values)) return;
        values.forEach((value, index) => {
            if (!record(value) || typeof value.id !== 'string' || !validTitle(value.text)) return;
            titles.push({key: `${prefix}:${value.id}:${index}`, text: value.text, source, stale, contentId: content.id, editToken: content.editToken});
        });
    };
    if (creation?.contentId === content.id) add(creation.packaging.titles, 'saved', '已保存的标题候选', false);
    for (const task of tasks) {
        if (task.contentId !== content.id) continue;
        const attempt = task.attempts.find(value => value.id === task.activeAttemptId);
        if (attempt?.status !== 'accepted' || !attempt.receipt || attempt.receipt.taskId !== task.id || attempt.receipt.attemptId !== attempt.id || attempt.receipt.requestHash !== task.requestHash) continue;
        for (const artifact of attempt.result?.artifacts ?? []) {
            if (artifact.kind !== 'packaging' || !record(artifact.data)) continue;
            const data = record(artifact.data.packaging) ? artifact.data.packaging : artifact.data;
            add(data.titles, `${task.id}:${attempt.id}:${artifact.id}`, task.title, task.request.bodyHash !== content.bodyHash);
        }
    }
    return titles;
}

// Adoption only stages the title in App's original draft. App's existing save owns persistence/CAS.
export function adoptTitleRecommendation(content: Content | null, draft: Draft | null, candidate: ContentTitleRecommendation): Draft {
    if (!content || !draft || content.deletedAt || content.id !== candidate.contentId || content.editToken !== candidate.editToken) throw new Error('内容版本已改变，请读取最新候选后再采用；当前草稿已保留。');
    if (draft.title !== content.title || draft.body !== content.body) throw new Error('请先保存或放弃当前标题与正文修改，再采用推荐标题。');
    if (!validTitle(candidate.text)) throw new Error('推荐标题须为 1–500 字，请在创作页核对候选。');
    return {...draft, title: candidate.text};
}
