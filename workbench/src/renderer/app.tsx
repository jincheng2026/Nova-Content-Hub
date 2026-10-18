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
import {ContentList} from './content-list.tsx';
import {AssistantSettings} from './assistant-settings.tsx';
import {LibraryPanels, ContentMetadataPanel, ContentMaterialPanel, hasManagedDrafts} from './library-panels.tsx';
import {MaintenancePanel} from './maintenance-panel.tsx';
import {PreferencesPanel} from './preferences-panel.tsx';
import {SetupPanel} from './setup-panel.tsx';
import {BootstrapRecoveryPanel} from './bootstrap-panel.tsx';
import {NavigationIcon} from './navigation-icon.tsx';
import type {WorkspaceLibrarySnapshot} from '../shared/workspace-contracts.ts';
import {invoke} from './client.ts';
import {CalendarPage, Overview, PromptsPage, TemplatesPage, pageNames} from './workspace-pages.tsx';
import {PublicationPanel, type PublicationFocus} from './publication-panel.tsx';
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
    const [page, setPage] = useState<Page>('overview');
    const [workspace, setWorkspace] = useState<DesktopResults['readWorkspace'] | null>(null);
    const [library, setLibrary] = useState<WorkspaceLibrarySnapshot | null>(null);
    const [workspaceUnavailable, setWorkspaceUnavailable] = useState(false);
    const [watchUnavailable, setWatchUnavailable] = useState(false);
    const changesPending = useRef(false);
    const automaticRefresh = useRef<() => void>(() => {});
    const [assets, setAssets] = useState<CoverResults['listCoverAssets'] | null>(null);
    const [selectedTemplate, setSelectedTemplate] = useState<{id: string; key: number} | null>(null);
    const [templatePicker, setTemplatePicker] = useState<TemplateGroup | null>(null);
    const [contentQuery, setContentQuery] = useState('');
    const templateDialog = useRef<HTMLDialogElement>(null);
    useEffect(() => { if (templatePicker) templateDialog.current?.showModal(); }, [templatePicker]);
    const [libraryEpoch, setLibraryEpoch] = useState(0);
    const epochRef = useRef(0);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const libraryDialog = useRef<HTMLDialogElement>(null);
    const recoveryDialog = useRef<HTMLDialogElement>(null);
    const [recoveryOpen, setRecoveryOpen] = useState(false);
    useEffect(() => {if (recoveryOpen) recoveryDialog.current?.showModal();}, [recoveryOpen]);
    const [libraryTab, setLibraryTab] = useState<'resources' | 'storage'>('resources');
    const [detailOpen, setDetailOpen] = useState(false);
    const [contentTab, setContentTab] = useState<'covers' | 'body' | 'materials' | 'publication'>('covers');
    const [coverStartOpenKey, setCoverStartOpenKey] = useState(0);
    useEffect(() => { if (libraryOpen) libraryDialog.current?.showModal(); }, [libraryOpen]);
    const [photoManagerEpoch, setPhotoManagerEpoch] = useState(0);
    const [promptContentId, setPromptContentId] = useState<string | null>(null);
    const [calendarFocus, setCalendarFocus] = useState<PublicationFocus | null>(null);
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
    const report = (failure: unknown, preserveError = false) => {
        const value = errorInfo(failure);
        setError(previous => preserveError && previous ? previous : `${value.message}（${value.code}）`);
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
        setLibrary(null);
        setWorkspaceUnavailable(false);
        setWatchUnavailable(false);
        changesPending.current = false;
        setAssets(null);
        setSelectedTemplate(null);
        setTemplatePicker(null);
        setPromptContentId(null);
        setCalendarFocus(null);
        setDetailOpen(false);
        setContentTab('covers');
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
        let snapshot: DesktopResults['readWorkspace'], coverAssets: CoverResults['listCoverAssets'], detail: WorkspaceLibrarySnapshot;
        try { [snapshot, coverAssets, detail] = await Promise.all([invoke('readWorkspace'), invoke('listCoverAssets'), invoke('readWorkspaceLibrary')]); }
        catch (failure) { if (epoch === epochRef.current) {setWorkspaceUnavailable(true);} throw failure; }
        if (epoch !== epochRef.current) return;
        setWorkspace(snapshot);
        setWorkspaceUnavailable(false);
        setAssets(coverAssets);
        setLibrary(detail);
    }
    useEffect(() => {
        const epoch = epochRef.current;
        void refreshStatus().then(async next => { if (next.currentName) { const items = await invoke('listContents', {view: 'active'}); if (epochRef.current === epoch) { setContents(items); await refreshWorkspace(); } } }).catch(failure => {report(failure);});
    }, []);

    useEffect(() => { void invoke('readPreferences').then(value => { document.documentElement.dataset.reducedMotion = String(value.values.reducedMotion); }, () => {}); }, []);
    useEffect(() => { const show = () => { void navigate('calendar'); }; window.addEventListener('nova-show-calendar', show); return () => window.removeEventListener('nova-show-calendar', show); });

    async function refreshEditor() {
        if (!base) return;
        const epoch = epochRef.current, selected = base.id;
        const current = await invoke('readContent', {id: selected});
        if (epoch !== epochRef.current || baseRef.current?.id !== selected) return;
        if (current.editToken !== baseRef.current.editToken) {
            if (dirtyRef.current) setDisk(current); else load(current);
        }
    }

    automaticRefresh.current = () => {
        if (!changesPending.current || active.current || document.hidden || !status?.currentName || status.busy) return;
        changesPending.current = false;
        const epoch = epochRef.current;
        void nativeAction(async () => {
            await refreshEditor();
            const items = await invoke('listContents', {view});
            if (epoch !== epochRef.current) return;
            setContents(items);
            setCoverRefresh(value => value + 1);
        }, {preserveError: true});
    };
    useEffect(() => {
        const unsubscribe = window.contentHub.onWorkspaceChanged(change => {
            if (change === 'unavailable') {setWatchUnavailable(true); return;}
            setWatchUnavailable(false);
            changesPending.current = true;
            automaticRefresh.current();
        });
        const focus = () => {changesPending.current = true; automaticRefresh.current();};
        const visible = () => {if (!document.hidden) focus();};
        window.addEventListener('focus', focus);
        document.addEventListener('visibilitychange', visible);
        return () => {unsubscribe(); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', visible);};
    }, []);
    useEffect(() => {if (!acting) automaticRefresh.current();}, [acting, status?.currentName]);
    useEffect(() => {
        const prevent = (event: BeforeUnloadEvent) => {
            if (dirtyRef.current || hasManagedDrafts()) {
                event.preventDefault();
                event.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', prevent);
        return () => window.removeEventListener('beforeunload', prevent);
    }, []);

    async function guard(action: (saved?: boolean) => Promise<void>) {
        if (hasManagedDrafts()) { setError('还有未保存的填写内容，请回到暂时收起的编辑窗口，保存或明确关闭后再继续。'); return; }
        if (dirty) setLeaving(() => action); else await action();
    }

    async function nativeAction<T>(action: () => Promise<T>, {preserveError = false}: {preserveError?: boolean} = {}): Promise<T | undefined> {
        if (active.current) return;
        active.current = true;
        setActing(true);
        if (!preserveError) setError('');
        try {
            return await action();
        } catch (failure) {
            report(failure, preserveError);
            return undefined;
        } finally {
            try {
                const next = await refreshStatus();
                if (next.currentName) {
                    try { await refreshWorkspace(); } catch (failure) { report(failure, preserveError); }
                }
            } catch (failure) {
                setStatus(null);
                report(failure, preserveError);
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
            if (hasManagedDrafts()) { setError('其他编辑窗口的填写内容尚未保存，请先返回完成编辑。'); complete(false); return; }
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
            if (found?.current || found?.draft) {setPage('content'); setDetailOpen(true); setContentTab('body');}
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
            if (item || retained && action === 'keep') {setPage('content'); setDetailOpen(true); setContentTab('body');}
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

    async function select(item: Content, template?: string, generate = false) {
        await guard(async () => {
            const epoch = epochRef.current;
            await nativeAction(async () => { const current = await invoke('readContent', {id: item.id}); if (epoch === epochRef.current) { load(current); setPage('content'); setDetailOpen(true); setContentTab('covers'); setCoverStartOpenKey(value => generate ? value + 1 : 0); setSelectedTemplate(template ? {id: template, key: Date.now()} : null); if (template) setCoverStartOpenKey(value => value + 1); setTemplatePicker(null); } });
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
        await guard(async () => { setPromptContentId(null); setPage(next); setCalendarFocus(null); setCoverStartOpenKey(0); if (next === 'content') setDetailOpen(false); });
    }
    async function openContentPrompts() {
        const selectedId = baseRef.current?.id;
        if (!selectedId || baseRef.current?.deletedAt) return;
        await guard(async () => {
            const epoch = epochRef.current;
            await nativeAction(async () => {
                const current = await invoke('readContent', {id: selectedId});
                if (epoch !== epochRef.current || current.deletedAt) return;
                load(current);
                setPromptContentId(current.id);
                setPage('prompts');
            });
        });
    }
    async function openPhotoManagement() {
        await guard(async () => {
            setLibraryTab('resources');
            setPhotoManagerEpoch(value => value + 1);
            setLibraryOpen(true);
            requestAnimationFrame(() => document.getElementById('library-panels')?.scrollIntoView({block: 'start'}));
        });
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
                    setDetailOpen(true);
                    setContentTab('covers');
                    setCoverStartOpenKey(value => value + 1);
                });
            } else setTemplatePicker(template);
        });
    }
    async function changeContentTab(next: typeof contentTab) {
        if (next === contentTab) return;
        const current = disk ?? baseRef.current;
        const wasDirty = dirty;
        await guard(async saved => {
            if (wasDirty && !saved && current) load(current);
            setContentTab(next);
        });
    }
    async function startCover() {
        const current = disk ?? baseRef.current;
        if (!current || current.deletedAt) return;
        const wasDirty = dirty;
        await guard(async saved => {
            if (wasDirty && !saved) load(current);
            setContentTab('covers');
            setCoverStartOpenKey(value => value + 1);
        });
    }
    async function openCalendarFocus(focus?: PublicationFocus) {
        await guard(async () => {setCalendarFocus(focus ?? null); setCoverStartOpenKey(0); setPage('calendar');});
    }
    async function newContent() {
        await guard(async () => {
            setBase(null); setDraft({title: '未命名内容', body: ''}); setDisk(null); setSelectedTemplate(null);
            setContentTab('body'); setCoverStartOpenKey(0); setDetailOpen(true); setPage('content');
        });
    }
    async function backToContents() {
        await guard(async () => { setBase(null); setDraft(null); setDisk(null); setCoverStartOpenKey(0); setDetailOpen(false); });
    }
    function openRecovery() {
        if (hasManagedDrafts()) {setRecoveryOpen(true); return;}
        setLibraryTab('storage');
        setLibraryOpen(true);
    }
    async function recoverCoverOperation(method: 'resumePhoto' | 'abandonPhoto' | 'resumeCover' | 'abandonCover' | 'resumeCoverAction' | 'abandonCoverAction' | 'retryBuiltins') {
        await nativeAction(async () => {
            await invoke(method);
            setCoverRefresh(value => value + 1);
            await refreshEditor();
        });
    }
    function closeLibrary() {
        if (hasManagedDrafts()) { setError('内容库管理中还有未保存的填写内容，请先保存或放弃修改。'); return; }
        setLibraryOpen(false);
    }
    const task = status?.task;
    const busy = acting || !status || status.busy;
    const blocked = !!status?.pending || status?.creating|| !!status?.photoPending || !!status?.coverPending || !!status?.coverActionPending || !!status?.workspacePending || !!status?.templatePending || !!status?.maintenance.pending || !!status?.seedPending;
    let message = !status ? '正在打开工作空间…' : acting ? '正在处理。中断后请重新查询同一操作。' : task ? `${labels[task.status]} · 已记录 ${task.progress.steps || 0} 个步骤` : status.started ? '上次导入尚无已接受任务，请核验原目标。' : '明确新建或打开内容库，也可导入旧备份。';
    if (task?.targetChanged) message += '。原内容库位置已被替换，请恢复原目录。';
    if (task?.descriptorChanged) message += '。内容库格式已变更，旧导入完成事实保留。';
    const currentContentSummary = workspace?.contents.find(item => item.id === base?.id);
    const currentContentDetails = library?.contentDetails.find(item => item.id === base?.id);
    const hasPublishedRecord = !!currentContentDetails?.publications.some(item => !currentContentDetails.publicationEvents.some(event => event.targetId === item.id));
    const contentStage = base?.deletedAt ? '回收站' : !base ? '新内容' : hasPublishedRecord ? '已有发布记录' : currentContentSummary?.selectedCandidateId ? '已选封面' : currentContentSummary?.candidateCount ? '待选封面' : '待做封面';
    const counts = status?.inspection?.counts;
    const recoveryCards = <>
        {status?.workspacePending && <Card title="上次修改需要核验"><p>原操作与输入已保留，确认前不会开始新的写入。</p><p>状态：{status.workspacePending.state === 'conflict' ? '对象已改变，请保留输入后重新编辑' : status.workspacePending.state === 'missing' ? '尚未找到提交记录' : '结果待核验'}</p><details><summary>查看已保留的输入</summary><pre>{JSON.stringify(status.workspacePending.input, null, 2)}</pre></details><div className="actions"><Button disabled={busy} onClick={() => void nativeAction(async () => { await invoke('recoverWorkspaceMutation'); await refreshEditor(); })}>核验上次修改</Button>{status.workspacePending.state === 'missing' && <Button disabled={busy} onClick={() => void nativeAction(async () => { await invoke('retryWorkspaceMutation'); await refreshEditor(); })}>重试同一操作</Button>}{['missing', 'conflict'].includes(status.workspacePending.state) && <Button disabled={busy} onClick={() => void nativeAction(() => invoke('abandonWorkspaceMutation'))}>放弃原修改并保留文件</Button>}</div></Card>}
        {status?.templatePending && <Card title="模板操作需要核验"><p>学习、还原或验收的原操作已保留。核验前不会开始新的写入。</p><p>状态：{status.templatePending.state === 'conflict' ? '原模板已改变' : status.templatePending.state === 'missing' ? '尚未找到提交记录' : '结果待核验'}</p><div className="actions"><Button disabled={busy} onClick={() => void nativeAction(async () => { await invoke('recoverTemplateMutation'); await refreshWorkspace(); })}>核验模板操作</Button>{status.templatePending.state === 'missing' && <Button disabled={busy} onClick={() => void nativeAction(async () => { await invoke('retryTemplateMutation'); await refreshWorkspace(); })}>重试同一操作</Button>}{['missing', 'conflict'].includes(status.templatePending.state) && <Button disabled={busy} onClick={() => void nativeAction(() => invoke('abandonTemplateMutation'))}>放弃原操作并保留文件</Button>}</div></Card>}
        {status?.photoPending && <Card title="继续导入照片"><p>原文件选择与本人照片声明已保留；空内容库也可以继续处理。</p><div className="actions"><Button id="global-resume-photo" disabled={busy} onClick={() => void recoverCoverOperation('resumePhoto')}>核验并继续导入</Button><Button id="global-abandon-photo" disabled={busy} onClick={() => void recoverCoverOperation('abandonPhoto')}>放弃这次导入意图</Button></div></Card>}
        {status?.coverPending && <Card title="继续准备封面"><p>原请求已保留，继续同一次操作；已提交任务仍留在原内容中。</p><div className="actions"><Button id="global-resume-cover" disabled={busy} onClick={() => void recoverCoverOperation('resumeCover')}>核验并交给助手</Button><Button id="global-abandon-cover" disabled={busy} onClick={() => void recoverCoverOperation('abandonCover')}>放弃这次准备意图</Button></div></Card>}
        {status?.coverActionPending && <Card title="核验封面操作"><p>上次选用或取消的原操作已保留。</p><div className="actions"><Button id="global-resume-cover-action" disabled={busy} onClick={() => void recoverCoverOperation('resumeCoverAction')}>核验并继续原操作</Button><Button id="global-abandon-cover-action" disabled={busy} onClick={() => void recoverCoverOperation('abandonCoverAction')}>放弃这次操作意图</Button></div></Card>}
        {status?.seedPending && <Card title="继续准备内置模板"><p>上次内置模板准备尚未完成。</p><Button id="global-retry-builtins" disabled={busy} onClick={() => void recoverCoverOperation('retryBuiltins')}>继续准备内置模板</Button></Card>}
    </>;
    return <main data-app="ready" data-loaded={status ? 'true' : 'false'} data-busy={acting ? 'true' : 'false'}>
        <aside className="app-navigation" aria-label="主导航"><div className="brand"><span className="brand-mark" role="img" aria-label="自媒体工作台图标"/><div><strong>自媒体工作台</strong><span>内容创作工作空间</span></div></div><div className="nav-label">工作空间 <span className="free-badge">免费体验</span></div><nav>{(Object.keys(pageNames) as Page[]).map(key => <button key={key} id={`nav-${key}`} aria-current={page === key ? 'page' : undefined} className={page === key ? 'nav-item active' : 'nav-item'} disabled={busy} onClick={() => void navigate(key)}><NavigationIcon name={key}/>{pageNames[key]}</button>)}</nav><div className="nav-bottom"><button id="library-menu" className="nav-item" onClick={() => void guard(async () => {setLibraryTab('resources'); setLibraryOpen(true);})}><NavigationIcon name="library"/>内容库</button><button id="open-settings" className="nav-item" disabled={acting || !!status?.busy} onClick={() => { if (hasManagedDrafts()) setError('请先保存或明确关闭当前编辑，再打开设置。'); else setSettings(true); }}><NavigationIcon name="settings"/>设置</button><div className="nav-library"><span className="library-dot"/><span id="library-summary">{status?.currentName || '尚未打开内容库'}</span></div><p className="nav-footnote">资料保存在你的本机</p></div></aside>
        <div className="app-stage"><header className="app-header"><div><p className="breadcrumb">工作空间 / {pageNames[page]}</p><Typography.Title heading={1}>{page === 'content' && detailOpen ? '内容详情' : pageNames[page]}</Typography.Title></div><div className="header-actions"><span className="save-indicator">{dirty ? '有未保存草稿' : '本机保存'}</span><Button id="refresh-workspace" disabled={busy || !status?.currentName} onClick={() => void nativeAction(async () => { await refreshEditor(); setCoverRefresh(n => n + 1); if (status?.currentName) setContents(await invoke('listContents', {view})); })}>刷新</Button></div></header>
        {(blocked || status?.task && status.task.status !== 'committed') && <div className="recovery-notice"><Banner type="warning" closeIcon={null} description="有一项操作等待确认，已保留原输入。"/><Button onClick={openRecovery}>继续处理</Button></div>}
        {!status && !settings && <BootstrapRecoveryPanel busy={acting} run={nativeAction} onRecovered={async () => { clearEditor(); setLibraryTab('storage'); setLibraryOpen(true); await refreshStatus(); }}/>}
        {status && !status.currentName && <section className="welcome-library"><span className="welcome-brand brand-mark" aria-hidden="true"/><div><h2>让内容创作，从这里开始</h2><p>新建内容库，或打开你已有的本机内容库。</p></div><div className="actions"><Button id="welcome-create-library" theme="solid" disabled={busy || blocked} onClick={() => void guard(() => act('createLibrary'))}>新建内容库</Button><Button id="welcome-open-library" disabled={busy || blocked} onClick={() => void guard(() => act('openLibrary'))}>打开内容库</Button></div></section>}
        {libraryOpen && <dialog ref={libraryDialog} className="library-manager-dialog" aria-labelledby="library-manager-title" onCancel={event => {event.preventDefault(); closeLibrary();}}><div className="dialog-heading"><div><h2 id="library-manager-title">内容库管理</h2><p>{status?.currentName || '打开或新建你的本机内容库'}</p></div><div className="actions">{blocked && <Button onClick={openRecovery}>继续处理</Button>}<Button disabled={acting} onClick={closeLibrary}>关闭</Button></div></div><div className="manager-tabs"><Button theme={libraryTab === 'resources' ? 'solid' : 'borderless'} onClick={() => {if (hasManagedDrafts()) setError('请先保存或放弃当前填写，再切换管理页。'); else setLibraryTab('resources');}}>资料与默认值</Button><Button theme={libraryTab === 'storage' ? 'solid' : 'borderless'} onClick={() => {if (hasManagedDrafts()) setError('请先保存或放弃当前填写，再切换管理页。'); else setLibraryTab('storage');}}>备份与维护</Button></div><p className="manager-error" role="alert">{error}</p>
        {libraryTab === 'storage' && <section className="library-manager" aria-label="备份与维护">
        <Card title="当前内容库"><p
            id="current-library">{status?.currentName || '尚未打开内容库'}{status?.needsReselect ? ' · 旧绑定缺少目录身份，请明确重选' : ''}</p>
            <div className="actions"><Button id="create-library" disabled={busy || blocked}
                                             onClick={() => void guard(() => act('createLibrary'))}>新建内容库</Button><Button
                id="open-library" disabled={busy || blocked}
                onClick={() => void guard(() => act('openLibrary'))}>打开内容库</Button><Button disabled={busy || !status?.currentName} onClick={() => void nativeAction(() => invoke('revealLibraryFolder'))}>在文件管理器中查看</Button></div>
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
        {!recoveryOpen && recoveryCards}
        <MaintenancePanel key={libraryEpoch} status={status} busy={busy} diagnosticsBusy={acting} blocked={!!blocked} run={nativeAction}/>
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
        </section>}
        {libraryTab === 'resources' && (status?.currentName ? <section id="library-panels" aria-label="内容库资料管理"><LibraryPanels key={`${libraryEpoch}:${photoManagerEpoch}`} library={library} assets={assets} busy={busy || !!blocked || dirty} run={nativeAction} refresh={async () => { await refreshWorkspace(); await refreshEditor(); }} choosePhoto={async () => { await nativeAction(async () => { await invoke('choosePhoto', {title: '我的照片', isOwnPhoto: false}); }); }}/></section> : <div className="blank-state"><p>先打开内容库，再管理照片、渠道和默认值。</p><Button onClick={() => setLibraryTab('storage')}>打开内容库</Button></div>)}</dialog>}
        <p id="error" role="alert">{error}</p>
        {workspaceUnavailable && <Banner type="warning" closeIcon={null} description="当前内容库尚未完整读取。下方保留的是上次显示的数据和未保存草稿；请先在内容库维护中检查问题，再刷新。"/>}
        {watchUnavailable && !workspaceUnavailable && <Banner type="warning" closeIcon={null} description="内容库目录或自动刷新监听暂时不可用。原文件和草稿保留；可在内容库入口检查目录，或手动刷新。工作台只会重新连接原目录身份。"/>}
        {page === 'overview' && <Overview createContent={() => void newContent()} openTemplates={() => void navigate('templates')} openCalendar={focus => void openCalendarFocus(focus)} generate={item => void select(item, undefined, true)} workspace={workspace} library={library} busy={busy} open={item => void select(item)} openCollection={focus => void openCalendarFocus(focus)}/>}
        {page === 'templates' && <TemplatesPage key={libraryEpoch} library={library} run={nativeAction} refresh={refreshWorkspace} assets={assets} busy={busy || !!blocked || dirty} useTemplate={template => void useTemplate(template)} managePhotos={() => void openPhotoManagement()}/>}
        {page === 'calendar' && <CalendarPage key={`${libraryEpoch}:${calendarFocus ? `${calendarFocus.kind}:${calendarFocus.id}:${calendarFocus.planId ?? ''}:${calendarFocus.day ?? ''}` : 'all'}`} initialFocus={calendarFocus} library={library} run={nativeAction} refresh={async () => { await refreshWorkspace(); await refreshEditor(); }} workspace={workspace} busy={busy || !!blocked || dirty} open={item => void select(item)}/>}
        {page === 'prompts' && <PromptsPage key={libraryEpoch} initialContentId={promptContentId} currentContentId={base && !base.deletedAt ? base.id : null} workspace={workspace} library={library} busy={busy || !!blocked || dirty} run={nativeAction} refresh={refreshWorkspace} importPrompt={async () => await nativeAction(() => invoke('choosePromptDocument')) ?? null}/>}
        {page === 'content' && (!detailOpen || !draft ? <ContentList contents={contents} workspace={workspace} library={library} query={contentQuery} setQuery={setContentQuery} view={view} busy={busy} blocked={!!blocked} ready={!!status?.currentName} changeView={next => void guard(async () => { await nativeAction(async () => {setView(next); setContents(await invoke('listContents', {view: next}));}); })} create={() => void newContent()} open={(item, generate) => void select(item, undefined, generate)} recycle={item => void recycle(item)}/> : <section className="content-detail-page" aria-label="内容详情"><button className="back-to-contents" disabled={busy} onClick={() => void backToContents()}>← 返回内容列表</button><div className="content-detail-hero"><div><div className="content-detail-state"><span className="tag">{contentStage}</span><span id="dirty-state">{dirty ? '有未保存草稿' : '已保存'}</span></div><h2>{draft.title || '未命名内容'}</h2><p>{base ? '正文、封面和发布安排，都在这一篇内容里。' : '先保存标题和正文，再制作封面。'}</p></div>{contentTab !== 'covers' && <Button id="make-content-cover" theme="solid" disabled={busy || blocked || !base || !!base.deletedAt} onClick={() => void startCover()}>制作封面</Button>}</div><div className="content-detail-tabs" aria-label="内容详情分类">{([['covers', '封面'], ['body', '正文'], ['materials', '资料'], ['publication', '发布计划']] as const).map(([key, label]) => <button key={key} aria-current={contentTab === key ? 'page' : undefined} className={contentTab === key ? 'active' : ''} disabled={busy} onClick={() => void changeContentTab(key)}>{label}</button>)}</div><div className="content-detail-panel">
        {contentTab === 'body' && <Card title="标题与正文"><p
            id="editor-dirty-state">{dirty ? '有未保存草稿' : '已保存'}{base?.deletedAt ? ' · 此内容在回收站' : ''}</p><label
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
                                                                                                  }}>将当前草稿另存内容</Button><Button id="open-content-prompts" disabled={busy || blocked || !base || !!base.deletedAt} onClick={() => void openContentPrompts()}>用提示词继续创作</Button>
            </div>
            {disk && <section id="conflict" role="alert"><h3>磁盘版本与本地草稿</h3><p>磁盘标题：{disk.title}</p>
                <pre id="disk-body">{disk.body}</pre>
                <p>本地草稿：{draft.title}</p>
                <pre id="local-body">{draft.body}</pre>
                <Button id="keep-draft" onClick={() => setDisk(disk)}>保留当前草稿</Button><Button id="discard-draft"
                                                                                                   disabled={!!status?.pending}
                                                                                                   onClick={() => load(disk)}>明确放弃草稿并载入磁盘</Button>
            </section>}</Card>}
        {contentTab === 'materials' && <><ContentMaterialPanel key={`${libraryEpoch}:${base?.id ?? 'new'}`} contentId={base?.id ?? null} library={library} busy={busy || !!blocked || dirty} run={nativeAction} refresh={async () => { await refreshWorkspace(); await refreshEditor(); }}/>{base && !base.deletedAt && <ContentMetadataPanel key={`${libraryEpoch}:${base.id}`} contentId={base.id} library={library} busy={busy || !!blocked || dirty} run={nativeAction} refresh={async () => { await refreshWorkspace(); await refreshEditor(); }}/>}</>}
        {contentTab === 'publication' && <><div className="content-publication-entry"><p className="muted">这篇内容在各个渠道的计划和发布历史，都保存在这里。</p><Button theme="borderless" disabled={busy || !base || !!base.deletedAt} onClick={() => base && void openCalendarFocus({kind: 'content', id: base.id})}>在日历中查看 →</Button></div><PublicationPanel key={`${libraryEpoch}:${base?.id ?? 'new'}`} library={library} documentId={base?.id ?? null} busy={busy || !!blocked || dirty} run={nativeAction} refresh={async () => {await refreshWorkspace(); await refreshEditor();}}/></>}
        <div className="cover-detail-pane" hidden={contentTab !== 'covers'}>
        <CoverPanel startOpenKey={coverStartOpenKey} library={library} refresh={async () => { await refreshWorkspace(); await refreshEditor(); }} selectedTemplate={selectedTemplate} key={`${libraryEpoch}:${base?.id ?? 'none'}`} status={status} content={base} dirty={dirty} busy={busy} blocked={!!blocked} refreshToken={coverRefresh} run={nativeAction} onContent={item => { if (item.id !== baseRef.current?.id) return; if (dirtyRef.current && item.editToken !== baseRef.current.editToken) setDisk(item); else if (!dirtyRef.current) load(item); }} />
        </div>
        </div></section>)}
        {recoveryOpen && <dialog ref={recoveryDialog} className="library-manager-dialog" aria-labelledby="retained-recovery-title" onCancel={event => {event.preventDefault(); setRecoveryOpen(false);}}><div className="dialog-heading"><div><h2 id="retained-recovery-title">继续处理待确认操作</h2><p>原编辑窗口与填写内容保持打开。处理后关闭此窗口，返回继续编辑。</p></div><Button disabled={acting} onClick={() => setRecoveryOpen(false)}>返回编辑</Button></div><p className="manager-error" role="alert">{error}</p><section className="library-manager" aria-label="待确认操作">{recoveryCards}{!blocked && <p role="status">待确认操作已处理，可以返回原编辑窗口。</p>}</section></dialog>}
        {templatePicker && <dialog ref={templateDialog} className="template-content-dialog" onCancel={() => setTemplatePicker(null)} aria-labelledby="template-content-title"><div className="dialog-heading"><div><h2 id="template-content-title">为哪篇内容使用模板？</h2><p>{templatePicker.name} · 打开内容后预选这组样张</p></div><Button onClick={() => setTemplatePicker(null)}>关闭</Button></div><div className="template-content-list">{workspace?.contents.filter(item => !item.deletedAt).map(item => <button disabled={busy} key={item.id} onClick={() => void select(item, templatePicker.id)}><strong>{item.title}</strong><span>{item.body.slice(0, 90) || '正文待补充'}</span></button>)}{!workspace?.contents.some(item => !item.deletedAt) && <p>还没有活动内容。先到“内容”页新建并保存，再使用模板。</p>}</div></dialog>}
        {settings && <AssistantSettings status={status} busy={acting || !!status?.busy} blocked={!!blocked} run={nativeAction} close={() => setSettings(false)}><PreferencesPanel busy={acting || !!status?.busy} run={nativeAction}/><SetupPanel host={status?.assistant} busy={acting || !!status?.busy} run={nativeAction}/><BootstrapRecoveryPanel busy={acting || !!status?.busy} run={nativeAction} onRecovered={async () => { clearEditor(); setLibraryOpen(true); await refreshStatus(); }}/></AssistantSettings>}
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
