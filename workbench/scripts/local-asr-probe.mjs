import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {ServiceSettingsStore} from '../src/main/service-settings.mts';
import {ServiceTools} from '../src/main/service-tools.mts';
import {productionToolBroker} from '../src/main/production-services.mts';
import {executeProduction} from '../src/main/production-worker.mts';
import {defaultServiceSettings} from '../src/shared/service-validation.ts';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {callServiceTool} from '../../plugin-src/src/lib/service-tools/client.mjs';

// Uses real installed dependencies and model, real worker validation and real
// broker transport. All settings/content are temporary; no user keys are read.
const [python, model, evidence] = process.argv.slice(2);
if (process.platform !== 'darwin' || !python || !model || !evidence) throw new Error('Usage on macOS: node workbench/scripts/local-asr-probe.mjs /absolute/python /absolute/model /absolute/evidence.json');
const exec = promisify(execFile);
const temp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-local-asr-probe-')));
const originalHttps = https.request;
const previousEnv = {...process.env};
let broker, externalHttpsAttempts = 0;
const result = {platform: `${process.platform}-${process.arch}`, startedAt: new Date().toISOString(), python, model, inputText: '你好，这是自媒体工作台的本地语音转文字测试。今天我们学习整理内容，记录想法。'};
try {
    // Python audit hooks block and record outbound connections in every engine
    // subprocess. The broker's HTTP loopback remains available in Node.
    const audit = path.join(temp, 'network-attempts.log');
    await fs.writeFile(path.join(temp, 'sitecustomize.py'), `import sys\ndef guard(event,args):\n if event in ('socket.connect','socket.getaddrinfo'):\n  with open(${JSON.stringify(audit)},'a') as f: f.write(event+'\\n')\n  raise RuntimeError('OFFLINE_PROBE_NETWORK_BLOCKED')\nsys.addaudithook(guard)\n`);
    Object.assign(process.env, {PYTHONPATH: temp, HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', HF_HUB_DISABLE_TELEMETRY: '1'});
    https.request = () => {externalHttpsAttempts++; throw new Error('OFFLINE_PROBE_NETWORK_BLOCKED');};
    await exec('/usr/bin/say', ['-v', 'Tingting', '-r', '160', '-o', path.join(temp, 'source.aiff'), result.inputText]);
    const wav = path.join(temp, 'test.wav');
    await exec('/usr/bin/afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', path.join(temp, 'source.aiff'), wav]);
    result.audioBytes = (await fs.stat(wav)).size;
    const settings = new ServiceSettingsStore({filePath: path.join(temp, 'settings.json'), encryption: {isEncryptionAvailable: () => false, encryptString: () => {throw new Error('NO_KEYS_IN_PROBE');}, decryptString: () => {throw new Error('NO_KEYS_IN_PROBE');}}});
    await settings.initialize();
    const values = defaultServiceSettings();
    Object.assign(values.asr, {mode: 'local-only', localEngine: 'faster-whisper', localExecutable: python, localModelPath: path.join(temp, 'model-not-installed')});
    await settings.update({values});
    const tools = new ServiceTools({settings});
    const identity = () => ({taskId: randomUUID(), attemptId: randomUUID(), claimToken: randomUUID(), workerId: 'local-asr-probe', requestId: randomUUID()});
    await assert.rejects(tools.execute({...identity(), tool: 'asr', audioPath: wav, allowCloud: false}), {code: 'LOCAL_ASR_UNAVAILABLE', requestsUsed: 0});
    result.missingModelFailsClosed = true;
    values.asr.localModelPath = model;
    await settings.update({values});
    result.readiness = await tools.checkReadiness();
    assert.equal(result.readiness.localAsr.available, true);
    let started = performance.now();
    const direct = await tools.execute({...identity(), tool: 'asr', audioPath: wav, allowCloud: false});
    result.direct = {elapsedMs: Math.round(performance.now() - started), ...direct};
    assert.equal(direct.requestsUsed, 0);
    assert.match(direct.data.text, /本地|语音|工作台/);

    const lib = createLibrary(path.join(temp, 'library'));
    const mutate = (op, input) => lib.mutateProduction(op, {expectedToken: lib.readProduction().editToken, ...input});
    const content = lib.createContent({title: '合成本地语音验收', body: ''});
    mutate('ensureCreation', {contentId: content.id});
    const asset = lib.importAsset(wav, {purpose: 'production-reference'});
    mutate('saveCreation', {contentId: content.id, expectedContentToken: lib.readContent(content.id).editToken, patch: {references: [{id: randomUUID(), url: null, title: '合成测试音频', platform: '', originalText: '', correctedText: '', segments: [], corrections: [], analysis: '', mediaAssetHash: asset.assetHash, subtitleAssetHash: null}]}});
    const task = mutate('createTask', {contentId: content.id, kind: 'transcription', title: '本地ASR验收', prompt: '转写已登记合成音频', tools: ['asr'], parameters: {budgetEnabled: false}, budget: {amount: 0, currency: 'REQ'}}).tasks.at(-1);
    const claim = {taskId: task.id, attemptId: task.activeAttemptId, claimToken: randomUUID(), workerId: 'local-asr-probe'};
    lib.mutateProduction('claimTask', claim);
    const binding = {root: lib.info.root, libraryId: lib.info.libraryId, rootIdentity: lib.info.rootIdentity};
    const operations = [];
    const owner = {current: () => binding, worker: {call: async (op, args) => {operations.push(op); return executeProduction(op, args, 'disabled');}}};
    const descriptor = path.join(temp, 'broker.json');
    broker = productionToolBroker(owner, tools, descriptor);
    await broker.start();
    started = performance.now();
    const response = await callServiceTool(descriptor, {...claim, requestId: randomUUID(), tool: 'asr', audioPath: asset.assetHash, allowCloud: false});
    result.broker = {elapsedMs: Math.round(performance.now() - started), ...response, operations};
    result.costs = lib.readProduction().costs;
    assert.equal(response.requestsUsed, 0);
    assert.match(response.data.text, /本地|语音|工作台/);
    assert.equal(result.costs.length, 1);
    assert.equal(result.costs[0].status, 'measured');
    assert.equal(result.costs[0].amount, 0);
    result.pythonNetworkAttempts = (await fs.readFile(audit, 'utf8').catch(e => {if (e.code === 'ENOENT') return ''; throw e;})).trim().split('\n').filter(Boolean);
    result.externalHttpsAttempts = externalHttpsAttempts;
    assert.equal(externalHttpsAttempts, 0);
    assert.deepEqual(result.pythonNetworkAttempts, []);
    result.status = 'passed';
} catch (error) {
    result.status = 'failed';
    result.error = {code: error.code ?? error.name, message: error.message};
    process.exitCode = 1;
} finally {
    if (broker) await broker.stop();
    https.request = originalHttps;
    process.env = previousEnv;
    await fs.rm(temp, {recursive: true, force: true});
    result.finishedAt = new Date().toISOString();
    await fs.mkdir(path.dirname(path.resolve(evidence)), {recursive: true});
    await fs.writeFile(evidence, JSON.stringify(result, null, 2) + '\n', {mode: 0o600});
    console.log(JSON.stringify(result, null, 2));
}
