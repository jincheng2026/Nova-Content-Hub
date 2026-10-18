import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {backupLibrary, verifyBackup, restoreBackup, openLibrary, upgradeLibrary} from '../../src/lib/file-library/index.mjs';

const project = fileURLToPath(new URL('../../../', import.meta.url));
const probe = fs.realpathSync(process.argv[2]);
assert.equal(path.dirname(probe), fs.realpathSync(path.join(project, '.local-probes')));
const snapshot = fs.realpathSync(process.argv[3]);
assert.ok(snapshot.startsWith(probe + path.sep));
const config = JSON.parse(fs.readFileSync(path.join(probe, 'probe.json')));
const sourceDescriptor = fs.readFileSync(path.join(config.libraryRoot, '内容库.json'));
assert.equal(JSON.parse(sourceDescriptor).schemaVersion, 4);
const contentFile = path.join('内容', config.contentId, '内容.json');
const originalContent = fs.readFileSync(path.join(config.libraryRoot, contentFile));
const context = JSON.parse(fs.readFileSync(path.join(probe, 'context.json')));
const receipt = fs.readFileSync(path.join(probe, 'live-receipt.json'));
const temp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nch-v4-backup-'));
try {
    assert.equal(verifyBackup(snapshot).manifest.source.schemaVersion, 4);
    const restoredRoot = path.join(temp, 'restored-v4');
    restoreBackup(snapshot, restoredRoot);
    assert.equal(JSON.parse(fs.readFileSync(path.join(restoredRoot, '内容库.json'))).schemaVersion, 4);
    assert.throws(() => openLibrary(restoredRoot), error => error.code === 'UPGRADE_REQUIRED');
    assert.deepEqual(fs.readFileSync(path.join(restoredRoot, contentFile)), originalContent);
    const upgraded = upgradeLibrary(restoredRoot);
    assert.equal(upgraded.info.schemaVersion, 5);
    assert.deepEqual(fs.readFileSync(path.join(restoredRoot, contentFile)), originalContent);
    const content = upgraded.readContent(config.contentId);
    const candidates = content.candidates.map(candidate => ({id: candidate.id, hash: candidate.assetHash}));
    const replay = await upgraded.commitCoverAttempt(config.contentId, context.request.requestId, context.attempt.attemptId, receipt);
    assert.deepEqual(replay.candidateIds, candidates.map(item => item.id));
    const nextBackup = path.join(temp, 'schema5-backup');
    backupLibrary(restoredRoot, nextBackup);
    assert.equal(verifyBackup(nextBackup).manifest.source.schemaVersion, 5);
    const nextRoot = path.join(temp, 'schema5-restored');
    restoreBackup(nextBackup, nextRoot);
    const next = openLibrary(nextRoot);
    for (const candidate of candidates) {
        const bytes = next.readAsset(candidate.hash).data;
        assert.equal(createHash('sha256').update(bytes).digest('hex'), candidate.hash);
        assert.deepEqual(bytes, upgraded.readAsset(candidate.hash).data);
    }
    assert.deepEqual(next.readContent(config.contentId), upgraded.readContent(config.contentId));
    assert.equal(next.readLibrarySettings().channels.length, 5);
    assert.deepEqual(fs.readFileSync(path.join(config.libraryRoot, '内容库.json')), sourceDescriptor);
    assert.deepEqual(fs.readFileSync(path.join(config.libraryRoot, contentFile)), originalContent);
    const result = {
        checkedAt: new Date().toISOString(), platform: process.platform, arch: process.arch,
        backupSchema4Verified: true, restoredSchemaPreserved: 4, explicitUpgradeRequired: true,
        explicitlyUpgradedTo: 5, originalLibraryUnchanged: true, originalContentBytesPreserved: true,
        realGeneratedCandidateIds: candidates.map(item => item.id), realImagesBytesPreserved: true,
        receiptReplayPreservedIds: true, schema5BackupRestore: true, defaultChannels: 5,
        windowsTested: false, electronTested: false
    };
    fs.writeFileSync(path.join(project, 'docs/verification/production/2026-10-18-directory-v4-backup-to-v5.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
} finally {
    fs.rmSync(temp, {recursive: true, force: true});
}
