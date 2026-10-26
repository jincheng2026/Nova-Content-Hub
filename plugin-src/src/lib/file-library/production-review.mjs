// Pure review operations. Receipt artifacts remain immutable; only creation drafts change.
export function quotePosition(body, quote) {
    if (!quote) return -1;
    const start = body.indexOf(quote);
    return start >= 0 && body.indexOf(quote, start + 1) < 0 ? start : -1;
}
export async function reviewBodyHash(body) {
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body)))].map(x => x.toString(16).padStart(2, '0')).join('');
}
export async function acceptReviewSuggestion({body, suggestions, id}) {
    const currentHash = await reviewBodyHash(body);
    const selected = suggestions.find(item => item.id === id);
    const start = selected ? quotePosition(body, selected.quote) : -1;
    if (!selected || selected.status !== 'pending' || selected.bodyHash !== currentHash || start < 0) throw new Error('建议对应的原句已变化或出现多次，请先手动核对，原稿保留。');
    const end = start + selected.quote.length;
    const nextBody = body.slice(0, start) + selected.replacement + body.slice(end);
    const nextHash = await reviewBodyHash(nextBody);
    return {body: nextBody, suggestions: suggestions.map(item => {
        if (item.id === id) return {...item, status: 'accepted'};
        const at = quotePosition(body, item.quote);
        if (item.status === 'pending' && item.bodyHash === currentHash && at >= 0 && (at + item.quote.length <= start || at >= end) && quotePosition(nextBody, item.quote) >= 0) return {...item, bodyHash: nextHash};
        return {...item};
    })};
}
// Paragraphs are derived from the single editable body; quotes spanning a boundary merge it.
export function reviewParagraphs(body, entries) {
    const anchored = entries.map(entry => ({...entry, start: quotePosition(body, entry.quote)})).filter(entry => entry.start >= 0).sort((a, b) => a.start - b.start);
    const boundaries = [0];
    for (const match of body.matchAll(/\n+/g)) {
        const end = match.index + match[0].length;
        if (!anchored.some(entry => entry.start < end && entry.start + entry.quote.length > match.index)) boundaries.push(end);
    }
    if (boundaries.at(-1) !== body.length) boundaries.push(body.length);
    return boundaries.slice(0, -1).map((start, index) => {
        const end = boundaries[index + 1];
        const items = anchored.filter(entry => entry.start >= start && entry.start < end);
        const cuts = [...new Set([start, end, ...items.flatMap(entry => [entry.start, entry.start + entry.quote.length])])].sort((a, b) => a - b);
        const parts = cuts.slice(0, -1).map((at, i) => ({text: body.slice(at, cuts[i + 1]), ids: items.filter(entry => entry.start <= at && entry.start + entry.quote.length > at).map(entry => entry.id)}));
        return {start, text: body.slice(start, end), items, parts};
    });
}
