import {createWorkspaceReadRecovery,workspaceReadFailure} from '../shared/workspace-read-recovery.ts';
import type {WorkspaceReadIssue} from '../shared/workspace-read-recovery.ts';
import {JinchengBoundWorkspace} from './jincheng-bound-workspace.tsx';
import {JinchengSourceStatus} from './jincheng-source-status.tsx';
import {JinchengWorkDetail} from './jincheng-work-detail.tsx';
import {ContentSourceNotice} from './content-source-notice.tsx';
import {announceVaultRecovery} from '../shared/vault-editor-recovery.ts';
import {VaultWorkspace} from './vault-workspace.tsx';
import {RadarWorkspace} from './radar-workspace.tsx';
import {ContentTitleRecommendations} from './content-title-recommendations.tsx';
import {adoptTitleRecommendation} from '../shared/content-title-recommendations.ts';
import type {ContentTitleRecommendation} from '../shared/content-title-recommendations.ts';
import {ProductionWorkspace, ContentProduction, ProductionContentDirectory} from './production-workspace.tsx';
import {ServiceSettings} from './service-settings.tsx';
import './production-navigation.css';
import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import '@douyinfe/semi-ui-19/react19-adapter';
import Banner from '@douyinfe/semi-ui-19/lib/es/banner';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import Card from '@douyinfe/semi-ui-19/lib/es/card';
import Typography from '@douyinfe/semi-ui-19/lib/es/typography';
import Input from '@douyinfe/semi-ui-19/lib/es/input';
import TextArea from '@douyinfe/semi-ui-19/lib/es/input/textarea';
import LocaleProvider from '@douyinfe/semi-ui-19/lib/es/locale/localeProvider';
import zhCN from '@douyinfe/semi-ui-19/lib/es/locale/source/zh_CN';
import '@douyinfe/semi-ui-19/lib/es/_base/base.css';
import './style.css';
import './motion.css';
import {DataTable, ListToolbar} from './list-primitives.tsx';
import {CoverPanel } from './covers.tsx';
import {ContentList, createContentListUIState, type ContentListUIState} from './content-list.tsx';
import {createDirectoryUIState, type DirectoryUIState} from './jincheng-content-directory.tsx';
import {CollectionContents} from './collection-contents.tsx';
import {AssistantSettings} from './assistant-settings.tsx';
import {LibraryPanels, CollectionEditor, type LibraryPanelTab, ContentMetadataPanel, ContentMaterialPanel, hasManagedDrafts} from './library-panels.tsx';
import {MaintenancePanel} from './maintenance-panel.tsx';
import {PreferencesPanel} from './preferences-panel.tsx';
import {SetupPanel} from './setup-panel.tsx';
import {BootstrapRecoveryPanel} from './bootstrap-panel.tsx';
import {NavigationIcon} from './navigation-icon.tsx';
import type {WorkspaceLibraryCollection, WorkspaceLibrarySnapshot} from '../shared/workspace-contracts.ts';
import {invoke} from './client.ts';
import {CalendarPage, Overview, PromptsPage, TemplatesPage, pageNames} from './workspace-pages.tsx';
import {PublicationPanel, type PublicationFocus, type CalendarFocus} from './publication-panel.tsx';
import type {Page} from './workspace-pages.tsx';
import type {CoverResults, TemplateGroup} from '../shared/cover-contracts.ts';
import { errorInfo} from '../shared/contracts.ts';
import type {
    Content,
    DesktopResults,
    Status,
    Draft,
    PendingView,
    View
} from '../shared/contracts.ts';

function App() {
    const actionTail = useRef<Promise<void>>(Promise.resolve());
    function actionTurn() {
        const previous = actionTail.current;
        let release!: () => void;
        actionTail.current = new Promise<void>(resolve => {release = resolve;});
        return {previous, release};
    }
    const [page, setPage] = useState<Page>('overview');
    const [navGroups,setNavGroups]=useState({today:true,content:true,research:true});
    const [contentPhase,setContentPhase]=useState<'all'|'topics'|'doing'|'published'>('topics');
    const [coverView,setCoverView]=useState<'nova'|'original'>('nova');
    const [workspace, setWorkspace] = useState<DesktopResults['readWorkspace'] | null>(null);
    const [library, setLibrary] = useState<WorkspaceLibrarySnapshot | null>(null);
    const [workspaceUnavailable, setWorkspaceUnavailable] = useState(false);
    const [workspaceIssue, setWorkspaceIssue] = useState<WorkspaceReadIssue | null>(null);
    const workspaceReadHealthy = useRef(false);
    const [watchUnavailable, setWatchUnavailable] = useState(false);
    const changesPending = useRef(false);
    const automaticRefresh = useRef<() => void>(() => {});
    const backgroundRefresh = useRef<Promise<unknown> | null>(null);
    const [assets, setAssets] = useState<CoverResults['listCoverAssets'] | null>(null);
    const workspaceAssets = useRef<{epoch: number; value: CoverResults['listCoverAssets']} | null>(null);
    const [selectedTemplate, setSelectedTemplate] = useState<{id: string; key: number} | null>(null);
    const [templatePicker, setTemplatePicker] = useState<TemplateGroup | null>(null);
    const [templateContentQuery, setTemplateContentQuery] = useState(''), [templateContentPage, setTemplateContentPage] = useState(1), [templateContentPageSize, setTemplateContentPageSize] = useState(20);
    const templateContents = useMemo(() => {
        if (!templatePicker) return [];
        const query = templateContentQuery.trim().toLocaleLowerCase();
        return workspace?.contents.filter(item => !item.deletedAt && (!query || `${item.title} ${item.body}`.toLocaleLowerCase().includes(query))) ?? [];
    }, [workspace, templateContentQuery, templatePicker]);
    const currentTemplateContentPage = Math.min(templateContentPage, Math.max(1, Math.ceil(templateContents.length / templateContentPageSize)));
    useEffect(() => setTemplateContentPage(1), [templateContentQuery]);
    const [contentQuery, setContentQuery] = useState('');
    const templateDialog = useRef<HTMLDialogElement>(null);
    useEffect(() => { if (templatePicker) templateDialog.current?.showModal(); }, [templatePicker]);
    const [libraryEpoch, setLibraryEpoch] = useState(0);
    const [directoryStates, setDirectoryStates] = useState<Record<string, DirectoryUIState>>({});
    const [contentListStates, setContentListStates] = useState<Record<number, ContentListUIState>>({});
    const directoryKey = `${libraryEpoch}:${contentPhase}`;
    const epochRef = useRef(0);
    const workspaceReadRecovery = useRef<ReturnType<typeof createWorkspaceReadRecovery> | null>(null);
    if (!workspaceReadRecovery.current) workspaceReadRecovery.current = createWorkspaceReadRecovery({currentEpoch: () => epochRef.current, retry: () => {changesPending.current = true; automaticRefresh.current();}});
    useEffect(() => () => workspaceReadRecovery.current?.reset(), []);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const libraryDialog = useRef<HTMLDialogElement>(null);
    const recoveryDialog = useRef<HTMLDialogElement>(null);
    const [recoveryOpen, setRecoveryOpen] = useState(false);
    useEffect(() => {if (recoveryOpen) recoveryDialog.current?.showModal();}, [recoveryOpen]);
    const [libraryTab, setLibraryTab] = useState<'resources' | 'storage'>('resources');
    const [resourceTab, setResourceTab] = useState<LibraryPanelTab>('photos');
    const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
    const lastCollection = useRef<WorkspaceLibraryCollection | null>(null);
    const [collectionQuery, setCollectionQuery] = useState('');
    const [creatingCollection, setCreatingCollection] = useState(false);
    const [detailOpen, setDetailOpen] = useState(false);
    const [resumeOnOpen, setResumeOnOpen] = useState(false);
    const detailCloseGuard = useRef<(() => Promise<void>) | null>(null);
    const [contentTab, setContentTab] = useState<'covers' | 'body' | 'materials' | 'publication' | 'production'>('covers');
    const [coverStartOpenKey, setCoverStartOpenKey] = useState(0);
    useEffect(() => { if (libraryOpen) libraryDialog.current?.showModal(); }, [libraryOpen]);
    const [photoManagerEpoch, setPhotoManagerEpoch] = useState(0);
    const [promptContentId, setPromptContentId] = useState<string | null>(null);
    const [calendarFocus, setCalendarFocus] = useState<CalendarFocus | null>(null);
    const [settings, setSettings] = useState(false);
    const [coverRefresh, setCoverRefresh] = useState(0);
    const [status, setStatus] = useState<Status | null>(null);
    const [contents, setContents] = useState<Content[] | null>(null);
    const [failure, setFailure] = useState<{message: string; backgroundBusyEpoch?: number; managedDraftGuard?: true}>({message: ''});
    const error = failure.message;
    const setError = (message: string) => setFailure({message});
    const [acting, setActing] = useState(false);
    const active = useRef(false);
    const [view, setView] = useState<View>('active');
    const [base, setBase] = useState<Content | null>(null);
    const [sourceAccess,setSourceAccess]=useState<{key:string;editable:boolean;originalId?:string|null}|null>(null);
    const sourceKey=base?`${libraryEpoch}:${base.id}`:'';
    const sourceBlocked=!!base&&(sourceAccess?.key!==sourceKey||!sourceAccess.editable);
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
    const report = (failure: unknown, preserveError = false, epoch = epochRef.current) => {
        if (epoch !== epochRef.current) return;
        const value = errorInfo(failure), readBusy = value.code === 'BUSY' || value.code === 'VAULT_BUSY';
        setFailure(previous => preserveError && previous.message && (previous.backgroundBusyEpoch === undefined || readBusy) ? previous : {
            message: `${value.message}（${value.code}）`,
            ...(preserveError && readBusy ? {backgroundBusyEpoch: epoch} : {})
        });
    };
    const load = (item: Content) => {
        setResumeOnOpen(false);
        baseRef.current = item; draftRef.current = {title: item.title, body: item.body}; dirtyRef.current = false;
        setBase(item);
        setDraft(draftRef.current);
        setDisk(null);
    };
    function adoptRecommendedTitle(candidate: ContentTitleRecommendation): boolean {
        if (active.current || status?.busy || disk || sourceBlocked) return false;
        try {
            const next = adoptTitleRecommendation(baseRef.current, draftRef.current, candidate);
            draftRef.current = next;
            dirtyRef.current = true;
            setDraft(next);
            return true;
        } catch (failure) {report(failure); return false;}
    }
    const clearEditor = () => {
        workspaceReadRecovery.current?.reset(); workspaceReadHealthy.current = false; setWorkspaceIssue(null);
        epochRef.current += 1; setLibraryEpoch(epochRef.current); setBase(null); baseRef.current = null;
        setDirectoryStates({}); setContentListStates({}); setContentQuery(''); setResumeOnOpen(false); setView('active');
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
        workspaceAssets.current = null;
        setSelectedTemplate(null);
        setTemplatePicker(null);
        setPromptContentId(null);
        setCalendarFocus(null);
        setDetailOpen(false);
        setActiveCollectionId(null);
        lastCollection.current = null;
        setCollectionQuery('');
        setContentTab('covers');
    };
    useEffect(()=>{const refreshed=()=>{void refreshStatus().catch(failure=>report(failure));};window.addEventListener('nova-final-assets-status',refreshed);window.addEventListener('nova-author-planning-status',refreshed);return()=>{window.removeEventListener('nova-final-assets-status',refreshed);window.removeEventListener('nova-author-planning-status',refreshed);};},[]);
    const refreshStatus = async () => {
        const epoch = epochRef.current;
        const next = await invoke('status');
        if (epoch !== epochRef.current) return next;
        setStatus(next);
        setPending(next.pending);
        return next;
    };
    async function refreshWorkspace(confirmed?: WorkspaceLibrarySnapshot) {
        if (confirmed) {
            setLibrary(confirmed);
            setWorkspace(old => old ? {...old, contents: confirmed.contentDetails.map(item => ({...item, candidateCount: item.candidates.length, selectedCandidateId: old.contents.find(previous => previous.id === item.id)?.selectedCandidateId ?? null})), prompts: confirmed.prompts.filter(item => !item.deletedAt), channels: confirmed.settings.channels.map(item => ({id: item.id, name: item.name, enabled: !item.deletedAt}))} : old);
            setContents(old => old ? confirmed.contentDetails.filter(item => !!item.deletedAt === (view === 'trash')) : old);
            const current = baseRef.current, acknowledged = confirmed.contentDetails.find(item => item.id === current?.id);
            if (current && acknowledged && acknowledged !== library?.contentDetails.find(item => item.id === current.id) && acknowledged.editToken !== current.editToken) {
                if (dirtyRef.current && (acknowledged.title !== current.title || acknowledged.body !== current.body)) setDisk(acknowledged);
                else if (dirtyRef.current) {baseRef.current = acknowledged; setBase(acknowledged); setDisk(null);}
                else load(acknowledged);
            }
            if (JSON.stringify(library?.templates) !== JSON.stringify(confirmed.templates) || JSON.stringify(library?.photos) !== JSON.stringify(confirmed.photos)) {
                const next = await invoke('listCoverAssets'); setAssets(next); workspaceAssets.current = {epoch: epochRef.current, value: next};
            }
            return;
        }
        // Explicit panel refreshes must not keep a completed action's global busy lock.
        if (confirmed || active.current && !backgroundRefresh.current) {
            changesPending.current = true;
            return;
        }
        const epoch = epochRef.current;
        workspaceAssets.current = null; workspaceReadHealthy.current = false;
        let snapshot: DesktopResults['readWorkspace'], coverAssets: CoverResults['listCoverAssets'], detail: WorkspaceLibrarySnapshot;
        try { [snapshot, coverAssets, detail] = await Promise.all([invoke('readWorkspace'), invoke('listCoverAssets'), invoke('readWorkspaceLibrary')]); }
        catch (failure) {
            if (epoch !== epochRef.current) return;
            const issue = workspaceReadFailure(failure);
            if (issue.kind === 'busy') {
                const scheduled = workspaceReadRecovery.current!.schedule(epoch);
                setWorkspaceIssue(scheduled ? issue : {...issue, message: '知识库仍在使用，可以稍后重试。'});
                setWorkspaceUnavailable(false);
                return;
            }
            workspaceReadRecovery.current!.reset();
            setWorkspaceIssue(issue); setWorkspaceUnavailable(true); throw failure;
        }
        if (epoch !== epochRef.current) return;
        setWorkspace(snapshot); workspaceReadHealthy.current = true;
        workspaceReadRecovery.current!.reset(); setWorkspaceIssue(null);
        setWorkspaceUnavailable(false);
        setAssets(coverAssets);
        workspaceAssets.current = {epoch, value: coverAssets};
        setLibrary(detail);
    }
    useEffect(() => {
        const epoch = epochRef.current;
        void refreshStatus().then(async next => { if (next.currentName && !next.needsReselect) { const items = await invoke('listContents', {view: 'active'}); if (epochRef.current === epoch) { setContents(items); await refreshWorkspace(); } } }).catch(failure => {if (epochRef.current === epoch) report(failure);});
    }, []);

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
        if (!changesPending.current || active.current || localPending.current || backgroundRefresh.current || document.hidden || !status?.currentName || status.needsReselect || status.busy) return;
        changesPending.current = false;
        const epoch = epochRef.current;
        void backgroundAction(async () => {
            await refreshEditor();
            const items = await invoke('listContents', {view});
            if (epoch !== epochRef.current) return;
            setContents(items);
            setCoverRefresh(value => value + 1);
        });
    };
    useEffect(() => {
        const unsubscribe = window.contentHub.onWorkspaceChanged(change => {
            if (change === 'progress') return;
            if (change === 'source') window.dispatchEvent(new Event('nova-vault-source-changed'));
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
    useEffect(() => {if (!acting) automaticRefresh.current();}, [acting, status?.currentName, status?.needsReselect]);
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
        const closeDetail = detailCloseGuard.current;
        if (closeDetail) {
            try { await closeDetail(); } catch (error) { setError(errorInfo(error).message); return; }
        }
        if (hasManagedDrafts()) { setFailure({message: '还有未保存的填写内容，请回到暂时收起的编辑窗口，保存或明确关闭后再继续。', managedDraftGuard: true}); return; }
        if (dirty) setLeaving(() => action); else await action();
    }

    function backgroundAction<T>(action: () => Promise<T>, refreshWorkspaceAfter = true): Promise<T | undefined> {
        if (active.current) return Promise.resolve(undefined);
        const operation = nativeAction(action, {preserveError: true, background: true, refreshWorkspaceAfter});
        const complete = operation.finally(() => {
            if (backgroundRefresh.current !== complete) return;
            backgroundRefresh.current = null;
            automaticRefresh.current();
        });
        backgroundRefresh.current = complete;
        return complete;
    }
    async function readCoverAutomatically(contentId: string) {
        const epoch = epochRef.current;
        // Actions and change refreshes already read these assets before the panel can read its cover.
        return backgroundAction(async () => {
            if (epoch !== epochRef.current || baseRef.current?.id !== contentId) return;
            const assets = workspaceAssets.current?.epoch === epoch ? workspaceAssets.current.value : await invoke('listCoverAssets');
            const cover = await invoke('readCover', {contentId});
            if (epoch !== epochRef.current || baseRef.current?.id !== contentId) return;
            return {assets, cover};
        }, false);
    }

    async function nativeAction<T>(action: () => Promise<T>, {preserveError = false, background = false, refreshWorkspaceAfter = true, refreshWorkspaceOnSuccess = true, local = false}: {local?: boolean; preserveError?: boolean; background?: boolean; refreshWorkspaceAfter?: boolean; refreshWorkspaceOnSuccess?: boolean} = {}): Promise<T | undefined> {
        if (local) return localAction(action);
        if (!background && active.current) return;
        if (!background) { active.current = true; setActing(true); }
        if (!preserveError) setError('');
        const epoch = epochRef.current;
        let succeeded = false;
        const turn = actionTurn();
        // Accept the first click during a background read, then serialize its operation.
        try {
            await turn.previous;
            if (epoch !== epochRef.current) return;
            const result = await action();
            succeeded = true;
            return result;
        } catch (failure) {
            report(failure, preserveError, epoch);
            return undefined;
        } finally {
            try {
                const next = await refreshStatus();
                if (epoch === epochRef.current && next.currentName && !next.needsReselect && refreshWorkspaceAfter) {
                    try {
                        if (!background && succeeded) {
                            if (refreshWorkspaceOnSuccess) changesPending.current = true;
                        } else if (!succeeded || refreshWorkspaceOnSuccess) await refreshWorkspace();
                        if (succeeded && epoch === epochRef.current && workspaceReadHealthy.current) setFailure(previous => previous.backgroundBusyEpoch === epoch ? {message: ''} : previous);
                    } catch (failure) { report(failure, preserveError, epoch); }
                }
            } catch (failure) {
                if (!preserveError) setStatus(null);
                report(failure, preserveError, epoch);
            }
            turn.release();
            if (!background) { active.current = false; setActing(false); automaticRefresh.current(); }
        }
    }

    const localPending = useRef(0);
    async function localAction<T>(action: () => Promise<T>): Promise<T | undefined> {
        const epoch = epochRef.current, turn = actionTurn();
        localPending.current += 1;
        try {
            await turn.previous;
            if (epoch !== epochRef.current) return;
            setError('');
            try { return await action(); }
            catch (failure) { report(failure, false, epoch); return undefined; }
            finally { try { await refreshStatus(); } catch (failure) { report(failure, false, epoch); } }
        } finally {turn.release(); localPending.current -= 1; automaticRefresh.current();}
    }

    function retainDraftAsNew() {
        setBase(null);
        setDisk(null);
    }

    const untitledName=useRef('未定标题内容');
    async function save(): Promise<boolean> {
        if (!draft || disk) return false;
        if(sourceBlocked){setError('当前稿件来源尚不可编辑，请先核对来源或建立可编辑工作稿；本次填写仍保留。');return false;}
        const originalDraft={...draft};
        const submitted = {...draft,title:draft.title.trim()?draft.title:base?.title||untitledName.current};
        const result = await nativeAction(async () => {
            const item = base ? await invoke('updateContent', {
                id: base.id,
                editToken: base.editToken, ...submitted
            }) : await invoke('createContent', submitted);
            // A later writer may have changed the object after commit; keep the submitted draft.
            const unchangedDraft = draftRef.current?.title === originalDraft.title && draftRef.current?.body === originalDraft.body;
            if (item.title === submitted.title && item.body === submitted.body) {
                if (unchangedDraft) load(item); else {
                    setBase(item);
                    setDisk(null);
                }
            } else {
                setDisk(item);
                setBase(item);
            }
            savedContent.current = item;
            try { setContents(await invoke('listContents', {view})); }
            catch (failure) { setError(`内容已保存，列表刷新未完成，请点击刷新重试。${errorInfo(failure).message}`); }
            setCoverRefresh(n => n + 1);
            return draftRef.current?.title === submitted.title && draftRef.current?.body === submitted.body && item.title === submitted.title && item.body === submitted.body;
        });
        return result === true && draftRef.current?.title === submitted.title && draftRef.current?.body === submitted.body;
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

    async function select(item: Content, template?: string, generate = false, collectionId: string | null = null) {
        if (template) closeTemplatePicker();
        await guard(async () => {
            const epoch = epochRef.current;
            await nativeAction(async () => { const current = await invoke('readContent', {id: item.id}); if (epoch === epochRef.current) { load(current); setActiveCollectionId(collectionId); setPage('content'); setDetailOpen(true); setContentTab('covers'); setCoverStartOpenKey(value => generate ? value + 1 : 0); setSelectedTemplate(template ? {id: template, key: Date.now()} : null); if (template) setCoverStartOpenKey(value => value + 1); setTemplatePicker(null); } });
        });
    }

    async function restoreCollection(item: WorkspaceLibraryCollection) {
        if (busy || blocked) return;
        await guard(async () => {
            await localAction(async () => {const saved = await invoke('mutateWorkspace', {op: 'restoreCollection', id: item.id, editToken: item.editToken}); await refreshWorkspace(saved.library);});
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

    async function act(method: 'createLibrary' | 'openLibrary') {
        await nativeAction(async () => {
            clearEditor();
            await invoke(method);
            const next = await refreshStatus();
            if (next.needsReselect || !next.currentName) return;
            setContents(await invoke('listContents', {view:'active'}));
            setLibraryOpen(false);
        });
    }

    useLayoutEffect(() => { window.scrollTo(0, 0); }, [page]);
    useEffect(() => {
        const group = ['overview','calendar','tasks'].includes(page) ? 'today' : ['content','templates'].includes(page) ? 'content' : ['accounts','reports','radar'].includes(page) ? 'research' : null;
        if (group) setNavGroups(current => ({...current,[group]:true}));
        const timer = window.setTimeout(() => document.getElementById(`nav-${page}`)?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'}),230);
        return () => window.clearTimeout(timer);
    }, [page]);

    async function navigate(next: Page) {
        await guard(async () => { setPromptContentId(null); setPage(next); setActiveCollectionId(null); setCalendarFocus(null); setCoverStartOpenKey(0); if (next === 'content') setDetailOpen(false); setFailure(previous => previous.managedDraftGuard ? {message: ''} : previous); });
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
    async function openPromptContentBody(contentId: string) {
        await guard(async () => {
            const epoch = epochRef.current;
            await nativeAction(async () => {
                const current = await invoke('readContent', {id: contentId});
                if (epoch !== epochRef.current) return;
                if (current.id !== contentId || current.deletedAt) {
                    setError('关联内容已移入回收站或不再可用，请重新选择可用内容。');
                    return;
                }
                load(current);
                setPromptContentId(current.id);
                setPage('content');
                setDetailOpen(true);
                setContentTab('body');
                setCoverStartOpenKey(0);
            });
        });
    }
    async function openCollection(id: string) {
        await guard(async () => {
            setSettings(false); setLibraryOpen(false); setBase(null); setDraft(null); setDisk(null);
            setActiveCollectionId(id); setCollectionQuery(''); setDetailOpen(false); setPage('content'); setCoverStartOpenKey(0);
        });
    }
    async function openLibraryResources(tab: LibraryPanelTab = 'photos') {
        await guard(async () => {
            setSettings(false);
            setResourceTab(tab);
            setLibraryTab('resources');
            setPhotoManagerEpoch(value => value + 1);
            setLibraryOpen(true);
            requestAnimationFrame(() => document.getElementById('library-panels')?.scrollIntoView({block: 'start'}));
        });
    }
    function closeTemplatePicker() {
        templateDialog.current?.close();
        setTemplatePicker(null);
    }
    function useTemplate(template: TemplateGroup) {
        setTemplateContentQuery(''); setTemplateContentPage(1);
        setTemplatePicker(template);
    }
    async function changeContentTab(next: typeof contentTab) {
        if (next === contentTab) return;
        if (contentTab === 'covers' && next === 'body') {setContentTab(next); return;}
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
    async function openCalendarFocus(focus?: CalendarFocus) {
        await guard(async () => {setCalendarFocus(focus ?? null); setCoverStartOpenKey(0); setPage('calendar');});
    }
    async function newContent(template?: string) {
        if (template) closeTemplatePicker();
        await guard(async () => {
            untitledName.current=`未定标题 · ${new Date().toLocaleString('zh-CN',{hour12:false})}`;
            setBase(null); setDraft({title: '', body: ''}); setDisk(null); setSelectedTemplate(template ? {id: template, key: Date.now()} : null);
            setActiveCollectionId(null);
            setContentTab('body'); setCoverStartOpenKey(0); setDetailOpen(true); setPage('content');
        });
    }
    async function recommendTopics(){
        if(disk)return;
        if(dirtyRef.current&&!await save())return;
        const current=baseRef.current;
        if(!current){setError('请先保存资料或想法，再推荐选题。');return;}
        const result=await nativeAction(()=>invoke('startProductionTask',{kind:'research',workflow:'topic-suggestion',businessSkill:'xindao-xuanti',title:'推荐选题',prompt:'读取这篇内容已保存的资料、想法和当前个人定位，使用新岛选题方法推荐可选方向。先交回候选供我选择，选题名称不是最终标题，不覆盖已保存正文和标题。',contentId:current.id,accountId:null,mode:'simple',comments:false}));
        if(result)setPage('tasks');
    }
    async function backToContents() {
        await guard(async () => { setBase(null); setDraft(null); setDisk(null); setCoverStartOpenKey(0); setDetailOpen(false); });
    }
    function openRecovery() {
        if (hasManagedDrafts()) {setRecoveryOpen(true); return;}
        setLibraryTab('storage');
        setLibraryOpen(true);
    }
    async function recoverVault(action:'retry'|'discard'){await nativeAction(async()=>{const recovered=await invoke('recoverVaultMutation',{action});if(recovered)announceVaultRecovery(window,recovered);window.dispatchEvent(new Event('nova-workspace-refresh'));});}
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
    const currentCollection = library?.collections.find(item => item.id === activeCollectionId);
    const activeCollection = currentCollection ?? (lastCollection.current?.id === activeCollectionId ? lastCollection.current : null);
    const collectionUnavailable = !!activeCollection && (!currentCollection || !!currentCollection.deletedAt);
    useEffect(() => {lastCollection.current = currentCollection ?? (lastCollection.current?.id === activeCollectionId ? lastCollection.current : null);}, [currentCollection, activeCollectionId]);
    const busy = acting || !status || status.busy;
    const mutationBlocked = !!status?.productionPending || !!status?.pending || status?.creating|| !!status?.photoPending || !!status?.coverPending || !!status?.coverActionPending || !!status?.vaultPending || !!status?.workspacePending || !!status?.templatePending || !!status?.maintenance.pending || !!status?.seedPending;
    const blocked = mutationBlocked;
    const currentContentSummary = workspace?.contents.find(item => item.id === base?.id);
    const currentContentDetails = library?.contentDetails.find(item => item.id === base?.id);
    const hasPublishedRecord = !!currentContentDetails?.publications.some(item => !currentContentDetails.publicationEvents.some(event => event.targetId === item.id));
    const contentStage = base?.deletedAt ? '回收站' : !base ? '新内容' : hasPublishedRecord ? '已有发布记录' : currentContentSummary?.selectedCandidateId ? '已选封面' : currentContentSummary?.candidateCount ? '待选封面' : '待做封面';
    const workspaceReady = !!workspace && !!library && !!assets && (page !== 'content' || !!contents);
    const showPage = !status?.needsReselect && (workspaceReady || page==='vault'&&!!status?.currentName || page === 'content' && detailOpen && !!draft);
    const initialReadFailed = !showPage && !!error;
    const recoveryCards = <>
        {status?.vaultPending&&<Card title="资料修改需要核验"><p>上次修改与填写已保留。先核验结果，再继续编辑。</p><div className="actions"><Button disabled={busy} onClick={()=>void recoverVault('retry')}>核验上次修改</Button><Button disabled={busy} onClick={()=>void recoverVault('discard')}>确认未提交后放弃修改</Button></div></Card>}
        {status?.workspacePending && <Card title="上次修改需要核验"><p>原操作与输入已保留，确认前不会开始新的写入。</p><p>状态：{status.workspacePending.state === 'conflict' ? '对象已改变，请保留输入后重新编辑' : status.workspacePending.state === 'missing' ? '尚未找到提交记录' : '结果待核验'}</p><details><summary>查看已保留的输入</summary><pre>{JSON.stringify(status.workspacePending.input, null, 2)}</pre></details><div className="actions"><Button disabled={busy} onClick={() => void nativeAction(async () => { await invoke('recoverWorkspaceMutation'); await refreshEditor(); })}>核验上次修改</Button>{status.workspacePending.state === 'missing' && <Button disabled={busy} onClick={() => void nativeAction(async () => { await invoke('retryWorkspaceMutation'); await refreshEditor(); })}>重试同一操作</Button>}{['missing', 'conflict'].includes(status.workspacePending.state) && <Button disabled={busy} onClick={() => void nativeAction(() => invoke('abandonWorkspaceMutation'))}>放弃原修改并保留文件</Button>}</div></Card>}
        {status?.templatePending && <Card title="模板操作需要核验"><p>学习、还原或验收的原操作已保留。核验前不会开始新的写入。</p><p>状态：{status.templatePending.state === 'conflict' ? '原模板已改变' : status.templatePending.state === 'missing' ? '尚未找到提交记录' : '结果待核验'}</p><div className="actions"><Button disabled={busy} onClick={() => void nativeAction(async () => { await invoke('recoverTemplateMutation'); await refreshWorkspace(); })}>核验模板操作</Button>{status.templatePending.state === 'missing' && <Button disabled={busy} onClick={() => void nativeAction(async () => { await invoke('retryTemplateMutation'); await refreshWorkspace(); })}>重试同一操作</Button>}{['missing', 'conflict'].includes(status.templatePending.state) && <Button disabled={busy} onClick={() => void nativeAction(() => invoke('abandonTemplateMutation'))}>放弃原操作并保留文件</Button>}</div></Card>}
        {status?.photoPending && <Card title="继续导入照片"><p>原文件选择与本人照片声明已保留；空内容库也可以继续处理。</p><div className="actions"><Button id="global-resume-photo" disabled={busy} onClick={() => void recoverCoverOperation('resumePhoto')}>核验并继续导入</Button><Button id="global-abandon-photo" disabled={busy} onClick={() => void recoverCoverOperation('abandonPhoto')}>放弃这次导入意图</Button></div></Card>}
        {status?.coverPending && <Card title="继续准备封面"><p>原请求已保留，继续同一次操作；已提交任务仍留在原内容中。</p><div className="actions"><Button id="global-resume-cover" disabled={busy} onClick={() => void recoverCoverOperation('resumeCover')}>核验并交给助手</Button><Button id="global-abandon-cover" disabled={busy} onClick={() => void recoverCoverOperation('abandonCover')}>放弃这次准备意图</Button></div></Card>}
        {status?.coverActionPending && <Card title="核验封面操作"><p>上次选用或取消的原操作已保留。</p><div className="actions"><Button id="global-resume-cover-action" disabled={busy} onClick={() => void recoverCoverOperation('resumeCoverAction')}>核验并继续原操作</Button><Button id="global-abandon-cover-action" disabled={busy} onClick={() => void recoverCoverOperation('abandonCoverAction')}>放弃这次操作意图</Button></div></Card>}
        {status?.seedPending && <Card title="继续准备内置模板"><p>上次内置模板准备尚未完成。</p><Button id="global-retry-builtins" disabled={busy} onClick={() => void recoverCoverOperation('retryBuiltins')}>继续准备内置模板</Button></Card>}
    </>;
    const openProductionContent=(id:string,resume=false)=>{void guard(async()=>{await nativeAction(async()=>{const current=await invoke('readContent',{id});load(current);setResumeOnOpen(resume);setPage('content');setDetailOpen(true);setContentTab('production');setActiveCollectionId(null);});});};
    const navButton=(key:Page,label?:string)=><Button theme="borderless" key={key} id={`nav-${key}`} aria-current={page===key?'page':undefined} className={page===key?'nav-item active':'nav-item'} disabled={busy} onClick={()=>void navigate(key)}><NavigationIcon name={key}/>{label??pageNames[key]}</Button>;
    function toggleNavigationGroup(group: keyof typeof navGroups) {
        const region = document.getElementById(`nav-${group}-pages`);
        if (navGroups[group] && region?.contains(document.activeElement)) document.getElementById(`nav-group-${group}`)?.focus();
        setNavGroups(current => ({...current, [group]: !current[group]}));
    }
    async function changeContentPhase(next: typeof contentPhase) {
        await guard(async () => {
            if (next === 'all' || view === 'active') {setContentPhase(next); return;}
            // Stage directories always describe active contents. Read before
            // switching so a failed read keeps the recycle-bin scope intact.
            await nativeAction(async () => {
                const epoch = epochRef.current;
                const current = await invoke('listContents', {view:'active'});
                if (epoch !== epochRef.current) return;
                setView('active'); setContents(current); setContentPhase(next);
            });
        });
    }
    const contentProjectTabs=<div className="workspace-view-tabs" role="group" aria-label="内容创作阶段">{([['topics','选题'],['doing','在做'],['published','已发布'],['all','全部与合集']] as const).map(([value,label])=><Button key={value} id={`content-phase-${value}`} theme={contentPhase===value?'solid':'borderless'} aria-pressed={contentPhase===value} disabled={busy} onClick={()=>void changeContentPhase(value)}>{label}</Button>)}</div>;
    const contentProjectListing=contentPhase==='all'? <ContentList key={`${libraryEpoch}:all`} uiState={contentListStates[libraryEpoch] ?? createContentListUIState()} onUIStateChange={patch => setContentListStates(previous => ({...previous,[libraryEpoch]:{...(previous[libraryEpoch] ?? createContentListUIState()),...patch}}))} stageTabs={contentProjectTabs} contents={contents} workspace={workspace} library={library} query={contentQuery} setQuery={setContentQuery} view={view} busy={busy} blocked={!!blocked} ready={!!status?.currentName} changeView={next => void guard(async () => { await nativeAction(async () => {setView(next); setContents(await invoke('listContents', {view: next}));}); })} create={() => void newContent()} createCollection={() => void guard(async () => {setCreatingCollection(true);})} openCollection={id => void openCollection(id)} restoreCollection={item => void restoreCollection(item)} open={(item,generate)=>generate?void select(item,undefined,true):openProductionContent(item.id)} recycle={item => void recycle(item)}/> : <section className="content-library-page creator-content-library" aria-label="内容项目"><div className="content-list-heading"><div><h2>内容项目</h2></div><Button theme="solid" disabled={busy||!!blocked} onClick={()=>void newContent()}>＋ 新建内容</Button></div>{contentProjectTabs}<ProductionContentDirectory key={directoryKey} uiState={directoryStates[directoryKey] ?? createDirectoryUIState()} onUIStateChange={patch => setDirectoryStates(previous => ({...previous,[directoryKey]:{...(previous[directoryKey] ?? createDirectoryUIState()),...patch}}))} resumeContent={id => openProductionContent(id,true)} embedded mode={contentPhase} contents={contents??[]} library={library} busy={busy||!!blocked} openContent={openProductionContent}/></section>;
    return <main data-app="ready" data-loaded={status ? 'true' : 'false'} data-busy={acting ? 'true' : 'false'}>
        <aside className="app-navigation" aria-label="主导航"><div className="brand"><span className="brand-mark" role="img" aria-label="自媒体工作台图标"/><div><strong>自媒体工作台</strong></div></div><div className="nav-label">工作空间</div><nav aria-label="工作功能">{([['today','今天','overview',['overview','calendar','tasks']],['content','内容','content',['content','templates']],['research','市场调研','research',['accounts','reports','radar']]] as const).map(([group,label,icon,pages])=><section className="nav-group" key={group}><Button theme="borderless" className="nav-item nav-group-toggle" id={`nav-group-${group}`} aria-expanded={navGroups[group]} aria-controls={`nav-${group}-pages`} onClick={()=>toggleNavigationGroup(group)}><NavigationIcon name={icon}/><span className="nav-group-label">{label}</span><span className="nav-group-chevron" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 4l4 4-4 4"/></svg></span></Button><div id={`nav-${group}-pages`} className="motion-collapse nav-children-region" data-expanded={String(navGroups[group])} aria-hidden={!navGroups[group]} inert={!navGroups[group]}><div className="motion-collapse-clip"><div className="nav-children">{pages.map(key=>navButton(key,key==='templates'?'封面':undefined))}</div></div></div></section>)}{navButton('vault')}{navButton('prompts')}</nav><div className="nav-bottom"><Button theme="borderless" id="library-menu" className="nav-item" onClick={() => void guard(async () => {setLibraryTab('resources'); setLibraryOpen(true);})}><NavigationIcon name="library"/>内容库</Button><Button theme="borderless" id="open-settings" className="nav-item" disabled={acting || !!status?.busy} onClick={() => { if (hasManagedDrafts()) setError('请先保存或明确关闭当前编辑，再打开设置。'); else setSettings(true); }}><NavigationIcon name="settings"/>设置</Button><div className="nav-library"><span className="library-dot"/><span id="library-summary">{status?.currentName || (status ? '尚未打开内容库' : error ? '内容库读取失败' : '正在读取内容库…')}</span></div><p className="nav-footnote">资料保存在你的本机</p></div></aside>
        <div className="app-stage"><header className="app-header"><div><p className="breadcrumb">工作空间 / {pageNames[page]}</p><Typography.Title heading={1} className="visually-hidden">{page === 'content' && detailOpen ? '内容详情' : pageNames[page]}</Typography.Title></div><div className="header-actions"><span className="save-indicator" role="status">{acting ? '正在处理本机资料，请稍候…' : dirty ? '有未保存草稿' : '本机保存'}</span><Button id="refresh-workspace" disabled={busy || !status?.currentName} onClick={() => void nativeAction(async () => { await refreshEditor(); setCoverRefresh(n => n + 1); if (status?.currentName) setContents(await invoke('listContents', {view})); window.dispatchEvent(new Event('nova-workspace-refresh')); })}>刷新</Button></div></header>
        {blocked && <div className="recovery-notice"><Banner type="warning" closeIcon={null} description="有一项操作等待确认，已保留原输入。"/><Button onClick={()=>status?.productionPending?void navigate('tasks'):openRecovery()}>继续处理</Button></div>}
        {!status && !!error && !settings && <BootstrapRecoveryPanel busy={acting} run={nativeAction} onRecovered={async () => { clearEditor(); setLibraryTab('storage'); setLibraryOpen(true); await refreshStatus(); }}/>}
        {status && !status.currentName && <section className="welcome-library"><span className="welcome-brand brand-mark" aria-hidden="true"/><div><h2>让内容创作，从这里开始</h2><p>新建知识库，或直接打开已有第二大脑与内容库。</p></div><div className="actions"><Button id="welcome-create-library" theme="solid" disabled={busy || blocked} onClick={() => void guard(() => act('createLibrary'))}>新建知识库</Button><Button id="welcome-open-library" disabled={busy || blocked} onClick={() => void guard(() => act('openLibrary'))}>打开知识库</Button></div></section>}
        {libraryOpen && <dialog ref={libraryDialog} className="library-manager-dialog" aria-labelledby="library-manager-title" onCancel={event => {event.preventDefault(); closeLibrary();}}><div className="dialog-heading"><div><h2 id="library-manager-title">内容库管理</h2><p>{status?.currentName || '打开或新建你的本机内容库'}</p></div><div className="actions">{blocked && <Button onClick={openRecovery}>继续处理</Button>}<Button disabled={acting} onClick={closeLibrary}>关闭</Button></div></div><div className="manager-tabs"><Button theme={libraryTab === 'resources' ? 'solid' : 'borderless'} onClick={() => {if (hasManagedDrafts()) setError('请先保存或放弃当前填写，再切换管理页。'); else setLibraryTab('resources');}}>资料与默认值</Button><Button theme={libraryTab === 'storage' ? 'solid' : 'borderless'} onClick={() => {if (hasManagedDrafts()) setError('请先保存或放弃当前填写，再切换管理页。'); else setLibraryTab('storage');}}>备份与维护</Button></div><p className="manager-error" role="alert">{error}</p>
        {libraryTab === 'storage' && <section className="library-manager" aria-label="备份与维护">
        <Card title="当前内容库"><p
            id="current-library">{status?.currentName || '尚未打开内容库'}{status?.needsReselect ? ' · 请重新选择内容库以确认文件访问' : ''}</p>
            <div className="actions"><Button id="create-library" disabled={busy || blocked}
                                             onClick={() => void guard(() => act('createLibrary'))}>新建知识库</Button><Button
                id="open-library" disabled={busy || blocked && !status?.needsReselect}
                onClick={() => void guard(() => act('openLibrary'))}>打开知识库</Button><Button disabled={busy || !status?.currentName} onClick={() => void nativeAction(() => invoke('revealLibraryFolder'))}>在文件管理器中查看</Button></div>
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
        </section>}
        {libraryTab === 'resources' && (status?.currentName ? <section id="library-panels" aria-label="内容库资料管理"><LibraryPanels key={`${libraryEpoch}:${photoManagerEpoch}`} initialTab={resourceTab} openCollection={id => void openCollection(id)} library={library} assets={assets} busy={busy || !!blocked || dirty} run={localAction} refresh={async (snapshot?: WorkspaceLibrarySnapshot) => { await refreshWorkspace(snapshot); if (!snapshot) await refreshEditor(); }} choosePhoto={async () => { await nativeAction(async () => { await invoke('choosePhoto', {title: '我的照片', isOwnPhoto: false}); }); }}/></section> : <div className="blank-state"><p>先打开内容库，再管理照片、渠道和默认值。</p><Button onClick={() => setLibraryTab('storage')}>打开知识库</Button></div>)}</dialog>}
        <p id="error" role="alert">{error}</p>
        {workspaceIssue && workspace && <div className="workspace-read-status actions" role="status">{workspaceIssue.kind === 'busy' ? <span>{workspaceIssue.message}</span> : <Banner type="warning" closeIcon={null} description={workspaceIssue.message}/>}<Button size="small" disabled={busy} onClick={() => {workspaceReadRecovery.current?.reset(); changesPending.current = true; automaticRefresh.current();}}>重新读取</Button></div>}
        {watchUnavailable && !workspaceUnavailable && <Banner type="warning" closeIcon={null} description="内容库目录或自动刷新监听暂时不可用。原文件和草稿保留；可在内容库入口检查目录，或手动刷新。工作台只会重新连接原目录身份。"/>}
        {status?.needsReselect && <section className="creator-panel creator-empty" aria-live="polite" data-workspace-state="selection-required"><h2>请重新选择内容库以确认文件访问</h2><p>{blocked ? '待处理操作已保留，请重新选择原内容库继续。' : '原内容库已保留，请选择要使用的内容库。'}</p><div className="actions"><Button id="confirm-library-access" disabled={busy} onClick={() => void guard(() => act('openLibrary'))}>重新选择内容库</Button></div></section>}
        {!showPage && !status?.needsReselect && (!status || status.currentName) && <section className="creator-panel creator-empty" aria-busy={!initialReadFailed} aria-live="polite" data-workspace-state={initialReadFailed ? 'failed' : 'loading'}><h2>{initialReadFailed ? '暂时无法读取内容库' : '正在打开你的内容库…'}</h2><p>{initialReadFailed ? '读取尚未完成，可以重试，或打开已有的恢复副本。原内容库会保留。' : '正在读取本机内容、模板与发布安排，请稍候。'}</p>{initialReadFailed && <div className="actions"><Button id="retry-workspace" disabled={acting} onClick={() => void nativeAction(async () => {const next = await refreshStatus(); if (next.currentName) setContents(await invoke('listContents', {view}));})}>重新读取</Button><Button id="open-recovered-library" disabled={busy || !!blocked} onClick={() => void guard(() => act('openLibrary'))}>打开其他内容库</Button></div>}</section>}
        {showPage && <>
        {page==='vault'&&<VaultWorkspace key={libraryEpoch} statusChanged={async()=>{await refreshStatus();}} busy={busy||!!blocked} openContent={openProductionContent} showTasks={()=>void navigate('tasks')} openResources={()=>void openLibraryResources('profile')} openAccounts={()=>void navigate('accounts')} openReports={()=>void navigate('reports')}/>}
        {page === 'radar' && <RadarWorkspace key={libraryEpoch} busy={busy} openContent={openProductionContent} showTasks={()=>void navigate('tasks')} contentChanged={async()=>{await refreshWorkspace(await invoke('readWorkspaceLibrary'));}}/>}
        {(['accounts','reports','tasks'] as string[]).includes(page) && <ProductionWorkspace key={`${libraryEpoch}:${page}`} section={page as 'accounts'|'reports'|'tasks'} busy={busy} openContent={openProductionContent}/>}
        {page === 'overview' && <Overview openContents={() => void navigate('content')} createContent={() => void newContent()} openCalendar={focus => void openCalendarFocus(focus)} selectCover={item => void select(item)} generate={item => void select(item, undefined, true)} workspace={workspace} library={library} busy={busy} open={item => openProductionContent(item.id)} openCollection={focus => void openCollection(focus.id)}/>}
        {page==='templates'&&<section><div className="workspace-view-tabs" role="group" aria-label="封面与模板分类"><Button theme={coverView==='nova'?'solid':'borderless'} aria-pressed={coverView==='nova'} onClick={()=>void guard(async()=>setCoverView('nova'))}>Nova 模板与生成</Button><Button theme={coverView==='original'?'solid':'borderless'} aria-pressed={coverView==='original'} onClick={()=>void guard(async()=>setCoverView('original'))}>原封面 VI 与历史图片</Button></div>{coverView==='nova'?<TemplatesPage key={libraryEpoch} library={library} run={localAction} refresh={refreshWorkspace} assets={assets} busy={busy || !!blocked || dirty} useTemplate={template => void useTemplate(template)} managePhotos={() => void openLibraryResources('photos')}/>:<JinchengBoundWorkspace key={`${libraryEpoch}:vi`} kind="visual-assets" busy={busy||!!blocked}/>}</section>}
        {page === 'calendar' && <CalendarPage key={libraryEpoch} initialFocus={calendarFocus} library={library} run={localAction} refresh={async (snapshot?: WorkspaceLibrarySnapshot) => { await refreshWorkspace(snapshot); if (!snapshot) await refreshEditor(); }} workspace={workspace} busy={busy || !!blocked || dirty} open={item => void select(item)}/>}
        {page === 'prompts' && <section className="prompt-resources" aria-label="提示词"><JinchengSourceStatus roles={['prompts']} busy={busy}/><PromptsPage key={libraryEpoch} initialContentId={promptContentId} currentContentId={base && !base.deletedAt ? base.id : null} workspace={workspace} library={library} busy={busy || !!blocked || dirty} run={localAction} refresh={refreshWorkspace} openContentBody={openPromptContentBody} importPrompt={async () => await nativeAction(() => invoke('choosePromptDocument')) ?? null}/></section>}
        {page === 'content' && (!detailOpen || !draft ? activeCollection ? <CollectionContents key={`${libraryEpoch}:${activeCollection.id}`} collection={activeCollection} unavailable={collectionUnavailable} workspace={workspace} props={{library, busy: busy || !!blocked, run: localAction, refresh: refreshWorkspace}} query={collectionQuery} setQuery={setCollectionQuery} back={() => void guard(async () => {setActiveCollectionId(null);})} open={item => void select(item, undefined, false, activeCollection.id)}/> : contentProjectListing : <section className="content-detail-page" aria-label="内容详情"><Button theme="borderless" className="back-to-contents" disabled={busy} onClick={() => void backToContents()}>{activeCollection ? '← 返回合集' : '← 返回内容列表'}</Button><JinchengWorkDetail resumeOnOpen={resumeOnOpen} key={base?.id ?? 'new'} contentId={base && !base.deletedAt ? base.id : null} title={draft.title} stage={contentStage} busy={busy || !!blocked} dirty={dirty} activeTool={contentTab} chooseTool={next => void changeContentTab(next)} makeCover={() => void startCover()} showTasks={() => void navigate('tasks')} registerCloseGuard={value => {detailCloseGuard.current = value;}} sourceNotice={base&&!base.deletedAt&&<ContentSourceNotice key={sourceKey} contentId={base.id} busy={busy||!!blocked} dirty={dirty} run={nativeAction} access={editable=>setSourceAccess(previous=>({...previous,key:sourceKey,editable}))} original={originalId=>setSourceAccess(previous=>({...previous,key:sourceKey,editable:previous?.key===sourceKey?previous.editable:false,originalId}))} converted={async()=>{await nativeAction(async()=>{const next=await invoke('readContent',{id:base.id});if(baseRef.current?.id===next.id&&!dirtyRef.current)load(next);await refreshWorkspace();});}}/>}>
        <div className="content-detail-panel">
        {contentTab === 'production' && base && sourceAccess?.key!==sourceKey && <p role="status">正在确认本篇原稿入口…</p>}
        {contentTab === 'production' && base && sourceAccess?.key===sourceKey && !sourceAccess.originalId && <ContentProduction key={`${libraryEpoch}:${base.id}`} content={base} assistant={status?.assistant} busy={busy||!!blocked||dirty||sourceBlocked} onContent={next=>{if(next.id===baseRef.current?.id&&!dirtyRef.current){load(next);void refreshWorkspace();}}} makeCover={()=>void startCover()}/>}
        {contentTab === 'body' && <Card title="标题与正文"><p
            id="editor-dirty-state">{dirty ? '有未保存草稿' : '已保存'}{base?.deletedAt ? ' · 此内容在回收站' : ''}</p><label
            htmlFor="content-title">标题（可稍后填写）</label><Input id="content-title" className="semi-control-text" disabled={busy || !!blocked || sourceBlocked} maxLength={500}
                                                       value={draft.title} onChange={value => setDraft({
            ...draft,
            title: value
        })}/><ContentTitleRecommendations key={`${libraryEpoch}:${base?.id ?? 'new'}`} content={base} dirty={dirty} busy={busy || !!blocked || sourceBlocked} conflict={!!disk} run={nativeAction} adopt={adoptRecommendedTitle} showTasks={() => void navigate('tasks')}/><label htmlFor="content-body">正文</label><TextArea id="content-body" className="semi-control-text" disabled={busy || !!blocked || sourceBlocked}
                                                                 maxLength={1_000_000} value={draft.body}
                                                                 onChange={value => setDraft({
                                                                     ...draft,
                                                                     body: value
                                                                 })}/>
            <div className="actions"><Button id="save-content" theme="solid"
                                             disabled={busy || !dirty || blocked || sourceBlocked || !!disk || !!base?.deletedAt}
                                             onClick={() => void save()}>保存内容</Button><Button id="recommend-content-topics" disabled={busy||!!blocked||!!disk||!!base?.deletedAt} onClick={()=>void recommendTopics()}>{dirty?'保存想法并推荐选题':'推荐选题'}</Button><Button id="save-as-content"
                                                                                                  disabled={busy || blocked || !!disk}
                                                                                                  onClick={retainDraftAsNew}>准备另存为新内容</Button><Button id="open-content-prompts" disabled={busy || blocked || !base || !!base.deletedAt} onClick={() => void openContentPrompts()}>用提示词继续创作</Button>
            </div>
            {disk && <section id="conflict" role="alert"><h3>磁盘版本与本地草稿</h3><p>磁盘标题：{disk.title}</p>
                <pre id="disk-body">{disk.body}</pre>
                <p>本地草稿：{draft.title}</p>
                <pre id="local-body">{draft.body}</pre>
                <Button id="keep-draft" disabled={busy || !!blocked} onClick={retainDraftAsNew}>保留草稿并准备另存（需保存）</Button><Button id="discard-draft"
                                                                                                   disabled={!!status?.pending}
                                                                                                   onClick={() => load(disk)}>放弃修改并载入磁盘版本</Button>
            </section>}</Card>}
        {contentTab === 'materials' && <><ContentMaterialPanel key={`${libraryEpoch}:${base?.id ?? 'new'}`} contentId={base?.id ?? null} library={library} busy={busy || !!blocked || dirty} run={localAction} refresh={async (snapshot?: WorkspaceLibrarySnapshot) => { await refreshWorkspace(snapshot); if (!snapshot) await refreshEditor(); }}/>{base && !base.deletedAt && <ContentMetadataPanel key={`${libraryEpoch}:${base.id}`} contentId={base.id} library={library} busy={busy || !!blocked || dirty} run={localAction} refresh={async (snapshot?: WorkspaceLibrarySnapshot) => { await refreshWorkspace(snapshot); if (!snapshot) await refreshEditor(); }}/>}</>}
        {contentTab === 'publication' && <><div className="content-publication-entry"><p className="muted">这篇内容在各个渠道的计划和发布历史，都保存在这里。</p><Button theme="borderless" disabled={busy || !base || !!base.deletedAt} onClick={() => base && void openCalendarFocus({kind: 'content', id: base.id})}>在日程中查看 →</Button></div><PublicationPanel key={`${libraryEpoch}:${base?.id ?? 'new'}`} library={library} documentId={base?.id ?? null} busy={busy || !!blocked || dirty} run={localAction} refresh={async (snapshot?: WorkspaceLibrarySnapshot) => {await refreshWorkspace(snapshot); if (!snapshot) await refreshEditor();}}/></>}
        <div className="cover-detail-pane" hidden={contentTab !== 'covers'}>
        <CoverPanel flush={async()=>{const guard=detailCloseGuard.current;if(guard)await guard();}} titleEditor={{value: draft.title, change: value => setDraft({...draft, title: value}), save: () => void save(), saveDisabled: busy || !dirty || !!blocked || !!disk || !!base?.deletedAt, issue: disk ? '内容已在其他位置改变；本地标题草稿已保留，请进入正文处理冲突。' : error || undefined}} arrangePublication={() => void changeContentTab('publication')} readAutomatically={readCoverAutomatically} startOpenKey={coverStartOpenKey} library={library} refresh={async () => { await refreshWorkspace(); await refreshEditor(); }} selectedTemplate={selectedTemplate} key={`${libraryEpoch}:${base?.id ?? 'none'}`} status={status} content={base} dirty={dirty} busy={busy} blocked={!!blocked} refreshToken={coverRefresh} run={nativeAction} runLocal={localAction} acknowledge={(next, document) => {
            if (document) setLibrary(old => old ? {...old, contentDetails: old.contentDetails.map(item => item.id === document.id ? document : item)} : old);
            setWorkspace(old => old ? {...old, contents: old.contents.map(item => item.id === next.content.id ? {...item, ...next.content, candidateCount: next.candidates.length, selectedCandidateId: next.selectedCandidateId} : item)} : old);
            setContents(old => old?.map(item => item.id === next.content.id ? {...item, ...next.content} : item) ?? old);
        }} onContent={item => { if (item.id !== baseRef.current?.id) return; if (dirtyRef.current && item.editToken !== baseRef.current.editToken) setDisk(item); else if (!dirtyRef.current) load(item); }} />
        </div>
        </div></JinchengWorkDetail></section>)}
        </>}
        {recoveryOpen && <dialog ref={recoveryDialog} className="library-manager-dialog" aria-labelledby="retained-recovery-title" onCancel={event => {event.preventDefault(); setRecoveryOpen(false);}}><div className="dialog-heading"><div><h2 id="retained-recovery-title">继续处理待确认操作</h2><p>原编辑窗口与填写内容保持打开。处理后关闭此窗口，返回继续编辑。</p></div><Button disabled={acting} onClick={() => setRecoveryOpen(false)}>返回编辑</Button></div><p className="manager-error" role="alert">{error}</p><section className="library-manager" aria-label="待确认操作">{recoveryCards}{!blocked && <p role="status">待确认操作已处理，可以返回原编辑窗口。</p>}</section></dialog>}
        {templatePicker && <dialog ref={templateDialog} className="template-content-dialog" onCancel={closeTemplatePicker} aria-labelledby="template-content-title"><div className="dialog-heading"><div><h2 id="template-content-title">为哪篇内容使用模板？</h2><p>{templatePicker.name} · 选择已有内容，或新建并保存后制作封面。</p></div><Button onClick={closeTemplatePicker}>关闭</Button></div><div className="actions"><Button theme="solid" disabled={busy || blocked} onClick={() => void newContent(templatePicker.id)}>用此模板新建内容</Button></div><ListToolbar search={{label: '搜索使用模板的内容', placeholder: '搜索内容标题或正文', value: templateContentQuery, change: setTemplateContentQuery, disabled: busy}}/><DataTable className="template-content-list" rows={templateContents.slice((currentTemplateContentPage - 1) * templateContentPageSize, currentTemplateContentPage * templateContentPageSize)} total={templateContents.length} page={currentTemplateContentPage} pageSize={templateContentPageSize} onPageSizeChange={setTemplateContentPageSize} onPageChange={setTemplateContentPage} disabled={busy || !!blocked} label="模板使用内容分页" rowKey="id" onRow={item => ({'data-template-content-id': item?.id})} columns={[
            {title: '内容', key: 'title', width: '30%', render: (_, item) => <strong>{item.title}{item.id === base?.id ? ' · 当前打开的内容' : ''}</strong>},
            {title: '正文预览', key: 'body', width: '45%', render: (_, item) => <p className="template-content-preview">{item.body.slice(0, 90) || '正文待补充'}</p>},
            {title: '操作', key: 'actions', width: 120, render: (_, item) => <Button theme="solid" disabled={busy || !!blocked} onClick={() => void select(item, templatePicker.id)}>使用此内容</Button>}
        ]} empty={workspace?.contents.some(item => !item.deletedAt) ? '没有匹配的内容，请调整关键词。' : '还没有活动内容，可以用此模板新建内容。'}/></dialog>}
        {creatingCollection && <CollectionEditor collection={null} props={{library, busy: busy || !!blocked, run: localAction, refresh: refreshWorkspace}} close={() => setCreatingCollection(false)}/>}
        {settings && <AssistantSettings status={status} busy={acting || !!status?.busy} blocked={!!blocked} run={nativeAction} close={() => setSettings(false)} library={library} assets={assets} refresh={refreshWorkspace} managePhotos={() => void openLibraryResources('photos')} manageChannels={() => void openLibraryResources('channels')} manageLibrary={() => void guard(async () => {setSettings(false); setLibraryTab('storage'); setLibraryOpen(true);})} services={active=><ServiceSettings active={active} value={null} busy={acting||!!status?.busy} onLoad={()=>invoke('readServiceSettings')} onSave={patch=>invoke('saveServiceSettings',patch)} onReveal={service=>invoke('revealServiceCredential',{service})} onCheck={()=>invoke('checkServiceReadiness')}/>} preferences={<PreferencesPanel busy={acting || !!status?.busy} run={nativeAction}/>} setup={<SetupPanel host={status?.assistant} busy={acting || !!status?.busy} run={nativeAction}/>} recovery={<BootstrapRecoveryPanel busy={acting || !!status?.busy} run={nativeAction} onRecovered={async () => { clearEditor(); setLibraryOpen(true); await refreshStatus(); }}/>} /> }
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
createRoot(root).render(<LocaleProvider locale={zhCN}><App/></LocaleProvider>);
