/** Requests contain only identities registered by the native reader, never filesystem paths. */
export type DocumentViewInput = {documentId: string; expectedHash: string; scope?: string};
export type DocumentReferenceInput = DocumentViewInput & {refId: string; targetIdentity: string; intent?: 'embed' | 'navigate'};
export type DocumentReferenceKind = 'image' | 'embed' | 'wiki' | 'link';
export type DocumentReferenceState = 'ready' | 'missing' | 'ambiguous' | 'unsupported' | 'stale';
export type DocumentReference = {refId: string; raw: string; destination: string; label: string; kind: DocumentReferenceKind; state: DocumentReferenceState; targetIdentity: string | null; issue: string; candidates?: string[]};
export type DocumentView = {scope?: string; documentId: string; hash: string; text: string; references: DocumentReference[]; contentIdentity: string; truncated: boolean};
export type DocumentReferenceResult =
    | {kind: 'image'; identity: string; mime: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; data: Uint8Array; width: number; height: number}
    | {kind: 'document'; view: DocumentView}
    | {kind: 'limited'; message: string};
export type DocumentReader = {readView(input: DocumentViewInput): Promise<DocumentView>; readReference(input: DocumentReferenceInput): Promise<DocumentReferenceResult>; openExternal(input: DocumentReferenceInput): Promise<void>};
export const DOCUMENT_REFERENCE_LIMIT = 100;
export const DOCUMENT_EMBED_DEPTH = 3;
export type DocumentToken = {raw: string; destination: string; label: string; kind: DocumentReferenceKind; offset: number};
/** Shared syntax scan: fenced/inline code and escaped markers never gain authority. */
export function documentReferenceTokens(text: string, limit = DOCUMENT_REFERENCE_LIMIT + 1): DocumentToken[] {
    const output: DocumentToken[] = [];
    const expression = /\\[\s\S]|(?<!`)(`+)(?!`)[\s\S]*?\1(?!`)|(!?)\[\[([^\]\n]+)\]\]|(!?)\[([^\]\n]*)\]\((<[^>\n]+>|(?:[^\s()]|\([^()]*\))+)(?:\s+["'][^\n]*?["'])?\)|<(https?:\/\/[^<>\s]+)>|https?:\/\/[^\s<>]+/g;
    let fence: {character: string; length: number} | null = null, offset = 0;
    for (const line of text.split(/(?<=\n)/)) {
        const marker = line.replace(/\r?\n$/, '').match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
        if (marker && !fence) {fence = {character: marker[1][0], length: marker[1].length}; offset += line.length; continue;}
        if (fence) {if (marker && marker[1][0] === fence.character && marker[1].length >= fence.length && !marker[2].trim()) fence = null; offset += line.length; continue;}
        expression.lastIndex = 0;
        for (let match; (match = expression.exec(line));) {
            if (match[0].startsWith('\\') || match[1]) continue;
            let destination: string, label: string, kind: DocumentReferenceKind;
            if (match[3] !== undefined) {const pieces = match[3].split('|'); destination = pieces.shift()!; label = pieces.join('|') || destination; kind = match[2] ? 'embed' : 'wiki';}
            else if (match[6] !== undefined) {destination = match[6].replace(/^<|>$/g, ''); label = match[5]; kind = match[4] ? 'image' : 'link';}
            else {destination = (match[7] ?? match[0]).replace(/[.,;!?，。；！？、]+$/, ''); label = destination; kind = 'link';}
            output.push({raw: match[0], destination, label, kind, offset: offset + match.index});
            if (output.length >= limit) return output;
        }
        offset += line.length;
    }
    return output;
}
