import type {VaultDocument, VaultText, VaultWorkContext} from '../shared/vault-contracts.ts';

type Work = NonNullable<NonNullable<VaultWorkContext>['content']>;
export interface DetailFile {
  documentId: string;
  relativePath: string;
  hash: string;
  document?: VaultDocument;
  editable: boolean;
  role?: string;
}
export interface TopicReference {
  title: string;
  target: string;
  url?: string;
  document?: VaultDocument;
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

interface CardLink extends TopicReference {start: number}

/** Balanced Markdown destinations may contain parentheses; angle destinations may also contain spaces. */
function cardLinks(card: VaultText, documents: VaultDocument[]): CardLink[] {
  const links: CardLink[] = [], spans: Array<[number, number]> = [];
  function add(title: string, raw: string, start: number) {
    const target = raw.replace(/\\([\\()[\] ])/g, '$1');
    if (/^https?:\/\//i.test(target)) {
      links.push({title, target, url: target, start});
      return;
    }
    if (!target || target.startsWith('#') || (/^[a-z][a-z0-9+.-]*:/i.test(target) && !/^[a-z]:[\\/]/i.test(target))) return;
    let decoded: string;
    try {decoded = decodeURIComponent(target);} catch {decoded = target;}
    // Absolute and root-escaping locations remain evidence. Never clamp them into the bound vault.
    if (/^(?:\/|~\/|[a-z]:[\\/])/i.test(decoded)) {
      links.push({title, target: decoded, start});
      return;
    }
    const parts = card.document.relativePath.split('/').slice(0, -1);
    for (const part of decoded.split(/[?#]/, 1)[0].split('/')) {
      if (part === '..') {
        if (!parts.length) {links.push({title, target: decoded, start}); return;}
        parts.pop();
      } else if (part && part !== '.') parts.push(part);
    }
    const path = parts.join('/') + (decoded.endsWith('/') ? '/' : '');
    links.push({title, target: path, document: documents.find(item => item.relativePath === path), start});
  }
  for (const match of card.text.matchAll(/\[([^\]\n]+)\]\(/g)) {
    const begin = match.index!, destination = begin + match[0].length;
    let end = destination, raw = '';
    if (card.text[destination] === '<') {
      end = card.text.indexOf('>', destination + 1);
      if (end < 0 || card.text[end + 1] !== ')') continue;
      raw = card.text.slice(destination + 1, end); end += 2;
    } else {
      let depth = 1;
      while (end < card.text.length && card.text[end] !== '\n') {
        const char = card.text[end];
        if (char === '\\') {end += 2; continue;}
        if (char === '(') depth++;
        if (char === ')') {depth--; if (depth === 0) break;}
        end++;
      }
      if (depth !== 0) continue;
      raw = card.text.slice(destination, end); end++;
      if (/\s/.test(raw)) continue;
    }
    spans.push([begin, end]);
    add(match[1], raw, begin);
  }
  for (const match of card.text.matchAll(/https?:\/\/[^\s<>|`\]\u3000，。；：！？、）】」』》]+/g)) {
    if (spans.some(([start, end]) => match.index! >= start && match.index! < end)) continue;
    let url = match[0].replace(/[。，；：、！？,.!;:'"”’」』》]+$/, '');
    while (url.endsWith(')') && (url.match(/\)/g)?.length ?? 0) > (url.match(/\(/g)?.length ?? 0)) url = url.slice(0, -1);
    if (url) add(url, url, match.index!);
  }
  return links.sort((a, b) => a.start - b.start);
}

/** Only actual indexed documents become read/reveal targets. Unindexed links remain visible evidence. */
export function topicReferences(cards: VaultText[], documents: VaultDocument[]): TopicReference[] {
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
export function topicReferenceGroups(cards: VaultText[], documents: VaultDocument[]): {videos: VideoReference[]; materials: TopicReference[]} {
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
