import {useEffect, useMemo, useState, type ReactNode} from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import Input from '@douyinfe/semi-ui-19/lib/es/input';
import type {Content, DesktopResults, View} from '../shared/contracts.ts';
import type {WorkspaceLibrarySnapshot, WorkspaceLibraryCollection} from '../shared/workspace-contracts.ts';
import {compareSchedules, publicationEntries} from '../shared/publication-view.ts';
import {scheduleDay} from './workspace-model.ts';
import {publicationTime} from './publication-model.ts';
import {channelStyle, channelTone, scheduleClock} from './schedule-view.tsx';
import './creator-dashboard.css';
import {PaginationBar} from './pagination-bar.tsx';
import {PopupSelect} from './semi-controls.tsx';

type Filter = 'all' | 'needs-cover' | 'candidates' | 'selected' | 'published';
interface Props {
    contents: Content[] | null; workspace: DesktopResults['readWorkspace'] | null; library: WorkspaceLibrarySnapshot | null;
    query: string; setQuery(value: string): void; view: View; busy: boolean; blocked: boolean; ready: boolean;
    changeView(view: View): void; create?(): void; createCollection?(): void; openCollection?(id: string): void; restoreCollection?(item: WorkspaceLibraryCollection): void; open(item: Content, generate?: boolean): void; recycle(item: Content): void;
    collection?: WorkspaceLibraryCollection; collectionActions?: ReactNode;
}
const titleOrder = new Intl.Collator('zh-CN', {numeric: true});
export function ContentList({contents, workspace, library, query, setQuery, view, busy, blocked, ready, changeView, create, createCollection, openCollection, restoreCollection, open, recycle, collection, collectionActions}: Props) {
    const [filter, setFilter] = useState<Filter>('all');
    const [menuId, setMenuId] = useState<string | null>(null);
    const [page, setPage] = useState(1), [collectionPage, setCollectionPage] = useState(1), [sort, setSort] = useState('updated');
    useEffect(() => {setPage(1); setCollectionPage(1); setMenuId(null);}, [query, filter, view, collection?.id, sort]);
    const summaries = useMemo(() => new Map(workspace?.contents.map(item => [item.id, item]) ?? []), [workspace]);
    const details = useMemo(() => new Map(library?.contentDetails.map(item => [item.id, item]) ?? []), [library]);
    const publications = useMemo(() => {
        const byContent = new Map<string, ReturnType<typeof publicationEntries>>();
        if (library) for (const entry of publicationEntries(library)) if (entry.kind === 'content') {const items = byContent.get(entry.document.id) ?? []; items.push(entry); byContent.set(entry.document.id, items);}
        return byContent;
    }, [library]);
    const channels = library?.settings.channels ?? workspace?.channels ?? [];
    const channelIndex = useMemo(() => new Map(channels.map(item => [item.id, item])), [channels]);
    const collections = useMemo(() => (collection ? [] : library?.collections ?? []).filter(item => !!item.deletedAt === (view === 'trash') && item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a, b) => sort === 'name' ? titleOrder.compare(a.title, b.title) : b.updatedAt.localeCompare(a.updatedAt)), [collection, library, view, query, sort]);
    const facts = useMemo(() => new Map((contents ?? []).map(item => {
        const summary = summaries.get(item.id), detail = details.get(item.id);
        const count = summary?.candidateCount ?? detail?.candidates.length ?? null;
        const selected = summary?.selectedCandidateId ?? null;
        const selectedCandidate = detail?.candidates.find(value => value.id === selected);
        const entries = library ? publications.get(item.id) ?? [] : null;
        const activePlans = entries?.map(entry => ({...entry.plan, schedule: entry.schedule})) ?? summary?.plans.filter(plan => plan.status !== 'cancelled') ?? [];
        const done = activePlans.filter(plan => plan.status === 'published').length, total = activePlans.length;
        const published = done > 0;
        const nextPlan = entries?.find(entry => entry.plan.status === 'planned')?.plan ?? activePlans.filter(plan => plan.status === 'planned').sort((a, b) => compareSchedules(a.schedule, b.schedule))[0];
        const planned = nextPlan ? scheduleDay(nextPlan.schedule) : detail?.plannedDate;
        const channelIds = [...new Set([...(detail?.channelIds ?? []), ...(detail?.plans ?? summary?.plans ?? []).filter(plan => plan.status !== 'cancelled').map(plan => plan.channelId)])];
        const contentChannels = channelIds.map(id => ({id, name: channelIndex.get(id)?.name ?? '原渠道已不可用'}));
        return [item.id, {count, selected, published, planned, nextPlan, done, total, channels: contentChannels, url: selectedCandidate && 'url' in selectedCandidate && typeof selectedCandidate.url === 'string' ? selectedCandidate.url : null}] as const;
    })), [contents, summaries, details, library, publications, channelIndex]);
    const items = useMemo(() => (contents ?? []).filter(item => {
        const state = facts.get(item.id)!;
        return `${item.title} ${item.body}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) && (view === 'trash' || filter === 'all' || filter === 'needs-cover' && state.count === 0 && !state.selected || filter === 'candidates' && state.count !== null && state.count > 0 || filter === 'selected' && !!state.selected || filter === 'published' && state.published);
    }).sort((a, b) => (sort === 'name' ? titleOrder.compare(a.title, b.title) : (details.get(b.id)?.updatedAt ?? '').localeCompare(details.get(a.id)?.updatedAt ?? '')) || a.id.localeCompare(b.id)), [contents, facts, query, view, filter, sort, details]);
    const currentPage = Math.min(page, Math.max(1, Math.ceil(items.length / 20))), currentCollectionPage = Math.min(collectionPage, Math.max(1, Math.ceil(collections.length / 12)));
    const visibleItems = items.slice((currentPage - 1) * 20, currentPage * 20), visibleCollections = collections.slice((currentCollectionPage - 1) * 12, currentCollectionPage * 12);
    return <section className="content-library-page creator-content-library" aria-labelledby="content-heading">
        <div className="content-list-heading"><div><h2 id="content-heading">{collection ? collection.title || '未命名合集' : '内容'}</h2><p>{collection ? '集中整理同一主题的内容，点击内容进入单篇详情。' : '整理内容与合集，查看封面和发布进度。'}</p></div><div className="management-actions">{collectionActions}{createCollection && <Button disabled={busy || blocked || !ready} onClick={createCollection}>＋ 新建合集</Button>}{create && <Button id="new-content" theme="solid" disabled={busy || blocked || !ready} onClick={create}>＋ 新建内容</Button>}</div></div>
        <div className="content-list-toolbar">{collection ? <span className="muted">{contents?.length ?? 0} 篇内容 · 移出合集不会删除内容</span> : <div className="content-view-switch"><Button id="active-view" theme={view === 'active' ? 'solid' : 'borderless'} disabled={busy || !ready} onClick={() => {setMenuId(null); changeView('active');}}>全部内容</Button><Button id="trash-view" theme={view === 'trash' ? 'solid' : 'borderless'} disabled={busy || !ready} onClick={() => {setMenuId(null); changeView('trash');}}>回收站</Button></div>}<Input type="search" className="content-search semi-control-text" aria-label={collection ? '搜索合集内的内容' : '搜索内容'} placeholder={collection ? '搜索合集内的标题或正文' : '搜索标题、正文或合集名称'} value={query} onChange={setQuery}/><label>排序<PopupSelect value={sort} onChange={setSort} aria-label="内容列表排序"><option value="updated">最近更新</option><option value="name">名称</option></PopupSelect></label></div>
        {view === 'active' && <div className="content-filters" aria-label="内容筛选">{([['all', '全部'], ['needs-cover', '待做封面'], ['candidates', '有候选'], ['selected', '已选封面'], ['published', '已发布']] as const).map(([value, label]) => <button key={value} aria-pressed={filter === value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div>}
        {!collection && view === 'active' && collections.length > 0 && <section className="content-collections" aria-label="内容合集">{visibleCollections.map(group => {const members = group.memberIds.map(id => summaries.get(id)).filter(item => item !== undefined).filter(item => !item.deletedAt), memberImages = members.flatMap(item => {const url = details.get(item.id)?.candidates.find(candidate => candidate.id === item.selectedCandidateId)?.url; return url ? [url] : [];}).slice(0, 2); return <button className="content-collection-card" key={group.id} data-collection-id={group.id} disabled={busy || !openCollection} onClick={() => openCollection?.(group.id)}><span className="content-collection-art">{memberImages.length ? memberImages.map((url, index) => <img key={`${index}:${url}`} src={url} alt="" loading="lazy"/>) : <span aria-hidden="true">▤</span>}</span><span className="content-collection-copy"><strong>{group.title || '未命名合集'} <em>合集</em></strong><small>{members.length} 篇内容</small></span><span aria-hidden="true">›</span></button>;})}</section>}
        {!collection && view === 'trash' && collections.length > 0 && <section className="content-collections" aria-label="回收的合集">{visibleCollections.map(group => <div className="content-collection-card" key={group.id} data-collection-id={group.id}><span className="content-collection-art" aria-hidden="true">▤</span><span className="content-collection-copy"><strong>{group.title || '未命名合集'} <em>合集</em></strong><small>{group.memberIds.length} 篇内容 · 已移入回收站</small><span>恢复合集不会改变成员内容；成员已回收时请先恢复成员。</span></span><Button disabled={busy || blocked || !restoreCollection} onClick={() => restoreCollection?.(group)}>恢复合集</Button></div>)}</section>}
        {!collection && collections.length > 0 && <PaginationBar total={collections.length} page={currentCollectionPage} pageSize={12} onPageChange={value => {setCollectionPage(value); setMenuId(null);}} label="合集列表分页"/>}
        {(view !== 'trash' || items.length > 0 || !collections.length) && <div className="content-table-wrap"><table className="content-table" id="contents"><thead><tr><th scope="col">内容</th><th scope="col">渠道</th><th scope="col">计划时间</th><th scope="col">封面状态</th><th scope="col">发布进度</th><th scope="col"><span className="visually-hidden">操作</span></th></tr></thead><tbody>{visibleItems.map(item => {
            const state = facts.get(item.id)!;
            return <tr key={item.id} data-content-id={item.id}><td><button className="content-title-link" disabled={busy} onClick={() => open(item)}><span className="content-thumbnail">{state.url ? <img loading="lazy" src={state.url} alt="已选封面"/> : <span aria-hidden="true">{state.selected ? '已选' : '封面'}</span>}</span><span className="content-title-cell"><strong>{item.title || '未命名内容'}</strong><span>{view === 'trash' ? '已移入回收站' : state.published ? '已有发布记录' : '创作中'}</span></span></button></td><td><div className="content-channel-list">{state.channels.map(channel => <span key={channel.id} className={`creator-channel ${channelTone(channel.id, channels)}`} style={channelStyle(channel.id, channels)}>{channel.name}</span>)}{!state.channels.length && <span className="cell-note">未选择渠道</span>}</div></td><td><span className="content-plan-date">{state.planned || '日期待安排'}</span>{state.nextPlan && <time className="cell-note" title={publicationTime(state.nextPlan.schedule)}>{scheduleClock(state.nextPlan.schedule)}</time>}{!state.nextPlan && state.planned && <span className="cell-note">时间待定 · 尚未建立计划</span>}</td><td><span className={`content-status ${state.selected ? 'selected' : state.count ? 'candidates' : ''}`}>{state.selected ? '已选封面' : state.count === null ? '进度待读取' : state.count ? '待选封面' : '待做封面'}</span></td><td><span className="content-publication-count">{state.total ? `已发 ${state.done}/${state.total}` : '尚未安排'}</span>{state.total > 0 && <progress aria-label={`${item.title || '未命名内容'}：${state.total} 条计划，已发布 ${state.done} 条`} value={state.done} max={state.total}/>}</td><td><div className="content-row-actions"><Button theme="borderless" disabled={busy} onClick={() => open(item, !collection && view === 'active' && state.count === 0 && !state.selected)}>{!collection && view === 'active' && state.count === 0 && !state.selected ? '制作封面' : '打开内容'}</Button><div className="content-menu" onKeyDown={event => {if (event.key === 'Escape') {setMenuId(null); event.currentTarget.querySelector<HTMLButtonElement>('.content-more')?.focus();}}}><button className="content-more" aria-label={`更多操作：${item.title || '未命名内容'}`} aria-expanded={menuId === item.id} aria-controls={`content-menu-${item.id}`} disabled={busy} onClick={() => setMenuId(menuId === item.id ? null : item.id)}>•••</button>{menuId === item.id && <div className="content-action-menu" id={`content-menu-${item.id}`}><button disabled={busy} onClick={() => {setMenuId(null); open(item);}}>查看详情</button><button disabled={busy || blocked} onClick={() => {setMenuId(null); recycle(item);}}>{collection ? '移出合集' : view === 'trash' ? '恢复内容' : '移入回收站'}</button><button onClick={() => setMenuId(null)}>关闭菜单</button></div>}</div></div></td></tr>;
        })}</tbody></table>{!items.length && <div className="content-list-empty"><span className="empty-content-icon" aria-hidden="true">▤</span><h3>{!ready ? '先打开你的内容库' : query || filter !== 'all' && view === 'active' ? '没有找到匹配的内容' : view === 'trash' ? '回收站为空' : collection ? '合集还没有内容' : '写下第一篇内容'}</h3><p>{!ready ? '内容库会保存正文、封面和发布安排。' : query || filter !== 'all' && view === 'active' ? '换个关键词或筛选条件试试。' : view === 'trash' ? '移入回收站的内容可在这里恢复。' : collection ? '点击“管理内容”，把已有内容加入这个合集。' : '保存标题与正文，就可以开始制作封面。'}</p>{ready && create && view === 'active' && !query && filter === 'all' && <Button theme="solid" disabled={busy || blocked} onClick={create}>新建内容</Button>}</div>}</div>}
        <PaginationBar total={items.length} page={currentPage} pageSize={20} onPageChange={value => {setPage(value); setMenuId(null);}} label={collection ? "组内内容分页" : "内容列表分页"}/>
        <p className="content-list-count">{ready ? collection ? `共匹配 ${items.length} 篇内容` : `共匹配 ${items.length + collections.length} 项（${collections.length} 个合集 · ${items.length} 篇内容）` : '内容保存在你的本机'}</p>
    </section>;
}
