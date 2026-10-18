import assert from 'node:assert/strict';
import test from 'node:test';
import {publicationTime, recordingSchedule} from '../src/renderer/publication-model.ts';

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
