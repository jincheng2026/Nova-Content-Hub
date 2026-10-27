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
const evidence=path.resolve(process.env.UI_EVIDENCE_DIR||path.join(workbench,'../docs/verification/production/2026-10-27-production-list-alignment/transcript-electron'));
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
 const content=library.createContent({title:'逐字稿固定版本测试',body:'自己的正文，不应由逐字稿候选替换。'});
 const audio=path.join(root,'voice.wav'),wav=Buffer.alloc(44);wav.write('RIFF');wav.write('WAVE',8);await fs.writeFile(audio,wav);const media=library.importAsset(audio,{purpose:'production-reference'});
 mutate('ensureCreation',{contentId:content.id});let state=library.readProductionCreation(content.id);
 const base={url:'https://example.com/video',title:'原始参考',platform:'抖音',analysis:'既有分析',mediaAssetHash:media.assetHash,subtitleAssetHash:null};
 const reference={...base,id:randomUUID(),originalText:'原始稿永远保留。',correctedText:'旧校正版',segments:[{startMs:0,endMs:1000,text:'原始稿永远保留。'}],corrections:[]},empty={...base,id:randomUUID(),title:'空稿素材',originalText:'',correctedText:'',segments:[],corrections:[]},urlOnly={...base,id:randomUUID(),title:'只有网址',mediaAssetHash:null,originalText:'',correctedText:'',segments:[],corrections:[]};
 state=library.saveProductionDraft(content.id,{body:state.content.body,expectedBodyHash:state.content.bodyHash,expectedProductionToken:state.productionToken,creationPatch:{references:[reference,empty,urlOnly]}},state.content.editToken);
 state=library.readProductionCreation(content.id);
 const {productionReferenceHash}=await import('../../plugin-src/src/lib/file-library/production-reference.mjs');
 const task=mutate('createTask',{kind:'transcription',title:'纠错固定参考',prompt:'合成任务，不请求真实助手',contentId:content.id,host:'codex',parameters:{transcript:{version:1,intent:'correct',referenceId:reference.id,baselineHash:await productionReferenceHash(reference)}},bodyHash:state.content.bodyHash}).tasks.at(-1);
 const identity={taskId:task.id,attemptId:task.activeAttemptId,workerId:'synthetic',claimToken:randomUUID()},candidate={...reference,correctedText:'新的校对候选。',corrections:[{original:'原始稿',corrected:'校对稿',reason:'合成核对依据'}]};mutate('claimTask',identity);const submitted=mutate('submitTask',{...identity,result:{summary:'只校对，原稿保留',artifacts:[{id:randomUUID(),kind:'transcript',title:'校对候选',text:'校对依据完整可读',assetHash:null,data:{references:[candidate]}}]}});mutate('acceptTask',{taskId:task.id,receiptHash:submitted.tasks[0].attempts[0].receipt.sha256});
 await fs.mkdir(path.join(root,'machine'));
 await fs.writeFile(path.join(root,'machine/machine-binding.json'),JSON.stringify({...emptyBinding(),current:{root:library.info.root,libraryId:library.info.libraryId,rootIdentity:library.info.rootIdentity}}));
 await fs.writeFile(path.join(root,'fixture.json'),JSON.stringify({contentId:content.id,title:content.title,body:content.body,reference,candidate,emptyId:empty.id,urlOnlyId:urlOnly.id}));
 const entry=path.join(dist,'main/production-transcript-probe-entry.mjs');
 await fs.copyFile(path.join(workbench,'test-support/production-transcript-probe-entry.mjs'),entry);
 const code=await new Promise((resolve,reject)=>{const child=spawn(electron,[entry],{cwd:bundle,env:{...process.env,NOVA_CREATION_PROBE_ROOT:root,NOVA_CREATION_PROBE_EVIDENCE:evidence},stdio:'inherit'});const timer=setTimeout(()=>child.kill('SIGKILL'),90000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);resolve(code);});});
 if(code!==0)throw Error('Production transcript Electron probe failed: '+code);
 console.log('PASS production transcript Electron probe; '+evidence);
}finally{await fs.rm(root,{recursive:true,force:true});}
