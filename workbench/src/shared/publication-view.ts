import type {WorkspaceDocument, WorkspaceKind, WorkspaceLibraryPlan, WorkspaceLibrarySnapshot, WorkspacePublication, WorkspaceSchedule} from './workspace-contracts.ts';

export function scheduleDay(schedule: WorkspaceSchedule, timeZone?: string) {
  return schedule.precision === 'instant' ? new Intl.DateTimeFormat('sv-SE', {timeZone: timeZone ?? schedule.timezone, year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(schedule.at)) : schedule.date;
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

export function publicationEntries(library: WorkspaceLibrarySnapshot, timeZone?: string): PublicationEntry[] {
  const documents = [
    ...library.contentDetails.filter(item => !item.deletedAt && !item.isExample).map(document => ({kind: 'content' as const, document})),
    ...library.collections.filter(item => !item.deletedAt).map(document => ({kind: 'collection' as const, document}))
  ];
  return documents.flatMap(({kind, document}) => document.plans.filter(plan => plan.status !== 'cancelled').map(plan => {
    const publication = plan.status === 'published' ? document.publications.find(item => item.planId === plan.id && !document.publicationEvents.some(event => event.targetId === item.id)) ?? null : null;
    const schedule = publication?.schedule ?? plan.schedule;
    return {kind, document, plan, publication, schedule, day: scheduleDay(schedule, timeZone), channel: publication?.channelName ?? library.settings.channels.find(item => item.id === plan.channelId)?.name ?? '原渠道已不可用'};
  })).sort((a, b) => a.day.localeCompare(b.day));
}
