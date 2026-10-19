import type {WorkspaceDocument, WorkspaceKind, WorkspaceLibraryPlan, WorkspaceLibrarySnapshot, WorkspacePublication, WorkspaceSchedule} from './workspace-contracts.ts';

export function scheduleDay(schedule: WorkspaceSchedule, timeZone?: string) {
  return schedule.precision === 'instant' ? new Intl.DateTimeFormat('sv-SE', {timeZone: timeZone ?? schedule.timezone, year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(schedule.at)) : schedule.date;
}

export function scheduleMinute(schedule: WorkspaceSchedule, timeZone?: string) {
  if (schedule.precision === 'date') return null;
  if (schedule.precision === 'local-minute') return schedule.time;
  return new Intl.DateTimeFormat('zh-CN', {timeZone: timeZone ?? schedule.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(new Date(schedule.at));
}

export function scheduleForView(schedule: WorkspaceSchedule, timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone): WorkspaceSchedule {
  return schedule.precision === 'instant' ? {...schedule, timezone: timeZone} : schedule;
}

export function compareSchedules(a: WorkspaceSchedule, b: WorkspaceSchedule, timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone) {
  if (a.precision === 'instant' && b.precision === 'instant') return Date.parse(a.at) - Date.parse(b.at);
  return scheduleDay(a, timeZone).localeCompare(scheduleDay(b, timeZone)) || (scheduleMinute(a, timeZone) ?? '99:99').localeCompare(scheduleMinute(b, timeZone) ?? '99:99');
}

export interface PublicationEntry {
  kind: WorkspaceKind;
  document: WorkspaceDocument;
  plan: WorkspaceLibraryPlan;
  publication: WorkspacePublication | null;
  schedule: WorkspaceSchedule;
  day: string;
  channel: string;
}

export function publicationEntries(library: WorkspaceLibrarySnapshot, timeZone?: string, includeCancelled = false): PublicationEntry[] {
  const channels = new Map(library.settings.channels.map(channel => [channel.id, channel.name]));
  const documents = [
    ...library.contentDetails.filter(item => !item.deletedAt && !item.isExample).map(document => ({kind: 'content' as const, document})),
    ...library.collections.filter(item => !item.deletedAt).map(document => ({kind: 'collection' as const, document}))
  ];
  return documents.flatMap(({kind, document}) => {
    const superseded = new Set(document.publicationEvents.map(event => event.targetId));
    const currentRecords = new Map<string, WorkspacePublication>();
    for (const publication of document.publications) if (publication.planId && !superseded.has(publication.id) && !currentRecords.has(publication.planId)) currentRecords.set(publication.planId, publication);
    return document.plans.filter(plan => includeCancelled || plan.status !== 'cancelled').map(plan => {
    const publication = plan.status === 'published' ? currentRecords.get(plan.id) ?? null : null;
    const schedule = scheduleForView(publication?.schedule ?? plan.schedule, timeZone);
    return {kind, document, plan, publication, schedule, day: scheduleDay(schedule, timeZone), channel: publication?.channelName ?? channels.get(plan.channelId) ?? '原渠道已不可用'};
  });}).sort((a, b) => compareSchedules(a.schedule, b.schedule, timeZone));
}
