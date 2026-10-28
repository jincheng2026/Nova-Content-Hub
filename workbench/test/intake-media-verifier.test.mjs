import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {verifyIntakeMedia} from '../src/main/intake-media-verifier.mts';
import {discoverLocalAsrRuntime} from '../src/main/local-asr-runtime.mts';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const mp4=Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex');
const native=process.platform==='darwin'&&process.arch==='arm64';
const exec=promisify(execFile);
async function fakeRuntime(t,behavior){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nova-intake-runtime-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'python/bin'),{recursive:true});await fs.mkdir(path.join(root,'models/qwen'),{recursive:true});await fs.mkdir(path.join(root,'timing-site'));await fs.mkdir(path.join(root,'models/whisper'));
 await fs.writeFile(path.join(root,'python/bin/python3'),`#!${process.execPath}\n${behavior}`);await fs.chmod(path.join(root,'python/bin/python3'),0o700);
 await fs.writeFile(path.join(root,'models/qwen/config.json'),'{"model_type":"qwen3_asr"}');await fs.writeFile(path.join(root,'models/qwen/model.safetensors'),'weights');await fs.writeFile(path.join(root,'models/whisper/model.bin'),'timing');
 const macOSMajor=Number((await exec('/usr/bin/sw_vers',['-productVersion'])).stdout.trim().split('.')[0]);
 await fs.writeFile(path.join(root,'runtime.json'),JSON.stringify({version:1,platform:'darwin',arch:'arm64',macOSMajor,engine:'qwen3-asr',module:'mlx_audio',executable:'python/bin/python3',modelPath:'models/qwen',model:{repoId:'test',revision:'a'.repeat(40),license:'mit',files:[{path:'config.json',bytes:26},{path:'model.safetensors',bytes:7}]},timing:{engine:'faster-whisper',module:'faster_whisper',pythonSitePath:'timing-site',modelPath:'models/whisper',model:{repoId:'test',revision:'b'.repeat(40),files:[{path:'model.bin',bytes:6,sha256:'c'.repeat(64)}]}}}));
 const runtime=await discoverLocalAsrRuntime([root]);assert.ok(runtime?.timing);return runtime;
}
const invoke=(bytes=mp4,extra={})=>verifyIntakeMedia({bytes,extension:'.mp4',expectedSha256:sha(bytes),...extra});
test('rejects oversized media, forged extensions and changed source bytes before decoder execution',async()=>{
 for(const [bytes,extra,code] of [[new Uint8Array(64*1024*1024+1),{},'INTAKE_MEDIA_TOO_LARGE'],[mp4,{extension:'../clip.mp4'},'INTAKE_MEDIA_UNSUPPORTED_TYPE'],[Buffer.from('not an MP4'),{},'INTAKE_MEDIA_HEADER_MISMATCH'],[mp4,{extension:'.webm'},'INTAKE_MEDIA_HEADER_MISMATCH'],[mp4,{expectedSha256:'0'.repeat(64)},'INTAKE_MEDIA_HASH_MISMATCH']])await assert.rejects(invoke(bytes,extra),{code});
});
test('missing and forged runtime cannot fall back to system decoders',async()=>{
 await assert.rejects(invoke(),{code:'INTAKE_MEDIA_RUNTIME_UNAVAILABLE'});
 await assert.rejects(invoke(mp4,{runtime:{root:'/tmp',executable:'/usr/bin/python3'}}),{code:'INTAKE_MEDIA_RUNTIME_UNAVAILABLE'});
});
test('rejects a decoder claimed success without actual video evidence and cleans owned files',{skip:!native},async t=>{
 const marker=path.join(os.tmpdir(),`nova-intake-marker-${process.pid}-${Date.now()}`);t.after(()=>fs.rm(marker,{force:true}));
 const runtime=await fakeRuntime(t,`const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(marker)},process.argv.at(-2));console.log(JSON.stringify({ok:true}));`);
 await assert.rejects(invoke(mp4,{runtime}),{code:'INTAKE_MEDIA_INVALID_PROOF'});
 const source=await fs.readFile(marker,'utf8');assert.equal(await fs.stat(path.dirname(source)).then(()=>true,()=>false),false);
 await assert.rejects(invoke(mp4,{runtime:{...runtime,executable:process.execPath}}),{code:'INTAKE_MEDIA_RUNTIME_UNAVAILABLE'});
});
test('bounds stdout and sanitizes stderr while cleaning failed decoder files',{skip:!native},async t=>{
 const runtime=await fakeRuntime(t,"console.error('SENSITIVE_TEST_SECRET');console.log('x'.repeat(262145));");
 await assert.rejects(invoke(mp4,{runtime}),error=>error.code==='INTAKE_MEDIA_OUTPUT_TOO_LARGE'&&!error.message.includes('SENSITIVE_TEST_SECRET'));
});
test('terminates a stalled decoder before returning and removes its owned directory',{skip:!native},async t=>{
 const marker=path.join(os.tmpdir(),`nova-intake-timeout-${process.pid}-${Date.now()}`);t.after(()=>fs.rm(marker,{force:true}));
 const runtime=await fakeRuntime(t,`const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(marker)},process.argv.at(-2));setInterval(()=>{},1000);`);
 await assert.rejects(invoke(mp4,{runtime,timeoutMs:2000}),{code:'INTAKE_MEDIA_TIMEOUT'});
 const source=await fs.readFile(marker,'utf8');assert.equal(await fs.stat(path.dirname(source)).then(()=>true,()=>false),false);
});
const runtimeRoot=process.env.NOVA_INTAKE_MEDIA_TEST_RUNTIME;
test('sealed native PyAV proves real video/audio, rejects audio-only and corruption, and captures a PNG',{skip:!runtimeRoot},async t=>{
 const runtime=await discoverLocalAsrRuntime([runtimeRoot]);assert.ok(runtime?.timing,'explicit runtime must be complete for this native host');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nova-intake-real-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 // Generate a small synthetic clip with the sealed codec runtime, never read the real library.
 const generator=`import sys\nsys.path.insert(0,sys.argv[1])\nimport av\nfrom fractions import Fraction\nfor mode in ['video','audio']:\n output=av.open(sys.argv[2]+'/'+mode+'.mp4','w')\n if mode=='video':\n  video=output.add_stream('mpeg4',rate=25);video.width=64;video.height=48;video.pix_fmt='yuv420p'\n audio=output.add_stream('aac',rate=16000);audio.layout='mono'\n for i in range(25):\n  if mode=='video':\n   frame=av.VideoFrame(64,48,'yuv420p')\n   for plane in frame.planes: plane.update(bytes([64+i*2])*plane.buffer_size)\n   frame.pts=i\n   for packet in video.encode(frame): output.mux(packet)\n  frame=av.AudioFrame('s16','mono',samples=640);frame.sample_rate=16000;frame.time_base=Fraction(1,16000);frame.pts=i*640\n  for plane in frame.planes: plane.update(bytes(plane.buffer_size))\n  for packet in audio.encode(frame): output.mux(packet)\n if mode=='video':\n  for packet in video.encode(): output.mux(packet)\n for packet in audio.encode(): output.mux(packet)\n output.close()`;
 await exec(runtime.executable,['-B','-I','-c',generator,runtime.timing.pythonSitePath,root],{timeout:30000});
 const bytes=await fs.readFile(path.join(root,'video.mp4')),result=await invoke(bytes,{runtime});
 assert.equal(result.proof.engine,'pyav');assert.equal(result.proof.originalSha256,sha(bytes));assert.equal(result.proof.video.width,64);assert.equal(result.proof.video.height,48);assert.equal(result.proof.video.decodedFrames,1);assert.ok(result.proof.audio.decodedSamples>0);assert.ok(result.proof.container.durationSeconds>0.9);assert.equal(result.proof.cover.sha256,sha(result.coverBytes));assert.equal(Buffer.from(result.coverBytes).subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(result.proof.toolAdaptation.ffprobe,'pyav-container-and-stream-probe');
 await assert.rejects(invoke(await fs.readFile(path.join(root,'audio.mp4')),{runtime}),{code:'INTAKE_MEDIA_NO_VIDEO_STREAM'});
 await assert.rejects(invoke(bytes.subarray(0,64),{runtime}),{code:'INTAKE_MEDIA_DECODE_FAILED'});
 t.diagnostic(JSON.stringify(result.proof));
});
