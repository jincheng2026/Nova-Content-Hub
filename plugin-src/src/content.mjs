import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Handoff from './bridge/handoff.js';

const PACKAGE_KIND = 'execution';
export const OPERATIONS = { analyze: 'nova-content-template-study', restore: 'nova-content-template-restore', generate: 'nova-content-cover' };
export const HOST_EVENTS = {
  codex: ['SessionStart', 'UserPromptSubmit', 'Stop', 'Interrupt'],
  workbuddy: ['SessionStart', 'UserPromptSubmit', 'Stop', 'StopFailure'],
};
const MAX_INPUT = 16384;
const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const only = (value, keys) => object(value) && Object.keys(value).every(key => keys.includes(key));
const slots = () => Object.fromEntries(['originalImage', 'evidence', 'rules', 'templateSnapshot', 'generationOutput', 'validationReport', 'registration'].map(key => [key, { status: 'unavailable', path: null }]));
const problem = (code, message, extra = {}) => ({ ok: false, code, message, executable: false, ...extra });

const safeRelative = value => typeof value === 'string' && value.length > 0 && value.length <= 500 && !/^(?:[\\/]|[A-Za-z][A-Za-z0-9+.-]*:)/.test(value) && !/[\\\u0000-\u001f]/.test(value) && !value.split('/').some(part => part === '..' || part === '.' || !part);
const shortText = value => typeof value === 'string' && value.length <= 300 && !/[\u0000-\u001f]/.test(value);
export function validRelease(release) {
  return object(release) && release.productId === 'nova-content-hub' && release.appScope === release.productId
    && release.protocolVersion === 1 && release.prototype === true && release.productionReady === false
    && ['required', 'disabled'].includes(release.AUTH_MODE) && typeof release.version === 'string'
    && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(release.version)
    && release.pairId === `${release.appScope}@${release.version}:p${release.protocolVersion}:${release.AUTH_MODE}`
    && (!Object.hasOwn(release, 'format') || release.format === 'nova-content-plugin-release'
      && release.schemaVersion === 1 && release.experimental === true
      && release.platform === process.platform && release.arch === process.arch);
}

function packageRelease() {
  const release = JSON.parse(readFileSync(new URL('./release.json', import.meta.url), 'utf8'));
  if (!validRelease(release) || PACKAGE_KIND === 'execution' && release.format !== 'nova-content-plugin-release') throw new Error('PACKAGE_INVALID');
  return release;
}

export function validateRequest(request, release) {
  if (!validRelease(release)) return problem('PACKAGE_INVALID', '包内发布配置无效；未执行任何业务动作。');
  if (!only(request, ['protocol', 'version', 'appScope', 'authMode', 'pairId', 'requestId', 'libraryId', 'targetId', 'kind', 'templateId', 'templateVersion', 'libraryRoot', 'pathsResolved', 'paths', 'skill', 'cli', 'options', 'rules', 'references', 'createdAt'])) return problem('INVALID_REQUEST', '请求必须是契约字段组成的对象。');
  try { if (Buffer.byteLength(JSON.stringify(request, null, 2), 'utf8') > MAX_INPUT) return problem('INPUT_TOO_LARGE', '请求超过 16 KiB UTF-8 上限。'); }
  catch { return problem('INVALID_REQUEST', '请求必须是有限 JSON。'); }
  if (request.protocol !== 'nova-content-hub-request' || request.version !== release.protocolVersion || request.appScope !== release.appScope || request.authMode !== release.AUTH_MODE || request.pairId !== release.pairId) return problem('PAIR_MISMATCH', '工作台与插件的 scope、协议、授权模式或 pairId 不一致。');
  if (![request.requestId, request.libraryId, request.targetId, request.templateId].every(id)) return problem('INVALID_REQUEST', '请求、库、目标和模板必须使用有效标识。');
  if (!Object.hasOwn(OPERATIONS, request.kind) || request.skill !== OPERATIONS[request.kind]) return problem('INVALID_REQUEST', 'kind 与 skill 不匹配。');
  if (request.kind !== 'generate' && request.targetId !== request.templateId) return problem('INVALID_REQUEST', '模板操作的目标必须等于模板 id。');
  if (request.templateVersion != null && (!Number.isSafeInteger(request.templateVersion) || request.templateVersion < 1) || request.kind !== 'analyze' && request.templateVersion == null) return problem('INVALID_REQUEST', '还原与生成必须指定正整数模板版本。');
  if (request.libraryRoot !== null || request.pathsResolved !== false || !only(request.paths, ['template','rules','target']) || !['template', 'rules', 'target'].every(key => safeRelative(request.paths[key]))) return problem('INVALID_PATH_CONTRACT', '预接入请求必须未绑定；路径仅为无穿越、无绝对地址的计划相对槽位。');
  if (!only(request.options, ['title', 'count', 'format', 'ratio', 'pixels', 'templateId', 'references'])) return problem('INVALID_REQUEST', 'options 包含未知字段。');
  const o = request.options;
  if (o.title !== undefined && !shortText(o.title) || o.format !== undefined && !shortText(o.format) || o.count !== undefined && (!Number.isSafeInteger(o.count) || o.count < 1 || o.count > 20) || o.ratio !== undefined && (typeof o.ratio !== 'string' || !/^[1-9][0-9]*:[1-9][0-9]*$/.test(o.ratio) || !o.ratio.split(':').every(n => Number(n) <= 20000))) return problem('INVALID_REQUEST', '标题、数量、格式或比例不合法。');
  if (request.kind === 'generate' && (!o.title?.trim() || o.count === undefined || o.ratio === undefined)) return problem('INVALID_REQUEST', '生成必须指定标题、数量与比例。');
  if (o.pixels != null && (!Array.isArray(o.pixels) || o.pixels.length !== 2 || !o.pixels.every(n => Number.isSafeInteger(n) && n >= 1 && n <= 16384))) return problem('INVALID_REQUEST', '像素尺寸须为两个 1–16384 的整数，或 null 表示待确认。');
  if (o.pixels && o.ratio) { const [w, h] = o.ratio.split(':').map(Number); if (Math.abs(o.pixels[0] / o.pixels[1] - w / h) > 0.01) return problem('INVALID_REQUEST', '像素尺寸与比例不匹配。'); }
  if (!only(request.rules, ['fixed', 'varies', 'evidence']) || !['fixed', 'varies'].every(key => Array.isArray(request.rules[key]) && request.rules[key].every(value => typeof value === 'string' && value.length <= 1000)) || !Array.isArray(request.rules.evidence) || !request.rules.evidence.every(value => only(value, ['sourceIndex', 'sourceId', 'rule']) && Number.isSafeInteger(value.sourceIndex) && value.sourceIndex >= 0 && typeof value.rule === 'string' && value.rule.length <= 1000 && (value.sourceId === undefined || id(value.sourceId)))) return problem('INVALID_REQUEST', '规则必须包含 fixed、varies 文本列表与 evidence 证据对象列表。');
  const referencesValid = refs => Array.isArray(refs) && refs.length <= 32 && refs.every(ref => only(ref, ['id', 'version', 'note']) && id(ref.id) && (ref.version == null || Number.isSafeInteger(ref.version) && ref.version > 0) && (ref.note === undefined || typeof ref.note === 'string' && ref.note.length <= 1000));
  if (!referencesValid(request.references) || o.references !== undefined && !referencesValid(o.references) || o.templateId !== undefined && o.templateId !== request.templateId) return problem('INVALID_REQUEST', 'references 必须是至多 32 个带 id、可选正整数 version 和说明 note 的引用。');
  if (typeof request.createdAt !== 'string' || !Number.isFinite(Date.parse(request.createdAt))) return problem('INVALID_REQUEST', 'createdAt 必须是有效时间。');
  return { ok: true, code: 'REQUEST_VALIDATED', validated: true, executable: false };
}

export function run(command, request, release) {
  if (!validRelease(release)) return problem('PACKAGE_INVALID', '包内发布配置无效；未执行任何业务动作。');
  if (command === 'help') return { ok: true, commands: ['help', 'summary', 'doctor', 'context --file REQUEST.json | --stdin', 'check-request --file REQUEST.json | --stdin', 'check-handoff --file HANDOFF.json | --stdin', 'hook --host <codex|workbuddy> --event <event>'], prototype: true, productionReady: false };
  if (command === 'summary' || command === 'doctor') return {
    ok: true, code: 'PROTOTYPE_DIAGNOSTIC', release, library: 'unbound', authorization: release.AUTH_MODE === 'required' ? 'not_configured' : 'disabled_at_build', productionReady: false,
    capabilities: { requestValidation: true, handoffValidation: true, libraryRead: false, libraryWrite: false, imageGeneration: false, taskLifecycle: false },
  };
  if (['task', 'taskstart', 'commit', 'import', 'generate', 'register'].includes(command)) return problem('NOT_IMPLEMENTED', '预接入包未实现此动作；停止并说明，不通过直接写 JSON 或文件替代。');
  if (command === 'check-handoff') {
    const checked = Handoff.validate(request, { release, validateRequest: value => validateRequest(value, release) });
    if (!checked.ok) return checked;
    const facts = { validated: true, executable: false, handoffId: request.handoffId, host: request.target.host, mode: request.target.mode, binding: 'unavailable', paths: slots() };
    if (release.AUTH_MODE === 'required') return problem('AUTH_NOT_CONFIGURED', '交接结构通过，但缺少可信授权；演示登录和会话信息不能授权执行。', facts);
    return { ok: true, code: 'HANDOFF_VALIDATED', ...facts, message: '仅校验交接；不启动宿主，不发送，不读取浏览器或真实内容库。' };
  }
  if (!['context', 'check-request'].includes(command)) return problem('UNKNOWN_COMMAND', '使用 help 查看可用入口。');
  const checked = validateRequest(request, release);
  if (!checked.ok) return checked;
  const contract = { validated: true, executable: false, binding: 'unavailable', reason: '实际内容库与可信执行适配器尚未接入；绝对路径未解析。', paths: slots() };
  if (command === 'context') return {
    ok: true, code: 'CONTEXT_UNAVAILABLE', ...contract,
    readableContext: '请求格式匹配；实际内容库尚未绑定，所有路径槽位不可用。当前没有可读取的模板、项目或敏感资产正文。',
    structuredContext: { kind: request.kind, templateVersion: request.templateVersion ?? null, pixels: request.options.pixels ?? null, productionReady: false },
  };
  if (release.AUTH_MODE === 'required') return problem('AUTH_NOT_CONFIGURED', '尚未接入真实可信授权验证，不能执行写入或外部动作。工作台演示登录不构成授权。', contract);
  return { ok: true, code: 'REQUEST_VALIDATED', ...contract, message: '仅完成契约校验；实际库、图片生成和登记尚未实现。' };
}

export function observeHook(host, event, input, release) {
  if (!HOST_EVENTS[host]?.includes(event)) return { output: {}, diagnostic: 'UNKNOWN_HOOK_EVENT' };
  if (!object(input) || input.hook_event_name !== event) return { output: {}, diagnostic: 'INVALID_HOOK_INPUT' };
  // A startup hint contains no project context and grants no execution authority.
  if (event === 'SessionStart' && validRelease(release)) return { output: { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: `Nova Content Hub 插件 ${release.version}；scope=nova-content-hub；模式=${release.AUTH_MODE}。仅响应显式自媒体工作台请求。先校验用户提供的 HANDOFF.json / REQUEST.json，不能从 cwd 猜库；${release.format === 'nova-content-plugin-release' ? 'contract 命令仅校验未绑定原型请求，executable=false；cover 命令仅处理用户明确交来的绝对库位置与 UUID。required 模式因可信权益未接入而拒绝全部业务读写。' : '真实库未绑定，路径不可用，可信授权未接入，executable=false。'}不要将宿主会话结束当作生成成功。` } }, diagnostic: null };
  return { output: {}, diagnostic: null };
}

async function readInput(timeout = 1500, limit = MAX_INPUT) {
  return new Promise((resolve, reject) => {
    let chunks = [], size = 0;
    const timer = setTimeout(() => finish(new Error('INPUT_TIMEOUT')), timeout);
    const finish = (error, value) => {
      clearTimeout(timer);
      process.stdin.off('data', data).off('end', end).off('error', fail);
      process.stdin.pause();
      error ? reject(error) : resolve(value);
    };
    const fail = error => finish(error);
    const data = chunk => {
      size += chunk.length;
      if (size > limit) return finish(new Error('INPUT_TOO_LARGE'));
      chunks.push(chunk);
    };
    const end = () => {
      try { finish(null, JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { finish(new Error('INVALID_JSON')); }
    };
    process.stdin.on('data', data).on('end', end).on('error', fail).resume();
  });
}

export async function main(argv) {
  const [command = 'help', ...args] = argv;
  if (command === 'hook') {
    let result;
    try {
      if (args.length !== 4 || args[0] !== '--host' || args[2] !== '--event') throw new Error('INVALID_HOOK_ARGUMENTS');
      const release = packageRelease();
      result = observeHook(args[1], args[3], await readInput(600), release);
    } catch (error) { result = { output: {}, diagnostic: error.message }; }
    if (result.diagnostic) process.stderr.write(JSON.stringify({ code: result.diagnostic }) + '\n');
    process.stdout.write(JSON.stringify(result.output) + '\n');
    return 0;
  }
  let result;
  try {
    const release = packageRelease();
    if (['context', 'check-request', 'check-handoff'].includes(command)) {
      const inputLimit = command === 'check-handoff' ? Handoff.MAX_BYTES : MAX_INPUT;
      if (args.length === 1 && args[0] === '--stdin') result = run(command, await readInput(1500, inputLimit), release);
      else if (args.length === 2 && args[0] === '--file') {
        const stat = statSync(args[1]);
        if (!stat.isFile()) throw new Error('INVALID_JSON');
        if (stat.size > inputLimit) throw new Error('INPUT_TOO_LARGE');
        let request; try { request = JSON.parse(readFileSync(args[1], 'utf8')); } catch { throw new Error('INVALID_JSON'); }
        result = run(command, request, release);
      } else result = problem('INVALID_ARGUMENTS', '此入口只接受 --stdin 或 --file REQUEST.json。');
    } else if (args.length && !['task', 'taskstart', 'commit', 'import', 'generate', 'register'].includes(command)) result = problem('INVALID_ARGUMENTS', '不支持此参数；授权模式只在构建时选择。');
    else result = run(command, null, release);
  } catch (error) {
    const code = ['INPUT_TIMEOUT', 'INPUT_TOO_LARGE', 'INVALID_JSON'].includes(error.message) ? error.message : 'PACKAGE_INVALID';
    result = problem(code, '无法读取有效请求或包内发布配置；未执行任何业务动作。');
  }
  process.stdout.write(JSON.stringify(result) + '\n');
  return result.ok ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = await main(process.argv.slice(2));
