import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {FileMatcher} from 'app-builder-lib/out/fileMatcher.js';
import {validateConfiguration} from 'app-builder-lib/out/util/config/config.js';
import {DebugLogger} from 'builder-util';
import {assertDistribution, assertProductionSigning, assertStage, installerConfig, parseOptions, testingEnvironment} from '../scripts/dist.mjs';

const config = JSON.parse(fs.readFileSync(new URL('../../release.config.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const args = ['--channel', 'testing', '--auth', 'required', '--platform', process.platform, '--arch', process.arch];
const options = parseOptions(args);
const release = {...config, format: 'nova-content-desktop-release', schemaVersion: 1, experimental: true, productionReady: false, platform: process.platform, arch: process.arch, pairId: `${config.appScope}@${config.version}:p${config.protocolVersion}:required`};

test('installer accepts only explicit native platform/arch and required authentication', () => {
    assert.equal(options.auth, 'required');
    assert.throws(() => parseOptions([]));
    for (const [index, value] of [[1, 'latest'], [3, 'disabled'], [5, 'linux'], [7, 'universal'], [0, '--publish']]) {
        const changed = [...args]; changed[index] = value;
        assert.throws(() => parseOptions(changed));
    }
    assert.throws(() => parseOptions([...args, '--auth', 'disabled']));
    assert.throws(() => parseOptions(args, {platform: process.platform === 'darwin' ? 'win32' : 'darwin', arch: process.arch}), /native runner/);
    assert.throws(() => parseOptions(args, {platform: process.platform, arch: process.arch === 'arm64' ? 'x64' : 'arm64'}), /native runner/);
    for (const platform of ['darwin', 'win32']) for (const arch of ['arm64', 'x64']) assert.equal(parseOptions(['--channel', 'testing', '--auth', 'required', '--platform', platform, '--arch', arch], {platform, arch}).arch, arch);
});

test('release pairing, auth and toolchain fail closed', () => {
    assert.doesNotThrow(() => assertDistribution(options, config, pkg, {}));
    assert.doesNotThrow(() => assertStage(release, config));
    assert.throws(() => assertDistribution(options, {...config, AUTH_MODE: 'disabled'}, pkg, {}), /AUTH_MODE/);
    assert.throws(() => assertDistribution(options, config, {...pkg, version: '99.0.0'}, {}), /mismatch/);
    assert.throws(() => assertDistribution(options, config, {...pkg, devDependencies: {...pkg.devDependencies, 'electron-builder': '^26.15.3'}}, {}), /mismatch/);
    for (const change of [{AUTH_MODE: 'disabled'}, {pairId: `${release.pairId}-other`}, {version: '99.0.0'}, {arch: process.arch === 'arm64' ? 'x64' : 'arm64'}, {platform: process.platform === 'darwin' ? 'win32' : 'darwin'}, {experimental: false}, {productionReady: true}]) assert.throws(() => assertStage({...release, ...change}, config));
});

test('production needs signing configuration and remains blocked for this experimental release', () => {
    assert.throws(() => assertProductionSigning('darwin', {}), /certificate/);
    assert.throws(() => assertProductionSigning('win32', {}), /certificate/);
    assert.throws(() => assertProductionSigning('darwin', {CSC_NAME: '-'}), /certificate/);
    const env = {CSC_LINK: 'configured-by-runner', CSC_KEY_PASSWORD: 'placeholder', APPLE_ID: 'placeholder', APPLE_APP_SPECIFIC_PASSWORD: 'placeholder', APPLE_TEAM_ID: 'placeholder'};
    for (const platform of ['darwin', 'win32']) {
        assert.doesNotThrow(() => assertProductionSigning(platform, env));
        assert.throws(() => assertDistribution({...options, platform, channel: 'production'}, config, pkg, env), /Production is blocked/);
    }
    assert.throws(() => assertDistribution({...options, channel: 'production'}, {...config, prototype: false, productionReady: true}, pkg, env));
});

test('testing removes signing variables instead of passing empty certificate paths to builder', () => {
    const parent = {PATH: process.env.PATH, CSC_LINK: 'fixture', CSC_KEY_PASSWORD: 'fixture', CSC_NAME: 'fixture', WIN_CSC_LINK: 'fixture', WIN_CSC_KEY_PASSWORD: 'fixture', CSC_INSTALLER_LINK: 'fixture', CSC_KEYCHAIN: 'fixture'};
    const env = testingEnvironment(parent);
    assert.equal(env.PATH, parent.PATH);
    assert.equal(parent.CSC_LINK, 'fixture');
    assert.equal(env.CSC_IDENTITY_AUTO_DISCOVERY, 'false');
    for (const key of Object.keys(parent).filter(key => key.startsWith('CSC_') || key.startsWith('WIN_CSC_'))) assert.equal(Object.hasOwn(env, key), false, key);
    execFileSync(process.execPath, ['--input-type=module', '--eval', "import assert from 'node:assert/strict';await import('app-builder-lib');const {PlatformPackager}=await import('app-builder-lib/out/platformPackager.js');const packager={info:{config:{}},platformSpecificBuildOptions:{}};assert.equal(PlatformPackager.prototype.getCscLink.call(packager),undefined);assert.equal(PlatformPackager.prototype.getCscLink.call(packager,'WIN_CSC_LINK'),undefined);"], {cwd: new URL('../', import.meta.url), env});
});

test('packaging preserves runtime files, user data, and testing labels without cloud publication', () => {
    for (const platform of ['darwin', 'win32']) for (const arch of ['arm64', 'x64']) {
        const built = installerConfig({...options, platform, arch}, config.version);
        assert.match(built.directories.output, new RegExp(`release[/\\\\]${platform}-${arch}[/\\\\]testing$`));
        assert.ok(built.artifactName.includes(`${config.version}-${platform}-${arch}-testing`));
        assert.equal(built.asar, false);
        assert.equal(built.publish, null);
        assert.equal(built.npmRebuild, false);
        assert.equal(built.nsis.perMachine, false);
        assert.equal(built.nsis.allowElevation, false);
        assert.equal(built.nsis.deleteAppDataOnUninstall, false);
        assert.equal(built.nsis.createDesktopShortcut, 'always');
        assert.equal(built.mac.identity, '-');
        assert.equal(built.mac.notarize, false);
        assert.equal(built.mac.minimumSystemVersion, '13.0');
        assert.equal(built.win.requestedExecutionLevel, 'asInvoker');
        assert.deepEqual(built.mac.target, [{target: 'dmg', arch: [arch]}]);
        assert.deepEqual(built.win.target, [{target: 'nsis', arch: [arch]}]);
        assert.ok(built.files.some(pattern => pattern.includes('probe')));
        assert.ok(built.files.some(pattern => pattern.includes('__tests__')));
        assert.ok(!built.files.some(pattern => pattern.startsWith('runtime/')));
    }
    const source = fs.readFileSync(new URL('../scripts/dist.mjs', import.meta.url), 'utf8');
    assert.match(source, /'--publish', 'never'/);
    assert.doesNotMatch(source, /npx|xattr|spctl|\/Applications/);
});

test('pinned builder schema and real file matcher accept runtime and exclude release/probe/test sources', async () => {
    const built = installerConfig(options, config.version);
    await validateConfiguration(built, new DebugLogger(false));
    const directory = path.resolve('distribution-fixture');
    const matches = new FileMatcher(directory, path.resolve('unused'), value => value, built.files).createFilter();
    const included = name => matches(path.join(directory, name), {isDirectory: () => false});
    for (const name of ['package.json', 'workbench/package.json', 'workbench/dist/main/index.mjs', 'workbench/dist/main/worker.mjs', 'workbench/dist/release.json', 'workbench/dist/renderer/index.html', 'plugin-src/src/lib/file-library/index.mjs', 'plugin-src/src/bridge/native-handoff.mjs', 'plugin-src/resources/图库/image.png']) assert.ok(included(name), name);
    for (const name of ['workbench/dist/main/probe.mjs', 'workbench/dist/main/resident-probe.mjs', 'workbench/dist/main/cover-probe.mjs', 'workbench/dist/main/lifecycle-probe.mjs', 'workbench/dist/main/index.test.mjs', 'workbench/dist/main/index.mjs.map', 'workbench/scripts/dist.mjs', 'plugin-src/src/lib/test/unit.mjs', 'plugin-src/src/lib/file-library/index.test.mjs', 'runtime/node', 'release/electron-builder.json', 'package-lock.json']) assert.ok(!included(name), name);
});
