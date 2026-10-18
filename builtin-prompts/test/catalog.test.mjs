import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const catalog = JSON.parse(await readFile(new URL('../catalog.json', import.meta.url), 'utf8'));
const requiredFields = ['id', 'version', 'title', 'category', 'when', 'summary', 'tags', 'body', 'provenance'];
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

test('catalog has a supported version and 26 uniquely identified prompts', () => {
    assert.equal(catalog.format, 'nova-content-prompts');
    assert.equal(catalog.schemaVersion, 1);
    assert.ok(Number.isInteger(catalog.version) && catalog.version > 0);
    assert.ok(Array.isArray(catalog.prompts));
    assert.equal(catalog.prompts.length, 26);
    assert.equal(new Set(catalog.prompts.map(prompt => prompt.id)).size, catalog.prompts.length);
    assert.equal(new Set(catalog.prompts.map(prompt => prompt.title)).size, catalog.prompts.length);
    assert.equal(new Set(catalog.prompts.map(prompt => prompt.body)).size, catalog.prompts.length);
});

test('every prompt has usable metadata and original project provenance', () => {
    for (const prompt of catalog.prompts) {
        assert.deepEqual(Object.keys(prompt).sort(), [...requiredFields].sort(), prompt.id);
        assert.match(prompt.id, /^builtin-prompt-[a-z0-9]+(?:-[a-z0-9]+)*$/);
        assert.ok(Number.isInteger(prompt.version) && prompt.version > 0, prompt.id);
        for (const field of ['title', 'category', 'when', 'summary', 'body']) {
            assert.ok(nonempty(prompt[field]), `${prompt.id}: ${field}`);
        }
        assert.ok(Array.isArray(prompt.tags) && prompt.tags.length > 0, prompt.id);
        assert.ok(prompt.tags.every(nonempty), prompt.id);
        assert.equal(new Set(prompt.tags).size, prompt.tags.length, prompt.id);
        assert.deepEqual(prompt.provenance, {
            origin: 'original', creator: 'Nova Content Hub', license: 'project-original',
        }, prompt.id);
    }
});

test('variables use complete, simple placeholders without a duplicated variable schema', () => {
    for (const prompt of catalog.prompts) {
        const variables = [...prompt.body.matchAll(/\{\{([^{}|\n]+)\|([^{}|\n]+)\}\}/gu)];
        assert.ok(variables.length >= 1 && variables.length <= 3, `${prompt.id}: 1–3 variables`);
        const names = variables.map(([, name]) => name);
        assert.equal(new Set(names).size, names.length, `${prompt.id}: duplicate variable`);
        for (const [, name, hint] of variables) {
            assert.equal(name, name.trim(), prompt.id);
            assert.equal(hint, hint.trim(), prompt.id);
            assert.ok(name.length <= 12 && hint.length <= 40, `${prompt.id}: short name and hint`);
            assert.doesNotMatch(`${name}${hint}`, /(?:\/Users\/|[A-Za-z]:\\|https?:\/\/)/u, prompt.id);
        }
        const plainBody = prompt.body.replace(/\{\{([^{}|\n]+)\|([^{}|\n]+)\}\}/gu, '');
        assert.doesNotMatch(plainBody, /[{}]/u, `${prompt.id}: incomplete placeholder`);
        assert.ok(!Object.hasOwn(prompt, 'variables'), prompt.id);
    }
});
