import {hydrateMethodEvidence} from './support/method-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {snapshotPackage} from '../../plugin-src/scripts/marketplace-builder.mjs';
import {archiveFor, nodeRelease} from '../../plugin-src/scripts/bundled-node.mjs';
import {integrityPaths} from '../../plugin-src/scripts/build.mjs';
import {assertMachO, assertSourceUnchanged, copyNativeArtifact, exportNativePayload, validateNativeArtifact} from '../scripts/native-payload.mjs';
import {createUniversalHooks, parseUniversalOptions, universalInstallerConfig} from '../scripts/dist-universal.mjs';
import {parseOptions} from '../scripts/dist.mjs';
import {nativePayloadPath} from '../scripts/universal-bootstrap/selector.mjs';

const config = JSON.parse(fs.readFileSync(new URL('../../release.config.json', import.meta.url), 'utf8'));
const source = {commit: 'a'.repeat(40), config, locks: {'package-lock.json': 'b'.repeat(64)}, toolchain: {node: 'v24.20.0', npm: '11.6.0', electron: '44.9.0', builder: '26.15.3', sharp: '0.35.5'}};
const json = (file, value) => write(file, JSON.stringify(value, null, 2) + '\n');
function write(file, value, mode = 0o644) {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, value, {mode});
}
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function macho(arch) {
    const bytes = Buffer.alloc(32);
    bytes.writeUInt32LE(0xfeedfacf, 0);
    bytes.writeUInt32LE(arch === 'x64' ? 0x01000007 : 0x0100000c, 4);
    return bytes;
}
function sharp(root, arch) {
    json(path.join(root, 'node_modules/sharp/package.json'), {version: source.toolchain.sharp});
    const native = path.join(root, `node_modules/@img/sharp-darwin-${arch}`);
    json(path.join(native, 'package.json'), {name: `@img/sharp-darwin-${arch}`, version: source.toolchain.sharp, os: ['darwin'], cpu: [arch]});
    write(path.join(native, 'lib/sharp.node'), macho(arch));
    write(path.join(root, `node_modules/@img/sharp-libvips-darwin-${arch}/lib/libvips.dylib`), macho(arch));
}
async function sealPlugin(stage, arch) {
    const market = path.join(stage, 'workbench/plugin-marketplace');
    const plugin = path.join(market, config.appScope);
    const release = {...config, format: 'nova-content-plugin-release', schemaVersion: 1, pairId: `${config.appScope}@${config.version}:p${config.protocolVersion}:disabled`, experimental: true, productionReady: false, platform: 'darwin', arch};
    json(path.join(plugin, 'plugin-src/src/release.json'), release);
    const spec = archiveFor('darwin', arch);
    json(path.join(plugin, 'runtime/manifest.json'), {format: 'nova-bundled-node', schemaVersion: 1, version: nodeRelease.version, platform: 'darwin', arch, archive: spec.filename, officialUrl: spec.url, archiveSha256: spec.sha256, nodeSha256: hash(path.join(plugin, 'runtime/node')), licenseSha256: hash(path.join(plugin, 'runtime/LICENSE'))});
    json(path.join(plugin, 'integrity.json'), {format: 'nova-content-plugin-integrity', schemaVersion: 1, pairId: release.pairId, AUTH_MODE: 'disabled', hashes: Object.fromEntries(integrityPaths('darwin').map(file => [file, hash(path.join(plugin, file))]))});
    json(path.join(market, 'package-files.json'), {format: 'nova-content-marketplace-package-files', schemaVersion: 1, release, entries: await snapshotPackage(plugin)});
}
async function fixture(t, arch = 'arm64') {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-native-source-'));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    const stage = path.join(directory, 'stage');
    json(path.join(stage, 'package.json'), {version: config.version, main: 'workbench/dist/main/index.mjs', dependencies: {sharp: source.toolchain.sharp}});
    const release = {...config, format: 'nova-content-desktop-release', schemaVersion: 1, pairId: `${config.appScope}@${config.version}:p${config.protocolVersion}:disabled`, experimental: true, productionReady: false, platform: 'darwin', arch};
    json(path.join(stage, 'workbench/dist/release.json'), release);
    for (const file of ['workbench/dist/main/desktop.mjs', 'workbench/dist/preload/index.cjs', 'workbench/dist/renderer/index.html']) write(path.join(stage, file), 'fixture only; never executed');
    sharp(stage, arch);
    const market = path.join(stage, 'workbench/plugin-marketplace');
    const plugin = path.join(market, config.appScope);
    for (const file of integrityPaths('darwin')) write(path.join(plugin, file), 'fixture only; never executed');
    hydrateMethodEvidence(plugin);
    write(path.join(plugin, 'runtime/node'), macho(arch), 0o755);
    fs.chmodSync(path.join(plugin, 'runtime/node'), 0o755);
    sharp(plugin, arch);
    for (const [host, file] of [['codex', '.agents/plugins/marketplace.json'], ['workbuddy', '.codebuddy-plugin/marketplace.json']]) json(path.join(market, file), {name: `${config.appScope}-auth-disabled-darwin-${arch}`, plugins: [{name: config.appScope, source: host === 'codex' ? {source: 'local', path: './' + config.appScope} : './' + config.appScope}]});
    await sealPlugin(stage, arch);
    return {directory, stage, plugin, arch};
}

test('native artifacts preserve their byte tree and executable modes across export and assembly copy', async t => {
    const f = await fixture(t);
    fs.symlinkSync('desktop.mjs', path.join(f.stage, 'workbench/dist/main/desktop-link.mjs'));
    const output = path.join(f.directory, 'artifact');
    await exportNativePayload(f.stage, output, source, f.arch);
    const artifact = await validateNativeArtifact(output, source, f.arch);
    await copyNativeArtifact(artifact, path.join(f.directory, 'copied'), source);
    assert.deepEqual(await snapshotPackage(path.join(f.directory, 'copied/payload')), await snapshotPackage(f.stage));
    assert.equal(fs.readlinkSync(path.join(output, 'payload/workbench/dist/main/desktop-link.mjs')), 'desktop.mjs');
    await assert.rejects(exportNativePayload(f.stage, output, source, f.arch), /EEXIST/);
    await assert.rejects(exportNativePayload(f.stage, path.join(f.stage, 'nested'), source, f.arch), /non-nested/);
    await assert.rejects(copyNativeArtifact(artifact, path.join(output, 'nested'), source), /non-nested/);
});

test('same-commit, lockfile, mode and toolchain pairing cannot be bypassed by the other artifact', async t => {
    const f = await fixture(t);
    const output = await exportNativePayload(f.stage, path.join(f.directory, 'artifact'), source, f.arch);
    for (const change of [{commit: 'c'.repeat(40)}, {locks: {'package-lock.json': 'd'.repeat(64)}}, {config: {...config, AUTH_MODE: 'required'}}, {toolchain: {...source.toolchain, node: 'v22.0.0'}}]) {
        await assert.rejects(validateNativeArtifact(output, {...source, ...change}, f.arch), /current clean source/);
        assert.throws(() => assertSourceUnchanged(source, {...source, ...change}), /changed during/);
    }
    await assert.rejects(validateNativeArtifact(output, source, 'x64'), /architecture/);
});

test('payload mutation and escaping or absolute symlinks fail closed', async t => {
    const f = await fixture(t);
    const output = await exportNativePayload(f.stage, path.join(f.directory, 'artifact'), source, f.arch);
    write(path.join(output, 'payload/workbench/dist/main/desktop.mjs'), 'tampered');
    await assert.rejects(validateNativeArtifact(output, source, f.arch), /integrity mismatch/);
    for (const target of ['../../../../outside', path.join(f.directory, 'outside')]) {
        write(path.join(f.directory, 'outside'), 'outside');
        const link = path.join(f.stage, 'workbench/dist/main/unsafe');
        fs.symlinkSync(target, link);
        await assert.rejects(exportNativePayload(f.stage, path.join(f.directory, 'unsafe-artifact'), source, f.arch), /Escaping package symlink/);
        fs.unlinkSync(link);
    }
});

test('foreign Node and sharp binaries are rejected even when manifests are resealed consistently', async t => {
    const node = await fixture(t);
    write(path.join(node.plugin, 'runtime/node'), macho('x64'));
    await sealPlugin(node.stage, node.arch);
    await assert.rejects(exportNativePayload(node.stage, path.join(node.directory, 'artifact'), source, node.arch), /arm64.*Mach-O/);
    const image = await fixture(t);
    write(path.join(image.stage, 'node_modules/@img/sharp-darwin-arm64/lib/sharp.node'), macho('x64'));
    await assert.rejects(exportNativePayload(image.stage, path.join(image.directory, 'artifact'), source, image.arch), /arm64.*Mach-O/);
    assert.throws(() => assertMachO(Buffer.from('not a binary'), 'arm64'), /Mach-O/);
});

test('plugin hashes, Node lock and marketplace inventory cannot be silently regenerated by export', async t => {
    for (const file of ['runtime/node', 'skills/nova-content-cover-execution/SKILL.md', 'runtime/manifest.json']) {
        const f = await fixture(t);
        write(path.join(f.plugin, file), 'changed');
        await assert.rejects(exportNativePayload(f.stage, path.join(f.directory, 'artifact'), source, f.arch), /integrity mismatch/);
    }
});

test('universal selector has only two finite native destinations and refuses other platforms and overrides', () => {
    for (const arch of ['x64', 'arm64']) assert.equal(nativePayloadPath('/bundle/Contents/Resources', 'darwin', arch), `/bundle/Contents/Resources/native/darwin-${arch}/payload`);
    for (const [platform, arch] of [['win32', 'x64'], ['linux', 'arm64'], ['darwin', 'universal'], ['darwin', '../../outside']]) assert.throws(() => nativePayloadPath('/bundle/Contents/Resources', platform, arch));
    assert.throws(() => nativePayloadPath('relative', 'darwin', 'x64'));
    assert.deepEqual(parseUniversalOptions(['--arm64', '/arm', '--x64', '/intel'], {platform: 'darwin', arch: 'arm64'}), {arm64: '/arm', x64: '/intel'});
    assert.throws(() => parseUniversalOptions(['--x64', '/intel', '--arm64', '/arm'], {platform: 'win32', arch: 'x64'}));
    for (const args of [[], ['--x64', '/one', '--arm64', '/one'], ['--x64', 'relative', '--arm64', '/arm'], ['--x64', '/one', '--x64', '/two'], ['--production', '/one', '--arm64', '/two']]) assert.throws(() => parseUniversalOptions(args, {platform: 'darwin', arch: 'x64'}));
});

test('payload export is explicit and does not tighten existing native preview commands', () => {
    const args = ['--channel', 'preview', '--auth', 'disabled', '--platform', 'darwin', '--arch', 'x64'];
    const host = {platform: 'darwin', arch: 'x64'};
    assert.equal(parseOptions(args, host).exportPayload, undefined);
    assert.equal(parseOptions(['--export-payload', ...args], host).exportPayload, true);
    assert.throws(() => parseOptions(['--export-payload', ...args.map(value => value === 'preview' ? 'local' : value)], host), /only.*preview/);
    const windows = args.map(value => value === 'darwin' ? 'win32' : value);
    assert.throws(() => parseOptions(['--export-payload', ...windows], {platform: 'win32', arch: 'x64'}), /only.*macOS/);
});

test('final-only universal hook copies both immutable payloads and detects signing mutations', async t => {
    const artifacts = [];
    for (const arch of ['x64', 'arm64']) {
        const f = await fixture(t, arch);
        const output = await exportNativePayload(f.stage, path.join(f.directory, 'artifact'), source, arch);
        artifacts.push(await validateNativeArtifact(output, source, arch));
    }
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-universal-shell-'));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    const context = {appOutDir: directory, electronPlatformName: 'darwin', packager: {appInfo: {productFilename: 'Fixture'}}};
    const resources = path.join(directory, 'Fixture.app/Contents/Resources');
    fs.mkdirSync(resources, {recursive: true});
    json(path.join(resources, 'app/package.json'), {type: 'module', main: 'main.mjs'});
    write(path.join(resources, 'app/main.mjs'), 'fixture main; never executed');
    write(path.join(resources, 'app/selector.mjs'), 'fixture selector; never executed');
    const hooks = createUniversalHooks(artifacts, source);
    await hooks.afterPack({...context, arch: 1});
    await hooks.afterPack({...context, arch: 3});
    assert.equal(fs.existsSync(path.join(resources, 'native')), false);
    await hooks.afterPack({...context, arch: 4});
    await hooks.afterSign({...context, arch: 4});
    await hooks.verifyFinished();
    const config = universalInstallerConfig('/shell', '/out', source.config.version);
    assert.equal(config.appId, 'com.novaisland.nova-content-hub');
    assert.deepEqual(config.mac.target, [{target: 'dmg', arch: ['universal']}]);
    assert.deepEqual(config.extraResources, []);
    assert.ok(config.mac.signIgnore.some(pattern => new RegExp(pattern).test(path.join(resources, 'native/darwin-arm64/payload/runtime/node'))));
    write(path.join(resources, 'native/darwin-x64/payload/workbench/dist/main/desktop.mjs'), 'signature mutation');
    await assert.rejects(hooks.afterSign({...context, arch: 4}), /integrity mismatch/);
    await assert.rejects(hooks.verifyFinished(), /integrity mismatch/);
});
