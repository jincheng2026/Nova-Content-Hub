import assert from 'node:assert/strict';
import test from 'node:test';
import {publicationTime, publicationTitle, publicationRecordTitle, recordingSchedule} from '../src/renderer/publication-model.ts';

test('recording an instant preserves its timezone and precision while using the actual current instant', () => {
  const plan = Object.freeze({precision: 'instant', at: '2026-10-01T12:00:00.000Z', timezone: 'Asia/Shanghai'});
  assert.deepEqual(recordingSchedule(plan, new Date('2026-10-18T23:45:12.000Z')), {precision: 'instant', at: '2026-10-18T23:45:12.000Z', timezone: 'Asia/Shanghai'});
  assert.equal(plan.at, '2026-10-01T12:00:00.000Z');
});

test('local minute records use the planned timezone across a date boundary', () => {
  const now = new Date('2026-10-18T23:45:00.000Z');
  assert.deepEqual(recordingSchedule({precision: 'local-minute', date: '2026-10-01', time: '09:00', timezone: 'Asia/Shanghai'}, now), {precision: 'local-minute', date: '2026-10-19', time: '07:45', timezone: 'Asia/Shanghai'});
  assert.deepEqual(recordingSchedule({precision: 'local-minute', date: '2026-10-01', time: '09:00', timezone: 'America/Los_Angeles'}, now), {precision: 'local-minute', date: '2026-10-18', time: '16:45', timezone: 'America/Los_Angeles'});
});

test('date-only and unzoned local minute records never invent timezone information', () => {
  const now = new Date(2026, 9, 18, 7, 5);
  assert.deepEqual(recordingSchedule({precision: 'date', date: '2026-10-01'}, now), {precision: 'date', date: '2026-10-18'});
  assert.deepEqual(recordingSchedule({precision: 'local-minute', date: '2026-10-01', time: '09:00', timezone: null}, now), {precision: 'local-minute', date: '2026-10-18', time: '07:05', timezone: null});
  assert.equal(publicationTime({precision: 'date', date: '2026-10-18'}), '2026-10-18 · 仅日期');
  assert.equal(publicationTime({precision: 'local-minute', date: '2026-10-18', time: '07:05', timezone: null}), '2026-10-18 07:05 · 时区未记录');
});

test('instant display uses its recorded timezone instead of the machine timezone', () => {
  assert.equal(publicationTime({precision: 'instant', at: '2026-10-18T23:45:12.000Z', timezone: 'Asia/Shanghai'}), '2026-10-19 07:45:12 · Asia/Shanghai（明确时刻）');
});

test('compact titles distinguish plan text and preserve intentional empty text', () => {
  const document = {title: '内容名', body: '正文首行\n后续文字'};
  assert.equal(publicationTitle({id: 'a', textMode: 'explicit', text: '\n  渠道独立标题 \n第二行'}, document), '渠道独立标题');
  assert.equal(publicationTitle({id: 'b', textMode: 'body'}, document), '正文首行');
  assert.equal(publicationTitle({id: 'c', textMode: 'explicit', text: ''}, document), '内容名');
});

test('actual compact titles use the saved snapshot including explicitly empty text', () => {
  assert.equal(publicationRecordTitle({text: '更正后的首行\n更多文字', title: '当时标题'}, '新版内容'), '更正后的首行');
  assert.equal(publicationRecordTitle({text: '', title: '当时标题'}, '新版内容'), '（空文字） · 当时标题');
  assert.equal(publicationRecordTitle({text: null, title: '旧记录标题'}, '新版内容'), '旧记录标题');
});
