import assert from 'node:assert/strict';
import test from 'node:test';
import {coverCandidateGroups} from '../src/renderer/cover-gallery.ts';

const candidate = (id, requestId, attemptId) => ({id, requestId, attemptId, assetHash: id, originalName: id, accepted: false, url: `asset://${id}`});
const attempt = (attemptId, status = 'committed') => ({attemptId, host: 'codex', status, reason: 'initial', failure: null});
const job = (id, attempts) => ({id, requestHash: id, inputHash: id, activeAttemptId: attempts.at(-1)?.attemptId ?? null, attempts});

test('browser backup and published snapshot candidates remain visible without invented generation records', () => {
  const candidates = [candidate('imported', 'browser-import', 'source-a'), candidate('published', 'browser-import', 'published-b')];
  const groups = coverCandidateGroups({jobs: [], candidates});
  assert.equal(groups.length, 1);
  assert.equal(groups[0].job, null);
  assert.equal(groups[0].attempt, null);
  assert.deepEqual(groups[0].candidates, candidates);
});

test('mixed histories show each candidate once and match both request and attempt', () => {
  const older = job('older', [attempt('same-attempt')]);
  const newer = job('newer', [attempt('committed'), attempt('active', 'claimed')]);
  const candidates = [candidate('old', older.id, 'same-attempt'), candidate('new', newer.id, 'committed'), candidate('orphan', 'browser-import', 'same-attempt'), candidate('missing-attempt', newer.id, 'missing')];
  const jobs = Object.freeze([older, newer]);
  older.attempts = Object.freeze(older.attempts);
  newer.attempts = Object.freeze(newer.attempts);
  const groups = coverCandidateGroups({jobs, candidates: Object.freeze(candidates)});
  assert.deepEqual(groups.map(group => group.candidates.map(item => item.id)), [['new'], ['old'], ['orphan', 'missing-attempt']]);
  const shown = groups.flatMap(group => group.candidates.map(item => item.id));
  assert.equal(new Set(shown).size, candidates.length);
  assert.equal(groups[0].attempt, newer.attempts[0]);
  assert.equal(groups[2].job, null);
  assert.equal(groups[2].attempt, null);
  assert.deepEqual(jobs.map(item => item.id), ['older', 'newer']);
  assert.equal(newer.activeAttemptId, 'active');
});
