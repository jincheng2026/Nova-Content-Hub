import { useEffect, useRef } from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import { invoke } from './client.ts';
import { ASSISTANTS } from '../shared/cover-contracts.ts';
import type { Assistant } from '../shared/cover-contracts.ts';
import type { Status } from '../shared/contracts.ts';
export function AssistantSettings({ status, busy, blocked, run, close }: { status: Status | null; busy: boolean; blocked: boolean; run<T>(action: () => Promise<T>): Promise<T | undefined>; close(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="leave-dialog" onCancel={close} aria-labelledby="settings-title"><h2 id="settings-title">全局设置</h2>
    <label htmlFor="assistant">使用哪个助手继续任务</label><select id="assistant" value={status?.assistant ?? 'codex'} disabled={busy || blocked} onChange={event => { const host = event.target.value as Assistant; void run(() => invoke('setAssistant', { host })); }}>{ASSISTANTS.map(host => <option key={host} value={host}>{host === 'codex' ? 'Codex（默认）' : 'WorkBuddy'}</option>)}</select>
    <p>宿主安装、插件连接与生图能力：尚未验证。此选择只保存使用偏好。</p><p>本人照保存在本机内容库。交给助手时，所选本机助手将获准读取这次固定输入；系统请求打开助手后，仍需在助手中确认执行。</p>
    <Button id="close-settings" onClick={close}>关闭设置</Button></dialog>;
}
