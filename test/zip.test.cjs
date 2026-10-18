const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Zip = require('../原型/shared/zip.js');
const readZip = require('./zip-tools.cjs');

test('ZIP STORE exports real PNG bytes and UTF8 names accepted by independent unzip with CRC checks', async () => {
    const png = fs.readFileSync('原型/图库/AI参考/geometry-v3.png');
    const entries = [{
        name: 'builtin-geometry-ai-reference-v3.png',
        data: new Uint8Array(png)
    }, {name: '组内参考-二.bin', data: new Uint8Array([0, 255, 1, 128, 42])}];
    const archive = Zip.create(entries);
    assert.equal(archive.type, 'application/zip');
    const actual = await readZip(archive);
    assert.deepEqual([...actual.keys()], entries.map(e => e.name));
    for (const entry of entries) assert.deepEqual(actual.get(entry.name), Buffer.from(entry.data));
    const corrupted = new Uint8Array(await archive.arrayBuffer());
    corrupted[30 + Buffer.byteLength(entries[0].name) + 100] ^= 1;
    await assert.rejects(readZip(new Blob([corrupted])), /bad CRC/);
});

test('ZIP rejects empty groups, unsafe or duplicate filenames, and non-byte payloads', () => {
    const data = new Uint8Array([1]);
    for (const entries of [[], [{name: '../private.png', data}], [{name: 'a\\b.png', data}], [{
        name: 'a.png',
        data
    }, {name: 'a.png', data}], [{name: 'a.png', data: 'image'}]]) assert.throws(() => Zip.create(entries), /ZIP/);
});
