import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createLibrary, openLibrary} from '../../file-library/index.mjs';

// Temporary synthetic data only; compare I/O work, not a commercial latency promise.
const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nch-history-benchmark-'));
const originalRead = fs.readFileSync;
try {
    const library = createLibrary(path.join(parent, '内容库'));
    const body = '内容历史基准。'.repeat(4096);
    let content = library.createContent({title: 'history benchmark', body});
    for (let i = 0; i < 40; i++) {
        content = library.updateContent(content.id, {title: `revision ${i}`}, content.editToken);
    }
    let calls = 0, bytes = 0, historicalIntents = 0;
    fs.readFileSync = function (file, ...args) {
        const value = originalRead.call(this, file, ...args);
        calls++;
        bytes += Buffer.byteLength(value);
        if (typeof file === 'number') {
            // Descriptor-based reads are identified by data shape without exposing file paths.
            const text = value.toString('utf8');
            if (text.includes('"requestDigest"') && text.includes('"before"')) historicalIntents++;
        }
        return value;
    };

    function measure(fn) {
        calls = 0;
        bytes = 0;
        historicalIntents = 0;
        const start = performance.now();
        const value = fn();
        return {
            value, metrics: {
                readCalls: calls, bytesRead: bytes, historicalIntentsRead: historicalIntents,
                milliseconds: Number((performance.now() - start).toFixed(2))
            }
        };
    }

    const startup = measure(() => openLibrary(library.info.root));
    assert.equal(startup.value.info.libraryId, library.info.libraryId);
    const reading = measure(() => startup.value.readContent(content.id));
    const current = reading.value;
    fs.readFileSync = originalRead;
    assert.equal(current.body, body);
    assert.equal(current.revision, 41);
    assert.equal(current.title, 'revision 39');
    console.log(JSON.stringify({
        platform: process.platform, arch: process.arch, node: process.version,
        revisions: 41, bodyBytes: Buffer.byteLength(body), startup: startup.metrics, currentRead: reading.metrics,
    }, null, 2));
} finally {
    fs.readFileSync = originalRead;
    fs.rmSync(parent, {recursive: true, force: true});
}
