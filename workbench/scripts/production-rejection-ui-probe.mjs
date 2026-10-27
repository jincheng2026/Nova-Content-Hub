// Fresh renderer in a temporary existing desktop bundle; all data and assistant launches are synthetic.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {build} from 'vite';
import electron from 'electron';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {emptyBinding} from '../src/main/bindings.mts';
const workbench=fileURLToPath(new URL('../',import.meta.url));
const evidence=path.resolve(process.env.UI_EVIDENCE_DIR||path.join(workbench,'../docs/verification/production/2026-10-27-rejected-results/electron'));
const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'nova-creation-probe-')));
try {
 await fs.mkdir(evidence,{recursive:true});
 const bundle=path.join(root,'bundle'),dist=path.join(bundle,'workbench/dist');
 await fs.cp(path.join(workbench,'dist-desktop/auth-disabled'),bundle,{recursive:true});
 execFileSync(process.execPath,[path.join(workbench,'node_modules/typescript/bin/tsc'),'-p',path.join(workbench,'tsconfig.native.json'),'--outDir',dist],{stdio:'inherit'});
 for(const relative of ['plugin-src/src/lib','plugin-src/resources'])await fs.cp(path.join(workbench,'..',relative),path.join(bundle,relative),{recursive:true});
 await build({configFile:false,root:path.join(workbench,'src/renderer'),base:'./',oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(dist,'renderer'),emptyOutDir:true,modulePreload:false,sourcemap:false,target:'chrome148'}});
 const entries={},mimes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
 for(const file of await fs.readdir(path.join(dist,'renderer'),{recursive:true})) {if((await fs.stat(path.join(dist,'renderer',file))).isFile())entries[`/${file}`]={file,mime:mimes[path.extname(file)]};}
 await fs.writeFile(path.join(dist,'renderer-resources.json'),JSON.stringify({format:'nova-desktop-renderer-resources',schemaVersion:1,entries}));
 const library=createLibrary(path.join(root,'library'));
 const mutate=(op,input)=>library.mutateProduction(op,{...input,expectedToken:library.readProduction().editToken});
 const content=library.createContent({title:'坏结果拒绝测试',body:'用户自己的正文，拒绝不得更改。'});mutate('ensureCreation',{contentId:content.id});const state=library.readProductionCreation(content.id);
 const taskIds=[];for(const index of [0,1]){const task=mutate('createTask',{kind:'writing',title:`坏整篇候选 ${index+1}`,prompt:`旧要求 ${index+1}`,contentId:content.id,host:index===0?'codex':'workbuddy',parameters:{workflow:'content-creation'},bodyHash:state.content.bodyHash}).tasks.at(-1),identity={taskId:task.id,attemptId:task.activeAttemptId,workerId:'synthetic',claimToken:randomUUID()};taskIds.push(task.id);mutate('claimTask',identity);mutate('submitTask',{...identity,result:{summary:'原始坏候选必须保留',artifacts:[{id:randomUUID(),kind:'draft',title:'结构错误的稿件',text:'结构错误无法采用',assetHash:null,data:{wrong:'故意构造不可采用的结果'}},{id:randomUUID(),kind:'draft',title:'重复占用正文',text:'另一份正文',assetHash:null,data:null}]}});}
 await fs.mkdir(path.join(root,'machine'));
 await fs.writeFile(path.join(root,'machine/machine-binding.json'),JSON.stringify({...emptyBinding(),current:{root:library.info.root,libraryId:library.info.libraryId,rootIdentity:library.info.rootIdentity}}));
 await fs.writeFile(path.join(root,'fixture.json'),JSON.stringify({contentId:content.id,title:content.title,body:content.body,taskIds}));
 const entry=path.join(dist,'main/production-rejection-probe-entry.mjs');
 await fs.copyFile(path.join(workbench,'test-support/production-rejection-probe-entry.mjs'),entry);
 const code=await new Promise((resolve,reject)=>{const child=spawn(electron,[entry],{cwd:bundle,env:{...process.env,NOVA_CREATION_PROBE_ROOT:root,NOVA_CREATION_PROBE_EVIDENCE:evidence},stdio:'inherit'});const timer=setTimeout(()=>child.kill('SIGKILL'),90000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);resolve(code);});});
 if(code!==0)throw Error('Production rejection Electron probe failed: '+code);
 console.log('PASS production rejection Electron probe; '+evidence);
}finally{await fs.rm(root,{recursive:true,force:true});}
