import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Preferences} from '../src/main/preferences.mts';
import {defaultPreferences} from '../src/shared/preferences-validation.ts';

async function fixture(t, values) {
    const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'nova-preferences-'));
    t.after(() => fs.rm(root, {recursive: true, force: true}));
    const file = path.join(root, 'preferences.json');
    const bytes = JSON.stringify({version: 1, values});
    await fs.writeFile(file, bytes);
    const loginWrites = [];
    const preferences = new Preferences({file, platform: 'darwin', login: {
        isPackaged: true,
        getLoginItemSettings: () => ({openAtLogin: true}),
        setLoginItemSettings: settings => loginWrites.push(settings),
    }});
    return {file, bytes, preferences, loginWrites};
}

test('retired motion field accepts either saved boolean without changing reminder/login settings or the file', async t => {
    const active = {remindersEnabled: true, reminderTime: '18:45', startAtLogin: true};
    for (const reducedMotion of [true, false]) {
        const f = await fixture(t, {...active, reducedMotion});
        await f.preferences.initialize();
        assert.deepEqual(f.preferences.readPreferences().values, active);
        assert.equal(f.preferences.readPreferences().login.state, 'on');
        assert.equal(await fs.readFile(f.file, 'utf8'), f.bytes);
        assert.deepEqual(f.loginWrites, []);
        const saved = {...active, reminderTime: '19:15'};
        await f.preferences.savePreferences(saved);
        assert.deepEqual(JSON.parse(await fs.readFile(f.file, 'utf8')), {version: 1, values: saved});
        const reopened = new Preferences({file: f.file, login: f.preferences.login, platform: 'darwin'});
        await reopened.initialize();
        assert.deepEqual(reopened.readPreferences().values, saved);
    }
});

test('current settings round-trip and new saves reject the retired field', async t => {
    const values = defaultPreferences(), f = await fixture(t, values);
    assert.equal(Object.hasOwn(values, 'reducedMotion'), false);
    await f.preferences.initialize();
    assert.deepEqual(f.preferences.readPreferences().values, values);
    await assert.rejects(f.preferences.savePreferences({...values, reducedMotion: true}), {code: 'INVALID_INPUT'});
    assert.equal(await fs.readFile(f.file, 'utf8'), f.bytes);
    assert.deepEqual(f.loginWrites, []);
});

test('legacy compatibility still rejects invalid and unexpected fields while preserving the original file', async t => {
    for (const values of [
        {...defaultPreferences(), reducedMotion: 'true'},
        {...defaultPreferences(), reducedMotion: true, unexpected: true},
        {...defaultPreferences(), reducedMotion: true, reminderTime: '25:00'},
        {reducedMotion: true, remindersEnabled: true, reminderTime: '09:00'},
    ]) {
        const f = await fixture(t, values);
        await assert.rejects(f.preferences.initialize(), {code: 'PREFERENCES_UNAVAILABLE'});
        assert.throws(() => f.preferences.readPreferences(), {code: 'PREFERENCES_UNAVAILABLE'});
        await assert.rejects(f.preferences.savePreferences(defaultPreferences()), {code: 'PREFERENCES_UNAVAILABLE'});
        assert.equal(await fs.readFile(f.file, 'utf8'), f.bytes);
        assert.deepEqual(f.loginWrites, []);
    }
});
