import test from 'node:test';
import assert from 'node:assert/strict';
import {researchTaskTitle} from '../src/shared/research-depth.ts';
test('a research question supplies a bounded title when the optional title is blank',()=>{
 assert.equal(researchTaskTitle('', '  比较 AI 教程账号\n 的表达  '),'比较 AI 教程账号 的表达');
 assert.equal(researchTaskTitle(' 用户自定标题 ', '研究方向'),'用户自定标题');
 assert.equal(researchTaskTitle('', '长'.repeat(100000)).length,80);
});
