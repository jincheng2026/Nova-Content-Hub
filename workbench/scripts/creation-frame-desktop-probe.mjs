import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import electron from 'electron';
import {build} from 'vite';
import {stripTypeScriptTypes} from 'node:module';
import {createVault} from '../../plugin-src/src/lib/vault/index.mjs';
const source=process.argv[2];
if(!source||!path.isAbsolute(source))throw Error('Pass an absolute original Vault root. Only a temporary full copy will be opened.');
const workbench=fileURLToPath(new URL('../',import.meta.url)),repo=path.resolve(workbench,'..'),root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'nova-creation-frame-')));
const evidence=path.join(repo,'docs/verification/production',`2026-10-28-creation-frame-${Date.now()}`);
async function hashes(base){const entries=await fs.readdir(base,{recursive:true,withFileTypes:true}),result={};for(const entry of entries.filter(e=>e.isFile()).sort((a,b)=>path.join(a.parentPath,a.name).localeCompare(path.join(b.parentPath,b.name)))){const file=path.join(entry.parentPath,entry.name);result[path.relative(base,file)]=createHash('sha256').update(await fs.readFile(file)).digest('hex');}return result;}
const before=await hashes(source);await fs.mkdir(evidence,{recursive:true});let success=false;
try{
 const destination=path.join(root,'第二大脑');await fs.mkdir(destination);createVault(destination);
 const drafts='05_内容草稿',folders=(await fs.readdir(path.join(source,drafts))).filter(name=>name.startsWith('T029_'));if(folders.length!==1)throw Error('Expected one real T029 source folder');
 const relative=path.join(drafts,folders[0]);execFileSync('/usr/bin/ditto',[path.join(source,relative),path.join(destination,relative)]);
 const originalPage=await fs.readFile(path.join(source,relative,'T029_创作页.html'),'utf8'),raw=JSON.parse(/<script[^>]*id="jc-doc"[^>]*>([\s\S]*?)<\/script>/.exec(originalPage)[1]);let copiedMedia=0;
 const media=new Set(raw.items.flatMap(item=>item.locked?.refs??[]).map(ref=>ref.video).filter(value=>typeof value==='string'));
 for(const video of media){const resolved=path.resolve(source,relative,video),rel=path.relative(source,resolved);if(rel.startsWith('..')||path.isAbsolute(rel))continue;try{if(!(await fs.stat(resolved)).isFile())continue;const target=path.join(destination,rel);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(resolved,target);copiedMedia++;}catch(error){if(error.code!=='ENOENT')throw error;}}
 await fs.writeFile(path.join(root,'fixture-scope.json'),JSON.stringify({scope:'Real T029 folder and registered media in a fresh temporary Vault; complete source Vault startup tested separately',relative,copiedMedia},null,2));
 const bundle=path.join(root,'bundle');execFileSync('/usr/bin/ditto',[path.join(workbench,'dist-desktop/auth-disabled'),bundle]);
 const dist=path.join(bundle,'workbench/dist');
 for(const name of ['creation-controller','creation-worker','creation-frame-html','bound-reader']){const sourcePath=path.join(workbench,`src/main/${name}.mts`),sourceText=await fs.readFile(sourcePath,'utf8');const output=stripTypeScriptTypes(sourceText).replace(/(from\s+['"]\.[^'"]*)\.mts(['"])/g,'$1.mjs$2').replace(/(from\s+['"]\.[^'"]*)\.ts(['"])/g,'$1.js$2');await fs.writeFile(path.join(dist,`main/${name}.mjs`),output);}
 await build({configFile:false,root:path.join(workbench,'src/renderer'),base:'./',oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(dist,'renderer'),emptyOutDir:true,modulePreload:false,sourcemap:false,target:'chrome148'}});
 const mimes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'},entries={};for(const name of await fs.readdir(path.join(dist,'renderer'),{recursive:true})){if(!(await fs.stat(path.join(dist,'renderer',name))).isFile())continue;entries[`/${name}`]={file:name,mime:mimes[path.extname(name)]};}
 await fs.writeFile(path.join(dist,'renderer-resources.json'),JSON.stringify({format:'nova-desktop-renderer-resources',schemaVersion:1,entries}));
 const entry=path.join(dist,'main/creation-frame-probe.mjs');await fs.copyFile(path.join(workbench,'scripts/creation-frame-probe-entry.mjs'),entry);
 for(const phase of ['edit','reopen'])await new Promise((resolve,reject)=>{const child=spawn(electron,[entry],{cwd:bundle,env:{...process.env,NOVA_CREATION_PROBE_ROOT:root,NOVA_CREATION_PROBE_PHASE:phase},stdio:'inherit'}),timeout=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Electron probe timed out'));},180000);child.once('error',reject);child.once('close',code=>{clearTimeout(timeout);code===0?resolve():reject(Error(`Electron ${phase} exited ${code}`));});});
 success=true;
}finally{
 const after=await hashes(source),unchanged=JSON.stringify(before)===JSON.stringify(after);await fs.writeFile(path.join(evidence,'original-integrity.json'),JSON.stringify({source,files:Object.keys(before).length,unchanged,before,after},null,2));
 for(const name of await fs.readdir(root))if(/\.(json|png)$/.test(name))await fs.copyFile(path.join(root,name),path.join(evidence,name));
 console.log('Creation frame evidence:',evidence,'temporary copy:',root);if(success&&unchanged)await fs.rm(root,{recursive:true,force:true});if(!unchanged)throw Error('Original Vault changed during probe');
}
