import { useEffect, useRef, useState } from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import Card from '@douyinfe/semi-ui-19/lib/es/card';
import type { Content, DesktopResults } from '../shared/contracts.ts';
import type { CoverResults, TemplateGroup } from '../shared/cover-contracts.ts';
import { invoke } from './client.ts';
import { dayDate, localDay, pastedPrompt, promptFields, promptPreview, scheduleDay, shiftDay } from './workspace-model.ts';
import type {WorkspaceLibraryPrompt, WorkspaceLibrarySnapshot, WorkspaceLibraryTemplate, WorkspaceTemplateImage, WorkspaceKind} from '../shared/workspace-contracts.ts';
import {ManagementDialog, hasManagedDrafts, useManagedDraftGuard, useWorkspaceMutation, type WorkspaceManagementProps} from './library-panels.tsx';
import './workspace-management.css';
import './creator-pages.css';
import './prompt-workspace.css';
import {TemplateWorkflowPanel} from './template-workflow-panel.tsx';
import {publicationEntries} from '../shared/publication-view.ts';
import {PublicationPanel, type PublicationFocus} from './publication-panel.tsx';
import {publicationTime} from './publication-model.ts';
export type Page = 'overview' | 'templates' | 'content' | 'calendar' | 'prompts';
export const pageNames: Record<Page, string> = { overview: '总览', templates: '模板', content: '内容', calendar: '日历', prompts: '提示词' };
type Snapshot = DesktopResults['readWorkspace'];
type Prompt = Snapshot['prompts'][number];
interface Props { workspace: Snapshot | null; open(item: Content): void; busy: boolean }
function scheduled(workspace: Snapshot | null, library?: WorkspaceLibrarySnapshot | null) {
  if (library) return publicationEntries(library).map(entry => ({content: entry.document, kind: entry.kind, plan: {...entry.plan, schedule: entry.schedule}, day: entry.day, channel: entry.channel}));
  return (workspace?.contents ?? []).filter(item => !item.deletedAt).flatMap(content => content.plans.filter(plan => plan.status !== 'cancelled').map(plan => ({content, kind: 'content' as const, plan, day: scheduleDay(plan.schedule), channel: workspace?.channels.find(item => item.id === plan.channelId)?.name ?? '原渠道已不可用'}))).sort((a, b) => a.day.localeCompare(b.day));
}
function overviewCover(contentId: string, kind: WorkspaceKind, workspace: Snapshot | null, library: WorkspaceLibrarySnapshot | null, planId?: string) {
  const document = kind === 'collection' ? library?.collections.find(item => item.id === contentId) : library?.contentDetails.find(item => item.id === contentId);
  const choice = document?.plans.find(plan => plan.id === planId)?.coverChoice;
  const selectedId = choice && 'candidateId' in choice ? choice.candidateId : choice && 'variantId' in choice ? document?.coverVariants.find(variant => variant.id === choice.variantId)?.selectedCandidateId : !planId && kind === 'content' ? workspace?.contents.find(item => item.id === contentId)?.selectedCandidateId : null;
  const candidate = document?.candidates.find(item => item.id === selectedId);
  return {id: selectedId ?? null, url: candidate && 'url' in candidate && typeof candidate.url === 'string' ? candidate.url : null};
}
export function Overview({workspace, library, open, openCollection, busy, createContent, openTemplates, openCalendar, generate}: Props & {library: WorkspaceLibrarySnapshot | null; openCollection?(focus?: PublicationFocus): void; createContent?(): void; openTemplates?(): void; openCalendar?(focus?: PublicationFocus): void; generate?(item: Content): void}) {
  const [notice, setNotice] = useState(''), [working, setWorking] = useState(false);
  const now = new Date(), today = localDay(now), weekStart = shiftDay(today, -(now.getDay() + 6) % 7), weekEnd = shiftDay(weekStart, 6);
  const items = workspace?.contents.filter(item => !item.deletedAt && !library?.contentDetails.find(detail => detail.id === item.id)?.isExample) ?? [];
  const recent = [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const plans = scheduled(workspace, library).filter(item => item.kind === 'collection' || items.some(content => content.id === item.content.id));
  const upcoming = plans.filter(item => item.plan.status === 'planned' && item.day >= today), overdue = plans.filter(item => item.plan.status === 'planned' && item.day < today);
  const weekPlans = plans.filter(item => item.day >= weekStart && item.day <= weekEnd), published = weekPlans.filter(item => item.plan.status === 'published');
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
  async function copyText() {
    if (!featured || disabled) return;
    setWorking(true);
    try { await invoke('copyPrompt', {text}); setNotice('已复制这次准备发布的文字。'); }
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
    <header className="creator-page-heading"><div><p className="eyebrow">{new Intl.DateTimeFormat('zh-CN', {month: 'long', day: 'numeric', weekday: 'long'}).format(now)}</p><h2>今天，从这里继续</h2><p>整理灵感、选好封面，让每一篇内容准备就绪。</p></div><div className="management-actions">{openTemplates && <Button disabled={disabled} onClick={openTemplates}>浏览封面模板</Button>}{createContent && <Button theme="solid" disabled={disabled || !workspace} onClick={createContent}>＋ 新建内容</Button>}</div></header>
    <div className="creator-stats">{[{label: '内容库', value: items.length, note: '篇自己的内容'}, {label: '今天待发布', value: upcoming.filter(item => item.day === today).length, note: '条已安排计划'}, {label: '待选封面', value: needsSelection.length, note: '篇已有候选'}, {label: '本周已发布', value: published.length, note: '条人工发布记录'}].map(stat => <div className="creator-stat" key={stat.label}><span>{stat.label}</span><strong>{workspace ? stat.value : '—'}</strong><small>{stat.note}</small></div>)}</div>
    <div className="creator-overview-layout"><div className="creator-overview-main">
      <section className="creator-panel creator-featured"><div className="creator-panel-heading"><h3>{next ? '接下来发布' : '继续最近的创作'}</h3>{next && <span className="creator-status-pill">{next.day === today ? '今天' : next.day} · {next.channel}</span>}{!next && featured && <span className="creator-status-pill">最近更新</span>}</div>
        {featured ? <><div className="creator-featured-content"><button className="creator-featured-cover" disabled={disabled || featuredKind === 'collection' && !openCollection} onClick={openFeatured} aria-label={`打开 ${featured.title || '未命名内容'}`}>{cover?.url ? <img src={cover.url} alt={`${featured.title || '未命名内容'}的所选封面`}/> : <span><span className="creator-cover-symbol" aria-hidden="true">▧</span><strong>{cover?.id ? '封面预览暂不可用' : noPlannedCover ? '本次不记录封面' : '封面还没选好'}</strong><small>{featuredKind === 'collection' ? '打开合集查看封面' : '打开内容，继续制作'}</small></span>}</button><div className="creator-featured-copy"><span className="creator-overline">{featuredKind === 'collection' ? '合集' : '我的内容'}</span><h3>{featured.title || '未命名内容'}</h3><p className="creator-body-excerpt">{text || (emptyPlanText ? '这条计划设为发布空文字。' : '正文还留着空白，打开内容把这次的想法写下来。')}</p><div className="creator-content-facts"><span>{cover?.id ? '已选封面' : noPlannedCover ? '本次不记录封面' : '封面待准备'}</span><span>{next ? '已有发布计划' : '尚无接下来的发布安排'}</span></div><div className="management-actions"><Button theme="solid" disabled={disabled || featuredKind === 'collection' && !openCollection} onClick={openFeatured}>{featuredKind === 'collection' ? '查看发布安排' : '继续编辑'}</Button>{featuredKind === 'content' && !cover?.id && !noPlannedCover && generate && <Button disabled={disabled} onClick={() => generate(featured)}>制作封面</Button>}</div></div></div><footer className="creator-featured-actions"><div className="management-actions"><Button theme="borderless" disabled={disabled || !text} onClick={() => void copyText()}>复制发布文字</Button>{featuredKind === 'content' && cover?.id && <Button theme="borderless" disabled={disabled} onClick={() => void downloadCover()}>下载封面</Button>}</div>{openCalendar && <Button theme="borderless" disabled={disabled} onClick={() => featured && openCalendar?.({kind: featuredKind, id: featured.id, planId: next?.plan.id, day: next?.day})}>{next ? '查看计划 / 记录已发布 →' : '安排发布日期 →'}</Button>}</footer></> : <div className="creator-empty"><span className="creator-empty-icon" aria-hidden="true">▤</span><h3>把第一个想法写下来</h3><p>先保存标题和正文，再选择模板、制作封面。</p>{createContent && <Button theme="solid" disabled={disabled || !workspace} onClick={createContent}>新建第一篇内容</Button>}</div>}
      </section>
      <section className="creator-panel"><div className="creator-panel-heading"><div><h3>本周发布节奏</h3><p>{weekStart.slice(5)} — {weekEnd.slice(5)} · 已发布 {published.length} 条 / 已安排 {weekPlans.length} 条</p></div>{openCalendar && <Button theme="borderless" disabled={disabled} onClick={() => openCalendar?.()}>查看日历 →</Button>}</div><div className="creator-week">{Array.from({length: 7}, (_, index) => {const day = shiftDay(weekStart, index), dayPlans = weekPlans.filter(item => item.day === day), done = dayPlans.filter(item => item.plan.status === 'published').length; return <button key={day} className={`${day === today ? 'is-today' : ''}${done ? ' has-published' : ''}`} disabled={disabled || !openCalendar} onClick={() => {const entry = dayPlans[0]; openCalendar?.(entry ? {kind: entry.kind, id: entry.content.id, planId: entry.plan.id, day} : undefined);}} aria-label={`${day}，${dayPlans.length} 条安排，${done} 条已发布`}><span>{['周一', '周二', '周三', '周四', '周五', '周六', '周日'][index]}</span><strong>{day.slice(8)}</strong><small>{done ? `${done} 已发布` : dayPlans.length ? `${dayPlans.length} 待发布` : '暂无安排'}</small></button>;})}</div><p className="creator-footnote">按本机保存的计划和实际记录统计；在平台发布后，再来记录。</p></section>
    </div><aside className="creator-overview-side">
      <section className="creator-panel"><div className="creator-panel-heading"><h3>需要处理</h3><span className="creator-small-label">下一步</span></div><div className="creator-attention">{[{label: '候选已到，选一张封面', count: needsSelection.length, note: needsSelection[0]?.title, action: () => needsSelection[0] && open(needsSelection[0])}, {label: '还有内容没做封面', count: needsCover.length, note: needsCover[0]?.title, action: () => {if (needsCover[0]) (generate ?? open)(needsCover[0]);}}, {label: '发布时间已过，待核对', count: overdue.length, note: '查看计划并补记实际发布', action: () => {const entry = overdue[0]; if (entry) openCalendar?.({kind: entry.kind, id: entry.content.id, planId: entry.plan.id, day: entry.day});}}, {label: '尚未安排发布计划', count: noPlan.length, note: noPlan[0]?.title, action: () => noPlan[0] && openCalendar?.({kind: 'content', id: noPlan[0].id})}].filter(item => item.count > 0).map(item => <button key={item.label} disabled={disabled || !item.action} onClick={item.action}><span><strong>{item.label}</strong><small>{item.note || '未命名内容'}</small></span><b>{item.count}<span aria-hidden="true"> ›</span></b></button>)}{!needsSelection.length && !needsCover.length && !overdue.length && !noPlan.length && <div className="creator-calm-state"><span aria-hidden="true">✓</span><p>{items.length ? '当前没有待处理事项' : '新建内容后，下一步会出现在这里'}</p></div>}</div></section>
      <section className="creator-panel"><div className="creator-panel-heading"><h3>最近编辑</h3><span className="creator-small-label">{items.length} 篇内容</span></div><div className="creator-recent">{recent.slice(0, 4).map(item => {const image = overviewCover(item.id, 'content', workspace, library); return <button key={item.id} disabled={disabled} onClick={() => open(item)}><span className="creator-recent-cover">{image.url ? <img src={image.url} alt=""/> : <span aria-hidden="true">▤</span>}</span><span><strong>{item.title || '未命名内容'}</strong><small>{localDay(new Date(item.updatedAt)) === today ? '今天更新' : localDay(new Date(item.updatedAt))} · {item.selectedCandidateId ? '已选封面' : item.candidateCount ? '待选封面' : '待做封面'}</small></span><span aria-hidden="true">›</span></button>;})}{!recent.length && <p className="creator-side-empty">还没有自己的内容。</p>}</div></section>
      {openTemplates && <button className="creator-template-shortcut" disabled={disabled} onClick={openTemplates}><span className="creator-shortcut-icon" aria-hidden="true">▧</span><span><strong>为内容找个好风格</strong><small>浏览模板，准备下一张封面</small></span><span aria-hidden="true">↗</span></button>}
    </aside></div>{notice && <p className="creator-action-notice" role="status">{notice}</p>}
  </section>;
}
export function CalendarPage(props: Props & WorkspaceManagementProps & {initialContentId?: string | null; initialFocus?: PublicationFocus | null}) {
  const {workspace, busy, library} = props;
  const [focus, setFocus] = useState<PublicationFocus | null>(() => props.initialFocus ?? (props.initialContentId ? {kind: 'content', id: props.initialContentId} : null));
  const [selected, setSelected] = useState(props.initialFocus?.day ?? localDay(new Date()));
  const [mode, setMode] = useState<'month' | 'week' | 'date'>('month'), [newPlanRequest, setNewPlanRequest] = useState(0), [notice, setNotice] = useState('');
  useEffect(() => { if (props.initialContentId || props.initialFocus) document.getElementById('calendar-publication-manager')?.scrollIntoView({block: 'start'}); }, [props.initialContentId, props.initialFocus]);
  const date = dayDate(selected), today = localDay(new Date());
  const first = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  const start = mode === 'month' ? shiftDay(localDay(first), -(first.getDay() + 6) % 7) : mode === 'week' ? shiftDay(selected, -(date.getDay() + 6) % 7) : selected;
  const days = Array.from({length: mode === 'month' ? 42 : mode === 'week' ? 7 : 1}, (_, index) => shiftDay(start, index));
  const plans = scheduled(workspace, library), selectedPlans = plans.filter(item => item.day === selected);
  const hasDocuments = !!library && [...library.contentDetails, ...library.collections].some(item => !item.deletedAt);
  function move(direction: number) { if (mode === 'month') { const next = new Date(date.getFullYear(), date.getMonth() + direction, 1, 12); setSelected(localDay(next)); } else setSelected(shiftDay(selected, direction * (mode === 'week' ? 7 : 1))); }
  function manage(next?: PublicationFocus) {
    if (hasManagedDrafts()) { setNotice('还有未保存的发布填写，请先返回编辑窗口保存或明确关闭。'); return; }
    setNotice('');
    if (next) {setFocus(next); if (next.day) setSelected(next.day);}
    else setNewPlanRequest(value => value + 1);
    requestAnimationFrame(() => document.getElementById('calendar-publication-manager')?.scrollIntoView({block: 'start'}));
  }
  return <section className="workspace-page calendar-workspace"><header className="creator-page-heading"><div><p className="eyebrow">发布日历</p><h2>把发布节奏，放进日历</h2><p>安排内容与渠道；完成手动发布后，在这里留下一条记录。</p></div><Button theme="solid" disabled={busy || !hasDocuments} onClick={() => manage()}>＋ 新增发布计划</Button></header><Card><div className="calendar-toolbar"><div className="actions"><Button disabled={busy} onClick={() => move(-1)} aria-label="上一个周期">‹</Button><h3>{mode === 'month' ? `${date.getFullYear()} 年 ${date.getMonth() + 1} 月` : selected}</h3><Button disabled={busy} onClick={() => move(1)} aria-label="下一个周期">›</Button><Button disabled={busy} onClick={() => setSelected(today)}>今天</Button></div><div className="actions">{(['month', 'week', 'date'] as const).map(value => <Button key={value} disabled={busy} theme={mode === value ? 'solid' : 'borderless'} aria-pressed={mode === value} onClick={() => setMode(value)}>{{month: '月', week: '周', date: '日'}[value]}</Button>)}</div></div>
    <label className="calendar-date">查看日期<input aria-label="日历日期" type="date" value={selected} disabled={busy} onChange={event => {if (event.target.value) setSelected(event.target.value);}}/></label>
    {mode !== 'date' && <div className="calendar-weekdays">{['一', '二', '三', '四', '五', '六', '日'].map(day => <span key={day}>周{day}</span>)}</div>}
    <div className={`calendar-grid calendar-${mode}`}>{days.map(day => <section key={day} className={`calendar-cell${day === today ? ' today' : ''}${day === selected ? ' selected' : ''}${dayDate(day).getMonth() !== date.getMonth() ? ' outside' : ''}`}><button className="day-number" disabled={busy} aria-pressed={day === selected} onClick={() => setSelected(day)} aria-label={`选择 ${day}，用于安排发布`}>{mode === 'date' ? day : dayDate(day).getDate()}</button>{plans.filter(item => item.day === day).map(({content, kind, plan, channel}) => <button className={`calendar-plan ${plan.status}`} key={`${kind}:${content.id}:${plan.id}`} disabled={busy} onClick={() => manage({kind, id: content.id, planId: plan.id, day})}><strong>{kind === 'collection' ? '合集 · ' : ''}{content.title}</strong><span>{channel} · {plan.status === 'published' ? '已发布' : '待发布'}</span><span>{publicationTime(plan.schedule)}</span></button>)}{mode === 'date' && !plans.some(item => item.day === day) && <p className="muted">这一天没有发布安排。</p>}</section>)}</div><div className="calendar-selection"><span>已选 {selected} · {selectedPlans.filter(item => item.plan.status === 'planned').length} 条待发布 · {selectedPlans.filter(item => item.plan.status === 'published').length} 条已发布</span><Button theme="borderless" disabled={busy || !hasDocuments} onClick={() => manage()}>为这一天新增计划 →</Button></div></Card><p role="status">{notice}</p><CalendarManagement {...props} selectedDay={selected} focus={focus} newPlanRequest={newPlanRequest}/></section>;
}
export function PromptsPage(props: Pick<Props, 'workspace'> & WorkspaceManagementProps & {initialContentId?: string | null; currentContentId?: string | null; importPrompt?(): Promise<{title: string; body: string} | null>}) {
  const {workspace, library, busy} = props;
  const [query, setQuery] = useState(''), [category, setCategory] = useState(''), [view, setView] = useState<'enabled' | 'all' | 'trash'>('enabled');
  const [selected, setSelected] = useState<Prompt | null>(null), [editing, setEditing] = useState<WorkspaceLibraryPrompt | null | undefined>(undefined), [imported, setImported] = useState<{title: string; body: string} | null>(null);
  const {mutate, notice} = useWorkspaceMutation(props);
  const [contentId, setContentId] = useState(props.initialContentId ?? '');
  const contents = workspace?.contents.filter(item => !item.deletedAt) ?? [];
  const context = contents.find(item => item.id === contentId) ?? null;
  const currentContent = contents.find(item => item.id === props.currentContentId);
  const prompts = library?.prompts.filter(prompt => view === 'trash' ? !!prompt.deletedAt : !prompt.deletedAt && (view === 'all' || prompt.enabled)) ?? workspace?.prompts.filter(prompt => prompt.enabled) ?? [];
  const categories = [...new Set([...(library?.settings.visiblePromptCategories ?? []), ...prompts.map(prompt => prompt.category)].filter(Boolean))];
  const matching = prompts.filter(prompt => (!category || prompt.category === category) && `${prompt.title} ${prompt.body} ${prompt.summary} ${prompt.when} ${prompt.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  function addPrompt() { setImported(null); setEditing(null); }
  return <section className="workspace-page prompt-workspace">
    <header className="creator-page-heading"><div><p className="eyebrow">PROMPT LIBRARY</p><h2>让好用的提示词，随时可用</h2><p>选择一条，填入你的情况，再复制给助手。</p></div><div className="management-actions">{props.importPrompt && <Button disabled={busy || !library} onClick={() => void props.importPrompt?.().then(value => { if (value) {setImported(value); setEditing(null);} })}>从文件导入</Button>}<Button theme="solid" disabled={busy || !library} onClick={addPrompt}>＋ 添加提示词</Button></div></header>
    <div className="prompt-library-toolbar"><div className="prompt-library-views">{([['enabled', '可用提示词'], ['all', '全部提示词'], ['trash', '回收站']] as const).map(([key, label]) => <button key={key} className={view === key ? 'active' : ''} aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}</div><input className="prompt-library-search" type="search" aria-label="搜索提示词" placeholder="搜索标题、正文或使用场景" value={query} onChange={event => setQuery(event.target.value)}/></div>
    <details className="prompt-reference-picker"><summary><span>参考内容 <small>可选</small></span><span>{context?.title || '暂不关联内容'}</span></summary><div className="prompt-reference-fields"><label>这次围绕哪篇内容？<select aria-label="选择提示词参考内容" value={context?.id ?? ''} disabled={busy} onChange={event => setContentId(event.target.value)}><option value="">暂不关联内容</option>{contents.map(item => <option key={item.id} value={item.id}>{item.title || '未命名内容'}</option>)}</select></label><Button disabled={busy || !currentContent} onClick={() => currentContent && setContentId(currentContent.id)}>使用当前已保存内容</Button></div><p>选择后不会自动加入提示词；使用时还需明确勾选，才会复制这篇内容的标题与正文。</p>{!contents.length && <p>先保存一篇内容，即可在这里选择。</p>}</details>
    <div className="prompt-category-filter"><button className={!category ? 'active' : ''} aria-pressed={!category} onClick={() => setCategory('')}>全部 <span>{prompts.length}</span></button>{categories.map(value => <button key={value} className={category === value ? 'active' : ''} aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</button>)}</div>
    {notice && <p className="prompt-library-notice" role="status">{notice}</p>}
    <div className="prompt-library-grid">{matching.map(prompt => <article className={`prompt-library-card${!prompt.enabled ? ' is-disabled' : ''}`} key={prompt.id}>
      {library && <details className="prompt-card-menu"><summary aria-label={`管理提示词：${prompt.title}`}>•••</summary><div>{view !== 'trash' && <><button disabled={busy} onClick={() => {setImported(null); setEditing(library.prompts.find(item => item.id === prompt.id));}}>编辑提示词</button><button disabled={busy} onClick={() => void mutate({op: 'setPromptEnabled', id: prompt.id, editToken: prompt.editToken, enabled: !prompt.enabled})}>{prompt.enabled ? '停用提示词' : '启用提示词'}</button></>}<button disabled={busy} onClick={() => void mutate({op: view === 'trash' ? 'restorePrompt' : 'trashPrompt', id: prompt.id, editToken: prompt.editToken})}>{view === 'trash' ? '恢复提示词' : '移入回收站'}</button></div></details>}
      <button className="prompt-library-use" onClick={() => setSelected(prompt)} disabled={busy || view === 'trash'}><span className="prompt-card-category">{prompt.category || '未分类'}{!prompt.enabled ? ' · 已停用' : ''}</span><h3>{prompt.title}</h3><p>{prompt.when || prompt.summary || prompt.body.slice(0, 140)}</p><div className="prompt-library-tags">{prompt.tags.map(tag => <span key={tag}>#{tag}</span>)}</div><span className="prompt-use-footer"><span>{promptFields(prompt.body).length ? `${promptFields(prompt.body).length} 项待填写` : '无需填写变量'}</span><strong>{view === 'trash' ? '在菜单中恢复' : promptFields(prompt.body).length ? '填写并使用 ↗' : '查看并复制 ↗'}</strong></span></button>
    </article>)}</div>
    {!matching.length && <div className="prompt-library-empty"><span aria-hidden="true">✎</span><h3>{view === 'trash' ? '回收站为空' : prompts.length ? '没有找到匹配的提示词' : '把常用的好问题，存到这里'}</h3><p>{view === 'trash' ? '移入回收站的提示词，可以从卡片菜单恢复。' : prompts.length ? '换个关键词或分类试试。' : '直接粘贴已有文字，保存后就能反复使用。'}</p>{view !== 'trash' && !prompts.length && <Button theme="solid" disabled={busy || !library} onClick={addPrompt}>添加第一条提示词</Button>}</div>}
    {selected && <PromptDialog key={selected.id + selected.editToken} prompt={selected} content={context} close={() => setSelected(null)}/>}
    {editing !== undefined && <PromptEditor prompt={editing} imported={imported} props={props} close={() => {setEditing(undefined); setImported(null);}}/>}
  </section>;
}
function PromptEditor({prompt, imported, props, close}: {prompt: WorkspaceLibraryPrompt | null; imported: {title: string; body: string} | null; props: WorkspaceManagementProps; close(): void}) {
  const [title, setTitle] = useState(prompt?.title ?? imported?.title ?? ''), [body, setBody] = useState(prompt?.body ?? imported?.body ?? ''), [category, setCategory] = useState(prompt?.category ?? ''), [summary, setSummary] = useState(prompt?.summary ?? ''), [when, setWhen] = useState(prompt?.when ?? ''), [tags, setTags] = useState(prompt?.tags.join('、') ?? '');
  const {mutate, notice} = useWorkspaceMutation(props);
  const suggestedTitle = pastedPrompt(body.split(/\r?\n/).find(line => line.trim()) ?? '').title;
  const fields = {title: title.trim() || suggestedTitle, body, category: category.trim(), summary, when, tags: [...new Set(tags.split(/[、,，]/).map(value => value.trim()).filter(Boolean))]};
  const dirty = title !== (prompt?.title ?? '') || body !== (prompt?.body ?? '') || category !== (prompt?.category ?? '') || summary !== (prompt?.summary ?? '') || when !== (prompt?.when ?? '') || tags !== (prompt?.tags.join('、') ?? '');
  useManagedDraftGuard(dirty);
  return <ManagementDialog title={prompt ? '编辑提示词' : '添加提示词'} busy={props.busy} dirty={dirty} close={close}><form className="management-form prompt-simple-editor" onSubmit={event => {event.preventDefault(); if (!body.trim()) return; void mutate(prompt ? {op: 'updatePrompt', id: prompt.id, editToken: prompt.editToken, ...fields} : {op: 'createPrompt', ...fields}, close);}}>
    <fieldset disabled={props.busy}><div className="management-form"><label>标题 <span className="prompt-editor-optional">可选，留空时使用正文第一行</span><input value={title} onChange={event => setTitle(event.target.value)} placeholder={body.trim() ? suggestedTitle : '给这条提示词起个名字'}/></label><label>提示词正文<textarea required autoFocus className="management-body" value={body} onChange={event => setBody(event.target.value)} placeholder="直接粘贴你的提示词，也可以在这里编写…"/></label><p className="prompt-editor-help">{prompt ? '保存会更新这条提示词，正文中的换行会原样保留。' : '保存为一条新提示词，原文和换行会保留，不覆盖已有内容。'}</p>
      <details className="prompt-optional-fields"><summary>分类与说明 <span>可选</span></summary><div className="management-form"><div className="management-columns"><label>分类<input list="prompt-category-options" value={category} onChange={event => setCategory(event.target.value)}/><datalist id="prompt-category-options">{props.library?.settings.visiblePromptCategories.map(value => <option key={value} value={value}/>)}</datalist></label><label>标签（顿号或逗号分隔）<input value={tags} onChange={event => setTags(event.target.value)}/></label></div><label>适用场景<input value={when} onChange={event => setWhen(event.target.value)} placeholder="例如：为一篇文章起标题时"/></label><label>简短说明<input value={summary} onChange={event => setSummary(event.target.value)}/></label><p className="prompt-editor-help">需要每次填写不同内容时，可用 {'{{变量名|填写提示}}'} 标记，使用时会自动显示填写栏。</p></div></details>
    </div></fieldset>{notice && <p role="status">{notice}</p>}<footer className="prompt-editor-footer"><span>{body.length} 字 · 正文原样保存</span><Button htmlType="submit" theme="solid" disabled={props.busy || !body.trim()}>{prompt ? '保存修改' : '保存提示词'}</Button></footer>
  </form></ManagementDialog>;
}
function PromptDialog({ prompt, content: initialContent, close }: { prompt: Prompt; content: Content | null; close(): void }) {
  const [content] = useState(initialContent);
  const dialog = useRef<HTMLDialogElement>(null), [values, setValues] = useState<Record<string, string>>({}), [notice, setNotice] = useState(''), [copying, setCopying] = useState(false);
  const [includeContent, setIncludeContent] = useState(false), [confirmClose, setConfirmClose] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const fields = promptFields(prompt.body), preview = promptPreview(prompt.body, values, content, includeContent);
  const dirty = includeContent || Object.values(values).some(value => value.length > 0);
  useManagedDraftGuard(dirty);
  const requestClose = () => { if (copying) return; if (dirty) setConfirmClose(true); else close(); };
  const missing = fields.filter(field => typeof values[field.key] !== 'string' || !values[field.key].trim());
  async function copy() { if (copying) return; if (missing.length) { setNotice(`请先填写：${missing.map(field => field.key).join('、')}`); return; } setCopying(true); try { await invoke('copyPrompt', {text: preview}); setNotice('已复制完整提示词，可以粘贴到助手。'); } catch { setNotice('复制失败，请在左侧预览中全选后手动复制。'); } finally { setCopying(false); } }
  return <dialog ref={dialog} className="prompt-dialog" aria-labelledby="prompt-dialog-title" onCancel={event => { event.preventDefault(); requestClose(); }}><div className="dialog-heading"><div><span className="eyebrow">{prompt.category || '提示词'}</span><h2 id="prompt-dialog-title">{prompt.title}</h2><p>{prompt.when || prompt.summary || '填写后复制到助手中使用。'}</p></div><Button aria-label="关闭提示词" disabled={copying} onClick={requestClose}>关闭</Button></div>{confirmClose && <div className="prompt-discard" role="alert"><p>关闭会清除本次填写和包含正文的勾选。已复制的文字、保存的提示词与内容不受影响。</p><Button disabled={copying} onClick={close}>放弃本次填写并关闭</Button><Button onClick={() => setConfirmClose(false)}>继续填写</Button></div>}<div className="prompt-use-grid"><section><h3>提示词预览</h3><p className="muted">填写后实时更新，复制的就是这段完整内容。</p><textarea className="prompt-preview" value={preview} readOnly aria-label="最终提示词预览"/></section><section className="prompt-fields"><h3>本次参考内容</h3>{content ? <><p>已关联：{content.title || '未命名内容'}</p><label className="check-label"><input type="checkbox" checked={includeContent} disabled={copying} onChange={event => { setIncludeContent(event.target.checked); setNotice(''); }}/>将这篇内容的已保存标题与正文加入本次提示词</label><p className="muted">{includeContent ? '左侧已显示将复制的标题与正文。粘贴到外部助手前，请确认愿意提供这些文字。' : '尚未包含内容文字。勾选后才会加入左侧预览与复制结果。'} 个人资料、照片、附件和渠道文案不会自动加入。</p></> : <p className="muted">本次未关联内容。可关闭窗口，在提示词页选择一篇已保存内容。</p>}<h3>填入你的情况</h3><p className="muted">本次填写仅留在窗口中，不修改保存的提示词或内容。</p>{fields.map((field, index) => <div key={field.key}><label htmlFor={`prompt-field-${index}`}>{field.key}</label>{field.hint && <p className="field-hint">{field.hint}</p>}<textarea id={`prompt-field-${index}`} aria-required="true" value={typeof values[field.key] === 'string' ? values[field.key] : ''} disabled={copying} onChange={event => { setValues(old => ({ ...old, [field.key]: event.target.value })); setNotice(''); }} placeholder={`填写${field.key}`}/></div>)}{!fields.length && <p className="muted">这条提示词无需填写变量，可直接复制。</p>}</section></div><footer className="dialog-footer"><span role="status" aria-live="polite">{notice || (fields.length ? `已填 ${fields.length - missing.length} / ${fields.length} 项` : '这条提示词无需填写。')}</span><Button theme="solid" disabled={copying} onClick={() => void copy()}>{copying ? '复制中…' : '复制完整提示词'}</Button></footer></dialog>;
}
export function TemplatesPage(props: WorkspaceManagementProps & { assets: CoverResults['listCoverAssets'] | null; busy: boolean; useTemplate(template: TemplateGroup): void; managePhotos(): void }) {
  const {assets, busy, useTemplate, library} = props;
  const [workflowTemplateId, setWorkflowTemplateId] = useState<string | null>(null);
  const [ownPhoto, setOwnPhoto] = useState(false);
  async function importPhoto() {
    if (busy || !library) return;
    await props.run(async () => {
      const photo = await invoke('choosePhoto', {title: '我的照片', isOwnPhoto: ownPhoto});
      if (photo) { setOwnPhoto(false); await props.refresh(); }
    });
  }
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
      setWorkflowTemplateId(saved.objectId);
      await props.refresh();
    });
  }
  const [query, setQuery] = useState(''), [preview, setPreview] = useState<TemplateGroup | null>(null), [source, setSource] = useState<'all' | 'mine' | 'builtin'>('all');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (preview) dialog.current?.showModal(); }, [preview]);
  const matching = assets?.templates.filter(template => (source === 'all' || (source === 'builtin' ? template.builtin : !template.builtin)) && `${template.name} ${template.description}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  const photos = library?.photos.filter(photo => !photo.deletedAt) ?? [];
  const ownPhotos = photos.filter(photo => photo.isOwnPhoto && photo.availability === 'available');
  const defaults = library?.settings.defaults;
  const defaultTemplate = assets?.templates.find(template => template.id === defaults?.templateId);
  const defaultPhoto = ownPhotos.find(photo => photo.id === defaults?.photoId);
  return <section className="workspace-page creator-templates">
    <header className="creator-page-heading"><div><p className="eyebrow">COVER STYLES</p><h2>选一种风格，开始下一张封面</h2><p>每组参考共同定义版式与气质，选好后再填入你的内容。</p></div><div className="management-actions"><Button disabled={busy || !library} onClick={() => setManaging(!managing)}>{managing ? '收起管理' : '版本与回收站'}</Button><Button theme="solid" disabled={busy || !library} onClick={() => void importImages()}>＋ 导入我的模板</Button></div></header>
    {managing && <TemplateManagement {...props} addVersion={template => void importImages(template)}/>}
    <div className="creator-template-layout"><div className="creator-template-library">
      <div className="creator-template-toolbar"><div className="creator-template-tabs" aria-label="模板来源">{([['all', '全部模板'], ['mine', '我的模板'], ['builtin', '内置模板']] as const).map(([key, label]) => <button key={key} aria-pressed={source === key} className={source === key ? 'active' : ''} onClick={() => setSource(key)}>{label}<span>{assets?.templates.filter(template => key === 'all' || (key === 'builtin' ? template.builtin : !template.builtin)).length ?? 0}</span></button>)}</div><input className="creator-template-search" type="search" aria-label="搜索模板" value={query} placeholder="搜索名称、风格或适用内容" onChange={event => setQuery(event.target.value)}/></div>
      <div className="creator-template-grid">{matching.map(template => <article key={template.id} className="creator-style-card">
        <button className="creator-reference-stack" disabled={busy} onClick={() => setPreview(template)} aria-label={`预览 ${template.name} 的 ${template.samples.length} 张参考样张`}>{template.samples.length ? <><span className="creator-stack-sheets">{template.samples.slice(0, 3).reverse().map((sample, index, stack) => <img key={sample.assetHash} src={sample.url} loading="lazy" className={`creator-stack-sheet sheet-${stack.length - index - 1}`} alt={index === stack.length - 1 ? `${template.name}参考样张` : ''}/>)}</span><span className="creator-sample-count">{template.samples.length} 张参考</span><span className="creator-stack-preview-label">查看整组 ↗</span></> : <span className="creator-no-reference">暂无可用参考样张</span>}</button>
        <div className="creator-style-card-body"><div className="creator-style-meta"><span>{template.builtin ? '内置风格' : '我的参考'}</span><span>v{template.version}{defaults?.templateId === template.id ? ' · 当前默认' : ''}</span></div><h3>{template.name}</h3><p className="creator-style-description">{template.description || '使用这组参考，为你的内容制作封面。'}</p>
          <button className="creator-sample-strip" disabled={busy || !template.samples.length} onClick={() => setPreview(template)} aria-label={`查看 ${template.name} 的全部样张`}>{template.samples.slice(0, 4).map((sample, index) => <img key={sample.assetHash} src={sample.url} alt={`样张 ${index + 1}`} loading="lazy"/>)}{template.samples.length > 4 && <span>+{template.samples.length - 4}</span>}</button>
          <div className="creator-template-acceptance">{template.builtin ? '内置 · 可直接使用' : template.accepted && template.aiTested ? '已记录人工验收' : '可作为风格参考 · 效果待验收'}</div><div className="creator-style-actions"><Button theme="solid" disabled={busy || !library || !template.samples.length} onClick={() => useTemplate(template)}>使用这个风格</Button><Button theme="borderless" disabled={busy || !library} onClick={() => setWorkflowTemplateId(template.id)}>学习与还原</Button></div>
        </div>
      </article>)}</div>
      {!matching.length && <section className="creator-panel creator-empty"><span className="creator-empty-icon" aria-hidden="true">▧</span><h3>{assets?.templates.length ? '没有找到合适的模板' : '把喜欢的风格存成模板'}</h3><p>{assets?.templates.length ? '换个关键词，或切换到全部模板。' : '从本机导入一组参考样张，之后可以反复使用。'}</p>{assets?.templates.length ? <Button disabled={busy} onClick={() => {setQuery(''); setSource('all');}}>查看全部模板</Button> : <Button theme="solid" disabled={busy || !library} onClick={() => void importImages()}>导入参考样张</Button>}</section>}
      <p className="creator-footnote">一组可保存 1–50 张参考。参考数量与生成候选数量分别设置；原图只从你的内容库读取。</p>
    </div><aside className="creator-template-sidebar">
      <section className="creator-panel template-photos"><div className="creator-panel-heading"><h3>我的照片</h3><span className="creator-small-label">{photos.length} 张</span></div><p className="creator-sidebar-description">想在封面中放入自己？在这里准备人物照片。</p>
        <div className="creator-photo-strip">{photos.slice(0, 3).map(photo => {const asset = assets?.photos.find(item => item.id === photo.id); return <button key={photo.id} disabled={busy} onClick={props.managePhotos} aria-label={`管理照片：${photo.title}`}>{asset?.url ? <img src={asset.url} alt={photo.title}/> : <span>{photo.availability === 'unavailable' ? '原图缺失' : '暂无预览'}</span>}</button>;})}{!photos.length && <div className="creator-photo-placeholder"><span aria-hidden="true">＋</span><small>准备一张自己的照片</small></div>}</div>
        <p className="creator-photo-availability">{ownPhotos.length} 张可用于本人人物参考</p><label className="check-label"><input type="checkbox" checked={ownPhoto} disabled={busy || !library} onChange={event => setOwnPhoto(event.target.checked)}/>新导入的照片是本人照片</label><div className="creator-sidebar-actions"><Button disabled={busy || !library} onClick={() => void importPhoto()}>从本机导入照片</Button><Button theme="borderless" disabled={busy || !library} onClick={props.managePhotos}>管理照片 →</Button></div><p className="creator-photo-privacy">照片不会自动进入本次创作；只有明确声明为本人的可用照片，才能选作人物参考。</p>
      </section>
      <section className="creator-panel creator-defaults"><div className="creator-panel-heading"><h3>当前默认设置</h3></div><dl><div><dt>封面风格</dt><dd>{defaultTemplate?.name ?? (defaults?.templateId ? '默认模板暂不可用' : '每次选择')}</dd></div><div><dt>生成候选</dt><dd>{defaults ? `${defaults.coverCount} 张` : '—'}</dd></div><div><dt>人物参考</dt><dd>{defaultPhoto?.title ?? (defaults?.photoId ? '默认照片暂不可用' : '不放人物')}</dd></div></dl><p>制作封面时仍可调整，也可以明确选择“这次不放人物”。</p><Button theme="borderless" disabled={busy || !library} onClick={props.managePhotos}>照片与默认设置 →</Button></section>
      <div className="creator-template-tip"><span aria-hidden="true">✦</span><p>先选风格，再写内容。自己的标题、正文和人物选择，会在制作封面时逐项确认。</p></div>
    </aside></div>
    {preview && <dialog ref={dialog} className="image-preview" onCancel={() => setPreview(null)} aria-label={preview.name}><div className="dialog-heading"><div><h2>{preview.name}</h2><p>{preview.samples.length} 张风格样张 · 同一模板组 · v{preview.version}</p></div><Button onClick={() => setPreview(null)}>关闭预览</Button></div><div className="preview-grid">{preview.samples.map((sample, index) => <img key={sample.assetHash} src={sample.url} alt={`${preview.name}样张 ${index + 1}`}/>)}</div></dialog>}
    {workflowTemplateId && <Card title="模板学习与还原" extra={<Button disabled={busy} onClick={() => setWorkflowTemplateId(null)}>收起</Button>}><TemplateWorkflowPanel templateId={workflowTemplateId} library={library} assets={assets} busy={busy} run={props.run} refresh={props.refresh} onDerive={derive}/></Card>}
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
  return <section className="workspace-management" id="calendar-publication-manager"><div className="calendar-manager-heading"><div><h3>{selection?.document.title || '管理发布安排'}</h3><p className="muted">新增计划默认使用所选日期 {props.selectedDay}。</p>{content && <Button theme="borderless" disabled={busy} onClick={() => {if (hasManagedDrafts()) {setNotice('请先保存或明确关闭尚未完成的发布编辑。'); return;} props.open(content);}}>打开内容详情 →</Button>}</div><label>选择内容或合集<select value={selection ? `${selection.kind}:${selection.document.id}` : ''} disabled={busy || !documents.length} onChange={event => {if (hasManagedDrafts()) {setNotice('请先保存或明确关闭尚未完成的发布编辑。'); return;} setNotice(''); setSelected(event.target.value);}}>{!documents.length && <option value="">还没有可安排的内容</option>}{documents.map(item => <option key={`${item.kind}:${item.document.id}`} value={`${item.kind}:${item.document.id}`}>{item.kind === 'collection' ? '合集 · ' : ''}{item.document.title}</option>)}</select></label></div><p role="status">{notice}</p><PublicationPanel {...props} documentId={selection?.document.id ?? null} kind={selection?.kind ?? 'content'} focusedPlanId={selection && props.focus?.id === selection.document.id && props.focus.kind === selection.kind ? props.focus.planId : undefined} selectedDay={props.selectedDay} newPlanRequest={props.newPlanRequest}/>{!selection && <p className="calendar-manager-empty">先创建并保存一篇内容，再安排第一个发布计划。</p>}</section>;
}

function TemplateManagement(props: WorkspaceManagementProps & {addVersion(template: WorkspaceLibraryTemplate): void}) {
  const [trash, setTrash] = useState(false), {mutate, notice} = useWorkspaceMutation(props);
  return <div className="workspace-management"><Card title="模板管理"><div className="management-toolbar"><span className="muted">切换版本只影响之后的选择，已有封面与发布历史会保留。</span><Button onClick={() => setTrash(!trash)}>{trash ? '返回可用模板' : '模板回收站'}</Button></div><p role="status">{notice}</p>{props.library?.templates.filter(item => !!item.deletedAt === trash).map(item => <div className="management-row" key={item.id}><div><strong>{item.title}</strong><p className="muted">当前 v{item.currentVersion} · 共 {item.versions.length} 个版本</p></div><div className="management-actions">{!trash && !item.builtin && <Button disabled={props.busy} onClick={() => props.addVersion(item)}>添加新版本</Button>}{!trash && <label>当前版本<select aria-label={`${item.title}的当前版本`} disabled={props.busy} value={item.currentVersion} onChange={event => void mutate({op: 'selectTemplateVersion', id: item.id, editToken: item.editToken, version: Number(event.target.value)})}>{item.versions.map(version => <option key={version.version} value={version.version}>v{version.version}</option>)}</select></label>}<Button disabled={props.busy} onClick={() => void mutate({op: trash ? 'restoreTemplate' : 'trashTemplate', id: item.id, editToken: item.editToken})}>{trash ? '恢复模板' : '移入回收站'}</Button></div></div>)}{!props.library?.templates.some(item => !!item.deletedAt === trash) && <p className="muted">{trash ? '模板回收站为空。' : '还没有模板。'}</p>}</Card></div>;
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
  return <ManagementDialog title={template ? `为「${template.title}」添加 v${nextVersion}` : '确认导入我的模板'} busy={props.busy} dirty close={close}><form className="management-form" onSubmit={event => { event.preventDefault(); if (images.length < 1 || images.length > 50 || invalidRules) return; const fields = {description, rules, styleAssetHashes: images.map(image => image.assetHash)}; void mutate(template ? {op: 'addTemplateVersion', id: template.id, editToken: template.editToken, version: nextVersion, ...fields} : {op: 'createTemplate', name: name.trim(), ...fields}, close); }}><fieldset disabled={props.busy}><div className="management-form"><p className="muted">{template ? '新版本会保留已有版本、封面与发布记录，保存后将选中新版本。' : '确认后新增一组模板，不覆盖已有模板。'} 导入的样张仅作为风格参考，生图效果仍需实际验收。</p><label>模板名称<input required maxLength={200} readOnly={!!template} value={name} onChange={event => setName(event.target.value)} placeholder="例如：我的蓝白知识卡片"/></label><label>模板说明<textarea maxLength={10000} value={description} onChange={event => setDescription(event.target.value)} placeholder="描述这组模板适合什么内容、希望保留什么风格。"/></label><label>固定规则（可选，每行一条）<textarea value={rulesText} onChange={event => setRulesText(event.target.value)} placeholder="例如：标题保持两行以内\n背景使用浅色，重点词使用蓝色"/></label><p className={invalidRules ? 'danger-note' : 'muted'}>{invalidRules ? '最多填写 100 条固定规则，每条不超过 2000 字。' : '可以直接用自己的话描述，无需处理模板文件或格式。'}</p><div className="management-toolbar"><strong>已选 {images.length} / 50 张参考样张</strong><Button disabled={props.busy} onClick={() => void chooseAgain()}>重新选择样张</Button></div><p className="muted">可一次多选最多 50 张图片，单张不超过 64 MiB，总计不超过 256 MiB。这里的样张数量与之后生成的候选张数相互独立。</p><div className="template-import-grid">{images.map((image, index) => <figure key={image.assetHash}><img src={image.url} alt={`待导入样张 ${index + 1}：${image.originalName}`}/><figcaption><strong>{index + 1}. {image.originalName}</strong><span>{image.width} × {image.height}</span><Button disabled={props.busy} onClick={() => setImages(old => old.filter(item => item.assetHash !== image.assetHash))}>移除这张</Button></figcaption></figure>)}</div>{!images.length && <p className="danger-note">至少保留一张样张，或重新选择图片。</p>}</div></fieldset><p role="status" className="management-notice">{notice || selectionNotice}</p><Button theme="solid" htmlType="submit" disabled={props.busy || !name.trim() || images.length < 1 || images.length > 50 || invalidRules}>{template ? `保存为 v${nextVersion}` : '确认新增模板'}</Button></form></ManagementDialog>;
}
