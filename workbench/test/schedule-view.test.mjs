import assert from 'node:assert/strict';
import test from 'node:test';
import {compareSchedules, publicationEntries, scheduleDay, scheduleMinute} from '../src/shared/publication-view.ts';

test('day views order known times and leave date-only time unknown', () => {
  const dateOnly = {precision: 'date', date: '2026-10-19'};
  const afternoon = {precision: 'local-minute', date: '2026-10-19', time: '16:30', timezone: null};
  const morning = {precision: 'instant', at: '2026-10-18T23:45:00.000Z', timezone: 'Asia/Shanghai'};
  assert.equal(scheduleDay(morning), '2026-10-19');
  assert.equal(scheduleMinute(morning), '07:45');
  assert.equal(scheduleMinute(morning, 'America/Los_Angeles'), '16:45');
  assert.equal(scheduleMinute(afternoon), '16:30');
  assert.equal(scheduleMinute(dateOnly), null);
  assert.deepEqual([dateOnly, afternoon, morning].sort(compareSchedules), [morning, afternoon, dateOnly]);
  assert.deepEqual(dateOnly, {precision: 'date', date: '2026-10-19'});
});

test('calendar projection sorts actual publication times and excludes cancelled and example plans', () => {
  const date = '2026-10-19';
  const plan = (id, time, status = 'planned') => ({id, status, channelId: 'channel', schedule: {precision: 'local-minute', date, time, timezone: 'Asia/Shanghai'}});
  const document = {
    id: 'content', deletedAt: null, isExample: false,
    plans: [plan('late', '20:00'), plan('recorded', '19:00', 'published'), plan('early', '08:00'), plan('cancelled', '06:00', 'cancelled')],
    publications: [{id: 'record', planId: 'recorded', channelName: '发布时的渠道', schedule: {precision: 'local-minute', date, time: '07:00', timezone: 'Asia/Shanghai'}}],
    publicationEvents: []
  };
  const library = {contentDetails: [document, {...document, id: 'example', isExample: true}], collections: [], settings: {channels: [{id: 'channel', name: '当前渠道'}]}};
  const entries = publicationEntries(library);
  assert.deepEqual(entries.map(entry => entry.plan.id), ['recorded', 'early', 'late']);
  assert.equal(entries[0].channel, '发布时的渠道');
  assert.equal(scheduleMinute(entries[0].schedule), '07:00');
  assert.equal(document.plans[1].schedule.time, '19:00');
});

test('different source timezones cannot put a later instant first and view projection uses one timezone', () => {
  const earlier = {precision: 'instant', at: '2026-10-19T01:00:00.000Z', timezone: 'Asia/Shanghai'};
  const later = {precision: 'instant', at: '2026-10-19T08:00:00.000Z', timezone: 'America/Los_Angeles'};
  assert(compareSchedules(earlier, later) < 0);
  const plans = [later, earlier].map((schedule, i) => ({id: String(i), status: 'planned', channelId: 'c', schedule}));
  const document = {id: 'd', deletedAt: null, isExample: false, plans, publications: [], publicationEvents: []};
  const entries = publicationEntries({contentDetails: [document], collections: [], settings: {channels: []}}, 'Asia/Shanghai');
  assert.deepEqual(entries.map(entry => entry.schedule.at), [earlier.at, later.at]);
  assert.deepEqual(entries.map(entry => scheduleMinute(entry.schedule)), ['09:00', '16:00']);
  assert.deepEqual(entries.map(entry => entry.day), ['2026-10-19', '2026-10-19']);
  assert.equal(document.plans[0].schedule.timezone, 'America/Los_Angeles');
});
