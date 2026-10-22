import test from 'node:test';
import assert from 'node:assert/strict';
import {assistantSessionURL, taskProgressLabel, taskStatusChanged, mergeTaskProgress} from '../src/shared/task-progress.ts';
const id = '11111111-1111-4111-8111-111111111111';
test('session routes are fixed to the owning host and reject arbitrary paths or URLs', () => {
    assert.equal(assistantSessionURL('codex', id), `codex://threads/${id}`);
    assert.equal(assistantSessionURL('workbuddy', id), `workbuddy://chat/${id}`);
    for (const host of ['codex', 'workbuddy']) for (const input of ['https://example.com', '../another', `${id}?prompt=approve`, '', 'not-a-session']) assert.throws(() => assistantSessionURL(host, input));
    assert.throws(() => assistantSessionURL('unknown', id));
});
for (const host of ['codex', 'workbuddy']) for (const state of ['waiting-user', 'waiting-permission']) test(`${host} ${state} resumes through shared projection while terminal facts win`, () => {
    const progress = {state, phase: 'reading', message: '确认', revision: 1, updatedAt: '2026-10-22T00:00:00.000Z'};
    const attempt = {attemptId: id, host, status: 'created', reason: 'initial', failure: null, progress};
    const jobs = [{id, activeAttemptId: id, attempts: [attempt]}];
    assert.equal(taskProgressLabel(attempt), state === 'waiting-user' ? '待你确认' : '待你允许');
    for (const [status, label] of [['committed', '已完成回传'], ['failed', '失败'], ['cancelled', '已取消'], ['superseded', '已替换']]) assert.equal(taskProgressLabel({...attempt, status}), label);
    const snapshot = {editToken: 'unchanged', jobs: [{id, activeAttemptId: id, attempts: [{attemptId: id, status: 'claimed', progress: {...progress, state: 'running', phase: 'generating'}, progressUnavailable: false}]}]};
    assert.equal(taskStatusChanged(jobs, snapshot), false);
    const merged = mergeTaskProgress(jobs, snapshot);
    assert.equal(merged[0].attempts[0].status, 'claimed');
    assert.equal(merged[0].attempts[0].host, host);
    assert.equal(taskProgressLabel(merged[0].attempts[0]), '助手报告：生成图片');
    snapshot.jobs[0].activeAttemptId = null; snapshot.jobs[0].attempts[0].status = 'committed';
    assert.equal(taskStatusChanged(merged, snapshot), true);
});
