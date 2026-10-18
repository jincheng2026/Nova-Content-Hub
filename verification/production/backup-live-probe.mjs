import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {openLibrary} from '../../file-library/index.mjs';

const project = fileURLToPath(new URL('../../', import.meta.url));
const probe = fs.realpathSync(process.argv[2]);
assert.equal(path.dirname(probe), fs.realpathSync(path.join(project, '.local-probes')));
const config = JSON.parse(fs.readFileSync(path.join(probe, 'probe.json')));
assert.equal(fs.realpathSync(config.libraryRoot), path.join(probe, 'library'));
const original = openLibrary(config.libraryRoot), before = original.readContent(config.contentId);
const context = JSON.parse(fs.readFileSync(path.join(probe, 'context.json')));
assert.equal(before.candidates.length, 2);

function tree(root) {
    const entries = new Map();

    function visit(dir, relative = '') {
        for (const name of fs.readdirSync(dir).sort()) {
            const key = relative ? `${relative}/${name}` : name;
            if (key === '系统（别动）/库锁') continue;
            const file = path.join(dir, name), info = fs.lstatSync(file);
            assert.equal(info.isSymbolicLink(), false);
            entries.set(key, info.isDirectory() ? 'directory' : createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
            if (info.isDirectory()) visit(file, key);
        }
    }

    visit(root);
    return entries;
}

const sourceTree = tree(config.libraryRoot);
const outputRoot = path.join(probe, `backup-${randomUUID()}`);
fs.mkdirSync(outputRoot);
const runtimeParent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nch-live-backup-'));
const runtime = path.join(runtimeParent, 'runtime');
fs.cpSync(path.join(project, 'dist-cover-runtime/auth-required'), runtime, {recursive: true});
const cli = path.join(runtime, 'library-maintenance/cli.mjs');

function run(args) {
    const raw = execFileSync(process.execPath, [cli, ...args], {
        cwd: runtimeParent,
        env: {...process.env, NODE_PATH: ''},
        encoding: 'utf8',
        timeout: 120000
    });
    const output = JSON.parse(raw);
    assert.equal(output.ok, true, output.message);
    return output.result;
}

try {
    const backupDir = path.join(outputRoot, 'snapshot'), restoredRoot = path.join(outputRoot, 'restored');
    const backup = run(['backup', '--library', config.libraryRoot, '--destination', backupDir]);
    const checked = run(['verify', '--backup', backupDir]);
    const result = run(['restore', '--backup', backupDir, '--destination', restoredRoot]);
    const restored = openLibrary(restoredRoot), after = restored.readContent(config.contentId);
    assert.deepEqual(after, before);
    const backupTree = tree(path.join(backupDir, 'data')), restoredTree = tree(restoredRoot);
    assert.deepEqual(backupTree, sourceTree);
    for (const [name, value] of sourceTree) assert.equal(restoredTree.get(name), value, name);
    const images = before.candidates.map(candidate => {
        const first = original.readAsset(candidate.assetHash), second = restored.readAsset(candidate.assetHash);
        assert.deepEqual(second.data, first.data);
        assert.equal(createHash('sha256').update(second.data).digest('hex'), candidate.assetHash);
        return {candidateId: candidate.id, assetHash: candidate.assetHash, bytes: second.bytes, unchanged: true};
    });
    const receipt = fs.readFileSync(path.join(probe, 'live-receipt.json'));
    const replay = await restored.commitCoverAttempt(config.contentId, context.request.requestId, context.attempt.attemptId, receipt);
    assert.deepEqual(replay.candidateIds, before.candidates.map(item => item.id));
    assert.deepEqual(original.readContent(config.contentId), before);
    assert.deepEqual(tree(config.libraryRoot), sourceTree);
    const evidence = {
        checkedAt: new Date().toISOString(),
        platform: process.platform,
        arch: process.arch,
        source: 'isolated current Codex thread live image generation probe',
        runtime: 'standalone auth-required maintenance CLI',
        backupId: backup.backupId,
        libraryId: config.libraryId,
        treeHash: checked.treeHash,
        counts: backup.counts,
        contentBytesAndMetadataUnchanged: true,
        sourceUnchanged: true,
        images,
        receiptReplayPreservedIds: true,
        interruptedAttempts: result.interruptedAttempts,
        originalInputsPreserved: true,
        originalTreeEntriesCompared: sourceTree.size,
        windowsTested: false,
        secondVolumeTested: false,
        powerLossTested: false,
        electronTested: false
    };
    fs.writeFileSync(path.join(project, 'verification/production/2026-10-17-live-cover-backup.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify(evidence, null, 2));
} finally {
    fs.rmSync(runtimeParent, {recursive: true, force: true});
}
