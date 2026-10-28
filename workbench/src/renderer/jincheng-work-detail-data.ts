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
export function topicReferences(cards: VaultText[], documents: VaultDocument[]): TopicReference[] {
  const references = new Map<string, TopicReference>();
  for (const card of cards) {
    for (const match of card.text.matchAll(/\[([^\]]+)\]\((?:<([^>]+)>|([^\s)]+))\)/g)) {
      const target = match[2] ?? match[3];
      if (!target) continue;
      if (/^https?:\/\//i.test(target)) {
        references.set(target, {title: match[1], target, url: target});
      } else if (!/^[a-z][a-z0-9+.-]*:/i.test(target) && !target.startsWith('#')) {
        try {
          const path = decodeURIComponent(new URL(target, 'https://vault.invalid/' + card.document.relativePath).pathname.slice(1));
          const document = documents.find(item => item.relativePath === path);
          references.set(path, {title: match[1], target: path, document});
        } catch { /* The original card remains available for malformed links. */ }
      }
    }
    for (const match of card.text.matchAll(/https?:\/\/[^\s)>\]]+/g)) {
      const url = match[0];
      if (!references.has(url)) references.set(url, {title: url, target: url, url});
    }
  }
  return [...references.values()];
}
