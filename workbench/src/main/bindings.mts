import {productionPending} from '../shared/production-validation.ts';
import {assistant, coverPending, photoPending, coverActionPending} from '../shared/cover-validation.ts';
import {templatePending} from '../shared/template-validation.ts';
import {workspacePending} from '../shared/workspace-validation.ts';
import {maintenancePending} from '../shared/maintenance-validation.ts';
import {isRecord, errorInfo} from '../shared/contracts.ts';
import {identity, libraryBinding, mutation, uuid} from '../shared/validation.ts';
import type {Binding} from '../shared/contracts.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const absolute = (value: unknown) => typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0');

function validMaintenance(value: unknown, current: unknown): boolean {
    if (!maintenancePending(value) || !absolute(value.destination)) return false;
    if (value.kind === 'upgrade') return absolute(value.source.root) && absolute(value.backupDestination) && (!value.backup || absolute(value.backup.source));
    if (value.kind === 'restore') return absolute(value.backup.source);
    return absolute(value.binding.root) && libraryBinding(current) && value.binding.root === current.root && value.binding.libraryId === current.libraryId && value.binding.rootIdentity.dev === current.rootIdentity.dev && value.binding.rootIdentity.ino === current.rootIdentity.ino;
}

export function validateBinding(value: unknown): Binding {
    if (!isRecord(value) || value.version !== 1 || Object.keys(value).some(key => !['version', 'source', 'sourceHash', 'destination', 'started', 'importId', 'libraryId', 'current', 'pending', 'creation', 'needsReselect', 'assistant', 'photoPending', 'coverPending', 'seedPending', 'coverActionPending', 'workspacePending', 'templatePending', 'maintenancePending', 'productionPending'].includes(key)) ||
        !(value.source === null || absolute(value.source)) || !(value.destination === null || absolute(value.destination)) ||
        !(value.sourceHash === null || (typeof value.sourceHash === 'string' && /^[0-9a-f]{64}$/.test(value.sourceHash))) || typeof value.started !== 'boolean' ||
        !(value.importId === null || (typeof value.importId === 'string' && UUID.test(value.importId))) || !(value.libraryId === null || (typeof value.libraryId === 'string' && UUID.test(value.libraryId))) ||
        (!!value.source !== !!value.sourceHash) || (value.started && (!value.source || !value.destination)) ||
        (value.current !== undefined && value.current !== null && (!libraryBinding(value.current) || !absolute(value.current.root))) ||
        (value.pending !== undefined && value.pending !== null && (!mutation(value.pending) || !value.current)) ||
        (value.creation !== undefined && value.creation !== null && (!isRecord(value.creation) || Object.keys(value.creation).length !== 3 || !uuid(value.creation.mutationId) || !absolute(value.creation.root) || !identity(value.creation.rootIdentity))) ||
        (value.assistant !== undefined && !assistant(value.assistant)) ||
        (value.photoPending !== undefined && value.photoPending !== null && (!photoPending(value.photoPending) || !absolute(value.photoPending.source) || !value.current)) ||
        (value.coverPending !== undefined && value.coverPending !== null && (!coverPending(value.coverPending) || !value.current)) ||
        (value.coverActionPending !== undefined && value.coverActionPending !== null && (!coverActionPending(value.coverActionPending) || !value.current)) ||
        (value.workspacePending !== undefined && value.workspacePending !== null && (!workspacePending(value.workspacePending) || !libraryBinding(value.current) || value.workspacePending.binding.libraryId !== value.current.libraryId || value.workspacePending.binding.rootIdentity.dev !== value.current.rootIdentity.dev || value.workspacePending.binding.rootIdentity.ino !== value.current.rootIdentity.ino)) ||
        (value.templatePending !== undefined && value.templatePending !== null && (!templatePending(value.templatePending) || !libraryBinding(value.current) || value.templatePending.binding.libraryId !== value.current.libraryId || value.templatePending.binding.rootIdentity.dev !== value.current.rootIdentity.dev || value.templatePending.binding.rootIdentity.ino !== value.current.rootIdentity.ino)) ||
        (value.maintenancePending !== undefined && value.maintenancePending !== null && !validMaintenance(value.maintenancePending, value.current)) ||
        (value.productionPending !== undefined && value.productionPending !== null && (!productionPending(value.productionPending) || !libraryBinding(value.current) || value.productionPending.binding.libraryId !== value.current.libraryId || value.productionPending.binding.rootIdentity.dev !== value.current.rootIdentity.dev || value.productionPending.binding.rootIdentity.ino !== value.current.rootIdentity.ino)) ||
        (value.seedPending !== undefined && typeof value.seedPending !== 'boolean') ||
        (value.seedPending && !value.current) ||
        ([value.pending, value.creation, value.photoPending, value.coverPending, value.coverActionPending, value.workspacePending, value.templatePending, value.maintenancePending, value.productionPending, value.seedPending].filter(Boolean).length > 1) ||
        (value.needsReselect !== undefined && typeof value.needsReselect !== 'boolean') || (value.pending && value.creation) ||
        (value.importId && !value.started) || (value.libraryId && !value.importId)) {
        throw Object.assign(new Error('机器绑定记录损坏，已保留现场；请联系维护者检查。'), {code: 'BINDING_INVALID'});
    }
    return value as unknown as Binding;
}

export const emptyBinding = (): Binding => ({
    version: 1,
    source: null,
    sourceHash: null,
    destination: null,
    started: false,
    importId: null,
    libraryId: null,
    current: null,
    pending: null,
    workspacePending: null,
    templatePending: null,
    maintenancePending: null,
    productionPending: null,
    creation: null,
    needsReselect: false
});

export class BindingStore {
    file: string;

    constructor(file: string) {
        this.file = file;
    }

    async load() {
        try {
            const info = await fs.lstat(this.file);
            if (!info.isFile() || info.isSymbolicLink() || info.size > 8_000_000) throw new Error('Invalid binding file');
            return validateBinding(JSON.parse(await fs.readFile(this.file, 'utf8')));
        } catch (error) {
            if (errorInfo(error).code === 'ENOENT') return emptyBinding();
            throw Object.assign(new Error('无法读取机器绑定记录，已保留现场。'), {code: 'BINDING_INVALID', cause: error});
        }
    }

    async save(binding: Binding) {
        validateBinding(binding);
        await fs.mkdir(path.dirname(this.file), {recursive: true, mode: 0o700});
        const temporary = `${this.file}.${randomUUID()}.tmp`;
        const handle = await fs.open(temporary, 'wx', 0o600);
        try {
            await handle.writeFile(JSON.stringify(binding));
            await handle.sync();
        } finally {
            await handle.close();
        }
        await fs.rename(temporary, this.file);
        // Windows does not provide directory fsync through Node; file data is still flushed.
        if (process.platform !== 'win32') {
            const parent = await fs.open(path.dirname(this.file), 'r');
            try {
                await parent.sync();
            } finally {
                await parent.close();
            }
        }
    }
}
