import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {syncBridge} from '../scripts/sync-bridge.mjs';

const source = new URL('../', import.meta.url);
test('canonical plugin core is independent of the workbench and all 72 resource hashes remain exact', async () => {
    await syncBridge(true);
    for (const relative of ['src/lib/browser-import/inspect.mjs', 'src/lib/browser-import/resources.mjs', 'src/lib/library-seed/index.mjs', 'src/lib/browser-import/legacy/core.js']) {
        assert.doesNotMatch(fs.readFileSync(new URL(relative, source), 'utf8'), /(?:from\s*|require\s*\()\s*['"][^'"]*workbench/);
    }
    const catalog = JSON.parse(fs.readFileSync(new URL('src/lib/browser-import/builtin-resources.json', source)));
    assert.equal(Object.keys(catalog.entries).length, 72);
    for (const [relative, entry] of Object.entries(catalog.entries)) {
        const bytes = fs.readFileSync(new URL(`resources/${relative}`, source));
        assert.equal(bytes.length, entry.bytes, relative);
        assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, relative);
    }
});
