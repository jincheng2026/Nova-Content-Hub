import type {WorkspaceSchedule} from '../shared/workspace-contracts.ts';
import type {CSSProperties} from 'react';

import {scheduleMinute} from '../shared/publication-view.ts';

export function scheduleClock(schedule: WorkspaceSchedule) {
  return scheduleMinute(schedule) ?? '时间待定';
}

export function channelTone(channelId: string, channels: {id: string}[]) {
  const index = channels.findIndex(channel => channel.id === channelId);
  return `channel-tone-${index < 0 ? 0 : index % 5}`;
}

export function channelStyle(channelId: string, channels: {id: string; ink?: string; bg?: string}[]): CSSProperties {
  const channel = channels.find(item => item.id === channelId);
  const valid = (value?: string) => value && /^#[\da-f]{6}$/i.test(value) ? value : undefined;
  return {'--channel-color': valid(channel?.ink) ?? '#416dac', '--channel-background': valid(channel?.bg) ?? '#edf3fc'} as CSSProperties;
}
