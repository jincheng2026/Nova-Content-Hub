import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createVault,createVaultDocument,saveVaultDocument} from '../../vault/index.mjs';
import {openLibrary} from '../index.mjs';
import {savePositioningCheckpoint} from '../positioning-checkpoint.mjs';
import {verifyVaultProductionArchive} from '../production-vault-archive.mjs';
import {businessSkillForTask} from '../production-creator-context.mjs';

function fixture(t){
    const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'nova-vault-production-'));
    t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    const binding=createVault(root),library=openLibrary(binding.root);
    return {root,binding,library};
}
function start(library,{workflow='content-creation',contentId=null}={}){
    const snapshot=library.mutateProduction('createTask',{kind:workflow==='topic-suggestion'?'research':'writing',title:'基于已保存资料继续',prompt:'使用本次资料，遵守公开边界。',contentId,parameters:{workflow},tools:['tikhub'],budget:{amount:5,currency:'REQ'},expectedToken:library.readProduction().editToken});
    return snapshot.tasks.at(-1);
}
function claim(library,task){
    const identity={taskId:task.id,attemptId:task.activeAttemptId,workerId:'fixture-worker',claimToken:randomUUID()};
    library.mutateProduction('claimTask',identity);
    return identity;
}
test('account analysis selects a research method while video analysis stays in writing',()=>{
    assert.equal(businessSkillForTask('analysis',{},randomUUID()).id,'jc-media-research');
    assert.equal(businessSkillForTask('analysis',{}).id,'jc-video-analysis');
    assert.throws(()=>businessSkillForTask('analysis',{businessSkill:'jc-video-analysis'},randomUUID()),{code:'INVALID_INPUT'});
});
test('creator positioning is frozen in a task while new tasks use the updated source',t=>{
    const {binding,library}=fixture(t);
    const original=createVaultDocument(binding.root,{section:'profile',title:'定位总览',text:'# 定位总览\n主要读者：刚开始实践的人\n公开边界：客户名不可公开。'},{mutationId:randomUUID()});
    const content=library.createContent({title:'',body:'我提供了一份真实实践资料，暂未定题。'});
    const first=start(library,{contentId:content.id});
    assert(first.request.parameters.creatorContext.vault.positioning.some(d=>d.text.includes('客户名不可公开')));
    saveVaultDocument(binding.root,{id:original.document.id,expectedHash:original.document.hash,text:'# 定位总览\n主要读者：有经验的实践者\n公开边界：客户名不可公开。'},{mutationId:randomUUID()});
    const reread=library.readProductionContext(first.id);
    assert.equal(reread.task.requestHash,first.requestHash);
    assert.equal(reread.creatorContext.sha256,first.request.parameters.creatorContext.sha256);
    const second=start(library,{contentId:content.id});
    assert.notEqual(second.request.parameters.creatorContext.sha256,first.request.parameters.creatorContext.sha256);
});
test('positioning and topic suggestions have no collection tools or budget',t=>{
    const {library}=fixture(t);
    for(const workflow of ['positioning-interview','topic-suggestion']){
        const task=start(library,{workflow});
        assert.deepEqual(task.request.tools,[]);
        assert.equal(task.request.budget.amount,0);
        assert.equal(task.request.parameters.comments,false);
        assert.equal(task.request.parameters.businessSkill,workflow==='positioning-interview'?'xindao-interview':'xindao-xuanti');
    }
});
test('confirmed positioning checkpoints persist, replay across later stages and reject changed intentions',t=>{
    const {root,library}=fixture(t),task=start(library,{workflow:'positioning-interview'}),identity=claim(library,task);
    const raw={...identity,mutationId:randomUUID(),stage:'personal',text:'我仍在学习，已完成一次真实项目。',confirmation:'对，客户名称不能公开。',confirmedAt:'2026-10-27T16:10:00.000Z'};
    delete raw.taskId;delete raw.attemptId;
    const save=input=>savePositioningCheckpoint({library,context:library.readProductionContext(task.id),raw:input});
    const first=save(raw);
    assert.equal(first.completedTask,false);
    assert(fs.readFileSync(path.join(root,first.document.relativePath),'utf8').includes(raw.text));
    const account=save({...raw,mutationId:randomUUID(),stage:'account',text:'帮刚起步的人完成第一件实际作品。',documentId:first.document.id,expectedHash:first.document.hash});
    assert(account.text.includes('## 账号要说什么'));
    const replay=save(raw);
    assert.equal(replay.document.hash,first.document.hash);
    assert(fs.readFileSync(path.join(root,first.document.relativePath),'utf8').includes('## 账号要说什么'));
    assert.throws(()=>save({...raw,text:'没有确认的另一个说法'}),{code:'INVALID_INPUT'});
    assert.throws(()=>save({...raw,mutationId:randomUUID(),stage:'content',documentId:first.document.id,expectedHash:first.document.hash}),{code:'CONFLICT'});
});
test('a submitted candidate is archived inside its content directory and tampering is preserved',t=>{
    const {root,binding,library}=fixture(t),content=library.createContent({title:'',body:'先记录我的资料。'}),task=start(library,{contentId:content.id}),identity=claim(library,task);
    const submitted=library.mutateProduction('submitTask',{...identity,result:{summary:'候选稿已交回',artifacts:[{id:randomUUID(),kind:'draft',title:'候选正文',text:'这是候选，不替换当前稿。',assetHash:null,data:null}]}},{mutationId:randomUUID()});
    assert(!submitted.archiveWarnings?.length,submitted.archiveWarnings?.join('\n'));
    const archive=library.rebuildProductionArchive(task.id);
    assert(archive.directory.startsWith(path.join(root,'05_内容草稿')+path.sep));
    assert.equal(verifyVaultProductionArchive(binding,archive),archive.directory);
    assert.equal(library.readContent(content.id).body,'先记录我的资料。');
    fs.appendFileSync(path.join(archive.directory,'结果.md'),'\n我自己的批注');
    const rebuilt=library.rebuildProductionArchive(task.id);
    assert.equal(rebuilt.ready,false);
    assert(fs.readFileSync(path.join(archive.directory,'结果.md'),'utf8').includes('我自己的批注'));
});
