import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import https from 'node:https';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {ServiceSettingsStore} from './service-settings.mts';
import {customAsrBaseUrl,normalizeAsrSettings,serviceCredentials,serviceToolRequest} from '../shared/service-validation.ts';
import type {NormalizedAsrSettings,ServiceCredential,ServiceReadiness,ServiceSettingsValues,ServiceToolRequest,ServiceToolResult} from '../shared/service-contracts.ts';
export const TIKHUB_CACHE_TTL_MS = 6*60*60*1000;
type TikHubRequest = Extract<ServiceToolRequest,{tool:'tikhub'}>;
export function tikHubHttpRequest(request:TikHubRequest):{url:string;method:'GET'|'POST';body?:string} {
    const endpoints={ 'douyin-search':'/api/v1/douyin/search/fetch_video_search_v2','user-search':'/api/v1/douyin/search/fetch_user_search_v2',profile:'/api/v1/douyin/app/v3/handler_user_profile','user-posts':'/api/v1/douyin/app/v3/fetch_user_post_videos',video:'/api/v1/douyin/app/v3/fetch_one_video_v2',comments:'/api/v1/douyin/app/v3/fetch_video_comments','xhs-search':'/api/v1/xiaohongshu/app_v2/search_notes','xhs-profile':'/api/v1/xiaohongshu/app_v2/get_user_info'};
    const post=request.operation==='douyin-search'||request.operation==='user-search';
    const params:Record<string,string|number>=post?{keyword:request.id,cursor:Number(request.cursor??0)}:request.operation==='xhs-search'?{keyword:request.id,page:1,ai_mode:0}:request.operation==='xhs-profile'?{user_id:request.id}:{[request.operation==='profile'||request.operation==='user-posts'?'sec_user_id':'aweme_id']:request.id};
    if(request.search){const f=request.search;
        if(request.operation==='douyin-search')Object.assign(params,{sort_type:{general:'0',likes:'1',latest:'2'}[f.sortType??'general'],publish_time:{any:'0',day:'1',week:'7','half-year':'180'}[f.timeRange??'any'],content_type:{any:'0',video:'1',image:'2'}[f.contentType??'any']});
        if(request.operation==='xhs-search')Object.assign(params,{sort_type:{general:'general',likes:'popularity_descending',latest:'time_descending'}[f.sortType??'general'],time_filter:{any:'不限',day:'一天内',week:'一周内','half-year':'半年内'}[f.timeRange??'any'],note_type:{any:'不限',video:'视频笔记',image:'普通笔记'}[f.contentType??'any']});
    }
    if(request.operation==='user-posts')Object.assign(params,{max_cursor:request.cursor??'0',count:20});
    if(request.operation==='comments')Object.assign(params,{cursor:request.cursor??'0',count:20});
    const url=new URL(endpoints[request.operation],'https://api.tikhub.io');
    if(post)return{url:url.href,method:'POST',body:JSON.stringify(params)};
    for(const[k,v]of Object.entries(params))url.searchParams.set(k,String(v));
    return{url:url.href,method:'GET'};
}
export class ServiceToolError extends Error {code:string; requestsUsed:0|1|null; constructor(code:string,requestsUsed:0|1|null=0){super(code === 'MODEL_SERVICE_DISABLED' ? '文本分析与创作由当前选择的 Codex / WorkBuddy 助手完成；工作台仅提供采集与语音识别服务。' : code === 'COST_UNKNOWN' ? '上次请求费用未确认，请先人工核验账单再继续。' : code === 'LOCAL_ASR_UNAVAILABLE' ? '本地语音依赖或模型不可用，请检查已保存的路径与 Python 模块；本次没有调用云端。' : '服务调用未完成；请检查配置或任务授权后继续。');this.code=code;this.requestsUsed=requestsUsed;}}
export function publicAddress(address:string):boolean {
    if (isIP(address)===4) {const [a,b,c]=address.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===0||b===168||b===88&&c===99)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51)||a===203&&b===0);}
    if (isIP(address)===6) {const v=address.toLowerCase();const parts=v.split(':');return /^[23][0-9a-f]{3}:/.test(v)&&!(parts[0]==='2001'&&(parseInt(parts[1]||'0',16)<0x200||parseInt(parts[1],16)===0xdb8))&&!v.startsWith('2002:')&&!v.startsWith('3fff:');}
    return false;
}
export async function publicEndpoint(input:string,resolver:(hostname:string,options:{all:true;verbatim:true})=>Promise<{address:string;family:number}[]>=lookup):Promise<{url:URL;address:string;family:number}> {
    let url:URL;try {url=new URL(input);} catch {throw new ServiceToolError('UNSAFE_ENDPOINT');}
    if (url.protocol!=='https:'||url.username||url.password||url.hash||url.port&&url.port!=='443'||url.hostname.endsWith('.local')||url.hostname==='localhost') throw new ServiceToolError('UNSAFE_ENDPOINT');
    const host=url.hostname.replace(/^\[|\]$/g,'');
    let addresses;let dnsTimer:ReturnType<typeof setTimeout>|undefined;try {addresses=isIP(host)?[{address:host,family:isIP(host)}]:await Promise.race([resolver(host,{all:true,verbatim:true}),new Promise<never>((_resolve,reject)=>{dnsTimer=setTimeout(()=>reject(new Error('DNS_TIMEOUT')),6000);})]);} catch {throw new ServiceToolError('DNS_FAILED');} finally {clearTimeout(dnsTimer);}
    // Some system TUN proxies return benchmark-range synthetic DNS for these fixed providers.
    // TLS still verifies the original hostname, requests remain pinned, and redirects stay disabled.
    const fixedProvider=['api.tikhub.io','ark.cn-beijing.volces.com','openspeech.bytedance.com','api.groq.com'].includes(url.hostname);
    const synthetic=(address:string)=>isIP(address)===4&&/^198\.(18|19)\./.test(address);
    const pairedSyntheticAlias=(address:string)=>{
        if(isIP(address)!==6)return false;
        let normalized:string;try{normalized=new URL(`https://[${address}]`).hostname.slice(1,-1);}catch{return false;}
        const match=/^::ffff:(?:0:)?(c612|c613):([0-9a-f]{1,4})$/.exec(normalized);
        if(!match)return false;
        const low=parseInt(match[2],16),ipv4=`198.${match[1]==='c612'?18:19}.${low>>8}.${low&255}`;
        return addresses.some(a=>a.address===ipv4&&synthetic(a.address));
    };
    if (!addresses.length||addresses.some(a=>!publicAddress(a.address)&&!(fixedProvider&&(synthetic(a.address)||pairedSyntheticAlias(a.address))))) throw new ServiceToolError('UNSAFE_ENDPOINT');
    // Never connect through an IPv6 alias: pin the corresponding synthetic IPv4 instead.
    const selected=addresses.find(a=>synthetic(a.address))??addresses[0];
    return {url,address:selected.address,family:selected.family};
}
export async function boundedHttps(input:string,options:{method?:string;headers?:Record<string,string>;body?:string|Buffer;maxBytes?:number;timeoutMs?:number}={}):Promise<{data:unknown;headers:Record<string,string|string[]|undefined>}> {
    const body=options.body; if (body&&Buffer.byteLength(body)>24*1024*1024) throw new ServiceToolError('REQUEST_TOO_LARGE');
    const {url,address,family}=await publicEndpoint(input);
    return new Promise((resolve,reject)=>{
        let sent=false,done=false; const finish=(error?:ServiceToolError,value?:{data:unknown;headers:Record<string,string|string[]|undefined>})=>{if(done)return;done=true;clearTimeout(timer);if(error)reject(error);else resolve(value!);};
        const req=https.request(url,{method:options.method??'GET',headers:{'User-Agent':'Nova-Content-Hub',...options.headers,...(body?{'Content-Length':String(Buffer.byteLength(body))}:{})},rejectUnauthorized:true,servername:url.hostname,family,lookup:(_host,_options,cb)=>{cb(null,address,family);},agent:false},res=>{
            // No redirects, retries, or provider error bodies are exposed to callers.
            if (!res.statusCode||res.statusCode<200||res.statusCode>=300) {const issue=new ServiceToolError('PROVIDER_REJECTED',[400,401,402,403,404,405,422].includes(res.statusCode??0)?0:null);Object.assign(issue,{httpStatus:res.statusCode??null});let errorBytes=0;const errorParts:Buffer[]=[];res.on('data',(chunk:Buffer)=>{errorBytes+=chunk.length;if(errorBytes<=65536)errorParts.push(chunk);});res.on('end',()=>{try{const errorBody=JSON.parse(Buffer.concat(errorParts).toString('utf8')),code=errorBody.error?.code??errorBody.code;const value=String(code??'');if(/^[A-Za-z0-9_.:-]{1,80}$/.test(value)&&!Object.values(options.headers??{}).some(header=>header.includes(value)&&value.length>12))Object.assign(issue,{providerCode:value});}catch{}finish(issue);});res.on('error',()=>finish(issue));return;}
            const parts:Buffer[]=[];let size=0;res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>(options.maxBytes??4*1024*1024)){req.destroy();finish(new ServiceToolError('RESPONSE_TOO_LARGE',null));}else parts.push(chunk);});
            res.on('end',()=>{try {finish(undefined,{data:JSON.parse(Buffer.concat(parts).toString('utf8')),headers:res.headers});}catch{finish(new ServiceToolError('INVALID_PROVIDER_RESPONSE',null));}});res.on('error',()=>finish(new ServiceToolError('NETWORK_FAILED',null)));
        });
        const timer=setTimeout(()=>{req.destroy();finish(new ServiceToolError('NETWORK_TIMEOUT',sent?null:0));},options.timeoutMs??90000);timer.unref();
        req.on('finish',()=>{sent=true;});req.on('error',()=>finish(new ServiceToolError('NETWORK_FAILED',sent?null:0)));req.end(body);
    });
}
const CLOUD_AUDIO_MAX_BYTES=25_000_000;
const audioTypes:Record<string,string>={'.flac':'audio/flac','.mp3':'audio/mpeg','.mp4':'video/mp4','.mpeg':'audio/mpeg','.mpga':'audio/mpeg','.m4a':'audio/mp4','.ogg':'audio/ogg','.wav':'audio/wav','.webm':'video/webm'};
function cloudAsrTarget(a:NormalizedAsrSettings):{url:string;credential:ServiceCredential;modelId:string;maxAudioBytes:number}{
    if(a.cloud.provider==='volc'){
        if(a.resourceId!=='volc.bigasr.auc_turbo')throw new ServiceToolError('ASR_RESOURCE_UNSUPPORTED');
        return{url:'https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash',credential:'asr',modelId:a.resourceId,maxAudioBytes:16*1024*1024};
    }
    if(a.cloud.provider==='groq')return{url:'https://api.groq.com/openai/v1/audio/transcriptions',credential:'groq',modelId:a.cloud.groqModel,maxAudioBytes:CLOUD_AUDIO_MAX_BYTES};
    return{url:`${customAsrBaseUrl(a.cloud.customBaseUrl)}/audio/transcriptions`,credential:'custom',modelId:a.cloud.customModelId,maxAudioBytes:CLOUD_AUDIO_MAX_BYTES};
}
async function readCloudAudio(file:string,maxBytes:number):Promise<Buffer>{
    const extension=path.extname(file).toLowerCase();if(!audioTypes[extension])throw new ServiceToolError('INVALID_AUDIO');
    let handle:Awaited<ReturnType<typeof fs.open>>|undefined;
    try {
        const link=await fs.lstat(file);if(!link.isFile()||link.isSymbolicLink()||link.size<1||link.size>maxBytes)throw new Error();
        handle=await fs.open(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));const stat=await handle.stat();if(!stat.isFile()||stat.size!==link.size||stat.size>maxBytes)throw new Error();
        const data=Buffer.alloc(stat.size);let offset=0;
        while(offset<data.length){const {bytesRead}=await handle.read(data,offset,data.length-offset,offset);if(!bytesRead)throw new Error();offset+=bytesRead;}
        if((await handle.read(Buffer.alloc(1),0,1,offset)).bytesRead)throw new Error();return data;
    }catch{throw new ServiceToolError('INVALID_AUDIO');}finally{await handle?.close();}
}
function asrMultipart(data:Buffer,extension:string,modelId:string):{body:Buffer;contentType:string}{
    const boundary=`nova-asr-${randomUUID()}`,parts:Buffer[]=[];
    for(const [name,value]of [['model',modelId],['response_format','json']])parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio${extension}"\r\nContent-Type: ${audioTypes[extension]}\r\n\r\n`),data,Buffer.from(`\r\n--${boundary}--\r\n`));
    return {body:Buffer.concat(parts),contentType:`multipart/form-data; boundary=${boundary}`};
}
async function run(executable:string,args:string[],timeoutMs=10000):Promise<string> {return new Promise((resolve,reject)=>{const child=spawn(executable,args,{shell:false,windowsHide:true,env:{...process.env,HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',HF_DATASETS_OFFLINE:'1',PYTHONIOENCODING:'utf-8'}});let output='',size=0,settled=false;const end=(error?:unknown)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve(output);};const timer=setTimeout(()=>{child.kill();end(new ServiceToolError('LOCAL_ASR_UNAVAILABLE'));},timeoutMs);child.stdout.on('data',(b:Buffer)=>{size+=b.length;if(size>4*1024*1024){child.kill();end(new ServiceToolError('RESPONSE_TOO_LARGE'));}else output+=b.toString('utf8');});child.stderr.on('data',()=>{});child.on('error',()=>end(new ServiceToolError('LOCAL_ASR_UNAVAILABLE')));child.on('exit',code=>end(code===0?undefined:new ServiceToolError('LOCAL_ASR_UNAVAILABLE')));});}
interface CacheEntry {collectedAt:string;data?:unknown;unknown?:boolean;requestId?:string}
interface Prepared {service:string;requests:0|1;cacheKey?:string;cached?:ServiceToolResult;localModule?:string;config?:ServiceSettingsValues;audio?:Buffer}
export interface ServiceExecutionHooks {beforeExecute?(prepared:{service:string;requests:0|1;config?:ServiceSettingsValues}):Promise<void>;afterExecute?(result:{service:string;requestsUsed:0|1|null;ok:boolean;usage?:Record<string,number|string|null>}):Promise<void>}
export class ServiceTools {
    readonly settings:ServiceSettingsStore; readonly cachePath?:string; private cache=new Map<string,CacheEntry>();private loaded=false;private cacheQueue:Promise<unknown>=Promise.resolve();private inflight=new Set<string>();
    constructor(options:{settings:ServiceSettingsStore;cachePath?:string}){this.settings=options.settings;this.cachePath=options.cachePath;}
    private async localModule(a:ServiceSettingsValues['asr']=this.settings.read().values.asr):Promise<string> {
        if (!path.isAbsolute(a.localExecutable)||!path.isAbsolute(a.localModelPath)) throw new ServiceToolError('LOCAL_ASR_UNAVAILABLE');
        try {const [ex,model]=await Promise.all([fs.stat(a.localExecutable),fs.stat(a.localModelPath)]);if(!ex.isFile()||(a.localEngine==='whisper-cpp'?!model.isFile():!model.isDirectory())) throw new Error();await fs.access(a.localExecutable,fs.constants.X_OK);}catch{throw new ServiceToolError('LOCAL_ASR_UNAVAILABLE');}
        if(a.localEngine==='whisper-cpp')return 'whisper-cpp';
        const modules=a.localEngine==='faster-whisper'?['faster_whisper']:process.platform==='darwin'&&process.arch==='arm64'?['mlx_audio','qwen_asr']:['qwen_asr'];
        const result=(await run(a.localExecutable,['-c',`import importlib.util,json; print(json.dumps([m for m in ${JSON.stringify(modules)} if importlib.util.find_spec(m)]))`])).trim();
        try {const found=JSON.parse(result);if(Array.isArray(found)&&typeof found[0]==='string')return found[0];}catch{}throw new ServiceToolError('LOCAL_ASR_UNAVAILABLE');
    }
    async checkReadiness():Promise<ServiceReadiness>{let available=false,reason='请填写已安装的 Python / whisper-cli 与离线模型绝对路径，再安装对应 faster-whisper、qwen-asr 或 Apple Silicon 的 mlx-audio 模块。本检查不下载模型。';try{const m=await this.localModule();available=true;reason=`本地路径与 ${m} 模块检查通过；实际音频识别仍在任务内验证。`;}catch{}return{localAsr:{available,reason},encryptionAvailable:this.settings.encryptionAvailable()};}
    private async loadCache(){if(this.loaded)return;this.loaded=true;if(!this.cachePath)return;try{const s=await fs.lstat(this.cachePath);if(!s.isFile()||s.isSymbolicLink()||s.size>32*1024*1024)throw new Error();const rows:unknown=JSON.parse(await fs.readFile(this.cachePath,'utf8'));if(!Array.isArray(rows)||rows.length>1000)throw new Error();for(const row of rows)if(Array.isArray(row)&&typeof row[0]==='string'&&row[1]&&typeof row[1].collectedAt==='string')this.cache.set(row[0],row[1]);}catch(error){if(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT')return;throw new ServiceToolError('CACHE_UNAVAILABLE');}}
    private async saveCache(){if(!this.cachePath)return;const run=this.cacheQueue.then(async()=>{while(this.cache.size>500){const victim=[...this.cache].find(([,e])=>!e.unknown);if(!victim)throw new ServiceToolError('CACHE_FULL');this.cache.delete(victim[0]);}const bytes=JSON.stringify([...this.cache]);if(Buffer.byteLength(bytes)>32*1024*1024)throw new ServiceToolError('CACHE_FULL');await fs.mkdir(path.dirname(this.cachePath!),{recursive:true,mode:0o700});const temp=`${this.cachePath}.${randomUUID()}.tmp`;try{await fs.writeFile(temp,bytes,{mode:0o600,flag:'wx'});await fs.rename(temp,this.cachePath!);}finally{await fs.rm(temp,{force:true});}});this.cacheQueue=run.catch(()=>{});await run;}
    private async prepare(request:ServiceToolRequest):Promise<Prepared>{
        if(!serviceToolRequest(request))throw new ServiceToolError('INVALID_INPUT');const s=this.settings.read();
        if(request.tool==='tikhub'){
            if(request.operation==='comments'&&!s.values.commentsEnabled)throw new ServiceToolError('COMMENTS_DISABLED');
            // Preserve existing cache/unknown-cost records for unchanged legacy calls.
            await this.loadCache();const http=tikHubHttpRequest(request),cacheKey=createHash('sha256').update(JSON.stringify(request.search?[request.operation,request.id,request.cursor??'0',http.method,http.url,http.body??'']:[request.operation,request.id,request.cursor??'0'])).digest('hex'),entry=this.cache.get(cacheKey);
            if(entry?.unknown)throw new ServiceToolError('COST_UNKNOWN');
            if(entry&&Date.now()-Date.parse(entry.collectedAt)<TIKHUB_CACHE_TTL_MS)return{service:'tikhub',requests:0,cacheKey,cached:{data:entry.data,service:'tikhub',requestsUsed:0,collectedAt:entry.collectedAt,cacheHit:true}};
            this.settings.secret('tikhub');return{service:'tikhub',requests:1,cacheKey};
        }
        if(request.tool==='media')throw new ServiceToolError('MEDIA_BROKER_REQUIRED');
        if(request.tool==='model')throw new ServiceToolError('MODEL_SERVICE_DISABLED');
        const asr=normalizeAsrSettings(s.values.asr);
        if(asr.mode!=='cloud'){try{return{service:'asr',requests:0,localModule:await this.localModule(asr),config:s.values};}catch(error){if(asr.mode==='local-only'||!request.allowCloud)throw error;}}
        if(!request.allowCloud)throw new ServiceToolError('CLOUD_PERMISSION_REQUIRED');
        if(!s.values.budget.enabled)throw new ServiceToolError('BUDGET_DISABLED');
        const target=cloudAsrTarget(asr),audio=await readCloudAudio(request.audioPath,target.maxAudioBytes);this.settings.secret(target.credential);
        return{service:'asr',requests:1,config:s.values,audio};
    }
    async execute(request:ServiceToolRequest,hooks:ServiceExecutionHooks={}):Promise<ServiceToolResult>{
        // Historical model requests stay readable, but may never reach settings, secrets or budget.
        if(request.tool==='media')throw new ServiceToolError('MEDIA_BROKER_REQUIRED');
        if(request.tool==='model')throw new ServiceToolError('MODEL_SERVICE_DISABLED');
        const prepared=await this.prepare(request);if(prepared.requests===1&&!this.settings.read().values.budget.enabled)throw new ServiceToolError('BUDGET_DISABLED');const {cacheKey}=prepared;
        if(cacheKey&&this.inflight.has(cacheKey))throw new ServiceToolError('REQUEST_IN_PROGRESS');if(cacheKey)this.inflight.add(cacheKey);
        let reserved=false,started=false;
        try{
            await hooks.beforeExecute?.({service:prepared.service,requests:prepared.requests,...(prepared.config?{config:structuredClone(prepared.config)}:{})});reserved=true;
            let result:ServiceToolResult;
            if(prepared.cached)result=prepared.cached;
            else{
                if(cacheKey){this.cache.set(cacheKey,{collectedAt:new Date().toISOString(),unknown:true,requestId:request.requestId});await this.saveCache();}
                started=true;const data=await this.invoke(request,prepared);result={data:this.scrub(data),service:prepared.service,requestsUsed:prepared.requests,collectedAt:new Date().toISOString(),cacheHit:false};
                if(cacheKey){this.cache.set(cacheKey,{collectedAt:result.collectedAt,data:result.data});await this.saveCache();}
            }
            const usage:Record<string,number|string|null>={costStatus:prepared.requests===0?'no-external-call':'unknown'};
            if(request.tool==='asr'){usage.durationMs=null;const data=result.data as Record<string,unknown>|null;if(data&&typeof data.durationMs==='number'&&Number.isFinite(data.durationMs)&&data.durationMs>=0)usage.durationMs=data.durationMs;}
            reserved=false;await hooks.afterExecute?.({service:prepared.service,requestsUsed:result.requestsUsed,ok:true,usage});return result;
        }catch(error){const code=error&&typeof error==='object'&&'code'in error&&typeof error.code==='string'&&/^[A-Z_]{1,80}$/.test(error.code)?error.code:'SERVICE_FAILED';const safe=error instanceof ServiceToolError?error:new ServiceToolError(code,started&&prepared.requests===1?null:0);if(cacheKey&&safe.requestsUsed===0&&!prepared.cached){this.cache.delete(cacheKey);await this.saveCache();}if(cacheKey&&safe.requestsUsed===null)this.cache.set(cacheKey,{collectedAt:new Date().toISOString(),unknown:true,requestId:request.requestId});if(reserved)await hooks.afterExecute?.({service:prepared.service,requestsUsed:prepared.requests===0?0:safe.requestsUsed,ok:false});throw safe;
        }finally{if(cacheKey)this.inflight.delete(cacheKey);}
    }
    async reconcileCost(requestId:string):Promise<void>{await this.loadCache();for(const [key,entry] of this.cache)if(entry.unknown&&entry.requestId===requestId)this.cache.delete(key);await this.saveCache();}
    private scrub(data:unknown):unknown{let json=JSON.stringify(data);for(const name of serviceCredentials){try{const key=this.settings.secret(name);if(key)json=json.split(JSON.stringify(key).slice(1,-1)).join('[redacted]');}catch{}}return JSON.parse(json);}
    private async invoke(request:ServiceToolRequest,p:Prepared):Promise<unknown>{
        const s=p.config??this.settings.read().values;
        if(request.tool==='tikhub'){
            const http=tikHubHttpRequest(request);
            const response=await boundedHttps(http.url,{method:http.method,headers:{Authorization:`Bearer ${this.settings.secret('tikhub')}`,'Content-Type':'application/json'},...(http.body?{body:http.body}:{})});
            if(response.data&&typeof response.data==='object'&&'code'in response.data&&response.data.code!==200&&response.data.code!==0)throw new ServiceToolError('PROVIDER_REJECTED',null);return response.data;
        }
        if(request.tool==='media')throw new ServiceToolError('MEDIA_BROKER_REQUIRED');
        if(request.tool==='model')throw new ServiceToolError('MODEL_SERVICE_DISABLED');
        if(p.requests===0){const st=await fs.lstat(request.audioPath);if(!st.isFile()||st.isSymbolicLink()||st.size>64*1024*1024)throw new ServiceToolError('INVALID_AUDIO');return this.localTranscribe(request.audioPath,p.localModule!,s.asr);}
        const asr=normalizeAsrSettings(s.asr),target=cloudAsrTarget(asr),current=normalizeAsrSettings(this.settings.read().values.asr);
        // Bind the prepared request to the current provider/endpoint before reading a credential.
        if(current.mode!==asr.mode||JSON.stringify(cloudAsrTarget(current))!==JSON.stringify(target))throw new ServiceToolError('SERVICE_CONFIG_CHANGED');
        const key=this.settings.secret(target.credential),audio=p.audio!;
        if(asr.cloud.provider!=='volc'){
            const multipart=asrMultipart(audio,path.extname(request.audioPath).toLowerCase(),target.modelId);
            const response=await boundedHttps(target.url,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':multipart.contentType},body:multipart.body,timeoutMs:180000});
            if(!response.data||typeof response.data!=='object'||!('text'in response.data)||typeof response.data.text!=='string')throw new ServiceToolError('INVALID_PROVIDER_RESPONSE',null);
            return response.data;
        }
        const data=await boundedHttps(target.url,{method:'POST',headers:{'Content-Type':'application/json','X-Api-Key':key,'X-Api-Resource-Id':asr.resourceId,'X-Api-Request-Id':request.requestId,'X-Api-Sequence':'-1'},body:JSON.stringify({user:{uid:'nova-workbench'},audio:{data:audio.toString('base64')},request:{model_name:'bigmodel',enable_itn:true,enable_punc:true}}),timeoutMs:180000});
        if(data.headers['x-api-status-code']!=='20000000')throw new ServiceToolError('PROVIDER_REJECTED',null);return data.data;
    }
    private async localTranscribe(audio:string,module:string,a:ServiceSettingsValues['asr']):Promise<unknown>{
        let script:string;
        if(module==='faster_whisper')script='import sys,json\nfrom faster_whisper import WhisperModel\nm=WhisperModel(sys.argv[1],device="cpu",compute_type="int8",local_files_only=True)\nsegments,info=m.transcribe(sys.argv[2])\ns=[{"startMs":round(x.start*1000),"endMs":round(x.end*1000),"text":x.text} for x in segments]\nprint(json.dumps({"text":"".join(x["text"] for x in s),"segments":s,"durationMs":round(info.duration*1000)},ensure_ascii=False))';
        else if(module==='qwen_asr')script='import sys,json\nfrom qwen_asr import Qwen3ASRModel\nm=Qwen3ASRModel.from_pretrained(sys.argv[1],device_map="cpu")\nr=m.transcribe(audio=sys.argv[2])\nprint(json.dumps({"text":"\\n".join(x.text for x in r),"segments":[]},ensure_ascii=False))';
        else if(module==='mlx_audio')script='import sys,json\nfrom mlx_audio.stt.utils import load_model\nm=load_model(sys.argv[1])\nr=m.generate(sys.argv[2])\nprint(json.dumps({"text":r.text,"segments":[]},ensure_ascii=False))';
        else {const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nova-whisper-'));try{const output=path.join(dir,'transcript');await run(a.localExecutable,['-m',a.localModelPath,'-f',audio,'-oj','-of',output],600000);const json=await fs.readFile(`${output}.json`,'utf8');if(json.length>4*1024*1024)throw new ServiceToolError('RESPONSE_TOO_LARGE');return JSON.parse(json);}finally{await fs.rm(dir,{recursive:true,force:true});}}
        const out=await run(a.localExecutable,['-c',script,a.localModelPath,audio],600000);try{return JSON.parse(out.trim().split('\n').at(-1)!);}catch{throw new ServiceToolError('INVALID_LOCAL_RESPONSE');}
    }
}
