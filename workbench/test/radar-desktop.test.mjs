import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {createLibrary,openLibrary,__testing} from '../../plugin-src/src/lib/file-library/index.mjs';
import {DesktopController} from '../src/main/controller.mts';import {BindingStore} from '../src/main/bindings.mts';import {execute} from '../src/main/worker.mts';import {defaultServiceSettings} from '../src/shared/service-validation.ts';import {validateInput} from '../src/shared/validation.ts';
import {ServiceSettingsStore} from '../src/main/service-settings.mts';import {ServiceTools} from '../src/main/service-tools.mts';import {productionToolBroker} from '../src/main/production-services.mts';import {callServiceTool} from '../../plugin-src/src/lib/service-tools/client.mjs';import {radarSearchFilters,radarId} from '../../plugin-src/src/lib/file-library/radar.mjs';
process.env.NODE_ENV='test';
const query={platform:'抖音',direction:'测试方向',sampleLimit:3,maxFollowers:5000,minLikes:100,minRatio:1,lookbackDays:7};
async function fixture(t,{budget=4}={}){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nova-radar-desktop-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const library=createLibrary(path.join(dir,'library')),binding={root:library.info.root,libraryId:library.info.libraryId,rootIdentity:library.info.rootIdentity},worker={call:(op,args)=>execute(op,args,'disabled')};const values={...defaultServiceSettings(),budget:{enabled:budget>0,maxRequestsPerTask:Math.max(1,budget)}};
 const controller=new DesktopController({store:new BindingStore(path.join(dir,'binding.json')),worker,documents:dir,dialogs:{destination:async()=>null},authMode:'disabled',productionCallbacks:{launch:async()=>{},open:async()=>'',serviceSettings:async()=>({values,credentials:{tikhub:{hasKey:true},model:{hasKey:false},asr:{hasKey:false}},encryptionAvailable:true})}});await controller.initialize();await controller.persist({...controller.binding,current:binding});return {dir,library,binding,worker,controller,values};}
test('radar desktop freezes query, operations and min(current,4) budget while manual platforms never inherit Douyin',async t=>{
 const {controller:c}=await fixture(t,{budget:20});const result=await c.createRadarTask(query),request=result.snapshot.tasks[0].request;
 assert.equal(request.budget.amount,4);assert.deepEqual(request.parameters.query,query);assert.deepEqual(request.parameters.operations,['douyin-search','profile']);assert.deepEqual(request.tools,['tikhub']);assert.equal(request.parameters.comments,false);
 const other=(await c.createRadarTask({...query,platform:'YouTube'})).snapshot.tasks.at(-1).request;assert.equal(other.budget.amount,0);assert.deepEqual(other.tools,[]);assert.deepEqual(other.parameters.operations,[]);
 for(const input of [{...query,sampleLimit:101},{...query,tools:['model']},{...query,budget:999}])assert.throws(()=>validateInput('createRadarTask',input),{code:'INVALID_INPUT'});
 assert.throws(()=>validateInput('openRadarSource',{url:'https://example.com'}),{code:'INVALID_INPUT'});
 const {controller:manual}=await fixture(t,{budget:0});assert.deepEqual((await manual.createRadarTask(query)).snapshot.tasks[0].request.tools,[]);
});
test('radar broker enforces frozen platform/query/filter/author policy before provider and persists author allowance over restart',async t=>{
 const f=await fixture(t),created=await f.controller.createRadarTask({...query,platform:'YouTube',platforms:['YouTube','抖音'],sampleLimit:12}),task=created.snapshot.tasks[0],identity={taskId:task.id,attemptId:task.activeAttemptId,claimToken:randomUUID(),workerId:'radar-test'};f.library.mutateProduction('claimTask',identity);
 const encryption={isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'keychain',encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()},settings=new ServiceSettingsStore({filePath:path.join(f.dir,'service.json'),encryption});await settings.initialize();await settings.update({values:f.values,keys:{tikhub:'test-key'}});
 const tools=new ServiceTools({settings});let invocations=0;tools.invoke=async request=>{invocations++;return request.operation==='douyin-search'?{data:{business_data:[{data:{aweme_info:{aweme_id:'123',author:{sec_uid:'missing-fans'}}}},{data:{aweme_info:{aweme_id:'124',author:{sec_uid:'known-fans',follower_count:50}}}}]}}:{data:{user:{follower_count:20}}};};
 const descriptor=path.join(f.dir,'broker.json'),owner={worker:f.worker,current:()=>f.binding};let broker=productionToolBroker(owner,tools,descriptor);await broker.start();t.after(()=>broker.stop());
 const call=(fields)=>callServiceTool(descriptor,{...identity,requestId:randomUUID(),tool:'tikhub',operation:'douyin-search',id:query.direction,search:radarSearchFilters(query),...fields});
 for(const fields of [{operation:'comments',id:'123',search:undefined},{operation:'xhs-search'},{id:'different'},{cursor:'1'},{search:{sortType:'latest'}},{operation:'profile',id:'invented-author',search:undefined}])await assert.rejects(call(fields));assert.equal(invocations,0);
 await call({});assert.equal(invocations,1);await assert.rejects(call({}),{code:'RADAR_REQUEST_LIMIT'});assert.equal(invocations,1);
 assert.deepEqual(f.library.readProduction().costs[0].usage.radarAuthorIds,['missing-fans']);
 await broker.stop();broker=productionToolBroker(owner,tools,descriptor);await broker.start();
 await assert.rejects(call({operation:'profile',id:'known-fans',search:undefined}),{code:'RADAR_AUTHOR_FORBIDDEN'});
 await call({operation:'profile',id:'missing-fans',search:undefined});assert.equal(invocations,2);
 await assert.rejects(call({operation:'profile',id:'missing-fans',search:undefined}),{code:'RADAR_REQUEST_LIMIT'});assert.equal(invocations,2);
});
test('radar adoption and topic decision keep durable original intent through a lost worker reply',async t=>{
 const {controller:c,library:l}=await fixture(t,{budget:0}),created=await c.createRadarTask(query),task=created.snapshot.tasks[0],identity={taskId:task.id,attemptId:task.activeAttemptId,claimToken:randomUUID(),workerId:'radar-test'};l.mutateProduction('claimTask',identity);
 l.mutateProduction('submitTask',{...identity,result:{summary:'人工来源',artifacts:[{id:randomUUID(),kind:'research',title:'雷达',text:'人工证据',assetHash:null,data:{radar:{schemaVersion:1,query,collectedAt:'2026-10-27T00:00:00.000Z',candidates:[{platform:'抖音',sourceId:'123',url:'https://www.douyin.com/video/123',title:'测试',author:{followers:null},metrics:{likes:200},publishedAt:null,evidence:['缺少粉丝与日期，不判定达标']}]}}}]}});
 let p=await c.readProduction(),a=p.tasks[0].attempts[0];p=await c.actProductionTask({action:'accept',taskId:task.id,attemptId:a.id,receiptHash:a.receipt.sha256,expectedToken:p.editToken});p=await c.adoptRadarResult({taskId:task.id,attemptId:a.id,receiptHash:a.receipt.sha256,expectedToken:p.editToken});const r=p.reports[0];
 assert.equal(r.meta.radar.candidates[0].eligibility,'unknown');let lose=true;const real=c.worker;c.worker={call:async(op,args)=>{const result=await real.call(op,args);if(op==='productionMutate'&&lose){lose=false;throw Object.assign(Error('lost reply'),{code:'WORKER_EXIT'});}return result;}};
 await assert.rejects(c.decideRadarCandidate({reportId:r.id,candidateId:r.meta.radar.candidates[0].id,decision:'add-topic',expectedToken:p.editToken}),{code:'WORKER_EXIT'});assert.equal((await c.readProductionPending()).pending,true);
 p=await c.recoverProductionPending({action:'retry'});assert.equal(p.creations.length,1);assert.equal(l.listContents().length,1);assert.equal((await c.readProductionPending()).pending,false);assert.equal(l.readContent(p.creations[0].contentId).body,'');
});

test('controller recovery completes the canonical reference after a parent receipt exists and preserves intervening creation edits',async t=>{
 const {controller:c,library:l}=await fixture(t,{budget:0});t.after(()=>__testing.setHook(undefined));
 const created=await c.createRadarTask(query),task=created.snapshot.tasks[0],identity={taskId:task.id,attemptId:task.activeAttemptId,claimToken:randomUUID(),workerId:'radar-recovery-test'};l.mutateProduction('claimTask',identity);
 l.mutateProduction('submitTask',{...identity,result:{summary:'人工来源',artifacts:[{id:randomUUID(),kind:'research',title:'雷达',text:'原始证据',assetHash:null,data:{radar:{schemaVersion:1,query,collectedAt:'2026-10-27T00:00:00.000Z',candidates:[{platform:'抖音',sourceId:'123',url:'https://www.douyin.com/video/123',title:'测试',author:{followers:null},metrics:{likes:200},publishedAt:null,evidence:['原始链接；指标尚待核验']}]}}}]}});
 let p=await c.readProduction(),a=p.tasks[0].attempts[0];p=await c.actProductionTask({action:'accept',taskId:task.id,attemptId:a.id,receiptHash:a.receipt.sha256,expectedToken:p.editToken});p=await c.adoptRadarResult({taskId:task.id,attemptId:a.id,receiptHash:a.receipt.sha256,expectedToken:p.editToken});const report=p.reports[0];
 let childInterrupted=false;__testing.setHook(e=>{if(e.phase==='afterJournal'&&!childInterrupted){childInterrupted=true;throw new Error('interrupt topic child');}});
 await assert.rejects(c.decideRadarCandidate({reportId:report.id,candidateId:report.meta.radar.candidates[0].id,decision:'add-topic',expectedToken:p.editToken}));__testing.setHook(undefined);
 const pending=structuredClone(c.binding.productionPending),reopened=openLibrary(l.info.root),contentId=reopened.listContents()[0].id;
 reopened.mutateProduction('ensureCreation',{contentId,expectedToken:reopened.readProduction().editToken});let state=reopened.readProductionCreation(contentId);
 const reference={id:randomUUID(),url:'https://example.com/own',title:'用户参考',platform:'人工',originalText:'自有材料',correctedText:'',segments:[],corrections:[],analysis:'已有参考分析',mediaAssetHash:null,subtitleAssetHash:null};
 reopened.mutateProduction('saveCreation',{contentId,expectedToken:state.productionToken,expectedContentToken:state.content.editToken,patch:{narrative:'用户叙事一',references:[reference]}});
 const referenceMutation=radarId(`radar-reference-merge:${pending.mutationId}`);let appendInterrupted=false;
 __testing.setHook(e=>{if(e.phase==='beforeJournal'&&e.mutationId===referenceMutation){appendInterrupted=true;throw new Error('interrupt source reference before publication');}});
 await assert.rejects(c.recoverProductionPending({action:'retry'}));__testing.setHook(undefined);
 assert.equal(appendInterrupted,true);assert.equal(reopened.queryMutation(pending.mutationId).objectKind,'workspace');assert.equal((await c.readProductionPending()).pending,true);assert.deepEqual(c.binding.productionPending,pending);
 state=reopened.readProductionCreation(contentId);assert.equal(state.creation.references.length,1);
 reopened.mutateProduction('saveCreation',{contentId,expectedToken:state.productionToken,expectedContentToken:state.content.editToken,patch:{narrative:'用户在parent提交后继续编辑的叙事'}});
 p=await c.recoverProductionPending({action:'retry'});state=reopened.readProductionCreation(contentId);
 assert.equal((await c.readProductionPending()).pending,false);assert.equal(state.creation.narrative,'用户在parent提交后继续编辑的叙事');assert.deepEqual(state.creation.references.find(x=>x.id===reference.id),reference);assert.equal(state.creation.references.filter(x=>x.url==='https://www.douyin.com/video/123').length,1);assert.equal(state.content.body,'');assert.equal(p.creations.length,1);assert.equal(p.reports[0].meta.radar.candidates[0].topicId,contentId);
});


test('multi-platform desktop freezes all selections and custom ranges while retaining one global request budget',async t=>{
 const {controller:c}=await fixture(t,{budget:20});
 const multi={...query,platform:'小红书',platforms:['小红书','抖音'],sampleLimit:12,lookbackDays:730};
 assert.doesNotThrow(()=>validateInput('createRadarTask',multi));
 const task=(await c.createRadarTask(multi)).snapshot.tasks.at(-1);
 assert.deepEqual(task.request.parameters.query,multi);assert.deepEqual(task.request.parameters.operations,['xhs-search','xhs-profile','douyin-search','profile']);assert.equal(task.request.budget.amount,4);
 const manual=(await c.createRadarTask({...multi,platform:'YouTube',platforms:['YouTube','Telegram']})).snapshot.tasks.at(-1);
 assert.equal(manual.request.budget.amount,0);assert.deepEqual(manual.request.tools,[]);
 const {controller:limited}=await fixture(t,{budget:2});assert.equal((await limited.createRadarTask(multi)).snapshot.tasks.at(-1).request.budget.amount,2);
});

test('XHS and Douyin profiles stay bound to their own sampled search authors and survive broker restart',async t=>{
 const f=await fixture(t),multi={...query,platforms:['抖音','小红书'],sampleLimit:2},created=await f.controller.createRadarTask(multi),task=created.snapshot.tasks[0],identity={taskId:task.id,attemptId:task.activeAttemptId,claimToken:randomUUID(),workerId:'multi-radar-test'};f.library.mutateProduction('claimTask',identity);
 const source=new URL('../../docs/verification/2026-10-27-live-services/tikhub-all-after-recharge/',import.meta.url),read=async op=>JSON.parse(await fs.readFile(new URL(`${op}.fixture.json`,source),'utf8'));
 const dy=await read('douyin-search'),xhs=await read('xhs-search'),dyId='1'.repeat(24),xhsId='2'.repeat(24),outsideQuota='3'.repeat(24);
 dy.data.business_data[0].data.aweme_info.author={sec_uid:dyId};xhs.data.data.items[0].note.user.userid=xhsId;xhs.data.data.items[1].note.user.userid=outsideQuota;
 const encryption={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()},settings=new ServiceSettingsStore({filePath:path.join(f.dir,'settings.json'),encryption});await settings.initialize();await settings.update({values:f.values,keys:{tikhub:'test-key'}});
 const tools=new ServiceTools({settings});let invoked=0;tools.invoke=async r=>{invoked++;return r.operation==='douyin-search'?dy:r.operation==='xhs-search'?xhs:r.operation==='profile'?{data:{user:{follower_count:20}}}:{data:{data:{fans:30}}};};
 const file=path.join(f.dir,'multi-broker.json'),owner={worker:f.worker,current:()=>f.binding};let broker=productionToolBroker(owner,tools,file);await broker.start();t.after(()=>broker.stop());
 const call=(operation,id,extra={})=>callServiceTool(file,{...identity,requestId:randomUUID(),tool:'tikhub',operation,id,...extra});
 await call('douyin-search',multi.direction,{search:radarSearchFilters(multi)});
 await assert.rejects(call('xhs-profile',dyId),{code:'RADAR_AUTHOR_FORBIDDEN'});
 await call('xhs-search',multi.direction,{search:radarSearchFilters(multi)});
 const costs=f.library.readProduction().costs;assert.deepEqual(costs[0].usage.radarAuthorIds,[dyId]);assert.deepEqual(costs[1].usage.radarAuthorIds,[xhsId]);
 await broker.stop();broker=productionToolBroker(owner,tools,file);await broker.start();
 for(const [operation,id]of [['profile',xhsId],['xhs-profile',dyId],['xhs-profile',outsideQuota]])await assert.rejects(call(operation,id),{code:'RADAR_AUTHOR_FORBIDDEN'});
 await call('profile',dyId);await call('xhs-profile',xhsId);assert.equal(invoked,4);assert.equal(f.library.readProduction().costs.reduce((n,c)=>n+c.amount,0),4);
});

test('XHS account analysis freezes the correct capability and never enables Douyin comments',async t=>{
 const f=await fixture(t);f.values.commentsEnabled=true;let snapshot=await f.controller.readProduction();snapshot=await f.controller.mutateProduction({op:'saveAccount',input:{name:'XHS fixture',platform:'小红书',url:'https://www.xiaohongshu.com/user/profile/'+'1'.repeat(24),note:'fixture only',tags:[],images:[],reportIds:[],expectedToken:snapshot.editToken},mutationId:randomUUID()});
 const account=snapshot.accounts.at(-1),created=await f.controller.startProductionTask({kind:'analysis',title:'XHS capability',prompt:'fixture only',mode:'simple',comments:true,accountId:account.id}),task=created.snapshot.tasks.at(-1);
 assert.equal(task.request.parameters.platformCollection,'xiaohongshu');assert.equal(task.request.parameters.comments,false);assert(task.request.tools.includes('tikhub'));
 const identity={taskId:task.id,attemptId:task.activeAttemptId,claimToken:randomUUID(),workerId:'xhs-account-test'};f.library.mutateProduction('claimTask',identity);
 const encryption={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()},settings=new ServiceSettingsStore({filePath:path.join(f.dir,'xhs-settings.json'),encryption});await settings.initialize();await settings.update({values:f.values,keys:{tikhub:'fixture-key'}});
 const tools=new ServiceTools({settings});let calls=[];tools.invoke=async request=>{calls.push(request.operation);return{data:{data:{fans:5}}};};const file=path.join(f.dir,'xhs-broker.json'),broker=productionToolBroker({worker:f.worker,current:()=>f.binding},tools,file);await broker.start();t.after(()=>broker.stop());
 const call=operation=>callServiceTool(file,{...identity,requestId:randomUUID(),tool:'tikhub',operation,id:operation.endsWith('search')?'fixture':'1'.repeat(24)});
 for(const operation of ['douyin-search','profile','user-posts','video','comments','user-search'])await assert.rejects(call(operation),{code:'PLATFORM_OPERATION_FORBIDDEN'});
 await call('xhs-search');await call('xhs-profile');assert.deepEqual(calls,['xhs-search','xhs-profile']);
});
