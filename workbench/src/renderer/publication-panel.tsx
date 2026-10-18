import {useEffect, useRef, useState} from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import Card from '@douyinfe/semi-ui-19/lib/es/card';
import type {WorkspaceCoverChoice, WorkspaceKind, WorkspaceLibraryPlan, WorkspacePublication, WorkspaceSchedule} from '../shared/workspace-contracts.ts';
import {ManagementDialog, useManagedDraftGuard, useWorkspaceMutation, type WorkspaceManagementProps} from './library-panels.tsx';
import {localDay, scheduleDay} from './workspace-model.ts';
import {publicationTime, recordingSchedule} from './publication-model.ts';
import {invoke} from './client.ts';
import './publication-workspace.css';

export interface PublicationFocus {kind: WorkspaceKind; id: string; planId?: string; day?: string}
type PublicationSelection = {mode: 'plan' | 'record' | 'correct' | 'retract'; documentId: string; kind: WorkspaceKind; plan?: WorkspaceLibraryPlan; publication?: WorkspacePublication};

export function PublicationPanel(props: WorkspaceManagementProps & {documentId: string | null; kind?: WorkspaceKind; selectedDay?: string; focusedPlanId?: string; newPlanRequest?: number}) {
  const kind = props.kind ?? 'content';
  const document = (kind === 'content' ? props.library?.contentDetails : props.library?.collections)?.find(item => item.id === props.documentId);
  const [dialog, setDialog] = useState<PublicationSelection | null>(null), {mutate, notice} = useWorkspaceMutation(props);
  useManagedDraftGuard(!!dialog);
  const focusRow = useRef<HTMLElement>(null);
  const disabled = props.busy || !!document?.deletedAt || !!dialog;
  useEffect(() => { focusRow.current?.scrollIntoView({block: 'nearest'}); }, [props.focusedPlanId]);
  useEffect(() => {
    if (props.newPlanRequest && document && !document.deletedAt && !dialog) setDialog({mode: 'plan', documentId: document.id, kind});
  }, [props.newPlanRequest]);
  const choose = (selection: Pick<PublicationSelection, 'mode' | 'plan' | 'publication'>) => {
    if (!document || disabled) return;
    setDialog({...selection, documentId: document.id, kind});
  };
  return <div className="workspace-management publication-workspace">
    <Card><div className="publication-heading"><div><h3>发布计划</h3><p>安排渠道和时间，手动发布后回来记录结果。</p></div><Button theme="solid" disabled={disabled || !document} onClick={() => choose({mode: 'plan'})}>＋ 新增发布计划</Button></div>
      {document ? <><div className="publication-summary"><span>{document.plans.filter(plan => plan.status === 'planned').length} 条待发布</span><span>{document.publications.filter(item => !document.publicationEvents.some(event => event.targetId === item.id)).length} 条有效发布记录</span><span>仅保存到本机</span></div>{document.deletedAt && <p className="danger-note">这份内容在回收站中。恢复后可继续安排发布。</p>}
        {document.plans.map(plan => {
          const channel = props.library?.settings.channels.find(item => item.id === plan.channelId);
          const choice = plan.coverChoice;
          const coverId = choice && ('candidateId' in choice ? choice.candidateId : document.coverVariants.find(item => item.id === choice.variantId)?.selectedCandidateId);
          const cover = document.candidates.find(item => item.id === coverId);
          return <article ref={props.focusedPlanId === plan.id ? focusRow : undefined} className={`publication-plan${props.focusedPlanId === plan.id ? ' is-focused' : ''}`} key={plan.id} aria-label={`${channel?.name ?? '原渠道已不可用'}的发布计划`}>
            <div className="publication-plan-main"><div className="publication-plan-heading"><strong>{channel?.name ?? '原渠道已不可用'}{channel?.deletedAt ? '（已停用）' : ''}</strong><span className={`publication-status ${plan.status}`}>{{planned: '待发布', published: '已记录发布', cancelled: '已取消'}[plan.status]}</span></div><p className="publication-plan-time">{publicationTime(plan.schedule)}</p><p className="publication-plan-text">{plan.textMode === 'body' ? document.body || '正文为空' : plan.text === '' ? '这条计划将发布空文字。' : plan.text ?? '发布文字未记录'}</p><p className="muted">{plan.textMode === 'body' ? '使用正文' : '使用这条计划单独保存的文字'} · {plan.coverChoice ? cover ? '已记录封面' : '所选封面暂不可预览' : '这次不记录封面'}</p></div>
            {cover?.url && <img className="publication-cover" src={cover.url} alt="计划使用的封面"/>}
            <div className="management-actions publication-plan-actions">{plan.status !== 'published' && <Button disabled={disabled} onClick={() => choose({mode: 'plan', plan})}>{plan.status === 'cancelled' ? '重新安排' : '编辑计划'}</Button>}{plan.status === 'planned' && <><Button theme="solid" disabled={disabled} onClick={() => choose({mode: 'record', plan})}>记录已发布</Button><Button theme="borderless" disabled={disabled} onClick={() => void mutate({op: 'cancelPublicationPlan', kind, id: document.id, editToken: document.editToken, planId: plan.id})}>取消计划</Button></>}</div>
          </article>;
        })}{!document.plans.length && <div className="publication-empty"><strong>给这篇内容安排第一次发布</strong><p>选一个渠道和日期，也可以为每个渠道准备不同的文字与封面。</p><Button disabled={disabled} onClick={() => choose({mode: 'plan'})}>安排发布</Button></div>}</> : <p className="muted">{props.documentId ? '暂时无法读取这份内容，请从工作台重新读取内容库。' : '先保存内容，再安排发布。'}</p>}
      <p className="creator-footnote">这里的操作不会自动发送内容，也不会修改平台上的帖子。</p><p role="status">{notice}</p>
    </Card>
    {document && <Card><div className="publication-heading"><div><h3>实际发布历史</h3><p>保存发布时的文字、渠道、时间和封面。更正、撤销都会保留原记录。</p></div></div>{document.publications.map(publication => {
      const event = document.publicationEvents.find(item => item.targetId === publication.id), cover = document.candidates.find(item => item.id === publication.coverCandidateId);
      return <article className="publication-history" key={publication.id}><div className="publication-plan-heading"><strong>{publication.channelName ?? '渠道名称未记录'}</strong><span className={`publication-status ${event ? 'cancelled' : 'published'}`}>{event ? event.type === 'corrected' ? '已更正 · 原记录' : '已撤销 · 原记录' : '当前有效'}</span></div><p className="publication-plan-time">实际发布：{publicationTime(publication.schedule)}</p>{publication.url && <Button theme="borderless" disabled={props.busy} onClick={() => void props.run(() => invoke('openPublicationLink', {kind, id: document.id, publicationId: publication.id}))}>查看发布链接 ↗</Button>}<details><summary>查看发布时的内容快照</summary><h4>{publication.title ?? '标题未记录'}</h4><pre>{publication.text === '' ? '（当时发布了空文字）' : publication.text ?? '当时发布的文字未记录'}</pre>{cover?.url ? <img className="publication-history-cover" src={cover.url} alt="发布时记录的封面"/> : <p className="muted">{publication.coverCandidateId ? '当时已记录封面，图片暂不可预览。' : '当时未记录封面。'}</p>}{publication.recordedAt && <p className="muted">本机登记时间：{new Date(publication.recordedAt).toLocaleString('zh-CN')}（本机时区）</p>}</details>{event ? <p className="muted">{event.type === 'corrected' ? '更正' : '撤销'}原因：{event.reason} · {new Date(event.recordedAt).toLocaleString('zh-CN')}（本机时区）</p> : <div className="management-actions"><Button disabled={disabled} onClick={() => choose({mode: 'correct', publication})}>更正记录</Button><Button theme="borderless" disabled={disabled} onClick={() => choose({mode: 'retract', publication})}>撤销记录</Button></div>}</article>;
    })}{!document.publications.length && <p className="publication-empty">还没有实际发布记录。在平台手动发布后，点击计划上的“记录已发布”。</p>}</Card>}
    {dialog && <PublicationEditor key={`${dialog.mode}:${dialog.documentId}:${dialog.plan?.id ?? dialog.publication?.id ?? ''}`} props={props} selection={dialog} initialDay={props.selectedDay ?? localDay(new Date())} close={() => setDialog(null)}/>}
  </div>;
}

function ScheduleEditor({value, change, disabled}: {value: WorkspaceSchedule; change(value: WorkspaceSchedule): void; disabled: boolean}) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return <fieldset disabled={disabled}><div className="management-form"><label>时间精度<select value={value.precision} onChange={event => {
    let day = value.precision === 'instant' ? value.at.slice(0, 10) : value.date;
    if (value.precision === 'instant') {
      try { day = scheduleDay(value); } catch { /* Allow leaving an incomplete timezone field. */ }
    }
    change(event.target.value === 'date' ? {precision: 'date', date: day} : event.target.value === 'local-minute' ? {precision: 'local-minute', date: day, time: '09:00', timezone: zone} : {precision: 'instant', at: new Date().toISOString(), timezone: zone});
  }}><option value="date">只记录日期</option><option value="local-minute">当地日期与时间</option><option value="instant">明确时刻（UTC）</option></select></label>
    {value.precision === 'instant' ? <><label>UTC 时间<input required type="datetime-local" step="1" value={value.at.replace(/Z$/, '').slice(0, 19)} onChange={event => { if (event.target.value) change({...value, at: new Date(`${event.target.value}Z`).toISOString()}); }}/></label><p className="muted">这里填写 UTC 时间；切换到此精度时先填入当前时刻，请核对。下方时区只影响日历中的显示。</p></> : <label>日期<input required type="date" value={value.date} onChange={event => { if (event.target.value) change({...value, date: event.target.value}); }}/></label>}
    {value.precision === 'local-minute' && <label>当地时间<input required type="time" value={value.time} onChange={event => change({...value, time: event.target.value})}/></label>}
    {value.precision !== 'date' && <label>{value.precision === 'instant' ? '显示时区' : '这次发布的时区（留空表示未记录）'}<input required={value.precision === 'instant'} placeholder={`本机时区：${zone}`} value={value.timezone ?? ''} onChange={event => { const timezone = event.target.value; try { if (timezone) new Intl.DateTimeFormat('zh-CN', {timeZone: timezone}); event.target.setCustomValidity(''); } catch { event.target.setCustomValidity('请填写有效时区，例如 Asia/Shanghai。'); } change(value.precision === 'instant' ? {...value, timezone} : {...value, timezone: timezone || null}); }}/></label>}
    {value.precision === 'date' && <p className="muted">只记录日期，不会推定具体时刻或时区。</p>}
  </div></fieldset>;
}

function PublicationEditor({props, selection, initialDay, close}: {props: WorkspaceManagementProps; selection: PublicationSelection; initialDay: string; close(): void}) {
  const current = (selection.kind === 'content' ? props.library?.contentDetails : props.library?.collections)?.find(item => item.id === selection.documentId);
  const [openedDocument] = useState(current), document = current ?? openedDocument;
  const [token] = useState(document?.editToken), [channelId, setChannel] = useState(selection.plan?.channelId ?? document?.channelIds.find(id => props.library?.settings.channels.some(item => item.id === id && !item.deletedAt)) ?? props.library?.settings.channels.find(item => !item.deletedAt)?.id ?? '');
  const [text, setText] = useState(selection.publication?.text ?? selection.plan?.text ?? document?.body ?? '');
  const [schedule, setSchedule] = useState<WorkspaceSchedule>(() => selection.publication?.schedule ?? (selection.mode === 'record' && selection.plan ? recordingSchedule(selection.plan.schedule) : selection.plan?.schedule ?? {precision: 'date', date: initialDay}));
  const [url, setUrl] = useState(selection.publication?.url ?? ''), [reason, setReason] = useState('');
  const initialCover = selection.publication ? selection.publication.coverCandidateId ? `candidate:${selection.publication.coverCandidateId}` : '' : selection.plan?.coverChoice ? 'candidateId' in selection.plan.coverChoice ? `candidate:${selection.plan.coverChoice.candidateId}` : `variant:${selection.plan.coverChoice.variantId}` : '';
  const [cover, setCover] = useState(initialCover), {mutate, notice} = useWorkspaceMutation(props), mode = selection.mode;
  const title = {plan: selection.plan ? '编辑发布计划' : '新增发布计划', record: '记录实际发布', correct: '更正发布记录', retract: '撤销发布记录'}[mode];
  if (!document || !token) return null;
  const unavailable = !current || !!current.deletedAt, coverChoice: WorkspaceCoverChoice = cover.startsWith('candidate:') ? {candidateId: cover.slice(10)} : cover.startsWith('variant:') ? {variantId: cover.slice(8)} : null;
  const knownCover = !cover || document.candidates.some(item => `candidate:${item.id}` === cover) || document.coverVariants.some(item => `variant:${item.id}` === cover);
  return <ManagementDialog title={title} busy={props.busy} close={close}><form className="management-form" onSubmit={event => {
    event.preventDefault(); if (props.busy || unavailable) return;
    const reference = {id: document.id, editToken: token, kind: selection.kind};
    if (mode === 'retract' && selection.publication) void mutate({op: 'retractPublication', ...reference, publicationId: selection.publication.id, reason: reason.trim()}, close);
    else if (mode === 'correct' && selection.publication) void mutate({op: 'correctPublication', ...reference, publicationId: selection.publication.id, reason: reason.trim(), text, schedule, url: url.trim() || null, ...(cover !== initialCover ? {coverChoice} : {})}, close);
    else if (mode === 'record' && selection.plan) void mutate({op: 'recordPublication', ...reference, planId: selection.plan.id, schedule, url: url.trim() || null}, close);
    else if (mode === 'plan') void mutate({op: 'savePublicationPlan', ...reference, plan: {...(selection.plan ? {id: selection.plan.id} : {}), channelId, text, schedule, coverChoice}}, close);
  }}><p className="muted">{document.title} · {mode === 'record' ? '确认已经在平台手动发布，再保存实际时间。文字和封面沿用这条计划，登记后可更正。' : mode === 'retract' ? '撤销只更改本机记录，原记录和原因会保留，关联计划恢复为待发布。' : mode === 'correct' ? '填写实际发布的文字、封面与时间；原记录保留在历史中。' : '只保存安排，请自行到平台发布。'}</p>
    {mode === 'record' && <p className="danger-note">实际时间已按原计划的时间精度填入当前时间，请根据真正的发布时间核对。</p>}
    {unavailable && <p className="danger-note">内容已不可用或进入回收站。填写内容仍保留，请先核对并恢复内容，再重新打开编辑。</p>}
    {token !== document.editToken && <p className="danger-note">内容库已有更新，保存时会核对冲突；本次填写不会自动覆盖库中的新版本。</p>}
    <fieldset disabled={props.busy || unavailable}><div className="management-form">
      {mode === 'plan' && <label>发布渠道<select required value={channelId} onChange={event => setChannel(event.target.value)}><option value="">请选择渠道</option>{props.library?.settings.channels.filter(item => !item.deletedAt || item.id === channelId).map(item => <option key={item.id} value={item.id} disabled={!!item.deletedAt}>{item.name}{item.deletedAt ? '（已停用，请重新选择）' : ''}</option>)}</select></label>}
      {mode !== 'retract' && <ScheduleEditor value={schedule} change={setSchedule} disabled={props.busy || unavailable}/>}
      {(mode === 'plan' || mode === 'correct') && <><label>{mode === 'correct' ? '实际发布的文字' : '准备发布的文字'}<textarea className="management-body" value={text} onChange={event => setText(event.target.value)}/></label><p className="muted">留空表示这次发布空文字；不会自动改用正文。</p><label>{mode === 'correct' ? '实际发布的封面' : '计划使用的封面'}<select value={cover} onChange={event => setCover(event.target.value)}><option value="">这次不记录封面</option>{!knownCover && <option value={cover}>原记录的封面（暂不可用）</option>}{document.candidates.map((item, index) => <option key={item.id} value={`candidate:${item.id}`}>候选 {item.displayNumber || index + 1}{item.favorite ? ' · 收藏' : ''}</option>)}{document.coverVariants.map(item => <option key={item.id} value={`variant:${item.id}`}>{item.name} · {item.ratio}</option>)}</select></label></>}
      {(mode === 'record' || mode === 'correct') && <label>实际发布链接（可留空）<input type="url" value={url} placeholder="https://…" onChange={event => setUrl(event.target.value)}/></label>}
      {(mode === 'correct' || mode === 'retract') && <label>{mode === 'correct' ? '更正原因' : '撤销原因'}<textarea required value={reason} onChange={event => setReason(event.target.value)}/></label>}
    </div></fieldset><p role="status">{notice}</p><Button theme="solid" htmlType="submit" disabled={props.busy || unavailable || ((mode === 'correct' || mode === 'retract') && !reason.trim()) || (mode === 'plan' && (!channelId || !!props.library?.settings.channels.find(item => item.id === channelId)?.deletedAt))}>{mode === 'record' ? '确认已经发布并保存记录' : mode === 'retract' ? '确认撤销这条记录' : '保存到本机'}</Button></form></ManagementDialog>;
}
