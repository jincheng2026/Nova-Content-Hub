// Complete real-library native probe. No mock data, worker overrides, seed bypass, or source writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
const exec=promisify(execFile),workbench=fileURLToPath(new URL('../',import.meta.url)),repo=path.resolve(workbench,'..');
const sourceArg=process.argv[2]??(await fs.readFile('/tmp/nova-jincheng-delivery-candidate-location.txt','utf8')).trim();
const selected=await fs.realpath(sourceArg),source=await fs.stat(path.join(selected,'第二大脑')).then(s=>s.isDirectory()?path.join(selected,'第二大脑'):selected).catch(e=>{if(e.code==='ENOENT')return selected;throw e;});
const bundleSource=path.resolve(process.env.NOVA_JINCHENG_FINAL_BUNDLE??path.join(workbench,'dist-desktop/auth-disabled'));
const evidence=path.join(repo,'docs/verification/production/2026-10-28-jincheng-final',new Date().toISOString().replace(/[:.]/g,'-'));
const reuse=process.env.NOVA_JINCHENG_FINAL_REUSE_ROOT;
const root=await fs.realpath(reuse??await fs.mkdtemp(path.join(os.tmpdir(),'nova-jincheng-final-')));
if(!path.basename(root).startsWith('nova-jincheng-final-')||!root.startsWith(await fs.realpath(os.tmpdir())+path.sep))throw Error('Only the isolated final-probe fixture may be reused');
const sha=value=>createHash('sha256').update(value).digest('hex');
async function manifest(base){const result={};const files=(await fs.readdir(base,{recursive:true,withFileTypes:true})).filter(entry=>entry.isFile()).map(entry=>path.join(entry.parentPath,entry.name)).sort();for(let n=0;n<files.length;n+=32)for(const [relative,hash]of await Promise.all(files.slice(n,n+32).map(async file=>[path.relative(base,file),sha(await fs.readFile(file))])))result[relative]=hash;return result;}
const copy=(from,to)=>process.platform==='darwin'?exec('/usr/bin/ditto',[from,to]):fs.cp(from,to,{recursive:true});
await fs.mkdir(evidence,{recursive:true});console.log('FINAL PROBE source:',source,'fixture:',root,'evidence:',evidence);
const before=await manifest(source),fixture=path.join(root,'第二大脑'),bundle=path.join(root,'bundle');
let passed=false;
try{
 if(!reuse){
  await copy(source,fixture);
  const internal=path.join(fixture,'.workbench'),removed=[];
  // Only derived/runtime data is removed in the disposable copy. Author data and import provenance remain intact.
  for(const name of ['runtime','projection.json','projection-mutations','resource-projection.json','resource-projection-mutations','resource-assets','cache','descriptors']){const target=path.join(internal,name);if(await fs.lstat(target).then(()=>true).catch(e=>{if(e.code==='ENOENT')return false;throw e;})){await fs.rm(target,{recursive:true,force:true});removed.push(name);}}
  const emptyDefaultSourceDirectories=['12_视觉资产','13_X收藏'];for(const relative of emptyDefaultSourceDirectories)await fs.mkdir(path.join(fixture,relative),{recursive:true});
  const marker=path.join(internal,'vault.json'),descriptor=await fs.readFile(marker,'utf8').then(JSON.parse).catch(error=>{if(error.code==='ENOENT')return null;throw error;});if(descriptor){const stat=await fs.stat(fixture,{bigint:true});descriptor.rootIdentity={dev:String(stat.dev),ino:String(stat.ino)};await fs.writeFile(marker,JSON.stringify(descriptor,null,2)+'\n');}
  for(const name of ['source-map.json','jincheng-supplement-imports.json']){const relative='.workbench/'+name;if(before[relative]&&sha(await fs.readFile(path.join(fixture,relative)))!==before[relative])throw Error('Fixture provenance was changed: '+name);}
  await fs.writeFile(path.join(root,'fixture-scope.json'),JSON.stringify({source,sourceFiles:Object.keys(before).length,sourceManifestSha256:sha(JSON.stringify(before)),copiedComplete:true,removedDerivedEntries:removed,descriptorRebound:descriptor?{vaultId:descriptor.vaultId,rootIdentity:descriptor.rootIdentity}:null,firstOpenUninitialized:descriptor===null,provenancePreserved:['source-map.json','jincheng-supplement-imports.json'],noSeedBypass:true,noMockData:true,emptyDefaultSourceDirectories},null,2));
 }
 if(!reuse||process.env.NOVA_JINCHENG_FINAL_REUSE_BUNDLE!=='1'){await fs.rm(bundle,{recursive:true,force:true});await copy(bundleSource,bundle);}
 const release=JSON.parse(await fs.readFile(path.join(bundle,'workbench/dist/release.json'),'utf8'));if(release.version!==(process.env.NOVA_JINCHENG_FINAL_VERSION??'0.5.0'))throw Error('Final bundle version mismatch: '+release.version);
 const entry=path.join(bundle,'workbench/dist/main/jincheng-final-probe-entry.mjs');await fs.copyFile(path.join(workbench,'scripts/jincheng-final-probe-entry.mjs'),entry);
 const localAsr=process.env.NOVA_JINCHENG_FINAL_ASR_ROOT??path.join(repo,'.local-probes/local-asr-release-v2',`${process.platform}-${process.arch}`);
 const logs=[];
 for(const phase of (process.env.NOVA_JINCHENG_FINAL_PHASES??(reuse?'reopen':'cold,reopen')).split(',')){
  console.log('FINAL PROBE phase:',phase);
  const exit=await new Promise((resolve,reject)=>{const child=spawn(electron,[entry],{cwd:bundle,env:{...process.env,NOVA_JINCHENG_FINAL_ROOT:root,NOVA_JINCHENG_FINAL_PHASE:phase,NOVA_JINCHENG_FINAL_ASR_ROOT:localAsr},stdio:['ignore','pipe','pipe']});let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},Number(process.env.NOVA_JINCHENG_FINAL_TIMEOUT_MS??600000));for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{const text=bytes.toString();logs.push(text);process.stdout.write(text);});child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('close',code=>{clearTimeout(timer);resolve({code,timedOut});});});
  await fs.writeFile(path.join(root,`${phase}-process.json`),JSON.stringify(exit,null,2));await fs.writeFile(path.join(evidence,'process.log'),logs.join(''));
  if(exit.code!==0||exit.timedOut)throw Error(`${phase} failed: ${JSON.stringify(exit)}`);
 }
 passed=true;
}finally{
 const after=await manifest(source),unchanged=JSON.stringify(before)===JSON.stringify(after);await fs.writeFile(path.join(evidence,'source-integrity.json'),JSON.stringify({source,files:Object.keys(before).length,unchanged,beforeManifestSha256:sha(JSON.stringify(before)),afterManifestSha256:sha(JSON.stringify(after))},null,2));
 for(const name of await fs.readdir(root))if(/\.(json|png|log)$/.test(name))await fs.copyFile(path.join(root,name),path.join(evidence,name));
 await fs.writeFile(path.join(evidence,'runner-result.json'),JSON.stringify({passed:passed&&unchanged,fixture:root,bundleSource,reusedFrozenFixtureBundle:!!reuse&&process.env.NOVA_JINCHENG_FINAL_REUSE_BUNDLE==='1',evidence,source,sourceUnchanged:unchanged,platform:process.platform,arch:process.arch,limitations:['Native Electron main/preload/utility workers/renderer exercised on this Mac only.','Complete disposable library copy, real built-in initialization, two processes.','Browser launches intercepted after actual bound-reader URL creation; no messages, paid calls or external-provider execution.','Local ASR readiness uses explicitly selected real native payload; actual speech recognition has separate evidence.','Final installer/system metadata/manual visual and other platforms are separate acceptance.']},null,2));
 console.log('FINAL PROBE evidence:',evidence,'fixture retained:',root);if(!unchanged)throw Error('Source library was changed');
}
