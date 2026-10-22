import type {Attempt, Candidate, CoverJob, CoverView} from '../shared/cover-contracts.ts';

interface CandidateGroup {key: string; job: CoverJob | null; attempt: Attempt | null; candidates: Candidate[]; batchNumber?: number; latest?: boolean; label?: string}

export function coverCandidateGroups({jobs, candidates}: Pick<CoverView, 'jobs' | 'candidates'>, favorites = new Set<string>(), onlyFavorites = false): CandidateGroup[] {
  const groups: CandidateGroup[] = [], shown = new Set<string>(), byAttempt = new Map<string, Candidate[]>();
  for (const candidate of candidates) {const key = JSON.stringify([candidate.requestId, candidate.attemptId]), matches = byAttempt.get(key) ?? []; matches.push(candidate); byAttempt.set(key, matches);}
  for (const job of [...jobs].reverse()) for (const attempt of [...job.attempts].reverse()) {
    const matches = (byAttempt.get(JSON.stringify([job.id, attempt.attemptId])) ?? []).filter(candidate => !shown.has(candidate.id));
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
export interface AnnotationPoint { x: number; y: number }
export type CoverAnnotation = (AnnotationPoint & {type?: 'point'; text: string}) | (AnnotationPoint & {type: 'rect'; width: number; height: number; text: string}) | {type: 'path'; points: AnnotationPoint[]; text: string};
export const annotationPathLimit = 128;
export function validCoverAnnotation(mark: CoverAnnotation): boolean {
  const coordinate = (value: number) => Number.isFinite(value) && value >= 0 && value <= 100;
  const point = (value: AnnotationPoint) => coordinate(value.x) && coordinate(value.y);
  if (typeof mark.text !== 'string') return false;
  if (mark.type === 'path') return Array.isArray(mark.points) && mark.points.length >= 2 && mark.points.length <= annotationPathLimit && mark.points.every(point) && mark.points.some(p => p.x !== mark.points[0].x || p.y !== mark.points[0].y);
  if (!point(mark)) return false;
  if (mark.type === 'rect') return coordinate(mark.width) && coordinate(mark.height) && mark.width > 0 && mark.height > 0 && mark.x + mark.width <= 100.000001 && mark.y + mark.height <= 100.000001;
  return mark.type === undefined || mark.type === 'point';
}
export function annotationAnchor(mark: CoverAnnotation): AnnotationPoint { return mark.type === 'path' ? mark.points[0] : mark; }
export function annotationRect(a: AnnotationPoint, b: AnnotationPoint): CoverAnnotation {
  return {type: 'rect', x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.round(Math.abs(a.x - b.x) * 10) / 10, height: Math.round(Math.abs(a.y - b.y) * 10) / 10, text: ''};
}
export function imageAnnotationPoint(clientX: number, clientY: number, rect: {left: number; top: number; width: number; height: number}, width: number, height: number): {x: number; y: number} | null {
  if (![clientX, clientY, rect.left, rect.top, rect.width, rect.height, width, height].every(Number.isFinite) || width <= 0 || height <= 0 || rect.width <= 0 || rect.height <= 0) return null;
  const scale = Math.min(rect.width / width, rect.height / height), w = width * scale, h = height * scale;
  const left = rect.left + (rect.width - w) / 2, top = rect.top + (rect.height - h) / 2;
  if (clientX < left || clientX > left + w || clientY < top || clientY > top + h) return null;
  return {x: Math.round((clientX - left) / w * 1000) / 10, y: Math.round((clientY - top) / h * 1000) / 10};
}
const annotationHeader = '【封面位置批注】';
export function annotationNote(points: CoverAnnotation[], overall: string): string {
  return `${annotationHeader}\n${points.map((point, index) => {
    const location = point.type === 'rect' ? `rect x=${point.x}%, y=${point.y}%, width=${point.width}%, height=${point.height}%` : point.type === 'path' ? `path ${point.points.map(p => `${p.x}%,${p.y}%`).join('; ')}` : `x=${point.x}%, y=${point.y}%`;
    return `${index + 1}. (${location}) ${point.text.replace(/\n/g, '\n  ')}`;
  }).join('\n')}\n【整体修改要求】\n${overall}`;
}
export function readAnnotationNote(note: string): {points: CoverAnnotation[]; overall: string} {
  const fallback = {points: [], overall: note};
  if (!note.startsWith(annotationHeader + '\n')) return fallback;
  const separator = '\n【整体修改要求】\n', split = note.indexOf(separator);
  if (split < 0) return fallback;
  const body = note.slice(annotationHeader.length + 1, split), lines: string[] = [], points: CoverAnnotation[] = [];
  for (const line of body ? body.split('\n') : []) {
    if (line.startsWith('  ') && lines.length) lines[lines.length - 1] += '\n' + line.slice(2);
    else lines.push(line);
  }
  const number = '(\\d+(?:\\.\\d+)?)';
  for (const line of lines) {
    const match = /^(\d+)\. \(([^)]+)\) (.*)$/s.exec(line);
    if (!match || Number(match[1]) !== points.length + 1 || points.length >= 20) return fallback;
    const point = new RegExp(`^x=${number}%, y=${number}%$`).exec(match[2]);
    const rect = new RegExp(`^rect x=${number}%, y=${number}%, width=${number}%, height=${number}%$`).exec(match[2]);
    let mark: CoverAnnotation;
    if (point) mark = {x: Number(point[1]), y: Number(point[2]), text: match[3]};
    else if (rect) mark = {type: 'rect', x: Number(rect[1]), y: Number(rect[2]), width: Number(rect[3]), height: Number(rect[4]), text: match[3]};
    else if (match[2].startsWith('path ')) {
      const coordinates = match[2].slice(5).split('; ');
      if (coordinates.length > annotationPathLimit) return fallback;
      const pairs = coordinates.map(value => new RegExp(`^${number}%,${number}%$`).exec(value));
      if (pairs.some(pair => !pair)) return fallback;
      mark = {type: 'path', points: pairs.map(pair => ({x: Number(pair![1]), y: Number(pair![2])})), text: match[3]};
    } else return fallback;
    if (!validCoverAnnotation(mark)) return fallback;
    points.push(mark);
  }
  return {points, overall: note.slice(split + separator.length)};
}
