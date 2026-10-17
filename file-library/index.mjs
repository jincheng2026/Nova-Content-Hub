import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';

const FORMAT = 'nova-content-library';
const CONTENT_FORMAT = 'nova-content';
const VERSION = 1;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const STAGING = /^\.staging-[0-9a-f-]{36}-[0-9a-f-]{36}$/;
const FILES = ['内容.json', '正文.md'];
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
function date(value) { return typeof value === 'string' && new Date(value).toISOString() === value; }

function parse(bytes, label) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { fail('CORRUPT', `Invalid JSON: ${label}`); }
}

function format(record, expected, label) {
  if (!object(record) || record.format !== expected || record.schemaVersion !== VERSION) {
    fail('FORMAT_UNSUPPORTED', `Unknown or unsupported format: ${label}`);
  }
}

function metadata(bytes, contentId) {
  const meta = parse(bytes, '内容.json');
  format(meta, CONTENT_FORMAT, '内容.json');
  let validDates = false;
  try { validDates = date(meta.createdAt) && date(meta.updatedAt) && (meta.deletedAt === null || date(meta.deletedAt)); } catch {}
  if (meta.id !== contentId || typeof meta.title !== 'string' || !meta.title.trim() || meta.title.length > 500 ||
      !Number.isSafeInteger(meta.revision) || meta.revision < 1 || !validDates) {
    fail('CORRUPT', `Invalid metadata or duplicate ID: ${contentId}`);
  }
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
      directory(lock);
      const names = fs.readdirSync(lock);
      if (names.length !== 1 || !UUID.test(names[0].slice(0, -5)) || !names[0].endsWith('.json')) {
        fail('LOCK_UNCERTAIN', 'Empty or malformed lock; inspect it manually, never reclaim by age');
      }
      const ownerPath = path.join(lock, names[0]);
      const owner = parse(read(ownerPath), 'lock owner');
      if (owner.token !== names[0].slice(0, -5) || !Number.isSafeInteger(owner.pid) || owner.pid <= 0 || typeof owner.host !== 'string') {
        fail('LOCK_UNCERTAIN', 'Malformed lock owner');
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

function descriptor(root) {
  directory(root);
  const info = parse(read(path.join(root, '内容库.json')), '内容库.json');
  format(info, FORMAT, '内容库.json');
  let validDate = false;
  try { validDate = date(info.createdAt); } catch {}
  if (!UUID.test(info.libraryId) || !validDate) fail('CORRUPT', 'Invalid library identity');
  directory(path.join(root, '内容'));
  directory(path.join(root, SYSTEM));
  directory(path.join(root, SYSTEM, '事务'));
  return info;
}

function contentPaths(root, contentId) {
  const dir = path.join(root, '内容', id(contentId));
  directory(dir);
  return FILES.map(file => path.join(dir, file));
}

function snapshot(root, contentId) {
  let files;
  try { files = contentPaths(root, contentId).map(file => read(file)); }
  catch (error) {
    if (error.code === 'ENOENT') fail('CORRUPT', `Missing content directory or authoritative file: ${contentId}`);
    throw error;
  }
  metadata(files[0], contentId);
  return files;
}

function result(files, contentId, mutationId) {
  const meta = metadata(files[0], contentId);
  const editToken = hash(Buffer.concat([Buffer.from(hash(files[0]), 'hex'), Buffer.from(hash(files[1]), 'hex')]));
  return { ...meta, body: files[1].toString('utf8'), editToken, ...(mutationId ? { mutationId } : {}) };
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

function transaction(root, mutationId, libraryId) {
  const dir = path.join(root, SYSTEM, '事务', id(mutationId));
  directory(dir);
  const raw = read(path.join(dir, 'intent.json'));
  const intent = parse(raw, 'intent.json');
  if (!object(intent) || intent.schemaVersion !== VERSION || intent.libraryId !== libraryId || intent.mutationId !== mutationId ||
      !UUID.test(intent.contentId) || !['create', 'update', 'trash', 'restore'].includes(intent.operation) ||
      !/^[0-9a-f]{64}$/.test(intent.requestDigest) || !Array.isArray(intent.before) || intent.before.length !== 2 ||
      !Array.isArray(intent.after) || intent.after.length !== 2 || Object.keys(intent).some(key => !['schemaVersion', 'libraryId', 'mutationId', 'contentId', 'operation', 'requestDigest', 'before', 'after'].includes(key))) {
    fail('CORRUPT', 'Invalid transaction plan');
  }
  const before = intent.before.map(unpack);
  const after = intent.after.map(unpack);
  if (after.some(bytes => bytes === null) || (intent.operation === 'create' ? before.some(bytes => bytes !== null) : before.some(bytes => bytes === null))) fail('CORRUPT', 'Invalid transaction file set');
  const next = metadata(after[0], intent.contentId);
  if (intent.operation === 'create') {
    if (next.revision !== 1 || next.deletedAt !== null) fail('CORRUPT', 'Invalid create plan');
  } else {
    const old = metadata(before[0], intent.contentId);
    if (next.revision !== old.revision + 1 || next.createdAt !== old.createdAt) fail('CORRUPT', 'Invalid revision plan');
    if (intent.operation !== 'update' && (!before[1].equals(after[1]) || old.title !== next.title)) fail('CORRUPT', 'Invalid trash/restore plan');
    if ((intent.operation === 'trash' && (old.deletedAt !== null || next.deletedAt === null)) ||
        (intent.operation === 'restore' && (old.deletedAt === null || next.deletedAt !== null)) ||
        (intent.operation === 'update' && (old.deletedAt !== null || next.deletedAt !== null))) fail('CORRUPT', 'Invalid state transition');
  }
  const marker = read(path.join(dir, 'COMMITTED'), true);
  if (marker && marker.toString() !== `${hash(raw)}\n`) fail('CORRUPT', 'Invalid completion marker');
  return { dir, intent, raw, before, after, committed: marker !== null };
}

function equal(a, b) { return a === null || b === null ? a === b : a.equals(b); }

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
  const contentDir = path.join(root, '内容', tx.intent.contentId);
  if (!safePath(contentDir, true)) {
    if (tx.intent.operation !== 'create') fail('RECOVERY_CONFLICT', 'Existing content directory disappeared');
    mkdir(contentDir);
  }
  const targets = contentPaths(root, tx.intent.contentId);
  // Inspect BOTH files before changing either one; third-state data stops recovery.
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
  const dir = path.join(root, SYSTEM, '事务');
  const pending = [];
  // shortcut: every read scans full history bytes; split pending/history before large-library release.
  for (const name of fs.readdirSync(dir).sort()) {
    if (STAGING.test(name)) { directory(path.join(dir, name)); continue; }
    if (!UUID.test(name)) fail('CORRUPT', `Unexpected transaction entry: ${name}`);
    const tx = transaction(root, name, libraryId);
    if (!tx.committed) pending.push(tx);
  }
  // One writer cannot start another intent before recovering the previous one.
  if (pending.length > 1) fail('RECOVERY_CONFLICT', 'Multiple unfinished transactions; manual diagnosis required');
  for (const tx of pending) {
    try { applyTransaction(root, tx); }
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

function library(root, initialInfo) {
  function locked(fn) {
    let release;
    let primaryError;
    let value;
    try {
      const info = descriptor(root);
      if (info.libraryId !== initialInfo.libraryId) fail('CORRUPT', 'Library identity changed');
      release = acquire(root);
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

  function list(deleted) {
    return locked(() => fs.readdirSync(path.join(root, '内容')).sort().map(name => {
      if (!UUID.test(name)) fail('CORRUPT', `Unexpected content directory: ${name}`);
      return result(snapshot(root, name), name);
    }).filter(item => (item.deletedAt !== null) === deleted));
  }

  function mutate(operation, contentId, input, expectedToken, options = {}) {
    if (!object(options) || Object.keys(options).some(key => key !== 'mutationId')) fail('INVALID_INPUT', 'Only mutationId is accepted as an option');
    const mutationId = options.mutationId === undefined ? randomUUID() : id(options.mutationId);
    if (operation !== 'create') {
      id(contentId);
      if (typeof expectedToken !== 'string' || !/^[0-9a-f]{64}$/.test(expectedToken)) fail('INVALID_INPUT', 'A read editToken is required');
    }
    const requestDigest = hash(jsonBytes({ operation, contentId, input, expectedToken }));
    return locked(() => {
      const txDir = path.join(root, SYSTEM, '事务', mutationId);
      if (safePath(txDir, true)) {
        const tx = transaction(root, mutationId, initialInfo.libraryId);
        if (tx.intent.requestDigest !== requestDigest) fail('INVALID_INPUT', 'mutationId was used with a different request');
        return result(tx.after, tx.intent.contentId, mutationId);
      }
      const before = operation === 'create' ? [null, null] : snapshot(root, contentId);
      let meta;
      const now = new Date().toISOString();
      if (operation === 'create') {
        contentId = randomUUID();
        if (safePath(path.join(root, '内容', contentId), true)) fail('CONFLICT', 'Content ID already exists');
        meta = { format: CONTENT_FORMAT, schemaVersion: VERSION, id: contentId, title: input.title, revision: 1, createdAt: now, updatedAt: now, deletedAt: null };
      } else {
        const current = result(before, contentId);
        if (current.editToken !== expectedToken) fail('CONFLICT', 'Content changed; read again before retrying');
        if ((operation === 'restore') !== (current.deletedAt !== null)) fail('INVALID_STATE', 'Content is already in the requested state or is trashed');
        meta = { ...metadata(before[0], contentId), revision: current.revision + 1, updatedAt: now };
        if (operation === 'trash') meta.deletedAt = now;
        if (operation === 'restore') meta.deletedAt = null;
        if (operation === 'update' && Object.hasOwn(input, 'title')) meta.title = input.title;
      }
      const after = [jsonBytes(meta), operation === 'create' || Object.hasOwn(input, 'body') ? Buffer.from(input.body) : before[1]];
      const intent = { schemaVersion: VERSION, libraryId: initialInfo.libraryId, mutationId, contentId, operation, requestDigest, before: before.map(pack), after: after.map(pack) };
      const stagingDir = path.join(root, SYSTEM, '事务', `.staging-${mutationId}-${randomUUID()}`);
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
        return result(after, contentId, mutationId);
      } catch (error) { throw Object.assign(ioError(error), { mutationId, pendingRecovery: published }); }
    });
  }

  return Object.freeze({
    info: Object.freeze({ ...initialInfo, root, durability: process.platform === 'win32' ? 'process-crash/file-fsync' : 'process-crash/file-and-directory-fsync' }),
    listContents: () => list(false),
    listTrash: () => list(true),
    readContent: contentId => locked(() => result(snapshot(root, id(contentId)), contentId)),
    createContent: (input, options) => mutate('create', null, fields(input), null, options),
    updateContent: (contentId, patch, token, options) => mutate('update', contentId, fields(patch, true), token, options),
    trashContent: (contentId, token, options) => mutate('trash', contentId, {}, token, options),
    restoreContent: (contentId, token, options) => mutate('restore', contentId, {}, token, options),
    queryMutation: mutationId => locked(() => {
      const dir = path.join(root, SYSTEM, '事务', id(mutationId));
      if (!safePath(dir, true)) return null;
      const tx = transaction(root, mutationId, initialInfo.libraryId);
      return { mutationId, status: 'committed', content: result(tx.after, tx.intent.contentId, mutationId) };
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
    mkdir(path.join(root, '内容'));
    writeNew(path.join(root, '内容库.json'), jsonBytes({ format: FORMAT, schemaVersion: VERSION, libraryId: randomUUID(), createdAt: new Date().toISOString() }));
    return openLibrary(root);
  } catch (error) { throw ioError(error); }
}

export function openLibrary(root) {
  try {
    root = canonicalRoot(root);
    const handle = library(root, descriptor(root));
    // Opening never exposes a half-committed content pair.
    handle.listContents();
    return handle;
  } catch (error) { throw ioError(error); }
}
