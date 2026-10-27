import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {LOCAL_MEDIA_DECODE_SCRIPT,ServiceTools} from '../src/main/service-tools.mts';
import {discoverLocalAsrRuntime} from '../src/main/local-asr-runtime.mts';
const python=process.env.NOVA_ASR_MEDIA_TEST_PYTHON,site=process.env.NOVA_ASR_MEDIA_TEST_SITE,fixture=process.env.NOVA_ASR_MEDIA_TEST_FIXTURE,exec=promisify(execFile);
test('bundled PyAV decodes MP4 without system ffmpeg and preserves delayed audio timestamps', {skip:!python||!site||!fixture},async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nova-asr-media-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const output=path.join(root,'decoded.wav'),env={...process.env,PATH:'/usr/bin:/bin'};
 const decoded=JSON.parse((await exec(python,['-B','-I','-c',LOCAL_MEDIA_DECODE_SCRIPT,site,fixture,output],{env,timeout:120000})).stdout.trim());
 assert.equal(decoded.decoder,'bundled-pyav');assert.equal(decoded.sampleRate,16000);assert.equal(decoded.channels,1);assert.match(decoded.originalSha256,/^[a-f0-9]{64}$/);assert.ok(decoded.samples>16000);assert.equal(decoded.timeline,'container-relative-presentation-timestamps');
 const delay=path.join(root,'delayed.mp4');
 await exec(python,['-B','-I','-c','import sys;sys.path.insert(0,sys.argv[1]);import av\na=av.open(sys.argv[2]);b=av.open(sys.argv[3],"w");streams={s.index:b.add_stream_from_template(s) for s in a.streams}\nfor p in a.demux():\n if p.dts is not None:\n  if p.stream.type=="audio": p.pts+=int(1/p.time_base);p.dts+=int(1/p.time_base)\n  p.stream=streams[p.stream.index];b.mux(p)\nb.close();a.close()',site,fixture,delay],{env,timeout:120000});
 const delayed=JSON.parse((await exec(python,['-B','-I','-c',LOCAL_MEDIA_DECODE_SCRIPT,site,delay,path.join(root,'delayed.wav')],{env,timeout:120000})).stdout.trim());
 // The video starts at zero while its audio starts one second later. Preserve the actual offset as silence.
 assert.equal(delayed.containerOriginMs,0);assert.ok(delayed.insertedSilenceSamples>=14000);assert.ok(Math.abs(delayed.samples-decoded.samples-16000)<2000);
 t.diagnostic(JSON.stringify({original:decoded,videoZeroAudioDelayedOneSecond:delayed}));
 const invalid=path.join(root,'invalid.mp4');await fs.writeFile(invalid,'not media');await assert.rejects(exec(python,['-B','-I','-c',LOCAL_MEDIA_DECODE_SCRIPT,site,invalid,path.join(root,'invalid.wav')],{env,timeout:120000}));
});
test('temporary PCM is removed after both successful transcription and downstream failure', {skip:!python||!site||!fixture},async t=>{
 const runtime=await discoverLocalAsrRuntime([path.resolve(site,'..')]);assert.ok(runtime?.timing);
 const tools=new ServiceTools({settings:{},localRuntimeRoots:[runtime.root]}),config={localExecutable:runtime.executable,localModelPath:runtime.modelPath};let decodedDirectory;
 tools.localTranscribeDecoded=async audio=>{decodedDirectory=path.dirname(audio);assert.equal(path.extname(audio),'.wav');assert.ok((await fs.stat(audio)).size>32000);return{text:'decoder-contract',segments:[]};};
 const result=await tools.localTranscribe(fixture,'mlx_audio',config);assert.equal(result.mediaDecode.decoder,'bundled-pyav');assert.equal(await fs.stat(decodedDirectory).then(()=>true,()=>false),false);
 tools.localTranscribeDecoded=async audio=>{decodedDirectory=path.dirname(audio);throw Error('DOWNSTREAM_FAILURE');};
 await assert.rejects(tools.localTranscribe(fixture,'mlx_audio',config),/DOWNSTREAM_FAILURE/);assert.equal(await fs.stat(decodedDirectory).then(()=>true,()=>false),false);
});
