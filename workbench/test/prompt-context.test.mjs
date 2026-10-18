import test from 'node:test';
import assert from 'node:assert/strict';
import {promptPreview} from '../src/renderer/workspace-model.ts';

test('saved content is appended only after explicit inclusion and never treated as prompt variables', () => {
    const values = {方向: '给初学者讲清楚'};
    const content = {title: '私密标题 {{保留原文}}', body: '正文第一行\n正文第二行'};
    const original = structuredClone({values, content});
    const body = '请按这个方向改写：{{方向|填写方向}}';
    assert.equal(promptPreview(body, values, content), '请按这个方向改写：给初学者讲清楚');
    assert.equal(promptPreview(body, values, content, false), '请按这个方向改写：给初学者讲清楚');
    assert.equal(promptPreview(body, values, content, true), '请按这个方向改写：给初学者讲清楚\n\n本次参考内容\n标题：私密标题 {{保留原文}}\n正文：\n正文第一行\n正文第二行');
    assert.equal(promptPreview(body, values, null, true), '请按这个方向改写：给初学者讲清楚');
    assert.deepEqual({values, content}, original);
});
