import assert from 'node:assert/strict';
import test from 'node:test';
import {coverCandidateGroups, ratioPixels, imageAnnotationPoint, annotationNote, readAnnotationNote, annotationRect, annotationAnchor, validCoverAnnotation, annotationPathLimit, translateAnnotation} from '../src/renderer/cover-gallery.ts';

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

test('favorites are globally first, unique, filterable and keep original batch numbers', () => {
  const candidates = [candidate('old', 'old-job', 'old-attempt'), candidate('new', 'new-job', 'new-attempt'), candidate('imported', 'browser-import', 'unknown')];
  const view = {jobs: [job('old-job', [attempt('old-attempt')]), job('new-job', [attempt('new-attempt')])], candidates};
  const groups = coverCandidateGroups(view, new Set(['old', 'imported']));
  assert.deepEqual(groups.map(group => group.candidates.map(item => item.id)), [['old', 'imported'], ['new']]);
  assert.equal(groups[1].batchNumber, 2);
  assert.equal(groups[1].latest, true);
  assert.deepEqual(coverCandidateGroups(view, new Set(['old']), true).flatMap(group => group.candidates.map(item => item.id)), ['old']);
  assert.deepEqual(coverCandidateGroups(view, new Set(), true), []);
  assert.equal(new Set(groups.flatMap(group => group.candidates.map(item => item.id))).size, 3);
});
test('custom ratios use the same legal integer dimensions and reject unsafe extremes', () => {
  assert.deepEqual(ratioPixels('2:3'), {width: 768, height: 1152});
  assert.deepEqual(ratioPixels('21:9'), {width: 1792, height: 768});
  assert.deepEqual(ratioPixels('6:8'), ratioPixels('3:4'));
  for (const value of ['0:4', '3:0', '3/4', '2:-1', '99999999:1', '100000000:3', '']) assert.equal(ratioPixels(value), null);
});
test('annotations use the actual contained image and reject letterboxing', () => {
  const rect = {left: 10, top: 20, width: 400, height: 400};
  assert.equal(imageAnnotationPoint(50, 30, rect, 800, 400), null);
  assert.deepEqual(imageAnnotationPoint(210, 220, rect, 800, 400), {x: 50, y: 50});
  assert.deepEqual(imageAnnotationPoint(10, 120, rect, 800, 400), {x: 0, y: 0});
  assert.deepEqual(imageAnnotationPoint(410, 320, rect, 800, 400), {x: 100, y: 100});
  assert.equal(imageAnnotationPoint(210, 220, rect, 0, 0), null);
});
test('annotation notes round-trip through the existing note field without losing ordinary notes', () => {
  const points = [{x: 20.5, y: 80, text: '放大标题'}, {x: 100, y: 0, text: '保留边界'}];
  assert.deepEqual(readAnnotationNote(annotationNote(points, '保留人物\n不要加水印')), {points, overall: '保留人物\n不要加水印'});
  assert.deepEqual(readAnnotationNote('原有普通备注'), {points: [], overall: '原有普通备注'});
  assert.deepEqual(readAnnotationNote(annotationNote([], '整体说明')), {points: [], overall: '整体说明'});
  const malformed = '【封面位置批注】\n1. (x=101%, y=0%) 错误\n【整体修改要求】\n不要丢掉';
  assert.deepEqual(readAnnotationNote(malformed), {points: [], overall: malformed});
});


test('large histories index exact attempt pairs without losing candidates', () => {
  const jobs = Array.from({length: 300}, (_, i) => job(`job-${i}`, [attempt('shared')]));
  const candidates = jobs.flatMap((item, i) => Array.from({length: 20}, (_, j) => candidate(`candidate-${i}-${j}`, item.id, 'shared')));
  const groups = coverCandidateGroups({jobs, candidates});
  assert.equal(groups.length, 300);
  assert.equal(groups.flatMap(group => group.candidates).length, 6000);
  assert.equal(groups[0].candidates[0].id, 'candidate-299-0');
  assert.equal(groups.at(-1).candidates.at(-1).id, 'candidate-0-19');
});

test('multi-line annotations preserve original text and cannot forge points or the overall separator', () => {
  const points = [{x: 25, y: 40, text: '颜色淡一点\n下一行\n\n  保留缩进\n2. (x=0%, y=0%) 只是原文\n【整体修改要求】\n只是原文'}, {x: 75, y: 60, text: '  保留空白  '}];
  const overall = '标题不变\n【整体修改要求】\n仍是整体原文';
  const saved = annotationNote(points, overall);
  assert.deepEqual(readAnnotationNote(saved), {points, overall});
  assert.deepEqual(readAnnotationNote('【封面位置批注】\n1. (x=25%, y=40%) 颜色淡一点\n【整体修改要求】\n标题不变'), {points: [{x: 25, y: 40, text: '颜色淡一点'}], overall: '标题不变'});
});


test('mixed point, reverse rectangle and sampled path notes preserve text and percent geometry', () => {
  const rect = {...annotationRect({x: 95.4, y: 90}, {x: 15.1, y: 10.2}), text: '框住标题\n\n  原缩进\n【整体修改要求】\n2. (path 0%,0%; 100%,100%) 只是文字'};
  assert.deepEqual(rect, {type: 'rect', x: 15.1, y: 10.2, width: 80.3, height: 79.8, text: rect.text});
  const points = [{x: 0, y: 100, text: '旧点'}, rect, {type: 'path', points: [{x: 0, y: 0}, {x: 10.5, y: 90}, {x: 100, y: 100}], text: '逐字保留\n\n'}];
  assert.deepEqual(readAnnotationNote(annotationNote(points, '\n整体\n  缩进\n')), {points, overall: '\n整体\n  缩进\n'});
  assert.deepEqual(annotationAnchor(points[2]), {x: 0, y: 0});
  assert.ok(points.every(validCoverAnnotation));
  assert.ok(validCoverAnnotation({type: 'rect', x: 0, y: 0, width: 100, height: 100, text: ''}));
  for (const mark of [
    {x: Infinity, y: 0, text: ''}, {x: 0, y: NaN, text: ''}, {x: -1, y: 0, text: ''},
    {type: 'rect', x: 10, y: 10, width: 91, height: 20, text: ''}, {type: 'rect', x: 0, y: 0, width: 0, height: 20, text: ''},
    {type: 'rect', x: 0, y: 0, width: 10, height: -1, text: ''}, {type: 'unknown', x: 10, y: 10, text: ''},
    {type: 'path', points: [], text: ''}, {type: 'path', points: [{x: 0, y: 0}, {x: 0, y: 0}], text: ''},
    {type: 'path', points: [{x: 0, y: 0}, {x: 101, y: 0}], text: ''},
    {type: 'path', points: Array.from({length: annotationPathLimit + 1}, (_, i) => ({x: i % 100, y: 0})), text: ''}
  ]) assert.equal(validCoverAnnotation(mark), false, JSON.stringify(mark));
});

test('unknown and damaged geometry notes fall back to every original character', () => {
  for (const body of ['1. (rect x=0%, y=0%, width=0%, height=1%) zero', '1. (rect x=99%, y=0%, width=2%, height=1%) overflow', '1. (path 0%,0%; 0%,0%) duplicate', '1. (path 0%,0%; NaN%,1%) nonfinite', '1. (circle x=1%, y=1%) future', '2. (x=1%, y=1%) missing one', '1. (x=1%, y=1%) valid\n\n  damaged', Array.from({length: 21}, (_, i) => `${i + 1}. (x=1%, y=1%) too many`).join('\n')]) {
    const note = `【封面位置批注】\n${body}\n【整体修改要求】\n  保全所有原文\n`;
    assert.deepEqual(readAnnotationNote(note), {points: [], overall: note});
  }
  for (const value of [NaN, Infinity, -1, 0]) assert.equal(imageAnnotationPoint(10, 10, {left: 0, top: 0, width: value, height: 100}, 100, 100), null);
});


test('moving each annotation clamps its whole shape without changing text, size or path spacing', () => {
  const marks = [{x: 10, y: 20, text: '原文\n  缩进'}, {type: 'rect', x: 20, y: 30, width: 25, height: 40, text: '矩形'}, {type: 'path', points: [{x: 10.5, y: 20}, {x: 30.5, y: 40}, {x: 25.5, y: 60}], text: '划线'}];
  const original = structuredClone(marks);
  for (const mark of marks) {
    assert.deepEqual(translateAnnotation(mark, 0, 0), mark);
    for (const [dx, dy] of [[10, 5], [-200, -200], [200, 200]]) {
      const moved = translateAnnotation(mark, dx, dy);
      assert.ok(validCoverAnnotation(moved));
      assert.equal(moved.text, mark.text);
      if (mark.type === 'rect') {assert.equal(moved.width, mark.width); assert.equal(moved.height, mark.height);}
      if (mark.type === 'path') for (let i = 1; i < mark.points.length; i++) {
        assert.equal(moved.points[i].x - moved.points[0].x, mark.points[i].x - mark.points[0].x);
        assert.equal(moved.points[i].y - moved.points[0].y, mark.points[i].y - mark.points[0].y);
      }
      assert.deepEqual(readAnnotationNote(annotationNote([moved], '整体')), {points: [moved], overall: '整体'});
    }
  }
  const precise = {x: 12.123456789, y: 99.987654321, text: '原精度'};
  assert.equal(translateAnnotation(precise, 0, 0), precise);
  assert.equal(annotationNote([translateAnnotation(precise, 0, 0)], ''), annotationNote([precise], ''));
  assert.deepEqual(marks, original);
  assert.deepEqual(translateAnnotation(marks[1], 200, 200), {...marks[1], x: 75, y: 60});
  assert.deepEqual(translateAnnotation(marks[2], -200, -200).points, [{x: 0, y: 0}, {x: 20, y: 20}, {x: 15, y: 40}]);
});
