import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {discoverLocalAsrRuntime} from './local-asr-runtime.mts';
import type {LocalAsrRuntime} from './local-asr-runtime.mts';
import {discoverMediaCodecRuntime} from './media-codec-runtime.mts';
import type {MediaCodecRuntime} from './media-codec-runtime.mts';

const MEDIA_LIMIT=64*1024*1024,OUTPUT_LIMIT=256*1024,COVER_LIMIT=2*1024*1024;
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const positive=(v:unknown,max:number):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=max;
const index=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<256;
const codec=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_.-]{1,64}$/.test(v);
export class IntakeMediaVerificationError extends Error {
    code:string;
    constructor(code:string){super(code);this.name='IntakeMediaVerificationError';this.code=code;}
}
const fail=(code:string):never=>{throw new IntakeMediaVerificationError(code);};
export interface IntakeMediaProof {
    version:1;engine:'pyav';decoder:'bundled-pyav';pyavVersion:string;originalSha256:string;bytes:number;extension:'.mp4'|'.webm';
    container:{format:string;durationSeconds:number};
    video:{streamIndex:number;codec:string;width:number;height:number;decodedFrames:1};
    audio:{streamIndex:number;codec:string;sampleRate:number;channels:number;decodedSamples:number};
    cover:{sha256:string;mediaType:'image/png';width:number;height:number;bytes:number;captureTimestampSeconds:number};
    checks:{header:'passed';sha256:'passed';containerProbe:'passed';videoDecode:'passed';audioDecode:'passed';coverScreenshot:'passed'};
    toolAdaptation:{file:'native-header-and-sha256';ffprobe:'pyav-container-and-stream-probe';ffmpegDecode:'pyav-short-video-and-audio-decode';screenshot:'pyav-decoded-frame-to-png'};
}
export interface VerifyIntakeMediaInput {
    bytes:Uint8Array;extension:string;expectedSha256:string;
    /** Main-process only: an explicit application resource discovered by discoverLocalAsrRuntime. */
    runtime?:LocalAsrRuntime;
    codecRuntime?:MediaCodecRuntime;
    /** A smaller deadline may be chosen by a native caller, never above 30 seconds. */
    timeoutMs?:number;
}

// This is the complete script we execute. Never execute scripts shipped in, or named by, media input.
// It imports only the sealed codec site; no ASR engine, model loading or system ffmpeg is involved.
const PROBE_SCRIPT=String.raw`import sys,json,os,hashlib,zlib,struct
sys.path.insert(0,sys.argv[1])
source,destination=sys.argv[2:4]
def stop(code):
 print(json.dumps({'error':code}));sys.exit(2)
try:
 import av
except Exception:
 stop('INTAKE_MEDIA_RUNTIME_UNAVAILABLE')
def chunk(kind,data):
 return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
def opened():
 return av.open(source,format='mov' if source.endswith('.mp4') else 'matroska',options={'protocol_whitelist':'file','enable_drefs':'0','use_absolute_path':'0'})
try:
 with opened() as container:
  if len(container.streams)>32: stop('INTAKE_MEDIA_LIMIT_EXCEEDED')
  if not container.streams.video: stop('INTAKE_MEDIA_NO_VIDEO_STREAM')
  if not container.streams.audio: stop('INTAKE_MEDIA_NO_AUDIO_STREAM')
  duration=container.duration/1000000 if container.duration else 0
  if not 0<duration<=7200: stop('INTAKE_MEDIA_LIMIT_EXCEEDED')
  video=container.streams.video[0]
  width,height=video.codec_context.width,video.codec_context.height
  if not (0<width<=8192 and 0<height<=8192 and width*height<=33554432): stop('INTAKE_MEDIA_LIMIT_EXCEEDED')
  probe={'engine':'pyav','decoder':'bundled-pyav','pyavVersion':av.__version__,'container':{'format':container.format.name,'durationSeconds':duration},'video':{'streamIndex':video.index,'codec':video.codec_context.name,'width':width,'height':height,'decodedFrames':0}}
  decoded=None
  for count,packet in enumerate(container.demux(video)):
   if count>=100000: stop('INTAKE_MEDIA_LIMIT_EXCEEDED')
   for frame in packet.decode():
    decoded=frame;break
   if decoded is not None: break
  if decoded is None: stop('INTAKE_MEDIA_DECODE_FAILED')
  probe['video']['decodedFrames']=1
  cover_width=min(640,width)
  cover_height=max(1,round(height*cover_width/width))
  if cover_height>640:
   cover_height=640;cover_width=max(1,round(width*cover_height/height))
  rgb=decoded.reformat(width=cover_width,height=cover_height,format='rgb24')
  plane=rgb.planes[0];pixels=bytes(plane)
  rows=b''.join(b'\x00'+pixels[y*plane.line_size:y*plane.line_size+cover_width*3] for y in range(cover_height))
  png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',cover_width,cover_height,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(rows))+chunk(b'IEND',b'')
  if len(png)>2097152: stop('INTAKE_MEDIA_LIMIT_EXCEEDED')
  with open(destination,'xb') as output:
   os.chmod(destination,0o600);output.write(png)
  timestamp=float(decoded.pts*decoded.time_base) if decoded.pts is not None and decoded.time_base is not None else 0
  probe['cover']={'sha256':hashlib.sha256(png).hexdigest(),'mediaType':'image/png','width':cover_width,'height':cover_height,'bytes':len(png),'captureTimestampSeconds':timestamp}
 # Reopen to independently decode audio from its beginning, regardless of packet interleaving.
 with opened() as container:
  audio=container.streams.audio[0]
  probe['audio']={'streamIndex':audio.index,'codec':audio.codec_context.name,'sampleRate':audio.codec_context.sample_rate,'channels':audio.codec_context.channels,'decodedSamples':0}
  for count,packet in enumerate(container.demux(audio)):
   if count>=100000: stop('INTAKE_MEDIA_LIMIT_EXCEEDED')
   for frame in packet.decode():
    if frame.samples>0:
     # Access the decoded sample buffer; metadata alone never counts as a decode.
     if not frame.planes or not bytes(frame.planes[0]): stop('INTAKE_MEDIA_DECODE_FAILED')
     probe['audio']['decodedSamples']=frame.samples;break
   if probe['audio']['decodedSamples']>0: break
  if not probe['audio']['decodedSamples']: stop('INTAKE_MEDIA_DECODE_FAILED')
 with open(source,'rb') as original: probe['originalSha256']=hashlib.file_digest(original,'sha256').hexdigest()
 print(json.dumps(probe,allow_nan=False))
except Exception:
 stop('INTAKE_MEDIA_DECODE_FAILED')`;

interface VerifiedCodec {executable:string;pythonSitePath:string}
async function trustedRuntime(runtime:LocalAsrRuntime|undefined,codecRuntime?:MediaCodecRuntime):Promise<VerifiedCodec>{
    if(codecRuntime){const found=await discoverMediaCodecRuntime([codecRuntime.root]);if(!found||found.validation!=='offline-codec-self-test'||found.identity!==codecRuntime.identity||found.executable!==codecRuntime.executable||found.pythonSitePath!==codecRuntime.pythonSitePath)return fail('INTAKE_MEDIA_RUNTIME_UNAVAILABLE');return found;}
    if(!runtime||typeof runtime.root!=='string'||!path.isAbsolute(runtime.root))return fail('INTAKE_MEDIA_RUNTIME_UNAVAILABLE');
    const found=await discoverLocalAsrRuntime([runtime.root]);
    if(!found?.timing||found.root!==runtime.root||found.executable!==runtime.executable||found.modelPath!==runtime.modelPath||found.timing.pythonSitePath!==runtime.timing?.pythonSitePath)return fail('INTAKE_MEDIA_RUNTIME_UNAVAILABLE');
    return{executable:found.executable,pythonSitePath:found.timing.pythonSitePath};
}
async function runProbe(runtime:VerifiedCodec,source:string,cover:string,directory:string,timeoutMs:number):Promise<unknown>{
    return new Promise((resolve,reject)=>{
        // Deliberately do not inherit credentials, PYTHONPATH, proxy settings or preload variables.
        const env:NodeJS.ProcessEnv={HOME:directory,TMPDIR:directory,TEMP:directory,TMP:directory,PATH:'',LANG:'C.UTF-8',PYTHONIOENCODING:'utf-8',HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',HF_DATASETS_OFFLINE:'1',HF_HUB_DISABLE_TELEMETRY:'1',DO_NOT_TRACK:'1'};
        if(process.platform==='win32'&&process.env.SystemRoot)env.SystemRoot=process.env.SystemRoot;
        const child=spawn(runtime.executable,['-B','-I','-c',PROBE_SCRIPT,runtime.pythonSitePath,source,cover],{shell:false,windowsHide:true,cwd:directory,env,stdio:['ignore','pipe','pipe']});
        const buffers:Buffer[]=[];let size=0,errorCode:string|undefined;
        const stop=(code:string)=>{if(!errorCode){errorCode=code;child.kill('SIGKILL');}};
        const timer=setTimeout(()=>stop('INTAKE_MEDIA_TIMEOUT'),timeoutMs);
        child.stdout.on('data',(buffer:Buffer)=>{size+=buffer.length;if(size>OUTPUT_LIMIT)stop('INTAKE_MEDIA_OUTPUT_TOO_LARGE');else buffers.push(buffer);});
        child.stderr.on('data',()=>{}); // Decoder errors may contain paths; none are returned or logged.
        child.once('error',()=>{errorCode??='INTAKE_MEDIA_RUNTIME_UNAVAILABLE';});
        child.once('close',exitCode=>{
            clearTimeout(timer);
            if(errorCode){reject(new IntakeMediaVerificationError(errorCode));return;}
            let value:unknown;try{value=JSON.parse(Buffer.concat(buffers).toString('utf8'));}catch{reject(new IntakeMediaVerificationError(exitCode===0?'INTAKE_MEDIA_INVALID_PROOF':'INTAKE_MEDIA_DECODE_FAILED'));return;}
            const errors=['INTAKE_MEDIA_RUNTIME_UNAVAILABLE','INTAKE_MEDIA_NO_VIDEO_STREAM','INTAKE_MEDIA_NO_AUDIO_STREAM','INTAKE_MEDIA_LIMIT_EXCEEDED','INTAKE_MEDIA_DECODE_FAILED'];
            if(exitCode!==0){reject(new IntakeMediaVerificationError(record(value)&&typeof value.error==='string'&&errors.includes(value.error)?value.error:'INTAKE_MEDIA_DECODE_FAILED'));return;}
            resolve(value);
        });
    });
}
function validateProbe(value:unknown,sourceHash:string,extension:string):asserts value is Pick<IntakeMediaProof,'engine'|'decoder'|'pyavVersion'|'originalSha256'|'container'|'video'|'audio'|'cover'>{
    if(!record(value)||value.engine!=='pyav'||value.decoder!=='bundled-pyav'||typeof value.pyavVersion!=='string'||!/^\d[\w.+-]{0,63}$/.test(value.pyavVersion)||value.originalSha256!==sourceHash)return fail('INTAKE_MEDIA_INVALID_PROOF');
    const {container,video,audio,cover}=value;
    if(!record(container)||typeof container.format!=='string'||container.format.length>128||!container.format.split(',').includes(extension==='.mp4'?'mov':'matroska')||!positive(container.durationSeconds,7200))return fail('INTAKE_MEDIA_INVALID_PROOF');
    if(!record(video)||!index(video.streamIndex)||!codec(video.codec)||!positive(video.width,8192)||!Number.isInteger(video.width)||!positive(video.height,8192)||!Number.isInteger(video.height)||video.width*video.height>33554432||video.decodedFrames!==1)return fail('INTAKE_MEDIA_INVALID_PROOF');
    if(!record(audio)||!index(audio.streamIndex)||audio.streamIndex===video.streamIndex||!codec(audio.codec)||!positive(audio.sampleRate,384000)||!positive(audio.channels,32)||!positive(audio.decodedSamples,10000000)||!Number.isInteger(audio.decodedSamples))return fail('INTAKE_MEDIA_INVALID_PROOF');
    if(!record(cover)||cover.mediaType!=='image/png'||typeof cover.sha256!=='string'||!/^[a-f0-9]{64}$/.test(cover.sha256)||!positive(cover.width,640)||!Number.isInteger(cover.width)||!positive(cover.height,640)||!Number.isInteger(cover.height)||!positive(cover.bytes,COVER_LIMIT)||typeof cover.captureTimestampSeconds!=='number'||!Number.isFinite(cover.captureTimestampSeconds)||Math.abs(cover.captureTimestampSeconds)>7200)return fail('INTAKE_MEDIA_INVALID_PROOF');
}
/** Native seam: callers supply bytes from a library-registered media grant, never renderer paths. */
export async function verifyIntakeMedia(input:VerifyIntakeMediaInput):Promise<{proof:IntakeMediaProof;coverBytes:Uint8Array}>{
    if(!(input.bytes instanceof Uint8Array)||!input.bytes.byteLength)return fail('INTAKE_MEDIA_HEADER_MISMATCH');
    if(input.bytes.byteLength>MEDIA_LIMIT)return fail('INTAKE_MEDIA_TOO_LARGE');
    if(input.extension!=='.mp4'&&input.extension!=='.webm')return fail('INTAKE_MEDIA_UNSUPPORTED_TYPE');
    // Own an immutable copy before any asynchronous boundary; a caller cannot mutate validated bytes.
    const bytes=Buffer.from(input.bytes),extension=input.extension;
    const headerMatches=extension==='.mp4'?bytes.length>=16&&bytes.toString('ascii',4,8)==='ftyp':bytes.length>=4&&bytes.subarray(0,4).toString('hex')==='1a45dfa3';
    if(!headerMatches)return fail('INTAKE_MEDIA_HEADER_MISMATCH');
    const originalSha256=hash(bytes);
    if(typeof input.expectedSha256!=='string'||!/^[a-f0-9]{64}$/.test(input.expectedSha256)||input.expectedSha256!==originalSha256)return fail('INTAKE_MEDIA_HASH_MISMATCH');
    const runtime=await trustedRuntime(input.runtime,input.codecRuntime);
    const timeoutMs=typeof input.timeoutMs==='number'&&Number.isFinite(input.timeoutMs)?Math.min(30000,Math.max(1,input.timeoutMs)):30000;
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'nova-intake-verify-'));
    try{
        await fs.chmod(directory,0o700);
        const source=path.join(directory,`source${extension}`),destination=path.join(directory,'cover.png');
        await fs.writeFile(source,bytes,{mode:0o600,flag:'wx'});
        const raw=await runProbe(runtime,source,destination,directory,timeoutMs);
        validateProbe(raw,originalSha256,extension);
        let coverBytes:Buffer;
        try{
            const stat=await fs.lstat(destination);
            if(!stat.isFile()||stat.isSymbolicLink()||stat.size>COVER_LIMIT||stat.size!==raw.cover.bytes)return fail('INTAKE_MEDIA_INVALID_PROOF');
            coverBytes=await fs.readFile(destination);
        }catch(error){if(error instanceof IntakeMediaVerificationError)throw error;return fail('INTAKE_MEDIA_INVALID_PROOF');}
        if(coverBytes.length<33||coverBytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||coverBytes.toString('ascii',12,16)!=='IHDR'||coverBytes.readUInt32BE(16)!==raw.cover.width||coverBytes.readUInt32BE(20)!==raw.cover.height||hash(coverBytes)!==raw.cover.sha256)return fail('INTAKE_MEDIA_INVALID_PROOF');
        // Reconstruct a bounded proof. Do not persist arbitrary decoder-supplied keys.
        const proof:IntakeMediaProof={version:1,engine:'pyav',decoder:'bundled-pyav',pyavVersion:raw.pyavVersion,originalSha256,bytes:bytes.length,extension,container:{format:raw.container.format,durationSeconds:raw.container.durationSeconds},video:{streamIndex:raw.video.streamIndex,codec:raw.video.codec,width:raw.video.width,height:raw.video.height,decodedFrames:1},audio:{streamIndex:raw.audio.streamIndex,codec:raw.audio.codec,sampleRate:raw.audio.sampleRate,channels:raw.audio.channels,decodedSamples:raw.audio.decodedSamples},cover:{sha256:raw.cover.sha256,mediaType:'image/png',width:raw.cover.width,height:raw.cover.height,bytes:raw.cover.bytes,captureTimestampSeconds:raw.cover.captureTimestampSeconds},checks:{header:'passed',sha256:'passed',containerProbe:'passed',videoDecode:'passed',audioDecode:'passed',coverScreenshot:'passed'},toolAdaptation:{file:'native-header-and-sha256',ffprobe:'pyav-container-and-stream-probe',ffmpegDecode:'pyav-short-video-and-audio-decode',screenshot:'pyav-decoded-frame-to-png'}};
        return{proof,coverBytes};
    }finally{await fs.rm(directory,{recursive:true,force:true});}
}
