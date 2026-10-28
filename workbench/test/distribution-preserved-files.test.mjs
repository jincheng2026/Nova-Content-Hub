import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {copyFiles, getFileMatchers} from 'app-builder-lib/out/fileMatcher.js';
import {snapshotPackage} from '../../plugin-src/scripts/marketplace-builder.mjs';
import {installerConfig} from '../scripts/dist.mjs';

const placeholder = 'nova-content-hub/skills/jc-cover-design/upstream/current/assets/.gitkeep';

for (const platform of ['darwin', 'win32']) for (const arch of ['arm64', 'x64']) {
    for (const [channel, auth] of [['local', 'disabled'], ['preview', 'disabled'], ['testing', 'required']]) {
        test(`${platform}-${arch} ${channel} builder copy preserves the sealed cover placeholder and normal payload`, async t => {
            const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-preserved-marketplace-'));
            t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
            const source = path.join(directory, 'sealed-marketplace');
            const destination = path.join(directory, 'resources');
            fs.mkdirSync(path.dirname(path.join(source, placeholder)), {recursive: true});
            fs.writeFileSync(path.join(source, placeholder), '');
            fs.writeFileSync(path.join(source, path.dirname(placeholder), 'payload.bin'), Buffer.from([0, 1, 127, 128, 255]));
            const sealed = await snapshotPackage(source);

            // Retain the real installer mappings and filters, relocating only their sealed source root.
            const config = installerConfig({platform, arch, channel, auth}, '0.5.1');
            const market = config.extraResources.find(resource => resource.to === 'plugin-marketplace');
            const extraResources = config.extraResources
                .filter(resource => resource.to === 'plugin-marketplace' || resource.to.startsWith('plugin-marketplace/'))
                .map(resource => ({...resource, from: path.join(source, path.relative(market.from, resource.from))}));
            const matchers = getFileMatchers({...config, extraResources}, 'extraResources', destination, {
                macroExpander: value => value,
                defaultSrc: directory,
                customBuildOptions: config[platform === 'darwin' ? 'mac' : 'win'],
                globalOutDir: path.join(directory, 'output')
            });
            await copyFiles(matchers);

            assert.deepEqual(await snapshotPackage(path.join(destination, 'plugin-marketplace')), sealed);
        });
    }
}
