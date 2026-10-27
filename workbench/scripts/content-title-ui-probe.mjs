// Fresh renderer in a temporary existing desktop bundle; all data and assistant launches are synthetic.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {build} from 'vite';
import electron from 'electron';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {emptyBinding} from '../src/main/bindings.mts';
const workbench=fileURLToPath(new URL('../',import.meta.url));
const evidence=path.resolve(process.env.UI_EVIDENCE_DIR||path.join(workbench,'../docs/verification/production/2026-10-27-content-title-recommendations/electron'));
const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'nova-title-probe-')));
try {
 await fs.mkdir(evidence,{recursive:true});
 const bundle=path.join(root,'bundle'),dist=path.join(bundle,'workbench/dist');
 await fs.cp(path.join(workbench,'dist-desktop/auth-disabled'),bundle,{recursive:true});
 await build({configFile:false,root:path.join(workbench,'src/renderer'),base:'./',oxc:{jsx:{runtime:'automatic'}},build:{outDir:path.join(dist,'renderer'),emptyOutDir:true,modulePreload:false,sourcemap:false,target:'chrome148'}});
 const entries={},mimes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
 for(const file of await fs.readdir(path.join(dist,'renderer'),{recursive:true})) {if((await fs.stat(path.join(dist,'renderer',file))).isFile())entries[`/${file}`]={file,mime:mimes[path.extname(file)]};}
 await fs.writeFile(path.join(dist,'renderer-resources.json'),JSON.stringify({format:'nova-desktop-renderer-resources',schemaVersion:1,entries}));
 const library=createLibrary(path.join(root,'library'));
 const content=library.createContent({title:'讲清楚 AI 工具的三个步骤',body:'先找到真实问题，再用可复现的步骤演示，最后说明适用边界。'});
 const mutate=(op,input)=>library.mutateProduction(op,{...input,expectedToken:library.readProduction().editToken},{mutationId:randomUUID()});
 for(const [accepted,text]of [[true,'把 AI 工具讲明白：从真实问题开始'],[false,'未验收的标题不得采用']]){
 const task=mutate('createTask',{kind:'packaging',title:accepted?'已验收标题推荐':'尚未验收标题推荐',prompt:'合成测试，不调用服务',contentId:content.id,host:'codex',parameters:{},tools:[],budget:{amount:0,currency:'REQ'}}).tasks.at(-1);
 const identity={taskId:task.id,attemptId:task.activeAttemptId,claimToken:randomUUID(),workerId:'synthetic'};mutate('claimTask',identity);
 const s=mutate('submitTask',{...identity,result:{summary:'合成标题推荐',artifacts:[{id:randomUUID(),kind:'packaging',title:'推荐标题',text:'合成结果',assetHash:null,data:{packaging:{titles:[{id:randomUUID(),text}],coverTexts:[],intros:[]}}}]}});
 if(accepted)mutate('acceptTask',{taskId:task.id,receiptHash:s.tasks.at(-1).attempts[0].receipt.sha256});
 }
 await fs.mkdir(path.join(root,'machine'));
 await fs.writeFile(path.join(root,'machine/machine-binding.json'),JSON.stringify({...emptyBinding(),current:{root:library.info.root,libraryId:library.info.libraryId,rootIdentity:library.info.rootIdentity}}));
 await fs.writeFile(path.join(root,'fixture.json'),JSON.stringify({contentId:content.id,title:content.title,body:content.body}));
 const entry=path.join(dist,'main/content-title-probe-entry.mjs');
 await fs.copyFile(path.join(workbench,'test-support/content-title-probe-entry.mjs'),entry);
 const code=await new Promise((resolve,reject)=>{const child=spawn(electron,[entry],{cwd:bundle,env:{...process.env,NOVA_TITLE_PROBE_ROOT:root,NOVA_TITLE_PROBE_EVIDENCE:evidence},stdio:'inherit'});const timer=setTimeout(()=>child.kill('SIGKILL'),90000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);resolve(code);});});
 if(code!==0)throw Error('Content title Electron probe failed: '+code);
 console.log('PASS content title Electron probe; '+evidence);
}finally{await fs.rm(root,{recursive:true,force:true});}
