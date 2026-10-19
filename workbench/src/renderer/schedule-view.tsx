import type {WorkspaceSchedule} from '../shared/workspace-contracts.ts';

import {scheduleMinute} from '../shared/publication-view.ts';

export function scheduleClock(schedule: WorkspaceSchedule) {
  return scheduleMinute(schedule) ?? '时间待定';
}

export function channelTone(channelId: string, channels: {id: string}[]) {
  const index = channels.findIndex(channel => channel.id === channelId);
  return `channel-tone-${index < 0 ? 0 : index % 5}`;
}
