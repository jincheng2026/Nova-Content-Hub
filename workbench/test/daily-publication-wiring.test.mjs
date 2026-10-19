import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('overview cover selection opens existing covers and keeps generation as a separate intent', () => {
  const app = fs.readFileSync(new URL('../src/renderer/app.tsx', import.meta.url), 'utf8');
  assert.match(app, /selectCover=\{item => void select\(item\)\}/);
  assert.match(app, /generate=\{item => void select\(item, undefined, true\)\}/);
  assert.match(app, /<CoverPanel arrangePublication=\{\(\) => void changeContentTab\('publication'\)\}/);
});
