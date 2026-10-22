import {CollectionPreview} from './collection-preview.tsx';
import {isSelectableTemplate} from '../shared/template-availability.ts';
import {CoverImageViewer, ImagePreviewButton} from './cover-image-viewer.tsx';
import {DataTable, ListToolbar, List, ImageList} from './list-primitives.tsx';
import {FileDropzone} from './file-dropzone.tsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import Progress from '@douyinfe/semi-ui-19/lib/es/progress';
import Card from '@douyinfe/semi-ui-19/lib/es/card';
import Dropdown from '@douyinfe/semi-ui-19/lib/es/dropdown';
import Popover from '@douyinfe/semi-ui-19/lib/es/popover';
import Input from '@douyinfe/semi-ui-19/lib/es/input';
import Typography from '@douyinfe/semi-ui-19/lib/es/typography';
import TextArea from '@douyinfe/semi-ui-19/lib/es/input/textarea';
import Checkbox from '@douyinfe/semi-ui-19/lib/es/checkbox';
import Calendar from '@douyinfe/semi-ui-19/lib/es/calendar';
import DatePicker from '@douyinfe/semi-ui-19/lib/es/datePicker';
import Select from '@douyinfe/semi-ui-19/lib/es/select';
import LocaleProvider from '@douyinfe/semi-ui-19/lib/es/locale/localeProvider';
import zhCN from '@douyinfe/semi-ui-19/lib/es/locale/source/zh_CN';
import './semi-calendar.css';
import {PopupCreatableSelect, PopupSelect} from './semi-controls.tsx';
import {PaginationBar} from './pagination-bar.tsx';
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
import {TemplatePreview} from './template-preview.tsx';
import {compareSchedules, publicationEntries, scheduleForView} from '../shared/publication-view.ts';
import {PublicationPanel, PublicationEditor, type PublicationSelection, type PublicationFocus, type CalendarFocus} from './publication-panel.tsx';
import {publicationTime, publicationTitle, publicationRecordTitle} from './publication-model.ts';
export type Page = 'overview' | 'templates' | 'content' | 'calendar' | 'prompts';
export const pageNames: Record<Page, string> = { overview: '总览', templates: '模板', content: '内容', calendar: '日程', prompts: '提示词' };
type Snapshot = DesktopResults['readWorkspace'];
type Prompt = Snapshot['prompts'][number];
interface Props { workspace: Snapshot | null; open(item: Content): void; busy: boolean }
function scheduled(workspace: Snapshot | null, library?: WorkspaceLibrarySnapshot | null, timezone = Intl.DateTimeFormat().resolvedOptions().timeZone, includeCancelled = false) {
  const entries = library ? publicationEntries(library, timezone, includeCancelled).map(entry => ({content: entry.document, kind: entry.kind, plan: {...entry.plan, schedule: entry.schedule}, day: entry.day, channel: entry.channel, title: entry.publication ? publicationRecordTitle(entry.publication, entry.document.title) : publicationTitle(entry.plan, entry.document)})) : (workspace?.contents ?? []).filter(item => !item.deletedAt).flatMap(content => content.plans.filter(plan => includeCancelled || plan.status !== 'cancelled').map(plan => ({content, kind: 'content' as const, plan: {...plan, schedule: scheduleForView(plan.schedule)}, day: scheduleDay(scheduleForView(plan.schedule)), channel: workspace?.channels.find(item => item.id === plan.channelId)?.name ?? '原渠道已不可用', title: content.title || '未命名内容'})));
  return entries.sort((a, b) => compareSchedules(a.plan.schedule, b.plan.schedule, timezone));
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
export function Overview({workspace, library, open, openCollection, busy, createContent, openCalendar, openContents, generate, selectCover}: Props & {library: WorkspaceLibrarySnapshot | null; openCollection?(focus: PublicationFocus): void; createContent?(): void; openContents?(): void; openCalendar?(focus?: CalendarFocus): void; generate?(item: Content): void; selectCover?(item: Content): void}) {
  const [coverPreview, setCoverPreview] = useState(false);
  const [notice, setNotice] = useState(''), [working, setWorking] = useState(false);
  const now = new Date(), today = localDay(now), tomorrow = shiftDay(today, 1), weekStart = shiftDay(today, -(now.getDay() + 6) % 7), weekEnd = shiftDay(weekStart, 6);
  const exampleIds = useMemo(() => new Set(library?.contentDetails.filter(item => item.isExample).map(item => item.id)), [library]);
  const items = workspace?.contents.filter(item => !item.deletedAt && !exampleIds.has(item.id)) ?? [];
  const recent = [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const collections = library?.collections.filter(item => !item.deletedAt) ?? [];
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const plans = useMemo(() => scheduled(workspace, library, timezone), [workspace, library, timezone]);
  const upcoming = plans.filter(item => item.plan.status === 'planned' && item.day >= today), overdue = plans.filter(item => item.plan.status === 'planned' && item.day < today);
  const weekPlans = plans.filter(item => item.day >= weekStart && item.day <= weekEnd), todayPlans = plans.filter(item => item.day === today), todayDone = todayPlans.filter(item => item.plan.status === 'published').length;
  const todayPending = todayPlans.filter(item => item.plan.status === 'planned'), todayPublished = todayPlans.filter(item => item.plan.status === 'published');
  const tomorrowPlans = plans.filter(item => item.day === tomorrow);
  const recentProjects = [...recent.slice(0, collections.length ? 3 : 4).map(item => ({kind: 'content' as const, item})), ...collections.slice(0, recent.length ? 1 : 4).map(item => ({kind: 'collection' as const, item}))].sort((a, b) => b.item.updatedAt.localeCompare(a.item.updatedAt)).slice(0, 4);
  const next = upcoming[0], featured = next?.content ?? recent[0], featuredKind = next?.kind ?? 'content';
  const todayQueue = todayPending.filter(entry => entry !== next);
  const detail = featuredKind === 'collection' ? library?.collections.find(item => item.id === featured?.id) : library?.contentDetails.find(item => item.id === featured?.id);
  const featuredPlan = detail?.plans.find(item => item.id === next?.plan.id);
  const text = featuredPlan?.textMode === 'explicit' ? featuredPlan.text ?? '' : featured?.body ?? '';
  const noPlannedCover = !!featuredPlan && featuredPlan.coverChoice === null;
  const cover = featured ? overviewCover(featured.id, featuredKind, workspace, library, noPlannedCover && featuredKind === 'content' ? undefined : next?.plan.id) : null;
  const emptyPlanText = featuredPlan?.textMode === 'explicit' && featuredPlan.text === '';
  const needsCover = items.filter(item => !item.selectedCandidateId && !item.candidateCount), needsSelection = items.filter(item => !item.selectedCandidateId && item.candidateCount > 0);
  const noPlan = items.filter(item => !item.plans.some(plan => plan.status !== 'cancelled'));
  const disabled = busy || working;
  const openFeatured = () => { if (featured) { if (featuredKind === 'collection') openCollection?.({kind: 'collection', id: featured.id, planId: next?.plan.id, day: next?.day}); else open(featured); } };
  const channels = library?.settings.channels ?? workspace?.channels ?? [];
  const todos = [{label: '选一张封面', count: needsSelection.length, note: needsSelection[0]?.title, enabled: true, action: () => needsSelection[0] && (selectCover ?? open)(needsSelection[0])}, {label: '准备内容封面', count: needsCover.length, note: needsCover[0]?.title, enabled: true, action: () => {if (needsCover[0]) (generate ?? open)(needsCover[0]);}}, {label: '核对逾期计划', count: overdue.length, note: '发布后补记实际记录', enabled: !!openCalendar, action: () => {const entry = overdue[0]; if (entry) openCalendar?.({kind: entry.kind, id: entry.content.id, planId: entry.plan.id, day: entry.day});}}, {label: '安排发布日程', count: noPlan.length, note: noPlan[0]?.title, enabled: !!openCalendar, action: () => noPlan[0] && openCalendar?.({kind: 'content', id: noPlan[0].id})}].filter(item => item.count > 0);
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
    <header className="creator-overview-heading"><h2>{new Intl.DateTimeFormat('zh-CN', {month: 'long', day: 'numeric', weekday: 'long'}).format(now)}</h2><div className="creator-today-progress"><strong>今天 {todayDone}/{todayPlans.length} 已发</strong><Progress percent={todayDone / Math.max(todayPlans.length, 1) * 100} showInfo={false} size="small" aria-label={`今天 ${todayPlans.length} 条安排，已发布 ${todayDone} 条`}/></div><div className="creator-week" aria-label="本周发布安排">{Array.from({length: 7}, (_, index) => {const day = shiftDay(weekStart, index), dayPlans = weekPlans.filter(item => item.day === day); return <Button theme="borderless" key={day} className={day === today ? 'is-today' : ''} disabled={disabled || !openCalendar} onClick={() => {const entry = dayPlans[0]; openCalendar?.(entry ? {kind: entry.kind, id: entry.content.id, planId: entry.plan.id, day} : {day});}} aria-label={`${day}，${dayPlans.length} 条安排`}><span>{['一', '二', '三', '四', '五', '六', '日'][index]}</span><strong>{dayPlans.length}</strong></Button>;})}</div></header>
    <section className="creator-panel creator-featured" aria-label={next ? '下一条发布' : '继续创作'}>
        {featured ? <><div className={`creator-featured-content${cover?.url ? ' has-cover' : ''}`}>{cover?.url && <img className="creator-hero-backdrop" src={cover.url} alt="" aria-hidden="true"/>}{cover?.url && <Button theme="borderless" className="creator-featured-cover" disabled={disabled || featuredKind === 'collection' && !openCollection} onClick={() => setCoverPreview(true)} aria-label={`放大 ${featured.title || '未命名内容'}`}><img src={cover.url} alt={`${featured.title || '未命名内容'}的${noPlannedCover ? '内容封面' : '所选封面'}`}/></Button>}<div className="creator-featured-copy"><div className="creator-next-meta"><strong>{next ? '下一条' : '继续创作'}</strong>{next && <><time title={publicationTime(next.plan.schedule)}>{scheduleClock(next.plan.schedule)}</time><span className={`creator-channel ${channelTone(next.plan.channelId, channels)}`} style={channelStyle(next.plan.channelId, channels)} title={next.channel}><span className="channel-name">{next.channel}</span></span><span>{next.day === today ? '今天' : next.day === tomorrow ? '明天' : next.day}</span></>}</div>{(noPlannedCover || !cover?.url) && <p className="creator-featured-cover-note">{cover?.id && !cover.url ? '封面预览暂不可用，请打开内容核对原封面。' : noPlannedCover ? cover?.url ? '内容封面 · 此计划不带图' : '此计划不带图' : '封面还没选好，打开内容继续制作。'}</p>}<h3 title={featured.title || '未命名内容'}>{featured.title || '未命名内容'}</h3><div className="creator-body-excerpt"><Typography.Paragraph ellipsis={{rows:3, expandable:true, collapsible:true, expandText:'查看全部', collapseText:'收起'}}>{text || (emptyPlanText ? '这条计划设为发布空文字。' : '正文还留着空白，打开内容把这次的想法写下来。')}</Typography.Paragraph></div><div className="creator-featured-actions"><Button disabled={disabled || !text} onClick={() => void copyText()}>复制文案</Button>{featuredKind === 'content' && cover?.id && cover.url && !noPlannedCover && <Button disabled={disabled} onClick={() => void downloadCover()}>下载图片</Button>}{next && openCalendar ? <Button theme="solid" disabled={disabled} onClick={() => openCalendar({kind: featuredKind, id: featured.id, planId: next.plan.id, day: next.day, action: 'record'})}>记录已发布</Button> : <Button theme="solid" disabled={disabled || featuredKind === 'collection' && !openCollection} onClick={openFeatured}>继续编辑</Button>}</div><div className="creator-featured-links"><Button theme="borderless" disabled={disabled || featuredKind === 'collection' && !openCollection} onClick={openFeatured}>打开{featuredKind === 'collection' ? '合集' : '内容'}</Button>{featuredKind === 'content' && !cover?.id && !noPlannedCover && generate && <Button theme="borderless" disabled={disabled} onClick={() => generate(featured)}>制作封面</Button>}{!next && openCalendar && <Button theme="borderless" disabled={disabled} onClick={() => openCalendar({kind: featuredKind, id: featured.id})}>安排日程</Button>}</div></div></div></> : <div className="creator-empty"><span className="creator-empty-icon" aria-hidden="true">▤</span><h3>把第一个想法写下来</h3><p>先保存标题和正文，再选择模板、制作封面。</p>{createContent && <Button theme="solid" disabled={disabled || !workspace} onClick={createContent}>新建第一篇内容</Button>}</div>}
      </section>
    {coverPreview && cover?.url && featured && <CoverImageViewer url={cover.url} label={`${featured.title || '未命名内容'}的封面`} close={() => setCoverPreview(false)}/> }
    <div className="creator-overview-layout">
      <section className="creator-panel creator-queue">
        <div className="creator-panel-heading"><h3>今天</h3><span className="creator-small-label">{todayPending.length} 条待发布</span></div>
        <div className="creator-queue-list">{todayQueue.slice(0, 3).map(entry => <div className="creator-queue-row" key={`${entry.kind}:${entry.content.id}:${entry.plan.id}`}><div className="creator-queue-meta"><time title={publicationTime(entry.plan.schedule)}>{scheduleClock(entry.plan.schedule)}</time><span className={`creator-channel ${channelTone(entry.plan.channelId, channels)}`} style={channelStyle(entry.plan.channelId, channels)} title={entry.channel}><span className="channel-name">{entry.channel}</span></span></div><Button theme="borderless" className="creator-queue-title" disabled={disabled || !openCalendar} onClick={() => openCalendar?.({kind: entry.kind, id: entry.content.id, planId: entry.plan.id, day: today})} title={entry.title}>{entry.title}</Button><Button theme="solid" className="creator-queue-record" disabled={disabled || !openCalendar} onClick={() => openCalendar?.({kind: entry.kind, id: entry.content.id, planId: entry.plan.id, day: today, action: 'record'})}>记录已发布</Button></div>)}{!todayQueue.length && <p className="creator-queue-empty">{next?.day === today ? '下一条已在上方，准备好就可以发布。' : todayPlans.length ? '今天的安排已全部记录发布。' : '今天暂无发布安排。'}</p>}</div>
        <div className="creator-queue-summary">{todayPublished.length > 0 && <Button theme="borderless" disabled={disabled || !openCalendar} onClick={() => openCalendar?.({day: today})}>已发布 {todayPublished.length} 条 · 查看日程 →</Button>}{openCalendar && <Button theme="borderless" disabled={disabled} onClick={() => openCalendar({day: today})}>查看今天全部 {todayPlans.length} 条安排 →</Button>}<div className="creator-tomorrow-preview"><span>明天 · {tomorrowPlans.length} 条安排</span>{openCalendar && <Button theme="borderless" disabled={disabled} onClick={() => openCalendar({day: tomorrow})}>查看日程 →</Button>}</div></div>
      </section>
      <section className="creator-panel creator-todos"><div className="creator-panel-heading"><h3>要处理</h3><span className="creator-small-label">{todos.length} 项</span></div><div className="creator-attention">{todos.map(item => <Button theme="borderless" key={item.label} disabled={disabled || !item.enabled} onClick={item.action}><span className="creator-attention-copy"><strong>{item.label}</strong><small title={item.note}>{item.note || '未命名内容'}</small></span><b>{item.count}<span aria-hidden="true"> ›</span></b></Button>)}{!todos.length && <div className="creator-calm-state"><span aria-hidden="true">✓</span><p>当前没有待处理事项</p></div>}</div></section>
      <section className="creator-panel creator-projects"><div className="creator-panel-heading"><h3>内容项目</h3><span className="creator-small-label">{items.length} 篇 · {collections.length} 个合集</span></div><div className="creator-recent">{recentProjects.map(project => {const item = project.item; if (project.kind === 'collection') return <Button theme="borderless" key={`collection:${item.id}`} data-collection-id={item.id} disabled={disabled || !openCollection} onClick={() => openCollection?.({kind: 'collection', id: item.id})}><CollectionPreview memberIds={project.item.memberIds} workspace={workspace} library={library}/><span className="creator-recent-copy"><strong title={item.title}>{item.title || '未命名合集'}</strong><small><em>合集</em> · {project.item.memberIds.filter(id => workspace?.contents.some(content => content.id === id && !content.deletedAt)).length} 篇内容</small></span><span aria-hidden="true">›</span></Button>; const content = project.item, image = overviewCover(content.id, 'content', workspace, library), entries = plans.filter(entry => entry.kind === 'content' && entry.content.id === content.id), done = entries.filter(entry => entry.plan.status === 'published').length; return <Button theme="borderless" key={`content:${content.id}`} disabled={disabled} onClick={() => open(content)}><span className="creator-recent-cover">{image.url ? <img src={image.url} alt="" loading="lazy"/> : <span aria-hidden="true">▤</span>}</span><span className="creator-recent-copy"><strong title={content.title}>{content.title || '未命名内容'}</strong><small>{content.selectedCandidateId ? '已选封面' : content.candidateCount ? '待选封面' : '待做封面'} · {entries.length ? `已发 ${done}/${entries.length}` : '尚未安排发布'}</small></span><span aria-hidden="true">›</span></Button>;})}{!recentProjects.length && <p className="creator-side-empty">还没有自己的内容。</p>}</div>{openContents && <div className="creator-panel-footer"><Button theme="borderless" disabled={disabled} onClick={openContents}>查看全部内容项目 →</Button></div>}</section>
    </div>{notice && <p className="creator-action-notice" role="status">{notice}</p>}
  </section>;
}
export function CalendarPage(props: Props & WorkspaceManagementProps & {initialContentId?: string | null; initialFocus?: CalendarFocus | null}) {
  const {workspace, busy, library} = props;
  const [focus, setFocus] = useState<PublicationFocus | null>(() => props.initialFocus?.id ? props.initialFocus : (props.initialContentId ? {kind: 'content', id: props.initialContentId} : null));
  const [selected, setSelected] = useState(props.initialFocus?.day ?? localDay(new Date()));
  const [dayPage, setDayPage] = useState(1), [dayPageSize, setDayPageSize] = useState(20);
  useEffect(() => setDayPage(1), [selected]);
  const [mode, setMode] = useState<'month' | 'week'>('month'), [notice, setNotice] = useState('');
  const [query, setQuery] = useState(''), [channelIds, setChannelIds] = useState<string[] | null>(null), [status, setStatus] = useState('');
  const [details, setDetails] = useState(false), [creating, setCreating] = useState(false), [contentId, setContentId] = useState(''), [dialog, setDialog] = useState<PublicationSelection | null>(null);
  const consumedFocus = useRef<CalendarFocus | null>(null);
  const rowFocus = useRef<HTMLElement>(null);
  const positionedFocus = useRef<PublicationFocus | null>(null);
  const date = dayDate(selected), today = localDay(new Date());
  const first = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  const start = mode === 'month' ? shiftDay(localDay(first), -(first.getDay() + 6) % 7) : shiftDay(selected, -(date.getDay() + 6) % 7);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const allPlans = useMemo(() => scheduled(workspace, library, timezone, true), [workspace, library, timezone]);
  const channelPlans = useMemo(() => allPlans.filter(entry => channelIds === null || channelIds.includes(entry.plan.channelId)), [allPlans, channelIds]);
  const plans = useMemo(() => channelPlans.filter(entry => entry.plan.status !== 'cancelled'), [channelPlans]);
  const dayPlans = useMemo(() => channelPlans.filter(item => item.day === selected), [channelPlans, selected]);
  const selectedPlans = useMemo(() => dayPlans.filter(entry => (status === 'all' || (status ? entry.plan.status === status : entry.plan.status !== 'cancelled')) && `${entry.content.title} ${entry.title} ${entry.channel}`.toLowerCase().includes(query.trim().toLowerCase())), [dayPlans, status, query]);
  const currentDayPage = Math.min(dayPage, Math.max(1, Math.ceil(selectedPlans.length / dayPageSize)));
  const plansByDay = useMemo(() => {
    const grouped = new Map<string, (typeof plans)[number][]>(), end = shiftDay(start, mode === 'month' ? 41 : 6);
    for (const plan of plans) {if (plan.day >= start && plan.day <= end) {const entries = grouped.get(plan.day) ?? []; entries.push(plan); grouped.set(plan.day, entries);}}
    return grouped;
  }, [plans, start, mode]);
  const channels = library?.settings.channels ?? workspace?.channels ?? [];
  const channelOptions = useMemo(() => {
    const options = channels.map(channel => ({value: channel.id, label: `${channel.name}${('deletedAt' in channel ? channel.deletedAt : !channel.enabled) ? '（已停用）' : ''}`}));
    for (const entry of allPlans) if (!options.some(option => option.value === entry.plan.channelId)) options.push({value: entry.plan.channelId, label: `原渠道已不可用（${entry.plan.channelId}）`});
    return options;
  }, [channels, allPlans]);
  useEffect(() => {
    const request = props.initialFocus;
    if (!request || request === consumedFocus.current) return;
    consumedFocus.current = request;
    if (!canChangeDay()) return;
    const entry = request.id ? allPlans.find(item => item.kind === request.kind && item.content.id === request.id && (!request.planId || item.plan.id === request.planId)) : undefined;
    selectDay(entry?.day ?? request.day ?? selected);
    setQuery(''); setStatus(entry?.plan.status === 'cancelled' ? 'all' : '');
    if (entry && channelIds !== null && !channelIds.includes(entry.plan.channelId)) {
      setChannelIds([...channelIds, entry.plan.channelId]);
      setNotice('已补选目标发布安排的渠道，便于定位。');
    }
    if (request.id) {
      setFocus({...request, action: request.action === 'record' ? undefined : request.action});
      if (request.action === 'history' || !request.planId) setDetails(true);
      if (request.action === 'record') openRecord(request);
    }
    requestAnimationFrame(() => window.document.getElementById('schedule-day-detail')?.scrollIntoView({block: 'start'}));
  }, [props.initialContentId, props.initialFocus, allPlans]);
  const documents = library?.contentDetails.filter(item => !item.deletedAt && !item.isExample) ?? [];
  const hasDocuments = documents.length > 0;
  useEffect(() => {setDayPage(1);}, [query, channelIds, status]);
  useEffect(() => {
    if (!focus?.planId || positionedFocus.current === focus) return;
    const index = selectedPlans.findIndex(entry => entry.kind === focus.kind && entry.content.id === focus.id && entry.plan.id === focus.planId);
    if (index < 0) return;
    const page = Math.floor(index / dayPageSize) + 1;
    if (currentDayPage !== page) {setDayPage(page); return;}
    if (rowFocus.current) {rowFocus.current.scrollIntoView({block: 'nearest'}); positionedFocus.current = focus;}
  }, [focus, selectedPlans, currentDayPage, dayPageSize]);
  function move(direction: number) { if (mode === 'month') { const next = new Date(date.getFullYear(), date.getMonth() + direction, 1, 12); selectDay(localDay(next)); } else selectDay(shiftDay(selected, direction * 7)); }
  function openRecord(next: PublicationFocus) {
    const document = (next.kind === 'content' ? library?.contentDetails : library?.collections)?.find(item => item.id === next.id);
    const plan = document?.plans.find(item => item.id === next.planId);
    if (!document || document.deletedAt || plan?.status !== 'planned') {setNotice('原计划已变化或暂不可用，请重新核对。'); return;}
    setDialog({mode: 'record', kind: next.kind, documentId: document.id, plan});
  }
  function canChangeDay() {
    if (hasManagedDrafts()) {setNotice('还有未保存的发布填写，请先返回编辑窗口保存或明确关闭。'); return false;}
    return true;
  }
  function selectDay(day: string) {
    if (!canChangeDay()) return false;
    positionedFocus.current = null;
    setFocus(null); setDetails(false); setDialog(null); setCreating(false);
    setSelected(day); setDayPage(1);
    return true;
  }
  function showDayPlans(day: string) {
    if (!selectDay(day)) return;
    setQuery(''); setStatus('');
    requestAnimationFrame(() => window.document.getElementById('schedule-day-detail')?.scrollIntoView({block: 'start'}));
  }
  function manage(next?: PublicationFocus) {
    if (hasManagedDrafts()) {setNotice('还有未保存的发布填写，请先返回编辑窗口保存或明确关闭。'); return;}
    setNotice('');
    if (!next) {setContentId(''); setCreating(true); return;}
    setFocus({...next, action: next.action === 'record' ? undefined : next.action}); if (next.day) setSelected(next.day);
    if (next.action === 'record') {openRecord(next); return;}
    setDetails(true);
    requestAnimationFrame(() => window.document.getElementById('calendar-publication-manager')?.scrollIntoView({block: 'start'}));
  }
  function planCard(entry: ReturnType<typeof scheduled>[number]) {
    const {content, kind, plan, channel, day, title} = entry;
    const focused = focus?.kind === kind && focus.id === content.id && focus.planId === plan.id;
    return <article ref={focused ? rowFocus : undefined} className={`schedule-plan daily-plan-row ${plan.status}${focused ? ' is-focused' : ''}`} data-plan-id={plan.id} data-doc-id={content.id} data-kind={kind} key={`${kind}:${content.id}:${plan.id}`}><time title={publicationTime(plan.schedule)}>{scheduleClock(plan.schedule)}</time><span className={`creator-channel ${channelTone(plan.channelId, channels)}`} style={channelStyle(plan.channelId, channels)} title={channel}><span className="channel-name">{channel}</span></span><Button theme="borderless" className="daily-plan-title" disabled={busy} title={`${content.title || (kind === 'collection' ? '未命名合集' : '未命名内容')} · ${title}`} onClick={() => manage({kind, id: content.id, planId: plan.id, day})}><span className="daily-plan-document"><span className="daily-plan-kind">{kind === 'collection' ? '合集' : '内容'}</span><strong>{content.title || (kind === 'collection' ? '未命名合集' : '未命名内容')}</strong></span>{title !== content.title && <small className="daily-plan-copy">{title}</small>}</Button><span className={`publication-status ${plan.status}`}>{plan.status === 'published' ? '✓ 已记录' : plan.status === 'cancelled' ? '已取消' : '待发布'}</span>{plan.status === 'planned' ? <Button className="daily-plan-record" theme="solid" disabled={busy} onClick={() => manage({kind, id: content.id, planId: plan.id, day, action: 'record'})}>记录已发布</Button> : <Button className="daily-plan-details" theme="borderless" disabled={busy} onClick={() => manage({kind, id: content.id, planId: plan.id, day, action: plan.status === 'published' ? 'history' : undefined})}>{plan.status === 'published' ? '查看记录' : '查看详情'}</Button>}</article>;
  }
  const events = [...plansByDay.values()].flatMap(entries => entries.length > 3 ? [] : entries).map(entry => {
    const {content, kind, plan, channel, day, title} = entry, allDay = plan.schedule.precision === 'date';
    const start = dayDate(day);
    if (!allDay) { const [hour, minute] = scheduleClock(plan.schedule).split(':').map(Number); start.setHours(hour, minute, 0, 0); }
    const tone = channelTone(plan.channelId, channels);
    // Semi caches event children by key; include display facts so edits refresh without remounting the calendar.
    const key = JSON.stringify([kind, content.id, plan.id, plan.schedule, plan.status, content.title, title, channel, tone, channelStyle(plan.channelId, channels), busy]);
    return {key, allDay, start, ...(allDay ? {} : {end: new Date(start)}), children: <Button theme="borderless" className={`semi-schedule-event ${tone} ${plan.status}`} style={channelStyle(plan.channelId, channels)} disabled={busy} data-plan-id={plan.id} onClick={event => {event.stopPropagation(); manage({kind, id: content.id, planId: plan.id, day});}} title={`${title || '未命名内容'} · ${channel} · ${publicationTime(plan.schedule)}`}><span className="semi-schedule-event-meta"><time>{scheduleClock(plan.schedule)}</time><span>{channel}{kind === 'collection' ? ' · 合集' : ''}{plan.status === 'published' ? ' ✓' : ''}</span></span><strong>{title}</strong></Button>};
  });
  for (const [day, entries] of plansByDay) {
    if (entries.length <= 3) continue;
    events.push({key: `day-summary:${day}:${entries.length}:${busy}`, allDay: true, start: dayDate(day), children: <Button theme="borderless" className="semi-schedule-event schedule-day-more" disabled={busy} aria-label={`查看 ${day} 全部 ${entries.length} 条安排`} onClick={event => {event.stopPropagation(); showDayPlans(day);}}>查看全部 {entries.length} 条安排 →</Button>});
  }
  return <section className="workspace-page calendar-workspace creator-schedule"><header className="creator-page-heading"><div><p className="eyebrow">SCHEDULE · 发布日程</p><h2>日程 <span>{mode === 'month' ? `${date.getFullYear()} 年 ${date.getMonth() + 1} 月` : `${start.slice(5)} — ${shiftDay(start, 6).slice(5)}`}</span></h2><p>按渠道安排发布，发布完成后记录实际结果。明确时刻按本机时区显示；本地时间保留原时区。</p><div className="creator-page-stats"><span>{plans.length} 条发布安排</span><span>{dayPlans.length} 条当日安排</span></div></div><div className="management-actions"><Button disabled={busy} onClick={() => selectDay(today)}>今天</Button><Button disabled={busy} onClick={() => move(-1)} aria-label={mode === 'month' ? '上个月' : '上一周'}>‹</Button><Button disabled={busy} onClick={() => move(1)} aria-label={mode === 'month' ? '下个月' : '下一周'}>›</Button><div className="schedule-mode" aria-label="日程视图">{(['month', 'week'] as const).map(value => <Button key={value} disabled={busy} theme={mode === value ? 'solid' : 'borderless'} aria-pressed={mode === value} onClick={() => setMode(value)}>{value === 'month' ? '按月' : '按周'}</Button>)}</div><Button theme="solid" disabled={busy || !hasDocuments} onClick={() => manage()}>＋ 新增计划</Button></div></header>
    <div className="schedule-subheading"><div className="schedule-legend"><label><span id="calendar-channel-label">发布渠道</span><Select multiple showClear filter virtualize={channelOptions.length > 7 ? {itemSize: 36, height: 252} : undefined} searchPlaceholder="搜索发布渠道" emptyContent="没有匹配的渠道" inputProps={{'aria-label': '搜索发布渠道'}} aria-labelledby="calendar-channel-label" disabled={busy} value={channelIds ?? channelOptions.map(option => option.value)} optionList={channelOptions} placeholder="未选择渠道" maxTagCount={2} onChange={value => {positionedFocus.current = focus; setChannelIds(Array.isArray(value) ? value.map(String) : []);}}/></label><Button theme="borderless" disabled={busy || channelIds === null} onClick={() => {positionedFocus.current = focus; setChannelIds(null);}}>恢复全部渠道</Button><span className="schedule-channel-summary">{channelIds === null ? '全部渠道（含后续新增）' : `已选 ${channelIds.length} 个渠道`}</span></div><label>查看日期<DatePicker aria-label="日程日期" type="date" autoSwitchDate={false} format="yyyy-MM-dd" value={date} showClear={false} disabled={busy} onChange={value => {if (value instanceof Date) selectDay(localDay(value));}}/></label></div>
    <section className="creator-panel schedule-board semi-schedule-board"><div className="schedule-scroll"><LocaleProvider locale={{...zhCN, Calendar: {...zhCN.Calendar, allDay: '时间待定'}}}><Calendar className={`semi-schedule-calendar is-${mode}`} mode={mode} displayValue={date} events={events} weekStartsOn={1} height={620} minEventHeight={44} showCurrTime={false} markWeekend={false} renderTimeDisplay={hour => `${String(hour).padStart(2, '0')}:00`} renderDateDisplay={value => {const day = localDay(value); return <Button theme="borderless" className={`semi-schedule-day${day === selected ? ' is-selected' : ''}`} disabled={busy} aria-pressed={day === selected} aria-label={`选择 ${day}，${plansByDay.get(day)?.length ?? 0} 条发布安排`} onClick={event => {event.stopPropagation(); selectDay(day);}}>{mode === 'week' && <span>周{['日', '一', '二', '三', '四', '五', '六'][value.getDay()]}</span>}<strong>{value.getDate()}</strong></Button>;}} onClick={(_, value) => {if (!busy) selectDay(localDay(value));}} onMoreClick={(_, value) => {if (!busy) showDayPlans(localDay(value));}}/></LocaleProvider></div></section>
    <section className="creator-panel schedule-day-detail" id="schedule-day-detail"><div className="creator-panel-heading"><h3>{selected === today ? '今天' : selected}的发布计划 <span>{dayPlans.length} 条总计 · 匹配 {selectedPlans.length} 条安排</span></h3><Button theme="borderless" disabled={busy || !hasDocuments} onClick={() => manage()}>为这一天新增计划 →</Button></div><ListToolbar className="daily-plan-filters" search={{label: '搜索发布计划', placeholder: '搜索发布标题、内容或渠道', value: query, change: setQuery, disabled: busy || !!dialog}}><PopupSelect aria-label="筛选发布状态" disabled={busy || !!dialog} value={status} onChange={setStatus}><option value="">未取消（待发布＋已记录）</option><option value="all">全部安排（含已取消）</option><option value="planned">待发布</option><option value="published">已记录</option><option value="cancelled">已取消</option></PopupSelect></ListToolbar><div className="daily-plan-columns" aria-hidden="true"><span>时间</span><span>渠道</span><span>内容标题 / 发布文案</span><span>状态</span><span>操作</span></div><DataTable className="schedule-day-plans compact-data-table" rows={selectedPlans.slice((currentDayPage - 1) * dayPageSize, currentDayPage * dayPageSize)} total={selectedPlans.length} page={currentDayPage} pageSize={dayPageSize} onPageSizeChange={value => {positionedFocus.current = focus; setDayPageSize(value);}} disabled={busy || !!dialog} onPageChange={value => {positionedFocus.current = focus; setDayPage(value);}} label="当天安排分页" rowKey={entry => entry ? `${entry.kind}:${entry.content.id}:${entry.plan.id}` : ''} showHeader={false} columns={[{key: 'publication', render: (_, entry) => planCard(entry)}]} empty={<div className="creator-queue-empty"><p>{channelIds?.length === 0 ? '尚未选择渠道。' : dayPlans.length ? '没有匹配的当天安排。' : '这一天在所选渠道中没有发布安排。'}</p><Button disabled={busy} onClick={() => {positionedFocus.current = focus; setQuery(''); setStatus(''); setChannelIds(null);}}>清除筛选并恢复全部渠道</Button></div>}/></section><p role="status">{notice}</p>{details && focus && <CalendarManagement {...props} busy={busy || !!dialog} selectedDay={selected} focus={focus} close={() => {if (hasManagedDrafts()) {setNotice('请先保存或明确关闭尚未完成的发布编辑。'); return;} setDetails(false);}}/>}{creating && <ManagementDialog title="选择要发布的内容" busy={busy} dirty={false} close={() => setCreating(false)}><p className="muted">选一篇已保存的内容，继续为 {selected} 安排发布。</p><label>发布内容<PopupSelect searchable aria-label="选择发布内容" value={contentId} disabled={busy} onChange={setContentId}><option value="">请选择内容</option>{contentId && !documents.some(item => item.id === contentId) && <option value={contentId} disabled>原内容暂不可用，请重新选择</option>}{documents.map(item => <option key={item.id} value={item.id}>{item.title || '未命名内容'}</option>)}</PopupSelect></label><Button theme="solid" disabled={busy || !documents.some(item => item.id === contentId)} onClick={() => {setCreating(false); setDialog({mode: 'plan', kind: 'content', documentId: contentId});}}>继续安排</Button></ManagementDialog>}{dialog && <PublicationEditor key={`${dialog.mode}:${dialog.kind}:${dialog.documentId}:${dialog.plan?.id ?? ''}`} props={props} selection={dialog} initialDay={selected} close={() => setDialog(null)}/>}</section>;
}

export function PromptsPage(props: Pick<Props, 'workspace'> & WorkspaceManagementProps & {initialContentId?: string | null; currentContentId?: string | null; openContentBody?(contentId: string): Promise<void>; importPrompt?(): Promise<{title: string; body: string} | null>}) {
  const {workspace, library, busy} = props;
  const [query, setQuery] = useState(''), [category, setCategory] = useState(''), [view, setView] = useState('active'), [promptStatus, setPromptStatus] = useState(''), [favoriteOnly, setFavoriteOnly] = useState('');
  const [promptPage, setPromptPage] = useState(1), [promptPageSize, setPromptPageSize] = useState(20), [promptMenuId, setPromptMenuId] = useState<string | null>(null);
  useEffect(() => {setPromptPage(1); setPromptMenuId(null);}, [query, category, view, promptStatus, favoriteOnly]);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Prompt | null>(null), [editing, setEditing] = useState<WorkspaceLibraryPrompt | null | undefined>(undefined), [imported, setImported] = useState<{title: string; body: string} | null>(null);
  const {mutate, notice, setNotice, pendingIds} = useWorkspaceMutation(props);
  const [contentId, setContentId] = useState(props.initialContentId ?? '');
  const contents = workspace?.contents.filter(item => !item.deletedAt) ?? [];
  const context = contents.find(item => item.id === contentId) ?? null;
  const currentContent = contents.find(item => item.id === props.currentContentId);
  const currentPrompt = (library?.prompts ?? workspace?.prompts)?.find(prompt => prompt.id === selected?.id);
  const unavailable = !currentPrompt || 'deletedAt' in currentPrompt && currentPrompt.deletedAt ? '这条提示词已移入回收站或不再可用，暂时无法填写或复制。本次填写仍保留。' : !currentPrompt.enabled ? '这条提示词已停用，暂时无法填写或复制。本次填写仍保留，重新启用后可继续。' : '';
  const prompts = library?.prompts.filter(prompt => view === 'trash' ? !!prompt.deletedAt : !prompt.deletedAt) ?? workspace?.prompts.filter(prompt => prompt.enabled) ?? [];
  const categories = [...new Set([...(library?.settings.visiblePromptCategories ?? []), ...prompts.map(prompt => prompt.category)].filter(Boolean))];
  const matching = prompts.filter(prompt => (!promptStatus || (promptStatus === 'enabled' ? prompt.enabled : !prompt.enabled)) && (!favoriteOnly || ('favorite' in prompt && prompt.favorite === true)) && (!category || prompt.category === category) && `${prompt.title} ${prompt.body} ${prompt.summary} ${prompt.when} ${prompt.tags.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => a.title.localeCompare(b.title, 'zh-CN') || a.id.localeCompare(b.id));
  const currentPromptPage = Math.min(promptPage, Math.max(1, Math.ceil(matching.length / promptPageSize)));
  function addPrompt() { setImported(null); setEditing(null); }
  async function copyCard(prompt: Prompt) {
    if (busy || copyingId || view === 'trash' || !prompt.enabled) return;
    if (promptFields(prompt.body).length) { setSelected(prompt); return; }
    setCopyingId(prompt.id);
    try { await invoke('copyPrompt', {text: prompt.body}); setNotice(`已复制“${prompt.title}”，可以粘贴到助手。`); }
    catch { setNotice('复制失败，请打开提示词后手动复制。'); }
    finally { setCopyingId(null); }
  }
  return <section className="workspace-page prompt-workspace">
    <header className="creator-page-heading"><div><p className="eyebrow">PROMPT LIBRARY</p><h2>提示词</h2><p>选择一条，填入你的情况，再复制给助手。</p><div className="creator-page-stats"><span>{prompts.length} 条提示词</span><span>{categories.length} 个分类</span></div></div><div className="management-actions">{props.importPrompt && <Button disabled={busy || !library} onClick={() => void props.importPrompt?.().then(value => { if (value) {setImported(value); setEditing(null);} })}>从文件导入</Button>}<Button theme="solid" disabled={busy || !library} onClick={addPrompt}>＋ 添加提示词</Button></div></header>
    {props.openContentBody && <div className="actions"><Button id="return-prompt-content-body" disabled={busy || !context} onClick={() => context && void props.openContentBody?.(context.id)}>返回关联内容正文</Button><span className="muted" role="status">{context ? `将打开：${context.title || '未命名内容'}` : contentId ? '关联内容已移入回收站或不再可用，请重新选择。' : '请先在“参考内容”中选择一篇已保存内容。'}</span></div>}
    <ListToolbar search={{label: '搜索提示词', placeholder: '搜索标题、正文或使用场景', value: query, change: setQuery, disabled: busy}}><PopupSelect aria-label="提示词分类" searchable value={category} onChange={setCategory}><option value="">全部分类</option>{category && !categories.includes(category) && <option value={category}>{category}</option>}{categories.map(value => <option key={value} value={value}>{value}</option>)}</PopupSelect><PopupSelect aria-label="提示词状态" value={promptStatus} onChange={setPromptStatus}><option value="">全部状态</option><option value="enabled">可用</option><option value="disabled">已停用</option></PopupSelect><PopupSelect aria-label="提示词收藏" value={favoriteOnly} onChange={setFavoriteOnly}><option value="">全部收藏状态</option><option value="favorite">只看收藏</option></PopupSelect><PopupSelect aria-label="提示词范围" value={view} onChange={setView}><option value="active">正常提示词</option><option value="trash">回收站</option></PopupSelect></ListToolbar>
    <details className="prompt-reference-picker"><summary><span>参考内容 <small>可选</small></span><span>{context?.title || (contentId ? '关联内容暂不可用' : '暂不关联内容')}</span></summary><div className="prompt-reference-fields"><label>这次围绕哪篇内容？<PopupSelect searchable aria-label="选择提示词参考内容" value={contentId} disabled={busy} onChange={setContentId}><option value="">暂不关联内容</option>{contentId && !context && <option value={contentId} disabled>关联内容已移入回收站或不再可用</option>}{contents.map(item => <option key={item.id} value={item.id}>{item.title || '未命名内容'}</option>)}</PopupSelect></label><Button disabled={busy || !currentContent} onClick={() => currentContent && setContentId(currentContent.id)}>使用当前已保存内容</Button></div><p>选择后不会自动加入提示词；使用时还需明确勾选，才会复制这篇内容的标题与正文。</p>{!contents.length && <p>先保存一篇内容，即可在这里选择。</p>}</details>
    {notice && <p className="prompt-library-notice" role="status">{notice}</p>}
    <ImageList className="prompt-library-grid">{matching.slice((currentPromptPage - 1) * promptPageSize, currentPromptPage * promptPageSize).map(prompt => {
      const favorite = 'favorite' in prompt && prompt.favorite === true, fields = promptFields(prompt.body).length;
      return <List.Item key={prompt.id}><Card className={`prompt-library-card${!prompt.enabled || view === 'trash' ? ' is-disabled' : ''}`} data-prompt-id={prompt.id}>
        <div className="prompt-card-heading"><Button className="prompt-library-use" theme="borderless" title={prompt.title} aria-label={`打开提示词：${prompt.title}`} disabled={busy || view === 'trash' || !prompt.enabled} onClick={() => setSelected(prompt)}><h3>{prompt.title}</h3></Button><Button theme="borderless" className="prompt-card-favorite" aria-label={`${favorite ? '取消收藏' : '收藏'}提示词：${prompt.title}`} aria-pressed={favorite} disabled={busy || pendingIds.has(prompt.id) || !library || view === 'trash'} onClick={() => void mutate({op: 'setPromptFavorite', id: prompt.id, editToken: prompt.editToken, favorite: !favorite})}>{favorite ? '★' : '☆'}</Button>{library && <Dropdown trigger="click" position="bottomRight" visible={promptMenuId === prompt.id} onVisibleChange={visible => setPromptMenuId(visible ? prompt.id : null)} closeOnEsc render={<Dropdown.Menu>{view !== 'trash' && <><Dropdown.Item disabled={busy || pendingIds.has(prompt.id)} onClick={() => {setPromptMenuId(null); setImported(null); setEditing(library.prompts.find(item => item.id === prompt.id));}}>编辑提示词</Dropdown.Item><Dropdown.Item disabled={busy || pendingIds.has(prompt.id)} onClick={() => {setPromptMenuId(null); void mutate({op: 'setPromptEnabled', id: prompt.id, editToken: prompt.editToken, enabled: !prompt.enabled});}}>{prompt.enabled ? '停用提示词' : '启用提示词'}</Dropdown.Item></>}<Dropdown.Item disabled={busy || pendingIds.has(prompt.id)} onClick={() => {setPromptMenuId(null); void mutate({op: view === 'trash' ? 'restorePrompt' : 'trashPrompt', id: prompt.id, editToken: prompt.editToken});}}>{view === 'trash' ? '恢复提示词' : '移入回收站'}</Dropdown.Item></Dropdown.Menu>}><Button className="prompt-card-menu" theme="borderless" aria-label={`更多操作：${prompt.title}`} aria-haspopup="menu" aria-expanded={promptMenuId === prompt.id} disabled={busy || pendingIds.has(prompt.id)}>•••</Button></Dropdown>}</div>
        <Typography.Paragraph className="prompt-card-preview" ellipsis={{rows:3, expandable:true, collapsible:true, expandText:'查看全部', collapseText:'收起'}}>{prompt.when || prompt.summary || prompt.body}</Typography.Paragraph>
        <div className="prompt-use-footer"><div className="prompt-card-metadata"><span className="prompt-card-category" title={prompt.category || '未分类'}>{prompt.category || '未分类'}</span><span>{view === 'trash' ? '回收站' : prompt.enabled ? '可用' : '已停用'}</span>{fields > 0 && <span>{fields} 项待填</span>}</div>{view === 'trash' ? <Button size="small" disabled={busy || pendingIds.has(prompt.id) || !library} onClick={() => void mutate({op: 'restorePrompt', id: prompt.id, editToken: prompt.editToken})}>恢复提示词</Button> : prompt.enabled ? <Button size="small" theme="solid" disabled={busy || !!copyingId} aria-label={`${fields ? '填写并复制' : '复制提示词'}：${prompt.title}`} onClick={() => void copyCard(prompt)}>{copyingId === prompt.id ? '复制中…' : fields ? '填写并复制' : '复制'}</Button> : <Button size="small" disabled title="在更多操作中启用这条提示词">启用后使用</Button>}</div>
      </Card></List.Item>;
    })}</ImageList>
    <PaginationBar total={matching.length} page={currentPromptPage} pageSize={promptPageSize} onPageSizeChange={setPromptPageSize} onPageChange={value => {setPromptPage(value); setPromptMenuId(null);}} label="提示词分页" disabled={busy}/>
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
      <details className="prompt-optional-fields"><summary>分类与说明 <span>可选</span></summary><div className="management-form"><div className="management-columns"><label>分类<PopupCreatableSelect aria-label="提示词分类" disabled={props.busy} value={category} onChange={setCategory} options={props.library?.settings.visiblePromptCategories ?? []}/></label><label>标签（顿号或逗号分隔）<Input className="semi-control-text" disabled={props.busy} value={tags} onChange={setTags}/></label></div><label>适用场景<Input className="semi-control-text" disabled={props.busy} value={when} onChange={setWhen} placeholder="例如：为一篇文章起标题时"/></label><label>简短说明<Input className="semi-control-text" disabled={props.busy} value={summary} onChange={setSummary}/></label><p className="prompt-editor-help">需要每次填写不同内容时，可用 {'{{变量名|填写提示}}'} 标记，使用时会自动显示填写栏。</p></div></details>
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
  const [reading, setReading] = useState<TemplateGroup | null>(null);
  const readingReturn = useRef<HTMLButtonElement | null>(null);
  const [workflowTemplateId, setWorkflowTemplateId] = useState<string | null>(null);
  const [workflowExpanded, setWorkflowExpanded] = useState(false);
  const [workflowRequest, setWorkflowRequest] = useState(0);
  const workflowSection = useRef<HTMLElement>(null), workflowReturnId = useRef<string | null>(null), templateSearch = useRef<HTMLInputElement>(null);
  const [workflowNotice, setWorkflowNotice] = useState('');
  const [groupChoices, setGroupChoices] = useState<Record<string, string>>({});
  function showWorkflow(templateId: string, fromCard = false) {
    if (fromCard) workflowReturnId.current = templateId;
    setWorkflowTemplateId(templateId);
    setWorkflowExpanded(true);
    setWorkflowRequest(value => value + 1);
  }
  function openWorkflow(templateId: string, fromCard = false) {
    if (templateId !== workflowTemplateId && hasManagedDrafts()) {setWorkflowNotice('补充要求尚未提交，请先发起AI拆解，或放弃补充要求后再切换模板。'); return;}
    setWorkflowNotice('');
    showWorkflow(templateId, fromCard);
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
  function importImages(template: WorkspaceLibraryTemplate | null = null) {
    if (busy || !library || importing) return;
    if (hasManagedDrafts()) {setWorkflowNotice('请先提交或放弃当前补充要求，再导入其他样张。'); return;}
    setImporting({template, images: []});
  }
  async function startStudy(templateId: string, confirmed?: WorkspaceLibrarySnapshot) {
    setWorkflowNotice('');
    if (confirmed) setSource('mine');
    showWorkflow(templateId);
    try {
      if (confirmed) await props.refresh(confirmed);
      const view = await invoke('readTemplateWorkflow', {templateId});
      if (!view.jobs.length) {
        const setup = await invoke('readTemplateAssistantSetup');
        if (!setup.ready) {setWorkflowNotice('样张已保存。请在设置中准备好助手，再从这里开始AI拆解。'); return;}
        await invoke('startTemplateStudy', {templateId, version: view.currentVersion, editToken: view.editToken, notes: ''});
        setWorkflowNotice('已请求打开助手。可在下方刷新拆解结果，查看接单与回传状态。');
      }
    } catch (error) {
      setWorkflowNotice('模板已保留。助手尚未成功打开，请在下方继续当前任务；若未建立任务，可重新发起AI拆解。');
      throw error;
    } finally {await props.refresh();}
  }
  async function study(templateId: string, fromCard = false) {
    if (busy || !library) return;
    if (hasManagedDrafts()) {openWorkflow(templateId, fromCard); return;}
    if (fromCard) workflowReturnId.current = templateId;
    await props.run(async () => {
      const source = library.templates.find(template => template.id === templateId);
      const version = source?.versions.find(version => version.version === source.currentVersion);
      if (!source || !version) return;
      let targetId = source.id;
      if (source.builtin) {
        const existing = library.templates.filter(template => !template.deletedAt && !template.builtin && template.derivedFrom?.id === source.id && template.derivedFrom.version === version.version).at(-1);
        if (existing) targetId = existing.id;
        else {
          const saved = await invoke('mutateWorkspace', {op: 'deriveTemplate', sourceTemplateId: source.id, sourceVersion: version.version, sourcePackageHash: version.packageHash, name: `${source.title.slice(0, 100)} · 我的副本`});
          targetId = saved.objectId;
          showWorkflow(targetId);
          setGroupChoices(old => ({...old, [source.id]: targetId}));
          await props.refresh(saved.library);
        }
        setGroupChoices(old => ({...old, [source.id]: targetId}));
      }
      await startStudy(targetId);
    });
  }
  const [query, setQuery] = useState(''), [preview, setPreview] = useState<TemplateGroup | null>(null), [source, setSource] = useState<'all' | 'mine' | 'builtin'>('builtin');
  const [templatePage, setTemplatePage] = useState(1), [templatePageSize, setTemplatePageSize] = useState(10);
  const [templateMenuId, setTemplateMenuId] = useState<string | null>(null);
  useEffect(() => {setTemplatePage(1); setTemplateMenuId(null);}, [query, source]);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (preview) dialog.current?.showModal(); }, [preview]);
  const groups = new Map<string, TemplateGroup[]>();
  const templateFacts = new Map(library?.templates.map(template => [template.id, template]));
  for (const template of assets?.templates ?? []) {
    if (!isSelectableTemplate(template)) continue;
    let sourceId = template.id, ancestor = template.derivedFrom;
    const seen = new Set([sourceId]);
    while (ancestor && !seen.has(ancestor.id)) {
      sourceId = ancestor.id;
      seen.add(sourceId);
      ancestor = templateFacts.get(sourceId)?.derivedFrom ?? null;
    }
    groups.set(sourceId, [...groups.get(sourceId) ?? [], template]);
  }
  const matching = [...groups].filter(([, members]) => (source === 'all' || members.some(template => source === 'builtin' ? template.builtin : !template.builtin)) && members.some(template => `${template.name} ${template.description}`.toLowerCase().includes(query.toLowerCase()))).map(([sourceId, members]) => ({sourceId, members, template: members.find(template => template.id === groupChoices[sourceId]) ?? members.find(template => template.id === sourceId) ?? members[0]}));
  const currentTemplatePage = Math.min(templatePage, Math.max(1, Math.ceil(matching.length / templatePageSize)));
  const defaults = library?.settings.defaults;
  return <section className="workspace-page creator-templates">
    <header className="creator-page-heading"><div><p className="eyebrow">COVER STYLES</p><h2>封面模板</h2><p>把喜欢的版式与气质存成一组参考，为下一张封面找到风格。</p><div className="creator-page-stats"><span>{[...groups.values()].filter(members => members.some(template => template.builtin)).length} 组内置风格</span><span>{[...groups.values()].filter(members => members.some(template => !template.builtin)).length} 组我的模板</span><span>{assets?.photos.length ?? 0} 张照片</span>{defaults?.templateId && <span>默认：{assets?.templates.find(item => item.id === defaults.templateId)?.name || '原模板暂不可用'}</span>}</div></div><div className="management-actions"><Button disabled={busy || !library} onClick={props.managePhotos}>照片与默认设置</Button><Button disabled={busy || !library} onClick={() => setManaging(!managing)}>{managing ? '收起管理' : '版本与回收站'}</Button><Button theme="solid" disabled={busy || !library || !!importing} onClick={() => void importImages()}>＋ 导入我的模板</Button></div></header>
    <details><summary>拖拽导入参考图</summary><FileDropzone kind="template" disabled={busy || !library || !!importing || hasManagedDrafts()} run={props.run} buttonLabel="选择模板图片" onImported={images => setImporting({template: null, images})}/></details>
    {managing && <TemplateManagement {...props} busy={busy || !!importing} addVersion={template => void importImages(template)}/>}
    <div className="creator-template-layout"><div className="creator-template-library">
      <ListToolbar search={{label: '搜索模板', placeholder: '搜索名称、风格或适用内容', value: query, change: setQuery, disabled: busy, inputRef: templateSearch}}><PopupSelect aria-label="模板来源" value={source} onChange={value => setSource(value === 'mine' ? 'mine' : value === 'builtin' ? 'builtin' : 'all')}><option value="all">全部模板</option><option value="mine">我的模板</option><option value="builtin">内置模板</option></PopupSelect></ListToolbar>
      <ImageList className="creator-template-grid">{matching.slice((currentTemplatePage - 1) * templatePageSize, currentTemplatePage * templatePageSize).map(({template, members, sourceId}) => <List.Item key={sourceId}><Card className="creator-style-card">
        <div className="creator-template-art"><TemplatePreview template={template} disabled={busy} preview={() => setPreview(template)}/><Button className="creator-template-use" theme="solid" disabled={busy || !library || !template.samples.length} onClick={() => useTemplate(template)} aria-label={`使用模板：${template.name}`}>用此风格生成</Button></div>
        <div className="creator-style-card-body"><h3 title={template.name}>{template.name}</h3><span className="creator-template-group-count">{template.samples.length} 张 · {template.builtin ? '内置' : '我的模板'}</span><div className="creator-style-actions template-study-entry"><Button id={`template-workflow-trigger-${sourceId}`} disabled={busy || !library} aria-controls="template-learning-workflow" aria-expanded={workflowExpanded && members.some(item => item.id === workflowTemplateId)} onClick={() => {workflowReturnId.current = sourceId; if (template.accepted && template.aiTested || workflowTemplateId === template.id) openWorkflow(template.id); else void study(template.id);}}>{template.accepted && template.aiTested || workflowTemplateId === template.id ? '查看拆解' : 'AI拆解风格'}</Button></div><Popover trigger="click" position="bottomRight" visible={templateMenuId === sourceId} onVisibleChange={visible => setTemplateMenuId(current => visible ? sourceId : current === sourceId ? null : current)} closeOnEsc guardFocus returnFocusOnClose autoAdjustOverflow showArrow={false} content={({initialFocusRef}) => <div tabIndex={-1} ref={element => {if (initialFocusRef && element) initialFocusRef.current = element;}} className="creator-template-detail-body" role="dialog" aria-label={`${template.name}的详情与操作`}><h3>{template.name}</h3><p className="creator-template-detail-summary">{template.description || '使用这组参考，为你的内容制作封面。'}</p>{members.length > 1 && <label className="template-group-choice">工作版本<PopupSelect searchable aria-label={`${template.name}的工作版本`} value={template.id} disabled={busy} onChange={id => setGroupChoices(old => ({...old, [sourceId]: id}))}>{members.map(item => <option key={item.id} value={item.id}>{item.builtin ? '内置原样张' : item.name} · v{item.version}</option>)}</PopupSelect></label>}<p className="muted">v{template.version}{defaults?.templateId === template.id ? ' · 当前默认' : ''} · {template.builtin ? '内置 · 可直接使用' : template.accepted && template.aiTested ? '已记录人工验收' : '效果待验收'}</p><Button className="creator-template-read-more" theme="borderless" disabled={busy} onClick={() => {readingReturn.current = document.querySelector<HTMLButtonElement>(`[data-template-menu="${sourceId}"]`); setTemplateMenuId(null); setReading(template);}}>查看详情与完整说明</Button><Button theme="borderless" disabled={busy} onClick={() => {setTemplateMenuId(null); setPreview(template);}}>查看整组样张</Button><Button theme="borderless" disabled={busy} onClick={() => {setTemplateMenuId(null); void props.run(async () => {const result = await invoke('revealTemplateFolder', {templateId: template.id}); setWorkflowNotice(result.reportWarnings?.length ? result.reportWarnings.join('；') : '模板目录已打开，可查看归档说明。');});}}>打开模板文件夹</Button></div>}><Button data-template-menu={sourceId} className="creator-template-details" theme="borderless" aria-label={`${template.name}的详情与操作`} aria-haspopup="dialog" aria-expanded={templateMenuId === sourceId} disabled={busy}>•••</Button></Popover></div>
      </Card></List.Item>)}</ImageList>
      <PaginationBar label="模板分页" total={matching.length} page={currentTemplatePage} pageSize={templatePageSize} pageSizeOpts={[5, 10, 20]} onPageSizeChange={value => {setTemplatePageSize(value); setTemplateMenuId(null);}} disabled={props.busy} onPageChange={value => {setTemplatePage(value); setTemplateMenuId(null);}}/>
      {!matching.length && <section className="creator-panel creator-empty"><span className="creator-empty-icon" aria-hidden="true">▧</span><h3>{assets?.templates.length ? '没有找到合适的模板' : '把喜欢的风格存成模板'}</h3><p>{assets?.templates.length ? '换个关键词，或切换到全部模板。' : '从本机导入一组参考样张，之后可以反复使用。'}</p>{assets?.templates.length ? <Button disabled={busy} onClick={() => {setQuery(''); setSource('all');}}>查看全部模板</Button> : <Button theme="solid" disabled={busy || !library} onClick={() => void importImages()}>导入参考样张</Button>}</section>}
      <p className="creator-footnote">一组可保存 1–50 张参考。参考数量与生成候选数量分别设置；原图只从你的内容库读取。</p>
    </div></div>
    {reading && <ManagementDialog title={`${reading.name} · 模板详情`} busy={busy} dirty={false} close={() => {setReading(null); requestAnimationFrame(() => readingReturn.current?.focus());}}><div className="template-reading-body"><p className="muted">v{reading.version} · 整组 {reading.samples.length} 张 · {reading.builtin ? '内置模板' : '我的模板'}</p><h3>模板说明</h3><p>{reading.description || '使用这组参考，为你的内容制作封面。'}</p>{reading.sourceScopeWarning && <p className="template-source-scope">{reading.sourceScopeWarning}</p>}{reading.designNotes && <><h3>来源拆解资料</h3><p>{reading.designNotes}</p></>}<Button disabled={busy} onClick={() => setPreview(reading)}>查看整组 {reading.samples.length} 张样张</Button></div></ManagementDialog>}
    {preview && <dialog ref={dialog} className="image-preview" onCancel={() => setPreview(null)} aria-label={preview.name}><div className="dialog-heading"><div><h2>{preview.name}</h2><p>{preview.samples.length} 张风格样张 · 同一模板组 · v{preview.version}</p></div><Button onClick={() => setPreview(null)}>关闭预览</Button></div><p className="creator-preview-description">{preview.description}</p><div className="preview-grid">{preview.samples.map((sample, index) => <ImagePreviewButton key={sample.assetHash} url={sample.url} label={`${preview.name}样张 ${index + 1}`} loading="lazy"/>)}</div></dialog>}
    <p role="status">{workflowNotice}</p>{workflowTemplateId && <section id="template-learning-workflow" aria-label="AI拆解与人工确认" hidden={!workflowExpanded} tabIndex={-1} ref={workflowSection}><Card title="AI拆解风格" headerExtraContent={<Button disabled={busy} onClick={closeWorkflow}>收起</Button>}><TemplateWorkflowPanel templateId={workflowTemplateId} library={library} assets={assets} busy={busy} run={props.run} refresh={props.refresh} onDerive={() => study(workflowTemplateId)}/></Card></section>}
    {importing && <TemplateImportDialog props={props} template={importing.template} initialImages={importing.images} close={() => setImporting(null)} onImported={startStudy}/>}
  </section>;
}

function CalendarManagement(props: Props & WorkspaceManagementProps & {selectedDay: string; focus: PublicationFocus; close(): void}) {
  const {library, busy, focus} = props;
  const document = (focus.kind === 'content' ? library?.contentDetails : library?.collections)?.find(item => item.id === focus.id);
  const content = focus.kind === 'content' ? props.workspace?.contents.find(item => item.id === focus.id) : null;
  return <section className="workspace-management" id="calendar-publication-manager"><div className="calendar-manager-heading"><div><h3>{document?.title || '原内容暂不可用'}</h3>{content && <Button theme="borderless" disabled={busy} onClick={() => {if (hasManagedDrafts()) return; props.open(content);}}>打开内容详情 →</Button>}</div><Button disabled={busy} onClick={props.close}>收起详情</Button></div><PublicationPanel {...props} focusRequest={focus} documentId={focus.id} kind={focus.kind} focusedPlanId={focus.planId} selectedDay={props.selectedDay}/></section>;
}

function TemplateManagement(props: WorkspaceManagementProps & {addVersion(template: WorkspaceLibraryTemplate): void}) {
  const [showLegacy, setShowLegacy] = useState(false);
  const [trash, setTrash] = useState(false), [query, setQuery] = useState(''), [page, setPage] = useState(1), [pageSize, setPageSize] = useState(20), {mutate, notice} = useWorkspaceMutation(props);
  useEffect(() => setPage(1), [trash, query]);
  const templates = props.library?.templates.filter(item => !!item.deletedAt === trash && (showLegacy || item.catalogStatus !== 'legacy') && `${item.title} ${item.versions.length}`.toLowerCase().includes(query.trim().toLowerCase())) ?? [];
  const currentPage = Math.min(page, Math.max(1, Math.ceil(templates.length / pageSize)));
  return <div className="workspace-management"><Card title="模板管理"><div className="management-toolbar"><span className="muted">切换版本只影响之后的选择，已有封面与发布历史会保留。</span><Button onClick={() => {setShowLegacy(!showLegacy); setPage(1);}}>{showLegacy ? '收起历史内置' : '查看历史内置'}</Button><Button onClick={() => setTrash(!trash)}>{trash ? '返回可用模板' : '模板回收站'}</Button></div><ListToolbar search={{label: '搜索管理模板', value: query, change: value => {setQuery(value); setPage(1);}, placeholder: '搜索模板名称'}}/><p role="status">{notice}</p><DataTable rows={templates.slice((currentPage - 1) * pageSize, currentPage * pageSize)} total={templates.length} page={currentPage} pageSize={pageSize} onPageSizeChange={setPageSize} disabled={props.busy} onPageChange={setPage} label="模板管理分页" showHeader={false} columns={[{key: 'template', render: (_, item) => <div className="management-row" key={item.id}><div><strong>{item.title}</strong><p className="muted">当前 v{item.currentVersion} · 共 {item.versions.length} 个版本</p></div><div className="management-actions">{!trash && item.catalogStatus === 'legacy' && <Button disabled={props.busy} onClick={() => {const version = item.versions.find(version => version.version === item.currentVersion); if (version) void mutate({op: 'deriveTemplate', sourceTemplateId: item.id, sourceVersion: version.version, sourcePackageHash: version.packageHash, name: `${item.title.slice(0, 100)} · 我的副本`});}}>复制为我的模板</Button>}{!trash && !item.builtin && <Button disabled={props.busy} onClick={() => props.addVersion(item)}>添加新版本</Button>}{!trash && <label>当前版本<PopupSelect searchable aria-label={`${item.title}的当前版本`} disabled={props.busy} value={String(item.currentVersion)} onChange={value => void mutate({op: 'selectTemplateVersion', id: item.id, editToken: item.editToken, version: Number(value)})}>{item.versions.map(version => <option key={version.version} value={String(version.version)}>v{version.version}</option>)}</PopupSelect></label>}<Button disabled={props.busy} onClick={() => void mutate({op: trash ? 'restoreTemplate' : 'trashTemplate', id: item.id, editToken: item.editToken})}>{trash ? '恢复模板' : '移入回收站'}</Button></div></div>}]} />{!templates.length && <p className="muted">{query ? '没有找到匹配的模板。' : trash ? '模板回收站为空。' : '还没有模板。'}</p>}</Card></div>;
}

function TemplateImportDialog({props, template, initialImages, close, onImported}: {props: WorkspaceManagementProps; template: WorkspaceLibraryTemplate | null; initialImages: WorkspaceTemplateImage[]; close(): void; onImported(templateId: string, confirmed: WorkspaceLibrarySnapshot): Promise<void>}) {
  const [images, setImages] = useState(initialImages), [name, setName] = useState(template?.title ?? initialImages[0]?.originalName.replace(/\.[^.]+$/, '').slice(0, 200) ?? ''), [description, setDescription] = useState(template?.description ?? ''), [rulesText, setRulesText] = useState(template?.rules.join('\n') ?? ''), [notice, setNotice] = useState('');
  const submitting = useRef(false);
  const rules = rulesText.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  const nextVersion = template ? Math.max(...template.versions.map(item => item.version)) + 1 : 1;
  const invalidRules = rules.length > 100 || rules.some(rule => rule.length > 2000);
  const invalid = props.busy || !name.trim() || images.length < 1 || images.length > 50 || invalidRules;
  function receiveImages(chosen: WorkspaceTemplateImage[]) {
    setImages(chosen);
    if (!name.trim()) setName(chosen[0]?.originalName.replace(/\.[^.]+$/, '').slice(0, 200) ?? '');
    setNotice('已更新样张，填写内容已保留。');
  }
  async function chooseFolder() {
    if (props.busy) return;
    await props.run(async () => {
      const chosen = await invoke('chooseTemplateFolder');
      if (chosen) receiveImages(chosen);
      else setNotice('已取消选择，原有填写保留。');
    });
  }

  async function save(study: boolean) {
    if (invalid || submitting.current) return;
    submitting.current = true;
    try {await props.run(async () => {
      const fields = {description, rules, styleAssetHashes: images.map(image => image.assetHash)};
      let saved;
      try {saved = await invoke('mutateWorkspace', template ? {op: 'addTemplateVersion', id: template.id, editToken: template.editToken, version: nextVersion, ...fields} : {op: 'createTemplate', name: name.trim(), ...fields});}
      catch (error) {setNotice('导入尚未确认完成，填写已保留。请查看工作台的错误与恢复入口。'); throw error;}
      close();
      if (study) await onImported(saved.objectId, saved.library);
      else await props.refresh(saved.library);
    }, {refreshWorkspaceOnSuccess: false});} finally {submitting.current = false;}
  }
  return <ManagementDialog title={template ? `为「${template.title}」添加样张` : '导入我的模板'} busy={props.busy} dirty close={close}><form className="management-form template-import-form" onSubmit={event => {event.preventDefault(); void save(!template);}}><fieldset disabled={props.busy}><div className="management-form">
    <FileDropzone kind="template" disabled={props.busy} run={props.run} label={images.length ? '拖入图片，替换本次参考样张' : '将一组参考图片拖到这里'} buttonLabel={images.length ? '重新选择样张' : '选择参考图片'} onImported={receiveImages}/><Button aria-label="选择文件夹（读取文件夹内图片，不含子文件夹）" disabled={props.busy} onClick={() => void chooseFolder()}>选择文件夹</Button>
    <label>模板名称<Input className="semi-control-text" disabled={props.busy} required maxLength={200} readonly={!!template} value={name} onChange={setName} placeholder="例如：我的蓝白知识卡片"/></label>
    {!!images.length && <><strong>已选 {images.length} 张参考样张</strong><div className="template-import-grid">{images.map((image, index) => <figure key={image.assetHash}><img src={image.url} alt={`待导入样张 ${index + 1}：${image.originalName}`}/><figcaption><strong>{image.originalName}</strong><Button disabled={props.busy} onClick={() => setImages(old => old.filter(item => item.assetHash !== image.assetHash))}>移除这张</Button></figcaption></figure>)}</div></>}
    <details className="template-import-extras"><summary>补充要求（可选）</summary><div className="management-form"><label>模板说明<TextArea className="semi-control-text" disabled={props.busy} maxLength={10000} value={description} onChange={setDescription} placeholder="这组风格适合什么内容，希望保留什么特点。"/></label><label>固定规则（每行一条）<TextArea className="semi-control-text" disabled={props.busy} value={rulesText} onChange={setRulesText} placeholder="例如：标题保持两行以内"/></label>{invalidRules && <p className="danger-note">最多填写 100 条固定规则，每条不超过 2000 字。</p>}</div></details>
  </div></fieldset><p role="status" className="management-notice">{notice}</p><div className="management-actions"><Button theme="solid" htmlType="submit" disabled={invalid}>{template ? '保存样张' : '导入并让AI拆解'}</Button>{!template && <Button theme="borderless" disabled={invalid} onClick={() => void save(false)}>仅保存样张</Button>}</div></form></ManagementDialog>;
}
