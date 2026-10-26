import {app,safeStorage} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ServiceSettingsStore} from '../src/main/service-settings.mjs';
import {ServiceTools} from '../src/main/service-tools.mjs';
import {productionToolBroker} from '../src/main/production-services.mjs';
import {executeProduction} from '../src/main/production-worker.mjs';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {callServiceTool} from '../../plugin-src/src/lib/service-tools/client.mjs';
const [temp,evidence]=process.argv.slice(2);
if(!temp||!evidence||!path.basename(temp).startsWith('nova-live-service-'))throw new Error('Use live-service-probe.mjs.');
app.setName('自媒体工作台');app.setPath('userData',path.join(temp,'electron-profile'));
app.whenReady().then(async()=>{
const results=[],startedAt=new Date().toISOString();let broker,library;
const hash=s=>createHash('sha256').update(s).digest('hex');
function shape(v,depth=0){if(v===null)return'null';if(depth>7)return typeof v;if(Array.isArray(v))return{type:'array',length:v.length,sample:v.length?shape(v[0],depth+1):null};if(typeof v==='object')return Object.fromEntries(Object.entries(v).slice(0,120).map(([k,x])=>[k,shape(x,depth+1)]));if(typeof v==='string'&&/^[\[{]/.test(v)){try{return{type:'JSON string',decoded:shape(JSON.parse(v),depth+1)};}catch{}}return typeof v;}
function fixture(v,depth=0){if(depth>12)return null;if(Array.isArray(v))return v.slice(0,2).map(x=>fixture(x,depth+1));if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).slice(0,200).filter(([k])=>!['request_id','cache_url'].includes(k)).map(([k,x])=>[k,fixture(x,depth+1)]));if(typeof v!=='string')return v;if(/^[\[{]/.test(v)){try{return JSON.stringify(fixture(JSON.parse(v),depth+1));}catch{}}if(/^https?:/.test(v))return'https://example.invalid/redacted';if(/^\d+$/.test(v))return'1'.repeat(Math.min(v.length,32));if(/^[0-9a-f]{24}$/i.test(v))return hash(v).slice(0,24);return v.length?`sample-${hash(v).slice(0,12)}`:'';}
function objects(v,out=[]){if(Array.isArray(v)){for(const x of v)objects(x,out);}else if(v&&typeof v==='object'){out.push(v);for(const x of Object.values(v))objects(x,out);}else if(typeof v==='string'&&/^[\[{]/.test(v)){try{objects(JSON.parse(v),out);}catch{}}return out;}
async function save(){await fs.writeFile(path.join(evidence,'summary.json'),JSON.stringify({startedAt,updatedAt:new Date().toISOString(),platform:process.platform,arch:process.arch,results,costs:library?.readProduction().costs.map(({service,status,amount,usage})=>({service,status,amount,usage})),guiVerified:false},null,2)+'\n');}
try{
 const store=new ServiceSettingsStore({filePath:path.join(temp,'settings.json'),encryption:safeStorage});await store.initialize();
 const view=store.read();await store.update({values:{...view.values,budget:{enabled:true,maxRequestsPerTask:6},commentsEnabled:false,asr:{...view.values.asr,mode:'local-only'}}});
 const tools=new ServiceTools({settings:store,cachePath:path.join(temp,'cache.json')});
 library=createLibrary(path.join(temp,'library'));const binding={root:library.info.root,libraryId:library.info.libraryId,rootIdentity:library.info.rootIdentity};
 const worker={call:(op,args)=>executeProduction(op,args,'disabled')};
 const descriptor=path.join(temp,'broker.json');broker=productionToolBroker({current:()=>binding,worker},tools,descriptor);await broker.start();
 const mutate=(op,input)=>library.mutateProduction(op,{expectedToken:library.readProduction().editToken,...input},{mutationId:randomUUID()});
 function task(name,tool,budget,contentId){const t=mutate('createTask',{kind:tool==='asr'?'transcription':'research',title:`live probe ${name}`,prompt:`Bounded live connectivity ${name}; no retries or pagination`,host:'codex',parameters:{budgetEnabled:budget>0,comments:false,liveProbe:true},tools:[tool],budget:{amount:budget,currency:'REQ'},...(contentId?{contentId}:{})}).tasks.at(-1);const identity={taskId:t.id,attemptId:t.activeAttemptId,claimToken:randomUUID(),workerId:'live-service-probe'};library.mutateProduction('claimTask',identity,{mutationId:randomUUID()});return identity;}
 async function call(name,identity,input){const start=Date.now();try{const r=await callServiceTool(descriptor,{...identity,...input,requestId:randomUUID()});await fs.writeFile(path.join(evidence,`${name}.shape.json`),JSON.stringify(shape(r.data),null,2)+'\n');await fs.writeFile(path.join(evidence,`${name}.fixture.json`),JSON.stringify(fixture(r.data),null,2)+'\n');results.push({name,ok:true,elapsedMs:Date.now()-start,requestsUsed:r.requestsUsed,cacheHit:r.cacheHit,collectedAt:r.collectedAt});await save();console.log(JSON.stringify(results.at(-1)));return r.data;}catch(error){results.push({name,ok:false,elapsedMs:Date.now()-start,code:error.code??'PROBE_FAILED',httpStatus:error.httpStatus??null,providerCode:error.providerCode??null});await save();console.log(JSON.stringify(results.at(-1)));return null;}}
 const dy=task('douyin','tikhub',3),search=await call('douyin-search',dy,{tool:'tikhub',operation:'douyin-search',id:'人工智能',search:{sortType:'likes',timeRange:'week',contentType:'any'}});
 if(search){const author=objects(search).find(x=>typeof x.sec_uid==='string'&&x.sec_uid.length>8);if(author){const profile=await call('douyin-profile',dy,{tool:'tikhub',operation:'profile',id:author.sec_uid});if(profile)await call('douyin-user-posts',dy,{tool:'tikhub',operation:'user-posts',id:author.sec_uid});}else{results.push({name:'douyin-profile-and-posts',ok:false,code:'NO_ACTUAL_SEC_UID'});await save();}}
 const xhs=task('xiaohongshu','tikhub',2),notes=await call('xhs-search',xhs,{tool:'tikhub',operation:'xhs-search',id:'人工智能',search:{sortType:'likes',timeRange:'week',contentType:'any'}});
 if(notes){let id;for(const x of objects(notes)){for(const k of ['user','author']){const u=x[k];if(u&&typeof u==='object'){const candidate=u.user_id??u.userid??u.id;if(typeof candidate==='string'&&/^[0-9a-f]{24}$/i.test(candidate)){id=candidate;break;}}}if(id)break;}if(id)await call('xhs-profile',xhs,{tool:'tikhub',operation:'xhs-profile',id});else{results.push({name:'xhs-profile',ok:false,code:'NO_ACTUAL_AUTHOR_ID'});await save();}}
 if(view.credentials.model.hasKey&&view.values.model.modelId.trim())await call('ark-model',task('model','model',1),{tool:'model',instruction:'Reply with OK only.',text:'Connectivity check.'});else{results.push({name:'ark-model',ok:false,code:'MODEL_NOT_CONFIGURED'});await save();}
 const readiness=await tools.checkReadiness();results.push({name:'local-asr-readiness',...readiness.localAsr});await save();
 if(readiness.localAsr.available&&process.platform==='darwin'){
  const aiff=path.join(temp,'sample.aiff'),wav=path.join(temp,'sample.wav');await promisify(execFile)('/usr/bin/say',['-o',aiff,'你好，这是一次语音测试。'],{timeout:30000});await promisify(execFile)('/usr/bin/afconvert',['-f','WAVE','-d','LEI16@16000',aiff,wav],{timeout:30000});
  const asset=library.importAsset(wav,{purpose:'production-reference'}),content=library.createContent({title:'ASR probe',body:''});mutate('ensureCreation',{contentId:content.id});const state=library.readProductionCreation(content.id);
  library.saveProductionDraft(content.id,{body:'',expectedBodyHash:state.content.bodyHash,expectedProductionToken:state.productionToken,creationPatch:{references:[{id:randomUUID(),url:null,title:'Local synthesized speech',platform:'local',originalText:'',correctedText:'',segments:[],corrections:[],analysis:'',mediaAssetHash:asset.assetHash,subtitleAssetHash:null}]}},state.content.editToken,{mutationId:randomUUID()});
  const text=await call('local-asr',task('asr','asr',0,content.id),{tool:'asr',audioPath:asset.assetHash,allowCloud:false});if(text){results.push({name:'local-asr-text',nonEmpty:typeof text.text==='string'&&!!text.text.trim(),textLength:typeof text.text==='string'?text.text.length:0});await save();}
 }
 await save();
}catch(error){results.push({name:'probe-infrastructure',ok:false,code:error.code??'PROBE_FAILED'});await save();console.log(JSON.stringify(results.at(-1)));process.exitCode=1;}
finally{await broker?.stop();app.exit(process.exitCode??0);}
});
