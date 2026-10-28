import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createVault,createVaultDocument} from '../../plugin-src/src/lib/vault/index.mjs';
import {openLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {productionToolBroker} from '../src/main/production-services.mts';
import {executeProduction} from '../src/main/production-worker.mts';
import {defaultServiceSettings} from '../src/shared/service-validation.ts';

function fixture(t){
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'nova-journey-authority-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const binding=createVault(root),document=createVaultDocument(binding.root,{section:'drafts',title:'有界研究',text:'冻结作者材料'},{mutationId:randomUUID()}).document,library=openLibrary(binding.root);
 const config={version:1,researchId:'authority',outputDirectory:'调研报告库/authority',route:'topic',platform:'douyin',targetIds:['AI教程'],videoIds:['123','124'],operations:['douyin-search','video'],maxRequests:2,comments:false};
 const snapshot=library.mutateProduction('startJourney',{contentId:document.contentId,host:'codex',method:'ordinary-writing',researchPlan:[config],limits:{maxRequestsTotal:2,commentsAllowed:false,mediaCount:1,mediaBytes:67108864},serviceConfig:{},expectedToken:library.readProduction().editToken}),parent=snapshot.tasks.find(task=>task.journeyState),child=snapshot.tasks.find(task=>task.journeyMember);
 const rootClaim={taskId:parent.id,attemptId:parent.activeAttemptId,claimToken:randomUUID(),workerId:'journey-authority'};library.mutateProduction('claimTask',rootClaim);
 const identity={taskId:child.id,attemptId:child.activeAttemptId,claimToken:randomUUID(),workerId:rootClaim.workerId};library.mutateProduction('claimTask',{...identity,rootClaimToken:rootClaim.claimToken});
 return {root,binding,document,library,parent,child,identity};
}

test('direct broker calls recheck the frozen journey source before any provider execution',async t=>{
 const f=fixture(t),settings={...defaultServiceSettings(),budget:{enabled:true,maxRequestsPerTask:2}};
 const tools={settings:{read:()=>({values:settings}),secret:()=> 'fixture-only-key'},execute:async(_request,hooks)=>{await hooks.beforeExecute({service:'tikhub',requests:1});throw Object.assign(new Error('Provider execution must not occur'),{code:'PROVIDER_REACHED'});}};
 const broker=productionToolBroker({current:()=>f.binding,worker:{call:(op,args)=>executeProduction(op,args,'disabled')}},tools,'/unused/fixture-only');
 fs.writeFileSync(path.join(f.root,f.document.relativePath),'作者已修改原始材料');
 await assert.rejects(broker.options.execute({...f.identity,requestId:randomUUID(),tool:'tikhub',operation:'douyin-search',id:'AI教程'}),{code:'SOURCE_CHANGED'});
 assert.equal(f.library.readProduction().costs.length,0);
});

test('direct worker media import cannot publish a source asset after its journey source changes',async t=>{
 const f=fixture(t),file=path.join(f.root,'synthetic.wav'),wav=Buffer.alloc(44);wav.write('RIFF');wav.write('WAVE',8);fs.writeFileSync(file,wav);
 const before=fs.readdirSync(path.join(f.binding.root,'资产/sha256'));
 fs.writeFileSync(path.join(f.root,f.document.relativePath),'作者已修改原始材料');
 await assert.rejects(executeProduction('productionMediaGrant',{binding:f.binding,source:file,mutationId:randomUUID(),input:{...f.identity,requestId:randomUUID(),sourceReceiptId:randomUUID(),sourceRequestId:randomUUID(),requestHash:f.child.requestHash,videoId:'123',canonicalUrl:'https://www.douyin.com/video/123',responseHash:'1'.repeat(64)}},'disabled'),{code:'SOURCE_CHANGED'});
 assert.deepEqual(fs.readdirSync(path.join(f.binding.root,'资产/sha256')),before);
});

test('direct grant registration obeys the journey media allowance instead of the child default of three',t=>{
 const f=fixture(t),file=path.join(f.root,'synthetic.wav'),wav=Buffer.alloc(44);wav.write('RIFF');wav.write('WAVE',8);fs.writeFileSync(file,wav);const asset=f.library.importAsset(file,{purpose:'production-reference'});
 const grant=videoId=>{const source={sourceReceiptId:randomUUID(),sourceRequestId:randomUUID(),requestHash:f.child.requestHash,videoId,canonicalUrl:'https://www.douyin.com/video/'+videoId,responseHash:'1'.repeat(64)};
  f.library.reserveProductionTool({...f.identity,requestId:source.sourceRequestId,service:'tikhub'});f.library.mutateProduction('recordCost',{...f.identity,requestId:source.sourceRequestId,status:'measured',amount:1,usage:{ok:true,operation:'video',id:videoId,...source}});
  return ()=>f.library.mutateProduction('registerMediaGrant',{...f.identity,requestId:randomUUID(),...source,assetHash:asset.assetHash});};
 grant('123')();assert.throws(grant('124'),{code:'MEDIA_DOWNLOAD_LIMIT'});assert.equal(f.library.readProductionContext(f.child.id).attempt.mediaGrants.length,1);
});
