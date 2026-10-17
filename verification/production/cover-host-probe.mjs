import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createLibrary, openLibrary } from '../../file-library/index.mjs';
import { installBuiltins } from '../../library-seed/index.mjs';

const project = fileURLToPath(new URL('../../', import.meta.url));
const probes = path.join(project, '.local-probes');
const prompt = 'Use case: ads-marketing. Create a new original Chinese creator cover as a portrait PNG exactly 1024 by 1536 pixels, aspect ratio 2:3. Use both supplied images ONLY as style references for editorial hierarchy, layered tool cards, precise Chinese typography and a polished professional creator aesthetic. Do not copy sample text, brands or people. No person or human face. Main title verbatim: "封面怎么选". Subtitle verbatim: "先看主题，再选模板". Small kicker verbatim: "创作手记 01". Depict the idea of selecting cover templates with layered content cards. Keep the title exceptionally readable at thumbnail size. Make one distinct composition per candidate. No watermark, no extra copy. Preserve the exact requested output dimensions; do not add an outside frame.';

function cli(run, command, extra = [], input) {
  const config = JSON.parse(fs.readFileSync(path.join(run, 'probe.json'), 'utf8'));
  const argv = [path.join(run, 'runtime/cover-runtime/cli.mjs'), command, '--library', config.libraryRoot, '--content', config.contentId, ...extra];
  const output = JSON.parse(execFileSync(process.execPath, argv, { input: input === undefined ? undefined : typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8', timeout: 30000 }));
  assert.equal(output.ok, true, output.message);
  return output.result;
}

const [command, runArgument, ...images] = process.argv.slice(2);
if (command === 'prepare') {
  fs.mkdirSync(probes, { recursive: true });
  const run = path.join(probes, randomUUID());
  fs.mkdirSync(run);
  fs.cpSync(path.join(project, 'dist-cover-runtime/auth-disabled'), path.join(run, 'runtime'), { recursive: true });
  const library = createLibrary(path.join(run, 'library'));
  installBuiltins(library);
  const template = library.readTemplate('builtin-ai-tool');
  const content = library.createContent({ title: '封面怎么选', body: '# 封面怎么选\n先明确这条内容要表达什么，再选择能突出主题的模板。这里是隔离的宿主链路验收内容，不包含用户素材。\n' });
  fs.writeFileSync(path.join(run, 'probe.json'), JSON.stringify({ libraryRoot: library.info.root, libraryId: library.info.libraryId, contentId: content.id }));
  const created = cli(run, 'create', ['--stdin'], { editToken: content.editToken, request: {
    template: { id: template.id, version: template.version }, styleAssetHashes: Object.values(template.resources).filter(ref => ref.role === 'style').map(ref => ref.assetHash),
    photo: null, materialIds: [], prompt, pixels: { width: 1024, height: 1536 }, ratio: '2:3', count: 2, outputFormat: 'png', scope: 'cover-only',
  } });
  const started = cli(run, 'attempt', ['--request', created.request.requestId, '--stdin'], { host: 'codex', reason: 'isolated current desktop-thread live generation probe' });
  const fixed = ['--request', created.request.requestId, '--attempt', started.attempt.attemptId];
  const context = cli(run, 'context', fixed);
  fs.writeFileSync(path.join(run, 'context.json'), JSON.stringify(context, null, 2));
  console.log(JSON.stringify({ probeRoot: run, contextFile: path.join(run, 'context.json'), requestId: created.request.requestId, attemptId: started.attempt.attemptId, inputs: context.inputs, prompt }, null, 2));
} else if (['claim', 'submit', 'archive'].includes(command)) {
  const run = fs.realpathSync(runArgument);
  assert.equal(path.dirname(run), fs.realpathSync(probes), 'Only this repository isolated probe may be used');
  const context = JSON.parse(fs.readFileSync(path.join(run, 'context.json'), 'utf8'));
  const fixed = ['--request', context.request.requestId, '--attempt', context.attempt.attemptId];
  if (command === 'claim') console.log(JSON.stringify(cli(run, 'claim', [...fixed, '--stdin'], { host: 'codex', readAssetHashes: [...new Set(context.inputs.map(ref => ref.assetHash))] }), null, 2));
  else if (command === 'submit') {
    assert.equal(images.length, context.request.count, 'Supply every actual generated file');
    const files = images.map((file, index) => {
      assert.ok(fs.statSync(file).size <= 64 * 1024 * 1024);
      const name = `live-${index + 1}.png`;
      fs.copyFileSync(file, path.join(context.inbox, name), fs.constants.COPYFILE_EXCL);
      return { name, sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') };
    });
    const receipt = { libraryId: context.request.libraryId, contentId: context.request.contentId, requestId: context.request.requestId, attemptId: context.attempt.attemptId, requestHash: context.request.requestHash, resultId: randomUUID(), files };
    const raw = JSON.stringify(receipt, null, 2) + '\n';
    fs.writeFileSync(path.join(run, 'live-receipt.json'), raw, { flag: 'wx' });
    const result = cli(run, 'submit', [...fixed, '--file', path.join(run, 'live-receipt.json')]);
    const replayed = cli(run, 'submit', [...fixed, '--stdin'], raw);
    assert.deepEqual(replayed.candidateIds, result.candidateIds);
    const config = JSON.parse(fs.readFileSync(path.join(run, 'probe.json'), 'utf8'));
    const saved = openLibrary(config.libraryRoot).readContent(context.request.contentId);
    assert.equal(saved.candidates.length, images.length);
    assert.equal(saved.selectedCover, null);
    assert.ok(saved.candidates.every(item => item.accepted === false));
    console.log(JSON.stringify({ requestId: context.request.requestId, attemptId: context.attempt.attemptId, status: result.attempt.status, candidateIds: result.candidateIds, files, replayPreservedIds: true, humanQualityReview: 'pending', automaticHandoffTested: false }, null, 2));
  } else {
    const config = JSON.parse(fs.readFileSync(path.join(run, 'probe.json'), 'utf8'));
    const library = openLibrary(config.libraryRoot);
    const current = library.readCoverContext(config.contentId, context.request.requestId, context.attempt.attemptId);
    assert.equal(current.attempt.status, 'committed');
    const location = path.join(config.libraryRoot, '内容', config.contentId, '封面任务', context.request.requestId, '尝试', context.attempt.attemptId, '收件', current.attempt.receiptHash);
    const validation = fs.readFileSync(path.join(location, '校验报告.json'));
    assert.equal(createHash('sha256').update(validation).digest('hex'), current.attempt.reportHash);
    const report = JSON.parse(validation);
    assert.equal(report.status, 'passed');
    assert.equal(report.decoded, true);
    const directory = path.join(project, 'assets/production-probes');
    fs.mkdirSync(directory, { recursive: true });
    const saved = current.attempt.candidateIds.map((id, index) => {
      const candidate = current.content.candidates.find(item => item.id === id);
      const asset = library.readAsset(candidate.assetHash);
      assert.equal(asset.assetHash, report.files[index].assetHash);
      const relative = `assets/production-probes/${context.request.requestId}-${index + 1}.png`;
      fs.writeFileSync(path.join(project, relative), asset.data, { flag: 'wx' });
      return { path: relative, ...report.files[index] };
    });
    const provenance = { purpose: 'isolated live cover execution probe', createdAt: new Date().toISOString(), generator: 'Codex built-in image_gen', model: 'not returned by tool',
      prompt: current.request.prompt, template: current.request.template, styleAssetHashes: current.request.styleAssetHashes, photo: current.request.photo,
      requestId: current.request.requestId, attemptId: current.attempt.attemptId, receiptHash: current.attempt.receiptHash, reportHash: current.attempt.reportHash,
      humanQualityReview: 'pending', automaticHandoffTested: false, images: saved };
    const manifest = path.join(directory, `${current.request.requestId}.json`);
    fs.writeFileSync(manifest, JSON.stringify(provenance, null, 2) + '\n', { flag: 'wx' });
    fs.writeFileSync(path.join(project, 'verification/production/2026-10-17-codex-live-validation.json'), validation, { flag: 'wx' });
    console.log(JSON.stringify({ manifest, images: saved.map(item => path.join(project, item.path)) }, null, 2));
  }
} else throw new Error('Use prepare | claim PROBE | submit PROBE IMAGE1 IMAGE2 | archive PROBE');
