import type {VaultDocument, VaultText, VaultWorkContext} from '../shared/vault-contracts.ts';
import {vaultReferenceLinks as cardLinks, type CardLink, type TopicReference, type ReferenceDocument} from '../shared/vault-reference-links.ts';
export type {TopicReference} from '../shared/vault-reference-links.ts';

export function referenceTargets(snapshot: {documents?: ReferenceDocument[]; attachments?: ReferenceDocument[]} | null): ReferenceDocument[] {
  return [...(snapshot?.documents ?? []), ...(snapshot?.attachments ?? [])];
}

type Work = NonNullable<NonNullable<VaultWorkContext>['content']>;
export interface DetailFile {
  documentId: string;
  relativePath: string;
  hash: string;
  document?: VaultDocument;
  editable: boolean;
  role?: string;
}
export interface VideoReference {
  key: string;
  title: string;
  links: TopicReference[];
}

/** Preserve the original indexed order and identities; no implicit latest-version selection. */
export function detailFiles(work: Pick<Work, 'relatedDocuments' | 'creationDocuments' | 'sourceCandidates'>, documents: VaultDocument[]) {
  const originals = new Map(documents.map(document => [document.id, document]));
  const editable = new Set(work.creationDocuments.map(document => document.documentId));
  const files = [...new Map([...work.relatedDocuments, ...work.creationDocuments, ...work.sourceCandidates].map(file => [file.documentId, file])).values()].map(file => ({
    documentId: file.documentId,
    relativePath: file.relativePath,
    hash: file.hash,
    document: originals.get(file.documentId),
    editable: editable.has(file.documentId),
    role: work.sourceCandidates.find(candidate => candidate.documentId === file.documentId)?.role,
  }));
  return {
    pages: files.filter(file => /\.html?$/i.test(file.relativePath)),
    topicCards: files.filter(file => file.relativePath.startsWith('04_选题库/') && /\.md$/i.test(file.relativePath)),
    others: files.filter(file => !/\.html?$/i.test(file.relativePath) && !(file.relativePath.startsWith('04_选题库/') && /\.md$/i.test(file.relativePath))),
  };
}

export function resumeDocument(work: Pick<Work, 'sourceResolution' | 'sourceDocumentId'>): string | null {
  return work.sourceResolution === 'resolved' ? work.sourceDocumentId : null;
}

/** Only actual indexed documents become read/reveal targets. Unindexed links remain visible evidence. */
export function topicReferences(cards: VaultText[], documents: ReferenceDocument[]): TopicReference[] {
  return [...new Map(cards.flatMap(card => cardLinks(card, documents)).map(({start: _start, ...link}) => [link.target, link])).values()];
}

function materialRoot(link: TopicReference): string | null {
  if (!link.target.startsWith('02_内容素材/')) return null;
  const root = link.target.split(/\/(?:笔记信息\.md|转写\/)/)[0];
  if (root !== link.target) return root;
  // A generic report in the materials tree is not itself a video reference.
  return /_(?:\d{15,20}|[a-f0-9]{24})(?:\/|\.(?:md|txt))?$/i.test(root) ? root.replace(/\/$/, '') : null;
}
function isWorkUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const {hostname, pathname, searchParams} = new URL(url), host = hostname.toLowerCase();
    const domain = (name: string) => host === name || host.endsWith('.' + name);
    if (domain('douyin.com') || domain('iesdouyin.com')) return /^\/(?:video|note|share\/video)\/\d+/.test(pathname) || (host === 'v.douyin.com' && pathname.length > 1);
    if (domain('xiaohongshu.com')) return /^\/(?:explore|discovery\/item)\//.test(pathname);
    if (domain('xhslink.com') || domain('b23.tv') || domain('youtu.be')) return pathname.length > 1;
    if (domain('bilibili.com')) return /^\/video\//.test(pathname);
    if (domain('youtube.com')) return /^\/(?:shorts|live)\//.test(pathname) || (pathname === '/watch' && !!searchParams.get('v'));
    if (domain('channels.weixin.qq.com')) return pathname.length > 1;
    return domain('weixin.qq.com') && /^\/sph/.test(pathname);
  } catch {return false;}
}
const localVideo = (link: TopicReference) => !link.url && /\.(?:mp4|mov|webm|m4v)(?:$|[?#])/i.test(link.target) && /原视频|原片/.test(link.title);
const plainTitle = (text: string) => text.replace(/\[([^\]]+)\]\([^\n]*?\)/g, '$1').replace(/^\s*(?:[-*+]\s+|#{1,6}\s+)/, '').replace(/[《》*`]/g, '').trim();
function fallbackTitle(key: string) {
  return key.split('/').filter(Boolean).at(-1)?.replace(/\.(?:md|txt)$/i, '').replace(/^(?:抖音|小红书|B站|视频号)_/, '').replace(/_(?:\d{15,20}|[a-f0-9]{24})$/i, '') || key;
}

/** Group by actual material identity, with row/list-local evidence for a work's URL and transcript. */
export function topicReferenceGroups(cards: VaultText[], documents: ReferenceDocument[]): {videos: VideoReference[]; materials: TopicReference[]} {
  const videos = new Map<string, VideoReference>(), all = new Map<string, TopicReference>(), used = new Set<string>();
  function group(key: string, title: string) {
    let value = videos.get(key);
    if (!value) {value = {key, title, links: []}; videos.set(key, value);}
    return value;
  }
  function attach(value: VideoReference, link: TopicReference) {
    if (!value.links.some(item => item.target === link.target)) value.links.push(link);
    used.add(link.target);
  }
  for (const card of cards) {
    const links = cardLinks(card, documents);
    for (const {start: _start, ...link} of links) if (!all.has(link.target)) all.set(link.target, link);
    let offset = 0, current = {title: '', links: [] as CardLink[]}, headers: string[] = [];
    const units: typeof current[] = [];
    for (const line of card.text.split('\n')) {
      const rowLinks = links.filter(link => link.start >= offset && link.start < offset + line.length);
      const cells = line.trim().startsWith('|') ? line.trim().replace(/^\||\|$/g, '').split('|').map(plainTitle) : null;
      if (cells) {
        if (current.links.length) units.push(current);
        current = {title: '', links: []};
        if (!rowLinks.length && !cells.every(cell => /^:?-+:?$/.test(cell))) headers = cells;
        const titleIndex = headers.findIndex(cell => /^(?:参考|标题|作品|视频)$/.test(cell));
        if (rowLinks.length) units.push({title: titleIndex >= 0 ? cells[titleIndex] ?? '' : '', links: rowLinks});
      } else if (!line.trim() || /^\s*#/.test(line) || /^[-*+]\s/.test(line)) {
        if (current.links.length) units.push(current);
        current = {title: /^[-*+]\s/.test(line) && rowLinks.length === 0 ? plainTitle(line) : '', links: rowLinks};
      } else current.links.push(...rowLinks);
      offset += line.length + 1;
    }
    if (current.links.length) units.push(current);
    // Seed every material first so later mentions and matching IDs share one object.
    for (const unit of units) for (const link of unit.links) {
      const root = materialRoot(link);
      if (root) group(root, unit.title || fallbackTitle(root));
    }
    for (const unit of units) {
      const roots = [...new Set(unit.links.map(materialRoot).filter((value): value is string => !!value))];
      const workLinks = unit.links.filter(link => isWorkUrl(link.url) || localVideo(link));
      const unitGroups = new Set<VideoReference>();
      for (const link of workLinks) {
        const byId = [...videos.keys()].filter(key => {
          const id = key.match(/_(\d{15,20}|[a-f0-9]{24})(?:\.[a-z]+)?$/i)?.[1];
          return id && link.url?.includes(id);
        });
        const root = byId.length === 1 ? byId[0] : roots.length === 1 && workLinks.length === 1 ? roots[0] : null;
        const value = group(root ?? link.target, unit.title || fallbackTitle(root ?? link.title));
        attach(value, link); unitGroups.add(value);
      }
      for (const link of unit.links) {
        const root = materialRoot(link);
        if (root) {const value = videos.get(root)!; attach(value, link); unitGroups.add(value);}
      }
      // Explicit local transcripts can accompany a single original work; unrelated paths remain materials.
      if (unitGroups.size === 1) {
        const value = [...unitGroups][0];
        for (const link of unit.links) if (!link.url && /逐字稿/.test(link.title)) attach(value, link);
      }
    }
  }
  // The snapshot already certifies these IDs. Do not probe paths or select a supposed latest transcript.
  for (const value of videos.values()) {
    if (!value.key.startsWith('02_内容素材/')) continue;
    for (const document of documents) {
      if (!document.relativePath.startsWith(value.key + '/转写/校正版逐字稿/') || !['markdown', 'text'].includes(document.format)) continue;
      const link = {title: `校正版逐字稿 · ${document.relativePath.split('/').at(-1)}`, target: document.relativePath, document};
      if (!all.has(link.target)) all.set(link.target, link);
      attach(value, link);
    }
  }
  // Retain card order inside a work even when the URL and material were discovered in separate passes.
  const order = [...all.keys()];
  for (const value of videos.values()) value.links.sort((a, b) => order.indexOf(a.target) - order.indexOf(b.target));
  return {videos: [...videos.values()].sort((a, b) => order.indexOf(a.links[0].target) - order.indexOf(b.links[0].target)), materials: [...all.values()].filter(link => !used.has(link.target))};
}
