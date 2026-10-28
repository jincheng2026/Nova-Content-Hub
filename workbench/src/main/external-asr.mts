import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {externalAsrSamples} from './external-asr-samples.mts';
import type {AsrSettings, ExternalAsrCandidate, ExternalAsrCapabilities} from '../shared/service-contracts.ts';
export type ExternalAsrModule = 'mlx_audio'|'qwen_asr';
export interface ExternalAsrTarget {platform:string;arch:string}
export interface FrozenExternalAsr extends ExternalAsrCandidate {module:ExternalAsrModule;identity:string}
export interface ExternalAsrValidation {candidate:ExternalAsrCandidate;status:'ready'|'unavailable';reason:string;capabilities:ExternalAsrCapabilities;frozen?:FrozenExternalAsr;sampleText?:string;checkedAt:string}
export interface ExternalAsrProof {platform:string;arch:string;python:string;module:ExternalAsrModule;text:string;mp4Decode:boolean;dependencies:Record<string,string>}
export type ExternalAsrRunner=(candidate:ExternalAsrCandidate,options:{signal?:AbortSignal;timeoutMs:number})=>Promise<ExternalAsrProof>;
const nativeTarget=():ExternalAsrTarget=>({platform:process.platform,arch:process.arch});
const failure=(code:string)=>Object.assign(new Error(code),{code});
const cancelled=(signal?:AbortSignal)=>{if(signal?.aborted)throw failure('EXTERNAL_ASR_CANCELLED');};
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const candidate=(executable:string,modelPath:string,module?:ExternalAsrModule):ExternalAsrCandidate=>({id:digest(JSON.stringify([executable,modelPath,module??'auto'])),executable,modelPath,...(module?{module}:{})});
async function executableFile(file:string){try{if(!path.isAbsolute(file)||!(await fs.stat(file)).isFile())return false;await fs.access(file,fs.constants.X_OK);return true;}catch{return false;}}
/** Only named installation roots and bounded immediate children are examined. No discovered code is executed. */
export async function discoverExternalAsrCandidates(options:{saved?:Pick<AsrSettings,'localExecutable'|'localModelPath'|'localModule'>;home?:string;target?:ExternalAsrTarget;signal?:AbortSignal}={}):Promise<ExternalAsrCandidate[]>{
    const home=options.home??os.homedir(),executables:string[]=[],models:string[]=[],result:ExternalAsrCandidate[]=[];
    cancelled(options.signal);
    const saved=options.saved;
    if(saved?.localExecutable&&saved.localModelPath)result.push(candidate(saved.localExecutable,saved.localModelPath,saved.localModule));
    const legacy=path.join(home,'Library/Application Support/NovaIsland/NovaContentHub/local-asr-qwen');
    const environmentRoots=[path.join(home,'.venvs'),path.join(home,'.virtualenvs'),path.join(home,'miniconda3/envs'),path.join(home,'anaconda3/envs'),path.join(home,'miniforge3/envs'),path.join(home,'mambaforge/envs'),path.join(home,'.local/share/uv/tools'),path.join(home,'.local/share/pipx/venvs')];
    const environments=[path.join(home,'.venv'),path.join(home,'venv'),path.join(legacy,'venv'),path.join(home,'miniconda3'),path.join(home,'miniforge3'),path.join(home,'anaconda3')];
    let remaining=256;
    async function children(directory:string){cancelled(options.signal);const found:string[]=[];try{let count=0;for await(const entry of await fs.opendir(directory)){cancelled(options.signal);if(count++>=64||remaining--<=0)break;if(entry.isDirectory())found.push(path.join(directory,entry.name));}}catch(error){cancelled(options.signal);}return found;}
    for(const directory of environmentRoots){if(remaining<=0)break;environments.push(...await children(directory));}
    // GUI startup does not assume a shell's PATH. These are explicit interpreter locations.
    const direct=[path.join(home,'.local/bin/python3'),'/opt/homebrew/bin/python3','/usr/local/bin/python3','/usr/bin/python3'];
    for(const environment of environments){for(const name of ['python3','python']){const file=path.join(environment,'bin',name);if(await executableFile(file)){executables.push(file);break;}}}
    for(const file of direct)if(await executableFile(file))executables.push(file);
    // Tests and portable home scans never pull interpreters from the developer's machine.
    if(options.home)executables.splice(0,executables.length,...executables.filter(file=>file.startsWith(`${home}${path.sep}`)));
    for(const directory of [path.join(home,'Models'),path.join(home,'models'),path.join(legacy,'models')]){if(remaining<=0)break;models.push(...await children(directory));}
    for(const cache of [path.join(home,'.cache/huggingface/hub'),path.join(home,'.cache/modelscope/hub/models/Qwen')]){
        if(remaining<=0)break;
        for(const repo of await children(cache))if(/qwen.*asr/i.test(path.basename(repo))){models.push(repo);if(remaining>0)models.push(...await children(path.join(repo,'snapshots')));}
    }
    const canonicalModels=[];for(const model of models)try{canonicalModels.push(await fs.realpath(model));}catch{}
    for(const executable of [...new Set(executables)])for(const modelPath of [...new Set(canonicalModels)]){cancelled(options.signal);if(result.length>=12)return result;try{await modelIdentity(modelPath);const c=candidate(executable,modelPath);if(!result.some(r=>r.executable===executable&&r.modelPath===modelPath))result.push(c);}catch{}}
    return result;
}
async function modelIdentity(directory:string):Promise<unknown>{
    if(!path.isAbsolute(directory))throw failure('EXTERNAL_ASR_MODEL');
    const real=await fs.realpath(directory),configPath=path.join(real,'config.json'),stat=await fs.stat(configPath);
    if(!stat.isFile()||stat.size>2*1024*1024)throw failure('EXTERNAL_ASR_MODEL');
    const configText=await fs.readFile(configPath,'utf8'),config=JSON.parse(configText);
    if(config.model_type!=='qwen3_asr')throw failure('EXTERNAL_ASR_MODEL');
    const entries=await fs.readdir(real);if(entries.length>500)throw failure('EXTERNAL_ASR_MODEL');
    const weights=entries.filter(file=>file.endsWith('.safetensors')).sort();if(!weights.length)throw failure('EXTERNAL_ASR_MODEL');
    const files=[];for(const file of entries.sort()){const full=path.join(real,file),s=await fs.stat(full);await fs.access(full,fs.constants.R_OK);if(!s.isFile()){if(weights.includes(file))throw failure('EXTERNAL_ASR_MODEL');continue;}if(weights.includes(file)&&s.size<1)throw failure('EXTERNAL_ASR_MODEL');files.push([file,await fs.realpath(full),s.size,s.mtimeMs,s.ino]);}
    return [real,digest(configText),files];
}
/** Fixed implementation surface, not a recursive site-packages or model-weight scan.
 * Python bytes are rehashed on every check: size/mtime caching misses in-place edits.
 * Large native libraries retain metadata identity, as model weights do. Missing optional
 * paths are recorded by omission; unreadable/oversized implementations fail closed.
 */
async function dependencyIdentity(environment:string,module?:ExternalAsrModule):Promise<unknown[]> {
    const result:unknown[]=[],budget={entries:0,bytes:0};
    const sourceLimit=4*1024*1024;
    async function visit(full:string,relative:string,depth=0):Promise<void>{
        if(++budget.entries>8192||depth>12)throw failure('EXTERNAL_ASR_DEPENDENCY');
        let stat;try{stat=await fs.stat(full);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error;}
        const real=await fs.realpath(full);
        if(stat.isDirectory()){
            result.push([relative,real,'directory']);
            const entries=[];
            for await(const entry of await fs.opendir(full)){
                if(++budget.entries>8192)throw failure('EXTERNAL_ASR_DEPENDENCY');
                if(entry.name!=='__pycache__'&&!entry.name.startsWith('.'))entries.push(entry.name);
            }
            for(const name of entries.sort())await visit(path.join(full,name),`${relative}/${name}`,depth+1);
        }else if(stat.isFile()&&/\.(?:py|pyi|so|pyd|dll|dylib)$/.test(relative)){
            const metadata=[relative,real,stat.size,stat.mtimeMs,stat.ino];
            if(/\.pyi?$/.test(relative)){
                if(stat.size>sourceLimit||budget.bytes+stat.size>32*1024*1024)throw failure('EXTERNAL_ASR_DEPENDENCY');
                const handle=await fs.open(full,'r');
                try{
                    // Bounded read also protects against a file growing between stat and read.
                    const bytes=Buffer.alloc(stat.size+1);let bytesRead=0;
                    while(bytesRead<bytes.length){const read=await handle.read(bytes,bytesRead,bytes.length-bytesRead,bytesRead);if(!read.bytesRead)break;bytesRead+=read.bytesRead;}
                    if(bytesRead!==stat.size)throw failure('EXTERNAL_ASR_DEPENDENCY');
                    budget.bytes+=bytesRead;result.push([...metadata,createHash('sha256').update(bytes.subarray(0,bytesRead)).digest('hex')]);
                }finally{await handle.close();}
            }else result.push(metadata);
        }
    }
    let versions:string[];
    try{versions=(await fs.readdir(path.join(environment,'lib'))).filter(n=>/^python\d+\.\d+$/.test(n)).sort();}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')versions=[];else throw failure('EXTERNAL_ASR_DEPENDENCY');}
    if(versions.length>4)throw failure('EXTERNAL_ASR_DEPENDENCY');
    const common=['av','tokenizers','safetensors','transformers/__init__.py','transformers/modeling_utils.py','transformers/processing_utils.py','transformers/models/qwen3','transformers/models/qwen3_asr'];
    const mlx=['mlx_audio/__init__.py','mlx_audio/stt/__init__.py','mlx_audio/stt/utils.py','mlx_audio/stt/models/__init__.py','mlx_audio/stt/models/base.py','mlx_audio/stt/models/qwen3_asr','mlx','mlx_lm/models/base.py'];
    const qwen=['qwen_asr','torch/__init__.py','torch/lib','torch/_C','torchaudio/__init__.py','torchaudio/lib'];
    try{
        const sites=versions.map(version=>({label:version,site:path.join(environment,'lib',version,'site-packages')}));
        sites.push({label:'windows',site:path.join(environment,'Lib','site-packages')});
        for(const {label:version,site} of sites){
            const roots=[...common,...(module==='qwen_asr'?qwen:module==='mlx_audio'?mlx:[...mlx,...qwen])];
            for(const relative of roots)await visit(path.join(site,relative),`${version}/${relative}`);
            // CPython extension filenames include ABI tags, so the exact torch._C path varies.
            if(module!=='mlx_audio'){
                let names:string[]=[];try{names=await fs.readdir(path.join(site,'torch'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
                if(names.length>8192)throw failure('EXTERNAL_ASR_DEPENDENCY');
                for(const name of names.filter(n=>/^_C[.].*\.(so|pyd)$/.test(n)).sort())await visit(path.join(site,'torch',name),`${version}/torch/${name}`);
            }
        }
    }catch{throw failure('EXTERNAL_ASR_DEPENDENCY');}
    return result;
}
export async function externalAsrIdentity(c:ExternalAsrCandidate):Promise<string>{
    if(!await executableFile(c.executable))throw failure('EXTERNAL_ASR_EXECUTABLE');
    const executable=await fs.realpath(c.executable),s=await fs.stat(executable),environment=path.dirname(path.dirname(c.executable));
    let config='';try{const p=path.join(environment,'pyvenv.cfg');if((await fs.stat(p)).size<65536)config=await fs.readFile(p,'utf8');}catch{}
    const libraries=await dependencyIdentity(environment,c.module);
    return digest(JSON.stringify([c.executable,executable,s.size,s.mtimeMs,s.ino,config,libraries,c.module??'auto',await modelIdentity(c.modelPath)]));
}
export async function assertExternalAsrIdentity(frozen:FrozenExternalAsr):Promise<void>{try{if(await externalAsrIdentity(frozen)!==frozen.identity)throw failure('EXTERNAL_ASR_CHANGED');}catch{throw failure('EXTERNAL_ASR_CHANGED');}}
export function qwenTranscriptionScript(module:ExternalAsrModule):string {
    return module==='mlx_audio'?'from mlx_audio.stt.utils import load_model\nm=load_model(sys.argv[1])\nr=m.generate(sys.argv[2])\ntext=r.text':'from qwen_asr import Qwen3ASRModel\nm=Qwen3ASRModel.from_pretrained(sys.argv[1],device_map="cpu",local_files_only=True)\nr=m.transcribe(audio=sys.argv[2])\ntext="\\n".join(x.text for x in r)';
}
export const EXTERNAL_ASR_PROBE_SCRIPT=`import sys,json,platform,importlib,importlib.metadata,socket,os
# Fixed probe refuses network use even if a dependency ignores Hugging Face offline flags.
def offline(*args,**kwargs): raise RuntimeError("NETWORK_DISABLED")
socket.create_connection=offline
socket.socket.connect=offline
socket.socket.connect_ex=offline
model,wav,mp4,wanted=sys.argv[1:5]
module=None
for name in ([wanted] if wanted else (["mlx_audio","qwen_asr"] if sys.platform=="darwin" and platform.machine()=="arm64" else ["qwen_asr"])):
 try:
  if name=="mlx_audio":
   ${qwenTranscriptionScript('mlx_audio').split('\n').join('\n   ')}
  else:
   ${qwenTranscriptionScript('qwen_asr').split('\n').join('\n   ')}
  if not isinstance(text,str) or not text.strip(): continue
  module=name
  break
 except Exception: pass
if not module: raise RuntimeError("DEPENDENCY_OR_TRANSCRIPTION_FAILED")
decoded=False
try:
 import av
 with av.open(mp4,format="mov",options={"protocol_whitelist":"file","enable_drefs":"0","use_absolute_path":"0"}) as container:
  decoded=any(f.samples>0 for f in container.decode(audio=0))
except Exception: pass
versions={}
for name in [module,"av"]:
 try: versions[name]=importlib.metadata.version(name.replace("_","-"))
 except Exception: pass
print(json.dumps({"platform":sys.platform,"arch":{"aarch64":"arm64","AMD64":"x64","x86_64":"x64"}.get(platform.machine(),platform.machine()),"python":platform.python_version(),"module":module,"text":text,"mp4Decode":decoded,"dependencies":versions},ensure_ascii=False))`;
export async function runExternalAsrProcess(executable:string,args:string[],options:{signal?:AbortSignal;timeoutMs?:number}={}):Promise<string>{
    cancelled(options.signal);
    return new Promise((resolve,reject)=>{
        const child=spawn(executable,args,{shell:false,windowsHide:true,detached:process.platform!=='win32',env:{HOME:os.homedir(),TMPDIR:os.tmpdir(),PATH:process.platform==='win32'?process.env.PATH:'/usr/bin:/bin',SYSTEMROOT:process.env.SYSTEMROOT,LANG:'en_US.UTF-8',PYTHONIOENCODING:'utf-8',PYTHONDONTWRITEBYTECODE:'1',HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',HF_DATASETS_OFFLINE:'1',HF_HUB_DISABLE_TELEMETRY:'1'}});
        let output='',bytes=0,done=false;
        const kill=()=>{try{if(process.platform==='win32')child.kill('SIGKILL');else process.kill(-child.pid!,'SIGKILL');}catch{}};
        const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);options.signal?.removeEventListener('abort',abort);if(error){kill();reject(error);}else resolve(output);};
        const abort=()=>finish(failure('EXTERNAL_ASR_CANCELLED'));
        const timer=setTimeout(()=>finish(failure('EXTERNAL_ASR_TIMEOUT')),options.timeoutMs??120000);
        options.signal?.addEventListener('abort',abort,{once:true});
        child.stdout.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>1024*1024)finish(failure('EXTERNAL_ASR_OUTPUT'));else output+=chunk.toString('utf8');});
        child.stderr.on('data',()=>{});child.on('error',()=>finish(failure('EXTERNAL_ASR_EXECUTABLE')));child.on('close',code=>finish(code===0?undefined:failure('EXTERNAL_ASR_DEPENDENCY')));
        if(options.signal?.aborted)abort();
    });
}
const cache=new Map<string,ExternalAsrValidation>();
export async function validateExternalAsrCandidate(c:ExternalAsrCandidate,options:{target?:ExternalAsrTarget;signal?:AbortSignal;runner?:ExternalAsrRunner;timeoutMs?:number;force?:boolean}={}):Promise<ExternalAsrValidation>{
    cancelled(options.signal);
    const capabilities={text:false,timestamps:false,mp4Decode:false},checkedAt=new Date().toISOString();
    try{
        const target=options.target??nativeTarget();let identity=await externalAsrIdentity(c);
        const cached=cache.get(identity);if(cached&&!options.force&&!options.runner)return structuredClone(cached);
        const runner=options.runner??(async(candidate,opts)=>{const directory=await fs.mkdtemp(path.join(os.tmpdir(),'nova-asr-probe-'));try{const wav=path.join(directory,'known-chinese.wav'),mp4=path.join(directory,'known-chinese.mp4');await fs.writeFile(wav,externalAsrSamples.wav,{mode:0o600});await fs.writeFile(mp4,externalAsrSamples.mp4,{mode:0o600});const output=await runExternalAsrProcess(candidate.executable,['-B','-I','-c',EXTERNAL_ASR_PROBE_SCRIPT,candidate.modelPath,wav,mp4,candidate.module??''],opts);return JSON.parse(output.trim().split('\n').at(-1)!);}finally{await fs.rm(directory,{recursive:true,force:true});}});
        const proof=await runner(c,{signal:options.signal,timeoutMs:options.timeoutMs??120000});cancelled(options.signal);
        if(!proof||proof.platform!==target.platform||proof.arch!==target.arch)throw failure('EXTERNAL_ASR_ARCH');
        if(!['mlx_audio','qwen_asr'].includes(proof.module)||c.module&&proof.module!==c.module||!/^3\.(?:1[0-9]|[2-9][0-9])\./.test(proof.python)||typeof proof.text!=='string'||!proof.text.trim()||!/(你好|语音|測試|测试)/.test(proof.text)||proof.text.length>4000)throw failure('EXTERNAL_ASR_PROOF');
        if(await externalAsrIdentity(c)!==identity)throw failure('EXTERNAL_ASR_CHANGED');
        const selected={...c,module:proof.module};identity=await externalAsrIdentity(selected);
        const result:ExternalAsrValidation={candidate:selected,status:'ready',reason:`${proof.module} 已通过真实短音频识别；${proof.mp4Decode?'MP4 解码通过':'未验证 MP4 解码（需要此 Python 的 av 依赖）'}；未验证真实时间码。`,capabilities:{text:true,timestamps:false,mp4Decode:proof.mp4Decode===true},frozen:{...selected,identity},sampleText:proof.text,checkedAt};
        if(!options.runner){cache.set(await externalAsrIdentity(c),result);cache.set(identity,result);if(cache.size>24)cache.delete(cache.keys().next().value!);}return structuredClone(result);
    }catch(error){if(error&&typeof error==='object'&&'code'in error&&error.code==='EXTERNAL_ASR_CANCELLED')throw error;const code=error&&typeof error==='object'&&'code'in error?String(error.code):'';return{candidate:c,status:'unavailable',reason:code==='EXTERNAL_ASR_TIMEOUT'?`本地语音环境初始化或真实短音频试转写在 ${Math.ceil((options.timeoutMs??120000)/1000)} 秒内未完成，尚未就绪；可重新检测。`:code==='EXTERNAL_ASR_ARCH'?'Python 架构或系统与本机不匹配，请选择本机原生环境。':code==='EXTERNAL_ASR_MODEL'?'模型类型不是完整的 Qwen3-ASR，或文件不可读。':code==='EXTERNAL_ASR_CHANGED'?'环境或模型已变化，请重新检测。':code==='EXTERNAL_ASR_EXECUTABLE'?'Python 路径不存在或不可执行。':'Python 依赖、模型加载或真实短音频识别未通过；不会下载或转云端。',capabilities,checkedAt};}
}
