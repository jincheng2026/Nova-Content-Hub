import type {WorkspaceSchedule, WorkspaceLibraryPlan, WorkspacePublication} from '../shared/workspace-contracts.ts';
import {localDay} from './workspace-model.ts';

export function recordingSchedule(planned: WorkspaceSchedule, now = new Date()): WorkspaceSchedule {
  if (planned.precision === 'date') return {precision: 'date', date: localDay(now)};
  if (planned.precision === 'instant') return {precision: 'instant', at: now.toISOString(), timezone: planned.timezone};
  if (!planned.timezone) return {precision: 'local-minute', date: localDay(now), time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, timezone: null};
  const parts = new Intl.DateTimeFormat('sv-SE', {timeZone: planned.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)!.value;
  return {precision: 'local-minute', date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}`, timezone: planned.timezone};
}

export function publicationTime(schedule: WorkspaceSchedule) {
  if (schedule.precision === 'date') return `${schedule.date} · 仅日期`;
  if (schedule.precision === 'local-minute') return `${schedule.date} ${schedule.time} · ${schedule.timezone ?? '时区未记录'}`;
  return `${new Intl.DateTimeFormat('sv-SE', {timeZone: schedule.timezone, dateStyle: 'short', timeStyle: 'medium', hourCycle: 'h23'}).format(new Date(schedule.at))} · ${schedule.timezone}（明确时刻）`;
}

export function publicationTitle(plan: Pick<WorkspaceLibraryPlan, 'id'> & Partial<Pick<WorkspaceLibraryPlan, 'textMode' | 'text'>>, document: {title: string; body: string}) {
  const text = plan.textMode === 'body' ? document.body : plan.text ?? '';
  return text.trim().split(/\r?\n/).find(line => line.trim())?.trim() || document.title || '未命名内容';
}

export function publicationRecordTitle(publication: Pick<WorkspacePublication, 'text' | 'title'>, fallbackTitle: string) {
  if (publication.text === '') return `（空文字） · ${publication.title || fallbackTitle || '未命名内容'}`;
  return publication.text?.trim().split(/\r?\n/).find(line => line.trim())?.trim() || publication.title || fallbackTitle || '未命名内容';
}
