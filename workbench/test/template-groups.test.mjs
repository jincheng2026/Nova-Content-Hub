import test from 'node:test';
import assert from 'node:assert/strict';
import {groupTemplates} from '../src/shared/template-groups.ts';
const template = (id, builtin = false, parent = null) => ({id, builtin, derivedFrom: parent ? {id: parent, version: 1} : null, name: id, description: '', samples: [{}], catalogStatus: builtin ? 'default' : 'custom'});
test('builtin working copies and multi-version custom roots form mutually exclusive origins', () => {
 const roots = ['seven', 'ai', 'qiu'].map(id => template(id, true));
 const groups = groupTemplates([...roots, ...roots.map(root => template(root.id + '-copy', false, root.id)), template('mine'), template('mine-copy', false, 'mine')]);
 assert.equal(groups.length, 4);assert.equal(groups.filter(group => group.origin === 'mine').length, 1);assert.equal(groups.filter(group => group.origin === 'builtin').length, 3);
 assert.deepEqual(groups.find(group => group.origin === 'mine').members.map(item => item.id), ['mine', 'mine-copy']);
});
test('deleted and legacy authoritative roots classify surviving copies without becoming selectable', () => {
 const facts = [{...template('legacy', true), catalogStatus: 'legacy'}, {...template('deleted', true), deletedAt: '2026-10-27'}];
 const copies = [template('old-copy', false, 'legacy'), template('deleted-copy', false, 'deleted'), template('nested', false, 'old-copy')];
 const groups = groupTemplates(copies, [...facts, ...copies]);
 assert.deepEqual(groups.map(group => [group.sourceId, group.origin, group.members.length]), [['legacy','builtin',2],['deleted','builtin',1]]);
});
test('missing roots and cycles remain visible with unknown origin instead of inventing user ownership', () => {
 const orphan = template('orphan', false, 'missing'), sibling = template('sibling', false, 'missing');
 const cycle = [template('a', false, 'b'), template('b', false, 'a')];
 const groups = groupTemplates([orphan,sibling,...cycle]);
 assert.deepEqual(groups.map(group => [group.sourceId, group.origin, group.members.length]), [['missing','unknown',2],['a','unknown',2]]);
});
test('authoritative library facts win over asset snapshots and ordering never replaces the root representative', () => {
 const root = template('root'), copy = template('copy', false, 'root');
 const groups = groupTemplates([copy,root], [template('root', true),copy]);
 assert.equal(groups[0].origin,'builtin');assert.equal(groups[0].source.id,'root');
});
