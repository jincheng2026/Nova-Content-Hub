const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Ajv2020 = require('ajv/dist/2020.js');
const catalog = require('../builtin-templates/catalog.json');
const oldV3 = require('../builtin-templates/legacy-v3.json');
const oldComplete = require('../builtin-templates/legacy-v2-complete.json');
const read = file => fs.readFileSync(path.join(__dirname, '..', file));
const clone = value => JSON.parse(JSON.stringify(value));
const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addFormat('date-time', value => Number.isFinite(Date.parse(value)));
for (const file of fs.readdirSync(path.join(__dirname, '../schemas')).filter(file => file.endsWith('.schema.json'))) ajv.addSchema(JSON.parse(read('schemas/' + file)));
const validate = ajv.getSchema('https://nova-content-hub.local/schemas/template-catalog.schema.json');

test('v4 has fifteen directly selectable PNG previews and keeps honest reference provenance', () => {
  assert.equal(catalog.version, 4);
  assert.equal(catalog.templates.length, 15);
  assert.equal(catalog.templates.filter(t => t.audience === 'general').length, 11);
  assert.equal(catalog.templates.filter(t => t.audience === 'ai').length, 4);
  assert.equal(validate(catalog), true, JSON.stringify(validate.errors));
  let reused = 0, added = 0;
  for (const template of catalog.templates) {
    assert.equal(template.version, 4); assert.equal(template.definitionVersion, 4);
    const previous = oldComplete.templates.find(t => t.id === template.id);
    const reference = template.generatedReferences[0];
    assert.equal(template.generatedReferences.length, 2);
    assert.equal(template.img, reference.path);
    assert.deepEqual(template.shots, template.generatedReferences.map(r=>r.path));
    assert.equal(template.validation.referenceImage, reference.path);
    assert.equal(template.validation.aiTested, false); assert.equal(template.provenance.aiTested, false);
    assert.equal(reference.accepted, false);
    assert.deepEqual(template.generatedReferences[0],oldV3.templates.find(t=>t.id===template.id).generatedReferences[0]);
    assert.equal(template.generatedReferences[1].templateVersion,4);
    if (previous) {
      assert.deepEqual(template.assets, previous.assets);
      assert.deepEqual(template.spec, previous.spec);
    }
    if (previous?.generatedReferences.length) {
      assert.deepEqual(template.generatedReferences[0], previous.generatedReferences[0]);
      reused++;
    } else {
      assert.equal(reference.templateVersion, 3);
      assert.equal(reference.path, `图库/AI参考/${template.recipe}-v3.png`);
      added++;
    }
    assert.deepEqual(template.generation.variables.filter(v => v.required).map(v => v.key).sort(), ['ratio', 'title']);
    assert.match(template.generation.promptTemplate, /缺少依据时省略/);
    assert.match(template.generation.referencePolicy, previous ? /旧SVG仅作历史结构草图/ : /新SVG仅为原创结构示意/);
  }
  assert.equal(reused, 6); assert.equal(added, 9);
});

test('every PNG byte, real pixel size and prompt is recorded without claiming restore acceptance', () => {
  const records = require('../assets/ai-reference-prompts/generated-files.json');
  assert.equal(records.length, 30);
  assert.deepEqual(records.map(r => r.file).sort(), catalog.templates.flatMap(t => t.generatedReferences.map(r=>path.basename(r.path))).sort());
  for (const template of catalog.templates) for(const ref of template.generatedReferences) {
    const bytes = read('原型/' + ref.path);
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16), ref.width); assert.equal(bytes.readUInt32BE(20), ref.height);
    assert.equal(ref.width * 4, ref.height * 3);
    assert.ok(ref.width >= 1080 && ref.height >= 1440);
    const record = records.find(r => r.file === path.basename(ref.path));
    assert.equal(record.bytes, bytes.length);
    assert.equal(record.sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
    assert.ok(read(ref.promptFile).length > 100);
  }
});

test('all earlier complete definitions remain in the generated trusted legacy export', () => {
  const current = require('../原型/builtin-templates.js');
  assert.deepEqual(Array.from(current), catalog.templates);
  assert.equal(current.legacy.length, 45);
  assert.equal(current.legacy.filter(t => t.version === 1).length, 6);
  assert.equal(current.legacy.filter(t => t.version === 2).length, 24);
  for (const template of oldComplete.templates) assert.ok(current.legacy.some(old => JSON.stringify(old) === JSON.stringify(template)), template.id);
});

test('catalog schema distinguishes PNG previews from immutable SVG structure assets', () => {
  for (const mutate of [
    c => { c.templates[0].img = '../private.png'; },
    c => { c.templates[0].shots[0] = '图库/AI参考/other.jpg'; },
    c => { c.templates[0].assets[0].path = '图库/AI参考/geometry-v3.png'; },
    c => { c.templates[0].generatedReferences[0].accepted = true; },
    c => { c.templates[0].validation.aiTested = true; },
  ]) {
    const invalid = clone(catalog); mutate(invalid);
    assert.equal(validate(invalid), false);
  }
});

const creatorIds = ['builtin-tech-collage', 'builtin-big-head', 'builtin-life-story'];
test('the original twelve complete v3 definitions remain unchanged', () => {
  const originals = oldV3.templates.filter(t => !creatorIds.includes(t.id));
  assert.equal(originals.length, 12);
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(originals)).digest('hex'), 'a54cfe37b5417dbf8f2bdf615d743406fa385564238470cea644830c9a2b6310');
});

test('creator templates have original safe structures and explicit identity, wardrobe and no-photo boundaries', () => {
  assert.deepEqual(catalog.templates.filter(t => creatorIds.includes(t.id)).map(t => t.id), creatorIds);
  for (const id of creatorIds) {
    const t = catalog.templates.find(t => t.id === id);
    assert.equal(t.assets.length, 2); assert.equal(t.samples.length, 2);
    assert.notEqual(t.sourceTitle, t.referenceTitle);
    assert.equal(t.audience, id === 'builtin-tech-collage' ? 'ai' : 'general');
    assert.match(t.generation.subjectPolicy, /明确选中的本人照作为唯一身份依据/);
    assert.match(t.generation.subjectPolicy, /不继承样图人物的五官、发型或服装/);
    assert.match(t.generation.subjectPolicy, /未选本人照时可生成无人版/);
    assert.match(t.generation.subjectPolicy, /提示用户上传/);
    assert.match(t.generation.referencePolicy, /风格与构图参考/);
    assert.match(t.generation.referencePolicy, /身份参考/);
    assert.match(t.generation.referencePolicy, /服装参考/);
    assert.match(t.generation.promptTemplate, /安全边距.*手机可读.*手部、视线.*阴影/);
    for (const [i, asset] of t.assets.entries()) {
      assert.equal(asset.path, `图库/内置模板/${t.recipe}-v3-${asset.role}.svg`);
      const svg = read('原型/' + asset.path).toString();
      assert.match(svg, /width="900" height="1200"/);
      for (const line of t.samples[i].titleLines) assert.ok(svg.includes(line));
      assert.doesNotMatch(svg, /<(?:script|image|foreignObject)\b|\bon\w+\s*=|(?:href|url)\s*[=(]/i);
    }
  }
});

test('the full historical v3 catalog remains immutable after grouped v4 changes',()=>{
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(oldV3)).digest('hex'),'b786564bd9f429e16e7aae3327b0b2e97bab02a238b0262e0faa89d02a238252');
});
