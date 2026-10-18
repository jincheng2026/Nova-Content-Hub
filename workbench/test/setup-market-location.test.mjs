import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Setup} from '../src/main/setup.mts';

test('installation copy supplies the selected host exact manifest or folder without manual path edits', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-setup-location-'));
    t.after(() => fs.rm(root, {recursive: true, force: true}));
    const release = {format: 'nova-content-desktop-release', schemaVersion: 1, AUTH_MODE: 'disabled', appScope: 'nova-content-hub', productId: 'nova-content-hub', version: '0.2.0', protocolVersion: 1, pairId: 'nova-content-hub@0.2.0:p1:disabled', platform: process.platform, arch: process.arch, experimental: true, productionReady: false};
    const name = `nova-content-hub-auth-disabled-${process.platform}-${process.arch}`;
    const files = [
        ['nova-content-hub/plugin-src/src/release.json', {...release, format: 'nova-content-plugin-release'}],
        ['.agents/plugins/marketplace.json', {name, plugins: [{name: 'nova-content-hub', source: {source: 'local', path: './nova-content-hub'}}]}],
        ['.codebuddy-plugin/marketplace.json', {name, plugins: [{name: 'nova-content-hub', source: './nova-content-hub', version: release.version}]}]
    ];
    for (const [relative, data] of files) { const file = path.join(root, relative); await fs.mkdir(path.dirname(file), {recursive: true}); await fs.writeFile(file, JSON.stringify(data)); }
    const copied = []; let host = 'codex';
    const setup = new Setup({release, marketRoot: root, assistant: async () => ({host, ready: false, skill: null, reason: 'skill-missing'}), clipboard: {writeText: text => copied.push(text)}, shell: {openExternal: async () => {}, openPath: async () => ''}, saveDiagnosticDialog: async () => null, contextSummary: () => ({bindingPresent: false})});
    await setup.copyPluginMarketLocation();
    host = 'workbuddy'; await setup.copyPluginMarketLocation();
    assert.deepEqual(copied, [path.join(root, '.agents/plugins/marketplace.json'), root]);
    await fs.writeFile(path.join(root, 'nova-content-hub/plugin-src/src/release.json'), '{}');
    await assert.rejects(setup.copyPluginMarketLocation(), {code: 'MARKET_MISMATCH'});
    assert.equal(copied.length, 2);
});
