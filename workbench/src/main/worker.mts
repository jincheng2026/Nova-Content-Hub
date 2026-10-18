import {isCoverOperation, executeCover} from './cover-worker.mts';
import path from 'node:path';
import fs from 'node:fs/promises';
import {validateRelease} from './boundary.mts';
import * as imports from '../../../plugin-src/src/lib/browser-import/index.mjs';
import {openLibrary, createLibrary} from '../../../plugin-src/src/lib/file-library/index.mjs';
import {isRecord, errorInfo} from '../shared/contracts.ts';
import {exact, uuid, identity, libraryBinding, mutation, requireWrite, fail} from '../shared/validation.ts';
import type {Content, WorkerOperations, WorkerOperation, LibraryBinding, WorkspaceSnapshot, WorkspacePlan} from '../shared/contracts.ts';

const absolute = (value: unknown): value is string => typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0');
const projection = ({id, title, body, editToken, deletedAt}: Content): Content => ({
    id,
    title,
    body,
    editToken,
    deletedAt
});
const bindingOf = (library: ReturnType<typeof openLibrary>): LibraryBinding => ({
    root: library.info.root,
    libraryId: library.info.libraryId,
    rootIdentity: library.info.rootIdentity
});
const bound = (binding: LibraryBinding) => openLibrary(binding.root, {
    expectedLibraryId: binding.libraryId,
    expectedRootIdentity: binding.rootIdentity
});
function workspace(library: ReturnType<typeof openLibrary>): WorkspaceSnapshot {
    const contents = [...library.listContents(), ...library.listTrash()].map(({id}) => {
        const content = library.readContent(id);
        return {
            ...projection(content),
            createdAt: content.createdAt,
            updatedAt: content.updatedAt,
            plans: (content.plans ?? []).map(plan => {
                const publication = plan.status === 'published' ? content.publications?.find(item => item.id === plan.publicationId && item.planId === plan.id) : undefined;
                if (plan.status === 'published' && !publication) fail('CORRUPT', 'Published plan has no matching publication record');
                const timing = publication ? publication.schedule : plan.schedule;
                const legacyAt = publication ? publication.publishedAt : plan.scheduledAt;
                const timezone = publication ? publication.timezone : plan.timezone;
                let schedule: WorkspacePlan['schedule'];
                if (timing?.precision === 'date') schedule = {precision: 'date', date: timing.date};
                else if (timing?.precision === 'instant') schedule = {precision: 'instant', at: timing.at, timezone: timing.timezone};
                else if (timing?.precision === 'local-minute') schedule = {precision: 'local-minute', date: timing.date, time: timing.time, timezone: timing.timezone};
                else if (!timing && legacyAt && timezone) schedule = {precision: 'instant', at: legacyAt, timezone};
                else fail('UNSUPPORTED_SCHEDULE', '排期时间格式无法在当前视图中完整表示，请升级工作台。');
                return {id: plan.id, channelId: plan.channelId, status: plan.status, schedule};
            }),
            candidateCount: content.candidates?.length ?? 0,
            selectedCandidateId: content.selectedCover?.candidateId ?? null
        };
    });
    const prompts = library.listPrompts().map(({id}) => {
        const {title, body, category, summary, when, tags, enabled, editToken} = library.readPrompt(id);
        return {id, title, body, category, summary, when, tags, enabled: enabled ?? true, editToken};
    });
    const channels = library.readLibrarySettings().channels.map(({id, name, deletedAt}) => ({id, name, enabled: deletedAt === null}));
    return {contents, prompts, channels};
}

const schemas: Record<Exclude<WorkerOperation, keyof import('../shared/cover-contracts.ts').CoverWorkerOperations>, string[]> = {
    inspect: ['source'],
    query: ['destination', 'importId'],
    import: ['source', 'destination', 'expectedSourceHash'],
    resume: ['destination', 'importId'],
    bind: ['destination', 'libraryId', 'importId'],
    createLibrary: ['root', 'rootIdentity', 'mutationId'],
    queryCreation: ['root', 'rootIdentity', 'mutationId'],
    workspace: ['binding'],
    list: ['binding', 'view'],
    readContent: ['binding', 'id'],
    mutate: ['binding', 'mutation'],
    queryMutation: ['binding', 'mutationId']
};

export async function execute(op: unknown, args: unknown, mode: 'required' | 'disabled' = 'required'): Promise<WorkerOperations[WorkerOperation]['result']> {
    if (isCoverOperation(op)) return executeCover(op, args, mode);
    const fields = typeof op === 'string' && Object.hasOwn(schemas, op) ? schemas[op as keyof typeof schemas] : null;
    if (!fields || !exact(args, fields) || fields.some(key => {
        const value = args[key];
        if (['source', 'destination', 'root'].includes(key)) return !absolute(value);
        if (key === 'expectedSourceHash') return !(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value));
        if (key === 'binding') return !libraryBinding(value) || !absolute(value.root);
        if (key === 'rootIdentity') return !identity(value);
        if (key === 'mutation') return !mutation(value);
        if (key === 'view') return !['active', 'trash'].includes(value as string);
        return !(uuid(value) || (['query', 'bind'].includes(op as string) && value === null));
    })) fail('INVALID_INPUT', '工作进程拒绝了无效的业务参数。');
    if (op === 'createLibrary' || op === 'mutate') requireWrite(mode);
    if (op === 'inspect') return imports.inspectBrowserBackup(args.source as string);
    if (op === 'query') return imports.getBrowserImport(args.destination as string, (args.importId ?? undefined) as string | undefined);
    if (op === 'import') return imports.importBrowserBackup(args.source as string, args.destination as string, {expectedSourceHash: args.expectedSourceHash as string});
    if (op === 'resume') return imports.resumeBrowserImport(args.destination as string, args.importId as string);
    if (op === 'createLibrary' || op === 'queryCreation') {
        const expected = args.rootIdentity as LibraryBinding['rootIdentity'];
        const stat = await fs.lstat(args.root as string, {bigint: true});
        if (!stat.isDirectory() || stat.isSymbolicLink() || stat.dev.toString() !== expected.dev || stat.ino.toString() !== expected.ino) fail('CONFLICT', '新库创建位置已被替换；保留原目标以供核验。');
        if (op === 'queryCreation' && (await fs.readdir(args.root as string)).length === 0) return null;
        const descriptor = op === 'queryCreation' ? JSON.parse(await fs.readFile(path.join(args.root as string, '内容库.json'), 'utf8')) as {
            libraryId: string
        } : null;
        const library = op === 'createLibrary' ? createLibrary(args.root as string, {expectedRootIdentity: expected}) : openLibrary(args.root as string, {
            expectedLibraryId: descriptor!.libraryId,
            expectedRootIdentity: expected
        });
        if (library.info.rootIdentity.dev !== expected.dev || library.info.rootIdentity.ino !== expected.ino) fail('CONFLICT', 'Library creation target changed');
        return bindingOf(library);
    }
    if (op === 'bind') {
        let library;
        if (args.libraryId) {
            const stat = await fs.lstat(args.destination as string, {bigint: true});
            if (!uuid(args.importId)) fail('INVALID_INPUT', 'Import adoption requires the accepted task');
            const task = imports.getBrowserImport(args.destination as string, args.importId);
            if (!task || task.status !== 'committed' || task.targetChanged || task.libraryId !== args.libraryId) fail('CONFLICT', 'Imported library changed');
            library = openLibrary(args.destination as string, {
                expectedLibraryId: args.libraryId as string,
                expectedRootIdentity: {dev: stat.dev.toString(), ino: stat.ino.toString()}
            });
        } else library = openLibrary(args.destination as string);
        return bindingOf(library);
    }
    const library = bound(args.binding as unknown as LibraryBinding);
    if (op === 'workspace') return workspace(library);
    if (op === 'list') return (args.view === 'trash' ? library.listTrash() : library.listContents()).map(projection);
    if (op === 'readContent') return projection(library.readContent(args.id as string));
    if (op === 'queryMutation') {
        const found = library.queryMutation(args.mutationId as string);
        return found ? {objectId: found.objectId} : null;
    }
    const request = args.mutation as unknown as import('../shared/contracts.ts').Mutation;
    const options = {mutationId: request.mutationId};
    if (request.op === 'createContent') return projection(library.createContent(request.input, options));
    const input = request.input;
    if (request.op === 'updateContent') return projection(library.updateContent(request.input.id, {
        title: request.input.title,
        body: request.input.body
    }, request.input.editToken, options));
    return projection(request.op === 'trashContent' ? library.trashContent(input.id, input.editToken, options) : library.restoreContent(input.id, input.editToken, options));
}

const port = process.parentPort;
if (port) {
    let running = false;
    const release = fs.readFile(new URL('../release.json', import.meta.url), 'utf8').then(bytes => {
        const config = validateRelease(JSON.parse(bytes));
        if (process.argv[2] !== config.pairId) fail('RELEASE_MISMATCH', 'Worker release differs from main');
        return config;
    });
    void release.catch(() => {
    });
    port.on('message', async ({data: message}: { data: unknown }) => {
        if (!isRecord(message) || !Number.isSafeInteger(message.id) || running) return;
        running = true;
        try {
            const config = await release;
            port.postMessage({
                id: message.id,
                ok: true,
                value: await execute(message.op, message.args, config.AUTH_MODE)
            });
        } catch (error) {
            port.postMessage({id: message.id, ok: false, error: {code: errorInfo(error).code}});
        } finally {
            running = false;
        }
    });
}
