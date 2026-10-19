import type {Attempt, Candidate, CoverJob, CoverView} from '../shared/cover-contracts.ts';

interface CandidateGroup {key: string; job: CoverJob | null; attempt: Attempt | null; candidates: Candidate[]; batchNumber?: number; latest?: boolean; label?: string}

export function coverCandidateGroups({jobs, candidates}: Pick<CoverView, 'jobs' | 'candidates'>, favorites = new Set<string>(), onlyFavorites = false): CandidateGroup[] {
  const groups: CandidateGroup[] = [], shown = new Set<string>();
  for (const job of [...jobs].reverse()) for (const attempt of [...job.attempts].reverse()) {
    const matches = candidates.filter(candidate => candidate.requestId === job.id && candidate.attemptId === attempt.attemptId && !shown.has(candidate.id));
    if (matches.length) {
      matches.forEach(candidate => shown.add(candidate.id));
      groups.push({key: JSON.stringify([job.id, attempt.attemptId]), job, attempt, candidates: matches});
    }
  }
  const historical = candidates.filter(candidate => !shown.has(candidate.id));
  // Imported candidates may have no generation record; their IDs do not establish an assistant or task status.
  if (historical.length) groups.push({key: 'historical', job: null, attempt: null, candidates: historical});
  const generated = groups.filter(group => group.attempt);
  generated.forEach((group, index) => { group.batchNumber = generated.length - index; group.latest = index === 0; });
  if (!favorites.size) return onlyFavorites ? [] : groups;
  const favoriteCandidates = groups.flatMap(group => group.candidates).filter(candidate => favorites.has(candidate.id));
  const rest = groups.map(group => ({...group, candidates: group.candidates.filter(candidate => !favorites.has(candidate.id))})).filter(group => group.candidates.length);
  return [...(favoriteCandidates.length ? [{key: 'favorites', job: null, attempt: null, label: '收藏优先', candidates: favoriteCandidates}] : []), ...(onlyFavorites ? [] : rest)];
}

export function ratioPixels(ratio: string): { width: number; height: number } | null {
  if (!/^\d{1,8}:\d{1,8}$/.test(ratio)) return null;
  const [width, height] = ratio.split(':').map(Number);
  if (!width || !height) return null;
  let a = width, b = height;
  while (b) { const remainder = a % b; a = b; b = remainder; }
  const w = width / a, h = height / a, scale = Math.ceil(768 / Math.min(w, h));
  return w * scale * h * scale > 40_000_000 ? null : {width: w * scale, height: h * scale};
}
export interface CoverAnnotation { x: number; y: number; text: string }
export function imageAnnotationPoint(clientX: number, clientY: number, rect: {left: number; top: number; width: number; height: number}, width: number, height: number): {x: number; y: number} | null {
  if (!width || !height || !rect.width || !rect.height) return null;
  const scale = Math.min(rect.width / width, rect.height / height), w = width * scale, h = height * scale;
  const left = rect.left + (rect.width - w) / 2, top = rect.top + (rect.height - h) / 2;
  if (clientX < left || clientX > left + w || clientY < top || clientY > top + h) return null;
  return {x: Math.round((clientX - left) / w * 1000) / 10, y: Math.round((clientY - top) / h * 1000) / 10};
}
const annotationHeader = '【封面位置批注】';
export function annotationNote(points: CoverAnnotation[], overall: string): string {
  return `${annotationHeader}\n${points.map((point, index) => `${index + 1}. (x=${point.x}%, y=${point.y}%) ${point.text.replace(/\n/g, ' ')}`).join('\n')}\n【整体修改要求】\n${overall}`;
}
export function readAnnotationNote(note: string): {points: CoverAnnotation[]; overall: string} {
  if (!note.startsWith(annotationHeader + '\n')) return {points: [], overall: note};
  const separator = '\n【整体修改要求】\n', split = note.indexOf(separator);
  if (split < 0) return {points: [], overall: note};
  const lines = note.slice(annotationHeader.length + 1, split).split('\n').filter(Boolean), points: CoverAnnotation[] = [];
  for (const line of lines) {
    const match = /^\d+\. \(x=(\d+(?:\.\d+)?)%, y=(\d+(?:\.\d+)?)%\) (.*)$/.exec(line);
    if (!match || Number(match[1]) > 100 || Number(match[2]) > 100) return {points: [], overall: note};
    points.push({x: Number(match[1]), y: Number(match[2]), text: match[3]});
  }
  return {points, overall: note.slice(split + separator.length)};
}
