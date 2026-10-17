import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import Core from '../原型/core.js';

export class BrowserImportError extends Error {
  constructor(code, message, cause) { super(message, cause ? { cause } : undefined); this.name = 'BrowserImportError'; this.code = code; }
}
const reject = (code, message) => { throw new BrowserImportError(code, message); };
const fingerprint = info => ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].map(key => String(info[key])).join(':');

// Selected JSON is data; only this repository's validator is executed.
export function readBrowserBackup(sourcePath) {
  if (typeof sourcePath !== 'string' || !path.isAbsolute(sourcePath) || sourcePath.includes('\0')) reject('INVALID_INPUT', '请选择一个备份文件。');
  let fd;
  try {
    const selected = path.join(fs.realpathSync(path.dirname(sourcePath)), path.basename(sourcePath));
    const before = fs.lstatSync(selected, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink()) reject('UNSAFE_PATH', '备份必须是普通文件，不能是文件夹或符号链接。');
    if (before.size > BigInt(Core.MAX_BYTES)) reject('BACKUP_TOO_LARGE', '备份超过原型的 4 MiB 上限。');
    fd = fs.openSync(selected, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    if (fingerprint(fs.fstatSync(fd, { bigint: true })) !== fingerprint(before)) reject('SOURCE_CHANGED', '备份在读取前发生变化，请重新选择。');
    const chunks = []; let total = 0;
    for (;;) {
      const chunk = Buffer.alloc(Math.min(65536, Core.MAX_BYTES + 1 - total));
      const count = fs.readSync(fd, chunk, 0, chunk.length, null);
      if (!count) break;
      total += count;
      if (total > Core.MAX_BYTES) reject('BACKUP_TOO_LARGE', '备份在读取时超出容量上限。');
      chunks.push(chunk.subarray(0, count));
    }
    if (fingerprint(fs.fstatSync(fd, { bigint: true })) !== fingerprint(before) || fingerprint(fs.lstatSync(selected, { bigint: true })) !== fingerprint(before) || BigInt(total) !== before.size) reject('SOURCE_CHANGED', '备份在读取时发生变化，请重新选择。');
    const raw = Buffer.concat(chunks);
    let state;
    try { state = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); }
    catch (error) { throw new BrowserImportError('INVALID_BACKUP', '备份不是完整的 UTF-8 JSON 文件。', error); }
    try { Core.validate(state); }
    catch (error) { throw new BrowserImportError('INVALID_BACKUP', error.message, error); }
    return { raw, state, sourceHash: createHash('sha256').update(raw).digest('hex') };
  } catch (error) {
    if (error instanceof BrowserImportError) throw error;
    throw new BrowserImportError('IO_ERROR', '无法读取所选备份文件。', error);
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}

function legacyFingerprint(value) {
  let a=2166136261,b=3339675911;
  for(let i=0;i<value.length;i++){a=Math.imul(a^value.charCodeAt(i),16777619);b=Math.imul(b^value.charCodeAt(i),2246822507);}
  return `${value.length}:${(a>>>0).toString(16).padStart(8,'0')}:${(b>>>0).toString(16).padStart(8,'0')}`;
}

// Keys include the owning project/material: candidate IDs are not globally unique.
export function sourceReferences(state) {
  const references = [];
  const add = (key, role, source, metadata = {}) => references.push({ key, role, source: source || null, ...metadata });
  function photo(value, prefix) { add(prefix, 'photo', value.img, { oldId: value.id, defaultRequested: value.use === true }); }
  function attachment(value, prefix) { add(prefix, 'attachment', value.content, { oldId: value.id, originalName: value.name }); }
  function project(value, prefix) {
    for (const file of value.files) attachment(file, `${prefix}/file/${file.id}`);
    for (const material of value.materials) for (const batch of material.batches) for (const candidate of batch.cands) {
      add(`${prefix}/material/${material.id}/candidate/${candidate.id}`, 'candidate', candidate.img, { oldId: candidate.id });
    }
    for (const post of value.posts) if (post.pub?.snapshot) add(`${prefix}/post/${post.id}/published-cover`, 'published-cover', post.pub.snapshot.img);
  }
  if (state.data.ACCOUNT.avatar) add('profile/avatar', 'avatar', state.data.ACCOUNT.avatar);
  for (const value of state.data.ACCOUNT.photos) photo(value, `photo/${value.id}`);
  for (const template of state.data.TEMPLATES) {
    for (const [index, history] of (template.history || []).entries()) {
      const definition = history.definition || {};
      const pool=[...new Set([...template.shots,...state.trash.filter(item=>item.kind==='shot'&&item.tid===template.id).map(item=>item.value)])];
      for(const reference of history.sources||[]){const matches=pool.filter(value=>legacyFingerprint(value)===reference.key);add(`template/${template.id}/history/${index}/source/${reference.id}`,'template-reference',matches.length===1?matches[0]:null,{historicalSourceId:reference.id});}
      (definition.shots || []).forEach((source, n) => add(`template/${template.id}/history/${index}/shot/${n}`, 'template-reference', source));
      (definition.assets || []).forEach((entry, n) => add(`template/${template.id}/history/${index}/asset/${n}`, 'template-resource', typeof entry === 'string' ? entry : entry.path));
      (definition.generatedReferences || []).forEach((entry, n) => add(`template/${template.id}/history/${index}/generated-reference/${n}`, 'template-reference', entry.path));
    }
    template.shots.forEach((source, index) => add(`template/${template.id}/shot/${index}`, 'template-reference', source));
    (template.generatedReferences || []).forEach((entry, index) => add(`template/${template.id}/generated-reference/${index}`, 'template-reference', entry.path));
    (template.assets || []).forEach((entry, index) => add(`template/${template.id}/asset/${index}`, 'template-resource', typeof entry === 'string' ? entry : entry.path));
    if (template.img) add(`template/${template.id}/preview`, 'template-preview', template.img);
    if (template.validation?.restoreImage) add(`template/${template.id}/restoration`, 'template-restoration', template.validation.restoreImage);
  }
  for (const value of state.data.PROJECTS) project(value, `project/${value.id}`);
  for (const item of state.trash) {
    const prefix = `trash/${item.id}`;
    if (item.kind === 'photo') photo(item.value, prefix);
    else if (item.kind === 'file') attachment(item.value, prefix);
    else if (item.kind === 'shot') add(prefix, 'template-reference', item.value);
    else if (item.kind === 'project') project(item.value, prefix);
  }
  return references;
}

export function inspectBrowserBackup(sourcePath) {
  const { raw, state, sourceHash } = readBrowserBackup(sourcePath);
  const references = sourceReferences(state);
  const assets = references.map(({ source, ...entry }) => ({ ...entry,
    resolution: source?.startsWith('data:') ? 'embedded-unverified' : source ? 'reference-unresolved' : 'missing',
  }));
  const projects = state.data.PROJECTS;
  const posts = projects.flatMap(project => project.posts);
  return {
    format: 'nova-browser-import-inspection', schemaVersion: 1,
    source: { sha256: sourceHash, bytes: raw.length, libraryId: state.libraryId, updatedAt: state.updatedAt },
    counts: { contents: projects.filter(value => value.kind === '内容').length, collections: projects.filter(value => value.kind === '合集').length,
      templates: state.data.TEMPLATES.length, photos: state.data.ACCOUNT.photos.length, prompts: state.data.PROMPTS.length,
      plans: posts.length, publications: posts.filter(post => post.pub).length, archivedTasks: state.data.TASKS.length, trash: state.trash.length },
    assets, hostPreferenceSuggestion: state.data.SETTINGS.host,
    warnings: [
      ...(assets.some(entry => entry.resolution !== 'embedded-unverified') ? [{ code: 'UNRESOLVED_ASSETS', message: '部分图片或附件只有引用。导入时会核对内置资源，缺失文件会保留记录并明确提示，不自动读取备份里的本机路径。' }] : []),
      ...(posts.some(post => post.pub) ? [{ code: 'UNKNOWN_PUBLISHED_TEXT', message: '旧备份没有冻结发布时的文案；历史文案会标记未知。' }] : []),
      { code: 'MACHINE_STATE_NOT_TRUSTED', message: '助手安装、信任和演示授权不作为正式状态导入。' },
    ],
    imageDecodingPerformed: false, libraryCreated: false,
  };
}
