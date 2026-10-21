import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const destination = fileURLToPath(new URL('../resources/colleague-library/', import.meta.url));
const source = process.argv[2];
const check = process.argv.includes('--check');
if (!source || source.startsWith('--')) throw Error('用法：node plugin-src/scripts/import-colleague-resources.mjs <交接包内容工作台目录> [--check]');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const groups = [
    ['AI大白话', 'assistant-scene', '助手同框风', 19],
    ['秋芝', 'big-head-action', '大头动作风', 30],
    ['科技姐聊AI', 'spatial-operation', '空间操作风', 25],
    ['鹿一家', 'orange-green-life', '橙绿生活海报', 30],
    ['Seven研究社', 'news-collage', '蓝紫新闻拼贴', 23]
];
const files = [];
const outputs = new Map();
function retain(relative) {
    const bytes = fs.readFileSync(path.join(source, relative));
    const target = `sources/${relative}`;
    outputs.set(target, bytes);
    const descriptor = {path: target, sourcePath: relative, bytes: bytes.length, sha256: hash(bytes)};
    files.push(descriptor);
    return descriptor;
}
const templates = groups.map(([author, key, style, count]) => {
    const base = `项目/02_内容素材/对标封面/${author}`;
    const images = fs.readdirSync(path.join(source, base)).filter(name => /^K\d+\.(jpg|jpeg|png|webp)$/i.test(name)).sort((a, b) => a.localeCompare(b, 'en', {numeric: true}));
    assert.equal(images.length, count, `${author} 交付图片数量变化，先核对来源再发布`);
    const samples = images.map(name => retain(`${base}/${name}`));
    const report = retain(`${base}/VI拆解.md`);
    const notes = outputs.get(report.path).toString('utf8');
    assert.ok(notes.startsWith('# ') && notes.length > 1000, `${author} 缺少完整拆解规则`);
    const styleFile = path.join(source, base, '风格.json');
    const attachments = [report];
    if (fs.existsSync(styleFile)) attachments.push(retain(`${base}/风格.json`));
    const paragraphs = notes.split(/\r?\n\r?\n/).filter(text => text.trim() && !text.startsWith('#'));
    const summary = paragraphs[0];
    const fixed = [
        `完整设计说明来自 ${author} 的 VI拆解.md；它是已有画面的研究与复用建议，不是作者官方规范。按 designNotes 全文和本次选定原图的具体关系执行，不能把不同分支揉成一个固定版式。`,
        '只借鉴空间、排版、配色和材质。只用本次用户选定的本人照作为身份依据，不继承样图人物的脸、发型、服装、姓名、账号字标、数据或旧文案。未选本人照时按无人版执行。',
        '先确认本次标题和内容，整组提炼共同规则，每张候选选一个主要构图参考；指定数量由本次请求决定，不按样张数量逐图照抄。',
        `本包实际交付 ${count} 张完整原图；designNotes 中涉及更大历史研究样本、旧本机页面、旧人物或案例环境的描述只作为来源记录，不宣称这些资料已经随包交付。`,
        '跨比例须重新排版，保持标题完整与主体关系；没有真实生图及人工验收记录，不宣称还原或跨比例验收通过。'
    ];
    return {
        id: `builtin-colleague-${key}`, name: `${author} · ${style}`, version: 1,
        builtin: true, desc: summary, style, source: `经用户授权复用的同事交接包 · ${base}`,
        ratio: '3:4', img: samples[0].path, shots: samples.map(item => item.path),
        referenceImages: samples.map(item => ({path: item.path, sha256: item.sha256, bytes: item.bytes})),
        assets: attachments.map(item => ({path: item.path, sha256: item.sha256, bytes: item.bytes})),
        fixed, rules: [notes], designNotes: notes,
        generation: {
            intent: `依据 ${author} 的完整拆解和选定原图生成新的内容封面。`,
            subjectPolicy: fixed[1], referencePolicy: fixed[2],
            textPolicy: '逐字使用本次确认文字；事实缺少来源则省略，不复制样图文字或账号品牌。',
            promptTemplate: `生成{ratio}封面，标题为“{title}”。主题：{topic}。遵循 designNotes 中与选定原图相符的分支和制作关系；正文依据：{facts}。辅助文字：{supportingText}。主体：{subject}。${fixed.join('\n')}`,
            negative: ['不混脸或继承参考图人物身份', '不继承旧文案、账号字标、数据和效果背书', '不把来源研究描述冒充新生图验收'],
            qualityChecks: ['核对标题逐字正确', '核对身份来自本次本人照或采用无人版', '核对所选原图的空间和文字关系', '核对没有捏造事实和账号背书']
        },
        accepted: false, aiTested: false,
        validation: {kind: 'source-verified-design', accepted: false, aiTested: false, ruleSource: report.path, ruleSourceSha256: report.sha256},
        provenance: {origin: 'authorized-colleague-handoff', creator: author, license: 'user-authorized-reuse', sourcePath: base, ruleSourceSha256: report.sha256, deliveredImages: count, identityUse: 'style-only'}
    };
});
const prompts = [];
const byBody = new Map();
const promptRoot = '项目/06_提示词';
function readPrompts(directory) {
    for (const name of fs.readdirSync(path.join(source, directory)).sort()) {
        if (name.startsWith('.') || name.startsWith('_')) continue;
        const relative = `${directory}/${name}`;
        if (fs.statSync(path.join(source, relative)).isDirectory()) { readPrompts(relative); continue; }
        if (!name.endsWith('.md')) continue;
        const descriptor = retain(relative);
        const raw = outputs.get(descriptor.path).toString('utf8');
        const matched = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(raw);
        assert.ok(matched, `提示词缺少元数据：${relative}`);
        const metadata = Object.fromEntries(matched[1].split(/\r?\n/).map(line => { const colon = line.indexOf(':'); assert.ok(colon > 0); return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()]; }));
        // Preserve every character after the front matter, including blank lines and final newline.
        const body = raw.slice(matched[0].length);
        assert.ok(body.trim() && metadata.title && metadata.when && metadata.summary);
        const bodyHash = hash(Buffer.from(body));
        const contentHash = hash(Buffer.from(body.replace(/\r\n/g, '\n').trim()));
        if (byBody.has(contentHash)) { byBody.get(contentHash).provenance.sources.push(descriptor); continue; }
        const prompt = {
            id: `builtin-prompt-colleague-${bodyHash.slice(0, 24)}`, version: 1,
            title: metadata.title, category: directory.slice(promptRoot.length + 1) || '未分类',
            when: metadata.when, summary: metadata.summary, tags: metadata.tags ? [...new Set(metadata.tags.split(/[、，,]/).map(tag => tag.trim()).filter(Boolean))] : [],
            body, provenance: {origin: 'authorized-colleague-handoff', license: 'user-authorized-reuse', source: metadata.source || '同事交接包提示词目录', bodySha256: bodyHash, sources: [descriptor]}
        };
        byBody.set(contentHash, prompt);
        prompts.push(prompt);
    }
}
readPrompts(promptRoot);
assert.equal(files.filter(item => item.sourcePath.startsWith(`${promptRoot}/`)).length, 26, '交付提示词数量变化，先核对来源再发布');
for (const name of ['_分类顺序.md', '_格式说明.md']) retain(`${promptRoot}/${name}`);
const catalog = {format: 'nova-colleague-library', schemaVersion: 1, version: 1, source: '内容工作台学员版_代码交接包 2/封面工作台/内容工作台', authorization: '用户授权复用模板和提示词；图片仅作风格参考，不作为用户身份资料', templates, prompts, files};
outputs.set('catalog.json', Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`));
const canonical = {format: 'nova-colleague-template-documents', schemaVersion: 1, templates: templates.map(template => {
    const documents = template.assets.map(asset => {
        const normalizedPath = `templates/${template.id}/${asset.path.endsWith('VI拆解.md') ? 'visual-identity.md' : 'style.json'}`;
        outputs.set(normalizedPath, outputs.get(asset.path));
        return {sourcePath: asset.path, sourceSha256: asset.sha256, normalizedPath, normalizedSha256: asset.sha256};
    });
    return {templateId: template.id, documents, images: template.referenceImages.map(image => ({filename: path.posix.basename(image.path), sourcePath: image.path, sha256: image.sha256}))};
})};
assert.equal(canonical.templates.reduce((count, template) => count + template.documents.length, 0), 8);
outputs.set('templates/index.json', Buffer.from(`${JSON.stringify(canonical, null, 2)}\n`));
for (const [relative, bytes] of outputs) {
    const target = path.join(destination, relative);
    if (check) assert.ok(fs.readFileSync(target).equals(bytes), `资源与授权来源不同：${relative}`);
    else { fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, bytes); }
}
console.log(`${check ? 'CHECK' : 'IMPORTED'} ${templates.length} 个模板组 / ${templates.reduce((n, item) => n + item.shots.length, 0)} 张原图 / ${prompts.length} 条提示词；${files.length} 个来源文件逐字节保留`);
