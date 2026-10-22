import fs from 'node:fs';
import path from 'node:path';
import {randomUUID, createHash} from 'node:crypto';

const MAX_BYTES = 64 * 1024;
const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const phases = ['reading', 'generating', 'validating', 'analyzing', 'restoring'];
const states = ['running', 'waiting-user', 'waiting-permission'];
const fields = ['host', 'requestHash', 'phase', 'state', 'message', 'expectedRevision', 'mutationId', 'sessionId'];
const digest = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const validPayload = (v, kind) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every(k => fields.includes(k)) &&
    fields.filter(k => k !== 'sessionId').every(k => Object.hasOwn(v, k)) && ['codex', 'workbuddy'].includes(v.host) && /^[a-f0-9]{64}$/.test(v.requestHash) &&
    phases.includes(v.phase) && (kind === 'template' || !['analyzing', 'restoring'].includes(v.phase)) && states.includes(v.state) &&
    typeof v.message === 'string' && v.message.trim().length > 0 && v.message.length <= 240 && !/[\p{Cc}\p{Cf}]/u.test(v.message) &&
    Number.isSafeInteger(v.expectedRevision) && v.expectedRevision >= 0 && uuid(v.mutationId) && (v.sessionId === undefined || uuid(v.sessionId));

// Progress is advisory and lives beside the immutable handoff; content CAS tokens never include it.
export function attemptProgress(h, kind) {
    const {safePath, directory, fail} = h;
    const identity = fs.lstatSync(h.root, {bigint: true});
    const bind = ownership => ({...ownership, root: h.root, rootIdentity: {dev: identity.dev.toString(), ino: identity.ino.toString()}});
    function load(dir, ownership) {
        const file = path.join(dir, '进度.json'), stat = safePath(file, true);
        if (!stat) return null;
        if (!stat.isFile() || stat.size > MAX_BYTES) fail('PROGRESS_UNAVAILABLE', 'Progress must be a bounded regular file');
        const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
        let value;
        try {
            const opened = fs.fstatSync(fd);
            if (!opened.isFile() || opened.size > MAX_BYTES || opened.ino !== stat.ino || opened.dev !== stat.dev) fail('PROGRESS_UNAVAILABLE', 'Progress changed during read');
            const bytes = Buffer.alloc(MAX_BYTES + 1);
            let size = 0;
            while (size < bytes.length) {const count = fs.readSync(fd, bytes, size, bytes.length - size, null); if (!count) break; size += count;}
            const after = fs.fstatSync(fd), named = safePath(file);
            if (['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].some(k => opened[k] !== after[k] || after[k] !== named[k])) fail('PROGRESS_UNAVAILABLE', 'Progress changed during read');
            if (size > MAX_BYTES) fail('PROGRESS_UNAVAILABLE', 'Progress exceeds size limit');
            value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes.subarray(0, size)));
        } finally {fs.closeSync(fd);}
        if (!value || Object.keys(value).sort().join() !== ['schemaVersion', 'ownership', 'revision', 'payload', 'updatedAt', 'mutations'].sort().join() || value.schemaVersion !== 1 ||
            JSON.stringify(value.ownership) !== JSON.stringify(ownership) || !validPayload(value.payload, kind) || !Number.isSafeInteger(value.revision) || value.revision < 1 ||
            new Date(value.updatedAt).toISOString() !== value.updatedAt || !Array.isArray(value.mutations) || value.mutations.length > 128 ||
            value.mutations.some(m => !m || Object.keys(m).length !== 2 || !uuid(m.id) || !/^[a-f0-9]{64}$/.test(m.hash)) || value.payload.host !== ownership.host || value.payload.requestHash !== ownership.requestHash || value.revision !== value.payload.expectedRevision + 1 || new Set(value.mutations.map(m => m.id)).size !== value.mutations.length || value.mutations.at(-1)?.id !== value.payload.mutationId || value.mutations.at(-1)?.hash !== digest(value.payload)) fail('PROGRESS_UNAVAILABLE', 'Invalid progress record');
        return value;
    }
    const publicValue = v => v ? {phase: v.payload.phase, state: v.payload.state, message: v.payload.message, revision: v.revision, updatedAt: v.updatedAt, ...(v.payload.sessionId ? {sessionId: v.payload.sessionId} : {})} : null;
    function read(dir, ownership) {
        try {return {progress: publicValue(load(dir, bind(ownership))), progressUnavailable: false};}
        catch {return {progress: null, progressUnavailable: true};}
    }
    function write(dir, ownership, raw, claimed) {
        if (!validPayload(raw, kind)) fail('INVALID_INPUT', 'Require bounded progress, host, requestHash, mutationId and expectedRevision');
        if (raw.host !== ownership.host) fail('INVALID_INPUT', 'Host does not own this attempt');
        if (raw.requestHash !== ownership.requestHash) fail('CONFLICT', 'Progress request hash differs');
        if (raw.phase !== 'reading' && !claimed) fail('ATTEMPT_NOT_CLAIMED', 'Claim the attempt before generation or validation');
        ownership = bind(ownership);
        const previous = load(dir, ownership), hash = digest(raw), replay = previous?.mutations.find(m => m.id === raw.mutationId);
        if (replay) {
            if (replay.hash !== hash) fail('CONFLICT', 'Progress mutation ID was reused with different input');
            return publicValue(previous);
        }
        if (raw.expectedRevision !== (previous?.revision ?? 0)) fail('CONFLICT', 'Progress revision changed; reread context before reporting');
        if (previous?.payload.sessionId && raw.sessionId && previous.payload.sessionId !== raw.sessionId) fail('CONFLICT', 'Attempt is already bound to another session');
        const payload = {...raw};
        if (previous?.payload.sessionId && !raw.sessionId) fail('INVALID_INPUT', 'Include the bound sessionId on later progress reports');
        const next = {schemaVersion: 1, ownership, revision: raw.expectedRevision + 1, payload, updatedAt: new Date().toISOString(), mutations: [...previous?.mutations ?? [], {id: raw.mutationId, hash}].slice(-128)};
        const bytes = Buffer.from(JSON.stringify(next) + '\n');
        if (bytes.length > MAX_BYTES) fail('INVALID_INPUT', 'Progress exceeds size limit');
        directory(dir);
        const target = path.join(dir, '进度.json'), temporary = path.join(dir, `.progress-${randomUUID()}`);
        safePath(target, true);
        const fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
        try {fs.writeFileSync(fd, bytes); fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
        try {safePath(target, true); fs.renameSync(temporary, target);} finally {if (fs.existsSync(temporary)) fs.unlinkSync(temporary);}
        let parent;
        try {parent = fs.openSync(dir, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW); fs.fsyncSync(parent);}
        catch (error) {if (process.platform !== 'win32' || !['EISDIR', 'EPERM', 'EINVAL', 'ENOTSUP', 'ENOSYS'].includes(error.code)) throw error;}
        finally {if (parent !== undefined) fs.closeSync(parent);}
        h.assertRootIdentity();
        return publicValue(next);
    }
    return {read, write};
}
