import {useState} from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import type {Content, DesktopResults, View} from '../shared/contracts.ts';
import type {WorkspaceLibrarySnapshot} from '../shared/workspace-contracts.ts';
import {publicationEntries} from '../shared/publication-view.ts';
import {scheduleDay} from './workspace-model.ts';

type Filter = 'all' | 'needs-cover' | 'candidates' | 'selected' | 'published';
interface Props {
    contents: Content[] | null; workspace: DesktopResults['readWorkspace'] | null; library: WorkspaceLibrarySnapshot | null;
    query: string; setQuery(value: string): void; view: View; busy: boolean; blocked: boolean; ready: boolean;
    changeView(view: View): void; create(): void; open(item: Content, generate?: boolean): void; recycle(item: Content): void;
}
export function ContentList({contents, workspace, library, query, setQuery, view, busy, blocked, ready, changeView, create, open, recycle}: Props) {
    const [filter, setFilter] = useState<Filter>('all');
    const [menuId, setMenuId] = useState<string | null>(null);
    const publications = library ? publicationEntries(library) : [];
    const facts = (item: Content) => {
        const summary = workspace?.contents.find(value => value.id === item.id);
        const detail = library?.contentDetails.find(value => value.id === item.id);
        const count = summary?.candidateCount ?? detail?.candidates.length ?? null;
        const selected = summary?.selectedCandidateId ?? null;
        const selectedCandidate = detail?.candidates.find(value => value.id === selected);
        const published = library ? publications.some(value => value.kind === 'content' && value.document.id === item.id && value.plan.status === 'published') : summary?.plans.some(plan => plan.status === 'published') ?? false;
        const planned = (detail?.plans ?? summary?.plans ?? []).filter(plan => plan.status === 'planned').map(plan => scheduleDay(plan.schedule)).sort()[0] ?? detail?.plannedDate;
        const channelIds = detail?.channelIds ?? [...new Set(summary?.plans.filter(plan => plan.status !== 'cancelled').map(plan => plan.channelId) ?? [])];
        const channels = channelIds.map(id => library?.settings.channels.find(channel => channel.id === id)?.name ?? workspace?.channels.find(channel => channel.id === id)?.name ?? '原渠道').join('、');
        return {count, selected, published, planned, channels, url: selectedCandidate && 'url' in selectedCandidate && typeof selectedCandidate.url === 'string' ? selectedCandidate.url : null};
    };
    const items = (contents ?? []).filter(item => {
        const state = facts(item);
        return `${item.title} ${item.body}`.toLowerCase().includes(query.trim().toLowerCase()) && (view === 'trash' || filter === 'all' || filter === 'needs-cover' && state.count === 0 && !state.selected || filter === 'candidates' && state.count !== null && state.count > 0 || filter === 'selected' && !!state.selected || filter === 'published' && state.published);
    });
    return <section className="content-library-page" aria-labelledby="content-heading">
        <div className="content-list-heading"><div><h2 id="content-heading">你的内容</h2><p>从一篇内容开始，把封面和发布安排放在一起。</p></div><Button id="new-content" theme="solid" disabled={busy || blocked || !ready} onClick={create}>＋ 新建内容</Button></div>
        <div className="content-list-toolbar"><div className="content-view-switch"><Button id="active-view" theme={view === 'active' ? 'solid' : 'borderless'} disabled={busy || !ready} onClick={() => {setMenuId(null); changeView('active');}}>全部内容</Button><Button id="trash-view" theme={view === 'trash' ? 'solid' : 'borderless'} disabled={busy || !ready} onClick={() => {setMenuId(null); changeView('trash');}}>回收站</Button></div><input type="search" className="content-search" aria-label="搜索内容" placeholder="搜索标题或正文" value={query} onChange={event => setQuery(event.target.value)}/></div>
        {view === 'active' && <div className="content-filters" aria-label="内容筛选">{([['all', '全部'], ['needs-cover', '待做封面'], ['candidates', '有候选'], ['selected', '已选封面'], ['published', '已发布']] as const).map(([value, label]) => <button key={value} aria-pressed={filter === value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div>}
        <div className="content-table-wrap"><table className="content-table" id="contents"><thead><tr><th scope="col">内容</th><th scope="col">封面进度</th><th scope="col">发布安排</th><th scope="col"><span className="visually-hidden">操作</span></th></tr></thead><tbody>{items.map(item => {
            const state = facts(item);
            return <tr key={item.id} data-content-id={item.id}><td><button className="content-title-link" disabled={busy} onClick={() => open(item)}><span className="content-thumbnail">{state.url ? <img loading="lazy" src={state.url} alt="已选封面"/> : <span aria-hidden="true">{state.selected ? '已选' : '封面'}</span>}</span><span className="content-title-cell"><strong>{item.title || '未命名内容'}</strong><span>{view === 'trash' ? '已移入回收站' : state.published ? '已有发布记录' : '创作中'}</span></span></button></td><td><span className={`content-status ${state.selected ? 'selected' : state.count ? 'candidates' : ''}`}>{state.selected ? '已选封面' : state.count === null ? '进度待读取' : state.count ? '待选封面' : '待做封面'}</span><span className="cell-note">{state.count === null ? '候选尚未读取' : `${state.count} 张候选`}</span></td><td><span className="content-channels">{state.channels || '未安排渠道'}</span><span className="cell-note">{state.planned || '日期待安排'}</span></td><td><div className="content-row-actions"><Button theme="borderless" disabled={busy} onClick={() => open(item, view === 'active' && state.count === 0 && !state.selected)}>{view === 'active' && state.count === 0 && !state.selected ? '制作封面' : '打开内容'}</Button><div className="content-menu" onKeyDown={event => {if (event.key === 'Escape') {setMenuId(null); event.currentTarget.querySelector<HTMLButtonElement>('.content-more')?.focus();}}}><button className="content-more" aria-label={`更多操作：${item.title || '未命名内容'}`} aria-expanded={menuId === item.id} aria-controls={`content-menu-${item.id}`} disabled={busy} onClick={() => setMenuId(menuId === item.id ? null : item.id)}>•••</button>{menuId === item.id && <div className="content-action-menu" id={`content-menu-${item.id}`}><button disabled={busy} onClick={() => {setMenuId(null); open(item);}}>查看详情</button><button disabled={busy || blocked} onClick={() => {setMenuId(null); recycle(item);}}>{view === 'trash' ? '恢复内容' : '移入回收站'}</button><button onClick={() => setMenuId(null)}>关闭菜单</button></div>}</div></div></td></tr>;
        })}</tbody></table>{!items.length && <div className="content-list-empty"><span className="empty-content-icon" aria-hidden="true">▤</span><h3>{!ready ? '先打开你的内容库' : query || filter !== 'all' && view === 'active' ? '没有找到匹配的内容' : view === 'trash' ? '回收站为空' : '写下第一篇内容'}</h3><p>{!ready ? '内容库会保存正文、封面和发布安排。' : query || filter !== 'all' && view === 'active' ? '换个关键词或筛选条件试试。' : view === 'trash' ? '移入回收站的内容可在这里恢复。' : '保存标题与正文，就可以开始制作封面。'}</p>{ready && view === 'active' && !query && filter === 'all' && <Button theme="solid" disabled={busy || blocked} onClick={create}>新建内容</Button>}</div>}</div>
        <p className="content-list-count">{ready ? `当前显示 ${items.length} 篇${view === 'trash' ? '回收内容' : '内容'}` : '内容保存在你的本机'}</p>
    </section>;
}
