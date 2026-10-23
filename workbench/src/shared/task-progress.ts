import type {Assistant, Attempt, TaskProgressView} from './cover-contracts.ts';
export function assistantSessionURL(host: Assistant, sessionId: string): string {
    if (!['codex', 'workbuddy'].includes(host) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(sessionId)) throw new Error('无效的助手会话编号。');
    return `${host}://${host === 'codex' ? 'threads' : 'chat'}/${sessionId}`;
}
const phaseNames = {reading: '助手报告：读取资料', generating: '助手报告：生成图片', validating: '助手报告：校验结果', analyzing: '助手报告：分析模板', restoring: '助手报告：还原样图'};
export function assistantLaunchNotice(attempt?: Attempt): string {
    return attempt && (attempt.status === 'claimed' || attempt.progress)
        ? '请在原任务中回复或确认；进度以助手回写为准。'
        : '任务已准备，尚未收到助手接单记录。如果还没发送，请在助手中选择模型并手动发送；接单与进度以助手回写为准。';
}
export function taskProgressLabel(attempt: Attempt): string {
    if (attempt.status === 'committed') return '已完成回传';
    if (attempt.status === 'failed') return '失败';
    if (attempt.status === 'cancelled') return '已取消';
    if (attempt.status === 'superseded') return '已替换';
    if (attempt.progress?.state === 'waiting-user') return '待你确认';
    if (attempt.progress?.state === 'waiting-permission') return '待你允许';
    if (attempt.progress) return phaseNames[attempt.progress.phase];
    return attempt.status === 'claimed' ? '助手已接单' : '待助手接单';
}
export function taskStatusChanged(jobs: {id: string; activeAttemptId: string | null; attempts: Attempt[]}[], snapshot: TaskProgressView): boolean {
    return jobs.some(job => {const next = snapshot.jobs.find(j => j.id === job.id); return !next || next.activeAttemptId !== job.activeAttemptId || job.attempts.some(a => {const status = next.attempts.find(p => p.attemptId === a.attemptId)?.status; return status !== a.status && status !== 'claimed';});}) || snapshot.jobs.length !== jobs.length;
}
export function mergeTaskProgress<T extends {id: string; attempts: Attempt[]}>(jobs: T[], snapshot: TaskProgressView): T[] {
    return jobs.map(job => ({...job, attempts: job.attempts.map(a => {const p = snapshot.jobs.find(j => j.id === job.id)?.attempts.find(p => p.attemptId === a.attemptId); return p && (!p.progress || !a.progress || p.progress.revision >= a.progress.revision) ? {...a, status: p.status, progress: p.progress, progressUnavailable: p.progressUnavailable} : a;})}));
}
