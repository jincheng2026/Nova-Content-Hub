import {isRecord} from '../shared/contracts.ts';

export type AssistantFailureReason = 'validation-failed' | 'plugin-missing' | 'plugin-disabled' | 'plugin-mismatch' | 'skill-missing' | 'skill-not-supported' | 'integrity-failed' | 'runtime-failed' | 'protocol-missing';
const reasons: Record<AssistantFailureReason, string> = {
    'validation-failed': '助手配套文件校验未通过，请在设置中检查匹配版本、平台与架构。',
    'plugin-missing': '所选助手尚未安装当前工作台的配套插件，请在设置中获取并安装匹配版本。',
    'plugin-disabled': '所选助手的配套插件或执行 Skill 未启用，请在助手插件设置中启用后重试。',
    'plugin-mismatch': '所选助手的配套插件与当前工作台版本不匹配，请安装整套匹配版本。',
    'skill-missing': '所选助手的配套插件缺少本任务执行 Skill，请重新安装匹配的完整插件。',
    'skill-not-supported': '所选助手的配套插件不包含本任务执行能力，请升级工作台及匹配插件后重试。',
    'integrity-failed': '所选助手的配套插件完整性校验未通过，请重新安装匹配的完整插件。',
    'runtime-failed': '所选助手的配套运行环境预检未通过，请在设置中检查匹配插件后重试。',
    'protocol-missing': '所选助手尚未安装或未注册打开协议，请先安装并启动该助手。'
};

const safeVersion = (value: unknown): value is string => typeof value === 'string' && /^\d{1,8}\.\d{1,8}\.\d{1,8}(?:-[a-zA-Z0-9.-]{1,64})?$/.test(value);
type Versions = {expectedVersion?: string; installedVersion?: string};
function failureMessage(reason: AssistantFailureReason, versions: Versions = {}): string {
    if (['plugin-missing', 'plugin-mismatch'].includes(reason) && safeVersion(versions.expectedVersion)) {
        const installed = safeVersion(versions.installedVersion) ? `，检测到配套插件 ${versions.installedVersion}` : '';
        return `当前工作台为 ${versions.expectedVersion}${installed}，需要安装并启用 ${versions.expectedVersion} 配套插件。请打开左下角“设置 → AI 助手”，点击“复制安装位置”，在助手中${installed ? '升级' : '安装'}并启用同版插件，再回设置“重新检查”，然后继续原任务。`;
    }
    return reasons[reason];
}
export function assistantNotReady(reason: AssistantFailureReason = 'validation-failed', versions: Versions = {}) {
    const safe = {...(safeVersion(versions.expectedVersion) ? {expectedVersion: versions.expectedVersion} : {}), ...(safeVersion(versions.installedVersion) ? {installedVersion: versions.installedVersion} : {})};
    return Object.assign(new Error(failureMessage(reason, safe)), {code: 'NOT_READY', reason, ...safe});
}

export function assistantSetupFailure(error: unknown): {reason: AssistantFailureReason; message: string} {
    const reason = isRecord(error) && error.code === 'NOT_READY' && typeof error.reason === 'string' && Object.hasOwn(reasons, error.reason) ? error.reason as AssistantFailureReason : 'validation-failed';
    return {reason, message: failureMessage(reason, isRecord(error) ? error : {})};
}

// Never display arbitrary exceptions: they may contain URLs, credentials or broker tokens.
export function productionLaunchFailure(error: unknown): string {
    const prefix = '任务已保存在内容库，助手未成功打开。';
    if (isRecord(error) && error.code === 'NOT_READY' && typeof error.reason === 'string' && Object.hasOwn(reasons, error.reason)) return prefix + assistantSetupFailure(error).message + '可在助手任务列表继续打开此任务。';
    const code = isRecord(error) && typeof error.code === 'string' ? error.code : '';
    const safe: Record<string, string> = {
        NOT_READY: '助手启动预检未通过（NOT_READY），请在设置中检查助手与配套插件。',
        HANDOFF_CANCELLED: '已取消打开助手，完整提示词已保留在剪贴板。',
        COPY_FAILED: '完整提示词复制失败，请重新打开此任务。',
        INVALID_HANDOFF: '任务交接校验未通过，请刷新原任务后重试。',
        HANDOFF_PATH_TOO_LONG: '内容库路径过长，无法自动预填助手任务，请选择路径较短的内容库。'
    };
    return prefix + (Object.hasOwn(safe, code) ? safe[code] : '系统未能打开助手，请检查助手安装后在助手任务列表重试。');
}
