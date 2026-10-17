import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { coverJobMethods, validateCoverJobs } from './cover-jobs.mjs';
import { backupMethods } from './backup.mjs';
import { modelMethods, modelDefaults, validateModelMetadata } from './model-v5.mjs';
import { validateImportedRaster } from '../image-validation/index.mjs';

const FORMAT = 'nova-content-library';
const VERSION = 1;
const LIBRARY_VERSION = 5;
const KINDS = Object.freeze({
  workspace: { directory: '库配置', files: ['配置.json'], format: 'nova-workspace' },
  collection: { directory: '合集', files: ['合集.json', '正文.md'], format: 'nova-collection' },
  content: { directory: '内容', files: ['内容.json', '正文.md'], format: 'nova-content' },
  prompt: { directory: '提示词', files: ['提示词.json', '正文.md'], format: 'nova-prompt' },
  photo: { directory: '我的照片', files: ['照片.json'], format: 'nova-photo' },
  template: { directory: '模板', files: ['模板.json'], format: 'nova-template' },
});
const HASH = /^[0-9a-f]{64}$/;
const BUILTIN = /^builtin-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BARRIER = '升级到3';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const STAGING = /^\.staging-[0-9a-f-]{36}-[0-9a-f-]{36}$/;
const SYSTEM = '系统（别动）';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
let testHook;

export class LibraryError extends Error {
  constructor(code, message, details = {}) {
    super(message, details.cause ? { cause: details.cause } : undefined);
    this.name = 'LibraryError';
    this.code = code;
    Object.assign(this, details);
  }
}

function fail(code, message) { throw new LibraryError(code, message); }
function hook(phase, details = {}) { testHook?.({ phase, ...details }); }

// Fault hooks are deliberately absent from each library's business interface.
export const __testing = Object.freeze({
  setHook(fn) {
    if (process.env.NODE_ENV !== 'test') fail('INVALID_INPUT', 'Fault hooks require NODE_ENV=test');
    testHook = fn;
  },
});

function id(value) {
  if (typeof value !== 'string' || !UUID.test(value)) fail('INVALID_INPUT', 'Expected a UUID v4 ID');
  return value;
}

function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function validPhotoSource(value) {
  return object(value) && Object.keys(value).every(key=>['source','originalId','note'].includes(key)) && typeof value.source==='string' && !!value.source.trim() && value.source.length<=10000 && ['originalId','note'].every(key=>value[key]===undefined || typeof value[key]==='string' && (key==='note' || !!value[key].trim()) && value[key].length<=10000);
}
function date(value) { return typeof value === 'string' && new Date(value).toISOString() === value; }

function parse(bytes, label) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { fail('CORRUPT', `Invalid JSON: ${label}`); }
}

function format(record, expected, label, version = VERSION) {
  if (!object(record) || record.format !== expected || record.schemaVersion !== version) {
    fail('FORMAT_UNSUPPORTED', `Unknown or unsupported format: ${label}`);
  }
}

function objectId(kind, value) {
  if (!Object.hasOwn(KINDS, kind)) fail('CORRUPT', 'Unknown object kind');
  if (kind === 'workspace' && value === 'default') return value;
  if (kind === 'template' && typeof value === 'string' && BUILTIN.test(value)) return value;
  return id(value);
}

function metadata(bytes, objectIdValue, kind = 'content') {
  const meta = parse(bytes, KINDS[kind].files[0]);
  const supported = (kind === 'content' && [2,3,4].includes(meta?.schemaVersion) || ['prompt','photo'].includes(kind) && meta?.schemaVersion === 2) ? meta.schemaVersion : 1;
  format(meta, KINDS[kind].format, KINDS[kind].files[0], supported);
  let validDates = false;
  try { validDates = date(meta.createdAt) && date(meta.updatedAt) && (meta.deletedAt === null || date(meta.deletedAt)); } catch {}
  if (meta.id !== objectIdValue || typeof meta.title !== 'string' || !meta.title.trim() || meta.title.length > 500 ||
      !Number.isSafeInteger(meta.revision) || meta.revision < 1 || !validDates) fail('CORRUPT', `Invalid metadata or duplicate ID: ${objectIdValue}`);
  validateBusinessMetadata(meta,kind);
  return meta;
}

// Check every ancestor: resolving a path alone does not reject symlinks.
function safePath(target, missingLast = false) {
  const absolute = path.resolve(target);
  const parts = absolute.slice(path.parse(absolute).root.length).split(path.sep).filter(Boolean);
  let current = path.parse(absolute).root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    let stat;
    try { stat = fs.lstatSync(current); }
    catch (error) {
      if (error.code === 'ENOENT' && missingLast && i === parts.length - 1) return null;
      throw error;
    }
    if (stat.isSymbolicLink()) fail('UNSAFE_PATH', `Symlink refused: ${current}`);
    if (i < parts.length - 1 && !stat.isDirectory()) fail('UNSAFE_PATH', `Not a directory: ${current}`);
    if (i === parts.length - 1) return stat;
  }
  return fs.lstatSync(absolute);
}

function directory(target) {
  if (!safePath(target).isDirectory()) fail('UNSAFE_PATH', `Not a directory: ${target}`);
}

function read(target, optional = false) {
  const stat = safePath(target, optional);
  if (!stat) return null;
  if (!stat.isFile()) fail('UNSAFE_PATH', `Not a regular file: ${target}`);
  const fd = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try { return fs.readFileSync(fd); } finally { fs.closeSync(fd); }
}

function syncDirectory(target) {
  directory(target);
  let fd;
  try {
    fd = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    fs.fsyncSync(fd);
  } catch (error) {
    // Windows Node cannot flush directory handles; file fsync and atomic publish remain mandatory.
    if (process.platform !== 'win32' || !['EISDIR', 'EPERM', 'EINVAL', 'ENOTSUP', 'ENOSYS'].includes(error.code)) throw error;
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}

function writeNew(target, bytes) {
  directory(path.dirname(target));
  safePath(target, true);
  const fd = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  syncDirectory(path.dirname(target));
}

function mkdir(target) {
  directory(path.dirname(target));
  fs.mkdirSync(target, { mode: 0o700 });
  syncDirectory(path.dirname(target));
}

function ioError(error) {
  return error instanceof LibraryError ? error : new LibraryError('IO_ERROR', error.message, { cause: error });
}

function acquire(root) {
  const lock = path.join(root, SYSTEM, '库锁');
  directory(path.dirname(lock));
  const token = randomUUID();
  const tokenName = `${token}.json`;
  for (let attempt = 0; attempt < 2; attempt++) {
    safePath(lock, true);
    try { fs.mkdirSync(lock, { mode: 0o700 }); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let ownerPath;
      let owner;
      try {
        directory(lock);
        const names = fs.readdirSync(lock);
        if (names.length !== 1 || !UUID.test(names[0].slice(0, -5)) || !names[0].endsWith('.json')) {
          fail('LOCK_UNCERTAIN', 'Empty or malformed lock; inspect it manually, never reclaim by age');
        }
        ownerPath = path.join(lock, names[0]);
        owner = parse(read(ownerPath), 'lock owner');
        if (!object(owner) || owner.token !== names[0].slice(0, -5) || !Number.isSafeInteger(owner.pid) || owner.pid <= 0 || typeof owner.host !== 'string') {
          fail('LOCK_UNCERTAIN', 'Malformed lock owner');
        }
      } catch (inspectionError) {
        if (inspectionError.code === 'ENOENT') fail('BUSY', 'Lock changed while inspecting its owner; retry');
        if (inspectionError.code === 'CORRUPT') fail('LOCK_UNCERTAIN', 'Malformed or incomplete lock owner; never reclaim by age');
        throw inspectionError;
      }
      if (owner.host !== os.hostname()) fail('BUSY', 'Library locked by another host');
      try { process.kill(owner.pid, 0); fail('BUSY', 'Library locked by a live process (including reused PIDs)'); }
      catch (error) { if (error.code !== 'ESRCH') throw error.code === 'BUSY' ? error : new LibraryError('BUSY', 'Lock owner liveness is unknown'); }
      hook('beforeStaleUnlink', { token: owner.token });
      // Only the exact-token unlink winner may rmdir. Never retry or recursively remove.
      try { fs.unlinkSync(ownerPath); }
      catch { fail('BUSY', 'Old lock changed during reclamation'); }
      hook('afterStaleUnlink', { token: owner.token });
      try { fs.rmdirSync(lock); }
      catch { fail('LOCK_UNCERTAIN', 'Old lock directory changed during reclamation'); }
      continue;
    }
    try {
      hook('beforeOwnerWrite', { token });
      writeNew(path.join(lock, tokenName), jsonBytes({ token, host: os.hostname(), pid: process.pid }));
      hook('afterOwnerWrite', { token });
      syncDirectory(path.dirname(lock));
    } catch (error) {
      // Initialization owns this exact token; never leave a live-PID lock after a failed acquire.
      try {
        try { fs.unlinkSync(path.join(lock, tokenName)); }
        catch (cleanupError) { if (cleanupError.code !== 'ENOENT') throw cleanupError; }
        fs.rmdirSync(lock);
        syncDirectory(path.dirname(lock));
      } catch (cleanupError) {
        throw new LibraryError('LOCK_UNCERTAIN', 'Lock initialization failed and its cleanup could not be confirmed', { cause: cleanupError, initializationError: ioError(error) });
      }
      throw error;
    }
    return () => {
      directory(lock);
      hook('beforeRelease', { token });
      try { fs.unlinkSync(path.join(lock, tokenName)); } catch (error) {
        if (error.code === 'ENOENT') return;
        throw error;
      }
      try { fs.rmdirSync(lock); } catch (error) {
        if (error.code !== 'ENOTEMPTY' && error.code !== 'ENOENT') throw error;
      }
      syncDirectory(path.dirname(lock));
    };
  }
  fail('BUSY', 'Library lock changed; retry');
}

function descriptor(root, upgrading = false) {
  directory(root);
  const info = parse(read(path.join(root, '内容库.json')), '内容库.json');
  if (info?.format === FORMAT && [1, 2, 3, 4].includes(info.schemaVersion) && !upgrading) fail('UPGRADE_REQUIRED', 'Library schema 1, 2, 3 or 4 requires explicit upgradeLibrary(root)');
  format(info, FORMAT, '内容库.json', upgrading && [1, 2, 3, 4].includes(info?.schemaVersion) ? info.schemaVersion : LIBRARY_VERSION);
  let validDate = false;
  try { validDate = date(info.createdAt); } catch {}
  if (!UUID.test(info.libraryId) || !validDate) fail('CORRUPT', 'Invalid library identity');
  directory(path.join(root, '内容'));
  directory(path.join(root, SYSTEM));
  directory(path.join(root, SYSTEM, '事务'));
  if (info.schemaVersion >= 2) {
    directory(path.join(root, SYSTEM, '事务', '待恢复'));
    directory(path.join(root, SYSTEM, '事务', '已提交'));
  }
  if (info.schemaVersion >= 3) {
    for (const name of ['提示词', '我的照片', '模板', '资产']) directory(path.join(root, name));
    directory(path.join(root, '资产', 'sha256'));
  }
  if (info.schemaVersion >= 5) {
    directory(path.join(root, '库配置')); directory(path.join(root, '合集'));
  }
  return info;
}

function contentPaths(root, contentId, kind = 'content') {
  const dir = path.join(root, KINDS[kind].directory, objectId(kind, contentId));
  directory(dir);
  return KINDS[kind].files.map(file => path.join(dir, file));
}

function snapshot(root, contentId, kind = 'content') {
  let files;
  try { files = contentPaths(root, contentId, kind).map(file => read(file)); }
  catch (error) {
    if (error.code === 'ENOENT') fail('CORRUPT', `Missing content directory or authoritative file: ${contentId}`);
    throw error;
  }
  metadata(files[0], contentId, kind);
  return files;
}

function result(files, contentId, mutationId, kind = 'content') {
  const meta = metadata(files[0], contentId, kind);
  const editToken = hash(Buffer.concat(files.map(bytes => Buffer.from(hash(bytes), 'hex'))));
  return { ...meta, ...(files[1] ? { body: files[1].toString('utf8') } : {}), editToken, ...(mutationId ? { mutationId } : {}) };
}

function pack(bytes) { return bytes === null ? null : { bytes: bytes.toString('base64'), sha256: hash(bytes) }; }
function unpack(value) {
  if (value === null) return null;
  if (!object(value) || Object.keys(value).some(key => !['bytes', 'sha256'].includes(key)) ||
      typeof value.bytes !== 'string' || typeof value.sha256 !== 'string') fail('CORRUPT', 'Invalid journal bytes');
  const bytes = Buffer.from(value.bytes, 'base64');
  if (bytes.toString('base64') !== value.bytes || hash(bytes) !== value.sha256) fail('CORRUPT', 'Journal checksum mismatch');
  return bytes;
}

function transactionDir(root, mutationId) {
  const base = path.join(root, SYSTEM, '事务');
  const pending = path.join(base, '待恢复', id(mutationId));
  const committed = path.join(base, '已提交', mutationId);
  const pendingExists = safePath(pending, true);
  const committedExists = safePath(committed, true);
  if (pendingExists && committedExists) fail('RECOVERY_CONFLICT', `Duplicate mutation ID: ${mutationId}`);
  return pendingExists ? pending : committedExists ? committed : null;
}

function transaction(root, mutationId, libraryId, location = transactionDir(root, mutationId)) {
  if (!location) fail('CORRUPT', `Missing transaction: ${mutationId}`);
  const dir = location;
  directory(dir);
  const raw = read(path.join(dir, 'intent.json'));
  const intent = parse(raw, 'intent.json');
  const legacy = intent?.schemaVersion === 1;
  const kind = legacy ? 'content' : intent?.objectKind;
  const targetId = legacy ? intent.contentId : intent?.objectId;
  if (!object(intent) || ![1, 2, 3].includes(intent.schemaVersion) || !Object.hasOwn(KINDS, kind) || (intent.schemaVersion < 3 && ['workspace','collection'].includes(kind)) || intent.libraryId !== libraryId || intent.mutationId !== mutationId ||
      !['create', 'update', 'trash', 'restore', 'restore-interrupted', 'resolve-photo'].includes(intent.operation) ||
      !HASH.test(intent.requestDigest) || !Array.isArray(intent.before) || intent.before.length !== KINDS[kind].files.length ||
      !Array.isArray(intent.after) || intent.after.length !== KINDS[kind].files.length || Object.keys(intent).some(key => !['schemaVersion', 'libraryId', 'mutationId', ...(legacy ? ['contentId'] : ['objectKind', 'objectId']), 'operation', 'requestDigest', 'before', 'after'].includes(key))) fail('CORRUPT', 'Invalid transaction plan');
  try { objectId(kind, targetId); } catch { fail('CORRUPT', 'Invalid transaction object ID'); }
  const before = intent.before.map(unpack);
  const after = intent.after.map(unpack);
  if (after.some(bytes => bytes === null) || (intent.operation === 'create' ? before.some(bytes => bytes !== null) : before.some(bytes => bytes === null))) fail('CORRUPT', 'Invalid transaction file set');
  const next = metadata(after[0], targetId, kind);
  if (intent.operation === 'resolve-photo' && kind !== 'photo') fail('CORRUPT', 'Resolve-photo requires a photo');
  if (intent.operation === 'create') {
    if (next.revision !== 1 || next.deletedAt !== null) fail('CORRUPT', 'Invalid create plan');
  } else {
    const old = metadata(before[0], targetId, kind);
    if (['content','prompt','photo'].includes(kind) && next.schemaVersion<old.schemaVersion) fail('CORRUPT','Content schema cannot regress');
    if (next.revision !== old.revision + 1 || next.createdAt !== old.createdAt) fail('CORRUPT', 'Invalid revision plan');
    if (intent.operation === 'restore-interrupted') {
      if (kind !== 'content' || !old.coverJobs?.some(job => job.attempts.some(attempt => ['created','claimed'].includes(attempt.status)))) fail('CORRUPT','Invalid restore interruption');
      const expected = interruptRestoredAttempts(old, next.updatedAt);
      if (!isDeepStrictEqual(next, {...expected, revision: old.revision + 1, updatedAt: next.updatedAt}) || !equal(before[1],after[1])) fail('CORRUPT','Restore interruption changed unrelated data');
    } else if (intent.operation === 'resolve-photo') {
      const expected = {...old, assetHash:next.assetHash, availability:'available', revision:old.revision+1, updatedAt:next.updatedAt};
      if (old.schemaVersion !== 2 || old.availability !== 'unavailable' || !isDeepStrictEqual(next,expected)) fail('CORRUPT','Photo resolution changed unrelated data');
    } else if (intent.operation !== 'update') {
      const business=record=>Object.fromEntries(Object.entries(record).filter(([key])=>!['revision','updatedAt','deletedAt'].includes(key)));
      if (!isDeepStrictEqual(business(old),business(next))) fail('CORRUPT','Trash/restore cannot change business fields');
    }
    if (!['update','restore-interrupted','resolve-photo'].includes(intent.operation) && ((before[1] && !before[1].equals(after[1])) || old.title !== next.title)) fail('CORRUPT', 'Invalid trash/restore plan');
    if ((intent.operation === 'trash' && (old.deletedAt !== null || next.deletedAt === null)) ||
        (intent.operation === 'restore' && (old.deletedAt === null || next.deletedAt !== null)) ||
        (intent.operation === 'update' && (old.deletedAt !== null || next.deletedAt !== null))) fail('CORRUPT', 'Invalid state transition');
  }
  const marker = read(path.join(dir, 'COMMITTED'), true);
  if (marker && marker.toString() !== `${hash(raw)}\n`) fail('CORRUPT', 'Invalid completion marker');
  if (dir === path.join(root, SYSTEM, '事务', '已提交', mutationId) && marker === null) fail('CORRUPT', 'Committed history is missing its completion marker');
  return { dir, intent, raw, before, after, kind, objectId: targetId, committed: marker !== null };
}

function equal(a, b) { return a === null || b === null ? a === b : a.equals(b); }

function committedFailure(error, tx) {
  return Object.assign(ioError(error), { mutationId: tx.intent.mutationId, contentId: tx.objectId, objectId: tx.objectId, objectKind: tx.kind, outcome: 'committed', pendingRecovery: true });
}

function archiveTransaction(root, tx) {
  const history = path.join(root, SYSTEM, '事务', '已提交');
  const target = path.join(history, tx.intent.mutationId);
  try {
    directory(history);
    directory(tx.dir);
    if (safePath(target, true)) fail('RECOVERY_CONFLICT', `Duplicate mutation ID: ${tx.intent.mutationId}`);
    hook('beforeArchive', { mutationId: tx.intent.mutationId });
    fs.renameSync(tx.dir, target);
    hook('afterArchiveRename', { mutationId: tx.intent.mutationId });
    syncDirectory(path.dirname(tx.dir));
    hook('afterArchiveSourceSync', { mutationId: tx.intent.mutationId });
    syncDirectory(history);
    hook('afterArchiveTargetSync', { mutationId: tx.intent.mutationId });
    if (tx.kind === 'template' && tx.intent.operation === 'create') {
      try { fs.unlinkSync(path.join(root, '模板', tx.objectId, '未登记.json')); syncDirectory(path.join(root, '模板', tx.objectId)); } catch {}
    }
  } catch (error) { throw committedFailure(error, tx); }
}

function currentState(tx, targets) {
  return targets.map((target, index) => {
    const current = read(target, true);
    const captured = read(path.join(tx.dir, `captured-${index}`), true);
    if (captured !== null && !equal(captured, tx.before[index])) fail('RECOVERY_CONFLICT', `Captured file differs from before: ${target}`);
    if (!equal(current, tx.before[index]) && !equal(current, tx.after[index]) && !(current === null && captured !== null)) {
      fail('RECOVERY_CONFLICT', `External bytes differ from both transaction states: ${target}`);
    }
    if (captured !== null && current !== null && !equal(current, tx.after[index])) fail('RECOVERY_CONFLICT', `File recreated after capture: ${target}`);
    return { current, captured };
  });
}

function applyTransaction(root, tx) {
  const contentDir = path.join(root, KINDS[tx.kind].directory, tx.objectId);
  if (!safePath(contentDir, true)) {
    if (tx.intent.operation !== 'create') fail('RECOVERY_CONFLICT', 'Existing content directory disappeared');
    mkdir(contentDir);
  }
  const targets = contentPaths(root, tx.objectId, tx.kind);
  // Inspect every file in the fixed kind before changing any; third-state data stops recovery.
  const states = currentState(tx, targets);
  for (let index = 0; index < targets.length; index++) {
    const target = targets[index];
    let { current, captured } = states[index];
    if (equal(current, tx.after[index])) continue;
    hook('beforeCapture', { mutationId: tx.intent.mutationId, index });
    if (current !== null) {
      directory(contentDir);
      safePath(target);
      const capturePath = path.join(tx.dir, `captured-${index}`);
      if (safePath(capturePath, true)) fail('RECOVERY_CONFLICT', 'Capture already exists');
      fs.renameSync(target, capturePath);
      syncDirectory(contentDir);
      syncDirectory(tx.dir);
      captured = read(capturePath);
      if (!equal(captured, tx.before[index])) fail('RECOVERY_CONFLICT', `File changed while being captured: ${target}`);
    }
    hook('afterCapture', { mutationId: tx.intent.mutationId, index });
    const temporary = path.join(contentDir, `.install-${tx.intent.mutationId}-${index}-${randomUUID()}`);
    writeNew(temporary, tx.after[index]);
    hook('beforeInstall', { mutationId: tx.intent.mutationId, index });
    directory(contentDir);
    safePath(target, true);
    try { fs.linkSync(temporary, target); }
    catch (error) {
      if (error.code === 'EEXIST') fail('RECOVERY_CONFLICT', `File appeared during installation; both copies retained: ${target}`);
      throw error;
    }
    syncDirectory(contentDir);
    fs.unlinkSync(temporary);
    syncDirectory(contentDir);
    hook('afterFile', { mutationId: tx.intent.mutationId, index });
  }
  const final = targets.map(target => read(target));
  if (!final.every((bytes, index) => equal(bytes, tx.after[index]))) fail('RECOVERY_CONFLICT', 'Files changed before commit');
  hook('beforeCommit', { mutationId: tx.intent.mutationId });
  const markerStage = path.join(tx.dir, `.COMMITTED-${randomUUID()}`);
  writeNew(markerStage, Buffer.from(`${hash(tx.raw)}\n`));
  hook('beforeMarkerPublish', { mutationId: tx.intent.mutationId });
  safePath(path.join(tx.dir, 'COMMITTED'), true);
  fs.linkSync(markerStage, path.join(tx.dir, 'COMMITTED'));
  syncDirectory(tx.dir);
  hook('afterCommit', { mutationId: tx.intent.mutationId });
  // Return success only after the final authoritative bytes have been checked again.
  if (!targets.every((target, index) => equal(read(target), tx.after[index]))) fail('RECOVERY_CONFLICT', 'Files changed immediately after commit');
}

function recover(root, libraryId) {
  const base = path.join(root, SYSTEM, '事务');
  if (fs.readdirSync(base).some(name => !['待恢复', '已提交', BARRIER, '升级到4', '升级到5'].includes(name))) fail('CORRUPT', 'Unexpected transaction layout');
  const dir = path.join(root, SYSTEM, '事务', '待恢复');
  // A prior rename may have succeeded before either parent-directory sync failed.
  syncDirectory(dir);
  syncDirectory(path.join(base, '已提交'));
  const pending = [];
  const completed = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (STAGING.test(name)) { directory(path.join(dir, name)); continue; }
    if (!UUID.test(name)) fail('CORRUPT', `Unexpected transaction entry: ${name}`);
    const tx = transaction(root, name, libraryId);
    if (tx.committed) completed.push(name);
    else pending.push(name);
  }
  // One writer cannot start another intent before recovering the previous one.
  if (pending.length > 1) fail('RECOVERY_CONFLICT', 'Multiple unfinished transactions; manual diagnosis required');
  for (const name of completed) archiveTransaction(root, transaction(root,name,libraryId));
  for (const name of pending) {
    const tx = transaction(root,name,libraryId);
    try { applyTransaction(root, tx); archiveTransaction(root, tx); }
    catch (error) { throw Object.assign(ioError(error), { mutationId: tx.intent.mutationId, pendingRecovery: true }); }
  }
}

function fields(value, patch = false) {
  if (!object(value) || Object.keys(value).some(key => !['title', 'body'].includes(key)) || !Object.keys(value).length ||
      (!patch && (!Object.hasOwn(value, 'title') || !Object.hasOwn(value, 'body')))) fail('INVALID_INPUT', 'Only title and body are accepted');
  if (Object.hasOwn(value, 'title') && (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 500)) fail('INVALID_INPUT', 'Title must contain 1–500 characters');
  if (Object.hasOwn(value, 'body') && typeof value.body !== 'string') fail('INVALID_INPUT', 'Body must be a string');
  return { ...(Object.hasOwn(value, 'title') ? { title: value.title } : {}), ...(Object.hasOwn(value, 'body') ? { body: value.body } : {}) };
}

function library(root, initialInfo, rootIdentity) {
  function assertRootIdentity() {
    directory(root);
    const current = fs.lstatSync(root, {bigint:true});
    if (current.dev !== rootIdentity.dev || current.ino !== rootIdentity.ino) fail('CONFLICT','Library root was replaced; explicitly reopen the selected library');
  }
  function locked(fn) {
    let release;
    let primaryError;
    let value;
    try {
      assertRootIdentity();
      const info = descriptor(root);
      if (info.libraryId !== initialInfo.libraryId) fail('CORRUPT', 'Library identity changed');
      release = acquire(root);
      assertRootIdentity();
      const current = descriptor(root);
      if (current.libraryId !== initialInfo.libraryId) fail('CORRUPT', 'Library identity changed');
      recover(root, current.libraryId);
      value = fn();
      return value;
    } catch (error) { primaryError = ioError(error); throw primaryError; }
    finally {
      if (release) {
        try { release(); } catch (error) {
          if (!primaryError) {
            const failure = ioError(error);
            if (value?.mutationId && value?.id) Object.assign(failure, { mutationId: value.mutationId, contentId: value.id, outcome: 'committed' });
            throw failure;
          }
        }
      }
    }
  }

  function list(deleted, kind = 'content') {
    return locked(() => fs.readdirSync(path.join(root, KINDS[kind].directory)).sort().filter(name => {
      if (kind==='template' && STAGING.test(name)) { directory(path.join(root,'模板',name)); return false; }
      try { objectId(kind,name); } catch { fail('CORRUPT', 'Invalid object directory ID'); }
      if (kind !== 'template') return true;
      const dir = path.join(root, '模板', name);
      if (safePath(path.join(dir, '模板.json'), true)) return true;
      const marker = read(path.join(dir, '未登记.json'), true);
      if (!marker) fail('CORRUPT', 'Template metadata missing without an orphan marker');
      unregisteredTemplate(marker, name);
      return false;
    }).map(name => {
      try { objectId(kind, name); } catch { fail('CORRUPT', `Unexpected object directory: ${name}`); }
      return result(snapshot(root, name, kind), name, undefined, kind);
    }).filter(item => (item.deletedAt !== null) === deleted));
  }

  function mutate(operation, contentId, input, expectedToken, options = {}, kind = 'content', edit, forcedId, currentRevision = false) {
    if (!object(options) || Object.keys(options).some(key => key !== 'mutationId')) fail('INVALID_INPUT', 'Only mutationId is accepted as an option');
    const mutationId = options.mutationId === undefined ? randomUUID() : id(options.mutationId);
    if (operation !== 'create') {
      objectId(kind, contentId);
      if (!currentRevision && (typeof expectedToken !== 'string' || !/^[0-9a-f]{64}$/.test(expectedToken))) fail('INVALID_INPUT', 'A read editToken is required');
    }
    const requestDigest = hash(jsonBytes(kind === 'content' ? { operation, contentId, input, expectedToken } : { objectKind: kind, operation, objectId: contentId, input, expectedToken }));
    return locked(() => {
      const txDir = path.join(root, SYSTEM, '事务', '待恢复', mutationId);
      if (transactionDir(root, mutationId)) {
        const tx = transaction(root, mutationId, initialInfo.libraryId);
        if (tx.intent.requestDigest !== requestDigest) fail('INVALID_INPUT', 'mutationId was used with a different request');
        return result(tx.after, tx.objectId, mutationId, tx.kind);
      }
      const before = operation === 'create' ? KINDS[kind].files.map(() => null) : snapshot(root, contentId, kind);
      let meta;
      const now = new Date().toISOString();
      if (operation === 'create') {
        contentId = forcedId || randomUUID();
        objectId(kind, contentId);
        const existingDir=path.join(root,KINDS[kind].directory,contentId);
        if (safePath(existingDir,true)) {
          if (kind!=='template' || safePath(path.join(existingDir,'模板.json'),true)) fail('CONFLICT','Object ID already exists');
          const marker=read(path.join(existingDir,'未登记.json'),true);
          if (!marker) fail('CORRUPT','Cannot take over an unmarked template directory');
          unregisteredTemplate(marker,contentId);
        }
        meta = { format: KINDS[kind].format, schemaVersion: kind === 'content' ? 4 : kind === 'prompt' ? 2 : VERSION, id: contentId, title: input.title, revision: 1, createdAt: now, updatedAt: now, deletedAt: null };
      } else {
        const current = result(before, contentId, undefined, kind);
        if (!currentRevision && current.editToken !== expectedToken) fail('CONFLICT', 'Content changed; read again before retrying');
        if (operation !== 'resolve-photo' && (operation === 'restore') !== (current.deletedAt !== null)) fail('INVALID_STATE', 'Content is already in the requested state or is trashed');
        meta = { ...metadata(before[0], contentId, kind), revision: current.revision + 1, updatedAt: now };
        if (operation === 'trash') meta.deletedAt = now;
        if (operation === 'restore') meta.deletedAt = null;
        if (operation === 'update' && Object.hasOwn(input, 'title')) meta.title = input.title;
      }
      if (operation === 'create') meta = { ...meta, ...modelDefaults(kind) };
      if (edit) {
        try { meta=edit(meta,before,{mutationId}); }
        catch(error) { throw Object.assign(ioError(error),{mutationId,pendingRecovery:false}); }
      }
      const after = [jsonBytes(meta), ...(KINDS[kind].files.length === 2 ? [operation === 'create' || Object.hasOwn(input, 'body') ? Buffer.from(input.body) : before[1]] : [])];
      metadata(after[0], contentId, kind);
      const intent = { schemaVersion: 3, libraryId: initialInfo.libraryId, mutationId, objectKind: kind, objectId: contentId, operation, requestDigest, before: before.map(pack), after: after.map(pack) };
      const stagingDir = path.join(root, SYSTEM, '事务', '待恢复', `.staging-${mutationId}-${randomUUID()}`);
      mkdir(stagingDir);
      let published = false;
      // Only a fully durable staged intent is published as a recoverable transaction.
      try {
        hook('beforeJournal', { mutationId });
        writeNew(path.join(stagingDir, 'intent.json'), jsonBytes(intent));
        hook('beforeIntentPublish', { mutationId });
        fs.renameSync(stagingDir, txDir);
        published = true;
        syncDirectory(path.dirname(txDir));
        hook('afterJournal', { mutationId });
        const tx = transaction(root, mutationId, initialInfo.libraryId);
        applyTransaction(root, tx);
        archiveTransaction(root, tx);
        return result(after, contentId, mutationId, kind);
      } catch (error) {
        let completed;
        if (published) {
          try { completed = transaction(root, mutationId, initialInfo.libraryId); } catch {}
        }
        if (completed?.committed) throw committedFailure(error, completed);
        throw Object.assign(ioError(error), { mutationId, pendingRecovery: published });
      }
    });
  }

  return Object.freeze({
    ...businessMethods(root, locked, mutate, list),
    ...coverJobMethods({
      changeCurrent: (contentId,input,edit,options) => mutate('update',contentId,input,undefined,options,'content',edit,undefined,true),
      replayCoverRequest: (contentId,input,expectedToken,options = {}) => {
        if (!object(options) || Object.keys(options).some(key => key !== 'mutationId')) fail('INVALID_INPUT','Only mutationId is accepted as an option');
        if (options.mutationId === undefined) return null;
        const mutationId = id(options.mutationId);
        return locked(() => {
          if (!transactionDir(root,mutationId)) return null;
          const tx = transaction(root,mutationId,initialInfo.libraryId);
          const digest = hash(jsonBytes({operation:'update',contentId,input,expectedToken}));
          if (tx.intent.requestDigest !== digest) fail('INVALID_INPUT','mutationId was used with a different request');
          return result(tx.after,tx.objectId,mutationId,tx.kind);
        });
      },
      root, libraryId: initialInfo.libraryId, assertRootIdentity, locked, mutate, snapshot, result, metadata, hash, jsonBytes, read,
      safePath, directory, ensureDirectory, immutableFile, readAssetInternal, assetPath, hook, inputFields,
      text, id, objectId, checkedHash, templatePackage, fail, LibraryError,
    }),
    ...modelMethods({root,locked,mutate,list,snapshot,result,metadata,hash,jsonBytes,read,safePath,directory,ensureDirectory,writeNew,syncDirectory,hook,inputFields,text,id,objectId,checkedHash,templatePackage,readAssetInternal,fail}),
    info: Object.freeze({ ...initialInfo, root, rootIdentity: Object.freeze({dev:rootIdentity.dev.toString(),ino:rootIdentity.ino.toString()}), durability: process.platform === 'win32' ? 'process-crash/file-fsync' : 'process-crash/file-and-directory-fsync' }),
    listContents: () => list(false),
    listTrash: () => list(true),
    readContent: contentId => locked(() => result(snapshot(root, id(contentId)), contentId)),
    trashContent: (contentId, token, options) => mutate('trash', contentId, {}, token, options, 'content', meta => { for (const name of fs.readdirSync(path.join(root,'合集'))) { const collection = metadata(snapshot(root,name,'collection')[0],name,'collection'); if (collection.deletedAt === null && collection.memberIds.includes(contentId)) fail('INVALID_STATE','Remove content from its collection before trashing'); } return meta; }),
    restoreContent: (contentId, token, options) => mutate('restore', contentId, {}, token, options),
    queryMutation: mutationId => locked(() => {
      if (!transactionDir(root, id(mutationId))) return null;
      const tx = transaction(root, mutationId, initialInfo.libraryId);
      return { mutationId, status: 'committed', objectKind: tx.kind, objectId: tx.objectId, content: result(tx.after, tx.objectId, mutationId, tx.kind) };
    }),
  });
}

function canonicalRoot(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) fail('INVALID_INPUT', 'Library root must be an absolute path');
  root = path.resolve(root);
  // Canonicalize caller-selected ancestors (e.g. macOS /tmp), never a linked library root.
  let stat;
  try { stat = fs.lstatSync(root); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (stat?.isSymbolicLink()) fail('UNSAFE_PATH', 'Library root must not be a symlink');
  return path.join(fs.realpathSync(path.dirname(root)), path.basename(root));
}

function upgradeMove(source, target, mutationId) {
  directory(source);
  directory(path.dirname(target));
  if (safePath(target, true)) fail('RECOVERY_CONFLICT', `Upgrade destination already exists: ${mutationId}`);
  hook('upgradeBeforeMove', { mutationId });
  fs.renameSync(source, target);
  hook('upgradeAfterMove', { mutationId });
  syncDirectory(path.dirname(source));
  syncDirectory(path.dirname(target));
}

/** Explicit, resumable schema-1 -> schema-2 -> schema-3 upgrades. */
export function upgradeLibrary(root) {
  let release;
  let primaryError;
  try {
    root = canonicalRoot(root);
    const initial = descriptor(root, true);
    if (initial.schemaVersion >= 4) return upgradeTo5(root);
    if (initial.schemaVersion === 3) { upgradeTo4(root); return upgradeTo5(root); }
    if (initial.schemaVersion === 2) { upgradeTo3(root); upgradeTo4(root); return upgradeTo5(root); }
    release = acquire(root);
    const info = descriptor(root, true);
    if (info.libraryId !== initial.libraryId) fail('CORRUPT', 'Library identity changed during upgrade');
    if (info.schemaVersion !== 1) fail('CONFLICT', 'Library schema changed during upgrade; reopen it');
    const descriptorPath = path.join(root, '内容库.json');
    const original = read(descriptorPath);
    const system = path.join(root, SYSTEM);
    const backup = path.join(system, '内容库.schema1.bak.json');
    const existingBackup = read(backup, true);
    if (existingBackup !== null && !existingBackup.equals(original)) fail('RECOVERY_CONFLICT', 'Existing schema-1 descriptor backup differs from the current descriptor');
    if (existingBackup === null) {
      const temporary = path.join(system, `.内容库.schema1.bak-${randomUUID()}`);
      writeNew(temporary, original);
      hook('upgradeBeforeBackupPublish');
      safePath(backup, true);
      fs.linkSync(temporary, backup);
      syncDirectory(system);
    }
    hook('upgradeAfterBackup');
    const base = path.join(system, '事务');
    const pending = path.join(base, '待恢复');
    const history = path.join(base, '已提交');
    for (const dir of [pending, history]) {
      if (!safePath(dir, true)) mkdir(dir);
      else directory(dir);
      hook('upgradeAfterDirectory', { name: path.basename(dir) });
    }
    hook('upgradeAfterDirectories');
    const seen = new Set();
    const plans = [];
    const stages = [];
    let unfinished = 0;
    // Validate every legacy/pending/history plan before moving or replaying any transaction.
    for (const dir of [base, pending, history]) {
      for (const name of fs.readdirSync(dir).sort()) {
        if (dir === base && ['待恢复', '已提交'].includes(name)) continue;
        const source = path.join(dir, name);
        if (STAGING.test(name) && dir !== history) {
          directory(source);
          if (dir === base) {
            const target = path.join(pending, name);
            if (safePath(target, true)) fail('RECOVERY_CONFLICT', `Duplicate staging entry during upgrade: ${name}`);
            stages.push({ source, target });
          }
          continue;
        }
        if (!UUID.test(name)) fail('CORRUPT', `Unexpected upgrade transaction entry: ${name}`);
        if (seen.has(name)) fail('RECOVERY_CONFLICT', `Duplicate mutation ID during upgrade: ${name}`);
        seen.add(name);
        const tx = transaction(root, name, info.libraryId, source);
        if (dir === history && !tx.committed) fail('CORRUPT', 'Uncommitted transaction in committed history');
        if (!tx.committed) {
          unfinished++;
          const contentDir = path.join(root, KINDS[tx.kind].directory, tx.objectId);
          if (!safePath(contentDir, true)) {
            if (tx.intent.operation !== 'create') fail('RECOVERY_CONFLICT', 'Pending content directory disappeared');
          } else currentState(tx, contentPaths(root, tx.objectId, tx.kind));
        }
        plans.push({ tx, target: path.join(tx.committed ? history : pending, name) });
      }
    }
    if (unfinished > 1) fail('RECOVERY_CONFLICT', 'Multiple unfinished upgrade transactions');
    hook('upgradeAfterPreflight');
    for (const { tx, target } of plans) if (tx.dir !== target) upgradeMove(tx.dir, target, tx.intent.mutationId);
    for (const { source, target } of stages) upgradeMove(source, target, path.basename(source));
    recover(root, info.libraryId);
    hook('upgradeAfterRecovery');
    if (fs.readdirSync(base).some(name => !['待恢复', '已提交'].includes(name)) ||
        fs.readdirSync(pending).some(name => !STAGING.test(name))) fail('RECOVERY_CONFLICT', 'Upgrade still has unresolved transactions');
    if (!read(descriptorPath).equals(original)) fail('CONFLICT', 'Library descriptor changed during upgrade');
    const descriptorStage = path.join(root, `.内容库.schema2-${randomUUID()}`);
    writeNew(descriptorStage, jsonBytes({ ...parse(original, '内容库.json'), schemaVersion: 2 }));
    hook('upgradeBeforeDescriptorPublish');
    safePath(descriptorPath);
    fs.renameSync(descriptorStage, descriptorPath);
    hook('upgradeAfterDescriptorPublish');
    syncDirectory(root);
  } catch (error) { primaryError = ioError(error); throw primaryError; }
  finally {
    if (release) {
      try { release(); } catch (error) { if (!primaryError) throw ioError(error); }
    }
  }
  upgradeTo3(root);
  upgradeTo4(root);
  return upgradeTo5(root);
}

export function createLibrary(root) {
  try {
    root = canonicalRoot(root);
    directory(path.dirname(root));
    if (!safePath(root, true)) mkdir(root);
    directory(root);
    if (fs.readdirSync(root).length) fail('NOT_EMPTY', 'Refusing to take over a nonempty directory');
    // mkdir is the exclusive initialization gate for two simultaneous creators.
    mkdir(path.join(root, SYSTEM));
    mkdir(path.join(root, SYSTEM, '事务'));
    mkdir(path.join(root, SYSTEM, '事务', '待恢复'));
    mkdir(path.join(root, SYSTEM, '事务', '已提交'));
    mkdir(path.join(root, '内容'));
    for (const name of ['提示词','我的照片','模板','资产']) mkdir(path.join(root,name));
    mkdir(path.join(root,'资产','sha256'));
    initializeModel(root);
    writeNew(path.join(root, '内容库.json'), jsonBytes({ format: FORMAT, schemaVersion: LIBRARY_VERSION, libraryId: randomUUID(), createdAt: new Date().toISOString() }));
    return openLibrary(root);
  } catch (error) { throw ioError(error); }
}

export function openLibrary(root, options) {
  try {
    let expected;
    if (options !== undefined) {
      const exact = (value, keys) => object(value) && Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key));
      const decimal = value => typeof value === 'string' && /^(0|[1-9][0-9]*)$/.exec(value)?.[0] === value;
      if (!exact(options,['expectedLibraryId','expectedRootIdentity']) ||
          typeof options.expectedLibraryId !== 'string' || options.expectedLibraryId.length !== 36 || !UUID.test(options.expectedLibraryId) ||
          !exact(options.expectedRootIdentity,['dev','ino']) ||
          !decimal(options.expectedRootIdentity.dev) || !decimal(options.expectedRootIdentity.ino)) fail('INVALID_INPUT','Expected exact library ID and decimal root identity');
      expected = {libraryId:options.expectedLibraryId,dev:BigInt(options.expectedRootIdentity.dev),ino:BigInt(options.expectedRootIdentity.ino)};
    }
    root = canonicalRoot(root);
    const openingIdentity = fs.lstatSync(root, {bigint:true});
    if (expected && (openingIdentity.dev !== expected.dev || openingIdentity.ino !== expected.ino)) fail('CONFLICT','Selected library root identity changed');
    const info = descriptor(root);
    if (expected && info.libraryId !== expected.libraryId) fail('CONFLICT','Selected library ID changed');
    hook('afterOpenValidation', {root});
    const handle = library(root, info, openingIdentity);
    // Opening never exposes a half-committed content pair.
    handle.listContents();
    handle.readLibrarySettings();
    return handle;
  } catch (error) { throw ioError(error); }
}

function ensureDirectory(target) {
  if (!safePath(target, true)) mkdir(target);
  else directory(target);
}

function checkedHash(value) {
  if (typeof value !== 'string' || !HASH.test(value)) fail('INVALID_INPUT', 'Expected SHA256');
  return value;
}

function serializable(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(serializable);
  if (object(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializable(item)]));
  }
  fail('INVALID_INPUT', 'Expected finite JSON data');
}

function inputFields(input, allowed, required = []) {
  if (!object(input) || Object.keys(input).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(input, key))) fail('INVALID_INPUT', `Expected fields: ${allowed.join(', ')}`);
  return serializable(input);
}

function text(value, label, empty = false) {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > 10000) fail('INVALID_INPUT', `Invalid ${label}`);
  return value;
}

function immutableFile(target, bytes) {
  const existing = read(target, true);
  if (existing !== null) {
    if (!existing.equals(bytes)) fail('CONFLICT', 'Immutable package differs from installed bytes');
    return;
  }
  const temporary = path.join(path.dirname(target), `.immutable-${randomUUID()}`);
  writeNew(temporary, bytes);
  safePath(target, true);
  try { fs.linkSync(temporary, target); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  syncDirectory(path.dirname(target));
  if (!read(target).equals(bytes)) fail('CONFLICT', 'Immutable publication collided with different bytes');
  fs.unlinkSync(temporary);
  syncDirectory(path.dirname(target));
}

function detectedType(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (['GIF87a', 'GIF89a'].includes(bytes.subarray(0,6).toString())) return 'image/gif';
  if (bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP') return 'image/webp';
  if (bytes.subarray(0,5).toString() === '%PDF-') return 'application/pdf';
  let decoded;
  try { decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('INVALID_INPUT', 'Unsupported binary asset'); }
  if (decoded.includes('\0')) fail('INVALID_INPUT', 'Binary data is not a supported document');
  if (/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(decoded)) return 'image/svg+xml';
  if (/^\s*[\[{]/.test(decoded)) { try { JSON.parse(decoded); return 'application/json'; } catch {} }
  return 'text/plain';
}

function assetPath(root, assetHash) {
  checkedHash(assetHash);
  return path.join(root, '资产', 'sha256', assetHash.slice(0, 2), assetHash);
}

function readAssetInternal(root, assetHash) {
  let bytes;
  try {
    const target=assetPath(root,assetHash);
    const stat=safePath(target);
    if (stat.size>64*1024*1024) fail('CORRUPT','Stored asset exceeds the import limit');
    bytes=read(target);
  } catch(error) { if(error.code==='ENOENT')fail('CORRUPT','Referenced immutable asset is missing'); throw error; }
  if (hash(bytes) !== assetHash) fail('CORRUPT', 'Immutable asset checksum mismatch');
  let type;
  try { type=detectedType(bytes); } catch(error) { throw new LibraryError('CORRUPT','Stored asset type is invalid',{cause:error}); }
  return { assetHash, bytes: bytes.length, detectedType: type, decoded: false, data: bytes };
}

function importAssetInternal(root, sourcePath, options) {
  const { purpose } = inputFields(options, ['purpose'], ['purpose']);
  if (!['photo', 'material', 'template-reference', 'template-structure', 'generated-cover'].includes(purpose)) fail('INVALID_INPUT', 'Unknown asset purpose');
  if (typeof sourcePath !== 'string' || !path.isAbsolute(sourcePath)) fail('INVALID_INPUT', 'Select an absolute regular source file');
  const source = canonicalRoot(sourcePath);
  const stat = safePath(source);
  if (!stat.isFile() || stat.size > 64 * 1024 * 1024) fail('INVALID_INPUT', 'Asset must be a regular file of at most 64 MiB');
  const staging = path.join(root, '资产', `.staging-${randomUUID()}`);
  const input = fs.openSync(source, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  let output;
  let total = 0;
  const digest = createHash('sha256');
  try {
    const before = fs.fstatSync(input, { bigint: true });
    output = fs.openSync(staging, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    const chunk = Buffer.alloc(64 * 1024);
    for (;;) {
      const count = fs.readSync(input, chunk, 0, chunk.length, null);
      if (!count) break;
      total += count;
      if (total > 64 * 1024 * 1024) fail('INVALID_INPUT', 'Asset exceeds 64 MiB');
      digest.update(chunk.subarray(0, count));
      let offset = 0;
      while (offset < count) offset += fs.writeSync(output, chunk, offset, count - offset);
    }
    const after = fs.fstatSync(input, { bigint: true });
    if (['dev','ino','size','mtimeNs','ctimeNs'].some(key => before[key] !== after[key])) fail('CONFLICT', 'Source changed while importing');
    fs.fsyncSync(output);
  } finally { fs.closeSync(input); if (output !== undefined) fs.closeSync(output); }
  syncDirectory(path.join(root, '资产'));
  const assetHash = digest.digest('hex');
  const data = read(staging);
  if (hash(data) !== assetHash || data.length !== total) fail('CORRUPT', 'Imported asset staging changed');
  const type = detectedType(data);
  if (purpose==='template-structure' && !['image/png','image/jpeg','image/gif','image/webp','image/svg+xml','text/plain','application/json'].includes(type)) fail('INVALID_INPUT','Unsupported template structure type');
  if (type === 'image/svg+xml' && purpose !== 'template-structure') fail('INVALID_INPUT', 'SVG is accepted only as a structure reference');
  if (['photo','template-reference','generated-cover'].includes(purpose) && !['image/png','image/jpeg','image/gif','image/webp'].includes(type)) fail('INVALID_INPUT', 'This purpose requires a raster image');
  const prefix = path.dirname(assetPath(root, assetHash));
  ensureDirectory(prefix);
  hook('beforeAssetInstall', { assetHash });
  const target = assetPath(root, assetHash);
  safePath(target, true);
  try { fs.linkSync(staging, target); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  syncDirectory(prefix);
  if (!read(target).equals(data)) fail('CORRUPT', 'Existing immutable asset has different bytes');
  hook('afterAssetInstall', { assetHash });
  fs.unlinkSync(staging);
  syncDirectory(path.join(root, '资产'));
  return { assetHash, bytes: total, detectedType: type, decoded: false, purpose, originalName: path.basename(sourcePath) };
}

function versionNumber(version) {
  if (!Number.isSafeInteger(version) || version < 1) fail('INVALID_INPUT', 'Version must be a positive integer');
  return version;
}

function templatePackage(root, templateId, version, expectedHash) {
  const bytes = read(path.join(root, '模板', objectId('template', templateId), '版本', String(versionNumber(version)), '定义.json'));
  if (expectedHash && hash(bytes) !== expectedHash) fail('CORRUPT', 'Template package checksum mismatch');
  const pkg = parse(bytes, '定义.json');
  if (!object(pkg) || Object.keys(pkg).some(key => !['definition','resources'].includes(key)) || !object(pkg.definition) || !object(pkg.resources)) fail('CORRUPT', 'Invalid template package');
  try { normalizePackage(root,pkg.definition,pkg.resources); }
  catch (error) { if (error.code==='UNSAFE_PATH') throw error; throw new LibraryError('CORRUPT','Template resource bytes do not match the immutable package',{cause:error}); }
  return { version, packageHash: hash(bytes), ...pkg };
}

function normalizePackage(root, definition, resources) {
  if (!object(definition) || !object(resources)) fail('INVALID_INPUT', 'Template definition and resources must be objects');
  const normalized = {};
  for (const [key, raw] of Object.entries(resources)) {
    text(key, 'resource source identifier');
    const resource = inputFields(raw, ['assetHash','bytes','detectedType','role'], ['assetHash','bytes','detectedType','role']);
    const actual = readAssetInternal(root, resource.assetHash);
    if (actual.bytes !== resource.bytes || actual.detectedType !== resource.detectedType || typeof resource.role !== 'string') fail('INVALID_INPUT', 'Resource descriptor does not match imported asset');
    if (!['style','structure'].includes(resource.role)) fail('INVALID_INPUT','Template resource role must be style or structure');
    const raster=['image/png','image/jpeg','image/gif','image/webp'];
    const allowed=resource.role==='style'?raster:[...raster,'image/svg+xml','text/plain','application/json'];
    if (!allowed.includes(actual.detectedType)) fail('INVALID_INPUT','Template resource type is not allowed for its role');
    Object.defineProperty(normalized, key, { value: resource, enumerable: true, writable: true });
  }
  return { definition: serializable(definition), resources: normalized };
}

function installTemplatePackage(root, templateId, version, pkg, mutationId, creating) {
  const dir = path.join(root, '模板', templateId);
  const packageBytes = jsonBytes(pkg);
  const packageHash = hash(packageBytes);
  const marker = { format: 'nova-unregistered-template', schemaVersion: 1, id: templateId, version, mutationId, packageHash };
  if (!safePath(dir,true)) {
    if (!creating) fail('CORRUPT','Existing template directory disappeared');
    const staging=path.join(root,'模板',`.staging-${randomUUID()}-${randomUUID()}`);
    mkdir(staging);
    immutableFile(path.join(staging,'未登记.json'),jsonBytes(marker));
    hook('beforeTemplateRootPublish',{templateId,version,mutationId});
    fs.renameSync(staging,dir);
    syncDirectory(path.join(root,'模板'));
    hook('afterTemplateRootPublish',{templateId,version,mutationId});
  } else directory(dir);
  if (creating) {
    const old = read(path.join(dir,'未登记.json'));
    const existing = unregisteredTemplate(old, templateId);
    if (existing.version !== version || existing.packageHash !== packageHash) fail('CONFLICT', 'Unregistered template package differs');
  }
  ensureDirectory(path.join(dir, '版本'));
  const versionDir = path.join(dir, '版本', String(version));
  ensureDirectory(versionDir);
  immutableFile(path.join(versionDir, '定义.json'), packageBytes);
  hook('afterTemplatePackage', { templateId, version, mutationId });
  return { version, packageHash };
}

function unregisteredTemplate(bytes, templateId) {
  const marker = parse(bytes, '未登记.json');
  if (!object(marker) || marker.format !== 'nova-unregistered-template' || marker.schemaVersion !== 1 || marker.id !== templateId || !UUID.test(marker.mutationId) || !HASH.test(marker.packageHash) || !Number.isSafeInteger(marker.version) || marker.version < 1 || Object.keys(marker).some(key => !['format','schemaVersion','id','version','mutationId','packageHash'].includes(key))) fail('CORRUPT', 'Invalid unregistered template marker');
  return marker;
}

function businessMethods(root, locked, mutate, list) {
  const readObject = (kind, objectIdValue) => locked(() => result(snapshot(root, objectId(kind, objectIdValue), kind), objectIdValue, undefined, kind));
  const changeState = (kind, operation, objectIdValue, token, options) => mutate(operation, objectIdValue, {}, token, options, kind);
  function promptInput(raw, patch) {
    const input = inputFields(raw, ['title','body','category','when','summary','tags','provenance','builtinKey'], patch ? [] : ['title','body']);
    if (!Object.keys(input).length) fail('INVALID_INPUT', 'Prompt patch cannot be empty');
    if (Object.hasOwn(input,'title')) fields({ title: input.title }, true);
    if (Object.hasOwn(input,'body') && typeof input.body !== 'string') fail('INVALID_INPUT', 'Prompt body must be a string');
    for (const field of ['category','when','summary']) if (Object.hasOwn(input,field)) text(input[field], field, true);
    if (input.tags !== undefined && (!Array.isArray(input.tags) || input.tags.some(tag => typeof tag !== 'string' || !tag.trim()) || new Set(input.tags).size!==input.tags.length)) fail('INVALID_INPUT', 'Prompt tags must be strings');
    if (input.provenance!==undefined && input.provenance!==null && !object(input.provenance)) fail('INVALID_INPUT','Prompt provenance must be an object or null');
    if (input.builtinKey !== undefined && input.builtinKey !== null) text(input.builtinKey, 'builtinKey');
    return input;
  }
  function promptEdit(input, creating) {
    return meta => {
      if (input.builtinKey) {
        for (const name of fs.readdirSync(path.join(root,'提示词'))) {
          const old = metadata(snapshot(root,name,'prompt')[0],name,'prompt');
          if (old.id !== meta.id && old.builtinKey === input.builtinKey) fail('CONFLICT', 'Prompt builtinKey already exists, including trash');
        }
      }
      const { body, ...fields } = input;
      return { ...(creating ? { category:'', when:'', summary:'', tags:[], provenance:null, builtinKey:null } : {}), ...meta, schemaVersion:2, enabled:meta.enabled??true, ...fields };
    };
  }
  function photoInput(raw, patch) {
    const input = inputFields(raw, ['title','assetHash','isOwnPhoto','originalName'], patch ? [] : ['title','assetHash','isOwnPhoto']);
    if (!Object.keys(input).length) fail('INVALID_INPUT', 'Photo patch cannot be empty');
    if (input.title !== undefined) fields({ title: input.title }, true);
    if (input.assetHash !== undefined) checkedHash(input.assetHash);
    if (input.isOwnPhoto !== undefined && typeof input.isOwnPhoto !== 'boolean') fail('INVALID_INPUT', 'Explicit isOwnPhoto declaration is required');
    if (input.originalName !== undefined) text(input.originalName,'originalName',true);
    return input;
  }
  function photoEdit(input, creating) {
    return meta => {
      const next = { ...(creating ? { originalName:'' } : {}), ...meta, ...input };
      if (meta.schemaVersion === 2 && input.assetHash !== undefined) fail('INVALID_INPUT','Use resolvePhoto to fully validate an unavailable photo asset');
      if (meta.schemaVersion === 2 && meta.availability === 'unavailable') {
        return next;
      }
      const asset = readAssetInternal(root,next.assetHash);
      if (!['image/png','image/jpeg','image/gif','image/webp'].includes(asset.detectedType)) fail('INVALID_INPUT', 'Photo must reference a raster image');
      return next;
    };
  }
  function createUnavailablePhoto(raw, options) {
    const input = inputFields(raw,['title','isOwnPhoto','originalName','source','reason'],['title','isOwnPhoto','source','reason']);
    photoInput({title:input.title,isOwnPhoto:input.isOwnPhoto,...(input.originalName === undefined ? {} : {originalName:input.originalName})},true);
    text(input.reason,'reason');
    if (!validPhotoSource(input.source)) fail('INVALID_INPUT','Photo source must contain source and optional originalId/note');
    return mutate('create',null,input,null,options,'photo',meta=>({...meta,schemaVersion:2,...input,originalName:input.originalName??'',availability:'unavailable',assetHash:null}));
  }
  async function resolvePhoto(photoId, raw, token, options) {
    id(photoId);
    const input = inputFields(raw,['assetHash'],['assetHash']);
    const mutationOptions = inputFields(options === undefined ? {} : options,['mutationId']);
    if (mutationOptions.mutationId !== undefined) id(mutationOptions.mutationId);
    checkedHash(input.assetHash);
    const asset = locked(()=>readAssetInternal(root,input.assetHash));
    await validateImportedRaster(asset.data);
    return mutate('resolve-photo',photoId,input,token,mutationOptions,'photo',meta=>{
      if (meta.schemaVersion !== 2 || meta.availability !== 'unavailable') fail('INVALID_STATE','Only unavailable photos can be resolved');
      readAssetInternal(root,input.assetHash);
      return {...meta,assetHash:input.assetHash,availability:'available'};
    });
  }
  const photoProjection = record => record.schemaVersion === 1 ? {...record,availability:'available'} : record;
  function readTemplate(templateId, version) {
    return locked(() => {
      const record = result(snapshot(root,objectId('template',templateId),'template'),templateId,undefined,'template');
      const selected = version === undefined ? record.currentVersion : versionNumber(version);
      const entry = record.versions.find(item => item.version === selected);
      if (!entry) fail('INVALID_INPUT','Template version does not exist');
      return { ...record, name:record.title, ...templatePackage(root,templateId,selected,entry.packageHash) };
    });
  }
  function createTemplate(raw, options, builtin = false) {
    const input = inputFields(raw, builtin ? ['id','name','version','definition','resources'] : ['name','definition','resources','derivedFrom'], ['name','definition','resources']);
    fields({title:input.name},true);
    const version = builtin ? versionNumber(input.version) : 1;
    if (builtin && !BUILTIN.test(input.id)) fail('INVALID_INPUT','Builtin template ID must start with builtin-');
    return mutate('create', null, { ...input, title:input.name }, null, options, 'template', (meta,before,context) => {
      const pkg = normalizePackage(root,input.definition,input.resources);
      if (input.derivedFrom) {
        const ref = inputFields(input.derivedFrom,['id','version'],['id','version']);
        const source = metadata(snapshot(root,objectId('template',ref.id),'template')[0],ref.id,'template');
        const entry = source.versions.find(item => item.version === versionNumber(ref.version));
        if (!entry) fail('INVALID_INPUT','Unknown source template version');
        templatePackage(root,ref.id,ref.version,entry.packageHash);
      }
      const entry = installTemplatePackage(root,meta.id,version,pkg,context.mutationId,true);
      return { ...meta, builtin, currentVersion:version, versions:[entry], derivedFrom:input.derivedFrom || null };
    }, builtin ? input.id : undefined);
  }
  function addVersion(templateId, raw, token, options, builtin = false) {
    const input = inputFields(raw,['version','definition','resources'],['version','definition','resources']);
    versionNumber(input.version);
    return mutate('update',templateId,input,token,options,'template',(meta,before,context) => {
      if (meta.builtin && !builtin) fail('INVALID_STATE','Builtin templates cannot be edited; create a derived template');
      const pkg = normalizePackage(root,input.definition,input.resources);
      const existing = meta.versions.find(item => item.version === input.version);
      if (existing) fail('CONFLICT','Template version already exists');
      const entry = installTemplatePackage(root,templateId,input.version,pkg,context.mutationId,false);
      return { ...meta, currentVersion:input.version, versions:[...meta.versions,entry] };
    });
  }
  function installBuiltin(raw, options) {
    const input = inputFields(raw,['id','name','version','definition','resources'],['id','name','version','definition','resources']);
    if (!BUILTIN.test(input.id)) fail('INVALID_INPUT','Expected stable builtin-* ID');
    versionNumber(input.version);
    const existing = locked(() => {
      const metaPath = path.join(root,'模板',input.id,'模板.json');
      if (!safePath(path.dirname(metaPath),true) || !safePath(metaPath,true)) return null;
      const record = result(snapshot(root,input.id,'template'),input.id,undefined,'template');
      if (!record.builtin || record.title !== input.name) fail('CONFLICT','Builtin identity/name conflicts');
      const entry = record.versions.find(item => item.version === input.version);
      if (entry) {
        const pkg = normalizePackage(root,input.definition,input.resources);
        if (hash(jsonBytes(pkg)) !== entry.packageHash) fail('CONFLICT','Builtin version has a different package hash');
        templatePackage(root,input.id,input.version,entry.packageHash);
        return { record, installed:true };
      }
      return { record, installed:false };
    });
    if (existing?.installed) return existing.record;
    if (existing) return addVersion(input.id,{version:input.version,definition:input.definition,resources:input.resources},existing.record.editToken,options,true);
    return createTemplate(input,options,true);
  }
  const api = {
    importAsset: (sourcePath, options) => locked(() => importAssetInternal(root,sourcePath,options)),
    readAsset: assetHash => locked(() => readAssetInternal(root,checkedHash(assetHash))),
    createPrompt: (raw,options) => { const input=promptInput(raw,false); return mutate('create',null,input,null,options,'prompt',promptEdit(input,true)); },
    updatePrompt: (promptId,raw,token,options) => { const input=promptInput(raw,true); return mutate('update',promptId,input,token,options,'prompt',promptEdit(input,false)); },
    readPrompt: promptId => readObject('prompt',promptId),
    listPrompts: () => list(false,'prompt'),
    listPromptTrash: () => list(true,'prompt'),
    trashPrompt: (promptId,token,options) => changeState('prompt','trash',promptId,token,options),
    restorePrompt: (promptId,token,options) => changeState('prompt','restore',promptId,token,options),
    createPhoto: (raw,options) => { const input=photoInput(raw,false); return mutate('create',null,input,null,options,'photo',photoEdit(input,true)); },
    createUnavailablePhoto,
    resolvePhoto,
    updatePhoto: (photoId,raw,token,options) => { const input=photoInput(raw,true); return mutate('update',photoId,input,token,options,'photo',photoEdit(input,false)); },
    readPhoto: photoId => photoProjection(readObject('photo',photoId)),
    listPhotos: () => list(false,'photo').map(photoProjection),
    listPhotoTrash: () => list(true,'photo').map(photoProjection),
    trashPhoto: (photoId,token,options) => changeState('photo','trash',photoId,token,options),
    restorePhoto: (photoId,token,options) => changeState('photo','restore',photoId,token,options),
    createTemplate: (raw,options) => createTemplate(raw,options),
    installBuiltinTemplate: installBuiltin,
    addTemplateVersion: (templateId,raw,token,options) => addVersion(templateId,raw,token,options),
    selectTemplateVersion: (templateId,version,token,options) => mutate('update',templateId,{version:versionNumber(version)},token,options,'template',meta => {
      const entry=meta.versions.find(item=>item.version===version);
      if (!entry) fail('INVALID_INPUT','Template version does not exist');
      templatePackage(root,templateId,version,entry.packageHash);
      return {...meta,currentVersion:version};
    }),
    readTemplate,
    listTemplates: () => list(false,'template'),
    listTemplateTrash: () => list(true,'template'),
    trashTemplate: (templateId,token,options) => changeState('template','trash',templateId,token,options),
    restoreTemplate: (templateId,token,options) => changeState('template','restore',templateId,token,options),
  };
  return { ...api, ...contentBusinessMethods(root,locked,mutate) };
}

function utcTime(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value)) || !new Date(value).toISOString().startsWith(value.slice(0,19))) fail('INVALID_INPUT', `Expected UTC ISO ${label}`);
  return new Date(value).toISOString();
}

function timezone(value) {
  text(value,'IANA timezone');
  if (value!=='UTC' && !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/.test(value)) fail('INVALID_INPUT','Expected an IANA timezone name');
  try { new Intl.DateTimeFormat('en',{timeZone:value}); } catch { fail('INVALID_INPUT','Invalid IANA timezone'); }
  return value;
}

function contentBusinessMethods(root, locked, mutate) {
  function extended(meta) {
    return { ...meta, schemaVersion:Math.max(meta.schemaVersion,2), materials:meta.materials || [], candidates:meta.candidates || [], selectedCover:meta.selectedCover || null, plans:meta.plans || [], publications:meta.publications || [] };
  }
  function change(contentId, action, input, token, options, update) {
    return mutate('update',contentId,{action,...input},token,options,'content',(meta,before) => update(extended(meta),before));
  }
  function imageAsset(assetHash) {
    const asset=readAssetInternal(root,checkedHash(assetHash));
    if (!['image/png','image/jpeg','image/gif','image/webp'].includes(asset.detectedType)) fail('INVALID_INPUT','Cover candidate requires a raster image');
    return asset;
  }
  function resolveTemplate(raw) {
    if (!raw) return null;
    const ref=inputFields(raw,['id','version'],['id','version']);
    const meta=metadata(snapshot(root,objectId('template',ref.id),'template')[0],ref.id,'template');
    const entry=meta.versions.find(item=>item.version===versionNumber(ref.version));
    if (!entry) fail('INVALID_INPUT','Unknown candidate template version');
    templatePackage(root,ref.id,ref.version,entry.packageHash);
    return {id:ref.id,version:ref.version,packageHash:entry.packageHash};
  }
  function publicationSnapshot(contentId, publicationId, entry) {
    const dir=path.join(root,'内容',contentId,'发布快照',publicationId);
    directory(dir);
    const raw=read(path.join(dir,'快照.json'));
    const bodyBytes=read(path.join(dir,'正文.md'));
    const snapshot=parse(raw,'快照.json');
    if (!object(snapshot) || snapshot.format!=='nova-publication-snapshot' || snapshot.schemaVersion!==1 || snapshot.publicationId!==publicationId || !object(snapshot.content) || snapshot.content.id!==contentId || hash(bodyBytes)!==snapshot.bodyHash || hash(raw)!==entry.snapshotHash) fail('CORRUPT','Publication snapshot checksum or identity mismatch');
    if (snapshot.cover) imageAsset(snapshot.cover.assetHash);
    if (snapshot.template) templatePackage(root,snapshot.template.id,snapshot.template.version,snapshot.template.packageHash);
    return {snapshot,body:bodyBytes.toString('utf8'),bodyBytes,cover:snapshot.cover,template:snapshot.template};
  }
  return {
    attachContentMaterial: (contentId,raw,token,options) => {
      const input=inputFields(raw,['assetHash','originalName','role'],['assetHash','originalName']);
      checkedHash(input.assetHash);text(input.originalName,'originalName',true);
      if (input.role!==undefined) text(input.role,'material role');
      return change(contentId,'attachMaterial',input,token,options,meta=>{
        readAssetInternal(root,input.assetHash);
        return {...meta,materials:[...meta.materials,{id:randomUUID(),assetHash:input.assetHash,originalName:input.originalName,role:input.role || 'material',createdAt:new Date().toISOString()}]};
      });
    },
    removeContentMaterial: (contentId,materialId,token,options) => {
      id(materialId);
      return change(contentId,'removeMaterial',{materialId},token,options,meta=>{
        if (!meta.materials.some(item=>item.id===materialId)) fail('INVALID_INPUT','Unknown material ID');
        return {...meta,materials:meta.materials.filter(item=>item.id!==materialId)};
      });
    },
    registerContentCandidate: (contentId,raw,token,options) => {
      const input=inputFields(raw,['assetHash','requestId','attemptId','template','source','originalName'],['assetHash','requestId','attemptId']);
      checkedHash(input.assetHash);text(input.requestId,'requestId');text(input.attemptId,'attemptId');
      if (input.source!==undefined) text(input.source,'candidate source');
      if (input.originalName!==undefined) text(input.originalName,'originalName',true);
      return change(contentId,'registerCandidate',input,token,options,meta=>{
        if ((meta.coverJobs || []).some(job => job.id === input.requestId || job.attempts.some(attempt => attempt.attemptId === input.attemptId))) fail('INVALID_INPUT','Managed cover task candidates must use commitCoverAttempt');
        imageAsset(input.assetHash);

        const template=resolveTemplate(input.template);
        return {...meta,candidates:[...meta.candidates,{id:randomUUID(),...input,template,accepted:false,createdAt:new Date().toISOString()}]};
      });
    },
    selectContentCover: (contentId,candidateId,token,options) => {
      id(candidateId);
      return change(contentId,'selectCover',{candidateId},token,options,meta=>{
        const candidate=meta.candidates.find(item=>item.id===candidateId);
        if (!candidate) fail('INVALID_INPUT','Unknown candidate');
        imageAsset(candidate.assetHash);
        if (candidate.template) templatePackage(root,candidate.template.id,candidate.template.version,candidate.template.packageHash);
        const selectedAt=new Date().toISOString();
        return {...meta,candidates:meta.candidates.map(item=>item.id===candidateId?{...item,accepted:true,acceptedAt:selectedAt}:item),selectedCover:{candidateId,assetHash:candidate.assetHash,requestId:candidate.requestId,attemptId:candidate.attemptId,template:candidate.template,selectedAt}};
      });
    },
    savePublicationPlan: (contentId,raw,token,options) => {
      const input=inputFields(raw,['id','channelId','scheduledAt','timezone'],['channelId','scheduledAt','timezone']);
      if (input.id!==undefined) id(input.id);
      if (typeof input.channelId!=='string' || !/^[a-z][a-z0-9._-]{0,63}$/.test(input.channelId)) fail('INVALID_INPUT','Invalid channel ID');
      input.scheduledAt=utcTime(input.scheduledAt,'scheduledAt');input.timezone=timezone(input.timezone);
      return change(contentId,'savePlan',input,token,options,meta=>{
        const old=input.id?meta.plans.find(plan=>plan.id===input.id):null;
        if (input.id && !old) fail('INVALID_INPUT','Unknown plan ID');
        if (old?.status==='published') fail('INVALID_STATE','Published plans cannot be changed');
        const now=new Date().toISOString();
        const plan={id:old?.id || randomUUID(),channelId:input.channelId,scheduledAt:input.scheduledAt,timezone:input.timezone,status:'planned',createdAt:old?.createdAt || now,updatedAt:now};
        return {...meta,plans:old?meta.plans.map(item=>item.id===plan.id?plan:item):[...meta.plans,plan]};
      });
    },
    cancelPublicationPlan: (contentId,planId,token,options) => {
      id(planId);
      return change(contentId,'cancelPlan',{planId},token,options,meta=>{
        const plan=meta.plans.find(item=>item.id===planId);
        if (!plan) fail('INVALID_INPUT','Unknown publication plan');
        if (plan.status!=='planned') fail('INVALID_STATE','Only planned publications can be cancelled');
        return {...meta,plans:meta.plans.map(item=>item.id===planId?{...item,status:'cancelled',updatedAt:new Date().toISOString()}:item)};
      });
    },
    recordPublication: (contentId,raw,token,options) => {
      const input=inputFields(raw,['planId','publishedAt','timezone','url'],['planId','publishedAt','timezone']);
      id(input.planId);input.publishedAt=utcTime(input.publishedAt,'publishedAt');input.timezone=timezone(input.timezone);
      if (input.url!==undefined) { try { const url=new URL(input.url);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error(); } catch { fail('INVALID_INPUT','Publication URL must be HTTP(S)'); } }
      return change(contentId,'recordPublication',input,token,options,(meta,before)=>{
        const plan=meta.plans.find(item=>item.id===input.planId);
        if (!plan || plan.status!=='planned') fail('INVALID_STATE','Publication requires an active plan');
        const publicationId=randomUUID();
        const parent=path.join(root,'内容',contentId,'发布快照');
        ensureDirectory(parent);
        const stage=path.join(parent,`.staging-${randomUUID()}`);
        mkdir(stage);
        const cover=meta.selectedCover?serializable(meta.selectedCover):null;
        if (cover) imageAsset(cover.assetHash);
        const template=cover?.template || null;
        if (template) templatePackage(root,template.id,template.version,template.packageHash);
        const snapshot={format:'nova-publication-snapshot',schemaVersion:1,publicationId,content:{id:contentId,title:meta.title,revision:metadata(before[0],contentId).revision,createdAt:meta.createdAt,updatedAt:metadata(before[0],contentId).updatedAt},plan:serializable(plan),publishedAt:input.publishedAt,timezone:input.timezone,url:input.url || null,bodyHash:hash(before[1]),cover,template};
        const rawSnapshot=jsonBytes(snapshot);
        writeNew(path.join(stage,'快照.json'),rawSnapshot);
        writeNew(path.join(stage,'正文.md'),before[1]);
        hook('beforePublicationSnapshot',{contentId,publicationId});
        const target=path.join(parent,publicationId);
        if (safePath(target,true)) fail('CONFLICT','Snapshot ID collision');
        fs.renameSync(stage,target);syncDirectory(parent);
        hook('afterPublicationSnapshot',{contentId,publicationId});
        const entry={id:publicationId,publicationId,snapshotId:publicationId,planId:plan.id,channelId:plan.channelId,publishedAt:input.publishedAt,timezone:input.timezone,url:input.url || null,snapshotHash:hash(rawSnapshot)};
        return {...meta,plans:meta.plans.map(item=>item.id===plan.id?{...item,status:'published',publicationId,updatedAt:new Date().toISOString()}:item),publications:[...meta.publications,entry]};
      });
    },
    readPublication: (contentId,publicationId) => locked(()=>{
      id(contentId);id(publicationId);
      const meta=metadata(snapshot(root,contentId)[0],contentId);
      const entry=(meta.publications || []).find(item=>item.id===publicationId);
      if (!entry) fail('INVALID_INPUT','Unknown publication ID');
      return publicationSnapshot(contentId,publicationId,entry);
    }),
  };
}

function upgradeTo3(root) {
  const initial=descriptor(root,true);
  const release=acquire(root);
  let primaryError;
  try {
    const info=descriptor(root,true);
    if (info.libraryId!==initial.libraryId || ![2,3].includes(info.schemaVersion)) fail('CONFLICT','Unexpected library schema during upgrade to 3');
    const descriptorPath=path.join(root,'内容库.json');
    const barrier=path.join(root,SYSTEM,'事务',BARRIER);
    if (info.schemaVersion===2) {
      recover(root,info.libraryId);
      const original=read(descriptorPath);
      const backup=path.join(root,SYSTEM,'内容库.schema2.bak.json');
      immutableFile(backup,original);
      hook('upgrade3AfterBackup');
      ensureDirectory(barrier);
      hook('upgrade3AfterBarrier');
      for (const name of ['提示词','我的照片','模板','资产']) ensureDirectory(path.join(root,name));
      ensureDirectory(path.join(root,'资产','sha256'));
      hook('upgrade3AfterDirectories');
      if (!read(descriptorPath).equals(original)) fail('CONFLICT','Library descriptor changed while upgrading to 3');
      const stage=path.join(root,`.内容库.schema3-${randomUUID()}`);
      writeNew(stage,jsonBytes({...parse(original,'内容库.json'),schemaVersion:3}));
      hook('upgrade3BeforeDescriptorPublish');
      safePath(descriptorPath);
      fs.renameSync(stage,descriptorPath);
      hook('upgrade3AfterDescriptorPublish');
      syncDirectory(root);
    }
    if (safePath(barrier,true)) {
      immutableFile(path.join(barrier,'完成.json'),jsonBytes({schemaVersion:3,libraryId:info.libraryId}));
      hook('upgrade3AfterFinalMarker');
    }
  } catch(error) {primaryError=ioError(error);throw primaryError;}
  finally {try{release();}catch(error){if(!primaryError)throw ioError(error);}}
  return null;
}

function upgradeTo4(root) {
  const initial=descriptor(root,true);
  const release=acquire(root);
  let primaryError;
  try {
    const info=descriptor(root,true);
    if (info.libraryId!==initial.libraryId || ![3,4].includes(info.schemaVersion)) fail('CONFLICT','Unexpected library schema during upgrade to 4');
    const descriptorPath=path.join(root,'内容库.json');
    const barrier=path.join(root,SYSTEM,'事务','升级到4');
    if(info.schemaVersion===3) {
      recover(root,info.libraryId);
      const original=read(descriptorPath);
      immutableFile(path.join(root,SYSTEM,'内容库.schema3.bak.json'),original);
      hook('upgrade4AfterBackup');
      ensureDirectory(barrier);
      hook('upgrade4AfterBarrier');
      if(!read(descriptorPath).equals(original))fail('CONFLICT','Library descriptor changed during upgrade to 4');
      const stage=path.join(root,`.内容库.schema4-${randomUUID()}`);
      writeNew(stage,jsonBytes({...parse(original,'内容库.json'),schemaVersion:4}));
      hook('upgrade4BeforeDescriptorPublish');
      fs.renameSync(stage,descriptorPath);
      hook('upgrade4AfterDescriptorPublish');
      syncDirectory(root);
    }
    if(safePath(barrier,true))immutableFile(path.join(barrier,'完成.json'),jsonBytes({schemaVersion:4,libraryId:info.libraryId}));
  } catch(error) {primaryError=ioError(error);throw primaryError;}
  finally {try{release();}catch(error){if(!primaryError)throw ioError(error);}}
  return null;
}

function initializeModel(root) {
  for (const name of ['库配置','合集']) ensureDirectory(path.join(root,name));
  ensureDirectory(path.join(root,'库配置','default'));
  const target=path.join(root,'库配置','default','配置.json');
  if (!safePath(target,true)) {
    const now=new Date().toISOString();
    immutableFile(target,jsonBytes({format:'nova-workspace',schemaVersion:1,id:'default',title:'库配置',revision:1,createdAt:now,updatedAt:now,deletedAt:null,...modelDefaults('workspace')}));
  }
  metadata(read(target),'default','workspace');
}

function upgradeTo5(root) {
  const initial=descriptor(root,true), release=acquire(root); let primary;
  try {
    const info=descriptor(root,true);
    if(info.libraryId!==initial.libraryId || ![4,5].includes(info.schemaVersion)) fail('CONFLICT','Unexpected schema during upgrade to 5');
    const target=path.join(root,'内容库.json'), barrier=path.join(root,SYSTEM,'事务','升级到5');
    if(info.schemaVersion===4) {
      recover(root,info.libraryId);
      const original=read(target);
      immutableFile(path.join(root,SYSTEM,'内容库.schema4.bak.json'),original); hook('upgrade5AfterBackup');
      ensureDirectory(barrier); hook('upgrade5AfterBarrier');
      initializeModel(root); hook('upgrade5AfterDirectories');
      if(!read(target).equals(original)) fail('CONFLICT','Descriptor changed during upgrade to 5');
      const stage=path.join(root,`.内容库.schema5-${randomUUID()}`);
      writeNew(stage,jsonBytes({...parse(original,'内容库.json'),schemaVersion:5}));
      hook('upgrade5BeforeDescriptorPublish'); fs.renameSync(stage,target); hook('upgrade5AfterDescriptorPublish'); syncDirectory(root);
    }
    if(safePath(barrier,true)) immutableFile(path.join(barrier,'完成.json'),jsonBytes({schemaVersion:5,libraryId:info.libraryId}));
    hook('upgrade5AfterFinalMarker');
  } catch(error) {primary=ioError(error);throw primary;}
  finally {try{release();}catch(error){if(!primary)throw ioError(error);}}
  return openLibrary(root);
}

function validateBusinessMetadata(meta,kind) {
  if (kind === 'workspace' || kind === 'collection' || kind === 'content' && meta.schemaVersion === 4) { validateModelMetadata(meta,kind,fail,validateCoverJobs); return; }
  if (kind === 'prompt' && meta.schemaVersion === 2 && typeof meta.enabled !== 'boolean') fail('CORRUPT','Invalid prompt enabled');
  const check=(condition,label)=>{if(!condition)fail('CORRUPT',`Invalid ${kind} ${label}`)};
  const string=(value,empty=false)=>typeof value==='string'&&(empty||!!value.trim())&&value.length<=10000;
  const iso=value=>{try{return date(value)}catch{return false}};
  const zone=value=>{try{return timezone(value)===value}catch{return false}};
  const plain=value=>object(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
  const keys=(value,allowed)=>plain(value)&&Object.keys(value).every(key=>allowed.includes(key));
  const same=isDeepStrictEqual;
  const templateRef=ref=>{
    if(!keys(ref,['id','version','packageHash'])||!HASH.test(ref.packageHash)||!Number.isSafeInteger(ref.version)||ref.version<1)return false;
    try{return objectId('template',ref.id)===ref.id}catch{return false}
  };
  const unique=(items,label)=>{
    check(Array.isArray(items),label);
    const ids=new Set();
    for(const item of items){check(plain(item)&&UUID.test(item.id)&&!ids.has(item.id),`${label} IDs`);ids.add(item.id);}
  };
  if(kind==='content') {
    if(meta.schemaVersion===1){check(!['materials','candidates','selectedCover','plans','publications','coverJobs'].some(key=>Object.hasOwn(meta,key)),'schema-1 extension fields');return;}
    for(const field of ['materials','candidates','plans','publications'])unique(meta[field],field);
    if(meta.schemaVersion===3)validateCoverJobs(meta,fail);
    else check(!Object.hasOwn(meta,'coverJobs'),'schema-2 coverJobs');
    for(const item of meta.materials)check(keys(item,['id','assetHash','originalName','role','createdAt'])&&HASH.test(item.assetHash)&&string(item.originalName,true)&&string(item.role)&&iso(item.createdAt),'material');
    for(const item of meta.candidates)check(keys(item,['id','assetHash','requestId','attemptId','template','source','originalName','accepted','createdAt','acceptedAt'])&&HASH.test(item.assetHash)&&string(item.requestId)&&string(item.attemptId)&&(item.template===null||templateRef(item.template))&&typeof item.accepted==='boolean'&&iso(item.createdAt)&&(item.source===undefined||string(item.source))&&(item.originalName===undefined||string(item.originalName,true))&&(item.accepted?iso(item.acceptedAt):item.acceptedAt===undefined),'candidate');
    check(meta.selectedCover===null||keys(meta.selectedCover,['candidateId','assetHash','requestId','attemptId','template','selectedAt']),'selected cover shape');
    if(meta.selectedCover!==null){
      const selected=meta.selectedCover;
      const candidate=meta.candidates.find(item=>item.id===selected.candidateId);
      check(candidate&&candidate.accepted&&selected.assetHash===candidate.assetHash&&selected.requestId===candidate.requestId&&selected.attemptId===candidate.attemptId&&same(selected.template,candidate.template)&&iso(selected.selectedAt),'selected cover ownership');
    }
    for(const plan of meta.plans){
      check(keys(plan,['id','channelId','scheduledAt','timezone','status','createdAt','updatedAt','publicationId'])&&/^[a-z][a-z0-9._-]{0,63}$/.test(plan.channelId)&&iso(plan.scheduledAt)&&zone(plan.timezone)&&['planned','cancelled','published'].includes(plan.status)&&iso(plan.createdAt)&&iso(plan.updatedAt),'plan');
      check(plan.status==='published'?UUID.test(plan.publicationId):plan.publicationId===undefined,'plan publication status');
    }
    const usedPlans=new Set();
    for(const publication of meta.publications){
      check(keys(publication,['id','publicationId','snapshotId','planId','channelId','publishedAt','timezone','url','snapshotHash'])&&publication.id===publication.publicationId&&publication.id===publication.snapshotId&&UUID.test(publication.planId)&&iso(publication.publishedAt)&&zone(publication.timezone)&&HASH.test(publication.snapshotHash),'publication');
      const plan=meta.plans.find(item=>item.id===publication.planId);
      check(plan&&plan.status==='published'&&plan.publicationId===publication.id&&plan.channelId===publication.channelId&&!usedPlans.has(plan.id),'publication plan ownership');
      usedPlans.add(plan.id);
      if(publication.url!==null){let url;try{url=new URL(publication.url)}catch{}check(url&&['https:','http:'].includes(url.protocol)&&!url.username&&!url.password,'publication URL');}
    }
    for(const plan of meta.plans)if(plan.status==='published')check(meta.publications.some(item=>item.id===plan.publicationId&&item.planId===plan.id),'published plan receipt');
  }
  if(kind==='prompt'){
    check(string(meta.category,true)&&string(meta.when,true)&&string(meta.summary,true)&&Array.isArray(meta.tags)&&meta.tags.every(tag=>string(tag))&&new Set(meta.tags).size===meta.tags.length,'prompt fields');
    check(meta.builtinKey===null||string(meta.builtinKey),'builtin key');check(meta.provenance===null||plain(meta.provenance),'provenance');
  }
  if(kind==='photo'){
    check(typeof meta.isOwnPhoto==='boolean'&&string(meta.originalName,true),'photo fields');
    if(meta.schemaVersion===1)check(HASH.test(meta.assetHash),'photo asset');
    else check(validPhotoSource(meta.source)&&string(meta.reason)&&(meta.availability==='available'?HASH.test(meta.assetHash):meta.availability==='unavailable'&&meta.assetHash===null),'photo availability');
  }
  if(kind==='template'){
    check(typeof meta.builtin==='boolean'&&meta.builtin===BUILTIN.test(meta.id)&&Array.isArray(meta.versions)&&meta.versions.length>0,'template identity');
    const versions=new Set();
    for(const entry of meta.versions){check(keys(entry,['version','packageHash'])&&Number.isSafeInteger(entry.version)&&entry.version>0&&HASH.test(entry.packageHash)&&!versions.has(entry.version),'template versions');versions.add(entry.version);}
    check(versions.has(meta.currentVersion),'current version');
    if(meta.derivedFrom!==null){const ref=meta.derivedFrom;check(keys(ref,['id','version'])&&Number.isSafeInteger(ref.version)&&ref.version>0,'derived source');try{objectId('template',ref.id)}catch{fail('CORRUPT','Invalid derived template ID')}}
  }
}


function interruptRestoredAttempts(meta, now) {
  return {...meta, coverJobs: meta.coverJobs.map(job => ({...job, activeAttemptId: null, attempts: job.attempts.map(attempt => ['created','claimed'].includes(attempt.status) ? {...attempt, status:'failed', updatedAt:now, failure:{code:'RESTORED_INTERRUPTED',message:'Restored backup requires an explicit new host attempt'}} : attempt)}))};
}

function validateRestoredLibrary(root, info) {
  const api = info.schemaVersion === 4 ? contentBusinessMethods(root, fn => fn(), () => fail('INVALID_STATE','Restore validation is read-only')) : library(root, info, fs.lstatSync(root, {bigint:true}));
  for (const [kind, spec] of Object.entries(KINDS)) {
    if (info.schemaVersion < 5 && ['workspace','collection'].includes(kind)) continue;
    for (const name of fs.readdirSync(path.join(root,spec.directory)).sort()) {
      if (kind === 'template' && STAGING.test(name)) continue;
      objectId(kind,name);
      if (kind === 'template' && !safePath(path.join(root,spec.directory,name,spec.files[0]),true)) {
        unregisteredTemplate(read(path.join(root,spec.directory,name,'未登记.json')),name); continue;
      }
      const meta = metadata(snapshot(root,name,kind)[0],name,kind);
      if (info.schemaVersion === 4 && (kind === 'content' && meta.schemaVersion > 3 || ['prompt','photo'].includes(kind) && meta.schemaVersion > 1)) fail('FORMAT_UNSUPPORTED','Schema4 backup contains newer business metadata');
      if (kind === 'photo' && meta.availability !== 'unavailable') readAssetInternal(root,meta.assetHash);
      if (kind === 'workspace' && meta.profile.avatarAssetHash) readAssetInternal(root,meta.profile.avatarAssetHash);
      if (kind === 'collection' && meta.deletedAt === null) for (const memberId of meta.memberIds) if (metadata(snapshot(root,memberId)[0],memberId).deletedAt !== null) fail('CORRUPT','Active collection has a trashed member');
      if (kind === 'template') for (const version of meta.versions) templatePackage(root,name,version.version,version.packageHash);
      if (!['content','collection'].includes(kind)) continue;
      for (const entry of [...(meta.materials || []),...(meta.candidates || [])]) {
        if (entry.availability === 'unavailable') continue;
        readAssetInternal(root,entry.assetHash);
        if (entry.template) templatePackage(root,entry.template.id,entry.template.version,entry.template.packageHash);
      }
      for (const entry of meta.publications || []) (kind === 'collection' ? api.readCollectionPublication : api.readPublication)(name,entry.id);
      for (const reference of meta.unavailableReferences || []) if (reference.availability === 'available') readAssetInternal(root,reference.assetHash);
      if (kind === 'collection') continue;
      coverJobMethods({root,libraryId:info.libraryId,validationContent:meta, snapshot, result, metadata, hash,jsonBytes,read,safePath,directory,checkedHash,templatePackage,readAssetInternal,id,objectId,inputFields,fail,LibraryError});
    }
  }
  for (const name of fs.readdirSync(path.join(root,SYSTEM,'事务','已提交')).sort()) { const tx=transaction(root,id(name),info.libraryId); if (info.schemaVersion === 4) validateSchema4Transaction(tx); }
}

function validateSchema4Transaction(tx) {
  if (tx.intent.schemaVersion > 2) fail('FORMAT_UNSUPPORTED','Schema4 backup contains a newer transaction');
  for (const bytes of [tx.before[0],tx.after[0]]) if (bytes) {
    const meta = metadata(bytes,tx.objectId,tx.kind);
    if (tx.kind === 'content' && meta.schemaVersion > 3 || ['prompt','photo'].includes(tx.kind) && meta.schemaVersion > 1) fail('FORMAT_UNSUPPORTED','Schema4 backup contains newer transaction metadata');
  }
}

function prepareRestoredLibrary(root, backup) {
  const info = descriptor(root, true);
  const pending = path.join(root,SYSTEM,'事务','待恢复');
  const recoveredMutations = fs.readdirSync(pending).filter(name => UUID.test(name));
  if (info.schemaVersion === 4) for (const mutationId of recoveredMutations) validateSchema4Transaction(transaction(root,mutationId,info.libraryId));
  recover(root,info.libraryId);
  validateRestoredLibrary(root,info);
  const interruptedAttempts = [], mutations = [];
  for (const contentId of fs.readdirSync(path.join(root,'内容')).sort()) {
    const before = snapshot(root,contentId), meta = metadata(before[0],contentId);
    const live = (meta.coverJobs || []).flatMap(job => job.attempts.filter(attempt => ['created','claimed'].includes(attempt.status)).map(attempt => ({contentId,requestId:job.id,attemptId:attempt.attemptId})));
    if (!live.length) continue;
    const now = new Date().toISOString(), mutationId = randomUUID();
    const next = {...interruptRestoredAttempts(meta,now),revision:meta.revision+1,updatedAt:now};
    const after = [jsonBytes(next),before[1]];
    const intent = {schemaVersion:info.schemaVersion >= 5 ? 3 : 2,libraryId:info.libraryId,mutationId,objectKind:'content',objectId:contentId,operation:'restore-interrupted',requestDigest:hash(jsonBytes({action:'restore-interrupted',backupId:backup.backupId,contentId})),before:before.map(pack),after:after.map(pack)};
    const location = path.join(pending,mutationId); mkdir(location); writeNew(path.join(location,'intent.json'),jsonBytes(intent));
    const tx = transaction(root,mutationId,info.libraryId); applyTransaction(root,tx); archiveTransaction(root,tx);
    interruptedAttempts.push(...live.map(attempt => ({...attempt,mutationId}))); mutations.push(mutationId);
  }
  const provenance = path.join(root,SYSTEM,'恢复来源'); ensureDirectory(provenance);
  writeNew(path.join(provenance,`${randomUUID()}.json`),jsonBytes({format:'nova-content-library-restore',schemaVersion:1,backupId:backup.backupId,treeHash:backup.treeHash,libraryId:info.libraryId,restoredAt:new Date().toISOString(),recoveredMutations,interruptionMutations:mutations,interruptedAttempts}));
  validateRestoredLibrary(root,info);
  return {recoveredMutations,interruptedAttempts,schemaVersion:info.schemaVersion,upgradeRequired:info.schemaVersion < LIBRARY_VERSION};
}

const backupOperations = backupMethods({fail,LibraryError,safePath,directory,descriptor,acquire,read,writeNew,syncDirectory,jsonBytes,hash,hook,prepareRestoredLibrary});
export const backupLibrary = backupOperations.backupLibrary;
export const verifyBackup = backupOperations.verifyBackup;
export const restoreBackup = backupOperations.restoreBackup;
