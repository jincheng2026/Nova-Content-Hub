import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@douyinfe/semi-ui-19/react19-adapter';
import Banner from '@douyinfe/semi-ui-19/lib/es/banner';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import Card from '@douyinfe/semi-ui-19/lib/es/card';
import Typography from '@douyinfe/semi-ui-19/lib/es/typography';
import '@douyinfe/semi-ui-19/lib/es/_base/base.css';
import './style.css';
import { errorInfo } from '../shared/contracts.ts';
import type { Content, DesktopMethod, DesktopResults, DesktopInputs, Status, TaskStatus, Draft, PendingView, View } from '../shared/contracts.ts';
const labels: Record<TaskStatus, string> = { prepared: '任务已准备，可继续导入', running: '任务仍在运行，可继续导入核验', blocked: '任务遇到阻断，可修复后继续导入', ready: '数据已核验，等待写入新库', publishing: '正在提交新库，可继续导入', committed: '导入已完成' };
async function invoke<K extends DesktopMethod>(method: K, input?: DesktopInputs[K]): Promise<DesktopResults[K]> {
  const reply = await window.contentHub[method](input);
  if (!reply.ok) throw Object.assign(new Error(reply.error.message), { code: reply.error.code });
  return reply.value as DesktopResults[K];
}
function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [contents, setContents] = useState<Content[] | null>(null);
  const [error, setError] = useState('');
  const [acting, setActing] = useState(false);
  const active = useRef(false);
  const [view, setView] = useState<View>('active');
  const [base, setBase] = useState<Content | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftRef = useRef(draft); draftRef.current = draft;
  const [disk, setDisk] = useState<Content | null>(null);
  const [pending, setPending] = useState<PendingView | null>(null);
  const [leaving, setLeaving] = useState<((saved?: boolean) => Promise<void>) | null>(null);
  const savedContent = useRef<Content | null>(null);
  const leaveDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (leaving && leaveDialog.current && !leaveDialog.current.open) leaveDialog.current.showModal(); }, [leaving]);
  const dirty = !!draft && (!base || draft.title !== base.title || draft.body !== base.body);
  const dirtyRef = useRef(false); dirtyRef.current = dirty;
  const report = (failure: unknown) => { const value = errorInfo(failure); setError(`${value.message}（${value.code}）`); };
  const load = (item: Content) => { setBase(item); setDraft({ title: item.title, body: item.body }); setDisk(null); };
  const refreshStatus = async () => { const next = await invoke('status'); setStatus(next); setPending(next.pending); return next; };
  useEffect(() => { void refreshStatus().catch(report); }, []);
  async function refreshEditor() {
    if (!base) return;
    const current = await invoke('readContent', { id: base.id });
    if (current.editToken !== base.editToken) { if (dirty) setDisk(current); else load(current); }
  }
  useEffect(() => { const focus = () => { if (!active.current) void nativeAction(refreshEditor); }; window.addEventListener('focus', focus); return () => window.removeEventListener('focus', focus); });
  useEffect(() => { const prevent = (event: BeforeUnloadEvent) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', prevent); return () => window.removeEventListener('beforeunload', prevent); }, []);
  async function guard(action: (saved?: boolean) => Promise<void>) { if (dirty) setLeaving(() => action); else await action(); }
  async function nativeAction<T>(action: () => Promise<T>): Promise<T | undefined> {
    if (active.current) return;
    active.current = true; setActing(true); setError('');
    try { return await action(); } catch (failure) { report(failure); return undefined; }
    finally { try { await refreshStatus(); } catch (failure) { report(failure); } active.current = false; setActing(false); }
  }
  async function save(): Promise<boolean> {
    if (!draft || disk) return false;
    const submitted = { ...draft };
    const result = await nativeAction(async () => {
      const item = base ? await invoke('updateContent', { id: base.id, editToken: base.editToken, ...submitted }) : await invoke('createContent', submitted);
      // A later writer may have changed the object after commit; keep the submitted draft.
      const unchangedDraft = draftRef.current?.title === submitted.title && draftRef.current?.body === submitted.body;
      if (item.title === submitted.title && item.body === submitted.body) { if (unchangedDraft) load(item); else { setBase(item); setDisk(null); } }
      else { setDisk(item); setBase(item); }
      setContents(await invoke('listContents', { view }));
      savedContent.current = item;
      return unchangedDraft && item.title === submitted.title && item.body === submitted.body;
    });
    return result === true;
  }
  useEffect(() => { const close = () => { void save().then(saved => { if (saved) { dirtyRef.current = false; window.close(); } }); }; window.addEventListener('nova-save-close', close); return () => window.removeEventListener('nova-save-close', close); });
  async function recover(retry = false) {
    await nativeAction(async () => {
      const found = retry ? { mutationId: pending?.mutationId ?? '', op: pending?.op ?? 'createContent', state: 'committed' as const, current: await invoke('retryPendingMutation'), draft: pending?.draft ?? null } : await invoke('queryPendingMutation');
      if (found?.current && found.state === 'committed') {
        if (dirty || (found.draft && (found.draft.title !== found.current.title || found.draft.body !== found.current.body))) { setDisk(found.current); if (!draft && found.draft) setDraft(found.draft); setBase(found.current); }
        else load(found.current);
      } else if (found) { setPending(found); if (found.draft && !draft) { setDraft(found.draft); setBase(found.current); } if (found.current) setDisk(found.current); }
      const next = await refreshStatus(); if (next.currentName) setContents(await invoke('listContents', { view }));
    });
  }
  async function resolve(action: 'keep' | 'saveAs' | 'discard') {
    await nativeAction(async () => {
      const item = await invoke('resolvePendingMutation', { action });
      const next = await invoke('status');
      if (action === 'keep' && !next.pending && item) { if (draft && (draft.title !== item.title || draft.body !== item.body)) { setBase(item); setDisk(item); } else load(item); }
      if (action !== 'keep') { if (item) load(item); else { setBase(null); setDraft(null); setDisk(null); } setContents(await invoke('listContents', { view })); }
    });
  }
  async function select(item: Content) { await guard(async () => { const current = await nativeAction(() => invoke('readContent', { id: item.id })); if (current) load(current); }); }
  async function recycle(item: Content) {
    await guard(async saved => { await nativeAction(async () => { const selected = saved && savedContent.current?.id === item.id ? savedContent.current : item; await invoke(view === 'trash' ? 'restoreContent' : 'trashContent', { id: selected.id, editToken: selected.editToken }); if (base?.id === item.id) { setBase(null); setDraft(null); setDisk(null); } setContents(await invoke('listContents', { view })); }); });
  }
  async function act(method: DesktopMethod) {
    await nativeAction(async () => {
      if (method === 'listContents') { setContents(await invoke('listContents', { view })); await refreshEditor(); }
      else {
        await invoke(method);
        if (method === 'createLibrary' || method === 'openLibrary') { setContents(await invoke('listContents', { view })); setBase(null); setDraft(null); setDisk(null); }
        if (method === 'importBackup' || method === 'resumeImport') { const next = await invoke('status'); if (next.task?.status === 'committed' && !next.task.targetChanged) setContents(await invoke('listContents', { view })); }
      }
    });
  }
  const task = status?.task;
  const busy = acting || !status || status.busy;
  const blocked = !!status?.pending || status?.creating;
  let message = !status ? '正在读取机器绑定…' : acting ? '正在处理。中断后请重新查询同一操作。' : task ? `${labels[task.status]} · 已记录 ${task.progress.steps || 0} 个步骤` : status.started ? '上次导入尚无已接受任务，请核验原目标。' : '明确新建或打开内容库，也可导入旧备份。';
  if (task?.targetChanged) message += '。原内容库位置已被替换，请恢复原目录。';
  if (task?.descriptorChanged) message += '。内容库格式已变更，旧导入完成事实保留。';
  const counts = status?.inspection?.counts;
  return <main data-app="ready" data-loaded={status ? 'true' : 'false'} data-busy={acting ? 'true' : 'false'}>
    <header><p className="eyebrow">NOVA CONTENT HUB / 本地内容工作台</p><Typography.Title heading={1}>本地内容库</Typography.Title><Typography.Paragraph>明确选择一个当前库。保存、回收或恢复；外部修改发生时保留本地草稿。</Typography.Paragraph></header>
    <Banner type="info" closeIcon={null} description="此入口为原生内容生命周期实验；正式授权和助手生成尚未接入。" />
    <Card title="当前内容库"><p id="current-library">{status?.currentName || '尚未打开内容库'}{status?.needsReselect ? ' · 旧绑定缺少目录身份，请明确重选' : ''}</p><div className="actions"><Button id="create-library" disabled={busy || blocked} onClick={() => void guard(() => act('createLibrary'))}>新建内容库</Button><Button id="open-library" disabled={busy || blocked} onClick={() => void guard(() => act('openLibrary'))}>打开内容库</Button></div>{status?.creating && <div><p>新库创建结果待核实；固定原目标，失败目录会保留。</p><Button id="abandon-creation" disabled={busy} onClick={() => void resolve('discard')}>明确放弃这次创建并保留目录</Button></div>}{blocked && <div id="pending"><p>保存结果待核实。提交草稿已保留；核验前不能换库或发起第二笔写入。</p><Button id="query-pending" disabled={busy} onClick={() => void recover()}>核验保存结果</Button>{(pending?.state === 'missing' || status?.creationMissing) && <Button id="retry-pending" disabled={busy} onClick={() => void recover(true)}>明确重试同一操作</Button>}{pending && <><p>状态：{pending.state}</p><Button id="keep-pending" disabled={busy} onClick={() => void resolve('keep')}>保留提交草稿</Button><Button id="save-as-pending" disabled={busy || !pending.draft} onClick={() => void resolve('saveAs')}>将提交草稿另存内容</Button><Button id="discard-pending" disabled={busy} onClick={() => void resolve('discard')}>明确放弃提交并载入磁盘</Button></>}</div>}</Card>
    <Card title={<h2 id="import-heading">导入旧备份</h2>} aria-labelledby="import-heading">
      <div className="actions"><Button id="backup" theme="solid" disabled={busy || blocked || (!!task && task.status !== 'committed')} onClick={() => void act('chooseBackup')}>选择旧备份</Button><Button id="destination" disabled={busy || blocked || !status?.sourceName || !!task} onClick={() => void act('chooseDestination')}>选择新库位置</Button></div>
      <p id="selection">旧备份：{status?.sourceName || '未选择'}　新内容库：{status?.destinationName || '未选择'}</p>
      <div id="preview">{counts && <><p>预检：内容 {counts.contents} · 合集 {counts.collections} · 模板 {counts.templates} · 照片 {counts.photos} · 提示词 {counts.prompts} · 发布 {counts.publications} · 回收项 {counts.trash}</p><p>预检只读；存在内嵌图片不代表已经完整解码。</p>{status.inspection?.warnings.map(warning => <p key={warning.code}>{warning.message}</p>)}</>}</div>
      <div className="actions"><Button id="import" theme="solid" disabled={busy || blocked || !status?.destinationName || !!task} onClick={() => void guard(() => act('importBackup'))}>导入并打开</Button><Button id="resume" disabled={busy || blocked || !task || task.targetChanged} onClick={() => void guard(() => act('resumeImport'))}>{task?.status === 'committed' ? '打开导入结果' : '继续导入'}</Button><Button id="refresh" disabled={acting} onClick={() => void act('status')}>查询状态</Button><Button id="list" disabled={busy || (!status?.currentName && task?.status !== 'committed') || task?.targetChanged} onClick={() => void act('listContents')}>查看内容</Button></div>
      <p id="status" role="status" aria-live="polite">{message}</p><p id="error" role="alert">{error}</p>
      <ul id="issues">{!!task?.issues.length && <li>有 {task.issues.length} 项待确认；缺失资源保留了记录。</li>}{task?.issues.slice(0, 50).map((issue, index) => <li key={index}>{issue.code || '资源待补齐'}{issue.key ? ` · ${issue.key}` : ''}</li>)}</ul>
    </Card>
    <Card title={<h2 id="content-heading">内容列表</h2>} aria-labelledby="content-heading"><div className="actions"><Button id="new-content" disabled={busy || !status?.currentName || blocked} onClick={() => void guard(async () => { setBase(null); setDraft({ title: '未命名内容', body: '' }); setDisk(null); })}>新建内容</Button><Button id="active-view" disabled={busy || !status?.currentName} onClick={() => void nativeAction(async () => { setView('active'); setContents(await invoke('listContents', { view: 'active' })); })}>活动内容</Button><Button id="trash-view" disabled={busy || !status?.currentName} onClick={() => void nativeAction(async () => { setView('trash'); setContents(await invoke('listContents', { view: 'trash' })); })}>回收站</Button><Button id="refresh-contents" disabled={busy || !status?.currentName} onClick={() => void act('listContents')}>刷新内容与磁盘版本</Button></div><div id="contents">{contents === null ? <p>打开内容库后可查看内容。</p> : contents.length === 0 ? <p>当前视图没有内容。</p> : contents.map(item => <details key={item.id} data-content-id={item.id}><summary>{item.title}</summary><pre>{item.body || '（基础正文为空；旧渠道文案保存在各自发布计划中。）'}</pre><Button onClick={() => void select(item)}>打开编辑</Button><Button disabled={busy || blocked} onClick={() => void recycle(item)}>{view === 'trash' ? '恢复内容' : '移入回收站'}</Button></details>)}</div></Card>
    {draft && <Card title="内容编辑器"><p id="dirty-state">{dirty ? '有未保存草稿' : '已保存'}{base?.deletedAt ? ' · 此内容在回收站' : ''}</p><label htmlFor="content-title">标题</label><input id="content-title" disabled={busy || blocked} maxLength={500} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /><label htmlFor="content-body">正文</label><textarea id="content-body" disabled={busy || blocked} maxLength={1_000_000} value={draft.body} onChange={event => setDraft({ ...draft, body: event.target.value })} /><div className="actions"><Button id="save-content" theme="solid" disabled={busy || !dirty || blocked || !!disk || !!base?.deletedAt} onClick={() => void save()}>保存内容</Button><Button id="save-as-content" disabled={busy || blocked} onClick={() => { setBase(null); setDisk(null); }}>将当前草稿另存内容</Button></div>{disk && <section id="conflict" role="alert"><h3>磁盘版本与本地草稿</h3><p>磁盘标题：{disk.title}</p><pre id="disk-body">{disk.body}</pre><p>本地草稿：{draft.title}</p><pre id="local-body">{draft.body}</pre><Button id="keep-draft" onClick={() => setDisk(disk)}>保留当前草稿</Button><Button id="discard-draft" disabled={!!status?.pending} onClick={() => load(disk)}>明确放弃草稿并载入磁盘</Button></section>}</Card>}
    {leaving && <dialog ref={leaveDialog} className="leave-dialog" onCancel={() => setLeaving(null)} aria-modal="true" aria-labelledby="leave-title"><h3 id="leave-title">草稿尚未保存</h3><p>保存后继续、明确放弃，或留在当前内容。</p><Button id="leave-save" disabled={busy || !!status?.pending} onClick={() => { void save().then(async saved => { if (saved) { setLeaving(null); await leaving(true); } }); }}>保存后继续</Button><Button id="leave-discard" disabled={!!status?.pending} onClick={() => { const action = leaving; setLeaving(null); setDraft(null); setBase(null); setDisk(null); void action(false); }}>放弃后继续</Button><Button id="leave-stay" onClick={() => setLeaving(null)}>留在当前内容</Button></dialog>}
  </main>;
}
const root = document.getElementById('root');
if (!root) throw new Error('Renderer root is missing');
createRoot(root).render(<App />);
