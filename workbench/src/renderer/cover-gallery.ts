import type {Attempt, Candidate, CoverJob, CoverView} from '../shared/cover-contracts.ts';

interface CandidateGroup {key: string; job: CoverJob | null; attempt: Attempt | null; candidates: Candidate[]}

export function coverCandidateGroups({jobs, candidates}: Pick<CoverView, 'jobs' | 'candidates'>): CandidateGroup[] {
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
  return groups;
}
