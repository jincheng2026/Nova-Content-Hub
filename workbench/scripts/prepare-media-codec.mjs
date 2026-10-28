import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {discoverMediaCodecRuntime,inspectMediaCodecMachO,MEDIA_CODEC_SELF_TEST_SCRIPT} from '../src/main/media-codec-runtime.mts';

// Previously verified immutable source payload. Neither models nor its ASR/macOS26 compatibility contract are reused.
export const TRUSTED_SOURCE_MANIFEST_SHA256='2783e2cc5284cada58a0006180781efb6f0b4f86b790664943f1deeababdd234';
const repository=fileURLToPath(new URL('../../',import.meta.url));
const sourceDefault=path.join(repository,'.local-probes/local-asr-release-v2/darwin-arm64');
export const mediaCodecOutputRoot=path.join(repository,'.local-probes/media-codec-release-v1/darwin-arm64');
const supplementalLicenses=fileURLToPath(new URL('./media-codec-licenses/',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const relative=p=>typeof p==='string'&&!path.isAbsolute(p)&&!p.includes('\\')&&p.split('/').every(part=>part&&part!=='.'&&part!=='..');
const inside=(root,p)=>p.startsWith(root+path.sep);
const omittedStdlib=new Set(['site-packages','lib-dynload','config-3.11-darwin','ensurepip','idlelib','tkinter','turtledemo','test','tests','lib2to3','distutils','curses','dbm','venv']);

export async function readMediaCodecLicenseFiles(directory=supplementalLicenses){
    const sourceBytes=await fs.readFile(path.join(directory,'sources.json')),sources=JSON.parse(sourceBytes);if(!Array.isArray(sources)||sources.length>100)throw Error('MEDIA_CODEC_LICENSE_SOURCE_HASH');const result=[];
    for(const source of sources){
        if(!relative(source.path)||!/^https:\/\//.test(source.url)||!Number.isSafeInteger(source.bytes)||!/^[a-f0-9]{64}$/.test(source.sha256))throw Error('MEDIA_CODEC_LICENSE_SOURCE_HASH');
        const file=path.join(directory,source.path),stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('MEDIA_CODEC_LICENSE_SOURCE_HASH');const bytes=await fs.readFile(file);if(bytes.length!==source.bytes||hash(bytes)!==source.sha256)throw Error('MEDIA_CODEC_LICENSE_SOURCE_HASH');result.push({path:source.path,bytes});
    }
    result.push({path:'sources.json',bytes:sourceBytes});
    const notes=await fs.readFile(path.join(directory,'NOTICE.md'));result.push({path:'NOTICE.md',bytes:notes});
    return result;
}

/** A closed source allowlist: one static Python executable, pure codec stdlib, PyAV and its linked FFmpeg libraries. */
export function selectMediaCodecSourceFiles(paths){
    const selected=[];
    for(const source of paths){
        if(!relative(source))throw Error('MEDIA_CODEC_INVALID_SOURCE_PATH');let destination;
        if(source==='python/bin/python3')destination=source;
        else if(source==='python/lib/python3.11/lib-dynload/.empty')destination=source;
        else if(source.startsWith('python/lib/python3.11/')){
            const rest=source.slice('python/lib/python3.11/'.length),parts=rest.split('/');
            if(!parts.some(p=>omittedStdlib.has(p)||p==='__pycache__')&&(source.endsWith('.py')||source.endsWith('/LICENSE.txt')))destination=source;
        }else if(source.startsWith('timing-site/av/')&&!source.includes('/__pycache__/')&&!/\.(?:pyc|pxd|pyi)$/.test(source))destination='site/'+source.slice('timing-site/'.length);
        else if(source.startsWith('timing-site/av-18.1.0.dist-info/'))destination='site/'+source.slice('timing-site/'.length);
        else if(source.startsWith('licenses/python-standalone/'))destination='licenses/python/'+source.slice('licenses/python-standalone/'.length);
        else if(source.startsWith('licenses/timing/av-18.1.0-'))destination='licenses/av/'+source.slice('licenses/timing/'.length);
        else if(source==='python-source.json')destination='licenses/python/python-source.json';
        if(destination)selected.push({source,destination});
        if(source.startsWith('timing-site/av-18.1.0.dist-info/licenses/'))selected.push({source,destination:'licenses/av/'+source.slice('timing-site/av-18.1.0.dist-info/licenses/'.length)});
    }
    return selected.sort((a,b)=>a.source.localeCompare(b.source,'en')||a.destination.localeCompare(b.destination,'en'));
}
async function verifiedSourceFile(root,entry){
    if(!entry||!relative(entry.path)||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error('MEDIA_CODEC_INVALID_SOURCE_ENTRY');
    let current=root;for(const part of entry.path.split('/')){current=path.join(current,part);if((await fs.lstat(current)).isSymbolicLink())throw Error('MEDIA_CODEC_SOURCE_SYMLINK');}
    const real=await fs.realpath(current);if(!inside(root,real))throw Error('MEDIA_CODEC_SOURCE_ESCAPE');const stat=await fs.stat(real);if(!stat.isFile()||stat.size!==entry.bytes)throw Error('MEDIA_CODEC_SOURCE_FILE_HASH');
    const bytes=await fs.readFile(real);if(hash(bytes)!==entry.sha256)throw Error('MEDIA_CODEC_SOURCE_FILE_HASH');return{bytes,mode:stat.mode&0o777};
}

/** No download/install and no mutation of source. A preexisting output is never overwritten. */
export async function prepareMediaCodecRuntime({sourceRoot=sourceDefault,outputRoot=mediaCodecOutputRoot,sourceManifestSha256=TRUSTED_SOURCE_MANIFEST_SHA256}={}){
    if(!path.isAbsolute(sourceRoot)||!path.isAbsolute(outputRoot)||(await fs.lstat(sourceRoot)).isSymbolicLink())throw Error('MEDIA_CODEC_ABSOLUTE_SEPARATE_PATHS_REQUIRED');
    const source=await fs.realpath(sourceRoot),output=path.resolve(outputRoot);
    if(output===source||inside(source,output)||inside(output,source))throw Error('MEDIA_CODEC_ABSOLUTE_SEPARATE_PATHS_REQUIRED');
    const manifestBytes=await fs.readFile(path.join(source,'payload-manifest.json'));
    if(hash(manifestBytes)!==sourceManifestSha256)throw Error('MEDIA_CODEC_SOURCE_MANIFEST_HASH');
    const sourceManifest=JSON.parse(manifestBytes);if(sourceManifest.version!==1||!Array.isArray(sourceManifest.files))throw Error('MEDIA_CODEC_INVALID_SOURCE_MANIFEST');
    const entries=new Map();for(const entry of sourceManifest.files){if(entries.has(entry.path))throw Error('MEDIA_CODEC_DUPLICATE_SOURCE_ENTRY');entries.set(entry.path,entry);}
    const selected=selectMediaCodecSourceFiles([...entries.keys()]);
    for(const file of selected)await verifiedSourceFile(source,entries.get(file.source));
    if(process.platform!=='darwin'||process.arch!=='arm64')throw Error('MEDIA_CODEC_NATIVE_DARWIN_ARM64_RUNNER_REQUIRED');
    if(!selected.some(f=>f.destination==='python/bin/python3')||!selected.some(f=>f.destination==='site/av/_core.abi3.so')||!selected.some(f=>f.destination==='python/lib/python3.11/encodings/__init__.py'))throw Error('MEDIA_CODEC_INCOMPLETE_SOURCE');
    const macOSVersion=(await promisify(execFile)('/usr/bin/sw_vers',['-productVersion'],{timeout:3000})).stdout.trim();
    const parent=await fs.realpath(path.dirname(output)).catch(()=>undefined);
    // The public CLI uses its dedicated new cache. Tests may use disposable output directories.
    if(parent&&path.join(parent,path.basename(output))!==output)throw Error('MEDIA_CODEC_OUTPUT_SYMLINK');
    await fs.mkdir(path.dirname(output),{recursive:true});await fs.mkdir(output);
    try{
        const files=[],nativeFiles=[];let minimum=0,ffmpegEvidence;
        for(const file of selected){
            const {bytes,mode}=await verifiedSourceFile(source,entries.get(file.source)),destination=path.join(output,file.destination);
            await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,bytes,{flag:'wx',mode});
            files.push({path:file.destination,bytes:bytes.length,sha256:hash(bytes)});
            const binary=inspectMediaCodecMachO(bytes);if(binary){const min=binary.minimumMacOS.split('.').reduce((sum,p,i)=>sum+Number(p)*[65536,256,1][i],0);minimum=Math.max(minimum,min);nativeFiles.push({path:file.destination,...binary});}
            if(file.destination.endsWith('/libavcodec.62.28.102.dylib')){const strings=bytes.toString('latin1').split('\0');ffmpegEvidence={version:strings.find(s=>s.startsWith('FFmpeg version ')),configuration:strings.find(s=>s.startsWith('--disable-static --enable-shared ')),reportedLicense:strings.find(s=>s.startsWith('libavcodec license: '))};}
        }
        for(const license of await readMediaCodecLicenseFiles()){
            const file='licenses/media-dependencies/'+license.path,destination=path.join(output,file);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,license.bytes,{flag:'wx'});files.push({path:file,bytes:license.bytes.length,sha256:hash(license.bytes)});
        }
        const minimumMacOS=`${minimum>>>16}.${(minimum>>>8)&255}.${minimum&255}`;
        const provenance=Buffer.from(JSON.stringify({format:'nova-media-codec-source-provenance',version:1,sourcePayloadManifestSha256:sourceManifestSha256,python:JSON.parse((await verifiedSourceFile(source,entries.get('python-source.json'))).bytes),pyav:{version:'18.1.0',wheel:'av-18.1.0-cp311-abi3-macosx_14_0_arm64.whl'},ffmpegEvidence,selection:'one static Python executable; pure standard library without GUI, packaging or development tools; PyAV and its linked FFmpeg libraries; original license notices',nativeFiles},null,2)+'\n');
        await fs.writeFile(path.join(output,'provenance.json'),provenance,{flag:'wx'});files.push({path:'provenance.json',bytes:provenance.length,sha256:hash(provenance)});
        const manifest={format:'nova-media-codec-runtime',version:1,platform:'darwin',arch:'arm64',minimumMacOS,executable:'python/bin/python3',pythonSitePath:'site',pythonVersion:'3.11.16',pyavVersion:'18.1.0',source:{payloadManifestSha256:sourceManifestSha256},verifiedOn:{macOSVersion},files:files.sort((a,b)=>a.path.localeCompare(b.path,'en'))};
        await fs.writeFile(path.join(output,'media-codec-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
        const probeDirectory=await fs.mkdtemp(path.join(os.tmpdir(),'nova-codec-build-probe-'));
        try{await promisify(execFile)(path.join(output,'python/bin/python3'),['-B','-I','-S','-c',MEDIA_CODEC_SELF_TEST_SCRIPT,path.join(output,'site'),probeDirectory],{timeout:60000,killSignal:'SIGKILL',maxBuffer:16384,cwd:probeDirectory,env:{HOME:probeDirectory,TMPDIR:probeDirectory,PATH:'',LANG:'C.UTF-8'}});}
        catch(error){throw Error(`MEDIA_CODEC_BUILD_SELF_TEST_FAILED: ${error.stderr||error.code||'unknown'}`);}finally{await fs.rm(probeDirectory,{recursive:true,force:true});}
        const runtime=await discoverMediaCodecRuntime([output]);if(!runtime||runtime.validation!=='offline-codec-self-test')throw Error('MEDIA_CODEC_NATIVE_SELF_TEST_FAILED');
        return{root:runtime.root,identity:runtime.identity,minimumMacOS,verifiedOn:manifest.verifiedOn,files:files.length,bytes:files.reduce((sum,f)=>sum+f.bytes,0),nativeFiles:nativeFiles.length,validation:runtime.validation};
    }catch(error){await fs.rm(output,{recursive:true,force:true});throw error;}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
    try{
        if(process.argv.slice(2).some(arg=>arg!=='--verify'))throw Error('Only --verify is supported; build uses the pinned source and a fresh dedicated output');
        if(process.argv.includes('--verify')){const found=await discoverMediaCodecRuntime([mediaCodecOutputRoot]);if(!found)throw Error('MEDIA_CODEC_VERIFICATION_FAILED');console.log(JSON.stringify({root:found.root,identity:found.identity,minimumMacOS:found.minimumMacOS,validation:found.validation},null,2));}
        else console.log(JSON.stringify(await prepareMediaCodecRuntime(),null,2));
    }catch(error){console.error(error.message);process.exitCode=1;}
}
