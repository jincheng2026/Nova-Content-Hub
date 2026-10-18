import type { DesktopMethod, DesktopResults, DesktopInputs } from '../shared/contracts.ts';
export async function invoke<K extends DesktopMethod>(method: K, input?: DesktopInputs[K]): Promise<DesktopResults[K]> {
  const reply = await window.contentHub[method](input);
  if (!reply.ok) throw Object.assign(new Error(reply.error.message), { code: reply.error.code });
  return reply.value as DesktopResults[K];
}
