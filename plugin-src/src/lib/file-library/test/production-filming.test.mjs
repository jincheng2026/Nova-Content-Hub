import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createLibrary} from '../index.mjs';
import {defaultProductionCreation, validProductionCreation} from '../production.mjs';

function fixture(t, body = 'Unique tutorial line. Next step.') {
    const temp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'nova-filming-test-'));
    t.after(() => fs.rmSync(temp, {recursive: true, force: true}));
    const lib = createLibrary(path.join(temp, 'library'));
    const content = lib.createContent({title: 'tutorial', body});
    lib.mutateProduction('ensureCreation', {contentId: content.id, expectedToken: lib.readProduction().editToken});
    const read = () => lib.readProductionCreation(content.id);
    const save = (body, filming) => {const current = read(); return lib.saveProductionDraft(content.id, {body, expectedBodyHash: current.content.bodyHash, expectedProductionToken: current.productionToken, creationPatch: {filming}}, current.content.editToken);};
    return {lib, content, read, save};
}
const shot = (quote = 'Unique tutorial line.') => ({id: randomUUID(), quote, visual: 'Show the settings panel', owner: 'screen', done: false});
const filming = (shots = []) => ({shots, readThroughBodyHash: null, recordedBodyHash: null});

test('legacy creations without filming remain valid and persist through current draft saves', t => {
    const old = defaultProductionCreation(randomUUID(), 1, new Date().toISOString());
    delete old.filming;
    assert.equal(validProductionCreation(old), true);
    const {lib, content, read} = fixture(t);
    // Simulate a library created before the optional filming field existed.
    const file = path.join(lib.info.root, '库配置', 'default', '配置.json');
    const meta = JSON.parse(fs.readFileSync(file, 'utf8'));
    delete meta.production.creations[0].filming;
    fs.writeFileSync(file, JSON.stringify(meta));
    const current = read();
    assert.equal(Object.hasOwn(current.creation, 'filming'), false);
    lib.saveProductionDraft(content.id, {body: current.content.body, expectedBodyHash: current.content.bodyHash, expectedProductionToken: current.productionToken, creationPatch: {analysis: 'legacy analysis preserved'}}, current.content.editToken);
    assert.equal(read().creation.analysis, 'legacy analysis preserved');
    assert.equal(Object.hasOwn(read().creation, 'filming'), false);
});

test('filming schema rejects bad hashes, duplicate IDs, invalid owners and missing fields', () => {
    const creation = defaultProductionCreation(randomUUID(), 1, new Date().toISOString());
    assert.equal(validProductionCreation(creation), true);
    for (const bad of [{...filming(), readThroughBodyHash: 'not-a-hash'}, {...filming(), recordedBodyHash: 'G'.repeat(64)}, {...filming(), shots: [{...shot(), owner: 'someone'}]}, {...filming(), shots: [{...shot(), done: 'yes'}]}, {shots: []}]) assert.equal(validProductionCreation({...creation, filming: bad}), false);
    const one = shot();
    assert.equal(validProductionCreation({...creation, filming: filming([one, {...one}])}), false);
});

test('confirmations bind the exact current body, survive same-body edits and become stale after body changes', t => {
    const {read, save} = fixture(t);
    const current = read(), value = {...filming([{...shot(), done: true}]), readThroughBodyHash: current.content.bodyHash, recordedBodyHash: current.content.bodyHash};
    save(current.content.body, value);
    assert.equal(read().creation.filming.readThroughBodyHash, read().content.bodyHash);
    assert.equal(read().creation.filming.recordedBodyHash, read().content.bodyHash);
    save(current.content.body, {...value, shots: [{...value.shots[0], visual: 'Updated camera action'}]});
    assert.equal(read().creation.filming.readThroughBodyHash, read().content.bodyHash);
    save(current.content.body + ' Revised.', value);
    assert.notEqual(read().creation.filming.readThroughBodyHash, read().content.bodyHash);
    assert.notEqual(read().creation.filming.recordedBodyHash, read().content.bodyHash);
    const latest = read();
    assert.throws(() => save(latest.content.body, {...value, recordedBodyHash: '0'.repeat(64)}), {code: 'INVALID_INPUT'});
    save(latest.content.body, {...value, readThroughBodyHash: latest.content.bodyHash, recordedBodyHash: latest.content.bodyHash});
    assert.equal(read().creation.filming.recordedBodyHash, read().content.bodyHash);
});

test('new or changed shot quotes must uniquely match the current body; existing stale references are retained', t => {
    const {read, save} = fixture(t);
    assert.throws(() => save(read().content.body, filming([shot('not in the body')])), {code: 'INVALID_INPUT'});
    const value = filming([shot()]);
    save(read().content.body, value);
    save('Entirely changed body.', value);
    assert.equal(read().creation.filming.shots[0].quote, 'Unique tutorial line.');
    assert.throws(() => save(read().content.body, filming([{...value.shots[0], quote: 'not in the new body'}])), {code: 'INVALID_INPUT'});
    const overlapping = fixture(t, 'aaa');
    assert.throws(() => overlapping.save('aaa', filming([shot('aa')])), {code: 'INVALID_INPUT'});
});
