import type {ServiceSettingsValues, ServiceSettingsPatch, ServiceToolRequest} from './service-contracts.ts';
export const serviceCredentials = ['tikhub', 'model', 'asr'] as const;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: unknown, keys: string[]) => record(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const bounded = (v: unknown, max: number) => typeof v === 'string' && v.length <= max && !v.includes('\0');
export function defaultServiceSettings(): ServiceSettingsValues {return {model: {provider: 'volc', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', modelId: ''}, asr: {mode: 'local-first', resourceId: 'volc.bigasr.auc_turbo', localEngine: 'faster-whisper', localExecutable: '', localModelPath: ''}, budget: {enabled: false, maxRequestsPerTask: 10}, commentsEnabled: false};}
export function serviceSettingsValues(v: unknown): v is ServiceSettingsValues {
    if (!exact(v, ['model','asr','budget','commentsEnabled']) || !record(v)) return false;
    const {model:m, asr:a, budget:b} = v;
    if (!exact(m, ['provider','baseUrl','modelId']) || !record(m) || !['volc','compatible'].includes(String(m.provider)) || !bounded(m.baseUrl, 2048) || !bounded(m.modelId, 256)) return false;
    try {const u = new URL(m.baseUrl as string); if (u.protocol !== 'https:' || u.username || u.password || u.hash || u.search || u.port && u.port !== '443') return false;} catch {return false;}
    return !!(exact(a, ['mode','resourceId','localEngine','localExecutable','localModelPath']) && record(a) && ['local-first','local-only','volc'].includes(String(a.mode)) && ['faster-whisper','whisper-cpp','qwen3-asr'].includes(String(a.localEngine)) && bounded(a.resourceId, 256) && bounded(a.localExecutable, 4096) && bounded(a.localModelPath, 4096) && exact(b, ['enabled','maxRequestsPerTask']) && record(b) && typeof b.enabled === 'boolean' && Number.isInteger(b.maxRequestsPerTask) && Number(b.maxRequestsPerTask) >= 1 && Number(b.maxRequestsPerTask) <= 100 && typeof v.commentsEnabled === 'boolean');
}
export function serviceSettingsPatch(v: unknown): v is ServiceSettingsPatch {return record(v) && Object.keys(v).length > 0 && Object.keys(v).every(k => ['values','keys'].includes(k)) && (!Object.hasOwn(v,'values') || serviceSettingsValues(v.values)) && (!Object.hasOwn(v,'keys') || record(v.keys) && Object.keys(v.keys).every(k => serviceCredentials.includes(k as typeof serviceCredentials[number]) && ((v.keys as Record<string,unknown>)[k] === null || bounded((v.keys as Record<string,unknown>)[k], 8192) && String((v.keys as Record<string,unknown>)[k]).trim().length > 0)));}
const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export function serviceToolRequest(v: unknown): v is ServiceToolRequest {
    if (!record(v) || !bounded(v.workerId,200) || !String(v.workerId).trim() || !['taskId','attemptId','claimToken','requestId'].every(k => uuid(v[k]))) return false;
    const base = ['tool','taskId','attemptId','claimToken','workerId','requestId'];
    const allowed = v.tool === 'tikhub' ? ['operation','id','cursor'] : v.tool === 'asr' ? ['audioPath','allowCloud'] : v.tool === 'model' ? ['instruction','text'] : [];
    if (!allowed.length || Object.keys(v).some(k => ![...base,...allowed].includes(k))) return false;
    if (v.tool === 'tikhub') return ['douyin-search','user-search','profile','user-posts','video','comments'].includes(String(v.operation)) && bounded(v.id, 512) && String(v.id).trim().length > 0 && (['douyin-search','user-search'].includes(String(v.operation)) || typeof v.id==='string' && (['video','comments'].includes(String(v.operation)) ? /^\d{1,32}$/.test(v.id) : /^[A-Za-z0-9_-]{1,256}$/.test(v.id))) && (v.cursor === undefined || typeof v.cursor === 'string' && /^\d{1,16}$/.test(v.cursor) && Number.isSafeInteger(Number(v.cursor)));
    if (v.tool === 'asr') return bounded(v.audioPath, 4096) && String(v.audioPath).length > 0 && (v.allowCloud === undefined || typeof v.allowCloud === 'boolean');
    return bounded(v.instruction, 32000) && bounded(v.text, 200000) && String(v.instruction).trim().length > 0;
}
