import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createLibrary,openLibrary,backupLibrary,restoreBackup} from '../index.mjs';
import {validateProductionMetadata,emptyProduction} from '../production.mjs';
import {randomUUID} from 'node:crypto';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY9sAAAAASUVORK5CYII=','base64');
function fixture(t){const parent=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'nova-avatar-'));t.after(()=>fs.rmSync(parent,{recursive:true,force:true}));const l=createLibrary(path.join(parent,'library')),source=path.join(parent,'avatar.png');fs.writeFileSync(source,png);const avatar=l.importAsset(source,{purpose:'photo'});const save=(input,token=l.readProduction().editToken)=>l.mutateProduction('saveAccount',{name:'在下小曾',platform:'抖音',url:'',note:'资料',tags:[],images:[],reportIds:[],...input,expectedToken:token});return {parent,l,avatar,save};}
test('legacy accounts without avatar remain readable; avatar saves survive old-client edits and stale CAS cannot replace them',t=>{const {l,avatar,save}=fixture(t);let p=save({});assert.equal(p.accounts[0].avatarAssetHash??null,null);const legacy=p.accounts[0],stale=p.editToken,oldRecord=structuredClone(legacy);delete oldRecord.avatarAssetHash;assert.doesNotThrow(()=>validateProductionMetadata({schemaVersion:2,production:{...emptyProduction(),accounts:[oldRecord]}},'workspace',(code,message)=>{throw Object.assign(new Error(message),{code});}));p=save({id:legacy.id,avatarAssetHash:avatar.assetHash});assert.equal(p.accounts[0].avatarAssetHash,avatar.assetHash);assert.throws(()=>save({id:legacy.id,avatarAssetHash:null},stale),{code:'CONFLICT'});p=save({id:legacy.id,note:'旧客户端仍可修改备注'});assert.equal(p.accounts[0].avatarAssetHash,avatar.assetHash);assert.equal(openLibrary(l.info.root).readProduction().accounts[0].avatarAssetHash,avatar.assetHash);p=save({id:legacy.id,avatarAssetHash:null});assert.equal(p.accounts[0].avatarAssetHash,null);});
test('avatar asset is checked, missing originals stay editable and backup/restore retains an avatar absent from screenshots',t=>{const {parent,l,avatar,save}=fixture(t);const p=save({avatarAssetHash:avatar.assetHash}),id=p.accounts[0].id;assert.equal(p.accounts[0].images.length,0);const backup=path.join(parent,'backup'),restored=path.join(parent,'restored');backupLibrary(l.info.root,backup);restoreBackup(backup,restored);const other=openLibrary(restored);assert.equal(other.readProduction().accounts[0].avatarAssetHash,avatar.assetHash);assert.deepEqual(other.readAsset(avatar.assetHash).data,png);const target=path.join(l.info.root,'资产','sha256',avatar.assetHash.slice(0,2),avatar.assetHash);fs.unlinkSync(target);assert.deepEqual(l.readProduction().missingAssetHashes,[avatar.assetHash]);assert.equal(save({id,note:'图片缺失时保留引用'}).accounts[0].avatarAssetHash,avatar.assetHash);assert.throws(()=>save({id,avatarAssetHash:'a'.repeat(64)}));const source=path.join(parent,'report.html');fs.writeFileSync(source,'<html><body>Not an avatar</body></html>');const report=l.importAsset(source,{purpose:'production-report'});assert.throws(()=>save({id,avatarAssetHash:report.assetHash}),{code:'INVALID_INPUT'});});

test('reference source bytes in saved creation and submitted candidates are checked and backed up independently', t => {
    const {parent, l} = fixture(t), content = l.createContent({title: '源资产', body: '正文'});
    const mutate = (op, input) => l.mutateProduction(op, {...input, expectedToken: l.readProduction().editToken});
    mutate('ensureCreation', {contentId: content.id});
    const source = path.join(parent, 'voice.wav'), wav = Buffer.alloc(44);
    wav.write('RIFF'); wav.write('WAVE', 8); fs.writeFileSync(source, wav);
    const media = l.importAsset(source, {purpose: 'production-reference'});
    const subtitleSource = path.join(parent, 'new.srt'), subtitleText = '1\n00:00:00,000 --> 00:00:01,000\n真实字幕';
    fs.writeFileSync(subtitleSource, subtitleText);
    const subtitle = l.importAsset(subtitleSource, {purpose: 'production-reference'});
    const reference = {id: randomUUID(), url: null, title: '参考', platform: '', originalText: '', correctedText: '', segments: [], corrections: [], analysis: '', mediaAssetHash: media.assetHash, subtitleAssetHash: null};
    const saveReferences = references => {
        const state = l.readProductionCreation(content.id);
        l.saveProductionDraft(content.id, {
            body: state.content.body, expectedBodyHash: state.content.bodyHash,
            expectedProductionToken: state.productionToken, creationPatch: {references}
        }, state.content.editToken);
    };
    // Library import stores bytes; the user must separately authorize their source reference.
    saveReferences([{...reference, subtitleAssetHash: subtitle.assetHash}]);
    const task = mutate('createTask', {kind: 'transcription', title: '字幕候选', prompt: '候选', contentId: content.id, host: 'codex'}).tasks.at(-1);
    const identity = {taskId: task.id, attemptId: task.activeAttemptId, workerId: 'test', claimToken: randomUUID()};
    mutate('claimTask', identity);
    mutate('submitTask', {...identity, result: {summary: '新字幕未采用', artifacts: [{
        id: randomUUID(), kind: 'transcript', title: '候选', text: '字幕', assetHash: null,
        data: {references: [{...reference, subtitleAssetHash: subtitle.assetHash}]}
    }]}});
    // Keep the submitted candidate unaccepted and remove this source from the current draft.
    // Backup and missing-byte checks must still retain the candidate's independent reference.
    saveReferences([reference]);
    const assertCandidateOnlySubtitle = lib => {
        const state = lib.readProductionCreation(content.id), pending = lib.readProduction().tasks.find(t => t.id === task.id).attempts[0];
        assert.equal(state.creation.references[0].mediaAssetHash, media.assetHash);
        assert.equal(state.creation.references[0].subtitleAssetHash, null);
        assert.equal(pending.status, 'submitted');
        assert.equal(pending.result.artifacts[0].data.references[0].subtitleAssetHash, subtitle.assetHash);
    };
    assertCandidateOnlySubtitle(l);
    const backup = path.join(parent, 'reference-backup'), restored = path.join(parent, 'reference-restored');
    backupLibrary(l.info.root, backup); restoreBackup(backup, restored);
    const reopened = openLibrary(restored);
    assertCandidateOnlySubtitle(reopened);
    assert.equal(reopened.readAsset(subtitle.assetHash).data.toString(), subtitleText);
    for (const hash of [media.assetHash, subtitle.assetHash]) fs.unlinkSync(path.join(l.info.root, '资产', 'sha256', hash.slice(0, 2), hash));
    assert.deepEqual(new Set(l.readProduction().missingAssetHashes), new Set([media.assetHash, subtitle.assetHash]));
});
