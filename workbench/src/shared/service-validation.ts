import type {AsrSettings, CloudAsrSettings, NormalizedAsrSettings, ServiceSettingsValues, ServiceSettingsPatch, ServiceToolRequest} from './service-contracts.ts';
export const serviceCredentials = ['tikhub', 'model', 'asr', 'groq', 'custom'] as const;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: unknown, keys: string[]) => record(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const bounded = (v: unknown, max: number) => typeof v === 'string' && v.length <= max && !v.includes('\0');
export function defaultCloudAsrSettings():CloudAsrSettings {return {provider:'volc',groqModel:'whisper-large-v3-turbo',customBaseUrl:'',customModelId:''};}
export function normalizeAsrSettings(a:AsrSettings):NormalizedAsrSettings {
    return {mode:a.mode==='volc'?'cloud':a.mode,resourceId:a.resourceId,localEngine:a.localEngine,localExecutable:a.localExecutable,localModelPath:a.localModelPath,cloud:{...defaultCloudAsrSettings(),...a.cloud,...(a.mode==='volc'?{provider:'volc' as const}:{})}};
}
export function normalizeServiceSettings(v:ServiceSettingsValues):ServiceSettingsValues {return {...structuredClone(v),asr:normalizeAsrSettings(v.asr)};}
export function customAsrBaseUrl(value:string):string {const u=new URL(value);return u.href.replace(/\/+$/,'');}
export function validCustomAsrBaseUrl(value:unknown):value is string {
    if(!bounded(value,2048)||!String(value).trim()||/[\x00-\x20\x7f\\]/.test(String(value)))return false;
    try {const u=new URL(String(value));return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&!u.search&&(!u.port||u.port==='443')&&u.hostname!=='localhost'&&!u.hostname.endsWith('.local')&&!u.hostname.endsWith('.localhost');}catch{return false;}
}
export const validAsrModelId=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/.test(value);
export function serviceAsrSettings(a:unknown):a is AsrSettings {
    if(!record(a)||!exact(a,['mode','resourceId','localEngine','localExecutable','localModelPath',...(Object.hasOwn(a,'cloud')?['cloud']:[])])||!['local-first','local-only','cloud','volc'].includes(String(a.mode))||!['faster-whisper','whisper-cpp','qwen3-asr'].includes(String(a.localEngine))||!bounded(a.resourceId,256)||!bounded(a.localExecutable,4096)||!bounded(a.localModelPath,4096))return false;
    if(a.cloud===undefined)return a.mode!=='cloud';
    const c=a.cloud;if(!record(c)||!exact(c,['provider','groqModel','customBaseUrl','customModelId'])||!['volc','groq','custom'].includes(String(c.provider))||!['whisper-large-v3-turbo','whisper-large-v3'].includes(String(c.groqModel))||!(c.customBaseUrl===''||validCustomAsrBaseUrl(c.customBaseUrl))||!(c.customModelId===''||validAsrModelId(c.customModelId)))return false;
    return !(a.mode==='volc'&&c.provider!=='volc')&&(c.provider!=='custom'||validCustomAsrBaseUrl(c.customBaseUrl)&&validAsrModelId(c.customModelId));
}
export function defaultServiceSettings(): ServiceSettingsValues {return {model: {provider: 'volc', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', modelId: ''}, asr: {mode: 'local-first', resourceId: 'volc.bigasr.auc_turbo', localEngine: 'faster-whisper', localExecutable: '', localModelPath: '',cloud:defaultCloudAsrSettings()}, budget: {enabled: false, maxRequestsPerTask: 10}, commentsEnabled: false};}
export function serviceSettingsValues(v: unknown): v is ServiceSettingsValues {
    if (!exact(v, ['model','asr','budget','commentsEnabled']) || !record(v)) return false;
    const {model:m, asr:a, budget:b} = v;
    if (!exact(m, ['provider','baseUrl','modelId']) || !record(m) || !['volc','compatible'].includes(String(m.provider)) || !bounded(m.baseUrl, 2048) || !bounded(m.modelId, 256)) return false;
    try {const u = new URL(m.baseUrl as string); if (u.protocol !== 'https:' || u.username || u.password || u.hash || u.search || u.port && u.port !== '443') return false;} catch {return false;}
    return !!(serviceAsrSettings(a) && exact(b, ['enabled','maxRequestsPerTask']) && record(b) && typeof b.enabled === 'boolean' && Number.isInteger(b.maxRequestsPerTask) && Number(b.maxRequestsPerTask) >= 1 && Number(b.maxRequestsPerTask) <= 100 && typeof v.commentsEnabled === 'boolean');
}
export function serviceSettingsPatch(v: unknown): v is ServiceSettingsPatch {return record(v) && Object.keys(v).length > 0 && Object.keys(v).every(k => ['values','keys'].includes(k)) && (!Object.hasOwn(v,'values') || serviceSettingsValues(v.values)) && (!Object.hasOwn(v,'keys') || record(v.keys) && Object.keys(v.keys).every(k => serviceCredentials.includes(k as typeof serviceCredentials[number]) && ((v.keys as Record<string,unknown>)[k] === null || bounded((v.keys as Record<string,unknown>)[k], 8192) && /^[\x21-\x7e]+$/.test(String((v.keys as Record<string,unknown>)[k])))));}
const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export function serviceToolRequest(v: unknown): v is ServiceToolRequest {
    if (!record(v) || !bounded(v.workerId,200) || !String(v.workerId).trim() || !['taskId','attemptId','claimToken','requestId'].every(k => uuid(v[k]))) return false;
    const base = ['tool','taskId','attemptId','claimToken','workerId','requestId'];
    const allowed = v.tool === 'tikhub' ? ['operation','id','cursor','search'] : v.tool === 'asr' ? ['audioPath','allowCloud'] : v.tool === 'model' ? ['instruction','text'] : [];
    if (!allowed.length || Object.keys(v).some(k => ![...base,...allowed].includes(k))) return false;
    if (v.tool === 'tikhub') {
        if (!['douyin-search','user-search','profile','user-posts','video','comments','xhs-search','xhs-profile'].includes(String(v.operation)) || !bounded(v.id,512) || !String(v.id).trim()) return false;
        if (!['douyin-search','user-search','xhs-search'].includes(String(v.operation)) && !(typeof v.id==='string' && (['video','comments'].includes(String(v.operation)) ? /^\d{1,32}$/.test(v.id) : v.operation==='xhs-profile' ? /^[0-9a-f]{24}$/i.test(v.id) : /^[A-Za-z0-9_-]{1,256}$/.test(v.id)))) return false;
        if (v.cursor !== undefined && !(typeof v.cursor==='string' && /^\d{1,16}$/.test(v.cursor) && Number.isSafeInteger(Number(v.cursor)))) return false;
        if (['xhs-search','xhs-profile'].includes(String(v.operation)) && v.cursor!==undefined) return false;
        if (v.search!==undefined) {
            if (!['douyin-search','xhs-search'].includes(String(v.operation)) || !record(v.search) || Object.keys(v.search).some(k=>!['sortType','timeRange','contentType'].includes(k))) return false;
            const s=v.search;
            if (s.sortType!==undefined&&!['general','likes','latest'].includes(String(s.sortType)) || s.timeRange!==undefined&&!['any','day','week','half-year'].includes(String(s.timeRange)) || s.contentType!==undefined&&!['any','video','image'].includes(String(s.contentType))) return false;
        }
        return true;
    }
    if (v.tool === 'asr') return bounded(v.audioPath, 4096) && String(v.audioPath).length > 0 && (v.allowCloud === undefined || typeof v.allowCloud === 'boolean');
    return bounded(v.instruction, 32000) && bounded(v.text, 200000) && String(v.instruction).trim().length > 0;
}
