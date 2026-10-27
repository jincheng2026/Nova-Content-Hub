import type {ProductionAccount, ProductionReport, ProductionTask} from './production-contracts.ts';
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export function accountReports(account: Pick<ProductionAccount, 'id'|'reportIds'>, reports: ProductionReport[]): ProductionReport[] {
    return reports.filter(report => !report.deletedAt && (report.accountIds.includes(account.id) || account.reportIds.includes(report.id)));
}
export function productionReportStatus(report: ProductionReport, tasks: ProductionTask[]): {kind: 'manual'|'submitted'|'accepted'|'unverified'; label: string; taskId?: string} {
    const meta = record(report.meta) ? report.meta : {};
    if (!meta.taskId && !meta.attemptId) return {kind: 'manual', label: '手工导入'};
    const unknown = {kind: 'unverified' as const, label: '来源待核验'};
    const task = tasks.find(task => task.id === meta.taskId), attempt = task?.attempts.find(attempt => attempt.id === meta.attemptId), receipt = attempt?.receipt;
    if (!task || !attempt || task.activeAttemptId !== attempt.id || !['submitted', 'accepted'].includes(attempt.status) || !receipt || receipt.taskId !== task.id || receipt.attemptId !== attempt.id || receipt.requestHash !== task.requestHash || (meta.receiptHash !== undefined && meta.receiptHash !== receipt.sha256) || (task.accountId !== null && !report.accountIds.includes(task.accountId))) return unknown;
    const matches = attempt.result?.artifacts.filter(artifact => {
        if (artifact.kind !== 'report' || artifact.title !== report.title || (meta.artifactId !== undefined && meta.artifactId !== artifact.id)) return false;
        const data = record(artifact.data) ? artifact.data : {};
        const pages = Array.isArray(data.pages) ? data.pages : artifact.assetHash ? [{title: artifact.title, assetHash: artifact.assetHash}] : [];
        return pages.length === report.pages.length && pages.every((page, index) => record(page) && page.title === report.pages[index].title && page.assetHash === report.pages[index].assetHash);
    }) ?? [];
    if (matches.length !== 1) return unknown;
    return {kind: attempt.status === 'accepted' ? 'accepted' : 'submitted', label: attempt.status === 'accepted' ? '已验收' : '待验收', taskId: task.id};
}
