import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {gzipSync, deflateRawSync} from 'node:zlib';
import {assertArtifactSafe, releaseSourceFilter} from '../../plugin-src/scripts/artifact-safety.mjs';
import {runtimeSourceFilter} from '../../plugin-src/scripts/build.mjs';

function tree(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-artifact-safety-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    return {root, write(file, value) {const target = path.join(root, file); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, value); return target;}};
}
const fakeSecret = () => ['9b71', 'ac84', 'd062', '4e95', 'ba38', 'f701', 'dc52', 'a639'].join('');
// A minimal local/central ZIP record, with no external archive utility dependency.
function zip(name, content) {
    const filename = Buffer.from(name), bytes = Buffer.from(content), compressed = deflateRawSync(bytes);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(8, 8); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(filename.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(8, 10); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(filename.length, 28);
    const entry = Buffer.concat([local, filename, compressed]), directory = Buffer.concat([central, filename]);
    const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(entry.length, 16);
    return Buffer.concat([entry, directory, end]);
}
function tar(name, content) {
    const header = Buffer.alloc(512), bytes = Buffer.from(content);
    header.write(name); header.write(bytes.length.toString(8).padStart(11, '0'), 124); header[156] = 48; header.write('ustar', 257);
    return Buffer.concat([header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512), Buffer.alloc(1024)]);
}

test('copy filters exclude local state, fixtures and logs without excluding service implementation', () => {
    for (const file of ['.env', '.env.local', 'credentials.json', 'service-settings.json', 'machine-binding.backup.json', 'local-preferences.json', 'config.test.json', 'fixture', 'fixtures', 'test', 'logs', '.local-probes', '内容库.json']) {
        assert.equal(releaseSourceFilter('/source/' + file), false, file);
        assert.equal(runtimeSourceFilter('/source/' + file), false, file);
    }
    for (const file of ['service-settings.mjs', 'service-contracts.ts', '.env.example', 'examples.json', 'runtime/manifest.json']) assert.equal(releaseSourceFilter('/source/' + file), true, file);
});

test('sealed artifacts reject copied local state by path without reading it', async t => {
    for (const file of ['.env', 'workbench/service-settings.json', 'plugin/credentials.enc', 'machine-binding.recovery.json', 'config.test.json', 'plugin-src/fixtures/settings.json', 'logs/request.log', 'content/内容库.json']) {
        const f = tree(t); f.write(file, 'DO_NOT_PRINT_SECRET');
        await assert.rejects(assertArtifactSafe(f.root), error => error.code === 'ARTIFACT_UNSAFE' && error.message.includes(file) && !error.message.includes('DO_NOT_PRINT_SECRET'));
    }
});

test('only empty environment examples may ship', async t => {
    const f = tree(t); f.write('.env.example', '# 用户自行填写\nTIKHUB_API_KEY=\nMODEL_API_KEY=""\nASR_API_KEY=\'\'\n');
    await assertArtifactSafe(f.root);
    f.write('.env.example', 'TIKHUB_API_KEY=your-key\n');
    await assert.rejects(assertArtifactSafe(f.root), /ENV_EXAMPLE_VALUE/);
});

test('detects hardcoded credentials but reports only paths and rule identifiers', async t => {
    for (const content of [`export const apiKey = '${fakeSecret()}';`, JSON.stringify({modelApiKey:fakeSecret()}), JSON.stringify({version:1,values:{},keys:{tikhub:fakeSecret()}}), `Authorization: Bearer ${fakeSecret()}`, '-----BEGIN PRIVATE KEY-----\nnot-a-real-key']) {
        const f = tree(t); f.write('plugin-src/runtime-config.json', content);
        await assert.rejects(assertArtifactSafe(f.root), error => error.code === 'ARTIFACT_UNSAFE' && error.message.includes('plugin-src/runtime-config.json') && !error.message.includes(fakeSecret()) && !error.message.includes(content));
    }
});

test('ordinary token fields, env reads, provider enums, hashes and mock examples are permitted', async t => {
    const f = tree(t);
    f.write('plugin-src/src/client.mjs', `const apiKey=process.env.TIKHUB_API_KEY; const value={token:'editToken',provider:'tikhub',type:'apiKey',key:'model'}; const api_key='mock-api-key-for-testing-only'; const modelKey='your-model-api-key'; const openaiKey='sk-proj-mock-for-testing-only-12345';`);
    f.write('plugin-src/schemas/request.json', JSON.stringify({properties:{token:{type:'string'},apiKey:{type:'string'}},enum:['tikhub','model','asr'],sha256:fakeSecret().repeat(2)}));
    f.write('node_modules/dependency/example.js', `const token='${fakeSecret()}';`);
    await assertArtifactSafe(f.root);
});

test('archives are checked recursively including gzip, tar, zip, unsafe paths and opaque formats', async t => {
    for (const [name, bytes] of [
        ['plugin.zip', zip('config.json', JSON.stringify({apiKey:fakeSecret()}))],
        ['example.zip', zip('.env.example', 'API_KEY=nonempty-example')],
        ['store.zip', zip('config.data', JSON.stringify({version:1,values:{},keys:{tikhub:fakeSecret()}}))],
        ['plugin.tgz', gzipSync(tar('service-settings.json', '{}'))],
        ['nested.zip', zip('plugin.tar.gz', gzipSync(tar('.env', 'TIKHUB_API_KEY=hidden')))],
        ['config.json.gz', gzipSync(JSON.stringify({apiKey:fakeSecret()}))],
        ['unsafe.zip', zip('../outside.json', '{}')],
        ['opaque.7z', Buffer.from('not inspectable')],
        ['broken.zip', Buffer.from('broken')]
    ]) {
        const f = tree(t); f.write(name, bytes);
        await assert.rejects(assertArtifactSafe(f.root), error => error.code === 'ARTIFACT_UNSAFE' && error.message.includes(name) && !error.message.includes(fakeSecret()));
    }
    const clean = tree(t); clean.write('plugin.zip', zip('src/client.mjs', 'export const apiKey=process.env.API_KEY;')); await assertArtifactSafe(clean.root);
});

test('symlink escapes and over-limit archives fail closed', async t => {
    const f = tree(t), other = tree(t); const target = other.write('config.json', '{}'); fs.symlinkSync(target, path.join(f.root, 'outside.json'));
    await assert.rejects(assertArtifactSafe(f.root), /SYMLINK_OUTSIDE/);
    fs.unlinkSync(path.join(f.root, 'outside.json'));
    f.write('large.gz', gzipSync(Buffer.alloc(64 * 1024 * 1024 + 1, 65)));
    await assert.rejects(assertArtifactSafe(f.root), /ARCHIVE_LIMIT/);
});

test('credentials hidden under a different extension remain detectable', async t => {
    const f = tree(t); f.write('bundled/settings.data', JSON.stringify({apiKey:fakeSecret()}));
    await assert.rejects(assertArtifactSafe(f.root), /CREDENTIAL_LITERAL/);
});

test('packaging hook checks final copied resources before generating installers', async t => {
    const {default: hook} = await import('../scripts/artifact-safety-hook.mjs');
    for (const platform of ['darwin', 'win32']) {
        const f = tree(t), resources = platform === 'darwin' ? 'Workbench.app/Contents/Resources' : 'resources';
        f.write(resources + '/app/main.mjs', 'export const configured=process.env.API_KEY;');
        const context = {electronPlatformName:platform, appOutDir:f.root, packager:{appInfo:{productFilename:'Workbench'}}};
        await hook(context);
        f.write(resources + '/plugin-marketplace/service-settings.json', 'unreadable local state');
        await assert.rejects(hook(context), /LOCAL_STATE/);
    }
});

test('fresh settings require the user’s own keys while reopening retains local encrypted settings', async t => {
    const {ServiceSettingsStore} = await import('../src/main/service-settings.mts');
    const f = tree(t), filePath = path.join(f.root, 'userData/service-settings.json');
    const encryption = {isEncryptionAvailable:()=>true, encryptString:text=>Buffer.from('test-only:'+text), decryptString:bytes=>bytes.toString().slice(10)};
    const fresh = new ServiceSettingsStore({filePath,encryption});
    const view = await fresh.initialize();
    for (const credential of Object.values(view.credentials)) assert.equal(credential.hasKey, false);
    assert.equal(fs.existsSync(filePath), false, 'first install must not seed a key file');
    await fresh.update({keys:{tikhub:'mock-collection-key',model:'mock-model-key',asr:'mock-speech-key',groq:'mock-groq-key'}});
    const before = fs.readFileSync(filePath);
    const reopened = new ServiceSettingsStore({filePath,encryption}); await reopened.initialize();
    for (const [name,key] of Object.entries({tikhub:'mock-collection-key',model:'mock-model-key',asr:'mock-speech-key',groq:'mock-groq-key'})) assert.equal(reopened.secret(name),key);
    assert.deepEqual(fs.readFileSync(filePath),before);
});

test('service-scoped JSON credentials and environment-shaped names are rejected without treating ordinary token data as secrets', async t => {
    for (const content of [JSON.stringify({services:{tikhub:{key:fakeSecret()}}}), `const VOLC_ACCESS_TOKEN='${fakeSecret()}';`]) {
        const f = tree(t); f.write('settings.json',content); await assert.rejects(assertArtifactSafe(f.root), /CREDENTIAL_LITERAL/);
    }
    const f = tree(t); f.write('state.json',JSON.stringify({token:fakeSecret(),editToken:fakeSecret(),provider:'model'})); await assertArtifactSafe(f.root);
});

test('generated demo library allowance still rejects real content and local key stores', async t => {
    const f = tree(t); f.write('内容库.json',JSON.stringify({format:'nova-content-library'})); f.write('内容/demo/内容.json',JSON.stringify({format:'nova-content',isExample:true}));
    await assert.rejects(assertArtifactSafe(f.root), /LOCAL_STATE/);
    await assertArtifactSafe(f.root,{allowGeneratedExampleLibrary:true});
    f.write('内容/demo/内容.json',JSON.stringify({format:'nova-content',isExample:false})); await assert.rejects(assertArtifactSafe(f.root,{allowGeneratedExampleLibrary:true}), /NON_EXAMPLE_CONTENT/);
    f.write('service-settings.json','{}'); await assert.rejects(assertArtifactSafe(f.root,{allowGeneratedExampleLibrary:true}), /LOCAL_STATE/);
});
