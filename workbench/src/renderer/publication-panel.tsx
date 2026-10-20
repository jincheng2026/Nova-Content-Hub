import {DataTable, ListToolbar} from './list-primitives.tsx';
import {useEffect, useMemo, useRef, useState} from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import TextArea from '@douyinfe/semi-ui-19/lib/es/input/textarea';
import Input from '@douyinfe/semi-ui-19/lib/es/input';
import Card from '@douyinfe/semi-ui-19/lib/es/card';
import type {WorkspaceDocument, WorkspaceCoverChoice, WorkspaceKind, WorkspaceLibraryPlan, WorkspacePublication, WorkspacePublicationEvent, WorkspaceSchedule} from '../shared/workspace-contracts.ts';
import {ManagementDialog, useManagedDraftGuard, useWorkspaceMutation, type WorkspaceManagementProps} from './library-panels.tsx';
import {localDay, scheduleDay} from './workspace-model.ts';
import {publicationTime, publicationTitle, recordingSchedule} from './publication-model.ts';
import {invoke} from './client.ts';
import {PopupSelect, CalendarDateInput, ClockTimeInput, UtcDateTimeInput} from './semi-controls.tsx';
import './publication-workspace.css';
import {PaginationBar} from './pagination-bar.tsx';
import {channelStyle, channelTone, scheduleClock} from './schedule-view.tsx';
import {compareSchedules} from '../shared/publication-view.ts';

export interface PublicationFocus {kind: WorkspaceKind; id: string; planId?: string; day?: string; action?: 'record' | 'history'}
export type CalendarFocus = PublicationFocus | {day: string; kind?: never; id?: never; planId?: never; action?: never};
export type PublicationSelection = {mode: 'plan' | 'record' | 'correct' | 'retract'; documentId: string; kind: WorkspaceKind; plan?: WorkspaceLibraryPlan; publication?: WorkspacePublication};

export function PublicationPanel(props: WorkspaceManagementProps & {documentId: string | null; kind?: WorkspaceKind; selectedDay?: string; focusedPlanId?: string; focusRequest?: PublicationFocus | null; newPlanRequest?: number}) {
  const kind = props.kind ?? 'content';
  const document = (kind === 'content' ? props.library?.contentDetails : props.library?.collections)?.find(item => item.id === props.documentId);
  const [dialog, setDialog] = useState<PublicationSelection | null>(null), {mutate, notice} = useWorkspaceMutation(props);
  const [planPage, setPlanPage] = useState(1), [planPageSize, setPlanPageSize] = useState(20), [historyPage, setHistoryPage] = useState(1), [historyPageSize, setHistoryPageSize] = useState(20), [query, setQuery] = useState(''), [status, setStatus] = useState('');
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const sortedPlans = useMemo(() => [...(document?.plans ?? [])].sort((a, b) => compareSchedules(a.schedule, b.schedule, timezone) || a.id.localeCompare(b.id)), [document, timezone]);
  const matches = (channel: string | null | undefined, text: string | null | undefined) => `${channel ?? ''} ${text ?? ''}`.toLowerCase().includes(query.trim().toLowerCase());
  const plans = sortedPlans.filter(plan => (!status || plan.status === status) && matches(props.library?.settings.channels.find(channel => channel.id === plan.channelId)?.name, plan.textMode === 'body' ? document?.body : plan.text));
  const historyEvents = useMemo(() => {
    const events = new Map<string, WorkspacePublicationEvent>();
    for (const event of document?.publicationEvents ?? []) if (!events.has(event.targetId)) events.set(event.targetId, event);
    return events;
  }, [document]);
  const effectiveHistoryCount = useMemo(() => document?.publications.filter(item => !historyEvents.has(item.id)).length ?? 0, [document, historyEvents]);
  const sortedHistory = useMemo(() => [...(document?.publications ?? [])].sort((a, b) => compareSchedules(b.schedule, a.schedule, timezone) || b.id.localeCompare(a.id)), [document, timezone]);
  const history = sortedHistory.filter(item => matches(item.channelName, `${item.title ?? ''} ${item.text ?? ''}`));
  const currentPlanPage = Math.min(planPage, Math.max(1, Math.ceil(plans.length / planPageSize))), currentHistoryPage = Math.min(historyPage, Math.max(1, Math.ceil(history.length / historyPageSize)));
  useEffect(() => {setQuery(''); setStatus(''); setHistoryPage(1); const index = sortedPlans.findIndex(plan => plan.id === props.focusedPlanId); setPlanPage(index < 0 ? 1 : Math.floor(index / planPageSize) + 1);}, [props.documentId, document?.id, kind, props.focusedPlanId, props.focusRequest]);
  const focusRow = useRef<HTMLElement>(null);
  const disabled = props.busy || !!document?.deletedAt || !!dialog;
  useEffect(() => { focusRow.current?.scrollIntoView({block: 'nearest'}); }, [props.focusedPlanId, currentPlanPage, props.documentId, kind, query, status, sortedPlans]);
  useEffect(() => {
    if (props.newPlanRequest && kind === 'content' && document && !document.deletedAt && !dialog) setDialog({mode: 'plan', documentId: document.id, kind});
  }, [props.newPlanRequest]);
  const consumedFocus = useRef<PublicationFocus | null>(null);
  useEffect(() => {
    const request = props.focusRequest;
    if (!request || request === consumedFocus.current || request.action !== 'record' || !document || document.deletedAt) return;
    consumedFocus.current = request;
    const plan = document.plans.find(item => item.id === request.planId);
    if (plan?.status === 'planned') setDialog({mode: 'record', documentId: document.id, kind, plan});
  }, [props.focusRequest, document, kind]);
  const [historyFocus, setHistoryFocus] = useState<string | null>(null);
  const [expandedPlans, setExpandedPlans] = useState<string[]>([]), [expandedHistory, setExpandedHistory] = useState<string[]>([]);
  const toggle = (id: string, values: string[], change: (values: string[]) => void) => change(values.includes(id) ? values.filter(value => value !== id) : [...values, id]);
  function showHistory(planId: string) {
    setQuery('');
    const index = sortedHistory.findIndex(item => item.planId === planId && !historyEvents.has(item.id));
    setHistoryPage(index < 0 ? 1 : Math.floor(index / historyPageSize) + 1);
    setHistoryFocus(index < 0 ? null : sortedHistory[index].id);
    requestAnimationFrame(() => window.document.getElementById('publication-history')?.scrollIntoView({block: 'nearest'}));
  }
  const consumedHistory = useRef<PublicationFocus | null>(null);
  useEffect(() => {
    if (props.focusRequest?.action !== 'history' || props.focusRequest === consumedHistory.current || !props.focusRequest.planId) return;
    consumedHistory.current = props.focusRequest;
    showHistory(props.focusRequest.planId);
  }, [props.focusRequest]);
  const choose = (selection: Pick<PublicationSelection, 'mode' | 'plan' | 'publication'>) => {
    if (!document || disabled || kind === 'collection' && selection.mode === 'plan' && !selection.plan) return;
    setDialog({...selection, documentId: document.id, kind});
  };
  return <div className="workspace-management publication-workspace">
    {document && <ListToolbar search={{label: '搜索发布安排与历史', placeholder: '搜索渠道或发布文字', value: query, change: value => {setQuery(value); setPlanPage(1); setHistoryPage(1);}}}><PopupSelect aria-label="筛选计划状态" value={status} onChange={value => {setStatus(value); setPlanPage(1);}}><option value="">全部状态</option><option value="planned">待发布</option><option value="published">已记录发布</option><option value="cancelled">已取消</option></PopupSelect></ListToolbar>}
    <Card><div className="publication-heading"><div><h3>发布计划</h3><p>安排渠道和时间，手动发布后回来记录结果。</p></div>{kind === 'content' && <Button theme="solid" disabled={disabled || !document} onClick={() => choose({mode: 'plan'})}>＋ 新增发布计划</Button>}</div>
      {document ? <><div className="publication-summary"><span>{document.plans.filter(plan => plan.status === 'planned').length} 条待发布</span><span>{effectiveHistoryCount} 条有效发布记录</span><span>仅保存到本机</span></div>{document.deletedAt && <p className="danger-note">这份内容在回收站中。恢复后可继续安排发布。</p>}
        <DataTable className="compact-data-table" rows={plans.slice((currentPlanPage - 1) * planPageSize, currentPlanPage * planPageSize)} total={plans.length} page={currentPlanPage} pageSize={planPageSize} onPageSizeChange={setPlanPageSize} onPageChange={setPlanPage} disabled={props.busy || !!dialog} label="发布计划分页" showHeader={false} hideExpandedColumn expandedRowKeys={expandedPlans} expandedRowRender={(plan, _, expanded) => expanded && plan ? <PlanDetails plan={plan} document={document} kind={kind} props={props} disabled={disabled} text={plan.textMode === 'body' ? document.body : plan.text ?? ''} edit={() => choose({mode: 'plan', plan})} cancel={() => void mutate({op: 'cancelPublicationPlan', kind, id: document.id, editToken: document.editToken, planId: plan.id})}/> : null} columns={[{key: 'plan', render: (_, plan) => {
          const channels = props.library?.settings.channels ?? [], channel = channels.find(item => item.id === plan.channelId);
          const planText = plan.textMode === 'body' ? document.body : plan.text ?? '';
          return <article ref={props.focusedPlanId === plan.id ? focusRow : undefined} data-plan-id={plan.id} data-doc-id={document.id} className={`publication-plan${props.focusedPlanId === plan.id ? ' is-focused' : ''}`} key={plan.id} aria-label={`${channel?.name ?? '原渠道已不可用'}的发布计划`}>
            <div className="publication-compact-row"><time title={publicationTime(plan.schedule)}>{scheduleClock(plan.schedule)}<small>{plan.schedule.precision === 'instant' ? publicationTime(plan.schedule).split(' ')[0] : plan.schedule.date}</small></time><span className={`creator-channel ${channelTone(plan.channelId, channels)}`} style={channelStyle(plan.channelId, channels)}>{channel?.name ?? '原渠道已不可用'}</span><strong className="publication-plan-text" title={publicationTitle(plan, document)}>{publicationTitle(plan, document)}</strong><span className={`publication-status ${plan.status}`}>{{planned: '待发布', published: '✓ 已记录', cancelled: '已取消'}[plan.status]}</span><div className="management-actions">{plan.status === 'planned' && <Button theme="solid" disabled={disabled} onClick={() => choose({mode: 'record', plan})}>记录已发布</Button>}{plan.status === 'published' && <Button theme="borderless" disabled={disabled} onClick={() => showHistory(plan.id)}>查看记录</Button>}</div></div>
            <Button className="publication-plan-expand" theme="borderless" disabled={disabled} aria-expanded={expandedPlans.includes(plan.id)} onClick={() => toggle(plan.id, expandedPlans, setExpandedPlans)}>准备发布与计划详情</Button>
          </article>;
        }}]}/>{document.plans.length > 0 && !plans.length && <p className="muted">没有匹配的发布计划，请调整搜索或状态。</p>}{!document.plans.length && kind === 'content' && <div className="publication-empty"><strong>给这篇内容安排第一次发布</strong><p>选一个渠道和日期，也可以为每个渠道准备不同的文字与封面。</p><Button disabled={disabled} onClick={() => choose({mode: 'plan'})}>安排发布</Button></div>}</> : <p className="muted">{props.documentId ? '暂时无法读取这份内容，请从工作台重新读取内容库。' : '先保存内容，再安排发布。'}</p>}
      <p className="creator-footnote">这里的操作不会自动发送内容，也不会修改平台上的帖子。</p><p role="status">{notice}</p>
    </Card>
    {document && <section id="publication-history"><Card><div className="publication-heading"><div><h3>实际发布历史</h3><p>保存发布时的文字、渠道、时间和封面。更正、撤销都会保留原记录。</p></div></div><DataTable className="compact-data-table" rows={history.slice((currentHistoryPage - 1) * historyPageSize, currentHistoryPage * historyPageSize)} total={history.length} page={currentHistoryPage} pageSize={historyPageSize} onPageSizeChange={setHistoryPageSize} onPageChange={setHistoryPage} disabled={props.busy || !!dialog} label="发布历史分页" showHeader={false} hideExpandedColumn expandedRowKeys={expandedHistory} expandedRowRender={(publication, _, expanded) => expanded && publication ? <PublicationSnapshot publication={publication} coverUrl={document.candidates.find(item => item.id === publication.coverCandidateId)?.url}/> : null} columns={[{key: 'history', render: (_, publication) => {
      const event = historyEvents.get(publication.id), cover = document.candidates.find(item => item.id === publication.coverCandidateId);
      return <article data-publication-id={publication.id} className={`publication-history${historyFocus === publication.id ? ' is-focused' : ''}`} key={publication.id}><div className="publication-plan-heading"><strong>{publication.channelName ?? '渠道名称未记录'}</strong><span className={`publication-status ${event ? 'cancelled' : 'published'}`}>{event ? event.type === 'corrected' ? '已更正 · 原记录' : '已撤销 · 原记录' : '当前有效'}</span></div><p className="publication-plan-time">实际发布：{publicationTime(publication.schedule)}</p>{publication.url && <Button theme="borderless" disabled={props.busy} onClick={() => void props.run(() => invoke('openPublicationLink', {kind, id: document.id, publicationId: publication.id}))}>查看发布链接 ↗</Button>}<Button className="publication-history-expand" theme="borderless" disabled={disabled} aria-expanded={expandedHistory.includes(publication.id)} onClick={() => toggle(publication.id, expandedHistory, setExpandedHistory)}>查看发布时的内容快照</Button>{event ? <p className="muted">{event.type === 'corrected' ? '更正' : '撤销'}原因：{event.reason} · {new Date(event.recordedAt).toLocaleString('zh-CN')}（本机时区）</p> : <div className="management-actions"><Button disabled={disabled} onClick={() => choose({mode: 'correct', publication})}>更正记录</Button><Button theme="borderless" disabled={disabled} onClick={() => choose({mode: 'retract', publication})}>撤销记录</Button></div>}</article>;
    }}]}/>{document.publications.length > 0 && !history.length && <p className="muted">没有匹配的发布记录。</p>}{!document.publications.length && <p className="publication-empty">还没有实际发布记录。在平台手动发布后，点击计划上的“记录已发布”。</p>}</Card></section>}
    {dialog && <PublicationEditor key={`${dialog.mode}:${dialog.documentId}:${dialog.plan?.id ?? dialog.publication?.id ?? ''}`} props={props} selection={dialog} initialDay={props.selectedDay ?? localDay(new Date())} close={() => setDialog(null)}/>}
  </div>;
}

function PlanDetails({plan, document, kind, props, disabled, text, edit, cancel}: {plan: WorkspaceLibraryPlan; document: WorkspaceDocument; kind: WorkspaceKind; props: WorkspaceManagementProps; disabled: boolean; text: string; edit(): void; cancel(): void}) {
  const [notice, setNotice] = useState('');
  const choice = plan.coverChoice;
  const candidateId = choice && ('candidateId' in choice ? choice.candidateId : document.coverVariants.find(item => item.id === choice.variantId)?.selectedCandidateId);
  const cover = document.candidates.find(item => item.id === candidateId);
  return <div className="publication-plan-details"><p className="muted">{publicationTime(plan.schedule)} · {plan.textMode === 'body' ? '使用正文' : '这条计划单独保存的文字'}</p><pre>{text === '' ? '（这条计划发布空文字）' : text}</pre>{cover?.url ? <img className="publication-history-cover" src={cover.url} alt="计划使用的封面"/> : <p className="muted">{choice ? '所选封面暂不可预览' : '这次不记录封面'}</p>}<div className="management-actions"><Button disabled={disabled} onClick={() => void props.run(async () => {await invoke('copyPrompt', {text}); setNotice('已复制这条计划的文字。发布后请记录实际结果。');})}>复制本计划文案</Button>{kind === 'content' && candidateId && cover && <Button disabled={disabled} onClick={() => void props.run(async () => {const result = await invoke('exportCover', {contentId: document.id, candidateId}); if (result.exported) setNotice('本计划封面原图已下载。');})}>下载本计划封面</Button>}{plan.status !== 'published' && <Button disabled={disabled} onClick={edit}>{plan.status === 'cancelled' ? '重新安排' : '编辑计划'}</Button>}{plan.status === 'planned' && <Button theme="borderless" disabled={disabled} onClick={cancel}>取消计划</Button>}</div><p role="status">{notice}</p></div>;
}

function PublicationSnapshot({publication, coverUrl}: {publication: WorkspacePublication; coverUrl: string | null | undefined}) {
  return <div className="publication-snapshot"><h4>{publication.title ?? '标题未记录'}</h4><pre>{publication.text === '' ? '（当时发布了空文字）' : publication.text ?? '当时发布的文字未记录'}</pre>{coverUrl ? <img className="publication-history-cover" src={coverUrl} alt="发布时记录的封面"/> : <p className="muted">{publication.coverCandidateId ? '当时已记录封面，图片暂不可预览。' : '当时未记录封面。'}</p>}{publication.recordedAt && <p className="muted">本机登记时间：{new Date(publication.recordedAt).toLocaleString('zh-CN')}（本机时区）</p>}</div>;
}

function ScheduleEditor({value, change, disabled}: {value: WorkspaceSchedule; change(value: WorkspaceSchedule): void; disabled: boolean}) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return <fieldset disabled={disabled}><div className="management-form"><label>时间精度<PopupSelect disabled={disabled} value={value.precision} onChange={precision => {
    let day = value.precision === 'instant' ? value.at.slice(0, 10) : value.date;
    if (value.precision === 'instant') {
      try { day = scheduleDay(value); } catch { /* Allow leaving an incomplete timezone field. */ }
    }
    change(precision === 'date' ? {precision: 'date', date: day} : precision === 'local-minute' ? {precision: 'local-minute', date: day, time: '09:00', timezone: zone} : {precision: 'instant', at: new Date().toISOString(), timezone: zone});
  }}><option value="date">只记录日期</option><option value="local-minute">当地日期与时间</option><option value="instant">明确时刻（UTC）</option></PopupSelect></label>
    {value.precision === 'instant' ? <><label>UTC 时间<UtcDateTimeInput disabled={disabled} required value={value.at} onChange={at => { if (at) change({...value, at}); }}/></label><p className="muted">这里填写 UTC 时间；切换到此精度时先填入当前时刻，请核对。下方时区只影响日程中的显示。</p></> : <label>日期<CalendarDateInput disabled={disabled} required value={value.date} onChange={date => { if (date) change({...value, date}); }}/></label>}
    {value.precision === 'local-minute' && <label>当地时间<ClockTimeInput disabled={disabled} required value={value.time} onChange={time => change({...value, time})}/></label>}
    {value.precision !== 'date' && <label>{value.precision === 'instant' ? '显示时区' : '这次发布的时区（留空表示未记录）'}<Input className="semi-control-text" disabled={disabled} required={value.precision === 'instant'} placeholder={`本机时区：${zone}`} value={value.timezone ?? ''} onChange={(_, event) => { const timezone = event.target.value; try { if (timezone) new Intl.DateTimeFormat('zh-CN', {timeZone: timezone}); event.target.setCustomValidity(''); } catch { event.target.setCustomValidity('请填写有效时区，例如 Asia/Shanghai。'); } change(value.precision === 'instant' ? {...value, timezone} : {...value, timezone: timezone || null}); }}/></label>}
    {value.precision === 'date' && <p className="muted">只记录日期，不会推定具体时刻或时区。</p>}
  </div></fieldset>;
}

export function PublicationEditor({props, selection, initialDay, close}: {props: WorkspaceManagementProps; selection: PublicationSelection; initialDay: string; close(): void}) {
  useManagedDraftGuard(true);
  const current = (selection.kind === 'content' ? props.library?.contentDetails : props.library?.collections)?.find(item => item.id === selection.documentId);
  const [openedDocument] = useState(current), document = current ?? openedDocument;
  const [token] = useState(document?.editToken), [channelId, setChannel] = useState(selection.plan?.channelId ?? document?.channelIds.find(id => props.library?.settings.channels.some(item => item.id === id && !item.deletedAt)) ?? props.library?.settings.channels.find(item => !item.deletedAt)?.id ?? '');
  const [text, setText] = useState(selection.publication?.text ?? selection.plan?.text ?? document?.body ?? '');
  const [schedule, setSchedule] = useState<WorkspaceSchedule>(() => selection.publication?.schedule ?? (selection.mode === 'record' && selection.plan ? recordingSchedule(selection.plan.schedule) : selection.plan?.schedule ?? {precision: 'local-minute', date: initialDay, time: '09:00', timezone: new Intl.DateTimeFormat().resolvedOptions().timeZone}));
  const [url, setUrl] = useState(selection.publication?.url ?? ''), [reason, setReason] = useState('');
  const initialCover = selection.publication ? selection.publication.coverCandidateId ? `candidate:${selection.publication.coverCandidateId}` : '' : selection.plan?.coverChoice ? 'candidateId' in selection.plan.coverChoice ? `candidate:${selection.plan.coverChoice.candidateId}` : `variant:${selection.plan.coverChoice.variantId}` : '';
  const [cover, setCover] = useState(initialCover), {mutate, notice} = useWorkspaceMutation(props), mode = selection.mode;
  const title = {plan: selection.plan ? '编辑发布计划' : '新增发布计划', record: '记录实际发布', correct: '更正发布记录', retract: '撤销发布记录'}[mode];
  if (!document || !token) return <ManagementDialog title={title} busy={props.busy} dirty={false} close={close}><p role="alert">原内容暂不可用，无法开始这次填写。请关闭后重新读取内容库。</p></ManagementDialog>;
  if (selection.kind === 'collection' && mode === 'plan' && !selection.plan) return <ManagementDialog title={title} busy={props.busy} dirty={false} close={close}><p role="alert">请为单篇内容新增发布计划。已有合集计划仍可编辑和记录。</p></ManagementDialog>;
  const unavailable = !current || !!current.deletedAt, coverChoice: WorkspaceCoverChoice = cover.startsWith('candidate:') ? {candidateId: cover.slice(10)} : cover.startsWith('variant:') ? {variantId: cover.slice(8)} : null;
  const validChannel = !!props.library?.settings.channels.some(item => item.id === channelId && !item.deletedAt);
  const knownCover = !cover || document.candidates.some(item => `candidate:${item.id}` === cover) || document.coverVariants.some(item => `variant:${item.id}` === cover);
  return <ManagementDialog title={title} busy={props.busy} close={close}><form className="management-form" onSubmit={event => {
    event.preventDefault(); if (props.busy || unavailable || mode === 'plan' && !validChannel) return;
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
      {mode === 'plan' && <label>发布渠道<PopupSelect disabled={props.busy || unavailable} required value={channelId} onChange={setChannel}><option value="">请选择渠道</option>{channelId && !props.library?.settings.channels.some(item => item.id === channelId) && <option value={channelId} disabled>原渠道已不可用，请重新选择</option>}{props.library?.settings.channels.filter(item => !item.deletedAt || item.id === channelId).map(item => <option key={item.id} value={item.id} disabled={!!item.deletedAt}>{item.name}{item.deletedAt ? '（已停用，请重新选择）' : ''}</option>)}</PopupSelect></label>}
      {mode !== 'retract' && <ScheduleEditor value={schedule} change={setSchedule} disabled={props.busy || unavailable}/>}
      {(mode === 'plan' || mode === 'correct') && <><label>{mode === 'correct' ? '实际发布的文字' : '准备发布的文字'}<TextArea disabled={props.busy || unavailable} className="semi-control-text management-body" value={text} onChange={value => setText(value)}/></label><p className="muted">留空表示这次发布空文字；不会自动改用正文。</p><label>{mode === 'correct' ? '实际发布的封面' : '计划使用的封面'}<PopupSelect searchable disabled={props.busy || unavailable} value={cover} onChange={setCover}><option value="">这次不记录封面</option>{!knownCover && <option value={cover}>原记录的封面（暂不可用）</option>}{document.candidates.map((item, index) => <option key={item.id} value={`candidate:${item.id}`}>候选 {item.displayNumber || index + 1}{item.favorite ? ' · 收藏' : ''}</option>)}{document.coverVariants.map(item => <option key={item.id} value={`variant:${item.id}`}>{item.name} · {item.ratio}</option>)}</PopupSelect></label></>}
      {(mode === 'record' || mode === 'correct') && <label>实际发布链接（可留空）<Input className="semi-control-text" disabled={props.busy || unavailable} type="url" value={url} placeholder="https://…" onChange={(_, event) => setUrl(event.target.value)}/></label>}
      {(mode === 'correct' || mode === 'retract') && <label>{mode === 'correct' ? '更正原因' : '撤销原因'}<TextArea className="semi-control-text" disabled={props.busy || unavailable} required value={reason} onChange={value => setReason(value)}/></label>}
    </div></fieldset><p role="status">{notice}</p><Button theme="solid" htmlType="submit" disabled={props.busy || unavailable || ((mode === 'correct' || mode === 'retract') && !reason.trim()) || (mode === 'plan' && !validChannel)}>{mode === 'record' ? '确认已经发布并保存记录' : mode === 'retract' ? '确认撤销这条记录' : '保存到本机'}</Button></form></ManagementDialog>;
}
