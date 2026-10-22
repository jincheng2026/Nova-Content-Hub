import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {runtimeSourceFilter} from '../../plugin-src/scripts/build.mjs';
import {createLibrary, openLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {installBuiltins} from '../../plugin-src/src/lib/library-seed/index.mjs';
import {buildDemoLibrary} from '../scripts/build-demo-library.mjs';
import {exportColleagueDelivery} from '../scripts/export-colleague-delivery.mjs';

const project = fileURLToPath(new URL('../../', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function temporary(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-colleague-delivery-'));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    return directory;
}

test('the pre-seal source filter removes engineering material while keeping all built-in resources valid', t => {
    const parent = temporary(t);
    const resources = path.join(parent, 'bundle/plugin-src/resources');
    fs.cpSync(path.join(project, 'plugin-src/resources'), resources, {recursive: true, filter: runtimeSourceFilter});
    assert.equal(fs.existsSync(path.join(resources, 'builtin-templates/evidence')), false);
    assert.equal(fs.readdirSync(resources, {recursive: true}).some(file => path.basename(file) === 'README.md'), false);
    for (const relative of ['plugin-src/src/lib/file-library/README.md', 'plugin-src/src/lib/file-library/test', 'plugin-src/resources/.DS_Store']) assert.equal(runtimeSourceFilter(path.join(project, relative)), false);
    for (const relative of ['plugin-src/skills/nova-content-cover-execution/SKILL.md', 'plugin-src/runtime/LICENSE', 'plugin-src/resources/builtin-examples/provenance.json']) assert.equal(runtimeSourceFilter(path.join(project, relative)), true);
    const lib = createLibrary(path.join(parent, 'library'));
    installBuiltins(lib, path.join(parent, 'bundle'));
    assert.equal(lib.listTemplates().length, 5);
    assert.equal(lib.listPrompts().length, 52);
    for (const relative of ['builtin-templates', '图库']) assert.equal(fs.existsSync(path.join(resources, relative)), false, relative);
    assert.equal(runtimeSourceFilter(path.join(project, 'plugin-src/src/lib/browser-import')), false);
});

test('the writable example preserves both real covers, fictional-person disclosure and built-in library', t => {
    const directory = buildDemoLibrary(temporary(t));
    const library = openLibrary(directory);
    assert.equal(library.listTemplates().length, 5);
    assert.equal(library.listPrompts().length, 52);
    const [item] = library.listContents();
    const content = library.readContent(item.id);
    const proof = JSON.parse(fs.readFileSync(path.join(project, 'plugin-src/resources/builtin-examples/provenance.json'), 'utf8'));
    assert.equal(content.isExample, true);
    assert.match(content.body, /AI 虚构/);
    assert.match(content.body, /尚未发布/);
    assert.equal(content.candidates.length, 2);
    assert.deepEqual(content.candidates.map(candidate => candidate.assetHash), proof.hashes);
    for (const candidate of content.candidates) assert.equal(hash(library.readAsset(candidate.assetHash).data), candidate.assetHash);
    assert.equal(content.selectedCover.assetHash, proof.hashes[0]);
    assert.doesNotMatch(fs.readFileSync(path.join(directory, '示例说明.txt'), 'utf8'), /测试|研发|验收|提示已要求/);
});

test('delivery export contains only the copied Mac installer, user guide and checksum, without overwriting', async t => {
    const parent = temporary(t);
    const name = 'Nova-Content-Hub-0.3.19-darwin-arm64-preview.dmg';
    const deliveredName = '自媒体工作台-0.3.19-Mac苹果芯片.dmg';
    const source = path.join(parent, name);
    fs.writeFileSync(source, 'installer fixture');
    fs.writeFileSync(path.join(parent, 'dev-log.txt'), 'must not ship');
    const output = path.join(parent, 'delivery');
    assert.equal(await exportColleagueDelivery(source, output), output);
    assert.deepEqual(fs.readdirSync(output).sort(), [deliveredName, 'SHA256SUMS.txt', '安装与使用.txt'].sort());
    assert.deepEqual(fs.readFileSync(path.join(output, deliveredName)), fs.readFileSync(source));
    assert.equal(fs.readFileSync(path.join(output, 'SHA256SUMS.txt'), 'utf8'), `${hash(fs.readFileSync(source))}  ${deliveredName}\n`);
    const guide = fs.readFileSync(path.join(output, '安装与使用.txt'), 'utf8');
    assert.match(guide, /5 组同事模板、52 条提示词/);
    assert.match(guide, /尚未完成 Apple Developer ID 正式签名与公证/);
    assert.doesNotMatch(guide, /productionReady|源代码|probe|commit|研发|测试/);
    await assert.rejects(exportColleagueDelivery(source, output), /exist/i);
    assert.equal(fs.readFileSync(path.join(output, deliveredName), 'utf8'), 'installer fixture');
    await assert.rejects(exportColleagueDelivery(path.join(parent, 'windows.exe'), path.join(parent, 'bad')), /Apple Silicon/);
    assert.equal(fs.existsSync(path.join(parent, 'bad')), false);
});
