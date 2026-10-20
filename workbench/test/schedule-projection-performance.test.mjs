import test from 'node:test';
import assert from 'node:assert/strict';
import {compareSchedules, publicationEntries, scheduleForView, scheduleMinute} from '../src/shared/publication-view.ts';

const libraryOf = schedules => ({settings: {channels: []}, collections: [], contentDetails: [{id: 'content', deletedAt: null, isExample: false, publications: [], publicationEvents: [], plans: schedules.map((schedule, id) => ({id: String(id), channelId: 'channel', status: 'planned', schedule}))}]});
function observeDefaultZone(t, initial = 'Asia/Shanghai') {
    const original = Intl.DateTimeFormat; let resolutions = 0, zone = initial;
    Intl.DateTimeFormat = new Proxy(original, {construct(target, args) {
        if (!args.length) {resolutions++; return new target(undefined, {timeZone: zone});}
        return Reflect.construct(target, args);
    }});
    t.after(() => {Intl.DateTimeFormat = original;});
    return {count: () => resolutions, zone: next => {zone = next;}};
}

test('a thousand local schedules resolve the default timezone at most once per projection', t => {
    const observation = observeDefaultZone(t);
    const schedules = Array.from({length: 1000}, (_, n) => ({precision: 'local-minute', date: '2026-10-20', time: `${String(n % 24).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`, timezone: 'Asia/Shanghai'}));
    const entries = publicationEntries(libraryOf(schedules));
    assert.equal(entries.length, 1000);
    assert.ok(observation.count() <= 1, `projection resolved the default timezone ${observation.count()} times`);
    const before = observation.count();
    for (const schedule of schedules) {assert.equal(scheduleForView(schedule), schedule); compareSchedules(schedule, schedules[0]);}
    assert.equal(observation.count(), before, 'local/date comparison and projection need no system timezone lookup');
});

test('the next projection observes a changed system timezone without modifying saved instant schedules', t => {
    const observation = observeDefaultZone(t), saved = {precision: 'instant', at: '2026-10-19T23:30:00.000Z', timezone: 'Europe/London'};
    const library = libraryOf([saved]);
    const first = publicationEntries(library)[0];
    observation.zone('America/Los_Angeles');
    const second = publicationEntries(library)[0];
    assert.deepEqual([first.day, first.schedule.timezone, scheduleMinute(first.schedule)], ['2026-10-20', 'Asia/Shanghai', '07:30']);
    assert.deepEqual([second.day, second.schedule.timezone, scheduleMinute(second.schedule)], ['2026-10-19', 'America/Los_Angeles', '16:30']);
    assert.equal(saved.timezone, 'Europe/London');
    assert.equal(observation.count(), 2);
});

test('mixed date, local minute, and repeated DST instants keep existing projected ordering', () => {
    const early = {precision: 'instant', at: '2026-11-01T08:30:00.000Z', timezone: 'Asia/Shanghai'};
    const late = {precision: 'instant', at: '2026-11-01T09:30:00.000Z', timezone: 'Europe/London'};
    const local = {precision: 'local-minute', date: '2026-11-01', time: '01:45', timezone: null};
    const date = {precision: 'date', date: '2026-11-01'};
    const entries = publicationEntries(libraryOf([date, late, local, early]), 'America/Los_Angeles');
    assert.deepEqual(entries.map(entry => entry.plan.id), ['3', '1', '2', '0']);
    assert.deepEqual(entries.map(entry => scheduleMinute(entry.schedule)), ['01:30', '01:30', '01:45', null]);
    assert.deepEqual(entries.map(entry => entry.day), Array(4).fill('2026-11-01'));
    assert.deepEqual(entries.map(entry => entry.schedule.precision), ['instant', 'instant', 'local-minute', 'date']);
});
