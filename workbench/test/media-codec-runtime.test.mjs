import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

// Missing implementation is asserted as the RED, rather than an import exception.
const api=await import('../src/main/media-codec-runtime.mts').catch(()=>({}));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const target={platform:'darwin',arch:'arm64',macOSVersion:'26.0'};
function macho({arch=0x0100000c,minimum=0x000e0000}={}){
    const bytes=Buffer.alloc(56);bytes.writeUInt32LE(0xfeedfacf);bytes.writeUInt32LE(arch,4);bytes.writeUInt32LE(2,12);bytes.writeUInt32LE(1,16);bytes.writeUInt32LE(24,20);bytes.writeUInt32LE(0x32,32);bytes.writeUInt32LE(24,36);bytes.writeUInt32LE(1,40);bytes.writeUInt32LE(minimum,44);return bytes;
}
async function fixture(t){
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'nova-codec-中文 空格-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const contents={'python/bin/python3':macho(),'site/av/__init__.py':Buffer.from('__version__="18.1.0"'),'site/av/_core.abi3.so':macho(),'licenses/python/LICENSE.txt':Buffer.from('license'),'licenses/av/LICENSE.txt':Buffer.from('license'),'python/lib/python3.11/encodings/__init__.py':Buffer.from('# stdlib')};
    const manifest={format:'nova-media-codec-runtime',version:1,platform:'darwin',arch:'arm64',minimumMacOS:'14.0.0',executable:'python/bin/python3',pythonSitePath:'site',pythonVersion:'3.11.16',pyavVersion:'18.1.0',source:{payloadManifestSha256:'a'.repeat(64)},verifiedOn:{macOSVersion:'26.0'},files:[]};
    for(const [file,bytes] of Object.entries(contents)){await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),bytes,{mode:file==='python/bin/python3'?0o755:0o644});manifest.files.push({path:file,bytes:bytes.length,sha256:digest(bytes)});}
    const save=()=>fs.writeFile(path.join(root,'media-codec-manifest.json'),JSON.stringify(manifest));await save();return{root,manifest,save};
}
test('discovers only complete model-free codec tree and preserves relocatable paths',async t=>{
    assert.equal(typeof api.discoverMediaCodecRuntime,'function');const {root}=await fixture(t);const found=await api.discoverMediaCodecRuntime(['/missing',root],target);
    const real=await fs.realpath(root);assert.equal(found.root,real);assert.equal(found.executable,path.join(real,'python/bin/python3'));assert.equal(found.pythonSitePath,path.join(real,'site'));assert.equal(found.minimumMacOS,'14.0.0');assert.match(found.identity,/^[a-f0-9]{64}$/);assert.equal(found.validation,'integrity-only');
});
test('actual Mach-O minimum rejects older and unknown systems, allows newer candidates regardless of source ASR gate',async t=>{
    assert.equal(typeof api.discoverMediaCodecRuntime,'function');const {root}=await fixture(t);
    for(const invalid of [{...target,platform:'win32'},{...target,arch:'x64'},{...target,macOSVersion:'13.7'},{platform:'darwin',arch:'arm64'}])assert.equal(await api.discoverMediaCodecRuntime([root],invalid),undefined);
    assert.ok(await api.discoverMediaCodecRuntime([root],{...target,macOSVersion:'14.0'}));
});
test('rejects same-size tampering and unmanifested extra files including weights',async t=>{
    assert.equal(typeof api.discoverMediaCodecRuntime,'function');const {root}=await fixture(t);const file=path.join(root,'site/av/__init__.py');const bytes=await fs.readFile(file);await fs.writeFile(file,Buffer.alloc(bytes.length,97));assert.equal(await api.discoverMediaCodecRuntime([root],target),undefined);await fs.writeFile(file,bytes);await fs.writeFile(path.join(root,'hidden.safetensors'),'weights');assert.equal(await api.discoverMediaCodecRuntime([root],target),undefined);
});
test('rejects missing files, symlinks, traversals and manifest duplicate entries',async t=>{
    assert.equal(typeof api.discoverMediaCodecRuntime,'function');const {root,manifest,save}=await fixture(t);const p=path.join(root,'site/av/__init__.py'),bytes=await fs.readFile(p);await fs.unlink(p);assert.equal(await api.discoverMediaCodecRuntime([root],target),undefined);await fs.symlink('/etc/hosts',p);assert.equal(await api.discoverMediaCodecRuntime([root],target),undefined);await fs.unlink(p);await fs.writeFile(p,bytes);manifest.files.push({...manifest.files[0]});await save();assert.equal(await api.discoverMediaCodecRuntime([root],target),undefined);manifest.files.pop();manifest.executable='../outside';await save();assert.equal(await api.discoverMediaCodecRuntime([root],target),undefined);
});
test('does not trust claimed native architecture or a minimum below actual load commands',async t=>{
    assert.equal(typeof api.discoverMediaCodecRuntime,'function');const {root,manifest,save}=await fixture(t);manifest.minimumMacOS='11.0.0';await save();assert.equal(await api.discoverMediaCodecRuntime([root],target),undefined);manifest.minimumMacOS='14.0.0';const bytes=macho({arch:0x01000007});await fs.writeFile(path.join(root,'site/av/_core.abi3.so'),bytes);Object.assign(manifest.files.find(f=>f.path==='site/av/_core.abi3.so'),{bytes:bytes.length,sha256:digest(bytes)});await save();assert.equal(await api.discoverMediaCodecRuntime([root],target),undefined);
});
test('relocated native codec produces a decodable MP4, PNG and mono 16k PCM without the source ASR tree', {skip:!process.env.NOVA_TEST_MEDIA_CODEC_ROOT},async t=>{
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'nova-codec-独立验收 '));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const root=path.join(directory,'codec'),output=path.join(directory,'outputs');await fs.cp(path.resolve(process.env.NOVA_TEST_MEDIA_CODEC_ROOT),root,{recursive:true});await fs.mkdir(output);
    const runtime=await api.discoverMediaCodecRuntime([root]);assert.equal(runtime?.validation,'offline-codec-self-test');assert.equal(runtime.minimumMacOS,'14.0.0');
    const {stdout,stderr}=await promisify(execFile)(runtime.executable,['-B','-I','-S','-c',api.MEDIA_CODEC_SELF_TEST_SCRIPT,runtime.pythonSitePath,output],{timeout:60000,killSignal:'SIGKILL',cwd:output,env:{HOME:output,TMPDIR:output,PATH:''}});assert.equal(stderr,'');const proof=JSON.parse(stdout);assert.equal(proof.ok,true);assert.equal(proof.pyavVersion,'18.1.0');assert.equal(proof.pcmSampleRate,16000);assert.ok(proof.pcmBytes>=30000);assert.ok(proof.pythonExecutable.startsWith(runtime.root+'/'));
    const png=await fs.readFile(path.join(output,'codec-self-test.png')),wave=await fs.readFile(path.join(output,'codec-self-test.wav')),mp4=await fs.readFile(path.join(output,'codec-self-test.mp4'));assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(png.readUInt32BE(16),64);assert.equal(png.readUInt32BE(20),48);assert.equal(wave.toString('ascii',0,4),'RIFF');assert.equal(wave.readUInt32LE(24),16000);assert.equal(wave.readUInt16LE(22),1);assert.equal(mp4.toString('ascii',4,8),'ftyp');
});
