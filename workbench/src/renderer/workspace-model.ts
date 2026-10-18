export function promptFields(body: string) {
  const fields = new Map<string, { key: string; hint: string }>();
  for (const match of body.matchAll(/\{\{([^{}]+)\}\}/g)) {
    const [name, ...rest] = match[1].split('|');
    const key = name.trim(), hint = rest.join('|').trim();
    if (!fields.has(key) || (!fields.get(key)!.hint && hint)) fields.set(key, { key, hint });
  }
  return [...fields.values()];
}
export function fillPrompt(body: string, values: Record<string, string>) {
  return body.replace(/\{\{([^{}]+)\}\}/g, (_match, inner: string) => {
    const key = inner.split('|')[0].trim();
    return typeof values[key] === 'string' && values[key].trim() ? values[key] : `【待填写：${key}】`;
  });
}
export function localDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function dayDate(day: string) { const [year, month, date] = day.split('-').map(Number); return new Date(year, month - 1, date, 12); }
export function shiftDay(day: string, amount: number) { const date = dayDate(day); date.setDate(date.getDate() + amount); return localDay(date); }

export function pastedPrompt(body: string) {
  const lines = body.split(/\r?\n/);
  const firstLine = lines.find(line => /^\s{0,3}#{1,6}\s+/.test(line)) ?? lines.find(line => line.trim()) ?? '';
  return { title: firstLine.replace(/^\s{0,3}#{1,6}\s+/, '').trim().slice(0, 120) || '导入的提示词', body };
}

export {scheduleDay} from '../shared/publication-view.ts';
