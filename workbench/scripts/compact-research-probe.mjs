import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import electron from 'electron';
import {build} from 'vite';
import sharp from 'sharp';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {emptyBinding} from '../src/main/bindings.mts';

const workbench = fileURLToPath(new URL('../', import.meta.url));
const evidence = path.resolve(process.env.UI_EVIDENCE_DIR || path.join(workbench, '../docs/verification/production/2026-10-27-compact-research-dialogs/electron'));
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nova-compact-research-probe-')));
try {
    await fs.mkdir(evidence, {recursive: true});
    const bundle = path.join(root, 'bundle');
    await fs.cp(path.join(workbench, 'dist-desktop/auth-disabled'), bundle, {recursive: true});
    // Only rebuild this isolated copy; concurrent desktop probes keep their own bundle.
    const renderer = path.join(bundle, 'workbench/dist/renderer');
    await build({configFile:false, root:path.join(workbench,'src/renderer'), base:'./', oxc:{jsx:{runtime:'automatic'}}, build:{outDir:renderer,emptyOutDir:true,modulePreload:false,sourcemap:false,target:'chrome148'}});
    const entries = {}, mimes = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
    for (const file of await fs.readdir(renderer,{recursive:true})) {if ((await fs.stat(path.join(renderer,file))).isFile()) entries['/'+file]={file,mime:mimes[path.extname(file)]};}
    await fs.writeFile(path.join(bundle,'workbench/dist/renderer-resources.json'), JSON.stringify({format:'nova-desktop-renderer-resources',schemaVersion:1,entries}));
    const library = createLibrary(path.join(root, 'library'));
    const mutate = (op, input) => library.mutateProduction(op, {...input, expectedToken: library.readProduction().editToken, ...(op === 'saveCreation' ? {expectedContentToken: library.readProductionCreation(input.contentId).content.editToken} : {})}, {mutationId: randomUUID()});
    const content = library.createContent({title: '把 AI 工具讲清楚：从问题到解决方案', body: '很多人收藏了 AI 工具，却不知道从哪里开始。\n\n先找到一个真实的小问题，再展示可以复现的步骤。每个关键判断保留来源，最后邀请读者动手试一遍。'});
    mutate('ensureCreation', {contentId: content.id});
    mutate('saveCreation', {contentId: content.id, patch: {analysis: '共同特征：从真实任务出发，用演示解释工具的边界；避免只列功能。', narrative: '先展示问题，再给出三个可复现步骤，结尾说明适用范围。'}});
    for (const [index, name] of ['效率实验室', '职场工具笔记', 'AI 入门观察'].entries()) {
        const image = path.join(root, `account-${index}.png`);
        await sharp(Buffer.from(`<svg width="480" height="640" xmlns="http://www.w3.org/2000/svg"><rect width="480" height="640" fill="${['#E8F1FC', '#E9F9EE', '#FFF4E2'][index]}"/><rect x="32" y="40" width="416" height="180" rx="20" fill="white"/><text x="56" y="105" font-size="26" fill="#1D1D1F">${name}</text><text x="56" y="158" font-size="20" fill="#6E6E73">合成测试截图 · ${index + 1}</text><rect x="32" y="250" width="198" height="290" rx="16" fill="white"/><rect x="250" y="250" width="198" height="290" rx="16" fill="white"/></svg>`)).png().toFile(image);
        const asset = library.importAsset(image, {purpose: 'photo'});
        mutate('saveAccount', {name, platform: '抖音', url: `https://www.douyin.com/user/probe-${index}`, note: ['用真实场景解释复杂工具，教程步骤清楚。', '关注低粉账号的高互动选题，记录表达结构。', '追踪内容定位与选题变化，保留来源证据。'][index], tags: ['AI 教程', '待继续研究'], images: [asset.assetHash], reportIds: []});
    }
    const reportFile = path.join(root, 'report.html');
    await fs.writeFile(reportFile, '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>body{font:16px/1.8 sans-serif;margin:40px;color:#1D1D1F}h1{color:#0071E3}section{padding:24px;border:1px solid #ddd;border-radius:18px;margin:20px 0}</style></head><body><h1>AI 教程账号观察报告</h1><p>本报告使用合成测试资料，不代表真实账号研究。</p><section><h2>选题与定位</h2><p>从可复现的小任务切入，说明工具的适用条件与边界。</p></section><section><h2>下一步建议</h2><p>补充来源、比较样本、记录尚未确认的问题。</p></section></body></html>');
    const reportAsset = library.importAsset(reportFile, {purpose: 'production-report'});
    const reports = mutate('saveReport', {title: 'AI 教程账号观察报告', type: '账号研究', accountIds: [], sourceUrl: null, collectedAt: new Date().toISOString(), pages: [{title: '账号观察', assetHash: reportAsset.assetHash}, {title: '表达结构', assetHash: reportAsset.assetHash}], meta: {synthetic: true}});
    const other = createLibrary(path.join(root, 'other-library'));
    const machine = path.join(root, 'machine');
    await fs.mkdir(machine);
    const current = {root: library.info.root, libraryId: library.info.libraryId, rootIdentity: library.info.rootIdentity};
    await fs.writeFile(path.join(machine, 'machine-binding.json'), JSON.stringify({...emptyBinding(), current}), {mode: 0o600});
    await fs.writeFile(path.join(root, 'fixture.json'), JSON.stringify({contentId: content.id, reportId: reports.reports[0].id, library: library.info.root, otherLibrary: other.info.root, reportFile}));
    const entry = path.join(bundle, 'workbench/dist/main/compact-research-probe-entry.mjs');
    await fs.copyFile(path.join(workbench, 'test-support/compact-research-probe-entry.mjs'), entry);
    const code = await new Promise((resolve, reject) => {
        const child = spawn(electron, [entry], {cwd: bundle, env: {...process.env, NOVA_PRODUCTION_PROBE_ROOT: root, NOVA_PRODUCTION_PROBE_EVIDENCE: evidence}, stdio: 'inherit'});
        const timer = setTimeout(() => child.kill('SIGKILL'), 180000);
        child.once('error', reject);
        child.once('exit', code => {clearTimeout(timer); resolve(code);});
    });
    if (code !== 0) throw new Error(`Production Electron probe failed: ${code}`);
    console.log(`PASS Electron production smoke; evidence: ${evidence}`);
} finally {
    await fs.rm(root, {recursive: true, force: true});
}
