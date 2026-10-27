import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
export interface LocalAsrRuntimeTarget {platform:string;arch:string;macOSMajor?:number}
export interface LocalAsrTimingRuntime {pythonSitePath:string;modelPath:string;model:{repoId:string;revision:string;sha256:string}}
export interface LocalAsrRuntime {root:string;executable:string;modelPath:string;engine:'qwen3-asr';module:'mlx_audio';model:{repoId:string;revision:string;license:string};timing?:LocalAsrTimingRuntime}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
async function hostTarget():Promise<LocalAsrRuntimeTarget>{let macOSMajor:number|undefined;if(process.platform==='darwin')try{macOSMajor=Number((await promisify(execFile)('/usr/bin/sw_vers',['-productVersion'],{timeout:3000})).stdout.trim().split('.')[0]);}catch{}return{platform:process.platform,arch:process.arch,macOSMajor};}
async function inside(root:string,relative:unknown):Promise<string>{if(typeof relative!=='string'||!relative||path.isAbsolute(relative)||relative.split(/[\\/]/).some(p=>p==='..'||p===''))throw new Error('INVALID_RUNTIME_PATH');const absolute=path.resolve(root,relative),real=await fs.realpath(absolute);if(!real.startsWith(`${root}${path.sep}`))throw new Error('INVALID_RUNTIME_PATH');return absolute;}
async function optionalTiming(root:string,value:unknown):Promise<LocalAsrTimingRuntime|undefined>{
    try{
        if(!record(value)||value.engine!=='faster-whisper'||value.module!=='faster_whisper'||!record(value.model))return;
        const model=value.model;if(typeof model.repoId!=='string'||typeof model.revision!=='string'||!/^[a-f0-9]{40}$/.test(model.revision)||!Array.isArray(model.files)||model.files.length>100)return;
        const pythonSitePath=await inside(root,value.pythonSitePath),modelPath=await inside(root,value.modelPath);if(!(await fs.stat(pythonSitePath)).isDirectory()||!(await fs.stat(modelPath)).isDirectory())return;
        let sha256:string|undefined;for(const f of model.files){if(!record(f)||typeof f.bytes!=='number'||f.bytes<1)throw new Error('INCOMPLETE_TIMING_MODEL');const file=await inside(modelPath,f.path),stat=await fs.stat(file);if(!stat.isFile()||stat.size!==f.bytes)throw new Error('INCOMPLETE_TIMING_MODEL');if(f.path==='model.bin'&&typeof f.sha256==='string'&&/^[a-f0-9]{64}$/.test(f.sha256))sha256=f.sha256;}
        if(sha256)return{pythonSitePath,modelPath,model:{repoId:model.repoId,revision:model.revision,sha256}};
    }catch{/* Missing timing never disables the independently complete Qwen text runtime. */}
    return undefined;
}
/** Only explicit application resources are considered; never inspect CWD, PATH, caches or credentials. */
export async function discoverLocalAsrRuntime(roots:readonly string[],target?:LocalAsrRuntimeTarget):Promise<LocalAsrRuntime|undefined>{
    const native=target??await hostTarget();
    for(const candidate of roots){try{
        if(!path.isAbsolute(candidate))continue;const root=await fs.realpath(candidate),manifestPath=path.join(root,'runtime.json'),stat=await fs.lstat(manifestPath);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>262144)continue;
        const m:unknown=JSON.parse(await fs.readFile(manifestPath,'utf8'));
        if(!record(m)||m.version!==1||m.platform!==native.platform||m.arch!==native.arch||m.platform!=='darwin'||m.arch!=='arm64'||m.macOSMajor!==native.macOSMajor||m.engine!=='qwen3-asr'||m.module!=='mlx_audio'||!record(m.model))continue;
        const model=m.model;if(typeof model.repoId!=='string'||typeof model.revision!=='string'||!/^[a-f0-9]{40}$/.test(model.revision)||typeof model.license!=='string'||!Array.isArray(model.files)||!model.files.length||model.files.length>500)continue;
        const executable=await inside(root,m.executable),modelPath=await inside(root,m.modelPath);if(!(await fs.stat(executable)).isFile()||!(await fs.stat(modelPath)).isDirectory())continue;await fs.access(executable,fs.constants.X_OK);
        let weights=false,config=false;
        for(const file of model.files){if(!record(file)||typeof file.bytes!=='number'||file.bytes<1)throw new Error('INVALID_MODEL');const full=await inside(modelPath,file.path),s=await fs.stat(full);if(!s.isFile()||s.size!==file.bytes)throw new Error('INCOMPLETE_MODEL');if(typeof file.path==='string'&&file.path.endsWith('.safetensors'))weights=true;if(file.path==='config.json'){config=true;const c=JSON.parse(await fs.readFile(full,'utf8'));if(c.model_type!=='qwen3_asr')throw new Error('INVALID_MODEL');}}
        if(!weights||!config)continue;
        const timing=await optionalTiming(root,m.timing);
        return{root,executable,modelPath,engine:'qwen3-asr',module:'mlx_audio',...(timing?{timing}:{}),model:{repoId:model.repoId,revision:model.revision,license:model.license}};
    }catch{/* An incomplete or foreign payload is never advertised as ready. */}}
    return undefined;
}
