import type { DesktopMethod, DesktopResults, DesktopInputs, Reply } from '../shared/contracts.ts';
export async function invoke<K extends DesktopMethod>(method: K, input?: DesktopInputs[K]): Promise<DesktopResults[K]> {
  const methods: { [M in DesktopMethod]: (input?: DesktopInputs[M]) => Promise<Reply<DesktopResults[M]>> } = window.contentHub;
  const reply = await methods[method](input);
  if (!reply.ok) throw Object.assign(new Error(reply.error.message), { code: reply.error.code });
  return reply.value;
}
