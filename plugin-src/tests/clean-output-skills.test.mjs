import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = file => fs.readFile(new URL('../' + file, import.meta.url), 'utf8');

test('new-cover tool prompt has a clean-original-generation suffix and preserves fixed input', async () => {
    const reference = await read('references/media-template.md');
    const suffix = reference.match(/## 新创封面的干净输出[\s\S]*?```text\n([\s\S]*?)\n```/)[1];
    const request = {prompt: '标题逐字为“我的封面”，参考蓝色样张。', requestHash: 'fixed-request-hash'};
    const original = structuredClone(request);
    const actualToolPrompt = request.prompt + '\n\n' + suffix;
    assert.deepEqual(request, original);
    for (const rule of ['干净的原创封面', 'AI生成', 'WorkBuddy', 'Codex', '不复制其中的平台或工具水印', '不是修改现有图片去水印']) assert.ok(actualToolPrompt.includes(rule), rule);
    for (const skill of ['nova-content-cover', 'nova-content-cover-execution']) {
        const text = await read(`skills/${skill}/${skill.endsWith('-execution') ? 'execution-contract.md' : 'SKILL.md'}`);
        assert.match(text, /“新创封面的干净输出”提示.*追加到实际生图提示末尾/);
        assert.match(text, /不(?:回写固定请求|改写 request.prompt)/);
        assert.match(text, /SHA256/);
        assert.match(text, /不裁切、缩放、重编码|不得.*裁切、缩放、拉伸、重编码/);
        assert.match(text, /不能保证关闭/);
    }
});

test('restoration keeps source marks and unmodified tool bytes rather than applying clean-output removal', async () => {
    for (const skill of ['nova-content-template-execution', 'nova-content-template-restore']) {
        const text = await read(`skills/${skill}/${skill.endsWith('-execution') ? 'execution-contract.md' : 'SKILL.md'}`);
        assert.match(text, /来源原图与已有来源标记保留为.*对照基线/);
        assert.match(text, /不额外(?:绘入|添加).*工具品牌或.*水印/);
        assert.match(text, /SHA256/);
        assert.match(text, /不能保证关闭/);
        assert.match(text, /不裁切、缩放、重编码|不得.*裁切、缩放、拉伸、重编码/);
    }
    assert.match(await read('skills/nova-content-template-study/SKILL.md'), /保留原图及已有标记.*不裁改或去除/);
});
