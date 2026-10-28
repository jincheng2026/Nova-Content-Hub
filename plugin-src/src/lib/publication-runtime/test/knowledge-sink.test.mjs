import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createVault, createVaultDocument, readVaultSnapshot} from '../../vault/index.mjs';
import {digest, json, readBytes, writeJSON} from '../../vault/core.mjs';
import * as runtime from '../index.mjs';
const author = {
    actor: 'author',
    text: '核对平台实际版本',
    at: '2026-10-28T00:00:00Z'
};
function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publication-sink-'));
    t.after(() => fs.rmSync(root, {
        recursive: true,
        force: true
    }));
    const b = createVault(root);
    const d = createVaultDocument(b.root, {
        section: 'drafts',
        title: '例子',
        text: '完整原文第一段\n\n完整原文第二段'
    }, {
        mutationId: 'sink-initial-work'
    });
    return {
        root,
        runtime: b.root,
        work: {
            vaultId: readVaultSnapshot(b.root).vaultId,
            workId: d.document.tNumber
        }
    };
}
function record(f, extra = {}) {
    return runtime.recordPublication(f.runtime, {
        work: f.work,
        mutationId: 'sink-record-001',
        expectedRevision: runtime.readPublicationFacts(f.runtime, f.work).revision,
        publication: {
            platform: 'douyin',
            title: '真实标题',
            description: '真实简介',
            cover: 'cover.png',
            coverCopy: '真实封面文字',
            url: 'https://www.douyin.com/video/123',
            publishedAt: '2026-10-01T00:00:00Z',
            ...extra
        },
        finalScript: {
            text: '完整原文第一段\n\n完整原文第二段',
            hash: digest('完整原文第一段\n\n完整原文第二段')
        },
        contentPackageId: null,
        authorDecision: author
    });
}
function sync(f) {
    return runtime.syncPublicationKnowledge(f.runtime, {
        work: f.work,
        expectedRevision: runtime.readPublicationFacts(f.runtime, f.work).revision
    });
}
test('same record call deposits full source packaging and one ledger row without changing official files', t => {
    const f = fixture(t), r = record(f);
    assert.equal(r.deposition?.state, 'complete');
    const entry = readBytes(f.root, r.deposition.entryPath).toString();
    for (const literal of ['完整原文第一段\n\n完整原文第二段', '真实标题', '真实简介', '真实封面文字', 'https://www.douyin.com/video/123', '发布原文参考，以档案为准', '📌来源', '🎯应用']) assert.ok(entry.includes(literal), literal);
    const manifest = readBytes(f.root, r.directory + '/.system/manifest.json'), content = readBytes(f.root, r.directory + '/内容.md');
    assert.equal(sync(f).state, 'complete');
    assert.deepEqual(readBytes(f.root, r.directory + '/.system/manifest.json'), manifest);
    assert.deepEqual(readBytes(f.root, r.directory + '/内容.md'), content);
    assert.equal(readBytes(f.root, r.deposition.ledgerPath).toString().split('<!-- nova-publication:').length, 2);
    assert.equal(runtime.readPublicationFacts(f.runtime, f.work).knowledge.candidates.length, 0);
});
test('unknown cover copy is partial, explicit empty is complete and author supplementation resolves partial', t => {
    const f = fixture(t), r = record(f, {
        coverCopy: null
    });
    assert.equal(r.deposition?.state, 'partial');
    assert.deepEqual(r.deposition.missingFields, ['douyin.coverCopy']);
    const next = runtime.recordPublicationCoverCopy(f.runtime, {
        work: f.work,
        mutationId: 'sink-cover-copy-001',
        expectedRevision: runtime.readPublicationFacts(f.runtime, f.work).revision,
        platform: 'douyin',
        coverCopy: '',
        authorDecision: author
    });
    assert.equal(next.deposition.state, 'complete');
    assert.equal(runtime.readPublicationFacts(f.runtime, f.work).archive.manifest.platforms.douyin.cover_copy, '');
    assert.match(readBytes(f.root, next.deposition.entryPath).toString(), /明确无字/);
});
test('deposition refuses edited or deleted owned bytes and never overwrites other ledger text', t => {
    const f = fixture(t), r = record(f);
    assert.ok(r.deposition?.entryPath);
    const ledger = path.join(f.root, r.deposition.ledgerPath);
    fs.appendFileSync(ledger, '\n作者其他说明\n');
    assert.equal(sync(f).state, 'complete');
    assert.match(fs.readFileSync(ledger, 'utf8'), /作者其他说明/);
    const file = path.join(f.root, r.deposition.entryPath);
    fs.appendFileSync(file, '\n作者手改\n');
    assert.equal(sync(f).state, 'incomplete');
    assert.equal(runtime.readPublicationFacts(f.runtime, f.work).deposition.state, 'incomplete');
    assert.match(fs.readFileSync(file, 'utf8'), /作者手改/);
    fs.unlinkSync(file);
    assert.equal(sync(f).state, 'incomplete');
});
test('fixed source policy failure does not roll back official publication; remapping refuses silent migration', t => {
    for (const alter of [s => s.writable = false, s => s.authority = 'candidate', s => s.role = 'judgments', s => {
        s.mode = 'linked';
        s.root = '/tmp';
    }]) {
        const f = fixture(t), map = json(f.root, '.workbench/source-map.json');
        alter(map.sources.find(s => s.id === 'author-evidence'));
        writeJSON(f.root, '.workbench/source-map.json', map);
        const r = record(f);
        assert.equal(r.deposition?.state, 'incomplete');
        assert.equal(runtime.readPublicationFacts(f.runtime, f.work).archive.state, 'ready');
    }
    const f = fixture(t), r = record(f), map = json(f.root, '.workbench/source-map.json');
    map.sources.find(s => s.id === 'author-evidence').root = '09_创作知识/另一本人材料';
    fs.mkdirSync(path.join(f.root, '09_创作知识/另一本人材料'));
    writeJSON(f.root, '.workbench/source-map.json', map);
    assert.equal(sync(f).code, 'TARGET_CHANGED');
    assert.ok(fs.existsSync(path.join(f.root, r.deposition.entryPath)));
});
test('7d snapshot updates existing ledger row with real metrics and unknown remains dash', t => {
    const f = fixture(t), r = record(f);
    const result = runtime.importSnapshot(f.runtime, {
        work: f.work,
        mutationId: 'sink-snapshot-001',
        expectedRevision: runtime.readPublicationFacts(f.runtime, f.work).revision,
        platform: 'douyin',
        checkpoint: '7d',
        collectedAt: '2026-10-08T00:00:00Z',
        rawEvidence: '平台真实导出',
        metrics: {
            views: 123,
            likes: null
        },
        authorDecision: author
    });
    assert.equal(result.deposition?.state, 'complete');
    const ledger = readBytes(f.root, r.deposition.ledgerPath).toString();
    assert.match(ledger, /views=123/);
    assert.match(ledger, /likes=—/);
    assert.match(ledger, /7d/);
    assert.match(ledger, new RegExp(result.snapshotId));
    assert.equal(ledger.split('<!-- nova-publication:').length, 2);
});
test('each platform full script is retained and hash corruption refuses deposition', t => {
    const f = fixture(t), r = record(f);
    runtime.recordPublication(f.runtime, {
        work: f.work,
        mutationId: 'sink-record-other',
        expectedRevision: runtime.readPublicationFacts(f.runtime, f.work).revision,
        publication: {
            platform: 'xiaohongshu',
            title: '另一实际标题',
            description: '',
            cover: 'another.png',
            coverCopy: '',
            url: 'https://www.xiaohongshu.com/explore/123',
            publishedAt: '2026-10-01T01:00:00Z'
        },
        finalScript: {
            text: '小红书不同的完整稿件',
            hash: digest('小红书不同的完整稿件')
        },
        contentPackageId: null,
        authorDecision: author
    });
    assert.match(readBytes(f.root, r.deposition.entryPath).toString(), /小红书不同的完整稿件/);
    const location = r.directory + '/.system/manifest.json', m = json(f.root, location);
    m.platforms.douyin.nova.final_script.text = '篡改';
    writeJSON(f.root, location, m);
    assert.equal(sync(f).state, 'incomplete');
});
test('receipt paths remain within the fixed source even if a receipt is manually redirected', t => {
    const f = fixture(t), r = record(f), receiptPath = '.workbench/publication-sink/' + r.videoId + '.json', receipt = json(f.root, receiptPath);
    const foreignEntry = '09_创作知识/判断库/copied.md', foreignLedger = '09_创作知识/判断库/ledger.md';
    fs.copyFileSync(path.join(f.root, receipt.entryPath), path.join(f.root, foreignEntry));
    fs.copyFileSync(path.join(f.root, receipt.ledgerPath), path.join(f.root, foreignLedger));
    receipt.entryPath = foreignEntry;
    receipt.ledgerPath = foreignLedger;
    writeJSON(f.root, receiptPath, receipt);
    assert.equal(runtime.readPublicationFacts(f.runtime, f.work).deposition.state, 'incomplete');
    assert.equal(sync(f).state, 'incomplete');
});
test('stable entry path and single row survive platform title changes while handwritten ledger rows remain', t => {
    const f = fixture(t), r = record(f), beforeKnowledge = runtime.readPublicationFacts(f.runtime, f.work).knowledge;
    fs.appendFileSync(path.join(f.root, r.deposition.ledgerPath), '\n作者手写说明\n| 手写其他视频 | 保留 |\n');
    const manifest = r.directory + '/.system/manifest.json', m = json(f.root, manifest);
    m.title = '后来核对的真实标题';
    m.platforms.douyin.title = '后来核对的真实标题';
    writeJSON(f.root, manifest, m);
    assert.equal(runtime.readPublicationFacts(f.runtime, f.work).deposition.state, 'stale');
    const next = sync(f);
    assert.equal(next.state, 'complete');
    assert.equal(next.entryPath, r.deposition.entryPath);
    const ledger = readBytes(f.root, next.ledgerPath).toString();
    assert.match(ledger, /后来核对的真实标题/);
    assert.match(ledger, /作者手写说明/);
    assert.match(ledger, /手写其他视频/);
    assert.equal(ledger.split('<!-- nova-publication:').length, 2);
    assert.deepEqual(runtime.readPublicationFacts(f.runtime, f.work).knowledge, beforeKnowledge);
});
test('recovery uses frozen payload then reports stale source and refreshes the same entry', t => {
    const f = fixture(t), r = record(f), mid = fs.readdirSync(path.join(f.root, '.workbench/mutations')).find(name => name.startsWith('publication-sink-')), receipt = json(f.root, '.workbench/mutations/' + mid);
    for (const w of receipt.writes) fs.unlinkSync(path.join(f.root, w.relativePath));
    receipt.status = 'pending';
    writeJSON(f.root, '.workbench/mutations/' + mid, receipt);
    fs.rmSync(path.join(f.root, '.workbench/pending-mutations-index.json'), {
        force: true
    });
    const file = r.directory + '/.system/manifest.json', manifest = json(f.root, file);
    manifest.platforms.douyin.description = '崩溃后已核对的新简介';
    writeJSON(f.root, file, manifest);
    const facts = runtime.readPublicationFacts(f.runtime, f.work);
    assert.equal(facts.deposition.state, 'stale');
    assert.doesNotMatch(readBytes(f.root, r.deposition.entryPath).toString(), /崩溃后已核对的新简介/);
    const next = sync(f);
    assert.equal(next.state, 'complete');
    assert.equal(next.entryPath, r.deposition.entryPath);
    assert.match(readBytes(f.root, next.entryPath).toString(), /崩溃后已核对的新简介/);
});
test('duplicate ledger markers, hard links, and source-root replacements are rejected without overwrites', t => {
    for (const scenario of ['duplicate', 'hardlink', 'root']) {
        const f = fixture(t), r = record(f);
        if (scenario === 'duplicate') {
            const file = path.join(f.root, r.deposition.ledgerPath), line = fs.readFileSync(file, 'utf8').split('\n').find(line => line.includes('<!-- nova-publication:'));
            fs.appendFileSync(file, line + '\n');
        } else if (scenario === 'hardlink') {
            fs.linkSync(path.join(f.root, r.deposition.entryPath), path.join(f.root, '09_创作知识/判断库/hardlink.md'));
        } else {
            const source = path.join(f.root, '09_创作知识/本人材料');
            fs.renameSync(source, source + '-old');
            fs.mkdirSync(source);
        }
        assert.equal(sync(f).state, 'incomplete', scenario);
    }
});
test('sink failure before first write can be retried by the same publication call without duplicating the official platform', t => {
    const f = fixture(t), map = json(f.root, '.workbench/source-map.json');
    map.sources.find(s => s.id === 'author-evidence').writable = false;
    writeJSON(f.root, '.workbench/source-map.json', map);
    const initialRevision = runtime.readPublicationFacts(f.runtime, f.work).revision, r = record(f);
    assert.equal(r.deposition.state, 'incomplete');
    map.sources.find(s => s.id === 'author-evidence').writable = true;
    writeJSON(f.root, '.workbench/source-map.json', map);
    const result = runtime.recordPublication(f.runtime, {
        work: f.work,
        mutationId: 'sink-record-001',
        expectedRevision: initialRevision,
        publication: {
            platform: 'douyin',
            title: '真实标题',
            description: '真实简介',
            cover: 'cover.png',
            coverCopy: '真实封面文字',
            url: 'https://www.douyin.com/video/123',
            publishedAt: '2026-10-01T00:00:00Z'
        },
        finalScript: {
            text: '完整原文第一段\n\n完整原文第二段',
            hash: digest('完整原文第一段\n\n完整原文第二段')
        },
        contentPackageId: null,
        authorDecision: author
    });
    assert.equal(result.videoId, r.videoId);
    assert.equal(result.deposition.state, 'complete');
    assert.equal(Object.keys(runtime.readPublicationFacts(f.runtime, f.work).publication.platforms).length, 1);
});
test('pending sink recovery refuses a replaced destination root before writing frozen payload', t => {
    const f = fixture(t), r = record(f), mid = fs.readdirSync(path.join(f.root, '.workbench/mutations')).find(name => name.startsWith('publication-sink-')), receipt = json(f.root, '.workbench/mutations/' + mid);
    receipt.status = 'pending';
    writeJSON(f.root, '.workbench/mutations/' + mid, receipt);
    fs.rmSync(path.join(f.root, '.workbench/pending-mutations-index.json'), {
        force: true
    });
    const folder = path.join(f.root, '09_创作知识/本人材料');
    fs.renameSync(folder, folder + '-original');
    fs.mkdirSync(folder);
    const facts = runtime.readPublicationFacts(f.runtime, f.work);
    assert.equal(facts.deposition.state, 'incomplete');
    assert.deepEqual(fs.readdirSync(folder), []);
    assert.ok(facts.issues.some(issue => issue.includes('PENDING_MUTATION_CONFLICT')));
    assert.ok(fs.existsSync(path.join(folder + '-original', path.relative(folder, path.join(f.root, r.deposition.entryPath)))));
});
test('cover lettering cannot inject the formal document generated markers', t => {
    const f = fixture(t);
    assert.throws(() => record(f, {
        coverCopy: '<!-- jc:generated:start -->'
    }), error => error.code === 'INVALID_INPUT');
    assert.equal(runtime.readPublicationFacts(f.runtime, f.work).archive.state, 'missing');
});
test('already successful observer retry repairs a previously unavailable sink without another platform call', async t => {
    const f = fixture(t);
    record(f, {
        postId: '123'
    });
    runtime.enableObservation(f.runtime, {
        work: f.work,
        mutationId: 'sink-enable-observe',
        expectedRevision: runtime.readPublicationFacts(f.runtime, f.work).revision,
        enabled: true,
        provider: 'tikhub',
        maxRequestsPerCheckpoint: 1,
        maxUnits: 1,
        authorDecision: author
    });
    const due = runtime.readObservationDue(f.runtime)[0], reservation = runtime.reserveObservation(f.runtime, {
        work: f.work,
        mutationId: 'sink-reserve-observe',
        expectedRevision: due.revision,
        platform: due.platform,
        checkpoint: due.checkpoint,
        authorizationId: due.observation.authorizationId
    }), map = json(f.root, '.workbench/source-map.json');
    map.sources.find(s => s.id === 'author-evidence').writable = false;
    writeJSON(f.root, '.workbench/source-map.json', map);
    const input = {
        work: f.work,
        mutationId: 'sink-finish-observe',
        platform: due.platform,
        checkpoint: due.checkpoint,
        reservationId: reservation.reservationId,
        result: {
            state: 'succeeded',
            rawEvidence: '原平台唯一响应',
            metrics: {
                views: 33
            },
            collectedAt: new Date(Date.now() - 1000).toISOString(),
            serviceReceipt: {
                requestId: reservation.requestId
            }
        }
    };
    assert.equal(runtime.finishObservation(f.runtime, input).deposition.state, 'incomplete');
    map.sources.find(s => s.id === 'author-evidence').writable = true;
    writeJSON(f.root, '.workbench/source-map.json', map);
    assert.equal(runtime.finishObservation(f.runtime, input).deposition?.state, 'complete');
    assert.equal(runtime.readPublicationFacts(f.runtime, f.work).snapshots.length, 1);
});
test('an oversized resulting ledger never creates an unrecoverable pending sink or hides the committed official archive', t => {
    const f = fixture(t), ledger = '09_创作知识/本人材料/发布数据复盘.md';
    fs.writeFileSync(path.join(f.root, ledger), Buffer.alloc(8 * 1024 * 1024 - 8, 32));
    const result = record(f);
    assert.equal(result.deposition.state, 'incomplete');
    const facts = runtime.readPublicationFacts(f.runtime, f.work);
    assert.equal(facts.archive.state, 'ready');
    assert.equal(facts.publication.state, 'published');
    assert.equal(fs.readdirSync(path.join(f.root, '.workbench/mutations')).some(name => name.startsWith('publication-sink-')), false);
});
test('a real unwritable destination keeps committed publication readable and later recovers the frozen sink', {
    skip: process.platform === 'win32' || process.getuid?.() === 0
}, t => {
    const f = fixture(t), target = path.join(f.root, '09_创作知识/本人材料');
    fs.chmodSync(target, 0o555);
    t.after(() => {
        if (fs.existsSync(target)) fs.chmodSync(target, 0o755);
    });
    const result = record(f);
    assert.equal(result.deposition.state, 'incomplete');
    const before = runtime.readPublicationFacts(f.runtime, f.work);
    assert.equal(before.archive.state, 'ready');
    assert.equal(before.deposition.state, 'incomplete');
    assert.equal(before.publication.state, 'published');
    fs.chmodSync(target, 0o755);
    assert.equal(sync(f).state, 'complete');
    assert.equal(Object.keys(runtime.readPublicationFacts(f.runtime, f.work).publication.platforms).length, 1);
});
test('unrelated review metadata does not create a new sink mutation or rewrite copied bytes', t => {
    const f = fixture(t), r = record(f), before = readBytes(f.root, r.deposition.entryPath), names = fs.readdirSync(path.join(f.root, '.workbench/mutations')).filter(name => name.startsWith('publication-sink-'));
    const file = r.directory + '/.system/manifest.json', m = json(f.root, file);
    m.review = {
        ...m.review,
        status: 'draft',
        summary: '尚未确认的另一次复盘'
    };
    m.nova.observation = {
        enabled: true,
        mode: 'automatic'
    };
    writeJSON(f.root, file, m);
    assert.equal(sync(f).state, 'complete');
    assert.deepEqual(readBytes(f.root, r.deposition.entryPath), before);
    assert.deepEqual(fs.readdirSync(path.join(f.root, '.workbench/mutations')).filter(name => name.startsWith('publication-sink-')), names);
});
test('different Vaults with equal work numbers keep independent source identities and safe cross-platform filenames', t => {
    const a = fixture(t), b = fixture(t);
    assert.equal(a.work.workId, b.work.workId);
    for (const f of [a, b]) {
        const r = record(f, {
            title: 'CON:坏/标题\\<>|?* .'
        });
        assert.equal(r.deposition.state, 'complete');
        const name = path.posix.basename(r.deposition.entryPath);
        assert.equal((/[<>:"/\\|?*]/).test(name), false);
        assert.ok(name.endsWith('--' + r.videoId + '.md'));
        const ledger = readBytes(f.root, r.deposition.ledgerPath).toString();
        assert.ok(ledger.includes(f.work.vaultId));
        assert.ok(!ledger.includes(f === a ? b.work.vaultId : a.work.vaultId));
    }
});
test('concurrent processes retry one fixed publication into one entry and one ledger row', async t => {
    const {execFile} = await import('node:child_process'), {promisify} = await import('node:util'), execute = promisify(execFile), f = fixture(t), map = json(f.root, '.workbench/source-map.json');
    map.sources.find(s => s.id === 'author-evidence').writable = false;
    writeJSON(f.root, '.workbench/source-map.json', map);
    record(f);
    map.sources.find(s => s.id === 'author-evidence').writable = true;
    writeJSON(f.root, '.workbench/source-map.json', map);
    const revision = runtime.readPublicationFacts(f.runtime, f.work).revision, code = 'import {syncPublicationKnowledge} from ' + JSON.stringify(new URL('../index.mjs', import.meta.url).href) + '; const [runtime,work,expectedRevision]=process.argv.slice(1); console.log(JSON.stringify(syncPublicationKnowledge(runtime,{work:JSON.parse(work),expectedRevision})));';
    const results = await Promise.all([1, 2].map(() => execute(process.execPath, ['--input-type=module', '-e', code, f.runtime, JSON.stringify(f.work), revision])));
    for (const r of results) assert.ok(['complete', 'incomplete'].includes(JSON.parse(r.stdout).state));
    const next = sync(f);
    assert.equal(next.state, 'complete');
    assert.equal(readBytes(f.root, next.ledgerPath).toString().split('<!-- nova-publication:').length, 2);
    assert.equal(fs.readdirSync(path.join(f.root, '09_创作知识/本人材料/原始资料/口播视频')).filter(file => file !== 'README.md').length, 1);
});
test('moving the official pointer within the current archive source refreshes copied source links on the stable entry', t => {
    const f = fixture(t), r = record(f);
    const source = path.join(f.root, r.directory), moved = r.directory + '-moved';
    fs.cpSync(source, path.join(f.root, moved), {
        recursive: true
    });
    const navigation = fs.readdirSync(path.join(f.root, '05_内容草稿')).find(name => name.startsWith(f.work.workId));
    const pointer = '05_内容草稿/' + navigation + '/正式发布档案.json';
    const p = json(f.root, pointer);
    p.archiveDirectory = moved;
    writeJSON(f.root, pointer, p);
    assert.equal(runtime.readPublicationFacts(f.runtime, f.work).deposition.state, 'stale');
    const next = sync(f);
    assert.equal(next.state, 'complete');
    assert.equal(next.entryPath, r.deposition.entryPath);
    assert.ok(readBytes(f.root, next.entryPath).toString().includes(moved + '/内容.md'));
});
