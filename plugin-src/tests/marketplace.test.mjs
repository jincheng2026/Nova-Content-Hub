import test from 'node:test';
import assert from 'node:assert/strict';
import {cp, lstat, mkdir, mkdtemp, readFile, readdir, readlink, realpath, rename, rm, symlink, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {allSkillNames, integrityPaths, releaseModes, skillNames, skillCapabilities} from '../scripts/build.mjs';
import {archiveFor, nodeRelease} from '../scripts/bundled-node.mjs';
import {buildMarketplace, main, snapshotPackage} from '../scripts/marketplace-builder.mjs';
import {copyRuntimeMethodSkills} from '../scripts/method-runtime-distribution.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n');
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));
async function temporary(t) {
    const path = await mkdtemp(join(await realpath(tmpdir()), 'nova marketplace '));
    t.after(() => rm(path, {recursive: true, force: true}));
    return path;
}

async function fixture(t) {
    const parent = await temporary(t);
    const runtimeRoot = join(parent, 'runtime');
    for (const release of await releaseModes('both')) {
        const input = join(runtimeRoot, 'auth-' + release.AUTH_MODE);
        for (const path of integrityPaths()) {
            await mkdir(dirname(join(input, path)), {recursive: true});
            await writeFile(join(input, path), 'fixture ' + path, {mode: path.startsWith('bin/') || path === 'runtime/node' ? 0o755 : 0o644});
        }
        const methodManifest = await copyRuntimeMethodSkills(join(root, 'plugin-src'), input);
        await json(join(input, 'plugin-src/resources/method-sources.json'), methodManifest);
        for (const name of ['method-runtime-distribution.json', 'method-runtime-context.json', 'method-runtime-context.mjs']) await cp(join(root, 'plugin-src/resources', name), join(input, 'plugin-src/resources', name));
        await mkdir(join(input, 'node_modules'), {recursive: true});
        for (const path of ['README.md', 'package.json', 'package-lock.json']) await writeFile(join(input, path), '{}\n');
        await json(join(input, 'plugin-src/src/release.json'), {...release, format: 'nova-content-plugin-release', schemaVersion: 1, experimental: true, platform: process.platform, arch: process.arch});
        const spec = archiveFor();
        await json(join(input, 'runtime/manifest.json'), {
            format: 'nova-bundled-node', schemaVersion: 1, version: nodeRelease.version, platform: spec.platform, arch: spec.arch,
            archive: spec.filename, officialUrl: spec.url, archiveSha256: spec.sha256,
            nodeSha256: hash(await readFile(join(input, process.platform === 'win32' ? 'runtime/node.exe' : 'runtime/node'))),
            licenseSha256: hash(await readFile(join(input, 'runtime/LICENSE')))
        });
        for (const host of ['codex', 'codebuddy']) await json(join(input, `.${host}-plugin/plugin.json`), {
            name: release.appScope, version: release.version, description: release.pairId,
            skills: host === 'codex' ? './skills/' : allSkillNames.map(name => './skills/' + name)
        });
        await json(join(input, 'integrity.json'), {
            format: 'nova-content-plugin-integrity', schemaVersion: 1, pairId: release.pairId, AUTH_MODE: release.AUTH_MODE,
            hashes: Object.fromEntries(await Promise.all(integrityPaths().map(async path => [path, hash(await readFile(join(input, path)))]))),
            skills: skillCapabilities(release.AUTH_MODE)
        });
    }
    return {runtimeRoot, outputRoot: join(parent, 'marketplace'), parent};
}

test('both local catalogs resolve from the movable market root to the same byte-identical package', async t => {
    const f = await fixture(t);
    if (process.platform !== 'win32') await symlink('../README.md', join(f.runtimeRoot, 'auth-disabled/node_modules/readme'));
    const outputs = await buildMarketplace('both', f);
    assert.equal(outputs.length, 2);
    const identities = [];
    for (const [i, mode] of ['required', 'disabled'].entries()) {
        const target = outputs[i].path;
        assert.equal(target, join(f.outputRoot, 'auth-' + mode, `${process.platform}-${process.arch}`));
        const codex = await readJSON(join(target, '.agents/plugins/marketplace.json'));
        const wb = await readJSON(join(target, '.codebuddy-plugin/marketplace.json'));
        identities.push(codex.name);
        assert.equal(wb.name, codex.name);
        assert.equal(codex.name, `nova-content-hub-auth-${mode}-${process.platform}-${process.arch}`);
        assert.doesNotMatch(codex.name, /0\.2\.0/);
        const description = `Nova Content Hub · ${mode === 'disabled' ? '免费体验版配套插件 · 无需登录' : '受限内部插件 · 业务未开放'} · ${process.platform}/${process.arch}`;
        assert.equal(codex.interface.displayName, description);
        assert.equal(wb.metadata.description, description);
        assert.deepEqual(codex.plugins[0].policy, {installation: 'AVAILABLE', authentication: 'ON_INSTALL'});
        assert.equal(codex.plugins[0].category, 'Productivity');
        assert.equal(codex.plugins[0].source.source, 'local');
        assert.equal(codex.plugins[0].source.path, wb.plugins[0].source);
        const plugin = resolve(target, codex.plugins[0].source.path);
        assert.equal(plugin, join(target, 'nova-content-hub'));
        assert.equal((await readJSON(join(plugin, '.codex-plugin/plugin.json'))).skills, './skills/');
        assert.deepEqual((await readJSON(join(plugin, '.codebuddy-plugin/plugin.json'))).skills, allSkillNames.map(name => './skills/' + name));
        assert.deepEqual((await readdir(join(plugin, 'skills'))).sort(), [...allSkillNames].sort());
        await assert.rejects(lstat(join(plugin, 'plugin-src/skills')), {code: 'ENOENT'});
        const integrity = await readJSON(join(plugin, 'integrity.json'));
        for (const name of allSkillNames) assert.equal(integrity.hashes[`skills/${name}/SKILL.md`], hash(await readFile(join(plugin, 'skills', name, 'SKILL.md'))));
        assert.deepEqual(await snapshotPackage(plugin), await snapshotPackage(join(f.runtimeRoot, 'auth-' + mode)));
        const files = await readJSON(join(target, 'package-files.json'));
        assert.equal(files.format, 'nova-content-marketplace-package-files');
        assert.equal(files.schemaVersion, 1);
        assert.deepEqual(files.release, await readJSON(join(plugin, 'plugin-src/src/release.json')));
        assert.deepEqual(files.entries, await snapshotPackage(plugin));
        assert.equal(outputs[i].packageFilesSha256, hash(await readFile(join(target, 'package-files.json'))));
        assert.ok(!Object.hasOwn(files.entries, 'package-files.json'));
        for (const [key, entry] of Object.entries(files.entries)) {
            assert.ok(!key.startsWith('/') && !key.split('/').some(part => ['', '.', '..', '__proto__'].includes(part)), key);
            assert.doesNotMatch(key, /[\\:\u0000-\u001f\u007f]/);
            if (entry.sha256) {
                assert.equal(entry.bytes, (await readFile(join(plugin, key))).length);
                assert.equal(typeof entry.executable, 'boolean');
            }
        }
        assert.equal(outputs[i].integritySha256, hash(await readFile(join(plugin, 'integrity.json'))));
        assert.equal((await readJSON(join(plugin, 'plugin-src/src/release.json'))).AUTH_MODE, mode);
        assert.equal((await readJSON(join(plugin, 'integrity.json'))).skills['nova-content-cover-execution'].executable, mode === 'disabled');
        const moved = join(f.parent, 'moved ' + mode);
        await rename(target, moved);
        assert.ok((await lstat(resolve(moved, wb.plugins[0].source, 'runtime/manifest.json'))).isFile());
        if (mode === 'disabled' && process.platform !== 'win32') assert.equal(await readlink(join(moved, 'nova-content-hub/node_modules/readme')), '../README.md');
    }
    assert.notEqual(...identities);
    assert.ok((await readdir(f.outputRoot)).every(name => name.startsWith('auth-')));
    await assert.rejects(main(['--auth', 'disabled', '--enable', 'true']), /Use marketplace-builder/);
    await assert.rejects(buildMarketplace('unknown', f), /Use --auth/);
});

test('the build-owned complete manifest detects changed business libraries, Node and sharp independently of installed integrity', async t => {
    const f = await fixture(t);
    const input = join(f.runtimeRoot, 'auth-disabled');
    const paths = ['plugin-src/src/lib/file-library/index.mjs', 'node_modules/sharp/dist/index.mjs', process.platform === 'win32' ? 'runtime/node.exe' : 'runtime/node'];
    for (const path of paths.slice(0, 2)) {
        await mkdir(dirname(join(input, path)), {recursive: true});
        await writeFile(join(input, path), 'critical file bytes');
    }
    if (process.platform !== 'win32') await symlink('index.mjs', join(input, 'node_modules/sharp/dist/local-link'));
    const integrity = await readJSON(join(input, 'integrity.json'));
    for (const relative of paths) if (Object.hasOwn(integrity.hashes, relative)) integrity.hashes[relative] = hash(await readFile(join(input, relative)));
    await json(join(input, 'integrity.json'), integrity);
    const [output] = await buildMarketplace('disabled', f);
    const manifestPath = join(output.path, 'package-files.json');
    const manifestBytes = await readFile(manifestPath);
    const manifest = JSON.parse(manifestBytes);
    const installed = join(f.parent, 'installed cache');
    await cp(join(output.path, 'nova-content-hub'), installed, {recursive: true, verbatimSymlinks: true});
    assert.deepEqual(manifest.entries, await snapshotPackage(installed));
    if (process.platform !== 'win32') assert.deepEqual(manifest.entries['node_modules/sharp/dist/local-link'], {link: 'index.mjs'});
    for (const path of paths) {
        const original = await readFile(join(installed, path));
        const changed = Buffer.from(original);
        changed[0] ^= 1;
        await writeFile(join(installed, path), changed);
        const actual = await snapshotPackage(installed);
        assert.equal(actual[path].bytes, manifest.entries[path].bytes);
        assert.notEqual(actual[path].sha256, manifest.entries[path].sha256, path);
        assert.notDeepEqual(actual, manifest.entries);
        await writeFile(join(installed, path), original);
    }
    await writeFile(join(installed, 'node_modules/extra-file'), 'unexpected');
    assert.notDeepEqual(await snapshotPackage(installed), manifest.entries);
    await rm(join(installed, 'node_modules/extra-file'));
    await rm(join(installed, paths[0]));
    assert.notDeepEqual(await snapshotPackage(installed), manifest.entries);
    assert.deepEqual(await readFile(manifestPath), manifestBytes);
});

test('unsafe or inconsistent packages fail before replacing an existing market', async t => {
    const changes = [
        ['release', async input => {
            const path = join(input, 'plugin-src/src/release.json');
            await json(path, {...await readJSON(path), AUTH_MODE: 'required'});
        }, /release/],
        ['foreign architecture', async input => {
            const path = join(input, 'plugin-src/src/release.json');
            await json(path, {...await readJSON(path), arch: 'other'});
        }, /release/],
        ['Node bytes', input => writeFile(join(input, process.platform === 'win32' ? 'runtime/node.exe' : 'runtime/node'), 'corrupted node'), /integrity mismatch/],
        ['missing hash', async input => {
            const path = join(input, 'integrity.json');
            const integrity = await readJSON(path);
            delete integrity.hashes['bin/run-node'];
            await json(path, integrity);
        }, /metadata/],
        ['claimed contract capability', async input => {
            const path = join(input, 'integrity.json');
            const integrity = await readJSON(path);
            integrity.skills['nova-content-cover'].executable = true;
            await json(path, integrity);
        }, /capabilities/],
        ['duplicate source Skill directory', input => mkdir(join(input, 'plugin-src/skills')), /single canonical/],
        ['unexpected root Skill', input => mkdir(join(input, 'skills/unregistered-skill')), /single canonical/],
        ['legacy manifest Skill path with updated integrity', async input => {
            const path = join(input, '.codex-plugin/plugin.json');
            await json(path, {...await readJSON(path), skills: './plugin-src/skills/'});
            const integrityPath = join(input, 'integrity.json');
            const integrity = await readJSON(integrityPath);
            integrity.hashes['.codex-plugin/plugin.json'] = hash(await readFile(path));
            await json(integrityPath, integrity);
        }, /manifest mismatch/],
        ['foreign Node lock with updated integrity', async input => {
            const path = join(input, 'runtime/manifest.json');
            await json(path, {...await readJSON(path), archiveSha256: '0'.repeat(64)});
            const integrityPath = join(input, 'integrity.json');
            const integrity = await readJSON(integrityPath);
            integrity.hashes['runtime/manifest.json'] = hash(await readFile(path));
            await json(integrityPath, integrity);
        }, /Node lock/],
        ['old full-source manifest resealed into integrity', async input => {
            const relative = 'plugin-src/resources/method-sources.json';
            await cp(join(root, 'plugin-src/resources/method-sources.json'), join(input, relative));
            const integrity = await readJSON(join(input, 'integrity.json'));
            integrity.hashes[relative] = hash(await readFile(join(input, relative)));
            await json(join(input, 'integrity.json'), integrity);
        }, /distribution/],
        ['private photo renamed into dependency files', input => cp(join(root, 'plugin-src/skills/jc-cover-design/upstream/current/assets/my-face-alt.JPG'), join(input, 'node_modules/innocent-image.bin')), /distribution/],
        ['altered original method resealed into integrity', async input => {
            const relative = 'skills/jc-cover-design/upstream/current/METHOD.md';
            await writeFile(join(input, relative), 'changed original method');
            const integrity = await readJSON(join(input, 'integrity.json'));
            integrity.hashes[relative] = hash(await readFile(join(input, relative)));
            await json(join(input, 'integrity.json'), integrity);
        }, /distribution/],
        ['user data', input => writeFile(join(input, 'user-library.json'), 'private user data'), /Unexpected runtime package entries/]
    ];
    for (const [name, mutate, pattern] of changes) await t.test(name, async t => {
        const f = await fixture(t);
        const target = join(f.outputRoot, 'auth-disabled', `${process.platform}-${process.arch}`);
        await mkdir(target, {recursive: true});
        await writeFile(join(target, 'prior-market'), 'keep this');
        await mutate(join(f.runtimeRoot, 'auth-disabled'));
        await assert.rejects(buildMarketplace('disabled', f), pattern);
        assert.equal(await readFile(join(target, 'prior-market'), 'utf8'), 'keep this');
    });
});

test('package and output symlink escapes are refused; source cannot be overwritten', {skip: process.platform === 'win32'}, async t => {
    const f = await fixture(t);
    const external = join(f.parent, 'outside.txt');
    await writeFile(external, 'must stay outside');
    await symlink(external, join(f.runtimeRoot, 'auth-disabled/node_modules/escape'));
    await assert.rejects(buildMarketplace('disabled', f), /Escaping package symlink/);
    await rm(join(f.runtimeRoot, 'auth-disabled/node_modules/escape'));
    for (const name of ['bad:name', 'bad\\name', 'bad\u0001name', '__proto__']) {
        const unsafe = join(f.runtimeRoot, 'auth-disabled/node_modules', name);
        await writeFile(unsafe, 'unsafe key');
        await assert.rejects(buildMarketplace('disabled', f), /Unsafe package entry path/);
        await rm(unsafe);
    }
    await mkdir(f.outputRoot, {recursive: true});
    await symlink(f.runtimeRoot, join(f.outputRoot, 'auth-disabled'));
    await assert.rejects(buildMarketplace('disabled', f), /Unsafe marketplace directory/);
    assert.equal(await readFile(external, 'utf8'), 'must stay outside');
    await assert.rejects(buildMarketplace('disabled', {...f, outputRoot: f.runtimeRoot}), /separate/);
});

test('real native market and simulated host cache run fixed Node from an unrelated cwd', {skip: process.env.NOVA_MARKETPLACE_INTEGRATION !== '1'}, async t => {
    const outputRoot = join(await temporary(t), 'distribution');
    const outputs = await buildMarketplace('both', {outputRoot});
    for (const output of outputs) {
        const original = join(output.path, 'nova-content-hub');
        const manifest = await readJSON(join(output.path, 'package-files.json'));
        const cache = join(outputRoot, 'simulated host cache', output.marketplace, 'nova-content-hub/local');
        await cp(original, cache, {recursive: true, verbatimSymlinks: true});
        assert.deepEqual(await snapshotPackage(cache), await snapshotPackage(original));
        assert.deepEqual(await snapshotPackage(cache), manifest.entries);
        for (const key of ['plugin-src/src/lib/file-library/index.mjs', process.platform === 'win32' ? 'runtime/node.exe' : 'runtime/node', 'node_modules/sharp/dist/index.mjs']) assert.ok(manifest.entries[key]?.sha256 && manifest.entries[key].bytes > 0, key);
        await rm(output.path, {recursive: true});
        const shell = process.platform === 'win32' ? join(process.env.SystemRoot || 'C:\\Windows', 'System32/cmd.exe') : '/bin/sh';
        for (const args of [['doctor'], ['cover', 'help']]) {
            const result = spawnSync(shell, process.platform === 'win32' ? ['/d', '/s', '/c', `""${join(cache, 'bin/run-node.cmd')}" ${args.join(' ')}"`] : [join(cache, 'bin/run-node'), ...args], {
                cwd: tmpdir(), encoding: 'utf8', timeout: 15000,
                env: {...process.env, PATH: '', NODE_PATH: '', NODE_OPTIONS: '--require missing-host-module'}
            });
            assert.equal(result.status, 0, result.stderr);
            assert.equal(JSON.parse(result.stdout).ok, true);
        }
        const codex = await readJSON(join(cache, '.codex-plugin/plugin.json'));
        const wb = await readJSON(join(cache, '.codebuddy-plugin/plugin.json'));
        const skills = (await readdir(resolve(cache, codex.skills))).sort();
        assert.equal(codex.skills, './skills/');
        assert.deepEqual(wb.skills, allSkillNames.map(name => './skills/' + name));
        await assert.rejects(lstat(join(cache, 'plugin-src/skills')), {code: 'ENOENT'});
        assert.deepEqual(skills, [...allSkillNames].sort());
        for (const skill of wb.skills) assert.ok((await lstat(resolve(cache, skill, 'SKILL.md'))).isFile());
        for (const skill of skillNames) {
            const result = spawnSync(join(cache, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node'), [join(cache, 'skills', skill, 'scripts/content.mjs'), 'summary'], {cwd: tmpdir(), encoding: 'utf8', env: {...process.env, NODE_OPTIONS: '', NODE_PATH: '', PATH: ''}});
            assert.equal(result.status, 0, result.stderr);
            assert.equal(JSON.parse(result.stdout).release.pairId, output.pairId);
        }
        const skillText = await readFile(join(cache, 'skills/nova-content-cover-execution/SKILL.md'), 'utf8');
        assert.match(skillText, /\.\.\/\.\.\/bin\/run-node/);
        assert.ok((await lstat(resolve(cache, 'skills/nova-content-cover-execution', '../../bin/run-node'))).isFile());
    }
});
