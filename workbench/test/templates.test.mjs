import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {TemplateController} from '../src/main/template-controller.mts';
import {executeTemplate} from '../src/main/template-worker.mts';
import {templatePending, templateDesktopInput} from '../src/shared/template-validation.ts';
import {emptyBinding, validateBinding} from '../src/main/bindings.mts';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';

async function fixture(t) {
    const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nova-template-pending-'));
    t.after(() => fs.rmSync(parent, {recursive: true, force: true}));
    const lib = createLibrary(path.join(parent, 'library')), source = path.join(parent, 'reference.png');
    fs.writeFileSync(source, await sharp({create: {width: 12, height: 16, channels: 3, background: 'red'}}).png().toBuffer());
    const asset = lib.importAsset(source, {purpose: 'template-reference'});
    const template = lib.createTemplate({name: 'sample', definition: {}, resources: {sample: {assetHash: asset.assetHash, bytes: asset.bytes, detectedType: asset.detectedType, role: 'style'}}});
    const binding = {root: lib.info.root, libraryId: lib.info.libraryId, rootIdentity: lib.info.rootIdentity}, launches = [];
    const owner = {
        binding: {...emptyBinding(), current: binding}, authMode: 'disabled', covers: {grant: hash => `asset:${hash}`},
        current: () => binding, query: async () => null, exclusive: action => action(),
        noPending: () => {if (owner.binding.templatePending) throw Object.assign(new Error('pending'), {code: 'PENDING_MUTATION'});},
        persist: async next => {owner.binding = structuredClone(validateBinding(next));},
        worker: {call: (op, args) => executeTemplate(op, args, 'disabled')}
    };
    const controller = () => new TemplateController(owner, {readTemplateAssistantSetup: async host => ({host, ready: true, skill: 'nova-content-template-execution', reason: 'available'}), launchTemplate: async (binding, ref) => launches.push(ref)});
    const input = {templateId: template.id, version: 1, editToken: template.editToken, notes: 'fixed'};
    const legacyPending = () => {
        const attemptMutationId = randomUUID();
        return {action: 'start', input, host: 'codex', binding: {libraryId: binding.libraryId, rootIdentity: {...binding.rootIdentity}}, mutationId: attemptMutationId, attemptMutationId, requestMutationId: randomUUID(), request: null};
    };
    return {parent, lib, template, binding, owner, controller, input, legacyPending, launches};
}

for (const policy of [undefined, 'ratio-minimum']) for (const phase of ['before-request', 'after-request', 'before-attempt', 'after-attempt']) test(`persisted ${policy ?? 'legacy exact'} intent recovers lost ${phase} response without changing request`, async t => {
    const f = await fixture(t), originalCall = f.owner.worker.call;
    let saved, lost = false;
    f.owner.worker.call = async (op, args) => {
        const target = phase.endsWith('request') ? 'templateRequest' : 'templateMutate';
        if (op !== target || lost) return originalCall(op, args);
        lost = true; saved = structuredClone(args.pending);
        if (phase.startsWith('after')) await originalCall(op, args);
        throw Object.assign(new Error('lost response'), {code: 'WORKER_EXIT'});
    };
    const c = f.controller();
    if (policy === undefined) await f.owner.persist({...f.owner.binding, templatePending: f.legacyPending()});
    await assert.rejects(policy === undefined ? c.retryTemplateMutation() : c.startTemplateStudy(f.input), {code: 'WORKER_EXIT'});
    assert.equal(saved.sizePolicy, policy);
    assert.equal(Object.hasOwn(saved, 'sizePolicy'), policy !== undefined);
    const jobsBefore = f.lib.readTemplate(f.template.id).templateJobs;
    let requestBytes;
    if (jobsBefore.length) requestBytes = fs.readFileSync(path.join(f.binding.root, '模板', f.template.id, '学习任务', jobsBefore[0].id, '请求.json'));
    f.owner.worker.call = originalCall;
    const reopened = f.controller();
    if (f.owner.binding.templatePending) {
        const pending = structuredClone(f.owner.binding.templatePending);
        if (jobsBefore.length) {
            const a = await originalCall('templateRequest', {binding: f.binding, pending});
            const b = await originalCall('templateRequest', {binding: f.binding, pending});
            assert.deepEqual(a, b);
        }
        await reopened.retryTemplateMutation();
    }
    assert.equal(f.owner.binding.templatePending, null);
    const jobs = f.lib.readTemplate(f.template.id).templateJobs;
    assert.equal(jobs.length, 1); assert.equal(jobs[0].attempts.length, 1);
    const context = f.lib.readTemplateContext(f.template.id, jobs[0].id, jobs[0].attempts[0].attemptId);
    assert.equal(context.request.schemaVersion, policy === undefined ? 1 : 2);
    assert.equal(context.request.sizePolicy, policy);
    const raw = fs.readFileSync(path.join(f.binding.root, '模板', f.template.id, '学习任务', jobs[0].id, '请求.json'));
    if (requestBytes) assert.deepEqual(raw, requestBytes);
    const ref = {templateId: f.template.id, requestId: jobs[0].id, attemptId: jobs[0].attempts[0].attemptId, requestHash: jobs[0].requestHash, sourceVersion: 1, sourcePackageHash: context.request.template.packageHash};
    await reopened.retryTemplateStudy(ref);
    f.owner.binding.assistant = 'workbuddy';
    const live = f.lib.readTemplate(f.template.id).templateJobs[0].attempts.at(-1);
    await reopened.continueTemplateStudy({...ref, attemptId: live.attemptId});
    assert.deepEqual(fs.readFileSync(path.join(f.binding.root, '模板', f.template.id, '学习任务', jobs[0].id, '请求.json')), raw);
    assert.deepEqual(f.lib.readTemplate(f.template.id).templateJobs[0].attempts.map(a => [a.host, a.reason]), [['codex', 'initial'], ['codex', 'retry'], ['workbuddy', 'host-change']]);
});

test('only internal pending accepts size strategy; public template start stays exact-field IPC', async t => {
    const f = await fixture(t), old = f.legacyPending();
    for (const sizePolicy of ['exact', 'ratio-minimum']) assert.equal(templatePending({...old, sizePolicy}), true);
    assert.equal(templatePending(old), true);
    for (const sizePolicy of ['automatic', '', null, 1, undefined]) assert.equal(templatePending({...old, sizePolicy}), false);
    assert.equal(templatePending({...old, extra: true}), false);
    assert.equal(templateDesktopInput('startTemplateStudy', f.input), true);
    assert.equal(templateDesktopInput('startTemplateStudy', {...f.input, sizePolicy: 'ratio-minimum'}), false);
});

for (const ownerHost of ['codex', 'workbuddy']) for (const waitingState of ['waiting-user', 'waiting-permission']) test(`bound ${ownerHost} template continuation keeps original session and ${waitingState} without progress CAS changes`, async t => {
    const f = await fixture(t), otherHost = ownerHost === 'codex' ? 'workbuddy' : 'codex';
    f.owner.binding.assistant = ownerHost;
    const c = f.controller(), result = await c.startTemplateStudy(f.input), job = result.view.jobs[0], a = job.attempts[0], sessionId = randomUUID();
    const originalToken = f.lib.readTemplate(f.template.id).editToken;
    f.lib.reportTemplateProgress(f.template.id, job.id, a.attemptId, {host: ownerHost, requestHash: a.reference.requestHash, phase: 'reading', state: waitingState, message: '请确认模板', sessionId, expectedRevision: 0, mutationId: randomUUID()});
    f.owner.binding.assistant = otherHost;
    await c.continueBoundTemplate(a.reference);
    assert.equal(f.launches.at(-1).host, ownerHost);
    assert.equal(f.launches.at(-1).sessionId, sessionId);
    assert.equal((await c.readTemplateProgress({templateId: f.template.id})).jobs[0].attempts[0].progress.state, waitingState);
    assert.equal(f.lib.readTemplate(f.template.id).editToken, originalToken);
    await c.continueTemplateStudy(a.reference);
    const latest = (await c.readTemplateProgress({templateId: f.template.id})).jobs[0].attempts.at(-1);
    assert.equal(latest.progress, null);
    assert.notEqual(latest.attemptId, a.attemptId);
    assert.equal((await c.readTemplateProgress({templateId: f.template.id})).jobs[0].attempts.length, 2);
    assert.equal(f.launches.at(-1).host, otherHost);
    assert.equal(f.launches.at(-1).sessionId, undefined);
});
