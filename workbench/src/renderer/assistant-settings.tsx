import { useEffect, useRef, useState, type ReactNode } from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import { invoke } from './client.ts';
import {hasManagedDrafts} from './library-panels.tsx';
import { ASSISTANTS } from '../shared/cover-contracts.ts';
import type { Assistant, AssistantSetup } from '../shared/cover-contracts.ts';
import type {TemplateAssistantSetup} from '../shared/template-contracts.ts';
import type { Status } from '../shared/contracts.ts';
export function AssistantSettings({ status, busy, blocked, run, close, children }: { status: Status | null; busy: boolean; blocked: boolean; run<T>(action: () => Promise<T>): Promise<T | undefined>; close(): void; children?: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [closeNotice, setCloseNotice] = useState('');
  const requestClose = () => { if (hasManagedDrafts()) setCloseNotice('有尚未保存的设置或编辑，请先保存，或在对应表单中明确放弃修改。'); else close(); };
  const [setup, setSetup] = useState<AssistantSetup | null>(null);
  const [templateSetup, setTemplateSetup] = useState<TemplateAssistantSetup | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const host = status?.assistant ?? 'codex';
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    let current = true;
    setSetup(null); setTemplateSetup(null);
    setCheckFailed(false);
    void Promise.all([invoke('readAssistantSetup'), invoke('readTemplateAssistantSetup')]).then(([next, template]) => { if (current) { setSetup(next); setTemplateSetup(template); } }, () => { if (current) setCheckFailed(true); });
    return () => { current = false; };
  }, [host]);
  const selectedSetup = setup?.host === host ? setup : null;
  return <dialog ref={dialog} className="leave-dialog settings-dialog" onCancel={event => { event.preventDefault(); requestClose(); }} aria-labelledby="settings-title"><h2 id="settings-title">全局设置</h2>
    <label htmlFor="assistant">使用哪个助手继续任务</label><select id="assistant" value={status?.assistant ?? 'codex'} disabled={busy || blocked || !status} onChange={event => { const host = event.target.value as Assistant; void run(() => invoke('setAssistant', { host })); }}>{ASSISTANTS.map(host => <option key={host} value={host}>{host === 'codex' ? 'Codex（默认）' : 'WorkBuddy'}</option>)}</select>
    <p role="status">{checkFailed ? '检查未完成，请重新检查助手。' : !selectedSetup ? '正在检查助手与配套插件…' : selectedSetup.ready ? '可以交接：已找到助手打开协议与匹配的封面执行 Skill。' : selectedSetup.reason === 'protocol-missing' ? '未找到助手打开协议。请安装并启动所选助手，再重新检查。' : selectedSetup.reason === 'skill-missing' ? '配套插件尚未安装、启用或校验未通过。请在所选助手的插件设置中安装并启用与本工作台配套的 Nova Content Hub 插件，再重新检查。' : '此构建尚未配置助手检查入口。请检查工作台安装。'}</p>
    <p role="status">模板学习与还原：{checkFailed ? '检查未完成' : templateSetup?.host !== host ? '正在检查…' : templateSetup.ready ? '已找到匹配的模板执行 Skill。' : '尚未准备好，请安装并启用包含模板执行能力的配套插件。'}</p>
    <Button id="recheck-assistant" disabled={busy} onClick={() => void run(async () => { const [next, template] = await Promise.all([invoke('readAssistantSetup'), invoke('readTemplateAssistantSetup')]); setSetup(next); setTemplateSetup(template); setCheckFailed(false); })}>重新检查助手</Button>
    <p>检查范围是本机打开协议与已安装的配套 Skill；实际生图能力、接单和结果仍需在助手中执行确认。</p><p>本人照保存在本机内容库。交给助手时，所选本机助手将获准读取这次固定输入；系统请求打开助手后，仍需在助手中确认执行。</p>
    {closeNotice && <p role="alert">{closeNotice}</p>}
    {children}
    <Button id="close-settings" onClick={requestClose}>关闭设置</Button></dialog>;
}
