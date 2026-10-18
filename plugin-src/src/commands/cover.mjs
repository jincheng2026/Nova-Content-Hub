import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validRelease} from '../content.mjs';
import {nativeHandoffDirectory, readNativeHandoff} from '../bridge/native-handoff.mjs';

const MAX_INPUT = 64 * 1024;
const commands = ['help', 'doctor', 'create', 'attempt', 'claim', 'context', 'submit', 'fail', 'cancel', 'status'];
const flags = ['library', 'content', 'request', 'attempt', 'handoff', 'file', 'stdin'];
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const problem = (code, message) => Object.assign(new Error(message), {code});

function release() {
    let config;
    try {
        config = JSON.parse(fs.readFileSync(new URL('../release.json', import.meta.url), 'utf8'));
    } catch {
        throw problem('PACKAGE_NOT_BUILT', '请先构建实验执行包；源码入口不能推断授权模式。');
    }
    if (config && (config.platform !== process.platform || config.arch !== process.arch)) throw problem('PLATFORM_MISMATCH', '此实验包的原生组件与当前系统或架构不匹配。');
    if (!validRelease(config) || config.format !== 'nova-content-plugin-release' || config.schemaVersion !== 1 ||
        config.experimental !== true ||
        config.productionReady !== false || !['required', 'disabled'].includes(config.AUTH_MODE) ||
        !/^\d+\.\d+\.\d+$/.test(config.version || '')) throw problem('PACKAGE_INVALID', '执行包配置无效。');
    return config;
}

function argumentsFor(argv) {
    const [command = 'help', ...rest] = argv;
    if (!commands.includes(command)) throw problem('INVALID_ARGUMENTS', '使用 help 查看业务命令。');
    const values = {};
    for (let i = 0; i < rest.length; i++) {
        const key = rest[i].startsWith('--') ? rest[i].slice(2) : '';
        if (!flags.includes(key) || Object.hasOwn(values, key)) throw problem('INVALID_ARGUMENTS', '参数未知或重复。');
        if (key === 'stdin') values.stdin = true;
        else {
            const value = rest[++i];
            if (!value || value.startsWith('--') || value.includes('\0')) throw problem('INVALID_ARGUMENTS', '参数缺少有效值。');
            values[key] = value;
        }
    }
    return {command, values};
}

function stdinBytes() {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        const finish = (error, bytes) => {
            clearTimeout(timer);
            process.stdin.off('data', onData).off('end', onEnd).off('error', onError).pause();
            error ? reject(error) : resolve(bytes);
        };
        const onError = error => finish(error);
        const onEnd = () => finish(null, Buffer.concat(chunks));
        const onData = chunk => {
            size += chunk.length;
            if (size > MAX_INPUT) finish(problem('INPUT_TOO_LARGE', '请求超过 64 KiB。'));
            else chunks.push(chunk);
        };
        const timer = setTimeout(() => finish(problem('INPUT_TIMEOUT', '等待请求输入超时。')), 2500);
        process.stdin.on('data', onData).once('end', onEnd).once('error', onError).resume();
    });
}

async function payload(values, raw = false) {
    if (!!values.file === !!values.stdin) throw problem('INVALID_ARGUMENTS', '业务输入只接受 --file 或 --stdin 中的一项。');
    let bytes;
    if (values.stdin) bytes = await stdinBytes();
    else {
        if (fs.lstatSync(values.file).isSymbolicLink()) throw problem('UNSAFE_PATH', '请求文件不能是符号链接。');
        const fd = fs.openSync(values.file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        try {
            const stat = fs.fstatSync(fd);
            if (!stat.isFile()) throw problem('INVALID_INPUT', '请求必须是普通 JSON 文件。');
            if (stat.size > MAX_INPUT) throw problem('INPUT_TOO_LARGE', '请求超过 64 KiB。');
            const bounded = Buffer.alloc(MAX_INPUT + 1);
            let offset = 0;
            while (offset < bounded.length) {
                const count = fs.readSync(fd, bounded, offset, bounded.length - offset, null);
                if (!count) break;
                offset += count;
            }
            bytes = bounded.subarray(0, offset);
        } finally {
            fs.closeSync(fd);
        }
    }
    if (bytes.length > MAX_INPUT) throw problem('INPUT_TOO_LARGE', '请求超过 64 KiB。');
    let value;
    try {
        value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
    } catch {
        throw problem('INVALID_JSON', '请求不是有效 UTF-8 JSON。');
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw problem('INVALID_JSON', '请求必须是 JSON 对象。');
    return raw ? bytes : value;
}

function requiredFlags(command, values) {
    const withRequest = ['attempt', 'claim', 'context', 'submit', 'fail', 'cancel'].includes(command);
    const withAttempt = ['claim', 'context', 'submit', 'fail', 'cancel'].includes(command);
    const withInput = ['create', 'attempt', 'claim', 'submit', 'fail'].includes(command);
    const allowed = ['library', 'content', ...(withRequest ? ['request'] : []), ...(withAttempt ? ['attempt'] : []), ...(withInput ? ['file', 'stdin'] : [])];
    if (Object.keys(values).some(key => !allowed.includes(key)) || !values.library || !path.isAbsolute(values.library) ||
        !uuid(values.content) || withRequest && !uuid(values.request) || withAttempt && !uuid(values.attempt)) {
        throw problem('INVALID_ARGUMENTS', '请提供绝对 --library 和对应的内容/请求/尝试 ID。');
    }
    return withInput;
}

export async function main(argv) {
    let output;
    try {
        const {command, values} = argumentsFor(argv);
        const config = release();
        const facts = {experimental: true, productionReady: false, authMode: config.AUTH_MODE};
        if (command === 'help' || command === 'doctor') {
            if (Object.keys(values).length) throw problem('INVALID_ARGUMENTS', '此命令不接受参数。');
            output = {
                ok: true, ...facts,
                commands,
                usage: 'COMMAND --handoff UUID [--file JSON | --stdin] OR COMMAND --library ABSOLUTE_ROOT --content UUID [--request UUID] [--attempt UUID] [--file JSON | --stdin]',
                library: 'unbound',
                imageGeneration: false,
                message: '实验文件执行器；生图由已选助手完成，不代表商用发行就绪。'
            };
        } else {
            if (config.AUTH_MODE === 'required') throw problem('AUTH_NOT_CONFIGURED', '可信权益验证尚未接入，鉴权执行包停止业务读写。');
            let located;
            if (Object.hasOwn(values, 'handoff')) {
                if (!['claim', 'context', 'submit', 'fail', 'cancel', 'status'].includes(command) ||
                    Object.keys(values).some(key => !['handoff', 'file', 'stdin'].includes(key))) throw problem('INVALID_ARGUMENTS', '本机交接只接受固定尝试的执行命令，不能混用路径或其他 ID。');
                located = readNativeHandoff(nativeHandoffDirectory(), values.handoff, config);
                delete values.handoff;
                Object.assign(values, {library: located.binding.root, content: located.task.contentId});
                if (command !== 'status') Object.assign(values, {
                    request: located.task.requestId,
                    attempt: located.task.attemptId
                });
            }
            const withInput = requiredFlags(command, values);
            const input = withInput ? await payload(values, command === 'submit') : null;
            const {openLibrary} = await import('../lib/file-library/index.mjs');
            const library = located ? openLibrary(located.binding.root, {
                expectedLibraryId: located.binding.libraryId,
                expectedRootIdentity: located.binding.rootIdentity
            }) : openLibrary(values.library);
            const args = [values.content, values.request, values.attempt];
            let result;
            switch (command) {
                case 'create': {
                    if (Object.keys(input).some(key => !['request', 'editToken', 'mutationId'].includes(key))) throw problem('INVALID_INPUT', '创建输入只接受 request、editToken 和可选 mutationId。');
                    result = library.createCoverRequest(values.content, input.request, input.editToken, Object.hasOwn(input, 'mutationId') ? {mutationId: input.mutationId} : {});
                    break;
                }
                case 'attempt':
                    result = library.createCoverAttempt(values.content, values.request, input);
                    break;
                case 'claim':
                    result = library.claimCoverAttempt(...args, input);
                    break;
                case 'context': {
                    const {bodyBytes, ...context} = library.readCoverContext(...args);
                    result = context;
                    break;
                }
                case 'submit':
                    result = await library.commitCoverAttempt(...args, input);
                    break;
                case 'fail':
                    result = library.failCoverAttempt(...args, input);
                    break;
                case 'cancel':
                    result = library.cancelCoverAttempt(...args);
                    break;
                case 'status': {
                    const content = library.readContent(values.content);
                    result = {contentId: content.id, deletedAt: content.deletedAt, coverJobs: content.coverJobs || []};
                    break;
                }
            }
            const {bodyBytes, ...publicResult} = result;
            result = publicResult;
            if (result.content) {
                const {id, revision, editToken} = result.content;
                result = {...result, content: {id, revision, editToken}};
            }
            output = {ok: true, ...facts, result};
        }
    } catch (error) {
        output = {
            ok: false,
            code: error.code || 'IO_ERROR',
            message: error.message,
            experimental: true,
            productionReady: false,
            ...(uuid(error.mutationId) ? {mutationId: error.mutationId} : {}), ...(error.outcome ? {outcome: error.outcome} : {})
        };
    }
    process.stdout.write(`${JSON.stringify(output)}\n`);
    return output.ok ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) process.exitCode = await main(process.argv.slice(2));
