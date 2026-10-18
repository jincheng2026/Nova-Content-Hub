import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import '@douyinfe/semi-ui-19/react19-adapter';
import Banner from '@douyinfe/semi-ui-19/lib/es/banner';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import Card from '@douyinfe/semi-ui-19/lib/es/card';
import Typography from '@douyinfe/semi-ui-19/lib/es/typography';
import '@douyinfe/semi-ui-19/lib/es/_base/base.css';
import './style.css';
import {CoverPanel } from './covers.tsx';
import {AssistantSettings} from './assistant-settings.tsx';
import {invoke} from './client.ts';
import {CalendarPage, Overview, PromptsPage, TemplatesPage, pageNames} from './workspace-pages.tsx';
import type {Page} from './workspace-pages.tsx';
import type {CoverResults, TemplateGroup} from '../shared/cover-contracts.ts';
import { errorInfo} from '../shared/contracts.ts';
import type {
    Content,
    DesktopResults,
    DesktopMethod,
    Status,
    TaskStatus,
    Draft,
    PendingView,
    View
} from '../shared/contracts.ts';

const labels: Record<TaskStatus, string> = {
    prepared: '任务已准备，可继续导入',
    running: '任务仍在运行，可继续导入核验',
    blocked: '任务遇到阻断，可修复后继续导入',
    ready: '数据已核验，等待写入新库',
    publishing: '正在提交新库，可继续导入',
    committed: '导入已完成'
};



function App() {
    const [page, setPage] = useState<Page>('content');
    const [workspace, setWorkspace] = useState<DesktopResults['readWorkspace'] | null>(null);
    const [assets, setAssets] = useState<CoverResults['listCoverAssets'] | null>(null);
    const [selectedTemplate, setSelectedTemplate] = useState<{id: string; key: number} | null>(null);
    const [templatePicker, setTemplatePicker] = useState<TemplateGroup | null>(null);
    const [contentQuery, setContentQuery] = useState('');
    const templateDialog = useRef<HTMLDialogElement>(null);
    useEffect(() => { if (templatePicker) templateDialog.current?.showModal(); }, [templatePicker]);
    const [libraryEpoch, setLibraryEpoch] = useState(0);
    const epochRef = useRef(0);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [settings, setSettings] = useState(false);
    const [coverRefresh, setCoverRefresh] = useState(0);
    const [status, setStatus] = useState<Status | null>(null);
    const [contents, setContents] = useState<Content[] | null>(null);
    const [error, setError] = useState('');
    const [acting, setActing] = useState(false);
    const active = useRef(false);
    const [view, setView] = useState<View>('active');
    const [base, setBase] = useState<Content | null>(null);
    const baseRef = useRef(base);
    baseRef.current = base;
    const [draft, setDraft] = useState<Draft | null>(null);
    const draftRef = useRef(draft);
    draftRef.current = draft;
    const [disk, setDisk] = useState<Content | null>(null);
    const [pending, setPending] = useState<PendingView | null>(null);
    const [leaving, setLeaving] = useState<((saved?: boolean) => Promise<void>) | null>(null);
    const savedContent = useRef<Content | null>(null);
    const leaveDialog = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        if (leaving && leaveDialog.current && !leaveDialog.current.open) leaveDialog.current.showModal();
    }, [leaving]);
    const dirty = !!draft && (!base || draft.title !== base.title || draft.body !== base.body);
    const dirtyRef = useRef(false);
    dirtyRef.current = dirty;
    const report = (failure: unknown) => {
        const value = errorInfo(failure);
        setError(`${value.message}（${value.code}）`);
    };
    const load = (item: Content) => {
        setBase(item);
        setDraft({title: item.title, body: item.body});
        setDisk(null);
    };
    const clearEditor = () => {
        epochRef.current += 1; setLibraryEpoch(epochRef.current); setBase(null); baseRef.current = null;
        setDraft(null);
        draftRef.current = null;
        setDisk(null);
        savedContent.current = null;
        setContents(null);
        setWorkspace(null);
        setAssets(null);
        setSelectedTemplate(null);
        setTemplatePicker(null);
    };
    const refreshStatus = async () => {
        const epoch = epochRef.current;
        const next = await invoke('status');
        if (epoch !== epochRef.current) return next;
        setStatus(next);
        setPending(next.pending);
        return next;
    };
    async function refreshWorkspace() {
        const epoch = epochRef.current;
        const [snapshot, coverAssets] = await Promise.all([invoke('readWorkspace'), invoke('listCoverAssets')]);
        if (epoch !== epochRef.current) return;
        setWorkspace(snapshot);
        setAssets(coverAssets);
    }
    useEffect(() => {
        const epoch = epochRef.current;
        void refreshStatus().then(async next => { if (next.currentName) { const items = await invoke('listContents', {view: 'active'}); if (epochRef.current === epoch) { setContents(items); await refreshWorkspace(); } } }).catch(report);
    }, []);

    async function refreshEditor() {
        if (!base) return;
        const epoch = epochRef.current, selected = base.id;
        const current = await invoke('readContent', {id: selected});
        if (epoch !== epochRef.current || baseRef.current?.id !== selected) return;
        if (current.editToken !== baseRef.current.editToken) {
            if (dirtyRef.current) setDisk(current); else load(current);
        }
    }

    useEffect(() => {
        const focus = () => {
            if (!active.current) void nativeAction(async () => { await refreshEditor(); if (status?.currentName) setContents(await invoke('listContents', {view})); setCoverRefresh(n => n + 1); });
        };
        window.addEventListener('focus', focus);
        return () => window.removeEventListener('focus', focus);
    });
    useEffect(() => {
        const prevent = (event: BeforeUnloadEvent) => {
            if (dirtyRef.current) {
                event.preventDefault();
                event.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', prevent);
        return () => window.removeEventListener('beforeunload', prevent);
    }, []);

    async function guard(action: (saved?: boolean) => Promise<void>) {
        if (dirty) setLeaving(() => action); else await action();
    }

    async function nativeAction<T>(action: () => Promise<T>): Promise<T | undefined> {
        if (active.current) return;
        active.current = true;
        setActing(true);
        setError('');
        try {
            return await action();
        } catch (failure) {
            report(failure);
            return undefined;
        } finally {
            try {
                const next = await refreshStatus();
                if (next.currentName) {
                    try { await refreshWorkspace(); } catch (failure) { report(failure); }
                }
            } catch (failure) {
                setStatus(null);
                report(failure);
            }
            active.current = false;
            setActing(false);
        }
    }

    async function save(): Promise<boolean> {
        if (!draft || disk) return false;
        const submitted = {...draft};
        const result = await nativeAction(async () => {
            const item = base ? await invoke('updateContent', {
                id: base.id,
                editToken: base.editToken, ...submitted
            }) : await invoke('createContent', submitted);
            // A later writer may have changed the object after commit; keep the submitted draft.
            const unchangedDraft = draftRef.current?.title === submitted.title && draftRef.current?.body === submitted.body;
            if (item.title === submitted.title && item.body === submitted.body) {
                if (unchangedDraft) load(item); else {
                    setBase(item);
                    setDisk(null);
                }
            } else {
                setDisk(item);
                setBase(item);
            }
            setContents(await invoke('listContents', {view}));
            savedContent.current = item;
            setCoverRefresh(n => n + 1);
            return unchangedDraft && item.title === submitted.title && item.body === submitted.body;
        });
        return result === true;
    }

    useEffect(() => {
        const close = (event: Event) => {
            const complete = (event as CustomEvent<unknown>).detail;
            if (typeof complete !== 'function') return;
            void save().then(saved => {
                if (saved) dirtyRef.current = false;
                complete(saved === true);
            }, () => complete(false));
        };
        window.addEventListener('nova-save-close', close);
        return () => window.removeEventListener('nova-save-close', close);
    });

    async function recover(retry = false) {
        await nativeAction(async () => {
            if (status?.creating) clearEditor();
            const found = retry ? {
                mutationId: pending?.mutationId ?? '',
                op: pending?.op ?? 'createContent',
                state: 'committed' as const,
                current: await invoke('retryPendingMutation'),
                draft: pending?.draft ?? null
            } : await invoke('queryPendingMutation');
            if (found?.current && found.state === 'committed') {
                if (dirty || (found.draft && (found.draft.title !== found.current.title || found.draft.body !== found.current.body))) {
                    setDisk(found.current);
                    if (!draft && found.draft) setDraft(found.draft);
                    setBase(found.current);
                } else load(found.current);
            } else if (found) {
                setPending(found);
                if (found.draft && !draft) {
                    setDraft(found.draft);
                    setBase(found.current);
                }
                if (found.current) setDisk(found.current);
            }
            const next = await refreshStatus();
            if (next.currentName) setContents(await invoke('listContents', {view}));
        });
    }

    async function resolve(action: 'keep' | 'saveAs' | 'discard') {
        await nativeAction(async () => {
            const retained = draft ?? pending?.draft ?? null;
            const item = await invoke('resolvePendingMutation', {action});
            if (action === 'keep') {
                if (retained) {
                    setDraft(retained);
                    if (item) {
                        setBase(item);
                        setDisk(retained.title !== item.title || retained.body !== item.body ? item : null);
                    }
                } else if (item) load(item);
            }
            if (action !== 'keep') {
                if (item) load(item); else {
                    setBase(null);
                    setDraft(null);
                    setDisk(null);
                }
                setContents(await invoke('listContents', {view}));
            }
        });
    }

    async function select(item: Content, template?: string) {
        await guard(async () => {
            const epoch = epochRef.current;
            await nativeAction(async () => { const current = await invoke('readContent', {id: item.id}); if (epoch === epochRef.current) { load(current); setPage('content'); setSelectedTemplate(template ? {id: template, key: Date.now()} : null); setTemplatePicker(null); } });
        });
    }

    async function recycle(item: Content) {
        await guard(async saved => {
            await nativeAction(async () => {
                const selected = saved && savedContent.current?.id === item.id ? savedContent.current : item;
                await invoke(view === 'trash' ? 'restoreContent' : 'trashContent', {
                    id: selected.id,
                    editToken: selected.editToken
                });
                if (base?.id === item.id) {
                    setBase(null);
                    setDraft(null);
                    setDisk(null);
                }
                setContents(await invoke('listContents', {view}));
            });
        });
    }

    async function act(method: DesktopMethod) {
        await nativeAction(async () => {
            if (method === 'listContents') {
                setContents(await invoke('listContents', {view}));
                await refreshEditor();
                setCoverRefresh(n => n + 1);
            } else {
                if (['createLibrary', 'openLibrary', 'importBackup', 'resumeImport'].includes(method)) clearEditor();
                await invoke(method);
                if (method === 'status') setCoverRefresh(n => n + 1);
                if (method === 'createLibrary' || method === 'openLibrary') { setContents(await invoke('listContents', {view})); setLibraryOpen(false); }
                if (method === 'importBackup' || method === 'resumeImport') {
                    const next = await invoke('status');
                    if (next.task?.status === 'committed' && !next.task.targetChanged) setContents(await invoke('listContents', {view}));
                }
            }
        });
    }

    useLayoutEffect(() => { window.scrollTo(0, 0); }, [page]);

    async function navigate(next: Page) {
        await guard(async () => { setPage(next); });
    }
    async function useTemplate(template: TemplateGroup) {
        await guard(async () => {
            if (baseRef.current && !baseRef.current.deletedAt) {
                const id = baseRef.current.id;
                await nativeAction(async () => {
                    const current = await invoke('readContent', {id});
                    load(current);
                    setSelectedTemplate({id: template.id, key: Date.now()});
                    setPage('content');
                });
            } else setTemplatePicker(template);
        });
    }
    const task = status?.task;
    const busy = acting || !status || status.busy;
    const blocked = !!status?.pending || status?.creating|| !!status?.photoPending || !!status?.coverPending || !!status?.coverActionPending;
    let message = !status ? '正在读取机器绑定…' : acting ? '正在处理。中断后请重新查询同一操作。' : task ? `${labels[task.status]} · 已记录 ${task.progress.steps || 0} 个步骤` : status.started ? '上次导入尚无已接受任务，请核验原目标。' : '明确新建或打开内容库，也可导入旧备份。';
    if (task?.targetChanged) message += '。原内容库位置已被替换，请恢复原目录。';
    if (task?.descriptorChanged) message += '。内容库格式已变更，旧导入完成事实保留。';
    const counts = status?.inspection?.counts;
    return <main data-app="ready" data-loaded={status ? 'true' : 'false'} data-busy={acting ? 'true' : 'false'}>
        <aside className="app-navigation" aria-label="主导航"><div className="brand"><span className="brand-mark">N</span><div><strong>Nova</strong><span>内容工作台</span></div></div><div className="nav-label">工作空间</div><nav>{(Object.keys(pageNames) as Page[]).map((key, index) => <button key={key} id={`nav-${key}`} aria-current={page === key ? 'page' : undefined} className={page === key ? 'nav-item active' : 'nav-item'} disabled={busy} onClick={() => void navigate(key)}><span className="nav-symbol" aria-hidden="true">{['◫', '▧', '▤', '▦', '✧'][index]}</span>{pageNames[key]}</button>)}</nav><div className="nav-bottom"><button id="library-menu" className="nav-item" onClick={() => setLibraryOpen(open => !open)}><span className="nav-symbol" aria-hidden="true">▱</span>内容库</button><button id="open-settings" className="nav-item" disabled={busy || blocked} onClick={() => setSettings(true)}><span className="nav-symbol" aria-hidden="true">⚙</span>设置</button><div className="nav-library"><span className="library-dot"/><span id="library-summary">{status?.currentName || '尚未打开内容库'}</span></div><p className="nav-footnote">资料保存在你的本机</p></div></aside>
        <div className="app-stage"><header className="app-header"><div><p className="breadcrumb">工作空间 / {pageNames[page]}</p><Typography.Title heading={1}>{pageNames[page]}</Typography.Title></div><div className="header-actions"><span className="save-indicator">{dirty ? '有未保存草稿' : '本机内容库'}</span><Button id="refresh-workspace" disabled={busy || !status?.currentName} onClick={() => void nativeAction(async () => { await refreshEditor(); setCoverRefresh(n => n + 1); if (status?.currentName) setContents(await invoke('listContents', {view})); })}>刷新</Button></div></header>
        {(blocked || status?.seedPending || status?.task && status.task.status !== 'committed') && <Banner type="warning" closeIcon={null} description="有待恢复的操作，请查看内容库或封面创作中的提示，继续同一操作。"/>}
        <section className="library-manager" hidden={!!status?.currentName && !libraryOpen && !status?.pending && !status?.creating && !(status?.task && status.task.status !== 'committed')} aria-label="内容库管理">
        <Card title="当前内容库"><p
            id="current-library">{status?.currentName || '尚未打开内容库'}{status?.needsReselect ? ' · 旧绑定缺少目录身份，请明确重选' : ''}</p>
            <div className="actions"><Button id="create-library" disabled={busy || blocked}
                                             onClick={() => void guard(() => act('createLibrary'))}>新建内容库</Button><Button
                id="open-library" disabled={busy || blocked}
                onClick={() => void guard(() => act('openLibrary'))}>打开内容库</Button></div>
            {status?.creating &&
                <div><p>新库创建结果待核实；固定原目标，失败目录会保留。</p><Button id="abandon-creation" disabled={busy}
                                                                                 onClick={() => void resolve('discard')}>明确放弃这次创建并保留目录</Button>
                </div>}{(!!status?.pending || status?.creating) &&
                <div id="pending"><p>保存结果待核实。提交草稿已保留；核验前不能换库或发起第二笔写入。</p><Button
                    id="query-pending" disabled={busy}
                    onClick={() => void recover()}>核验保存结果</Button>{(pending?.state === 'missing' || status?.creationMissing) &&
                    <Button id="retry-pending" disabled={busy}
                            onClick={() => void recover(true)}>明确重试同一操作</Button>}{pending && <>
                    <p>状态：{pending.state}</p><Button id="keep-pending" disabled={busy}
                                                       onClick={() => void resolve('keep')}>保留提交草稿</Button><Button
                    id="save-as-pending" disabled={busy || !pending.draft}
                    onClick={() => void resolve('saveAs')}>将提交草稿另存内容</Button><Button id="discard-pending"
                                                                                              disabled={busy}
                                                                                              onClick={() => void resolve('discard')}>明确放弃提交并载入磁盘</Button></>}
                </div>}</Card>
        <Card title={<h2 id="import-heading">导入旧备份</h2>} aria-labelledby="import-heading">
            <div className="actions"><Button id="backup" theme="solid"
                                             disabled={busy || blocked || (!!task && task.status !== 'committed')}
                                             onClick={() => void act('chooseBackup')}>选择旧备份</Button><Button
                id="destination" disabled={busy || blocked || !status?.sourceName || !!task}
                onClick={() => void act('chooseDestination')}>选择新库位置</Button></div>
            <p id="selection">旧备份：{status?.sourceName || '未选择'} 新内容库：{status?.destinationName || '未选择'}</p>
            <div id="preview">{counts && <><p>预检：内容 {counts.contents} · 合集 {counts.collections} ·
                模板 {counts.templates} · 照片 {counts.photos} · 提示词 {counts.prompts} · 发布 {counts.publications} ·
                回收项 {counts.trash}</p>
                <p>预检只读；存在内嵌图片不代表已经完整解码。</p>{status.inspection?.warnings.map(warning => <p
                    key={warning.code}>{warning.message}</p>)}</>}</div>
            <div className="actions"><Button id="import" theme="solid"
                                             disabled={busy || blocked || !status?.destinationName || !!task}
                                             onClick={() => void guard(() => act('importBackup'))}>导入并打开</Button><Button
                id="resume" disabled={busy || blocked || !task || task.targetChanged}
                onClick={() => void guard(() => act('resumeImport'))}>{task?.status === 'committed' ? '打开导入结果' : '继续导入'}</Button><Button
                id="refresh" disabled={acting} onClick={() => void act('status')}>查询状态</Button><Button id="list"
                                                                                                           disabled={busy || (!status?.currentName && task?.status !== 'committed') || task?.targetChanged}
                                                                                                           onClick={() => void act('listContents')}>查看内容</Button>
            </div>
            <p id="status" role="status" aria-live="polite">{message}</p>
            <ul id="issues">{!!task?.issues.length &&
                <li>有 {task.issues.length} 项待确认；缺失资源保留了记录。</li>}{task?.issues.slice(0, 50).map((issue, index) =>
                <li key={index}>{issue.code || '资源待补齐'}{issue.key ? ` · ${issue.key}` : ''}</li>)}</ul>
        </Card>
        </section>
        <p id="error" role="alert">{error}</p>
        {page === 'overview' && <Overview workspace={workspace} busy={busy} open={item => void select(item)}/>}
        {page === 'templates' && <TemplatesPage key={libraryEpoch} assets={assets} busy={busy || !!blocked} useTemplate={template => void useTemplate(template)}/>}
        {page === 'calendar' && <CalendarPage workspace={workspace} busy={busy} open={item => void select(item)}/>}
        {page === 'prompts' && <PromptsPage key={libraryEpoch} workspace={workspace}/>}
        <div className="content-workspace" hidden={page !== 'content'}><aside className="content-sidebar">
        <Card title={<h2 id="content-heading">内容列表</h2>} aria-labelledby="content-heading">
            <div className="actions"><Button id="new-content" disabled={busy || !status?.currentName || blocked}
                                             onClick={() => void guard(async () => {
                                                 setBase(null);
                                                 setDraft({title: '未命名内容', body: ''});
                                                 setDisk(null);
                                             })}>新建内容</Button><Button id="active-view"
                                                                          disabled={busy || !status?.currentName}
                                                                          onClick={() => void nativeAction(async () => {
                                                                              setView('active');
                                                                              setContents(await invoke('listContents', {view: 'active'}));
                                                                          })}>活动内容</Button><Button id="trash-view"
                                                                                                       disabled={busy || !status?.currentName}
                                                                                                       onClick={() => void nativeAction(async () => {
                                                                                                           setView('trash');
                                                                                                           setContents(await invoke('listContents', {view: 'trash'}));
                                                                                                       })}>回收站</Button><Button
                id="refresh-contents" disabled={busy || !status?.currentName}
                onClick={() => void act('listContents')}>刷新内容与磁盘版本</Button></div>
            <input type="search" className="content-search" aria-label="搜索内容" placeholder="搜索标题或正文" value={contentQuery} onChange={event => setContentQuery(event.target.value)}/><div id="contents">{contents === null ? <p>打开内容库后可查看内容。</p> : contents.length === 0 ?
                <p>当前视图没有内容。</p> : contents.filter(item => `${item.title} ${item.body}`.toLowerCase().includes(contentQuery.toLowerCase())).map(item => <details key={item.id} open={item.id === base?.id} className={item.id === base?.id ? 'content-row selected' : 'content-row'} data-content-id={item.id}>
                    <summary onClick={event => { event.preventDefault(); if (!busy) void select(item); }}>{item.title}</summary>
                    <pre>{item.body || '（基础正文为空；旧渠道文案保存在各自发布计划中。）'}</pre>
                    <Button disabled={busy} onClick={() => void select(item)}>打开编辑</Button><Button disabled={busy || blocked}
                                                                                       onClick={() => void recycle(item)}>{view === 'trash' ? '恢复内容' : '移入回收站'}</Button>
                </details>)}</div>
        </Card>
        </aside><section className="content-detail" aria-label="内容详情">
        {!draft && <Card className="empty-detail"><h2>{status?.currentName ? '选择一篇内容，开始创作' : '欢迎来到你的内容中心'}</h2><p>{status?.currentName ? '从左侧打开内容，或新建一篇。保存正文后就能选择模板并准备封面。' : '请先新建内容库，或打开已有内容库。旧版资料可从“导入旧备份”恢复。'}</p></Card>}
        {draft && <Card title="编辑内容"><p
            id="dirty-state">{dirty ? '有未保存草稿' : '已保存'}{base?.deletedAt ? ' · 此内容在回收站' : ''}</p><label
            htmlFor="content-title">标题</label><input id="content-title" disabled={busy || blocked} maxLength={500}
                                                       value={draft.title} onChange={event => setDraft({
            ...draft,
            title: event.target.value
        })}/><label htmlFor="content-body">正文</label><textarea id="content-body" disabled={busy || blocked}
                                                                 maxLength={1_000_000} value={draft.body}
                                                                 onChange={event => setDraft({
                                                                     ...draft,
                                                                     body: event.target.value
                                                                 })}/>
            <div className="actions"><Button id="save-content" theme="solid"
                                             disabled={busy || !dirty || blocked || !!disk || !!base?.deletedAt}
                                             onClick={() => void save()}>保存内容</Button><Button id="save-as-content"
                                                                                                  disabled={busy || blocked}
                                                                                                  onClick={() => {
                                                                                                      setBase(null);
                                                                                                      setDisk(null);
                                                                                                  }}>将当前草稿另存内容</Button>
            </div>
            {disk && <section id="conflict" role="alert"><h3>磁盘版本与本地草稿</h3><p>磁盘标题：{disk.title}</p>
                <pre id="disk-body">{disk.body}</pre>
                <p>本地草稿：{draft.title}</p>
                <pre id="local-body">{draft.body}</pre>
                <Button id="keep-draft" onClick={() => setDisk(disk)}>保留当前草稿</Button><Button id="discard-draft"
                                                                                                   disabled={!!status?.pending}
                                                                                                   onClick={() => load(disk)}>明确放弃草稿并载入磁盘</Button>
            </section>}</Card>}
        <CoverPanel selectedTemplate={selectedTemplate} key={`${libraryEpoch}:${base?.id ?? 'none'}`} status={status} content={base} dirty={dirty} busy={busy} blocked={!!blocked} refreshToken={coverRefresh} run={nativeAction} onContent={item => { if (item.id !== baseRef.current?.id) return; if (dirtyRef.current && item.editToken !== baseRef.current.editToken) setDisk(item); else if (!dirtyRef.current) load(item); }} />
        </section></div>
        {templatePicker && <dialog ref={templateDialog} className="template-content-dialog" onCancel={() => setTemplatePicker(null)} aria-labelledby="template-content-title"><div className="dialog-heading"><div><h2 id="template-content-title">为哪篇内容使用模板？</h2><p>{templatePicker.name} · 打开内容后预选这组样张</p></div><Button onClick={() => setTemplatePicker(null)}>关闭</Button></div><div className="template-content-list">{workspace?.contents.filter(item => !item.deletedAt).map(item => <button disabled={busy} key={item.id} onClick={() => void select(item, templatePicker.id)}><strong>{item.title}</strong><span>{item.body.slice(0, 90) || '正文待补充'}</span></button>)}{!workspace?.contents.some(item => !item.deletedAt) && <p>还没有活动内容。先到“内容”页新建并保存，再使用模板。</p>}</div></dialog>}
        {settings && <AssistantSettings status={status} busy={busy} blocked={!!blocked} run={nativeAction} close={() => setSettings(false)} />}
    {leaving &&
            <dialog ref={leaveDialog} className="leave-dialog" onCancel={() => setLeaving(null)} aria-modal="true"
                    aria-labelledby="leave-title"><h3 id="leave-title">草稿尚未保存</h3>
                <p>保存后继续、明确放弃，或留在当前内容。</p><Button id="leave-save" disabled={busy || !!status?.pending}
                                                                  onClick={() => {
                                                                      void save().then(async saved => {
                                                                          if (saved) {
                                                                              setLeaving(null);
                                                                              await leaving(true);
                                                                          }
                                                                      });
                                                                  }}>保存后继续</Button><Button id="leave-discard"
                                                                                                disabled={!!status?.pending}
                                                                                                onClick={() => {
                                                                                                    const action = leaving;
                                                                                                    setLeaving(null);
                                                                                                    setDraft(null);
                                                                                                    setBase(null);
                                                                                                    setDisk(null);
                                                                                                    void action(false);
                                                                                                }}>放弃后继续</Button><Button
                    id="leave-stay" onClick={() => setLeaving(null)}>留在当前内容</Button></dialog>}
    </div></main>;
}

const root = document.getElementById('root');
if (!root) throw new Error('Renderer root is missing');
createRoot(root).render(<App/>);
