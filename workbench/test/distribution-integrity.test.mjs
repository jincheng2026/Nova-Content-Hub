import {hydrateMethodEvidence} from './support/method-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {allSkillNames, integrityPaths, releaseModes, skillCapabilities} from '../../plugin-src/scripts/build.mjs';
import {archiveFor, nodeRelease} from '../../plugin-src/scripts/bundled-node.mjs';
import {buildMarketplace, snapshotPackage} from '../../plugin-src/scripts/marketplace-builder.mjs';
import * as distribution from '../scripts/dist.mjs';
import {universalInstallerConfig} from '../scripts/dist-universal.mjs';

const write = (file, value) => {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, value);
};
const json = (file, value) => write(file, JSON.stringify(value, null, 2) + '\n');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function fixture(t, auth) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-distribution-integrity-'));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    const [release] = await releaseModes(auth);
    const runtimeRoot = path.join(directory, 'runtime');
    const plugin = path.join(runtimeRoot, `auth-${auth}`);
    for (const file of integrityPaths()) write(path.join(plugin, file), `fixture ${file}`);
    hydrateMethodEvidence(plugin);
    fs.mkdirSync(path.join(plugin, 'node_modules'));
    for (const file of ['README.md', 'package.json', 'package-lock.json']) write(path.join(plugin, file), '{}\n');
    json(path.join(plugin, 'plugin-src/src/release.json'), {...release, format: 'nova-content-plugin-release', schemaVersion: 1, experimental: true, platform: process.platform, arch: process.arch});
    const spec = archiveFor();
    json(path.join(plugin, 'runtime/manifest.json'), {format: 'nova-bundled-node', schemaVersion: 1, version: nodeRelease.version, platform: spec.platform, arch: spec.arch, archive: spec.filename, officialUrl: spec.url, archiveSha256: spec.sha256, nodeSha256: hash(path.join(plugin, process.platform === 'win32' ? 'runtime/node.exe' : 'runtime/node')), licenseSha256: hash(path.join(plugin, 'runtime/LICENSE'))});
    for (const host of ['codex', 'codebuddy']) json(path.join(plugin, `.${host}-plugin/plugin.json`), {name: release.appScope, version: release.version, description: release.pairId, skills: host === 'codex' ? './skills/' : allSkillNames.map(name => `./skills/${name}`)});
    json(path.join(plugin, 'integrity.json'), {
        format: 'nova-content-plugin-integrity', schemaVersion: 1, pairId: release.pairId, AUTH_MODE: auth,
        hashes: Object.fromEntries(integrityPaths().map(file => [file, hash(path.join(plugin, file))])),
        skills: skillCapabilities(auth)
    });
    const [market] = await buildMarketplace(auth, {runtimeRoot, outputRoot: path.join(directory, 'market')});
    return {directory, release, market: market.path};
}

test('native channels preserve only the sealed marketplace during macOS signing', () => {
    for (const [channel, auth] of [['local', 'disabled'], ['preview', 'disabled'], ['testing', 'required']]) {
        const config = distribution.installerConfig({platform: 'darwin', arch: 'arm64', channel, auth}, '0.2.0');
        assert.equal(config.mac.identity, '-');
        assert.equal(config.mac.hardenedRuntime, false);
        assert.match(config.extraResources[0].from, new RegExp(`auth-${auth}/workbench/plugin-marketplace$`));
        const ignored = file => config.mac.signIgnore.some(pattern => new RegExp(pattern).test(file));
        for (const suffix of ['', '/nova-content-hub/runtime/node', '/nova-content-hub/node_modules/sharp.node']) assert.equal(ignored(`/out/Fixture.app/Contents/Resources/plugin-marketplace${suffix}`), true);
        assert.equal(ignored('C:\\out\\Fixture.app\\Contents\\Resources\\plugin-marketplace\\nova-content-hub\\runtime\\node.exe'), true);
        for (const file of ['/out/Fixture.app/Contents/Resources/plugin-marketplace-other/runtime/node', '/out/Fixture.app/Contents/Resources/app/node_modules/sharp.node', '/out/Fixture.app/Contents/MacOS/plugin-marketplace/runtime/node', '/out/Fixture.app/Contents/Resources/native/darwin-arm64/payload/runtime/node']) assert.equal(ignored(file), false, file);
    }
    const universal = universalInstallerConfig('/shell', '/out', '0.2.0');
    assert.equal(universal.mac.signIgnore.some(pattern => new RegExp(pattern).test('/out/Fixture.app/Contents/Resources/native/darwin-arm64/payload/runtime/node')), true);
    assert.equal(universal.mac.signIgnore.some(pattern => new RegExp(pattern).test('/out/Fixture.app/Contents/Resources/app/node_modules/sharp.node')), false);
});

test('native markets retain the fixed full tree and auth-specific runtime after packaging', async t => {
    for (const auth of ['disabled', 'required']) {
        const f = await fixture(t, auth);
        const sealed = await distribution.validateInstallerMarketplace(f.market, f.release);
        const copied = path.join(f.directory, 'packaged/Contents/Resources/plugin-marketplace');
        fs.cpSync(f.market, copied, {recursive: true, verbatimSymlinks: true});
        assert.deepEqual(await distribution.validateInstallerMarketplace(copied, f.release, sealed), sealed);
        await assert.rejects(distribution.validateInstallerMarketplace(copied, (await releaseModes(auth === 'disabled' ? 'required' : 'disabled'))[0], sealed), /release/);
    }
});

test('post-packaging validation rejects Node, dependency, inventory and catalog mutations', async t => {
    const f = await fixture(t, 'disabled');
    const sealed = await distribution.validateInstallerMarketplace(f.market, f.release);
    for (const [index, file] of [`${f.release.appScope}/runtime/${process.platform === 'win32' ? 'node.exe' : 'node'}`, `${f.release.appScope}/node_modules/extra-file`, 'package-files.json', '.agents/plugins/marketplace.json'].entries()) {
        const copied = path.join(f.directory, `changed-${index}`);
        fs.cpSync(f.market, copied, {recursive: true, verbatimSymlinks: true});
        write(path.join(copied, file), 'signing or packaging mutation');
        if (file.endsWith('extra-file')) {
            const manifest = path.join(copied, 'package-files.json');
            json(manifest, {...JSON.parse(fs.readFileSync(manifest, 'utf8')), entries: await snapshotPackage(path.join(copied, f.release.appScope))});
        }
        await assert.rejects(distribution.validateInstallerMarketplace(copied, f.release, sealed), /marketplace.*changed/i, file);
    }
});

test('source inventory and runtime are validated before their tree can be sealed', async t => {
    const f = await fixture(t, 'disabled');
    const manifest = path.join(f.market, 'package-files.json');
    const files = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    json(manifest, {...files, entries: {}});
    await assert.rejects(distribution.validateInstallerMarketplace(f.market, f.release), /package-files/);
    json(manifest, files);
    write(path.join(f.market, f.release.appScope, process.platform === 'win32' ? 'runtime/node.exe' : 'runtime/node'), 'changed Node');
    await assert.rejects(distribution.validateInstallerMarketplace(f.market, f.release), /Runtime integrity mismatch/);
});
