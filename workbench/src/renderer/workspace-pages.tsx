import { useEffect, useRef, useState } from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import Card from '@douyinfe/semi-ui-19/lib/es/card';
import Input from '@douyinfe/semi-ui-19/lib/es/input';
import TextArea from '@douyinfe/semi-ui-19/lib/es/input/textarea';
import Checkbox from '@douyinfe/semi-ui-19/lib/es/checkbox';
import Calendar from '@douyinfe/semi-ui-19/lib/es/calendar';
import DatePicker from '@douyinfe/semi-ui-19/lib/es/datePicker';
import Select from '@douyinfe/semi-ui-19/lib/es/select';
import LocaleProvider from '@douyinfe/semi-ui-19/lib/es/locale/localeProvider';
import zhCN from '@douyinfe/semi-ui-19/lib/es/locale/source/zh_CN';
import './semi-calendar.css';
import {PopupSelect} from './semi-controls.tsx';
import type { Content, DesktopResults } from '../shared/contracts.ts';
import type { CoverResults, TemplateGroup } from '../shared/cover-contracts.ts';
import { invoke } from './client.ts';
import { dayDate, localDay, pastedPrompt, promptFields, promptPreview, scheduleDay, shiftDay } from './workspace-model.ts';
import type {WorkspaceLibraryPrompt, WorkspaceLibrarySnapshot, WorkspaceLibraryTemplate, WorkspaceTemplateImage, WorkspaceKind} from '../shared/workspace-contracts.ts';
import {ManagementDialog, hasManagedDrafts, useManagedDraftGuard, useWorkspaceMutation, type WorkspaceManagementProps} from './library-panels.tsx';
import './workspace-management.css';
import './creator-pages.css';
import './creator-dashboard.css';
import './creator-templates.css';
import {channelStyle, channelTone, scheduleClock} from './schedule-view.tsx';
import './prompt-workspace.css';
import {TemplateWorkflowPanel} from './template-workflow-panel.tsx';
import {compareSchedules, publicationEntries, scheduleForView} from '../shared/publication-view.ts';
import {PublicationPanel, type PublicationFocus} from './publication-panel.tsx';
import {publicationTime} from './publication-model.ts';
export type Page = 'overview' | 'templates' | 'content' | 'calendar' | 'prompts';
export const pageNames: Record<Page, string> = { overview: '总览', templates: '模板', content: '内容', calendar: '日程', prompts: '提示词' };
type Snapshot = DesktopResults['readWorkspace'];
type Prompt = Snapshot['prompts'][number];
interface Props { workspace: Snapshot | null; open(item: Content): void; busy: boolean }
function scheduled(workspace: Snapshot | null, library?: WorkspaceLibrarySnapshot | null) {
  const entries = library ? publicationEntries(library).map(entry => ({content: entry.document, kind: entry.kind, plan: {...entry.plan, schedule: entry.schedule}, day: entry.day, channel: entry.channel})) : (workspace?.contents ?? []).filter(item => !item.deletedAt).flatMap(content => content.plans.filter(plan => plan.status !== 'cancelled').map(plan => ({content, kind: 'content' as const, plan: {...plan, schedule: scheduleForView(plan.schedule)}, day: scheduleDay(scheduleForView(plan.schedule)), channel: workspace?.channels.find(item => item.id === plan.channelId)?.name ?? '原渠道已不可用'})));
  return entries.sort((a, b) => compareSchedules(a.plan.schedule, b.plan.schedule));
}
function overviewCover(contentId: string, kind: WorkspaceKind, workspace: Snapshot | null, library: WorkspaceLibrarySnapshot | null, planId?: string) {
  const document = kind === 'collection' ? library?.collections.find(item => item.id === contentId) : library?.contentDetails.find(item => item.id === contentId);
  const plan = document?.plans.find(plan => plan.id === planId);
  const publication = plan?.status === 'published' ? document?.publications.find(item => item.planId === plan.id && !document.publicationEvents.some(event => event.targetId === item.id)) : null;
  const choice = plan?.coverChoice;
  const selectedId = publication ? publication.coverCandidateId : choice && 'candidateId' in choice ? choice.candidateId : choice && 'variantId' in choice ? document?.coverVariants.find(variant => variant.id === choice.variantId)?.selectedCandidateId : !planId && kind === 'content' ? workspace?.contents.find(item => item.id === contentId)?.selectedCandidateId : null;
  const candidate = document?.candidates.find(item => item.id === selectedId);
  return {id: selectedId ?? null, url: candidate?.url ?? null};
}
export function Overview({workspace, library, open, openCollection, busy, createContent, openTemplates, openCalendar, generate}: Props & {library: WorkspaceLibrarySnapshot | null; openCollection?(focus?: PublicationFocus): void; createContent?(): void; openTemplates?(): void; openCalendar?(focus?: PublicationFocus): void; generate?(item: Content): void}) {
  const [notice, setNotice] = useState(''), [working, setWorking] = useState(false);
  const now = new Date(), today = localDay(now), tomorrow = shiftDay(today, 1), weekStart = shiftDay(today, -(now.getDay() + 6) % 7), weekEnd = shiftDay(weekStart, 6);
  const items = workspace?.contents.filter(item => !item.deletedAt && !library?.contentDetails.find(detail => detail.id === item.id)?.isExample) ?? [];
  const recent = [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const collections = library?.collections.filter(item => !item.deletedAt) ?? [];
  const plans = scheduled(workspace, library).filter(item => item.kind === 'collection' || items.some(content => content.id === item.content.id));
  const upcoming = plans.filter(item => item.plan.status === 'planned' && item.day >= today), overdue = plans.filter(item => item.plan.status === 'planned' && item.day < today);
  const weekPlans = plans.filter(item => item.day >= weekStart && item.day <= weekEnd), todayPlans = plans.filter(item => item.day === today), todayDone = todayPlans.filter(item => item.plan.status === 'published').length;
  const next = upcoming[0], featured = next?.content ?? recent[0], featuredKind = next?.kind ?? 'content';
  const cover = featured ? overviewCover(featured.id, featuredKind, workspace, library, next?.plan.id) : null;
  const detail = featuredKind === 'collection' ? library?.collections.find(item => item.id === featured?.id) : library?.contentDetails.find(item => item.id === featured?.id);
  const featuredPlan = detail?.plans.find(item => item.id === next?.plan.id);
  const text = featuredPlan?.textMode === 'explicit' ? featuredPlan.text ?? '' : featured?.body ?? '';
  const noPlannedCover = !!featuredPlan && featuredPlan.coverChoice === null;
  const emptyPlanText = featuredPlan?.textMode === 'explicit' && featuredPlan.text === '';
  const needsCover = items.filter(item => !item.selectedCandidateId && !item.candidateCount), needsSelection = items.filter(item => !item.selectedCandidateId && item.candidateCount > 0);
  const noPlan = items.filter(item => !item.plans.some(plan => plan.status !== 'cancelled'));
  const disabled = busy || working;
  const openFeatured = () => { if (featured) { if (featuredKind === 'collection') openCollection?.({kind: 'collection', id: featured.id, planId: next?.plan.id, day: next?.day}); else open(featured); } };
  const channels = library?.settings.channels ?? workspace?.channels ?? [];
  const todos = [{label: '选一张封面', count: needsSelection.length, note: needsSelection[0]?.title, enabled: true, action: () => needsSelection[0] && open(needsSelection[0])}, {label: '准备内容封面', count: needsCover.length, note: needsCover[0]?.title, enabled: true, action: () => {if (needsCover[0]) (generate ?? open)(needsCover[0]);}}, {label: '核对逾期计划', count: overdue.length, note: '发布后补记实际记录', enabled: !!openCalendar, action: () => {const entry = overdue[0]; if (entry) openCalendar?.({kind: entry.kind, id: entry.content.id, planId: entry.plan.id, day: entry.day});}}, {label: '安排发布日程', count: noPlan.length, note: noPlan[0]?.title, enabled: !!openCalendar, action: () => noPlan[0] && openCalendar?.({kind: 'content', id: noPlan[0].id})}].filter(item => item.count > 0);
  async function copyText() {
    if (!featured || disabled) return;
    setWorking(true);
    try { await invoke('copyPrompt', {text}); setNotice('已复制发布文字；发布完成后，请到日程记录已发布。'); }
    catch { setNotice('复制未完成，请打开内容后手动复制。'); }
    finally { setWorking(false); }
  }
  async function downloadCover() {
    if (!featured || featuredKind !== 'content' || !cover?.id || disabled) return;
    setWorking(true);
    try { const result = await invoke('exportCover', {contentId: featured.id, candidateId: cover.id}); if (result.exported) setNotice('封面原图已保存到所选位置。'); }
    catch { setNotice('封面下载未完成，请打开内容后重试。'); }
    finally { setWorking(false); }
  }
  return <section className="workspace-page creator-overview">
    <header className="creator-overview-heading"><h2>{new Intl.DateTimeFormat('zh-CN', {month: 'long', day: 'numeric', weekday: 'long'}).format(now)}</h2><div className="creator-today-progress"><strong>今天 {todayDone}/{todayPlans.length} 已发</strong><progress value={todayDone} max={Math.max(todayPlans.length, 1)} aria-label={`今天 ${todayPlans.length} 条安排，已发布 ${todayDone} 条`}/></div><div className="creator-week" aria-label="本周发布安排">{Array.from({length: 7}, (_, index) => {const day = shiftDay(weekStart, index), dayPlans = weekPlans.filter(item => item.day === day); return <button key={day} className={day === today ? 'is-today' : ''} disabled={disabled || !openCalendar} onClick={() => {const entry = dayPlans[0]; openCalendar?.(entry ? {kind: entry.kind, id: entry.content.id, planId: entry.plan.id, day} : undefined);}} aria-label={`${day}，${dayPlans.length} 条安排`}><span>{['一', '二', '三', '四', '五', '六', '日'][index]}</span><strong>{dayPlans.length}</strong></button>;})}</div></header>
    <div className="creator-overview-layout"><div className="creator-overview-main">
      <section className="creator-panel creator-featured" aria-label={next ? '下一条发布' : '继续创作'}>
        {featured ? <><div className="creator-featured-content"><button className="creator-featured-cover" disabled={disabled || featuredKind === 'collection' && !openCollection} onClick={openFeatured} aria-label={`打开 ${featured.title || '未命名内容'}`}>{cover?.url ? <><img className="creator-image-backdrop" src={cover.url} alt="" aria-hidden="true"/><img src={cover.url} alt={`${featured.title || '未命名内容'}的所选封面`}/></> : <span><span className="creator-cover-symbol" aria-hidden="true">▧</span><strong>{cover?.id ? '封面预览暂不可用' : noPlannedCover ? '本次不记录封面' : '封面还没选好'}</strong><small>{featuredKind === 'collection' ? '打开合集查看封面' : '打开内容，继续制作'}</small></span>}</button><div className="creator-featured-copy"><div className="creator-next-meta"><strong>{next ? '下一条' : '继续创作'}</strong>{next && <><time title={publicationTime(next.plan.schedule)}>{scheduleClock(next.plan.schedule)}</time><span className={`creator-channel ${channelTone(next.plan.channelId, channels)}`} style={channelStyle(next.plan.channelId, channels)}>{next.channel}</span><span>{next.day === today ? '今天' : next.day === tomorrow ? '明天' : next.day}</span></>}</div><h3>{featured.title || '未命名内容'}</h3><p className="creator-body-excerpt">{text || (emptyPlanText ? '这条计划设为发布空文字。' : '正文还留着空白，打开内容把这次的想法写下来。')}</p><div className="creator-featured-actions"><Button disabled={disabled || !text} onClick={() => void copyText()}>复制文案</Button>{featuredKind === 'content' && cover?.id && <Button disabled={disabled} onClick={() => void downloadCover()}>下载图片</Button>}{next && openCalendar ? <Button theme="solid" disabled={disabled} onClick={() => openCalendar({kind: featuredKind, id: featured.id, planId: next.plan.id, day: next.day})}>记录已发布</Button> : <Button theme="solid" disabled={disabled || featuredKind === 'collection' && !openCollection} onClick={openFeatured}>继续编辑</Button>}</div><div className="creator-featured-links"><Button theme="borderless" disabled={disabled || featuredKind === 'collection' && !openCollection} onClick={openFeatured}>打开{featuredKind === 'collection' ? '合集' : '内容'}</Button>{featuredKind === 'content' && !cover?.id && !noPlannedCover && generate && <Button theme="borderless" disabled={disabled} onClick={() => generate(featured)}>制作封面</Button>}{!next && openCalendar && <Button theme="borderless" disabled={disabled} onClick={() => openCalendar({kind: featuredKind, id: featured.id})}>安排日程</Button>}</div></div></div></> : <div className="creator-empty"><span className="creator-empty-icon" aria-hidden="true">▤</span><h3>把第一个想法写下来</h3><p>先保存标题和正文，再选择模板、制作封面。</p>{createContent && <Button theme="solid" disabled={disabled || !workspace} onClick={createContent}>新建第一篇内容</Button>}</div>}
      </section>
      <section className="creator-panel creator-queue"><div className="creator-panel-heading"><h3>今天</h3><span className="creator-small-label">{todayPlans.length ? `${todayPlans.length - todayDone} 条待发布` : '暂无安排'}</span>{openCalendar && <Button theme="borderless" disabled={disabled} onClick={() => openCalendar()}>查看日程 →</Button>}</div><div className="creator-queue-list">{[today, tomorrow].map(day => {const entries = plans.filter(item => item.day === day && item.plan.id !== next?.plan.id); return <div key={day}>{day === tomorrow && <h4>明天 <span>{day.slice(5)}</span></h4>}{entries.map(entry => {const image = overviewCover(entry.content.id, entry.kind, workspace, library, entry.plan.id); return <button className={`creator-queue-row ${entry.plan.status}`} key={`${entry.kind}:${entry.content.id}:${entry.plan.id}`} disabled={disabled || !openCalendar} onClick={() => openCalendar?.({kind: entry.kind, id: entry.content.id, planId: entry.plan.id, day})}><time title={publicationTime(entry.plan.schedule)}>{scheduleClock(entry.plan.schedule)}</time><span className="creator-queue-image">{image.url ? <img src={image.url} alt="" loading="lazy"/> : '▧'}</span><span className="creator-queue-copy"><span className={`creator-channel ${channelTone(entry.plan.channelId, channels)}`} style={channelStyle(entry.plan.channelId, channels)}>{entry.channel}</span><strong>{entry.content.title || '未命名内容'}</strong></span><span className="creator-queue-status">{entry.plan.status === 'published' ? '✓ 已发布' : '查看计划'} <span aria-hidden="true">›</span></span></button>;})}{!entries.length && <p className="creator-queue-empty">{day === today && next?.day === today ? '下一条已在上方，今天没有其他安排。' : day === tomorrow && next?.day === tomorrow ? '下一条已在上方。' : '暂无发布安排'}</p>}</div>;})}</div></section>
    </div><aside className="creator-overview-side">
      <section className="creator-panel"><div className="creator-panel-heading"><h3>要处理</h3><span className="creator-small-label">{todos.length} 项</span></div><div className="creator-attention">{todos.map(item => <button key={item.label} disabled={disabled || !item.enabled} onClick={item.action}><span><strong>{item.label}</strong><small>{item.note || '未命名内容'}</small></span><b>{item.count}<span aria-hidden="true"> ›</span></b></button>)}{!todos.length && <div className="creator-calm-state"><span aria-hidden="true">✓</span><p>{items.length ? '当前没有待处理事项' : '新建内容后，下一步会出现在这里'}</p></div>}</div></section>
      <section className="creator-panel"><div className="creator-panel-heading"><h3>内容项目</h3><span className="creator-small-label">{items.length} 篇 · {collections.length} 个合集</span></div><div className="creator-recent">{collections.slice(0, 3).map(item => {const entries = plans.filter(entry => entry.kind === 'collection' && entry.content.id === item.id), done = entries.filter(entry => entry.plan.status === 'published').length; return <button key={item.id} disabled={disabled || !openCollection} onClick={() => openCollection?.({kind: 'collection', id: item.id})}><span className="creator-recent-cover" aria-hidden="true">▤</span><span><strong>{item.title || '未命名合集'} <em>合集</em></strong><small>{item.memberIds.length} 篇内容 · 已发 {done}/{entries.length}</small></span><span aria-hidden="true">›</span></button>;})}{recent.slice(0, 4).map(item => {const image = overviewCover(item.id, 'content', workspace, library), entries = plans.filter(entry => entry.kind === 'content' && entry.content.id === item.id), done = entries.filter(entry => entry.plan.status === 'published').length; return <button key={item.id} disabled={disabled} onClick={() => open(item)}><span className="creator-recent-cover">{image.url ? <img src={image.url} alt="" loading="lazy"/> : <span aria-hidden="true">▤</span>}</span><span><strong>{item.title || '未命名内容'}</strong><small>{item.selectedCandidateId ? '已选封面' : item.candidateCount ? '待选封面' : '待做封面'} · {entries.length ? `已发 ${done}/${entries.length}` : '尚未安排发布'}</small></span><span aria-hidden="true">›</span></button>;})}{!recent.length && !collections.length && <p className="creator-side-empty">还没有自己的内容。</p>}</div></section>
      {openTemplates && <button className="creator-template-shortcut" disabled={disabled} onClick={openTemplates}><span className="creator-shortcut-icon" aria-hidden="true">▧</span><span><strong>为内容找个好风格</strong><small>浏览模板，准备下一张封面</small></span><span aria-hidden="true">↗</span></button>}
    </aside></div>{notice && <p className="creator-action-notice" role="status">{notice}</p>}
  </section>;
}
export function CalendarPage(props: Props & WorkspaceManagementProps & {initialContentId?: string | null; initialFocus?: PublicationFocus | null}) {
  const {workspace, busy, library} = props;
  const [focus, setFocus] = useState<PublicationFocus | null>(() => props.initialFocus ?? (props.initialContentId ? {kind: 'content', id: props.initialContentId} : null));
  const [selected, setSelected] = useState(props.initialFocus?.day ?? localDay(new Date()));
  const [mode, setMode] = useState<'month' | 'week'>('month'), [newPlanRequest, setNewPlanRequest] = useState(0), [notice, setNotice] = useState('');
  useEffect(() => { if (props.initialContentId || props.initialFocus) document.getElementById('calendar-publication-manager')?.scrollIntoView({block: 'start'}); }, [props.initialContentId, props.initialFocus]);
  const date = dayDate(selected), today = localDay(new Date());
  const first = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  const start = mode === 'month' ? shiftDay(localDay(first), -(first.getDay() + 6) % 7) : shiftDay(selected, -(date.getDay() + 6) % 7);
  const days = Array.from({length: mode === 'month' ? 42 : 7}, (_, index) => shiftDay(start, index));
  const plans = scheduled(workspace, library), selectedPlans = plans.filter(item => item.day === selected);
  const channels = library?.settings.channels ?? workspace?.channels ?? [];
  const visibleChannels = channels.filter(channel => plans.some(entry => entry.plan.channelId === channel.id && days.includes(entry.day)));
  const hasDocuments = !!library && [...library.contentDetails, ...library.collections].some(item => !item.deletedAt);
  function move(direction: number) { if (mode === 'month') { const next = new Date(date.getFullYear(), date.getMonth() + direction, 1, 12); setSelected(localDay(next)); } else setSelected(shiftDay(selected, direction * 7)); }
  function manage(next?: PublicationFocus) {
    if (hasManagedDrafts()) { setNotice('还有未保存的发布填写，请先返回编辑窗口保存或明确关闭。'); return; }
    setNotice('');
    if (next) {setFocus(next); if (next.day) setSelected(next.day);}
    else setNewPlanRequest(value => value + 1);
    requestAnimationFrame(() => document.getElementById('calendar-publication-manager')?.scrollIntoView({block: 'start'}));
  }
  function planCard(entry: ReturnType<typeof scheduled>[number], compact = false) {
    const {content, kind, plan, channel, day} = entry, image = overviewCover(content.id, kind, workspace, library, plan.id);
    return <button className={`schedule-plan ${compact ? 'compact ' : ''}${channelTone(plan.channelId, channels)} ${plan.status}`} style={channelStyle(plan.channelId, channels)} key={`${kind}:${content.id}:${plan.id}`} disabled={busy} onClick={() => manage({kind, id: content.id, planId: plan.id, day})} title={publicationTime(plan.schedule)}><div className="schedule-plan-meta"><time>{scheduleClock(plan.schedule)}</time><span>{plan.status === 'published' ? '✓ 已发布' : '待发布'}</span></div><span className="schedule-plan-channel">{channel}{kind === 'collection' ? ' · 合集' : ''}</span><strong>{content.title || '未命名内容'}</strong>{!compact && image.url && <img className="schedule-plan-image" src={image.url} alt="本次发布封面" loading="lazy"/>}{!compact && <span className="schedule-plan-zone">{plan.schedule.precision === 'date' ? '仅安排日期' : plan.schedule.precision === 'local-minute' ? plan.schedule.timezone ?? '时区未记录' : plan.schedule.timezone}</span>}</button>;
  }
  const events = plans.map(entry => {
    const {content, kind, plan, channel, day} = entry, allDay = plan.schedule.precision === 'date';
    const start = dayDate(day);
    if (!allDay) { const [hour, minute] = scheduleClock(plan.schedule).split(':').map(Number); start.setHours(hour, minute, 0, 0); }
    const tone = channelTone(plan.channelId, channels);
    // Semi caches event children by key; include display facts so edits refresh without remounting the calendar.
    const key = JSON.stringify([kind, content.id, plan.id, plan.schedule, plan.status, content.title, channel, tone, channelStyle(plan.channelId, channels), busy]);
    return {key, allDay, start, ...(allDay ? {} : {end: new Date(start)}), children: <button className={`semi-schedule-event ${tone} ${plan.status}`} style={channelStyle(plan.channelId, channels)} disabled={busy} data-plan-id={plan.id} onClick={event => {event.stopPropagation(); manage({kind, id: content.id, planId: plan.id, day});}} title={`${content.title || '未命名内容'} · ${channel} · ${publicationTime(plan.schedule)}`}><span className="semi-schedule-event-meta"><time>{scheduleClock(plan.schedule)}</time><span>{channel}{kind === 'collection' ? ' · 合集' : ''}{plan.status === 'published' ? ' ✓' : ''}</span></span><strong>{content.title || '未命名内容'}</strong></button>};
  });
  return <section className="workspace-page calendar-workspace creator-schedule"><header className="creator-page-heading"><div><h2>日程 <span>{mode === 'month' ? `${date.getFullYear()} 年 ${date.getMonth() + 1} 月` : `${start.slice(5)} — ${shiftDay(start, 6).slice(5)}`}</span></h2><p>按渠道安排发布，发布完成后记录实际结果。明确时刻按本机时区显示；本地时间保留原时区。</p></div><div className="management-actions"><Button disabled={busy} onClick={() => setSelected(today)}>今天</Button><Button disabled={busy} onClick={() => move(-1)} aria-label={mode === 'month' ? '上个月' : '上一周'}>‹</Button><Button disabled={busy} onClick={() => move(1)} aria-label={mode === 'month' ? '下个月' : '下一周'}>›</Button><div className="schedule-mode" aria-label="日程视图">{(['month', 'week'] as const).map(value => <Button key={value} disabled={busy} theme={mode === value ? 'solid' : 'borderless'} aria-pressed={mode === value} onClick={() => setMode(value)}>{value === 'month' ? '按月' : '按周'}</Button>)}</div><Button theme="solid" disabled={busy || !hasDocuments} onClick={() => manage()}>＋ 新增计划</Button></div></header>
    <div className="schedule-subheading"><div className="schedule-legend" aria-label="渠道图例">{visibleChannels.map(channel => <span key={channel.id} className={`creator-channel ${channelTone(channel.id, channels)}`} style={channelStyle(channel.id, channels)}>{channel.name}</span>)}</div><label>查看日期<DatePicker aria-label="日程日期" type="date" format="yyyy-MM-dd" value={date} showClear={false} disabled={busy} onChange={value => {if (value instanceof Date) setSelected(localDay(value));}}/></label></div>
    <section className="creator-panel schedule-board semi-schedule-board"><div className="schedule-scroll"><LocaleProvider locale={{...zhCN, Calendar: {...zhCN.Calendar, allDay: '时间待定'}}}><Calendar className={`semi-schedule-calendar is-${mode}`} mode={mode} displayValue={date} events={events} weekStartsOn={1} height={620} minEventHeight={44} showCurrTime={false} markWeekend renderTimeDisplay={hour => `${String(hour).padStart(2, '0')}:00`} renderDateDisplay={value => {const day = localDay(value); return <button className={`semi-schedule-day${day === selected ? ' is-selected' : ''}`} disabled={busy} aria-pressed={day === selected} aria-label={`选择 ${day}，${plans.filter(entry => entry.day === day).length} 条发布安排`} onClick={event => {event.stopPropagation(); setSelected(day);}}>{mode === 'week' && <span>周{['日', '一', '二', '三', '四', '五', '六'][value.getDay()]}</span>}<strong>{value.getDate()}</strong></button>;}} onClick={(_, value) => {if (!busy) setSelected(localDay(value));}} onMoreClick={(_, value) => {if (!busy) setSelected(localDay(value));}}/></LocaleProvider></div></section>
    <section className="creator-panel schedule-day-detail" id="schedule-day-detail"><div className="creator-panel-heading"><h3>{selected === today ? '今天' : selected} <span>{selectedPlans.length} 条安排</span></h3><Button theme="borderless" disabled={busy || !hasDocuments} onClick={() => manage()}>为这一天新增计划 →</Button></div><div className="schedule-day-plans">{selectedPlans.map(entry => planCard(entry))}{!selectedPlans.length && <p className="creator-queue-empty">这一天没有发布安排。</p>}</div></section><p role="status">{notice}</p><CalendarManagement {...props} selectedDay={selected} focus={focus} newPlanRequest={newPlanRequest}/></section>;
}

export function PromptsPage(props: Pick<Props, 'workspace'> & WorkspaceManagementProps & {initialContentId?: string | null; currentContentId?: string | null; openContentBody?(contentId: string): Promise<void>; importPrompt?(): Promise<{title: string; body: string} | null>}) {
  const {workspace, library, busy} = props;
  const [query, setQuery] = useState(''), [category, setCategory] = useState(''), [view, setView] = useState<'enabled' | 'all' | 'trash'>('enabled');
  const [selected, setSelected] = useState<Prompt | null>(null), [editing, setEditing] = useState<WorkspaceLibraryPrompt | null | undefined>(undefined), [imported, setImported] = useState<{title: string; body: string} | null>(null);
  const {mutate, notice} = useWorkspaceMutation(props);
  const [contentId, setContentId] = useState(props.initialContentId ?? '');
  const contents = workspace?.contents.filter(item => !item.deletedAt) ?? [];
  const context = contents.find(item => item.id === contentId) ?? null;
  const currentContent = contents.find(item => item.id === props.currentContentId);
  const currentPrompt = (library?.prompts ?? workspace?.prompts)?.find(prompt => prompt.id === selected?.id);
  const unavailable = !currentPrompt || 'deletedAt' in currentPrompt && currentPrompt.deletedAt ? '这条提示词已移入回收站或不再可用，暂时无法填写或复制。本次填写仍保留。' : !currentPrompt.enabled ? '这条提示词已停用，暂时无法填写或复制。本次填写仍保留，重新启用后可继续。' : '';
  const prompts = library?.prompts.filter(prompt => view === 'trash' ? !!prompt.deletedAt : !prompt.deletedAt && (view === 'all' || prompt.enabled)) ?? workspace?.prompts.filter(prompt => prompt.enabled) ?? [];
  const categories = [...new Set([...(library?.settings.visiblePromptCategories ?? []), ...prompts.map(prompt => prompt.category)].filter(Boolean))];
  const matching = prompts.filter(prompt => (!category || prompt.category === category) && `${prompt.title} ${prompt.body} ${prompt.summary} ${prompt.when} ${prompt.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  function addPrompt() { setImported(null); setEditing(null); }
  return <section className="workspace-page prompt-workspace">
    <header className="creator-page-heading"><div><p className="eyebrow">PROMPT LIBRARY</p><h2>让好用的提示词，随时可用</h2><p>选择一条，填入你的情况，再复制给助手。</p></div><div className="management-actions">{props.importPrompt && <Button disabled={busy || !library} onClick={() => void props.importPrompt?.().then(value => { if (value) {setImported(value); setEditing(null);} })}>从文件导入</Button>}<Button theme="solid" disabled={busy || !library} onClick={addPrompt}>＋ 添加提示词</Button></div></header>
    {props.openContentBody && <div className="actions"><Button id="return-prompt-content-body" disabled={busy || !context} onClick={() => context && void props.openContentBody?.(context.id)}>返回关联内容正文</Button><span className="muted" role="status">{context ? `将打开：${context.title || '未命名内容'}` : contentId ? '关联内容已移入回收站或不再可用，请重新选择。' : '请先在“参考内容”中选择一篇已保存内容。'}</span></div>}
    <div className="prompt-library-toolbar"><div className="prompt-library-views">{([['enabled', '可用提示词'], ['all', '全部提示词'], ['trash', '回收站']] as const).map(([key, label]) => <button key={key} className={view === key ? 'active' : ''} aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}</div><Input className="prompt-library-search semi-control-text" disabled={busy} type="search" aria-label="搜索提示词" placeholder="搜索标题、正文或使用场景" value={query} onChange={setQuery}/></div>
    <details className="prompt-reference-picker"><summary><span>参考内容 <small>可选</small></span><span>{context?.title || (contentId ? '关联内容暂不可用' : '暂不关联内容')}</span></summary><div className="prompt-reference-fields"><label>这次围绕哪篇内容？<PopupSelect aria-label="选择提示词参考内容" value={contentId} disabled={busy} onChange={setContentId}><option value="">暂不关联内容</option>{contentId && !context && <option value={contentId} disabled>关联内容已移入回收站或不再可用</option>}{contents.map(item => <option key={item.id} value={item.id}>{item.title || '未命名内容'}</option>)}</PopupSelect></label><Button disabled={busy || !currentContent} onClick={() => currentContent && setContentId(currentContent.id)}>使用当前已保存内容</Button></div><p>选择后不会自动加入提示词；使用时还需明确勾选，才会复制这篇内容的标题与正文。</p>{!contents.length && <p>先保存一篇内容，即可在这里选择。</p>}</details>
    <div className="prompt-category-filter"><button className={!category ? 'active' : ''} aria-pressed={!category} onClick={() => setCategory('')}>全部 <span>{prompts.length}</span></button>{categories.map(value => <button key={value} className={category === value ? 'active' : ''} aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</button>)}</div>
    {notice && <p className="prompt-library-notice" role="status">{notice}</p>}
    <div className="prompt-library-grid">{matching.map(prompt => <article className={`prompt-library-card${!prompt.enabled ? ' is-disabled' : ''}`} key={prompt.id}>
      {library && <details className="prompt-card-menu"><summary aria-label={`管理提示词：${prompt.title}`}>•••</summary><div>{view !== 'trash' && <><button disabled={busy} onClick={() => {setImported(null); setEditing(library.prompts.find(item => item.id === prompt.id));}}>编辑提示词</button><button disabled={busy} onClick={() => void mutate({op: 'setPromptEnabled', id: prompt.id, editToken: prompt.editToken, enabled: !prompt.enabled})}>{prompt.enabled ? '停用提示词' : '启用提示词'}</button></>}<button disabled={busy} onClick={() => void mutate({op: view === 'trash' ? 'restorePrompt' : 'trashPrompt', id: prompt.id, editToken: prompt.editToken})}>{view === 'trash' ? '恢复提示词' : '移入回收站'}</button></div></details>}
      <button className="prompt-library-use" onClick={() => setSelected(prompt)} disabled={busy || view === 'trash' || !prompt.enabled}><span className="prompt-card-category">{prompt.category || '未分类'}{!prompt.enabled ? ' · 已停用' : ''}</span><h3>{prompt.title}</h3><p>{prompt.when || prompt.summary || prompt.body.slice(0, 140)}</p><div className="prompt-library-tags">{prompt.tags.map(tag => <span key={tag}>#{tag}</span>)}</div><span className="prompt-use-footer"><span>{promptFields(prompt.body).length ? `${promptFields(prompt.body).length} 项待填写` : '无需填写变量'}</span><strong>{view === 'trash' ? '在菜单中恢复' : !prompt.enabled ? '在菜单中启用后使用' : promptFields(prompt.body).length ? '填写并使用 ↗' : '查看并复制 ↗'}</strong></span></button>
    </article>)}</div>
    {!matching.length && <div className="prompt-library-empty"><span aria-hidden="true">✎</span><h3>{view === 'trash' ? '回收站为空' : prompts.length ? '没有找到匹配的提示词' : '把常用的好问题，存到这里'}</h3><p>{view === 'trash' ? '移入回收站的提示词，可以从卡片菜单恢复。' : prompts.length ? '换个关键词或分类试试。' : '直接粘贴已有文字，保存后就能反复使用。'}</p>{view !== 'trash' && !prompts.length && <Button theme="solid" disabled={busy || !library} onClick={addPrompt}>添加第一条提示词</Button>}</div>}
    {selected && <PromptDialog key={selected.id + selected.editToken} busy={busy} prompt={selected} unavailable={unavailable} content={context} close={() => setSelected(null)}/>}
    {editing !== undefined && <PromptEditor key={editing ? editing.id + editing.editToken : 'new'} prompt={editing} imported={imported} props={props} reload={setEditing} close={() => {setEditing(undefined); setImported(null);}}/>}
  </section>;
}
function PromptEditor({prompt, imported, props, reload, close}: {prompt: WorkspaceLibraryPrompt | null; imported: {title: string; body: string} | null; props: WorkspaceManagementProps; reload(prompt: WorkspaceLibraryPrompt): void; close(): void}) {
  const [title, setTitle] = useState(prompt?.title ?? imported?.title ?? ''), [body, setBody] = useState(prompt?.body ?? imported?.body ?? ''), [category, setCategory] = useState(prompt?.category ?? ''), [summary, setSummary] = useState(prompt?.summary ?? ''), [when, setWhen] = useState(prompt?.when ?? ''), [tags, setTags] = useState(prompt?.tags.join('、') ?? '');
  const [confirmReload, setConfirmReload] = useState(false);
  const current = props.library?.prompts.find(item => item.id === prompt?.id);
  const unavailable = !!prompt && (!current || !!current.deletedAt), changed = !!prompt && !!current && current.editToken !== prompt.editToken;
  const blocked = props.busy || unavailable || changed;
  const {mutate, notice} = useWorkspaceMutation(props);
  const suggestedTitle = pastedPrompt(body.split(/\r?\n/).find(line => line.trim()) ?? '').title;
  const fields = {title: title.trim() || suggestedTitle, body, category: category.trim(), summary, when, tags: [...new Set(tags.split(/[、,，]/).map(value => value.trim()).filter(Boolean))]};
  const dirty = title !== (prompt?.title ?? '') || body !== (prompt?.body ?? '') || category !== (prompt?.category ?? '') || summary !== (prompt?.summary ?? '') || when !== (prompt?.when ?? '') || tags !== (prompt?.tags.join('、') ?? '');
  useManagedDraftGuard(dirty);
  return <ManagementDialog title={prompt ? '编辑提示词' : '添加提示词'} busy={props.busy} dirty={dirty} close={close}><form className="management-form prompt-simple-editor" onSubmit={event => {event.preventDefault(); if (!body.trim() || blocked) return; void mutate(prompt ? {op: 'updatePrompt', id: prompt.id, editToken: prompt.editToken, ...fields} : {op: 'createPrompt', ...fields}, close);}}>
    <fieldset disabled={props.busy}><div className="management-form"><label>标题 <span className="prompt-editor-optional">可选，留空时使用正文第一行</span><Input className="semi-control-text" disabled={props.busy} value={title} onChange={setTitle} placeholder={body.trim() ? suggestedTitle : '给这条提示词起个名字'}/></label><label>提示词正文<TextArea className="management-body semi-control-text" disabled={props.busy} required autoFocus value={body} onChange={setBody} placeholder="直接粘贴你的提示词，也可以在这里编写…"/></label><p className="prompt-editor-help">{prompt ? '保存会更新这条提示词，正文中的换行会原样保留。' : '保存为一条新提示词，原文和换行会保留，不覆盖已有内容。'}</p>
      <details className="prompt-optional-fields"><summary>分类与说明 <span>可选</span></summary><div className="management-form"><div className="management-columns"><label>分类<Input className="semi-control-text" disabled={props.busy} list="prompt-category-options" value={category} onChange={setCategory}/><datalist id="prompt-category-options">{props.library?.settings.visiblePromptCategories.map(value => <option key={value} value={value}/>)}</datalist></label><label>标签（顿号或逗号分隔）<Input className="semi-control-text" disabled={props.busy} value={tags} onChange={setTags}/></label></div><label>适用场景<Input className="semi-control-text" disabled={props.busy} value={when} onChange={setWhen} placeholder="例如：为一篇文章起标题时"/></label><label>简短说明<Input className="semi-control-text" disabled={props.busy} value={summary} onChange={setSummary}/></label><p className="prompt-editor-help">需要每次填写不同内容时，可用 {'{{变量名|填写提示}}'} 标记，使用时会自动显示填写栏。</p></div></details>
    </div></fieldset>{(changed || unavailable) && <div className="prompt-discard" role="alert"><p>{unavailable ? '这条提示词已移入回收站或不再可用，不能保存。本次草稿仍保留。' : '这条提示词已在其他窗口或文件中更新。本次草稿仍保留，不会覆盖外部修改。请重新读取最新提示词后再编辑。'}</p>{props.busy && <p>请先点击“暂时收起”，在工作台继续处理待确认操作，再返回这里重新读取。</p>}{!unavailable && <><Button disabled={props.busy} onClick={() => setConfirmReload(true)}>重新读取最新提示词</Button>{confirmReload && <div><p>重新读取会放弃本次填写，并载入最新保存的提示词。</p><Button disabled={props.busy} onClick={() => current && reload(current)}>放弃本次填写并重新读取</Button><Button onClick={() => setConfirmReload(false)}>保留本次填写</Button></div>}</>}</div>}{notice && <p role="status">{notice}</p>}<footer className="prompt-editor-footer"><span>{body.length} 字 · 正文原样保存</span><Button htmlType="submit" theme="solid" disabled={blocked || !body.trim()}>{prompt ? '保存修改' : '保存提示词'}</Button></footer>
  </form></ManagementDialog>;
}
function PromptDialog({ prompt, unavailable, content: initialContent, close, busy }: { busy: boolean; prompt: Prompt; unavailable: string; content: Content | null; close(): void }) {
  const [content] = useState(initialContent);
  const dialog = useRef<HTMLDialogElement>(null), [values, setValues] = useState<Record<string, string>>({}), [notice, setNotice] = useState(''), [copying, setCopying] = useState(false);
  const [includeContent, setIncludeContent] = useState(false), [confirmClose, setConfirmClose] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const fields = promptFields(prompt.body), preview = promptPreview(prompt.body, values, content, includeContent);
  const dirty = includeContent || Object.values(values).some(value => value.length > 0);
  useManagedDraftGuard(dirty);
  const requestClose = () => { if (copying) return; if (dirty) setConfirmClose(true); else close(); };
  const missing = fields.filter(field => typeof values[field.key] !== 'string' || !values[field.key].trim());
  async function copy() { if (busy || copying || unavailable) return; if (missing.length) { setNotice(`请先填写：${missing.map(field => field.key).join('、')}`); return; } setCopying(true); try { await invoke('copyPrompt', {text: preview}); setNotice('已复制完整提示词，可以粘贴到助手。'); } catch { setNotice('复制失败，请在左侧预览中全选后手动复制。'); } finally { setCopying(false); } }
  return <dialog ref={dialog} className="prompt-dialog" aria-labelledby="prompt-dialog-title" onCancel={event => { event.preventDefault(); requestClose(); }}><div className="dialog-heading"><div><span className="eyebrow">{prompt.category || '提示词'}</span><h2 id="prompt-dialog-title">{prompt.title}</h2><p>{prompt.when || prompt.summary || '填写后复制到助手中使用。'}</p></div><Button aria-label="关闭提示词" disabled={copying} onClick={requestClose}>关闭</Button></div>{confirmClose && <div className="prompt-discard" role="alert"><p>关闭会清除本次填写和包含正文的勾选。已复制的文字、保存的提示词与内容不受影响。</p><Button disabled={copying} onClick={close}>放弃本次填写并关闭</Button><Button onClick={() => setConfirmClose(false)}>继续填写</Button></div>}{unavailable && <p className="prompt-discard" role="alert">{unavailable}</p>}<div className="prompt-use-grid"><section><h3>提示词预览</h3><p className="muted">填写后实时更新，复制的就是这段完整内容。</p><TextArea className="prompt-preview semi-control-text" value={preview} disabled={busy || copying || !!unavailable} readonly aria-label="最终提示词预览"/></section><section className="prompt-fields"><h3>本次参考内容</h3>{content ? <><p>已关联：{content.title || '未命名内容'}</p><Checkbox className="semi-control-check" checked={includeContent} disabled={busy || copying || !!unavailable} onChange={event => { setIncludeContent(!!event.target.checked); setNotice(''); }}>将这篇内容的已保存标题与正文加入本次提示词</Checkbox><p className="muted">{includeContent ? '左侧已显示将复制的标题与正文。粘贴到外部助手前，请确认愿意提供这些文字。' : '尚未包含内容文字。勾选后才会加入左侧预览与复制结果。'} 个人资料、照片、附件和渠道文案不会自动加入。</p></> : <p className="muted">本次未关联内容。可关闭窗口，在提示词页选择一篇已保存内容。</p>}<h3>填入你的情况</h3><p className="muted">本次填写仅留在窗口中，不修改保存的提示词或内容。</p>{fields.map((field, index) => <div key={field.key}><label htmlFor={`prompt-field-${index}`}>{field.key}</label>{field.hint && <p className="field-hint">{field.hint}</p>}<TextArea className="semi-control-text" id={`prompt-field-${index}`} aria-required="true" value={typeof values[field.key] === 'string' ? values[field.key] : ''} disabled={busy || copying || !!unavailable} onChange={value => { setValues(old => ({ ...old, [field.key]: value })); setNotice(''); }} placeholder={`填写${field.key}`}/></div>)}{!fields.length && <p className="muted">这条提示词无需填写变量，可直接复制。</p>}</section></div><footer className="dialog-footer"><span role="status" aria-live="polite">{notice || (fields.length ? `已填 ${fields.length - missing.length} / ${fields.length} 项` : '这条提示词无需填写。')}</span><Button theme="solid" disabled={busy || copying || !!unavailable} onClick={() => void copy()}>{copying ? '复制中…' : '复制完整提示词'}</Button></footer></dialog>;
}
export function TemplatesPage(props: WorkspaceManagementProps & { assets: CoverResults['listCoverAssets'] | null; busy: boolean; useTemplate(template: TemplateGroup): void; managePhotos(): void }) {
  const {assets, busy, useTemplate, library} = props;
  const [workflowTemplateId, setWorkflowTemplateId] = useState<string | null>(null);
  const [workflowExpanded, setWorkflowExpanded] = useState(false);
  const [workflowRequest, setWorkflowRequest] = useState(0);
  const workflowSection = useRef<HTMLElement>(null), workflowReturnId = useRef<string | null>(null), templateSearch = useRef<HTMLInputElement>(null);
  function openWorkflow(templateId: string, fromCard = false) {
    if (fromCard) workflowReturnId.current = templateId;
    setWorkflowTemplateId(templateId);
    setWorkflowExpanded(true);
    setWorkflowRequest(value => value + 1);
  }
  function closeWorkflow() {
    setWorkflowExpanded(false);
    const trigger = document.getElementById(`template-workflow-trigger-${workflowReturnId.current}`);
    (trigger ?? templateSearch.current)?.focus();
  }
  useEffect(() => {
    if (!workflowRequest) return;
    workflowSection.current?.focus({preventScroll: true});
    workflowSection.current?.scrollIntoView({block: 'start', behavior: 'instant'});
  }, [workflowRequest]);
  const [managing, setManaging] = useState(false), [importing, setImporting] = useState<{template: WorkspaceLibraryTemplate | null; images: WorkspaceTemplateImage[]} | null>(null);
  async function importImages(template: WorkspaceLibraryTemplate | null = null) {
    if (busy || !library) return;
    await props.run(async () => {
      const images = await invoke('chooseTemplateImages');
      if (images?.length) setImporting({template, images});
    });
  }
  async function derive() {
    const source = library?.templates.find(template => template.id === workflowTemplateId);
    const version = source?.versions.find(version => version.version === source.currentVersion);
    if (busy || !source || !version) return;
    await props.run(async () => {
      const saved = await invoke('mutateWorkspace', {op: 'deriveTemplate', sourceTemplateId: source.id, sourceVersion: version.version, sourcePackageHash: version.packageHash, name: `${source.title.slice(0, 100)} · 我的副本`});
      await props.refresh();
      openWorkflow(saved.objectId);
    });
  }
  const [query, setQuery] = useState(''), [preview, setPreview] = useState<TemplateGroup | null>(null), [source, setSource] = useState<'all' | 'mine' | 'builtin'>('all');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (preview) dialog.current?.showModal(); }, [preview]);
  const matching = assets?.templates.filter(template => (source === 'all' || (source === 'builtin' ? template.builtin : !template.builtin)) && `${template.name} ${template.description}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  const defaults = library?.settings.defaults;
  return <section className="workspace-page creator-templates">
    <header className="creator-page-heading"><div><p className="eyebrow">COVER STYLES</p><h2>选一种风格，开始下一张封面</h2><p>每组参考共同定义版式与气质，选好后再填入你的内容。</p></div><div className="management-actions"><Button disabled={busy || !library} onClick={props.managePhotos}>照片与默认设置</Button><Button disabled={busy || !library} onClick={() => setManaging(!managing)}>{managing ? '收起管理' : '版本与回收站'}</Button><Button theme="solid" disabled={busy || !library} onClick={() => void importImages()}>＋ 导入我的模板</Button></div></header>
    {managing && <TemplateManagement {...props} addVersion={template => void importImages(template)}/>}
    <div className="creator-template-layout"><div className="creator-template-library">
      <div className="creator-template-toolbar"><div className="creator-template-tabs" aria-label="模板来源">{([['all', '全部模板'], ['mine', '我的模板'], ['builtin', '内置模板']] as const).map(([key, label]) => <button key={key} aria-pressed={source === key} className={source === key ? 'active' : ''} onClick={() => setSource(key)}>{label}<span>{assets?.templates.filter(template => key === 'all' || (key === 'builtin' ? template.builtin : !template.builtin)).length ?? 0}</span></button>)}</div><Input ref={templateSearch} className="creator-template-search semi-control-text" disabled={busy} type="search" aria-label="搜索模板" value={query} placeholder="搜索名称、风格或适用内容" onChange={setQuery}/></div>
      <div className="creator-template-grid">{matching.map(template => <article key={template.id} className="creator-style-card">
        <div className="creator-template-art"><button className="creator-reference-stack" disabled={busy} onClick={() => setPreview(template)} aria-label={`预览 ${template.name} 的 ${template.samples.length} 张参考样张`}>{template.samples.length ? <><img className="creator-reference-backdrop" src={template.samples[0].url} alt="" aria-hidden="true" loading="lazy"/><img className="creator-template-original" src={template.samples[0].url} alt={`${template.name}参考样张`} loading="lazy"/></> : <span className="creator-no-reference">暂无可用参考样张</span>}</button><Button className="creator-template-use" theme="solid" disabled={busy || !library || !template.samples.length} onClick={() => useTemplate(template)} aria-label={`使用模板：${template.name}`}>使用这个模板</Button></div>
        <div className="creator-style-card-body"><h3 title={template.name}>{template.name}</h3><span className="creator-template-group-count">{template.samples.length} 张 · {template.builtin ? '内置' : '我的模板'}</span><details className="creator-template-details"><summary aria-label={`${template.name}的详情与操作`}>•••</summary><div className="creator-template-detail-body"><p>{template.description || '使用这组参考，为你的内容制作封面。'}</p><p className="muted">v{template.version}{defaults?.templateId === template.id ? ' · 当前默认' : ''} · {template.builtin ? '内置 · 可直接使用' : template.accepted && template.aiTested ? '已记录人工验收' : '效果待验收'}</p><Button theme="borderless" disabled={busy} onClick={() => setPreview(template)}>查看整组样张</Button><div className="creator-style-actions"><Button id={`template-workflow-trigger-${template.id}`} theme="borderless" disabled={busy || !library} aria-controls="template-learning-workflow" aria-expanded={workflowExpanded && workflowTemplateId === template.id} onClick={() => openWorkflow(template.id, true)}>学习与还原</Button></div></div></details></div>
      </article>)}</div>
      {!matching.length && <section className="creator-panel creator-empty"><span className="creator-empty-icon" aria-hidden="true">▧</span><h3>{assets?.templates.length ? '没有找到合适的模板' : '把喜欢的风格存成模板'}</h3><p>{assets?.templates.length ? '换个关键词，或切换到全部模板。' : '从本机导入一组参考样张，之后可以反复使用。'}</p>{assets?.templates.length ? <Button disabled={busy} onClick={() => {setQuery(''); setSource('all');}}>查看全部模板</Button> : <Button theme="solid" disabled={busy || !library} onClick={() => void importImages()}>导入参考样张</Button>}</section>}
      <p className="creator-footnote">一组可保存 1–50 张参考。参考数量与生成候选数量分别设置；原图只从你的内容库读取。</p>
    </div></div>
    {preview && <dialog ref={dialog} className="image-preview" onCancel={() => setPreview(null)} aria-label={preview.name}><div className="dialog-heading"><div><h2>{preview.name}</h2><p>{preview.samples.length} 张风格样张 · 同一模板组 · v{preview.version}</p></div><Button onClick={() => setPreview(null)}>关闭预览</Button></div><p className="creator-preview-description">{preview.description}</p><div className="preview-grid">{preview.samples.map((sample, index) => <img key={sample.assetHash} src={sample.url} alt={`${preview.name}样张 ${index + 1}`}/>)}</div></dialog>}
    {workflowTemplateId && <section id="template-learning-workflow" aria-label="模板学习与还原" hidden={!workflowExpanded} tabIndex={-1} ref={workflowSection}><Card title="模板学习与还原" headerExtraContent={<Button disabled={busy} onClick={closeWorkflow}>收起</Button>}><TemplateWorkflowPanel templateId={workflowTemplateId} library={library} assets={assets} busy={busy} run={props.run} refresh={props.refresh} onDerive={derive}/></Card></section>}
    {importing && <TemplateImportDialog props={props} template={importing.template} initialImages={importing.images} close={() => setImporting(null)}/>}
  </section>;
}

function CalendarManagement(props: Props & WorkspaceManagementProps & {selectedDay: string; focus: PublicationFocus | null; newPlanRequest: number}) {
  const {library, busy} = props, [selected, setSelected] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => { if (props.focus) setSelected(`${props.focus.kind}:${props.focus.id}`); }, [props.focus]);
  if (!library) return <p className="calendar-manager-empty">打开本机内容库后，即可安排发布。</p>;
  const documents = [...library.contentDetails.filter(item => !item.deletedAt).map(item => ({document: item, kind: 'content' as const})), ...library.collections.filter(item => !item.deletedAt).map(item => ({document: item, kind: 'collection' as const}))];
  const selection = documents.find(item => `${item.kind}:${item.document.id}` === selected) ?? documents[0];
  const content = selection?.kind === 'content' ? props.workspace?.contents.find(item => item.id === selection.document.id) : null;
  return <section className="workspace-management" id="calendar-publication-manager"><div className="calendar-manager-heading"><div><h3>{selection?.document.title || '管理发布安排'}</h3><p className="muted">新增计划默认使用所选日期 {props.selectedDay}。</p>{content && <Button theme="borderless" disabled={busy} onClick={() => {if (hasManagedDrafts()) {setNotice('请先保存或明确关闭尚未完成的发布编辑。'); return;} props.open(content);}}>打开内容详情 →</Button>}</div><label><span id="calendar-document-label">选择内容或合集</span><Select aria-labelledby="calendar-document-label" value={selection ? `${selection.kind}:${selection.document.id}` : undefined} disabled={busy || !documents.length} filter placeholder="还没有可安排的内容" optionList={documents.map(item => ({value: `${item.kind}:${item.document.id}`, label: `${item.kind === 'collection' ? '合集 · ' : ''}${item.document.title || '未命名内容'}`}))} onChange={value => {if (hasManagedDrafts()) {setNotice('请先保存或明确关闭尚未完成的发布编辑。'); return;} if (typeof value === 'string') {setNotice(''); setSelected(value);}}}/></label></div><p role="status">{notice}</p><PublicationPanel {...props} documentId={selection?.document.id ?? null} kind={selection?.kind ?? 'content'} focusedPlanId={selection && props.focus?.id === selection.document.id && props.focus.kind === selection.kind ? props.focus.planId : undefined} selectedDay={props.selectedDay} newPlanRequest={props.newPlanRequest}/>{!selection && <p className="calendar-manager-empty">先创建并保存一篇内容，再安排第一个发布计划。</p>}</section>;
}

function TemplateManagement(props: WorkspaceManagementProps & {addVersion(template: WorkspaceLibraryTemplate): void}) {
  const [trash, setTrash] = useState(false), {mutate, notice} = useWorkspaceMutation(props);
  return <div className="workspace-management"><Card title="模板管理"><div className="management-toolbar"><span className="muted">切换版本只影响之后的选择，已有封面与发布历史会保留。</span><Button onClick={() => setTrash(!trash)}>{trash ? '返回可用模板' : '模板回收站'}</Button></div><p role="status">{notice}</p>{props.library?.templates.filter(item => !!item.deletedAt === trash).map(item => <div className="management-row" key={item.id}><div><strong>{item.title}</strong><p className="muted">当前 v{item.currentVersion} · 共 {item.versions.length} 个版本</p></div><div className="management-actions">{!trash && !item.builtin && <Button disabled={props.busy} onClick={() => props.addVersion(item)}>添加新版本</Button>}{!trash && <label>当前版本<PopupSelect aria-label={`${item.title}的当前版本`} disabled={props.busy} value={String(item.currentVersion)} onChange={value => void mutate({op: 'selectTemplateVersion', id: item.id, editToken: item.editToken, version: Number(value)})}>{item.versions.map(version => <option key={version.version} value={String(version.version)}>v{version.version}</option>)}</PopupSelect></label>}<Button disabled={props.busy} onClick={() => void mutate({op: trash ? 'restoreTemplate' : 'trashTemplate', id: item.id, editToken: item.editToken})}>{trash ? '恢复模板' : '移入回收站'}</Button></div></div>)}{!props.library?.templates.some(item => !!item.deletedAt === trash) && <p className="muted">{trash ? '模板回收站为空。' : '还没有模板。'}</p>}</Card></div>;
}

function TemplateImportDialog({props, template, initialImages, close}: {props: WorkspaceManagementProps; template: WorkspaceLibraryTemplate | null; initialImages: WorkspaceTemplateImage[]; close(): void}) {
  const [images, setImages] = useState(initialImages), [name, setName] = useState(template?.title ?? ''), [description, setDescription] = useState(template?.description ?? ''), [rulesText, setRulesText] = useState(template?.rules.join('\n') ?? ''), [selectionNotice, setSelectionNotice] = useState('');
  const {mutate, notice} = useWorkspaceMutation(props);
  const rules = rulesText.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  const nextVersion = template ? Math.max(...template.versions.map(item => item.version)) + 1 : 1;
  const invalidRules = rules.length > 100 || rules.some(rule => rule.length > 2000);
  async function chooseAgain() {
    if (props.busy) return;
    await props.run(async () => {
      const chosen = await invoke('chooseTemplateImages');
      if (chosen?.length) { setImages(chosen); setSelectionNotice('已更新样张；名称、说明与固定规则仍保留。'); }
    });
  }
  return <ManagementDialog title={template ? `为「${template.title}」添加 v${nextVersion}` : '确认导入我的模板'} busy={props.busy} dirty close={close}><form className="management-form" onSubmit={event => { event.preventDefault(); if (images.length < 1 || images.length > 50 || invalidRules) return; const fields = {description, rules, styleAssetHashes: images.map(image => image.assetHash)}; void mutate(template ? {op: 'addTemplateVersion', id: template.id, editToken: template.editToken, version: nextVersion, ...fields} : {op: 'createTemplate', name: name.trim(), ...fields}, close); }}><fieldset disabled={props.busy}><div className="management-form"><p className="muted">{template ? '新版本会保留已有版本、封面与发布记录，保存后将选中新版本。' : '确认后新增一组模板，不覆盖已有模板。'} 导入的样张仅作为风格参考，生图效果仍需实际验收。</p><label>模板名称<Input className="semi-control-text" disabled={props.busy} required maxLength={200} readonly={!!template} value={name} onChange={setName} placeholder="例如：我的蓝白知识卡片"/></label><label>模板说明<TextArea className="semi-control-text" disabled={props.busy} maxLength={10000} value={description} onChange={setDescription} placeholder="描述这组模板适合什么内容、希望保留什么风格。"/></label><label>固定规则（可选，每行一条）<TextArea className="semi-control-text" disabled={props.busy} value={rulesText} onChange={setRulesText} placeholder="例如：标题保持两行以内\n背景使用浅色，重点词使用蓝色"/></label><p className={invalidRules ? 'danger-note' : 'muted'}>{invalidRules ? '最多填写 100 条固定规则，每条不超过 2000 字。' : '可以直接用自己的话描述，无需处理模板文件或格式。'}</p><div className="management-toolbar"><strong>已选 {images.length} / 50 张参考样张</strong><Button disabled={props.busy} onClick={() => void chooseAgain()}>重新选择样张</Button></div><p className="muted">可一次多选最多 50 张图片，单张不超过 64 MiB，总计不超过 256 MiB。这里的样张数量与之后生成的候选张数相互独立。</p><div className="template-import-grid">{images.map((image, index) => <figure key={image.assetHash}><img src={image.url} alt={`待导入样张 ${index + 1}：${image.originalName}`}/><figcaption><strong>{index + 1}. {image.originalName}</strong><span>{image.width} × {image.height}</span><Button disabled={props.busy} onClick={() => setImages(old => old.filter(item => item.assetHash !== image.assetHash))}>移除这张</Button></figcaption></figure>)}</div>{!images.length && <p className="danger-note">至少保留一张样张，或重新选择图片。</p>}</div></fieldset><p role="status" className="management-notice">{notice || selectionNotice}</p><Button theme="solid" htmlType="submit" disabled={props.busy || !name.trim() || images.length < 1 || images.length > 50 || invalidRules}>{template ? `保存为 v${nextVersion}` : '确认新增模板'}</Button></form></ManagementDialog>;
}
