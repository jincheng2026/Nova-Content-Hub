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
const evidence=path.resolve(process.env.UI_EVIDENCE_DIR||path.join(workbench,'../docs/verification/production/2026-10-27-production-list-alignment/electron'));
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
 const avatar=library.importAsset(process.env.ACCOUNT_AVATAR_PROBE_SOURCE||path.join(workbench,'resources/brand/nova-content-hub-icon-512.png'),{purpose:'photo'});
 const missingFile=path.join(root,'missing-avatar.png');await fs.writeFile(missingFile,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY9sAAAAASUVORK5CYII=','base64'));const missingAvatar=library.importAsset(missingFile,{purpose:'photo'});
 const accounts=[];for(let index=0;index<4;index++){const account=mutate('saveAccount',{name:index===0?'在下小曾':index===1?'这是需要完整阅读的很长账号名称'.repeat(5):`账号${index}`,platform:'抖音',note:index===1?'完整备注不可丢失。'.repeat(120):index===2?'短备注':'',tags:index===1?Array.from({length:12},(_,i)=>`标签${i}`):[],images:index===2?[avatar.assetHash]:[],avatarAssetHash:index===0?avatar.assetHash:index===3?missingAvatar.assetHash:null,reportIds:[]}).accounts.at(-1);accounts.push(account);}
 await fs.unlink(path.join(library.info.root,'资产','sha256',missingAvatar.assetHash.slice(0,2),missingAvatar.assetHash));
 const reportFile=path.join(root,'report.html');await fs.writeFile(reportFile,'<!doctype html><html><body>完整可读报告</body></html>');const asset=library.importAsset(reportFile,{purpose:'production-report'});
 for(const [accepted,title]of [[true,'已验收的真实账号拆解'],[false,'等待验收的同名报告']]){const task=mutate('createTask',{kind:'analysis',title,accountId:accounts[0].id,host:'codex',prompt:'合成证据，不运行服务'}).tasks.at(-1),identity={taskId:task.id,attemptId:task.activeAttemptId,workerId:'synthetic',claimToken:randomUUID()};mutate('claimTask',identity);const submitted=mutate('submitTask',{...identity,result:{summary:'完整结果摘要。'.repeat(60),artifacts:[{id:randomUUID(),kind:'report',title,text:'完整报告产物。'.repeat(100),assetHash:null,data:{pages:[{title:'报告首页',assetHash:asset.assetHash}]}}]}});if(accepted)mutate('acceptTask',{taskId:task.id,receiptHash:submitted.tasks.at(-1).attempts[0].receipt.sha256});}
 mutate('saveReport',{title:'手工导入的长报告标题'.repeat(12),type:'手工资料',accountIds:[accounts[0].id],pages:[{title:'完整第一页',assetHash:asset.assetHash},{title:'完整第二页',assetHash:asset.assetHash}],meta:{source:'合成资料'}});
 const query={platform:'抖音',direction:'完整方向'.repeat(50),sampleLimit:3,maxFollowers:5000,minLikes:100,minRatio:1,lookbackDays:7},at='2026-10-27T00:00:00.000Z';
 const radarTask=mutate('createTask',{kind:'research',title:'雷达资料',prompt:'合成雷达',host:'codex',parameters:{workflow:'viral-radar',query},tools:[],budget:{amount:0,currency:'REQ'}}).tasks.at(-1),identity={taskId:radarTask.id,attemptId:radarTask.activeAttemptId,workerId:'synthetic',claimToken:randomUUID()};mutate('claimTask',identity);const radarResult=mutate('submitTask',{...identity,result:{summary:'雷达来源',artifacts:[{id:randomUUID(),kind:'research',title:'雷达',text:'完整来源',assetHash:null,data:{radar:{schemaVersion:1,query,collectedAt:at,candidates:[0,1,2].map(index=>({platform:'抖音',sourceId:String(123+index),url:`https://www.douyin.com/video/${123+index}`,title:index===0?'完整雷达作品标题'.repeat(50):index===1?'短作品':'空作者作品',author:{id:`author-${index}`,name:index===0?'完整作者名'.repeat(40):'',followers:10},metrics:{likes:200},publishedAt:'2026-10-26T00:00:00.000Z',evidence:['完整来源证据。'.repeat(100)]}))}}}]}}),radarAttempt=radarResult.tasks.at(-1).attempts[0];mutate('acceptTask',{taskId:radarTask.id,receiptHash:radarAttempt.receipt.sha256});mutate('adoptRadarResult',{taskId:radarTask.id,attemptId:radarAttempt.id,receiptHash:radarAttempt.receipt.sha256});
 const content=library.createContent({title:'列表对齐测试'.repeat(30),body:'完整正文不得丢失。'.repeat(100)});for(let index=0;index<3;index++){const c=index===0?content:library.createContent({title:`内容${index}`,body:index===1?'短正文':''});mutate('ensureCreation',{contentId:c.id});}
 await fs.mkdir(path.join(root,'machine'));
 await fs.writeFile(path.join(root,'machine/machine-binding.json'),JSON.stringify({...emptyBinding(),current:{root:library.info.root,libraryId:library.info.libraryId,rootIdentity:library.info.rootIdentity}}));
 await fs.writeFile(path.join(root,'fixture.json'),JSON.stringify({contentId:content.id,title:content.title,body:content.body,accounts:accounts.map(a=>({id:a.id,name:a.name})),avatarHash:avatar.assetHash,avatarSource:process.env.ACCOUNT_AVATAR_PROBE_SOURCE||path.join(workbench,'resources/brand/nova-content-hub-icon-512.png')}));
 const entry=path.join(dist,'main/production-list-probe-entry.mjs');
 await fs.copyFile(path.join(workbench,'test-support/production-list-probe-entry.mjs'),entry);
 const code=await new Promise((resolve,reject)=>{const child=spawn(electron,[entry],{cwd:bundle,env:{...process.env,NOVA_CREATION_PROBE_ROOT:root,NOVA_CREATION_PROBE_EVIDENCE:evidence},stdio:'inherit'});const timer=setTimeout(()=>child.kill('SIGKILL'),90000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);resolve(code);});});
 if(code!==0)throw Error('Production list Electron probe failed: '+code);
 console.log('PASS production list Electron probe; '+evidence);
}finally{await fs.rm(root,{recursive:true,force:true});}
