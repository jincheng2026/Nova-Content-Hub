import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {openLibrary, upgradeLibrary} from '../../file-library/index.mjs';

const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nch-v1-compatibility-'));
try {
    const project = fileURLToPath(new URL('../../', import.meta.url));
    const oldCommit = '02ab0f4';
    const oldFile = path.join(parent, 'actual-v1-reader.mjs');
    fs.writeFileSync(oldFile, execFileSync('git', ['show', `${oldCommit}:file-library/index.mjs`], {cwd: project}));
    const old = await import(pathToFileURL(oldFile));
    const root = path.join(parent, '库');
    const library = old.createLibrary(root);
    const content = library.createContent({title: 'compatibility', body: '# keep original bytes\r\n'});
    const base = path.join(root, '系统（别动）', '事务');
    const descriptor = path.join(root, '内容库.json');
    const oldHandle = old.openLibrary(root);
    assert.equal(oldHandle.readContent(content.id).body, content.body);
    const unchanged = fs.readFileSync(descriptor);
    assert.throws(() => openLibrary(root), error => error.code === 'UPGRADE_REQUIRED');
    assert.deepEqual(fs.readFileSync(descriptor), unchanged);
    fs.mkdirSync(path.join(base, '待恢复'));
    fs.mkdirSync(path.join(base, '已提交'));
    assert.throws(() => oldHandle.updateContent(content.id, {body: 'must not write'}, content.editToken), error => error.code === 'CORRUPT');
    const upgraded = upgradeLibrary(root);
    assert.equal(upgraded.info.libraryId, library.info.libraryId);
    assert.equal(upgraded.readContent(content.id).body, content.body);
    assert.throws(() => oldHandle.updateContent(content.id, {body: 'must not write'}, content.editToken), error => error.code === 'FORMAT_UNSUPPORTED');
    console.log(JSON.stringify({
        oldReaderCommit: oldCommit, oldV1Read: 'passed', newV1Open: 'UPGRADE_REQUIRED',
        oldWriteDuringUpgrade: 'CORRUPT', oldWriteAfterUpgrade: 'FORMAT_UNSUPPORTED',
        upgradedSchema: upgraded.info.schemaVersion, identityAndBodyPreserved: true
    }, null, 2));
} finally {
    fs.rmSync(parent, {recursive: true, force: true});
}
