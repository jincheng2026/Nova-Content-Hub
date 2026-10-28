import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

export interface MediaCodecRuntimeTarget {platform:string;arch:string;macOSVersion?:string;macOSMajor?:number}
export interface MediaCodecManifestFile {path:string;bytes:number;sha256:string}
export interface MediaCodecManifest {
    format:'nova-media-codec-runtime';version:1;platform:'darwin';arch:'arm64';minimumMacOS:string;
    executable:'python/bin/python3';pythonSitePath:'site';pythonVersion:string;pyavVersion:string;
    files:MediaCodecManifestFile[];source:{payloadManifestSha256:string};verifiedOn:{macOSVersion:string};
}
export interface MediaCodecRuntime {
    root:string;executable:string;pythonSitePath:string;minimumMacOS:string;identity:string;manifest:MediaCodecManifest;
    /** Explicit target arguments inspect integrity only; native discovery also executes the fixed offline probe. */
    validation:'integrity-only'|'offline-codec-self-test';
}
const execute=promisify(execFile);
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const version=(v:unknown):v is string=>typeof v==='string'&&/^\d{1,3}\.\d{1,3}(?:\.\d{1,3})?$/.test(v);
const versionNumber=(v:string)=>v.split('.').reduce((sum,p,i)=>sum+Number(p)*[65536,256,1][i]!,0);
const decodeVersion=(n:number)=>`${n>>>16}.${(n>>>8)&255}.${n&255}`;
const relative=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=512&&!v.includes('\\')&&!path.isAbsolute(v)&&!v.split('/').some(p=>!p||p==='.'||p==='..');
const forbidden=(p:string)=>/(?:^|\/)(?:models?|mlx(?:_audio|_lm)?|torch|transformers|whisper|faster_whisper|qwen(?:3)?(?:_asr)?|numpy|site-packages)(?:\/|[.-]|$)|\.(?:safetensors|gguf|ggml|pt|pth|ckpt|onnx)$/i.test(p);

/** Parse the actual thin native load commands, rather than trusting wheel tags or old ASR metadata. */
export function inspectMediaCodecMachO(bytes:Buffer):{arch:'arm64';minimumMacOS:string;dependencies:string[];rpaths:string[]}|undefined{
    if(bytes.length<4)return;
    const magic=bytes.readUInt32LE(0);
    if(magic!==0xfeedfacf){if([0xfeedface,0xcefaedfe,0xcffaedfe,0xbebafeca,0xcafebabe,0xbfbafeca,0xcafebabf].includes(magic))throw Error('MEDIA_CODEC_NON_NATIVE_BINARY');return;}
    if(bytes.length<32||bytes.readUInt32LE(4)!==0x0100000c)throw Error('MEDIA_CODEC_NON_NATIVE_BINARY');
    const count=bytes.readUInt32LE(16),end=32+bytes.readUInt32LE(20);if(count>1000||end>bytes.length)throw Error('MEDIA_CODEC_INVALID_MACHO');
    let offset=32,minimum:number|undefined;const dependencies:string[]=[],rpaths:string[]=[];
    for(let i=0;i<count;i++){
        if(offset+8>end)throw Error('MEDIA_CODEC_INVALID_MACHO');const command=bytes.readUInt32LE(offset),size=bytes.readUInt32LE(offset+4);if(size<8||offset+size>end)throw Error('MEDIA_CODEC_INVALID_MACHO');
        if(command===0x32){if(size<24||bytes.readUInt32LE(offset+8)!==1)throw Error('MEDIA_CODEC_INVALID_MACHO');minimum=Math.max(minimum??0,bytes.readUInt32LE(offset+12));}
        if(command===0x24){if(size<16)throw Error('MEDIA_CODEC_INVALID_MACHO');minimum=Math.max(minimum??0,bytes.readUInt32LE(offset+8));}
        if([0xc,0x80000018,0x8000001f,0x20,0x80000023,0x8000001c].includes(command)){
            if(size<12)throw Error('MEDIA_CODEC_INVALID_MACHO');const start=bytes.readUInt32LE(offset+8);if(start<12||start>=size)throw Error('MEDIA_CODEC_INVALID_MACHO');const text=bytes.subarray(offset+start,offset+size),nul=text.indexOf(0);if(nul<1)throw Error('MEDIA_CODEC_INVALID_MACHO');(command===0x8000001c?rpaths:dependencies).push(text.subarray(0,nul).toString('utf8'));
        }
        offset+=size;
    }
    if(offset!==end||!minimum)throw Error('MEDIA_CODEC_UNKNOWN_MINIMUM_MACOS');
    return{arch:'arm64',minimumMacOS:decodeVersion(minimum),dependencies,rpaths};
}

async function inventory(root:string,directory=root,files:string[]=[]):Promise<string[]>{
    for(const entry of await fs.readdir(directory,{withFileTypes:true})){
        const full=path.join(directory,entry.name);if(entry.isSymbolicLink())throw Error('MEDIA_CODEC_SYMLINK');
        if(entry.isDirectory())await inventory(root,full,files);else if(entry.isFile())files.push(path.relative(root,full).split(path.sep).join('/'));else throw Error('MEDIA_CODEC_INVALID_FILE');
        if(files.length>5000)throw Error('MEDIA_CODEC_TOO_MANY_FILES');
    }return files;
}
function assertDependencies(root:string,executable:string,files:Set<string>,binaries:Map<string,NonNullable<ReturnType<typeof inspectMediaCodecMachO>>>):void{
    const present=(p:string)=>{const r=path.relative(root,p).split(path.sep).join('/');return relative(r)&&files.has(r);};
    for(const [file,info] of binaries){
        const loader=path.dirname(path.join(root,file)),expand=(s:string)=>s.replace(/^@loader_path(?=\/|$)/,loader).replace(/^@executable_path(?=\/|$)/,path.dirname(executable));
        for(const dependency of info.dependencies){
            if(dependency.startsWith('/usr/lib/')||dependency.startsWith('/System/Library/'))continue;
            if(dependency.startsWith('@loader_path/')||dependency.startsWith('@executable_path/')){if(!present(path.resolve(expand(dependency))))throw Error('MEDIA_CODEC_MISSING_DYLIB');}
            else if(dependency.startsWith('@rpath/')){if(!info.rpaths.some(p=>present(path.resolve(expand(p),dependency.slice(7)))))throw Error('MEDIA_CODEC_MISSING_DYLIB');}
            else throw Error('MEDIA_CODEC_EXTERNAL_DYLIB');
        }
    }
}

// It uses only stdlib/PyAV planes. NumPy, Pillow, FFmpeg executables, ML engines and models are not dependencies.
export const MEDIA_CODEC_SELF_TEST_SCRIPT=String.raw`import sys,os,json,struct,zlib,wave,math,array
sys.path.insert(0,sys.argv[1])
import av
directory=sys.argv[2]
source=os.path.join(directory,'codec-self-test.mp4')
with av.open(source,'w',format='mp4') as output:
 video=output.add_stream('mpeg4',rate=10);video.width=64;video.height=48;video.pix_fmt='yuv420p'
 audio=output.add_stream('aac',rate=48000);audio.layout='mono'
 for i in range(10):
  frame=av.VideoFrame(64,48,'yuv420p');frame.pts=i
  for n,plane in enumerate(frame.planes):plane.update(bytes([32+i*10 if n==0 else 128])*plane.buffer_size)
  for packet in video.encode(frame):output.mux(packet)
  sound=av.AudioFrame(format='s16',layout='mono',samples=4800);sound.sample_rate=48000;sound.pts=i*4800
  pcm=array.array('h',(int(5000*math.sin(2*math.pi*440*(i*4800+n)/48000)) for n in range(4800)))
  sound.planes[0].update(pcm.tobytes())
  for packet in audio.encode(sound):output.mux(packet)
 for stream in (video,audio):
  for packet in stream.encode(None):output.mux(packet)
def opened():return av.open(source,options={'protocol_whitelist':'file','enable_drefs':'0','use_absolute_path':'0'})
with opened() as container:
 assert len(container.streams.video)==1 and len(container.streams.audio)==1
 frame=next(container.decode(video=0));rgb=frame.reformat(format='rgb24');plane=rgb.planes[0];pixels=bytes(plane)
 rows=b''.join(b'\x00'+pixels[y*plane.line_size:y*plane.line_size+rgb.width*3] for y in range(rgb.height))
 def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
 png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',rgb.width,rgb.height,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(rows))+chunk(b'IEND',b'')
 with open(os.path.join(directory,'codec-self-test.png'),'wb') as output:output.write(png)
 assert rgb.width==64 and rgb.height==48 and len(pixels)>0
with opened() as container:
 resampler=av.AudioResampler(format='s16',layout='mono',rate=16000);pcm=bytearray()
 for frame in container.decode(audio=0):
  for converted in resampler.resample(frame):pcm.extend(bytes(converted.planes[0])[:converted.samples*2])
 for converted in resampler.resample(None):pcm.extend(bytes(converted.planes[0])[:converted.samples*2])
 assert 30000<=len(pcm)<=35000 and any(pcm)
 with wave.open(os.path.join(directory,'codec-self-test.wav'),'wb') as output:output.setparams((1,2,16000,0,'NONE','not compressed'));output.writeframes(pcm)
assert 'numpy' not in sys.modules
assert not any('site-packages' in p or 'local-asr' in p for p in sys.path)
print(json.dumps({'ok':True,'pyavVersion':av.__version__,'video':'mpeg4','audio':'aac','pcmSampleRate':16000,'pcmBytes':len(pcm),'pngBytes':len(png),'pythonExecutable':sys.executable}))`;

const selfTests=new Map<string,Promise<boolean>>();
async function nativeSelfTest(runtime:MediaCodecRuntime,macOSVersion:string):Promise<boolean>{
    const key=`${runtime.root}:${runtime.identity}:${macOSVersion}`;
    let pending=selfTests.get(key);if(pending)return pending;
    pending=(async()=>{const directory=await fs.mkdtemp(path.join(os.tmpdir(),'nova-codec-self-test-'));try{
        const env={HOME:directory,TMPDIR:directory,TMP:directory,TEMP:directory,PATH:'',LANG:'C.UTF-8',PYTHONIOENCODING:'utf-8'};
        const {stdout}=await execute(runtime.executable,['-B','-I','-S','-c',MEDIA_CODEC_SELF_TEST_SCRIPT,runtime.pythonSitePath,directory],{timeout:60000,killSignal:'SIGKILL',maxBuffer:16384,cwd:directory,env,windowsHide:true});
        const result:unknown=JSON.parse(stdout);return record(result)&&result.ok===true&&result.pyavVersion===runtime.manifest.pyavVersion&&result.pcmSampleRate===16000;
    }catch{return false;}finally{await fs.rm(directory,{recursive:true,force:true});}})();
    selfTests.set(key,pending);const passed=await pending;if(!passed)selfTests.delete(key);return passed;
}
async function nativeTarget():Promise<MediaCodecRuntimeTarget>{
    let macOSVersion:string|undefined;if(process.platform==='darwin')try{macOSVersion=(await execute('/usr/bin/sw_vers',['-productVersion'],{timeout:3000})).stdout.trim();}catch{}
    return{platform:process.platform,arch:process.arch,macOSVersion};
}

/** Explicit application resources only. No CWD/PATH/cache/environment scanning and no user Python execution. */
export async function discoverMediaCodecRuntime(roots:readonly string[],target?:MediaCodecRuntimeTarget):Promise<MediaCodecRuntime|undefined>{
    const native=target??await nativeTarget(),hostVersion=native.macOSVersion??(native.macOSMajor?`${native.macOSMajor}.0`:undefined);
    if(native.platform!=='darwin'||native.arch!=='arm64'||!version(hostVersion))return;
    for(const candidate of roots){try{
        if(!path.isAbsolute(candidate)||(await fs.lstat(candidate)).isSymbolicLink())continue;const root=await fs.realpath(candidate),manifestPath=path.join(root,'media-codec-manifest.json');
        const stat=await fs.lstat(manifestPath);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)continue;
        const bytes=await fs.readFile(manifestPath),m:unknown=JSON.parse(bytes.toString('utf8'));
        if(!record(m)||m.format!=='nova-media-codec-runtime'||m.version!==1||m.platform!=='darwin'||m.arch!=='arm64'||m.executable!=='python/bin/python3'||m.pythonSitePath!=='site'||!version(m.minimumMacOS)||!version(m.pythonVersion)||typeof m.pyavVersion!=='string'||!/^\d+\.\d+\.\d+$/.test(m.pyavVersion)||!Array.isArray(m.files)||m.files.length<1||m.files.length>5000)continue;
        if(versionNumber(hostVersion)<versionNumber(m.minimumMacOS)||!record(m.source)||typeof m.source.payloadManifestSha256!=='string'||!/^[a-f0-9]{64}$/.test(m.source.payloadManifestSha256))continue;
        const files=new Set<string>(),binaries=new Map<string,NonNullable<ReturnType<typeof inspectMediaCodecMachO>>>();let minimum=0,totalBytes=0;
        for(const entry of m.files){
            if(!record(entry)||!relative(entry.path)||forbidden(entry.path)||files.has(entry.path)||typeof entry.bytes!=='number'||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||entry.bytes>80*1024*1024||typeof entry.sha256!=='string'||!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error('MEDIA_CODEC_INVALID_MANIFEST');
            if(!/^(?:python\/bin\/python3|python\/lib\/python3\.11\/[^]+|site\/av\/[^]+|site\/av-[\d.]+\.dist-info\/[^]+|licenses\/[^]+|provenance\.json)$/.test(entry.path))throw Error('MEDIA_CODEC_UNEXPECTED_FILE');
            files.add(entry.path);totalBytes+=entry.bytes;if(totalBytes>150*1024*1024)throw Error('MEDIA_CODEC_TOO_LARGE');
        }
        const actual=(await inventory(root)).filter(p=>p!=='media-codec-manifest.json');if(actual.length!==files.size||actual.some(p=>!files.has(p)))throw Error('MEDIA_CODEC_INCOMPLETE_TREE');
        for(const entry of m.files as MediaCodecManifestFile[]){
            const full=path.join(root,entry.path),s=await fs.lstat(full);if(!s.isFile()||s.isSymbolicLink()||s.size!==entry.bytes)throw Error('MEDIA_CODEC_FILE_MISMATCH');
            const content=await fs.readFile(full);if(hash(content)!==entry.sha256)throw Error('MEDIA_CODEC_HASH_MISMATCH');const info=inspectMediaCodecMachO(content);
            if(info){binaries.set(entry.path,info);minimum=Math.max(minimum,versionNumber(info.minimumMacOS));}
            else if(/\.(?:so|dylib)$/.test(entry.path)||entry.path===m.executable)throw Error('MEDIA_CODEC_INVALID_BINARY');
        }
        if(minimum!==versionNumber(m.minimumMacOS)||!binaries.has(m.executable)||!binaries.has('site/av/_core.abi3.so')||!files.has('site/av/__init__.py')||!files.has('python/lib/python3.11/encodings/__init__.py')||![...files].some(p=>p.startsWith('licenses/python/'))||![...files].some(p=>p.startsWith('licenses/av/')))continue;
        const executable=path.join(root,m.executable);await fs.access(executable,fs.constants.X_OK);assertDependencies(root,executable,files,binaries);
        const runtime:MediaCodecRuntime={root,executable,pythonSitePath:path.join(root,m.pythonSitePath),minimumMacOS:m.minimumMacOS,identity:hash(bytes),manifest:m as unknown as MediaCodecManifest,validation:'integrity-only'};
        if(!target){if(!await nativeSelfTest(runtime,hostVersion))continue;runtime.validation='offline-codec-self-test';}
        return runtime;
    }catch{/* Corrupt, incomplete, foreign or locally unusable codecs are never advertised as ready. */}}
    return undefined;
}
