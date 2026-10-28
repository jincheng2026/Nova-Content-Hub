export type WorkspaceReadIssue = {kind: 'busy' | 'timeout' | 'unavailable'; message: string};
export function workspaceReadFailure(failure: unknown): WorkspaceReadIssue {
    const code = failure && typeof failure === 'object' && 'code' in failure ? failure.code : '';
    if (code === 'BUSY' || code === 'VAULT_BUSY') return {kind: 'busy', message: '知识库正在使用，稍后自动重试。'};
    if (code === 'READ_TIMEOUT') return {kind: 'timeout', message: '读取超时；原资料和草稿保留，可以重试。'};
    if (['EACCES','EPERM','SOURCE_NOT_AVAILABLE','LIBRARY_NOT_READY'].includes(String(code))) return {kind: 'unavailable', message: '暂时无法访问资料，请恢复原目录访问后重试。'};
    if (['CORRUPT','UNSAFE_PATH','LOCK_UNCERTAIN','RECOVERY_CONFLICT'].includes(String(code))) return {kind: 'unavailable', message: '资料校验未通过，请查看内容库维护中的具体问题。'};
    return {kind: 'unavailable', message: '读取未完成；原资料和草稿保留，请重试。'};
}
/** A finite, library-bound retry signal. It never stores or replays a write. */
export function createWorkspaceReadRecovery(options: {currentEpoch(): number; retry(): void; schedule?(callback: () => void, delay: number): unknown; cancel?(handle: unknown): void}) {
    const schedule = options.schedule ?? ((callback, delay) => setTimeout(callback, delay));
    const cancel = options.cancel ?? (handle => clearTimeout(handle as ReturnType<typeof setTimeout>));
    let epoch = options.currentEpoch(), attempts = 0, timer: unknown, pending = false, version = 0;
    function reset() {version++; if (pending) cancel(timer); pending = false; attempts = 0; epoch = options.currentEpoch();}
    return {reset, schedule(expectedEpoch: number): boolean {
        if (expectedEpoch !== options.currentEpoch()) return false;
        if (epoch !== expectedEpoch) reset();
        if (pending) return true;
        if (attempts >= 2) return false;
        const generation = version; pending = true;
        timer = schedule(() => {pending = false; if (generation === version && expectedEpoch === options.currentEpoch()) options.retry();}, [800, 1800][attempts++]);
        return true;
    }};
}
