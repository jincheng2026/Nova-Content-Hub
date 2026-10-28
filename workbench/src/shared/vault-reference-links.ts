import type {VaultDocument, VaultText} from './vault-contracts.ts';

export interface TopicReference {
  title: string;
  target: string;
  url?: string;
  document?: VaultDocument;
}
export interface CardLink extends TopicReference {start: number}

/** Balanced Markdown destinations may contain parentheses; angle destinations may also contain spaces. */
export function vaultReferenceLinks(card: VaultText, documents: VaultDocument[]): CardLink[] {
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

