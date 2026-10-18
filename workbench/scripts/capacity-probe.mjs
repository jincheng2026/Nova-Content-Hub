// Run from the repository with Node >=22.18: node workbench/scripts/capacity-probe.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn, execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import sharp from 'sharp';
import {createLibrary, openLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {DesktopController} from '../src/main/controller.mts';
import {BindingStore, emptyBinding} from '../src/main/bindings.mts';
import {execute} from '../src/main/worker.mts';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const methods = ['listContents', 'readWorkspace', 'readWorkspaceLibrary', 'readCover'];
const counts = {contents: 100, candidatesPerContent: 6, plansPerContent: 3, prompts: 12};
const round = value => Math.round(value * 100) / 100;

async function sample(root, method) {
    assert.ok(methods.includes(method));
    const manifest = JSON.parse(await fsp.readFile(path.join(root, 'fixture.json'), 'utf8'));
    const controller = new DesktopController({store: new BindingStore(path.join(root, 'binding.json')), worker: {call: execute}, documents: root, dialogs: {}});
    await controller.initialize();
    let active;
    const descriptors = new Map();
    const originals = Object.fromEntries(['openSync', 'closeSync', 'readFileSync', 'lstatSync', 'readdirSync'].map(key => [key, fs[key]]));
    fs.openSync = (...args) => {const fd = originals.openSync(...args); descriptors.set(fd, String(args[0])); return fd;};
    fs.closeSync = fd => {descriptors.delete(fd); return originals.closeSync(fd);};
    fs.readFileSync = (...args) => {
        const value = originals.readFileSync(...args);
        if (active) {
            active.readCalls++;
            active.readBytes += Buffer.byteLength(value);
            const name = typeof args[0] === 'number' ? descriptors.get(args[0]) : String(args[0]);
            assert.ok(name?.startsWith(root + path.sep), 'measurement must stay inside isolated fixture');
            active.files.add(name);
        }
        return value;
    };
    for (const key of ['lstatSync', 'readdirSync']) fs[key] = (...args) => {if (active) active[key]++; return originals[key](...args);};
    const records = [];
    try {
        for (let run = 0; run < 4; run++) {
            active = {readCalls: 0, readBytes: 0, files: new Set(), lstatSync: 0, readdirSync: 0};
            const start = performance.now();
            const value = await controller[method](...(method === 'readCover' ? [{contentId: manifest.firstContentId}] : []));
            const durationMs = round(performance.now() - start);
            const measured = active;
            active = null;
            const items = method === 'listContents' ? value : method === 'readWorkspace' ? value.contents : method === 'readWorkspaceLibrary' ? value.contentDetails : value.candidates;
            assert.equal(items.length, method === 'readCover' ? counts.candidatesPerContent : counts.contents);
            if (method === 'readWorkspace') assert.ok(items.every(item => item.candidateCount === counts.candidatesPerContent && item.plans.length === counts.plansPerContent));
            if (method === 'readWorkspaceLibrary') assert.ok(items.every(item => item.candidates.length === counts.candidatesPerContent && item.plans.length === counts.plansPerContent));
            assert.ok(measured.readCalls > 0 && measured.readBytes > 0, 'must measure actual worker disk reads');
            const serializeStart = performance.now();
            const returnBytes = Buffer.byteLength(JSON.stringify(value));
            records.push({phase: run === 0 ? 'processCold' : 'warm', run, durationMs, serializeMs: round(performance.now() - serializeStart), returnBytes, ...measured, files: undefined, uniqueReadFiles: measured.files.size});
        }
    } finally {Object.assign(fs, originals);}
    return {method, records};
}

if (process.argv[2] === '--sample') {
    // Internal child invocation accepts only a directory created under this probe's ignored location.
    const root = await fsp.realpath(process.argv[3]);
    assert.ok(root.startsWith(path.join(repo, '.local-probes', 'capacity-')));
    process.stdout.write(JSON.stringify(await sample(root, process.argv[4])));
} else {
    assert.equal(process.argv.length, 2, 'This probe takes no external library path.');
    await fsp.mkdir(path.join(repo, '.local-probes'), {recursive: true});
    const root = await fsp.mkdtemp(path.join(repo, '.local-probes', 'capacity-'));
    const log = [];
    const note = message => {log.push(message); console.log(message);};
    const start = performance.now();
    const libraryRoot = path.join(root, 'library');
    const library = createLibrary(libraryRoot);
    const assets = [];
    // The same complete raster generator as cover/workspace tests, at a normal cover resolution.
    for (const background of ['#53acde', '#7744cc', '#cc2211', '#228844', '#dda033', '#354565']) {
        const source = path.join(root, `cover-${assets.length}.png`);
        await sharp({create: {width: 720, height: 960, channels: 3, background}}).png().toFile(source);
        assert.equal((await sharp(source).raw().toBuffer()).length, 720 * 960 * 3);
        const asset = library.importAsset(source, {purpose: 'generated-cover'});
        assets.push({assetHash: asset.assetHash, bytes: asset.bytes});
    }
    const body = '本机容量探针：真实正文与发布说明，保留换行。\n'.repeat(100);
    let firstContentId;
    for (let i = 0; i < counts.contents; i++) {
        let content = library.createContent({title: `容量样本 ${i + 1}`, body});
        firstContentId ??= content.id;
        for (const asset of assets) content = library.registerContentCandidate(content.id, {assetHash: asset.assetHash, requestId: 'manual', attemptId: 'capacity-probe'}, content.editToken);
        content = library.selectContentCover(content.id, content.candidates[0].id, content.editToken);
        for (let p = 0; p < counts.plansPerContent; p++) content = library.savePublicationPlan(content.id, {channelId: 'douyin', text: '发布说明\n'.repeat(20), schedule: {precision: 'date', date: `2026-10-${20 + p}`}}, content.editToken);
        if ((i + 1) % 10 === 0) note(`seeded ${i + 1}/${counts.contents} contents`);
    }
    for (let i = 0; i < counts.prompts; i++) library.createPrompt({title: `提示词 ${i + 1}`, body: '写作规则\n'.repeat(50)});
    const binding = {root: library.info.root, libraryId: library.info.libraryId, rootIdentity: library.info.rootIdentity};
    await new BindingStore(path.join(root, 'binding.json')).save({...emptyBinding(), current: binding});
    await fsp.writeFile(path.join(root, 'fixture.json'), JSON.stringify({firstContentId, counts}));
    assert.equal(openLibrary(libraryRoot).listContents().length, counts.contents);
    const seedMs = round(performance.now() - start);
    note(`fixture ready in ${seedMs} ms; ${counts.contents * counts.candidatesPerContent} references share ${assets.length} real PNG assets`);
    const samples = [];
    for (const method of methods) {
        const stdout = await new Promise((resolve, reject) => {
            const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--sample', root, method], {cwd: repo, stdio: ['ignore', 'pipe', 'pipe']});
            let out = '', err = '';
            child.stdout.on('data', bytes => {out += bytes;}); child.stderr.on('data', bytes => {err += bytes;});
            child.once('error', reject);
            child.once('close', code => code === 0 ? resolve(out) : reject(new Error(`Sample ${method} exited ${code}: ${err}`)));
        });
        const sample = JSON.parse(stdout);
        samples.push(sample);
        note(`${method}: processCold=${sample.records[0].durationMs} ms; warm=${sample.records.slice(1).map(item => item.durationMs).join(',')} ms; reads=${sample.records[0].readCalls}/${sample.records[0].readBytes} bytes; return=${sample.records[0].returnBytes} bytes`);
    }
    const evidence = {
        schemaVersion: 1, measuredAt: new Date().toISOString(), sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repo, encoding: 'utf8'}).trim(),
        environment: {platform: process.platform, arch: process.arch, node: process.version, osRelease: os.release(), cpuModel: os.cpus()[0].model, logicalCpus: os.cpus().length, memoryGiB: round(os.totalmem() / 1024 ** 3)},
        scope: 'Real DesktopController + in-process execute worker + file library; excludes Electron utility-process IPC, rendering, host plugins and production claims.',
        cache: 'processCold is first measured operation in a fresh Node process after loading its isolated binding. warm repeats in that process. OS page cache was not purged; seeding and preceding samples may warm it. No application cache is introduced.',
        io: 'readFileSync counts/bytes are logical synchronous application reads including worker code in this process, not physical device I/O; lstatSync/readdirSync calls are also counted. Async binding initialization and JSON serialization are outside durationMs; serializeMs is separate.',
        fixture: {...counts, bodyUtf8Bytes: Buffer.byteLength(body), plans: counts.contents * counts.plansPerContent, candidateReferences: counts.contents * counts.candidatesPerContent, uniqueRasterAssets: assets.length, rasterPixels: {width: 720, height: 960}, totalUniqueRasterBytes: assets.reduce((sum, asset) => sum + asset.bytes, 0), seedMs, retainedAt: path.relative(repo, root)},
        limitations: ['Synthetic content; six shared solid-color full-decode PNGs reduce fixture disk use and do not model photographic entropy or hundreds of unique images.', 'No cover jobs, templates, photo records, collections, or trash in this fixture.', 'Only one Mac and one dataset size; no commercial capacity or smoothness guarantee.'],
        samples
    };
    const output = path.join(repo, 'docs/verification/production/2026-10-19-mac-capacity-01');
    await fsp.mkdir(path.dirname(output), {recursive: true});
    await fsp.writeFile(`${output}.json`, JSON.stringify(evidence, null, 2) + '\n');
    await fsp.writeFile(`${output}.log`, [...log, '', evidence.scope, evidence.cache, evidence.io, ...evidence.limitations].join('\n') + '\n');
    note(`saved ${path.relative(repo, output)}.{json,log}; fixture kept in ${path.relative(repo, root)}`);
}
