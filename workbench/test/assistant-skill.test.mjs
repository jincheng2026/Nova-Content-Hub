import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {installedAssistantSkill} from '../src/main/assistant-skill.mts';
import {productionLaunchFailure} from '../src/main/assistant-failure.mts';
import {Covers} from '../src/main/covers.mts';
import {TemplateController} from '../src/main/template-controller.mts';

const skill = 'nova-content-cover-execution';
const release = {
    format: 'nova-content-desktop-release', schemaVersion: 1, productId: 'nova-content-hub', appScope: 'nova-content-hub',
    protocolVersion: 1, prototype: true, version: '0.2.0', AUTH_MODE: 'disabled', pairId: 'nova-content-hub@0.2.0:p1:disabled',
    experimental: true, productionReady: false, platform: process.platform, arch: process.arch
};
const market = `nova-content-hub-auth-disabled-${process.platform}-${process.arch}`, key = `nova-content-hub@${market}`;
const write = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); };

function fixture(t, host) {
    const home = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nova assistant '));
    t.after(() => fs.rmSync(home, {recursive: true, force: true}));
    const config = path.join(home, host === 'codex' ? '.codex' : '.workbuddy');
    const root = path.join(config, 'plugins', 'cache', market, 'nova-content-hub', release.version);
    const settings = path.join(config, host === 'codex' ? 'config.toml' : 'settings.json');
    const record = {scope: 'user', version: release.version, installPath: root};
    const registry = path.join(config, 'plugins', 'installed_plugins.json');
    write(settings, host === 'codex' ? `[plugins."${key}"]\nenabled = true\n` : {enabledPlugins: {[key]: true}});
    if (host === 'workbuddy') write(registry, {version: 2, plugins: {[key]: [record]}});
    const manifestFile = path.join(root, host === 'codex' ? '.codex-plugin/plugin.json' : '.codebuddy-plugin/plugin.json');
    const manifest = {name: 'nova-content-hub', version: release.version, description: release.pairId, skills: host === 'codex' ? './skills/' : [`./skills/${skill}`]};
    write(manifestFile, manifest);
    write(path.join(root, 'plugin-src/src/release.json'), {...release, format: 'nova-content-plugin-release'});
    const skillFile = `skills/${skill}/SKILL.md`, text = `---\nname: ${skill}\n---\nFixture\n`;
    write(path.join(root, skillFile), text);
    write(path.join(root, 'integrity.json'), {format: 'nova-content-plugin-integrity', schemaVersion: 1, pairId: release.pairId, AUTH_MODE: 'disabled', skills: {[skill]: {namespace: 'cover', executable: true}}, hashes: {[skillFile]: createHash('sha256').update(text).digest('hex')}});
    return {home, config, root, settings, registry, manifest, manifestFile, record, skillFile: path.join(root, skillFile), verify: (env = {}, selected = host) => installedAssistantSkill(selected, release, {home, env})};
}

for (const host of ['codex', 'workbuddy']) {
    test(`${host}: an older paired plugin reports a version mismatch and the matching upgrade`, t => {
        const f = fixture(t, host), upgraded = {...release, version: '0.5.3', pairId: 'nova-content-hub@0.5.3:p1:disabled'};
        assert.throws(() => installedAssistantSkill(host, upgraded, {home: f.home, env: {}}), error => {
            assert.equal(error.reason, 'plugin-mismatch');
            assert.equal(error.expectedVersion, '0.5.3');
            assert.equal(error.installedVersion, '0.2.0');
            const message = productionLaunchFailure(error);
            assert.match(message, /0\.5\.3/); assert.match(message, /0\.2\.0/);
            assert.match(message, /设置.*AI 助手/); assert.match(message, /升级/);
            assert.match(message, /继续打开此任务/);
            return true;
        });
    });

    test(`${host}: no paired plugin reports the required version without accepting an unrelated cache`, t => {
        const f = fixture(t, host);
        fs.rmSync(f.root, {recursive: true});
        write(path.join(path.dirname(f.root), '9.9.9', 'unrelated.txt'), 'unrelated cached files');
        assert.throws(() => f.verify(), error => {
            assert.equal(error.reason, 'plugin-missing'); assert.equal(error.expectedVersion, '0.2.0');
            assert.equal(error.installedVersion, undefined); assert.match(error.message, /0\.2\.0/);
            return true;
        });
    });

    test(`${host}: only exact installed enabled native release is accepted`, t => {
        const f = fixture(t, host);
        assert.equal(f.verify(), skill);
        assert.throws(() => installedAssistantSkill(host, {...release, version: '0.3.1', pairId: 'nova-content-hub@0.3.1:p1:disabled'}, {home: f.home, env: {}}), {code: 'NOT_READY'});
        assert.throws(() => f.verify({}, host === 'codex' ? 'workbuddy' : 'codex'), {code: 'NOT_READY'});
        write(f.settings, host === 'codex' ? `[plugins."${key}"]\nenabled = false\n` : {enabledPlugins: {[key]: false}});
        assert.throws(() => f.verify(), {code: 'NOT_READY'});
        write(f.settings, host === 'codex' ? `[plugins."nova-content-hub@other-market"]\nenabled = true\n` : {enabledPlugins: {'nova-content-hub@other-market': true}});
        assert.throws(() => f.verify(), {code: 'NOT_READY'});
        fs.rmSync(f.settings);
        assert.throws(() => f.verify(), {code: 'NOT_READY'});
    });

    test(`${host}: explicit config homes never fall back to a different installed host home`, t => {
        const f = fixture(t, host), variable = host === 'codex' ? 'CODEX_HOME' : 'WORKBUDDY_CONFIG_DIR';
        assert.equal(f.verify({[variable]: f.config}), skill);
        assert.throws(() => f.verify({[variable]: path.join(f.home, 'missing')}), {code: 'NOT_READY'});
        assert.throws(() => f.verify({[variable]: 'relative'}), {code: 'NOT_READY'});
        if (host === 'workbuddy') {
            assert.equal(f.verify({CODEBUDDY_CONFIG_DIR: f.config}), skill);
            assert.throws(() => f.verify({WORKBUDDY_CONFIG_DIR: path.join(f.home, 'missing'), CODEBUDDY_CONFIG_DIR: f.config}), {code: 'NOT_READY'});
        }
    });

    test(`${host}: manifest path changes, mismatched releases, and modified Skills refuse`, t => {
        const f = fixture(t, host);
        for (const patch of [{version: '0.1.0'}, {name: 'other'}, {skills: '../elsewhere'}, {skills: ['./skills/other']}, {skills: host === 'codex' ? './plugin-src/skills/' : [`./plugin-src/skills/${skill}`]}]) {
            write(f.manifestFile, {...f.manifest, ...patch});
            assert.throws(() => f.verify(), {code: 'NOT_READY'});
        }
        write(f.manifestFile, f.manifest);
        const originalSkill = fs.readFileSync(f.skillFile);
        write(f.skillFile, 'tampered');
        assert.throws(() => f.verify(), {code: 'NOT_READY'});
        fs.writeFileSync(f.skillFile, originalSkill);
        write(path.join(f.root, 'plugin-src/src/release.json'), {...release, format: 'nova-content-plugin-release', pairId: 'other'});
        assert.throws(() => f.verify(), {code: 'NOT_READY'});
    });

    test(`${host}: Skill symlinks and oversized metadata refuse`, t => {
        const f = fixture(t, host), target = path.join(f.home, 'external-skill');
        fs.renameSync(f.skillFile, target);
        fs.symlinkSync(target, f.skillFile);
        assert.throws(() => f.verify(), {code: 'NOT_READY'});
        fs.rmSync(f.skillFile);
        fs.renameSync(target, f.skillFile);
        write(f.manifestFile, ' '.repeat(2 * 1024 * 1024 + 1));
        assert.throws(() => f.verify(), {code: 'NOT_READY'});
    });

    test(`${host}: legacy nested Skills cannot fall back to an ordinary handoff`, t => {
        const f = fixture(t, host), canonical = path.join(f.root, 'skills');
        fs.renameSync(canonical, path.join(f.root, 'plugin-src', 'skills'));
        write(f.manifestFile, {...f.manifest, skills: host === 'codex' ? './plugin-src/skills/' : [`./plugin-src/skills/${skill}`]});
        assert.throws(() => f.verify(), {code: 'NOT_READY'});
        assert.equal(fs.existsSync(canonical), false);
    });
}

test('WorkBuddy ambiguous records and arbitrary cache paths refuse', t => {
    const f = fixture(t, 'workbuddy');
    for (const records of [[f.record, f.record], [{...f.record, installPath: f.home}], [{...f.record, version: '0.1.0'}]]) {
        write(f.registry, {version: 2, plugins: {[key]: records}});
        assert.throws(() => f.verify(), {code: 'NOT_READY'});
    }
});

test('WorkBuddy current cache with an old active installation reports mismatch, not disabled', t => {
    const f = fixture(t, 'workbuddy');
    write(f.registry, {version: 2, plugins: {[key]: [{...f.record, version: '0.1.0', installPath: path.join(path.dirname(f.root), '0.1.0')} ]}});
    assert.throws(() => f.verify(), {code: 'NOT_READY', reason: 'plugin-mismatch', expectedVersion: '0.2.0', installedVersion: '0.1.0'});
});

for (const capability of ['cover', 'template']) test(`${capability}: launch preserves the shared actionable setup failure`, async () => {
    const message = '工作台 0.5.3，需要升级当前 0.5.1 配套插件。';
    const setup = async host => ({host, ready: false, skill: null, reason: 'plugin-mismatch', message});
    const controller = capability === 'cover' ? new Covers({worker: {}}, undefined, {}, setup) : new TemplateController({}, {readTemplateAssistantSetup: setup});
    await assert.rejects(controller.requireAssistant('workbuddy'), {code: 'NOT_READY', reason: 'plugin-mismatch', message});
});

test('Codex TOML uses parser semantics, rejecting malformed and duplicate tables', t => {
    const f = fixture(t, 'codex');
    write(f.settings, `[plugins.'${key}']\nenabled = true # enabled by user\n`);
    assert.equal(f.verify(), skill);
    for (const text of [`[plugins."${key}"]\nenabled = true\n[plugins."${key}"]\nenabled = false`, `[plugins."${key}"]\nenabled = true\nmalformed`, `[plugins."${key}"]\nenabled = "true"`]) {
        write(f.settings, text);
        assert.throws(() => f.verify(), {code: 'NOT_READY'});
    }
});

test('Codex individual Skill disabling overrides the enabled plugin', t => {
    const f = fixture(t, 'codex');
    const prefix = `[plugins."${key}"]\nenabled = true\n[[skills.config]]\n`;
    for (const disabledPath of [f.skillFile, `${path.dirname(f.skillFile)}${path.sep}nested${path.sep}..${path.sep}SKILL.md`]) {
        write(f.settings, `${prefix}path = ${JSON.stringify(disabledPath)}\nenabled = false\n`);
        assert.throws(() => f.verify(), {code: 'NOT_READY'});
    }
    write(f.settings, `${prefix}path = ${JSON.stringify(f.skillFile)}\nenabled = true\n`);
    assert.equal(f.verify(), skill);
    write(f.settings, `${prefix}path = ${JSON.stringify(path.join(f.home, 'unrelated', 'SKILL.md'))}\nenabled = false\n`);
    assert.equal(f.verify(), skill);
});

for (const host of ['codex', 'workbuddy']) for (const capability of ['research', 'writing']) {
    test(`${host}: ${capability} requires its own installed executable Skill`, t => {
        const f = fixture(t, host), name = `nova-content-${capability}-execution`;
        assert.throws(() => installedAssistantSkill(host, release, {home:f.home,env:{},capability}), {code:'NOT_READY'});
        const text = `---\nname: ${name}\n---\nProduction fixture\n`, relative = `skills/${name}/SKILL.md`;
        write(path.join(f.root, relative), text);
        const integrityFile = path.join(f.root, 'integrity.json'), integrity = JSON.parse(fs.readFileSync(integrityFile, 'utf8'));
        integrity.skills[name] = {namespace:capability,executable:true};
        integrity.hashes[relative] = createHash('sha256').update(text).digest('hex');
        write(integrityFile,integrity);
        if(host==='workbuddy') write(f.manifestFile,{...f.manifest,skills:[...f.manifest.skills,`./skills/${name}`]});
        assert.equal(installedAssistantSkill(host, release, {home:f.home,env:{},capability}),name);
        integrity.skills[name].namespace = 'cover';write(integrityFile,integrity);
        assert.throws(() => installedAssistantSkill(host, release, {home:f.home,env:{},capability}), {code:'NOT_READY'});
    });
}

for (const host of ['codex', 'workbuddy']) test(`${host}: missing production capability reports a safe actionable reason`, t => {
    const f = fixture(t, host);
    assert.throws(() => installedAssistantSkill(host, release, {home: f.home, env: {}, capability: 'research'}), {code: 'NOT_READY', reason: host === 'workbuddy' ? 'skill-not-supported' : 'skill-missing'});
    fs.rmSync(f.root, {recursive: true});
    assert.throws(() => installedAssistantSkill(host, release, {home: f.home, env: {}, capability: 'research'}), {code: 'NOT_READY', reason: 'plugin-missing'});
});
