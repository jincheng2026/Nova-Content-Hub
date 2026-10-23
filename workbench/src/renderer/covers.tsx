import {isSelectableTemplate} from '../shared/template-availability.ts';
import {assistantLaunchNotice, taskProgressLabel, taskStatusChanged, mergeTaskProgress} from '../shared/task-progress.ts';
import {useTaskProgress, TaskProgressDetails} from './task-progress.tsx';
import {DataTable, ListToolbar, List, ImageList} from './list-primitives.tsx';
import {FileDropzone} from './file-dropzone.tsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import TextArea from '@douyinfe/semi-ui-19/lib/es/input/textarea';
import Checkbox from '@douyinfe/semi-ui-19/lib/es/checkbox';
import Input from '@douyinfe/semi-ui-19/lib/es/input';
import { invoke } from './client.ts';
import {coverCandidateGroups, ratioPixels} from './cover-gallery.ts';
import {ManagementDialog, materialSize, materialType} from './library-panels.tsx';
import {PopupSelect, CoverCountInput} from './semi-controls.tsx';
import {TemplatePreview} from './template-preview.tsx';
import {PaginationBar} from './pagination-bar.tsx';
import {CoverImageViewer, ImagePreviewButton} from './cover-image-viewer.tsx';
import {CoverAnnotationEditor} from './cover-annotation.tsx';
import './cover-workspace.css';
import type { Attempt, CoverJob, CoverView, CoverHandoff, CoverResults, CoverReference } from '../shared/cover-contracts.ts';
import type { Content, Status } from '../shared/contracts.ts';
import type { WorkspaceLibrarySnapshot, WorkspaceContentDetails, WorkspaceCandidate, WorkspaceKind } from '../shared/workspace-contracts.ts';
interface Props { runLocal?<T>(action: () => Promise<T>): Promise<T | undefined>; acknowledge?(next: CoverView, document?: WorkspaceContentDetails): void; titleEditor?: {value: string; change(value: string): void; save(): void; saveDisabled: boolean; issue?: string}; arrangePublication?(): void; startOpenKey?: number; library?: WorkspaceLibrarySnapshot | null; refresh?(): Promise<void>; selectedTemplate?: {id: string; key: number} | null; status: Status | null; content: Content | null; dirty: boolean; busy: boolean; blocked: boolean; refreshToken: number; readAutomatically(contentId: string): Promise<{assets: CoverResults['listCoverAssets']; cover: CoverView} | undefined>; run<T>(action: () => Promise<T>): Promise<T | undefined>; onContent(content: Content): void }
const attemptLabels: Record<Attempt['status'], string> = { created: '待助手接单', claimed: '已接单', committed: '已入库', failed: '失败', cancelled: '已取消', superseded: '已替换' };
const defaultCoverPrompt = '根据当前标题与正文创作封面，参考所选风格；不要照抄样张文案或加入未经核实的事实。';
const launchNotice = assistantLaunchNotice();
const candidateFields = (candidate: WorkspaceCandidate) => JSON.stringify([candidate.id, candidate.assetHash, candidate.accepted, candidate.favorite, candidate.displayNumber, candidate.note, candidate.variantId]);
const candidateDocument = (document: WorkspaceContentDetails) => JSON.stringify([document.title, document.body, document.deletedAt, document.channelIds, document.materials, document.plans, document.publications, document.publicationEvents, document.coverVariants, document.recordedDate, document.plannedDate, document.preferredTemplateId, document.isExample, document.candidates.map(candidateFields)]);
function CoverArtwork({url, alt}: {url: string; alt: string}) {
  return <><img className="cover-artwork-backdrop" src={url} alt="" aria-hidden="true" loading="lazy"/><span className="cover-artwork-fit"><img className="cover-artwork-original" src={url} alt={alt} loading="lazy"/></span></>;
}
function CoverMaterials({materials, selected, invalid, disabled, change}: {materials: WorkspaceContentDetails['materials']; selected: string[]; invalid: string[]; disabled: boolean; change(ids: string[]): void}) {
  const [query, setQuery] = useState(''), [page, setPage] = useState(1), [pageSize, setPageSize] = useState(20);
  const rows = materials.filter(item => !item.deletedAt && (item.originalName || '').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / pageSize)));
  return <fieldset className="cover-materials" disabled={disabled}><legend>本次封面要参考的内容资料（可选）</legend><p>默认不带资料。只有你在这里明确勾选的文件，才会进入本次请求；请先确认资料适合交给当前助手使用。</p><Input type="search" className="semi-control-text" aria-label="搜索封面参考资料" value={query} onChange={value => {setQuery(value); setPage(1);}} placeholder="搜索资料名称"/>{rows.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(item => <div key={item.id} className="checkbox"><Checkbox checked={selected.includes(item.id)} disabled={disabled || item.availability !== 'available' && !selected.includes(item.id)} onChange={event => change(event.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id))}><span>{item.originalName || '未命名资料'}<span className="material-detail">{materialType(item.detectedType)} · {materialSize(item.bytes)} · {item.availability === 'available' ? '可用' : '原资料缺失，无法使用'}</span></span></Checkbox></div>)}<PaginationBar total={rows.length} page={currentPage} pageSize={pageSize} onPageSizeChange={setPageSize} onPageChange={setPage} disabled={disabled} label="封面参考资料分页"/>{!materials.some(item => !item.deletedAt) && <p>还没有资料，可先在“内容资料附件”中添加，也可以不带资料继续。</p>}{invalid.length > 0 && <div role="alert"><p>已选的 {invalid.length} 份资料已被移除或不可用，请明确取消失效选择，或重新添加后勾选。</p><Button disabled={disabled} onClick={() => change(selected.filter(id => !invalid.includes(id)))}>取消失效资料的选择</Button></div>}<p>本次已选 {selected.length} 份资料。</p></fieldset>;
}
interface CompositionReference {kind: WorkspaceKind; ownerId: string; candidateId: string; assetHash: string; title: string; label: string; url?: string}
const compositionKey = (item: CompositionReference) => JSON.stringify([item.kind, item.ownerId, item.candidateId, item.assetHash]);
const compositionName = (item: CompositionReference) => `收藏构图参考-${item.kind}-${item.ownerId}-${item.candidateId}`;
function favoriteCompositions(library?: WorkspaceLibrarySnapshot | null): CompositionReference[] {
  return ([['content', library?.contentDetails ?? []], ['collection', library?.collections ?? []]] as const).flatMap(([kind, documents]) => documents.filter(item => !item.deletedAt).flatMap(document => document.candidates.filter(candidate => candidate.favorite).map((candidate, index) => ({kind, ownerId: document.id, candidateId: candidate.id, assetHash: candidate.assetHash, title: document.title || '未命名内容', label: candidate.displayNumber || String(index + 1), url: candidate.url}))));
}
function CompositionPicker({available, selected, invalid, disabled, refreshToken, change, failed}: {available: CompositionReference[]; selected: CompositionReference[]; invalid: Set<string>; disabled: boolean; refreshToken: number; change(value: CompositionReference[]): void; failed(key: string, value: boolean): void}) {
  const [query, setQuery] = useState(''), [page, setPage] = useState(1), [pageSize, setPageSize] = useState(20);
  const selectedKeys = new Set(selected.map(compositionKey)), availableKeys = new Set(available.map(compositionKey));
  const rows = [...selected.filter(item => !availableKeys.has(compositionKey(item))), ...available].filter(item => selectedKeys.has(compositionKey(item)) && invalid.has(compositionKey(item)) || `${item.title} ${item.label}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / pageSize)));
  return <section className="cover-composition-references" aria-label="参考构图（选填，来自收藏）"><h3>参考构图（选填，来自收藏）</h3><p>默认不选。只参考勾选图片的构图；模板决定风格，本人照片单独选择。生成时，所选原图会作为本篇参考资料保存。</p><Input type="search" showClear className="semi-control-text" aria-label="搜索收藏构图参考" disabled={disabled} value={query} onChange={value => {setQuery(value); setPage(1);}} placeholder="搜索来源标题或候选号"/><ImageList className="cover-sample-grid">{rows.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(item => {const key = compositionKey(item), checked = selectedKeys.has(key), unavailable = invalid.has(key) || !item.url; return <List.Item key={key}><div className="cover-sample"><Checkbox checked={checked} disabled={disabled || unavailable && !checked} aria-label={`构图参考：${item.title} · ${item.label}`} onChange={event => change(event.target.checked ? [...selected, item] : selected.filter(reference => compositionKey(reference) !== key))}><span className="cover-sample-art cover-artwork">{item.url && <span className="cover-artwork-fit"><img className="cover-artwork-original" key={refreshToken} src={item.url} alt={`${item.title} 收藏封面 ${item.label}`} loading="lazy" onError={() => failed(key, true)} onLoad={() => failed(key, false)}/></span>}</span><span>{item.kind === 'collection' ? '合集' : '内容'} · {item.title} · {item.label}</span>{unavailable && <span>已失效，请取消选择或恢复原收藏</span>}</Checkbox></div></List.Item>;})}</ImageList><PaginationBar total={rows.length} page={currentPage} pageSize={pageSize} onPageSizeChange={setPageSize} onPageChange={setPage} disabled={disabled} label="收藏构图参考分页"/>{!rows.length && <p>{query.trim() ? '没有匹配的收藏构图参考，请调整搜索。' : '还没有可用的收藏封面，可先在内容或合集的候选中收藏。'}</p>}{selected.some(item => invalid.has(compositionKey(item))) && <p role="alert">已选构图参考已取消收藏、来源已删除、原图缺失或内容已改变。选择已保留，失效项不受搜索过滤；请取消失效项或恢复原收藏后再生成。</p>}<p>本次已选 {selected.length} 张构图参考。</p></section>;
}
function CoverAttempts({job}: {job: CoverJob}) {
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(20), [open, setOpen] = useState(false), currentPage = Math.min(page, Math.max(1, Math.ceil(job.attempts.length / pageSize)));
  return <details onToggle={event => setOpen(event.currentTarget.open)}><summary>查看尝试记录（{job.attempts.length}）</summary>{open && <DataTable rows={[...job.attempts].reverse().slice((currentPage - 1) * pageSize, currentPage * pageSize)} rowKey="attemptId" total={job.attempts.length} page={currentPage} pageSize={pageSize} onPageSizeChange={setPageSize} onPageChange={setPage} label="生成尝试记录分页" columns={[{title:'尝试',key:'attempt',render:(_,attempt)=>attempt.attemptId === job.activeAttemptId ? '当前尝试' : '历史尝试'},{title:'助手',key:'host',render:(_,attempt)=>attempt.host === 'workbuddy' ? 'WorkBuddy' : 'Codex'},{title:'结果',key:'status',render:(_,attempt)=><span>{attemptLabels[attempt.status]}{attempt.failure ? ` · ${attempt.failure.message}` : ''}</span>}]}/>}</details>;
}
export function CoverPanel({ titleEditor, arrangePublication, startOpenKey, library, refresh: refreshWorkspace, selectedTemplate, status, content, dirty, busy, blocked, refreshToken, readAutomatically, run, runLocal = run, acknowledge, onContent }: Props) {
  const [assets, setAssets] = useState<CoverResults['listCoverAssets'] | null>(null);
  const [cover, setCover] = useState<CoverView | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [samples, setSamples] = useState<string[]>([]);
  const [templateVersion, setTemplateVersion] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [templateSource, setTemplateSource] = useState('all');
  const [page, setPage] = useState(1), [templatePageSize, setTemplatePageSize] = useState(5);
  const [photoId, setPhotoId] = useState('');
  const [materialIds, setMaterialIds] = useState<string[]>([]);
  const [compositionReferences, setCompositionReferences] = useState<CompositionReference[]>([]);
  const [compositionSnapshot, setCompositionSnapshot] = useState<WorkspaceLibrarySnapshot | null>(null);
  const [compositionFailures, setCompositionFailures] = useState<Set<string>>(new Set());
  useEffect(() => {setCompositionSnapshot(null);}, [library]);
  const availableCompositions = useMemo(() => favoriteCompositions(compositionSnapshot ?? library), [compositionSnapshot, library]);
  const invalidCompositionKeys = new Set(compositionReferences.filter(item => !item.url || compositionFailures.has(compositionKey(item)) || !availableCompositions.some(current => compositionKey(current) === compositionKey(item))).map(compositionKey));
  const compositionImageFailed = (key: string, value: boolean) => setCompositionFailures(old => {if (old.has(key) === value) return old; const next = new Set(old); if (value) next.add(key); else next.delete(key); return next;});
  const [own, setOwn] = useState(false);
  const [count, setCount] = useState(1);
  const [ratio, setRatio] = useState('3:4');
  const [customRatio, setCustomRatio] = useState(false);
  const [ratioDraft, setRatioDraft] = useState('3:4');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [candidatePage, setCandidatePage] = useState(1), [candidatePageSize, setCandidatePageSize] = useState(20), [historyPage, setHistoryPage] = useState(1), [historyPageSize, setHistoryPageSize] = useState(20);
  useEffect(() => {setCandidatePage(1); setHistoryPage(1);}, [content?.id, onlyFavorites]);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [annotationDraft, setAnnotationDraft] = useState<(WorkspaceCandidate & {editToken: string; url: string; baseline: string}) | null>(null);
  const [prompt, setPrompt] = useState(defaultCoverPrompt);
  const [notice, setNotice] = useState('');
  const [pendingCandidates, setPendingCandidates] = useState<Set<string>>(new Set()), candidateOperations = useRef(new Set<string>());
  const candidateBusy = pendingCandidates.size > 0;
  async function runCandidate<T>(action: () => Promise<T>, candidateId = annotationDraft?.id ?? candidateDraft?.id ?? '') {
    if (candidateOperations.current.has(candidateId)) return;
    candidateOperations.current.add(candidateId); setPendingCandidates(new Set(candidateOperations.current));
    try {return await runLocal(action);} finally {candidateOperations.current.delete(candidateId); if (alive.current) setPendingCandidates(new Set(candidateOperations.current));}
  }
  const [previewCandidateId, setPreviewCandidateId] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<WorkspaceContentDetails | null>(null);
  const metadataRef = useRef(metadata); metadataRef.current = metadata;
  const ownCandidateTokens = useRef(new Map<string, string>());
  const [candidateDraft, setCandidateDraft] = useState<(WorkspaceCandidate & {editToken: string; baseline: string}) | null>(null);
  const hasCandidateDraft = !!candidateDraft || !!annotationDraft;
  const [composerOpen, setComposerOpen] = useState(false);
  const composerDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (startOpenKey) setComposerOpen(true); }, [startOpenKey]);
  useEffect(() => { if (composerOpen && composerDialog.current && !composerDialog.current.open) composerDialog.current.showModal(); }, [composerOpen, content?.id]);
  useEffect(() => { setMetadata(library?.contentDetails.find(item => item.id === content?.id) ?? null); }, [library, content?.id]);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [preview, setPreview] = useState<{ label: string; images: {url: string; assetHash?: string}[]; selection?: {id: string; version: number; hashes: string[]} } | null>(null);
  const previewReturn = useRef<HTMLElement | null>(null);
  function closePreview() {setPreview(null); if (preview?.selection) requestAnimationFrame(() => previewReturn.current?.focus());}
  const previewDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (preview && previewDialog.current && !previewDialog.current.open) previewDialog.current.showModal(); }, [preview]);
  const template = assets?.templates.find(t => t.id === templateId);
  const templateMetadata = library?.templates.find(item => item.id === templateId);
  const invalidTemplate = !!templateId && (!template || !isSelectableTemplate(template) || !!templateMetadata?.deletedAt || template.version !== templateVersion || !!templateMetadata && templateMetadata.currentVersion !== templateVersion || samples.some(hash => !template.samples.some(sample => sample.assetHash === hash)));
  const previewTemplate = assets?.templates.find(item => item.id === preview?.selection?.id);
  const invalidPreview = !!preview?.selection && (!previewTemplate || previewTemplate.version !== preview.selection.version || !!library?.templates.find(item => item.id === previewTemplate.id && (item.deletedAt || item.currentVersion !== preview.selection!.version)) || preview.selection.hashes.some(hash => !previewTemplate.samples.some(sample => sample.assetHash === hash)));
  const selectedPhoto = assets?.photos.find(p => p.id === photoId);
  const photoMetadata = library?.photos.find(item => item.id === photoId);
  const invalidPhoto = !!photoId && (!selectedPhoto || !selectedPhoto.isOwnPhoto || selectedPhoto.availability !== 'available' || !selectedPhoto.assetHash || !!photoMetadata && (!!photoMetadata.deletedAt || !photoMetadata.isOwnPhoto || photoMetadata.availability !== 'available' || photoMetadata.assetHash !== selectedPhoto.assetHash));
  const materials = library?.contentDetails.find(item => item.id === content?.id)?.materials ?? [];
  const invalidMaterialIds = materialIds.filter(id => !materials.some(item => item.id === id && !item.deletedAt && item.availability === 'available' && !!item.assetHash));
  const apply = (next: CoverView) => { if (!alive.current || next.content.id !== content?.id) return; coverRef.current = next; setCover(next); onContent(next.content); };
  async function refreshAssets() {
    const next = await invoke('listCoverAssets'); if (!alive.current) return; setAssets(next);
  }
  async function refresh() { await refreshAssets(); if (content && alive.current) apply(await invoke('readCover', { contentId: content.id })); }
  async function openCoverTask(action: () => Promise<CoverHandoff>) {
    try {
      const next = await action(); apply(next);
      if (alive.current) setComposerOpen(false);
      if (alive.current) setNotice(next.launchRequested ? launchNotice : '这次固定请求已有结果或已结束，已显示原任务与候选。需要重做时，请明确重新生成。');
    } catch (error) {
      if (alive.current) setNotice('尚未确认交接成功，设置已保留。可收起窗口，在任务区继续或处理恢复提示。');
      // A failed app launch must leave the persisted live attempt visible for recovery.
      if (content) try { apply(await invoke('readCover', { contentId: content.id })); } catch {}
      throw error;
    }
  }
  const refreshed = useRef<string | null>(null);
  useEffect(() => {
    const key = `${content?.id}:${refreshToken}`;
    if (!status?.currentName || !content || busy || refreshed.current === key) return;
    refreshed.current = key;
    void readAutomatically(content.id).then(next => { if (!next || !alive.current) return; setAssets(next.assets); apply(next.cover); });
  }, [status?.currentName, content?.id, busy, refreshToken]);
  const currentCover = cover && content && cover.content.id === content.id ? cover.content.editToken === content.editToken ? cover : {...cover, content} : null;
  const coverRef = useRef(currentCover); coverRef.current = currentCover;
  const progressEpoch = useRef({id: content?.id, library}); progressEpoch.current = {id: content?.id, library};
  const progressKey = cover?.jobs.some(j => j.activeAttemptId) ? content?.id ?? '' : '';
  useTaskProgress(progressKey, async () => {
    if (busy || !content) return;
    const id = content.id, snapshot = await invoke('readCoverProgress', {contentId: id});
    if (!alive.current || progressEpoch.current.id !== id || progressEpoch.current.library !== library || !coverRef.current) return;
    if (taskStatusChanged(coverRef.current.jobs, snapshot)) {
      const next = await invoke('readCover', {contentId: id});
      if (alive.current && progressEpoch.current.id === id && progressEpoch.current.library === library) apply(next);
    } else setCover(old => old?.content.id === id ? {...old, jobs: mergeTaskProgress(old.jobs, snapshot)} : old);
  });
  const initialized = useRef<string | null>(null);
  const touched = useRef({ template: false, photo: false, count: false });
  useEffect(() => {
    initialized.current = null;
    touched.current = { template: false, photo: false, count: false };
    setPrompt(defaultCoverPrompt); setTemplateId(''); setTemplateVersion(null); setPreview(null); setSamples([]); setPhotoId(''); setMaterialIds([]); setCompositionReferences([]); setCompositionFailures(new Set()); setCompositionSnapshot(null); setCount(1); setRatio('3:4'); setCustomRatio(false); setCompareIds([]); setComparing(false); setOnlyFavorites(false); setAnnotationDraft(null); setCandidateDraft(null); ownCandidateTokens.current.clear(); setPreviewCandidateId(null); setCover(null); setNotice('');
  }, [content?.id]);
  useEffect(() => {
    // A supplied null snapshot is still loading; an omitted prop keeps the standalone panel usable.
    if (!assets || !content || library === null || initialized.current === content.id) return;
    initialized.current = content.id;
    if (!touched.current.template) {
      const preferred = selectedTemplate?.id ?? library?.contentDetails.find(item => item.id === content.id)?.preferredTemplateId ?? library?.settings.defaults.templateId ?? assets.templates.find(isSelectableTemplate)?.id ?? '';
      const selected = assets.templates.find(item => item.id === preferred);
      setTemplateId(preferred); setTemplateVersion(selected?.version ?? null); setSamples(selected?.samples.map(item => item.assetHash) ?? []);
    }
    if (!touched.current.photo) setPhotoId(library?.settings.defaults.photoId ?? '');
    if (!touched.current.count) setCount(library?.settings.defaults.coverCount ?? 1);
  }, [assets, library, content?.id, selectedTemplate?.id]);
  const appliedSelection = useRef<number | null>(null);
  useEffect(() => {
    if (!selectedTemplate || !assets || appliedSelection.current === selectedTemplate.key) return;
    const next = assets.templates.find(template => template.id === selectedTemplate.id);
    if (next && isSelectableTemplate(next)) { appliedSelection.current = selectedTemplate.key; touched.current.template = true; setTemplateId(next.id); setTemplateVersion(next.version); setSamples(next.samples.map(sample => sample.assetHash)); }
  }, [selectedTemplate?.id, selectedTemplate?.key, assets]);
  const enabled = !!status?.currentName && !busy && !blocked;
  const templateGroups = useMemo(() => {
    const available = assets?.templates ?? [], byId = new Map(available.map(item => [item.id, item]));
    const groups = new Map<string, typeof available>();
    for (const item of available) {
      if (!isSelectableTemplate(item)) continue;
      let source = item; const visited = new Set([item.id]);
      while (source.derivedFrom && byId.has(source.derivedFrom.id) && !visited.has(source.derivedFrom.id)) {visited.add(source.derivedFrom.id); source = byId.get(source.derivedFrom.id)!;}
      const members = groups.get(source.id) ?? []; members.push(item); groups.set(source.id, members);
    }
    return [...groups].map(([id, members]) => ({source: byId.get(id)!, members}));
  }, [assets]);
    const previewGroup = templateGroups.find(group => group.members.some(item => item.id === previewTemplate?.id))?.members ?? [];
  const matching = templateGroups.filter(({source, members}) => (templateSource === 'all' || (templateSource === 'builtin' ? source.builtin : members.some(item => !item.builtin))) && members.some(item => `${item.name} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase())));
  const currentTemplatePage = Math.min(page, Math.max(1, Math.ceil(matching.length / templatePageSize)));
  const visibleTemplates = matching.slice((currentTemplatePage - 1) * templatePageSize, currentTemplatePage * templatePageSize);
  function chooseTemplate(id: string) { const next = assets?.templates.find(t => t.id === id); if (next && isSelectableTemplate(next) && (id !== templateId || invalidTemplate)) { touched.current.template = true; setTemplateId(id); setTemplateVersion(next.version); setSamples(next.samples.map(r => r.assetHash)); } }
  function previewSamples(id: string) {
    const next = assets?.templates.find(item => item.id === id);
    if (!next || !isSelectableTemplate(next)) return;
    if (!preview) previewReturn.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPreview({label: next.name, images: next.samples, selection: {id: next.id, version: next.version, hashes: next.id === templateId ? [...samples] : next.samples.map(sample => sample.assetHash)}});
  }
  const validRatioDraft = ratioPixels(ratioDraft) ? ratioDraft : null;
  const ratios = [...new Set(['3:4', '1:1', '16:9', ...(library?.settings.customRatios ?? [])])];
  const pixels = ratioPixels(ratio);
  function finishRatio(apply: boolean) {if (apply && validRatioDraft) setRatio(validRatioDraft); setCustomRatio(false); requestAnimationFrame(() => document.getElementById('cover-ratio')?.focus());}
  const assistant = status?.assistant === 'workbuddy' ? 'WorkBuddy' : 'Codex';
  const jobs = useMemo(() => [...(currentCover?.jobs ?? [])].reverse(), [currentCover]);
  const favoriteIds = useMemo(() => new Set(metadata?.candidates.filter(item => item.favorite).map(item => item.id) ?? []), [metadata]);
  const originalGroups = useMemo(() => currentCover ? coverCandidateGroups(currentCover) : [], [currentCover]);
  const candidateGroups = useMemo(() => currentCover ? coverCandidateGroups(currentCover, favoriteIds, onlyFavorites) : [], [currentCover, favoriteIds, onlyFavorites]);
  const candidateBatches = useMemo(() => new Map(originalGroups.flatMap(group => group.candidates.map(candidate => [candidate.id, group.batchNumber ? `第${group.batchNumber}批` : "历史"] as const))), [originalGroups]);
  const candidateMetadata = useMemo(() => new Map(metadata?.candidates.map(item => [item.id, item]) ?? []), [metadata]);
  const candidateNumbers = useMemo(() => new Map(currentCover?.candidates.map((item, index) => [item.id, String(index + 1).padStart(2, '0')]) ?? []), [currentCover]);
  const candidateTotal = candidateGroups.reduce((count, group) => count + group.candidates.length, 0), currentCandidatePage = Math.min(candidatePage, Math.max(1, Math.ceil(candidateTotal / candidatePageSize))), currentHistoryPage = Math.min(historyPage, Math.max(1, Math.ceil(jobs.length / historyPageSize)));
  let candidateOffset = 0;
  const visibleCandidateGroups = candidateGroups.map(group => {const start = candidateOffset; candidateOffset += group.candidates.length; return {...group, candidates: group.candidates.slice(Math.max(0, (currentCandidatePage - 1) * candidatePageSize - start), Math.max(0, currentCandidatePage * candidatePageSize - start))};}).filter(group => group.candidates.length);
  const compareCandidates = currentCover?.candidates.filter(item => compareIds.includes(item.id)) ?? [];
  const liveJob = jobs.find(job => job.attempts.some(attempt => attempt.attemptId === job.activeAttemptId && ['created', 'claimed'].includes(attempt.status)));
  const liveAttempt = liveJob?.attempts.find(attempt => attempt.attemptId === liveJob.activeAttemptId);
  useEffect(() => { if (!liveAttempt && notice === launchNotice) setNotice(''); }, [liveAttempt, notice]);
  const liveReference: CoverReference | null = currentCover && liveJob && liveAttempt ? { contentId: currentCover.content.id, requestId: liveJob.id, attemptId: liveAttempt.attemptId } : null;
  const selectedCandidate = currentCover?.candidates.find(candidate => candidate.id === currentCover.selectedCandidateId);
  async function saveCandidate(draft: WorkspaceCandidate & {editToken: string; baseline?: string}, closeDraft = false) {
    if (!content) return;
    const before = metadataRef.current;
    let editToken = draft.editToken;
    const persisted = before?.candidates.find(item => item.id === draft.id);
    if (draft.baseline && before && persisted && candidateFields(persisted) === draft.baseline) {
      const seen = new Set<string>();
      while (editToken !== before.editToken && !seen.has(editToken) && ownCandidateTokens.current.has(editToken)) {seen.add(editToken); editToken = ownCandidateTokens.current.get(editToken)!;}
    }
    const nextMetadata = await invoke('updateCoverCandidate', { op: 'updateCandidate', kind: 'content', id: content.id, editToken, candidateId: draft.id, favorite: draft.favorite, displayNumber: draft.displayNumber, note: draft.note, variantId: draft.variantId });
    if (before?.editToken === editToken && candidateDocument({...before, candidates: before.candidates.map(item => item.id === draft.id ? {...item, favorite: draft.favorite, displayNumber: draft.displayNumber, note: draft.note, variantId: draft.variantId} : item)}) === candidateDocument(nextMetadata)) ownCandidateTokens.current.set(editToken, nextMetadata.editToken);
    if (!alive.current) return;
    metadataRef.current = nextMetadata; setMetadata(nextMetadata);
    if (nextMetadata) setAnnotationDraft(old => old?.id === draft.id ? {...old, note: draft.note, editToken: nextMetadata.editToken} : old);
    if (closeDraft) setCandidateDraft(null); setNotice('候选信息已保存。');
    const acknowledged = {...coverRef.current!, content: {id: nextMetadata.id, title: nextMetadata.title, body: nextMetadata.body, deletedAt: nextMetadata.deletedAt, editToken: nextMetadata.editToken}};
    apply(acknowledged); acknowledge?.(acknowledged, nextMetadata);
    const nextCover = await invoke('readCover', {contentId: content.id});
    if (alive.current) {apply(nextCover); acknowledge?.(nextCover);}
    return nextCover;
  }
  const compositionPrompt = compositionReferences.length ? `\n【收藏构图参考】\n以下所选参考资料仅供参考构图、位置和画面层次：以“收藏构图参考-”开头的 ${compositionReferences.length} 份本次所选资料。模板样张用于参考风格；不要照抄收藏图中的旧标题或人物，只有本次明确选择的本人照片可作为人物参考。` : '';
  async function attachCompositionReferences(editToken: string, additionalMaterials = 0) {
    if (materialIds.length + compositionReferences.length + additionalMaterials > 100) throw new Error('本次最多使用 100 份参考资料，请减少构图参考或内容资料的选择。');
    if (!content || !compositionReferences.length) return {editToken, materialIds: [] as string[]};
    const fresh = await invoke('readWorkspaceLibrary');
    if (alive.current) setCompositionSnapshot(fresh);
    const currentTarget = fresh.contentDetails.find(item => item.id === content.id);
    if (!currentTarget || currentTarget.deletedAt || currentTarget.editToken !== editToken) throw Object.assign(new Error('内容资料已有更新，请刷新并确认当前内容后再生成。构图选择已保留。'), {code: 'CONFLICT'});
    let target: WorkspaceContentDetails = currentTarget;
    const available = new Set(favoriteCompositions(fresh).map(compositionKey));
    if (compositionReferences.some(item => !available.has(compositionKey(item)) || !item.url || compositionFailures.has(compositionKey(item)))) throw new Error('所选构图参考已失效，请取消失效项或恢复原收藏后再生成。');
    const ids: string[] = [];
    for (const reference of compositionReferences) {
      const originalName = compositionName(reference);
      let material = target.materials.find(item => !item.deletedAt && item.availability === 'available' && item.role === 'reference' && item.originalName === originalName && item.assetHash === reference.assetHash);
      if (!material) {
        const result = await invoke('mutateWorkspace', {op: 'attachMaterial', id: content.id, editToken: target.editToken, assetHash: reference.assetHash, originalName, role: 'reference'});
        const next = result.library.contentDetails.find(item => item.id === content.id);
        if (!next) throw new Error('构图参考已添加，但未能重新读取内容。请刷新后继续，选择已保留。');
        target = next;
        if (alive.current) {setMetadata(next); setAnnotationDraft(old => old ? {...old, editToken: next.editToken} : old); onContent({id: next.id, title: next.title, body: next.body, editToken: next.editToken, deletedAt: next.deletedAt});}
        material = target.materials.find(item => !item.deletedAt && item.availability === 'available' && item.role === 'reference' && item.originalName === originalName && item.assetHash === reference.assetHash);
      }
      if (!material) throw new Error('没有找到本次构图参考，请刷新后继续。');
      ids.push(material.id);
    }
    return {editToken: target.editToken, materialIds: ids};
  }
  const annotationCandidate = currentCover?.candidates.find(item => item.id === annotationDraft?.id);
  const annotationSummary = currentCover?.jobs.find(job => job.id === annotationCandidate?.requestId)?.summary;
  const refinementRatio = annotationSummary?.ratio ?? ratio;
  const refinementPixels = annotationSummary?.pixels ?? ratioPixels(refinementRatio);
  const refinementDisabled = !!liveJob || !!content?.deletedAt || !template || invalidTemplate || invalidPhoto || invalidMaterialIds.length > 0 || invalidCompositionKeys.size > 0 || !samples.length || !refinementPixels;
  const refinementPrompt = (note: string) => `以所附候选原图（${annotationDraft?.id}）为基础，按以下批注修改；位置批注优先，保持未要求修改的内容与布局。位置从原图左上角起按宽、高百分比定位；rect 的 x、y 为框左上角，width、height 为框宽高；path 为按顺序连接的划线采样点，均为原图百分比。框和线仅表示修改范围，不画进成品。\n${note}${prompt.trim() && prompt !== defaultCoverPrompt ? `\n【本次补充要求】\n${prompt}` : ''}${compositionPrompt}`;
  async function refineCandidate(note: string) {
    if (!content || !annotationDraft || !annotationCandidate || !template || refinementDisabled) return;
    if (materialIds.length + compositionReferences.length + 1 > 100) throw new Error('本次最多使用 100 份参考资料，请减少构图参考或内容资料的选择。');
    const requestPrompt = refinementPrompt(note);
    if (requestPrompt.length > 10000) throw Object.assign(new Error('批注、补充要求与定位说明合计超过 10000 字，请保留原文并调整后再修改。'), {code: 'INVALID_INPUT'});
    const fresh = await saveCandidate({...annotationDraft, note});
    if (!fresh) return;
    const originalName = `候选修改参考-${annotationCandidate.id}.png`;
    let material = metadata?.materials.find(item => !item.deletedAt && item.availability === 'available' && item.assetHash === annotationCandidate.assetHash && item.originalName === originalName && item.role === 'reference');
    let referenceEditToken = fresh.content.editToken;
    if (!material) {
      const result = await invoke('mutateWorkspace', {op: 'attachMaterial', id: content.id, editToken: referenceEditToken, assetHash: annotationCandidate.assetHash, originalName, role: 'reference'});
      const nextMetadata = result.library.contentDetails.find(item => item.id === content.id);
      if (!nextMetadata) throw new Error('参考图已添加，但未能读取内容，请刷新后继续。');
      material = nextMetadata.materials.find(item => !item.deletedAt && item.assetHash === annotationCandidate.assetHash && item.originalName === originalName && item.role === 'reference');
      referenceEditToken = nextMetadata.editToken;
      if (alive.current) { setMetadata(nextMetadata); setAnnotationDraft(old => old ? {...old, note, editToken: nextMetadata.editToken} : old); }
    }
    if (!material) throw new Error('没有找到本次原图参考，请刷新后继续。');
    const composition = await attachCompositionReferences(referenceEditToken, 1);
    await openCoverTask(() => invoke('generateCover', {contentId: content.id, editToken: composition.editToken, input: {template: {id: template.id, version: template.version}, styleAssetHashes: samples, photo: photoId ? {id: selectedPhoto!.id, assetHash: selectedPhoto!.assetHash!} : null, materialIds: [...new Set([...materialIds, material.id, ...composition.materialIds])], prompt: requestPrompt, pixels: refinementPixels!, sizePolicy: annotationSummary?.sizePolicy ?? 'ratio-minimum', ratio: refinementRatio, count: 1, outputFormat: 'png', scope: 'cover-only'}}));
    if (alive.current) setAnnotationDraft(null);
    await refreshWorkspace?.();
  }
  const generationPrompt = (prompt.trim() ? prompt : defaultCoverPrompt) + compositionPrompt;
  const generationDisabled = !enabled || candidateBusy || dirty || hasCandidateDraft || !currentCover || !content || !!content.deletedAt || !!liveJob || !template || invalidTemplate || !pixels || customRatio || invalidPhoto || invalidMaterialIds.length > 0 || invalidCompositionKeys.size > 0 || !samples.length || !Number.isInteger(count) || count < 1 || count > 20 || generationPrompt.length > 10000;
  async function generate() {
    if (!content || generationDisabled || !template) return;
    if (invalidPhoto) throw Object.assign(new Error('所选照片已失效，请明确重选或选择这次不放人物。'), { code: 'PHOTO_SELECTION_INVALID' });
    if (invalidMaterialIds.length) throw Object.assign(new Error('所选资料已失效，请取消失效选择或重新添加后勾选。'), { code: 'MATERIAL_SELECTION_INVALID' });
    if (!pixels) throw Object.assign(new Error('封面比例无法生成合法的整数尺寸，请重新选择。'), { code: 'INVALID_INPUT' });
    const requestPrompt = generationPrompt;
    if (requestPrompt.length > 10000) throw Object.assign(new Error('封面要求合计超过 10000 字，请缩短补充要求后再生成。'), {code: 'INVALID_INPUT'});
    const composition = await attachCompositionReferences(content.editToken);
    await openCoverTask(() => invoke('generateCover', { contentId: content.id, editToken: composition.editToken, input: { template: { id: template.id, version: template.version }, styleAssetHashes: samples, photo: photoId ? { id: selectedPhoto!.id, assetHash: selectedPhoto!.assetHash! } : null, materialIds: [...new Set([...materialIds, ...composition.materialIds])], prompt: requestPrompt, pixels, sizePolicy: 'ratio-minimum', ratio, count, outputFormat: 'png', scope: 'cover-only' } }));
  }
  function candidateActions(candidate: CoverView['candidates'][number]) {
    const pending = pendingCandidates.has(candidate.id), details = candidateMetadata.get(candidate.id), selected = currentCover?.selectedCandidateId === candidate.id;
    return <div className="cover-result-actions">
                <Button size="small" aria-label={selected ? "已选用" : "选为封面"} aria-pressed={selected} theme={selected ? 'light' : 'solid'} disabled={!enabled || pending || dirty || hasCandidateDraft || selected} onClick={() => void runCandidate(async () => {const next = await invoke('selectCover', {contentId: currentCover!.content.id, candidateId: candidate.id, editToken: coverRef.current!.content.editToken}); const document = await invoke('readWorkspaceContent', {id: next.content.id}); const current = {...next, content: {id: document.id, title: document.title, body: document.body, deletedAt: document.deletedAt, editToken: document.editToken}}; if (alive.current) {metadataRef.current = document; setMetadata(document); apply(current); acknowledge?.(current, document);}}, candidate.id)}>{selected ? '已选用' : '选用'}</Button>
                <Button size="small" theme="borderless" disabled={!enabled || pending || dirty || !details || !metadata || hasCandidateDraft} onClick={() => { if (details && metadata) {setPreviewCandidateId(null); setAnnotationDraft({...details, url: candidate.url, editToken: metadata.editToken, baseline: candidateFields(details)});} }}>批注</Button>
                <Button size="small" theme="borderless" aria-pressed={details?.favorite ?? false} title={hasCandidateDraft ? '请先保存或放弃正在填写的备注，再修改收藏' : undefined} disabled={!enabled || pending || dirty || !details || !metadata || hasCandidateDraft} onClick={() => { if (details && metadata && !hasCandidateDraft) void runCandidate(() => {const current = metadataRef.current!, item = current.candidates.find(item => item.id === candidate.id)!; return saveCandidate({...item, favorite: !details.favorite, editToken: current.editToken});}, candidate.id); }}>{details?.favorite ? '已收藏' : '收藏'}</Button>
                <Button size="small" theme="borderless" disabled={busy || !status?.currentName} onClick={() => void runLocal(async () => { const result = await invoke('exportCover', { contentId: currentCover!.content.id, candidateId: candidate.id }); if (result.exported && alive.current) setNotice('封面原图已下载到所选位置。'); })}>下载</Button>
              </div>;
  }
  function editCandidate(candidateId: string) {
    const details = candidateMetadata.get(candidateId);
    if (details && metadata && !hasCandidateDraft && !pendingCandidates.has(candidateId)) {setPreviewCandidateId(null); setCandidateDraft({...details, editToken: metadata.editToken, baseline: candidateFields(details)});}
  }
  const previewCandidates = candidateGroups.flatMap(group => group.candidates);
  const enlarged = currentCover?.candidates.find(item => item.id === previewCandidateId);
  const enlargedIndex = previewCandidates.findIndex(item => item.id === previewCandidateId);
  return <section className="cover-panel cover-workspace" aria-label="封面作品">
    <div className="cover-workspace-heading"><div><h3>封面作品</h3><p>{content && !currentCover ? '正在读取这篇内容的封面作品…' : currentCover?.candidates.length ? `共 ${currentCover.candidates.length} 张候选，按批次保留。${selectedCandidate ? '已选好本篇封面。' : '选一张用作本篇封面。'}` : '选好风格，生成的封面会回到这里。'}</p></div><div className="cover-toolbar"><Button id="open-cover-folder" disabled={busy || !status?.currentName || !currentCover?.candidates.length} title="选择保存位置后，将全部候选原图导出到独立新文件夹并打开；不会覆盖已有文件" onClick={() => void runLocal(async () => { const result = await invoke('revealCoverFolder', {contentId: currentCover!.content.id}); if (alive.current) setNotice(result.revealed ? "全部候选原图已导出到独立新文件夹，并请求系统打开；已有文件不会覆盖。" : "已取消选择保存位置，原图仍保留在内容库中。"); })}>打开原图文件夹</Button><Button id="refresh-cover" disabled={busy || !status?.currentName || !content} onClick={() => void runLocal(refresh)}>刷新结果</Button><Button theme="solid" disabled={!enabled || !currentCover || !content || !!content.deletedAt || !!liveJob} onClick={() => {setNotice(''); setComposerOpen(true);}}>{currentCover?.candidates.length ? '再生成一批' : '制作封面'}</Button></div></div>
    {!content && <div className="cover-empty"><h4>先准备一篇内容</h4><p>保存标题与正文后，就可以为它制作封面。</p></div>}
    {liveJob && liveAttempt && liveReference && <div className="cover-live-job" id="cover-jobs"><div><span className="cover-state" role="status" aria-live="polite">{taskProgressLabel(liveAttempt)}</span><h4>{liveJob.summary ? `${liveJob.summary.count} 张封面 · ${liveJob.summary.ratio}` : '这次封面正在准备'}</h4><TaskProgressDetails attempt={liveAttempt}/>{!liveAttempt.progress && <p>{assistantLaunchNotice(liveAttempt)}</p>}{!liveAttempt.progress?.sessionId && <p>尚未绑定原会话；打开助手后，按同一任务编号继续。</p>}{liveAttempt.failure && <p role="alert">{liveAttempt.failure.message}</p>}</div><div className="cover-toolbar"><Button id="continue-cover" theme="solid" disabled={!enabled || liveAttempt.progressUnavailable} onClick={() => void run(async () => {await invoke('continueBoundCover', liveReference); if (alive.current) setNotice(assistantLaunchNotice(liveAttempt));})}>{liveAttempt.progress?.sessionId ? `去 ${liveAttempt.host === 'codex' ? 'Codex' : 'WorkBuddy'} ${liveAttempt.progress.state.startsWith('waiting-') ? '确认' : '继续'}` : `打开 ${liveAttempt.host === 'codex' ? 'Codex' : 'WorkBuddy'} 继续`}</Button>{status?.assistant !== liveAttempt.host && <Button disabled={!enabled || dirty} onClick={() => void run(() => openCoverTask(async () => {await invoke('continueCover', liveReference); return {...await invoke('readCover', {contentId: liveReference.contentId}), launchRequested: true};}))}>换用 {assistant} 继续</Button>}<Button disabled={!enabled || dirty} onClick={() => void run(async () => apply(await invoke('cancelCover', liveReference)))}>取消这次生成</Button></div></div>}
    {selectedCandidate && <div className="cover-selected"><Button theme="borderless" htmlType="button" className="cover-selected-preview cover-artwork" onClick={() => setPreviewCandidateId(selectedCandidate.id)}><CoverArtwork url={selectedCandidate.url} alt="当前选用封面"/></Button><div><span className="cover-state">当前选用</span><h4>{content?.title}</h4></div><span className="management-actions">{arrangePublication && <Button theme="solid" disabled={busy || dirty || blocked} onClick={arrangePublication}>安排发布 →</Button>}<Button size="small" disabled={busy || !status?.currentName} onClick={() => void runLocal(async () => { const result = await invoke('exportCover', { contentId: currentCover!.content.id, candidateId: selectedCandidate.id }); if (result.exported && alive.current) setNotice('封面原图已下载到所选位置。'); })}>下载原图</Button></span></div>}
    {content && !currentCover?.candidates.length && <div className="cover-empty"><span className="cover-empty-mark" aria-hidden="true">▧</span><h4>{!currentCover ? '正在读取封面作品…' : liveJob ? '封面尚未回传' : '你的第一张封面，从这里开始'}</h4><p>{!currentCover ? '原有候选和选用状态会在读取后显示。' : liveJob ? '通过校验的图片会出现在这里。' : '选择一组模板，也可以加入本人照片，一次生成多张候选。'}</p></div>}
    {!!currentCover?.candidates.length && <ListToolbar className="cover-gallery-toolbar"><div className="checkbox"><Checkbox checked={onlyFavorites} onChange={event => setOnlyFavorites(!!event.target.checked)}>只看收藏</Checkbox></div><span>收藏优先 · 已勾选 {compareCandidates.length} / 4 张</span><Button disabled={compareCandidates.length < 2 || compareCandidates.length > 4} onClick={() => setComparing(true)}>并排比较（{compareCandidates.length}）</Button>{compareIds.length > 0 && <Button theme="borderless" onClick={() => setCompareIds([])}>清空勾选</Button>}</ListToolbar>}
    {onlyFavorites && !candidateGroups.length && <p className="cover-filter-empty">还没有收藏的封面。取消“只看收藏”后，可从候选中收藏。</p>}
    <div id="cover-candidates" className="cover-result-groups">{currentCover && visibleCandidateGroups.map(({key, job, attempt, candidates, batchNumber, latest, label}) => {
      const summary = job?.summary, templateName = summary && assets?.templates.find(item => item.id === summary.template.id)?.name;
      return <section key={key} className="cover-result-group" aria-label={label || (attempt ? `第 ${batchNumber} 批封面` : '历史候选')}>
        <div className="cover-batch-heading"><div><h4>{label || (attempt ? `第 ${batchNumber} 批` : '历史候选')}<span className="cover-batch-count">{candidates.length} 张</span>{latest && <span className="cover-batch-latest">最近生成</span>}</h4><p>{attempt ? [templateName || '原模板', summary?.ratio, summary ? summary.hasOwnPhoto ? '本人照片' : '不放人物' : '', attempt.host === 'workbuddy' ? 'WorkBuddy' : 'Codex'].filter(Boolean).join(' · ') : label ? '收藏的候选会集中显示，原图与生成批次继续保留' : '原生成设置未记录，候选完整保留'}</p></div></div>
        <ImageList className="cover-result-grid">{candidates.map(candidate => {
          const details = candidateMetadata.get(candidate.id), selected = currentCover.selectedCandidateId === candidate.id;
          const number = details?.displayNumber || candidateNumbers.get(candidate.id);
          return <List.Item key={candidate.id}><article key={candidate.id} className={`cover-result-card${selected ? ' is-selected' : ''}`}>
            <Button theme="borderless" htmlType="button" className="cover-result-image cover-artwork" aria-label={`放大候选 ${number}`} onClick={() => setPreviewCandidateId(candidate.id)}>
              <CoverArtwork url={candidate.url} alt={candidate.originalName || `封面候选 ${number}`}/>
            </Button>
            <div className="cover-result-caption"><div className="cover-card-title"><strong className="cover-candidate-number">候选 <span>{number}</span><small>{candidateBatches.get(candidate.id)}</small></strong><div className="cover-card-tools"><div className="checkbox"><Checkbox aria-label={`比较候选 ${number}`} checked={compareIds.includes(candidate.id)} disabled={compareIds.length >= 4 && !compareIds.includes(candidate.id)} onChange={event => setCompareIds(old => event.target.checked ? [...old, candidate.id] : old.filter(id => id !== candidate.id))}>比较</Checkbox></div><Button size="small" theme="borderless" className={details?.note ? "cover-note-indicator" : undefined} aria-label="候选备注与信息" title={hasCandidateDraft ? "请先保存或放弃正在填写的备注" : details?.note ? "查看完整备注与批注" : "备注与信息"} disabled={!enabled || pendingCandidates.has(candidate.id) || dirty || !details || !metadata || hasCandidateDraft} onClick={() => editCandidate(candidate.id)}>{details?.note ? "●" : "⋯"}</Button></div></div>
              {candidateActions(candidate)}
            </div>
          </article></List.Item>;
        })}</ImageList>
      </section>;
    })}</div>
    {candidateTotal > 0 && <PaginationBar total={candidateTotal} page={currentCandidatePage} pageSize={candidatePageSize} onPageSizeChange={setCandidatePageSize} disabled={busy || blocked} onPageChange={setCandidatePage} label="封面候选分页"/>}
    {jobs.length > 0 && <details className="cover-history"><summary>生成记录（{jobs.length} 组设置）</summary><DataTable rows={jobs.slice((currentHistoryPage - 1) * historyPageSize, currentHistoryPage * historyPageSize)} total={jobs.length} page={currentHistoryPage} pageSize={historyPageSize} onPageSizeChange={setHistoryPageSize} disabled={busy || blocked} onPageChange={setHistoryPage} label="封面生成记录分页" showHeader={false} columns={[{key: 'job', render: (_, job, index) => {
      const latest = job.attempts.find(attempt => attempt.attemptId === job.activeAttemptId) ?? job.attempts.at(-1);
      const reference: CoverReference | null = currentCover && latest ? { contentId: currentCover.content.id, requestId: job.id, attemptId: latest.attemptId } : null;
      const live = !!latest && ['created', 'claimed'].includes(latest.status);
      const summary = job.summary;
      const templateName = summary && assets?.templates.find(item => item.id === summary.template.id)?.name;
      return <div key={job.id} className="cover-history-row"><div><strong>{index === 0 && currentHistoryPage === 1 ? '最近一组设置' : `第 ${jobs.length - (currentHistoryPage - 1) * historyPageSize - (index ?? 0)} 组设置`} · {latest ? attemptLabels[latest.status] : '准备未完成'}</strong>{summary ? <p>{templateName || '原模板'} · 版本 {summary.template.version} · {summary.styleSampleCount} 张样张 · {summary.hasOwnPhoto ? '含本人照' : '不放人物'} · {summary.count} 张 · {summary.ratio} · {summary.sizePolicy === 'ratio-minimum' ? '至少' : '精确'}{summary.pixels.width}×{summary.pixels.height}{summary.sizePolicy === 'ratio-minimum' ? '；实际尺寸以生成结果为准' : ''}</p> : <p>原输入摘要暂不可用，任务与候选仍保留。</p>}{latest?.failure && <p role="alert">{latest.failure.message}</p>}<CoverAttempts job={job}/></div>{reference && !live && <Button disabled={!enabled || dirty || hasCandidateDraft || !!liveJob} onClick={() => void run(() => openCoverTask(() => invoke('retryCover', reference)))}>按这组设置重做</Button>}</div>;
    }}]}/></details>}
    {composerOpen && content && <dialog ref={composerDialog} className="cover-create-dialog" aria-labelledby="cover-create-title" onCancel={event => { event.preventDefault(); if (!busy) setComposerOpen(false); }}>
      <div className="cover-dialog-heading"><div><h2 id="cover-create-title">制作封面</h2><p>当前助手：{assistant} · 可在全局设置中修改</p></div><Button onClick={() => setComposerOpen(false)}>暂时收起</Button></div>
      <div className="cover-create-body">{!assets ? <div className="cover-empty"><p>正在准备模板与照片。</p><Button id="load-cover-assets" disabled={busy || !status?.currentName} onClick={() => void run(refreshAssets)}>读取模板与照片</Button></div> : <>
      <div className="cover-template-pane">
        <div className="cover-field-heading"><h3>模板组</h3><Button theme="borderless" disabled={busy || !status?.currentName} onClick={() => void run(refreshAssets)}>刷新</Button></div><section className="cover-template-browser" aria-label="选择封面模板"><p className="cover-template-selection" role="status">{template && !invalidTemplate ? `已选模板：${template.name}` : '请选择模板组'}</p><ListToolbar search={{label: '搜索封面模板', value: query, change: value => {setQuery(value); setPage(1);}, disabled: busy || blocked, placeholder: '搜索模板名称或风格'}}/>
        <div className="cover-template-filters" role="group" aria-label="模板来源">{[['all', '全部'], ['builtin', '内置'], ['mine', '我的']].map(([value, label]) => <Button key={value} size="small" theme={templateSource === value ? 'solid' : 'borderless'} aria-pressed={templateSource === value} disabled={!enabled} onClick={() => {setTemplateSource(value); setPage(1);}}>{label}</Button>)}</div>
        <ImageList className="cover-template-grid">{visibleTemplates.map(({source, members}) => {const selected = members.some(item => item.id === templateId), item = members.find(item => item.id === templateId) ?? members.find(item => item.id === source.id) ?? members[0]; return <List.Item key={source.id}><div className={`cover-template-choice${selected ? ' is-selected' : ''}`}><TemplatePreview template={item} disabled={!enabled} selected={selected} select={() => chooseTemplate(item.id)} previewLabel="查看整组并选择" preview={() => previewSamples(item.id)}/></div></List.Item>;})}</ImageList>
        {template?.catalogStatus === 'legacy' && <p className="cover-template-legacy">原模板“{template.name}”已停用，本次记录仍保留。请重新选择可用模板。<Button size="small" theme="borderless" onClick={() => setPreview({label: template.name, images: template.samples})}>查看原模板样张</Button></p>}
        {invalidTemplate && <p role="alert">原先选择的模板、版本或样张已变化，请明确选择一个可用模板组。</p>}{!matching.length && <p>没有匹配的模板，换个关键词试试。</p>}<PaginationBar total={matching.length} page={currentTemplatePage} pageSize={templatePageSize} onPageSizeChange={setTemplatePageSize} onPageChange={setPage} disabled={busy || pendingCandidates.has(candidateDraft?.id ?? '') || blocked} label="封面模板分页" pageSizeOpts={[5, 10, 20]}/></section>
      </div><div className="cover-create-settings">
        <div className="cover-content-summary"><label htmlFor="cover-title" className="cover-field-label">封面标题 · {dirty ? '有未保存修改' : '已保存'}</label>{titleEditor ? <><TextArea id="cover-title" aria-label="封面标题" className="semi-control-text" maxLength={500} value={titleEditor.value} disabled={!enabled} onChange={titleEditor.change}/><div className="cover-title-actions"><Button id="cover-save-content" size="small" disabled={titleEditor.saveDisabled} onClick={titleEditor.save}>保存内容</Button></div>{titleEditor.issue && <p role="alert">{titleEditor.issue}</p>}{dirty && <details><summary>当前已保存标题</summary><p>{content.title || '未命名内容'}</p></details>}</> : <h3>{content.title || '未命名内容'}</h3>}<details className="cover-body-details"><summary>已保存正文 · {content.body.length} 字</summary><p>{content.body || '正文为空'}</p></details></div>
        <div className="cover-size-settings"><div className="cover-ratio-field"><label htmlFor={customRatio ? 'cover-custom-ratio' : 'cover-ratio'}>封面比例</label>{customRatio ? <div className="cover-ratio-editor"><Input id="cover-custom-ratio" autoFocus className="semi-control-text" aria-label="自定义封面比例" value={ratioDraft} disabled={!enabled} placeholder="如 2:3 或 21:9" maxLength={25} onChange={value => setRatioDraft(value.trim().replace(/：/g, ":"))} onKeyDown={event => {if (event.nativeEvent.isComposing) return; if (event.key === 'Enter') {event.preventDefault(); if (validRatioDraft) finishRatio(true);} if (event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); finishRatio(false);}}}/><Button size="small" aria-label="应用自定义比例" disabled={!enabled || !validRatioDraft} onClick={() => finishRatio(true)}>应用</Button><Button size="small" theme="borderless" aria-label="取消自定义比例" disabled={!enabled} onClick={() => finishRatio(false)}>取消</Button></div> : <PopupSelect searchable id="cover-ratio" value={ratio} disabled={!enabled} onChange={value => {if (value === 'custom') {setRatioDraft(ratio); setCustomRatio(true);} else setRatio(value); }}>{[...new Set([...ratios, ratio])].map(value => <option key={value} value={value}>{value}</option>)}<option value="custom">自定义</option></PopupSelect>}</div><label htmlFor="cover-count">生成张数<CoverCountInput id="cover-count" value={count} disabled={!enabled} onChange={value => { touched.current.count = true; setCount(value); }} /></label></div>{customRatio && !validRatioDraft ? <p role="alert">请输入宽:高的正整数比例，如 2:3 或 21:9。</p> : pixels ? <p className="cover-size-hint">{ratio} · 至少{pixels.width}×{pixels.height} · PNG原图；实际尺寸以生成结果为准</p> : <p role="alert">此比例无法生成合法尺寸，请重新选择。</p>}
        <div className="cover-setting-section"><div className="cover-person-heading"><h3>本人照片</h3><Button id="no-person" theme={photoId ? 'light' : 'solid'} disabled={!enabled} onClick={() => { touched.current.photo = true; setPhotoId(''); }}>这次不放人物{!photoId ? ' · 已选' : ''}</Button></div><PopupSelect searchable aria-label="选择我的本人照片" id="cover-photo" value={photoId} disabled={!enabled} onChange={value => { touched.current.photo = true; setPhotoId(value); }}><option value="">这次不放人物</option>{invalidPhoto && <option value={photoId} disabled>原照片已失效，请明确重选</option>}{assets.photos.map(photo => <option key={photo.id} value={photo.id} disabled={!photo.isOwnPhoto || photo.availability !== 'available'}>{photo.title}{!photo.isOwnPhoto ? ' · 未声明为本人' : photo.availability === 'unavailable' ? ' · 原图缺失' : ''}</option>)}</PopupSelect>{invalidPhoto && <p role="alert">原照片已失效或不再声明为本人，请重选，或选择“这次不放人物”。</p>}{selectedPhoto?.url && <div className="cover-person-summary"><span className="cover-person-image cover-artwork"><CoverArtwork url={selectedPhoto.url} alt="本次人物参考"/></span><span>{selectedPhoto.title} · 本次人物参考</span><Button size="small" theme="borderless" onClick={() => setPreview({label: selectedPhoto.title || '本次人物参考', images: [{url: selectedPhoto.url ?? ''}]})}>打开原图</Button></div>}<details className="cover-photo-import"><summary>从本机添加本人照片</summary><div className="checkbox"><Checkbox id="own-photo" checked={own} disabled={!enabled} onChange={event => setOwn(!!event.target.checked)} >我确认新导入的照片是本人照片</Checkbox></div><FileDropzone kind="photo" buttonId="choose-photo" disabled={!enabled} run={run} photo={{title: "我的照片", isOwnPhoto: own}} buttonLabel="选择照片文件" onImported={async photo => {if (alive.current) {await refreshAssets(); if (photo.isOwnPhoto) {touched.current.photo = true; setPhotoId(photo.id);} else setNotice("照片已导入，尚未声明为本人。请明确选择可用本人照，或选择这次不放人物。"); setOwn(false);}}}/></details></div>
        <p className="cover-template-selection cover-settings-selection" role="status">{template && !invalidTemplate ? `已选：${template.name} · v${template.version} · ${samples.length} 张样张` : '请选择可用模板组'}</p>
        {!samples.length && template && <p role="alert">请在模板卡中查看整组并选择，至少使用一张风格样张。</p>}
        <details className="cover-advanced" open={invalidCompositionKeys.size > 0 || compositionFailures.size > 0 ? true : undefined}><summary>收藏构图参考（可选） · 已选 {compositionReferences.length} 张{invalidCompositionKeys.size > 0 ? ' · 有失效项' : ''}</summary><CompositionPicker available={availableCompositions} selected={compositionReferences} invalid={new Set([...invalidCompositionKeys, ...compositionFailures])} disabled={!enabled || dirty} refreshToken={refreshToken} change={setCompositionReferences} failed={compositionImageFailed}/></details>
        <details className="cover-advanced" open={invalidMaterialIds.length > 0 ? true : undefined}><summary>补充要求与资料（可选）{invalidMaterialIds.length ? ' · 有失效资料' : ''} · {materialIds.length > 0 ? `已选 ${materialIds.length} 份` : '默认不带资料'}{prompt.trim() && prompt !== defaultCoverPrompt ? ` · 补充：${prompt.trim().slice(0, 80)}${prompt.trim().length > 80 ? '…' : ''}` : ''}</summary><label htmlFor="cover-prompt">补充要求</label><TextArea className="semi-control-text" id="cover-prompt" placeholder="可留空，按标题、正文与所选风格生成" maxLength={10000} value={prompt} disabled={!enabled} onChange={value => setPrompt(value)} /><CoverMaterials materials={materials} selected={materialIds} invalid={invalidMaterialIds} disabled={!enabled || dirty} change={setMaterialIds}/></details>
      </div></>}</div>
      <div className="cover-dialog-footer"><div>{generationPrompt.length > 10000 && <p role="alert">补充要求与收藏构图说明合计 {generationPrompt.length} 字，超过 10000 字。原文已保留，请缩短补充要求或取消收藏构图参考后再生成。</p>}{dirty ? <p role="alert">请先保存标题与正文后继续；收起窗口会保留草稿与设置。</p> : liveJob ? <p>已有一批任务，可收起窗口后继续；接单与进度以助手回写为准。</p> : blocked ? <p role="alert">请收起窗口，先处理工作台中的恢复提示。</p> : <p>使用已保存的内容和本次选择。收起窗口会保留设置。</p>}<span>请到 {assistant} 选择模型并手动发送，完成后回这里选图。{assistant === 'WorkBuddy' ? '原图可能包含助手平台标识。' : ''}</span>{notice && <p role="status">{notice}</p>}</div><Button id="generate-cover" theme="solid" disabled={generationDisabled} onClick={() => void run(generate)}>去 {assistant} 生成封面</Button></div>
    </dialog>}
    {comparing && currentCover && <ManagementDialog title="并排比较封面" busy={busy} dirty={false} close={() => setComparing(false)}><p>每张原图完整显示，可直接选用或收藏。最多比较 4 张。</p><div className="cover-compare-grid" style={{gridTemplateColumns: `repeat(${Math.max(2, compareCandidates.length)}, minmax(200px, 1fr))`}}>{compareCandidates.map(candidate => { const details = candidateMetadata.get(candidate.id), selected = currentCover.selectedCandidateId === candidate.id; return <article key={candidate.id}><Button theme="borderless" className="cover-compare-image cover-artwork" aria-label={`放大比较候选 ${details?.displayNumber || candidateNumbers.get(candidate.id)}`} onClick={() => setPreviewCandidateId(candidate.id)}><CoverArtwork url={candidate.url} alt={candidate.originalName}/></Button><strong>候选 {details?.displayNumber || candidateNumbers.get(candidate.id)}</strong>{candidateActions(candidate)}{details?.note && <p>{details.note}</p>}</article>; })}</div></ManagementDialog>}
    {annotationDraft && content && <CoverAnnotationEditor candidate={annotationDraft} busy={busy || pendingCandidates.has(annotationDraft.id)} disabled={!enabled || dirty} refinementDisabled={refinementDisabled} refinementPrompt={refinementPrompt} assistant={assistant} referenceSummary={`本次模板：${template?.name || '未选择可用模板'}（${samples.length} 张样张）；人物参考：${photoId ? selectedPhoto?.title || '原照片不可用' : '这次不放人物'}；收藏构图参考：${compositionReferences.length} 张；补充资料：${materialIds.length} 份；额外要求：${prompt.trim() && prompt !== defaultCoverPrompt ? '有' : '无'}；比例：${refinementRatio}。需要更换模板或照片时，先收起批注，在“再生成一批”中调整设置。`} close={() => setAnnotationDraft(null)} save={async note => { await saveCandidate({...annotationDraft, note}); setAnnotationDraft(null); }} refine={refineCandidate} run={runCandidate}/>}
    {candidateDraft && content && <ManagementDialog title="候选备注与信息" busy={busy || pendingCandidates.has(candidateDraft.id)} close={() => setCandidateDraft(null)}><form className="management-form" onSubmit={event => {
      event.preventDefault();
      void runCandidate(() => saveCandidate(candidateDraft, true));
    }}><fieldset disabled={busy || pendingCandidates.has(candidateDraft?.id ?? '') || blocked}><div className="checkbox"><Checkbox disabled={busy || pendingCandidates.has(candidateDraft?.id ?? '') || blocked} checked={candidateDraft.favorite} onChange={event => setCandidateDraft({ ...candidateDraft, favorite: !!event.target.checked })} >收藏这张候选</Checkbox></div><label>展示编号<Input className="semi-control-text" disabled={busy || pendingCandidates.has(candidateDraft?.id ?? '') || blocked} maxLength={500} value={candidateDraft.displayNumber} onChange={(_, event) => setCandidateDraft({ ...candidateDraft, displayNumber: event.target.value })} /></label><label>备注<TextArea className="semi-control-text" disabled={busy || pendingCandidates.has(candidateDraft?.id ?? '') || blocked} maxLength={10000} value={candidateDraft.note} onChange={value => setCandidateDraft({ ...candidateDraft, note: value })} /></label><label>所属封面版本<PopupSelect searchable disabled={busy || pendingCandidates.has(candidateDraft?.id ?? '') || blocked} value={candidateDraft.variantId ?? ''} onChange={value => setCandidateDraft({ ...candidateDraft, variantId: value || null })}><option value="">不指定版本</option>{candidateDraft.variantId && !metadata?.coverVariants.some(item => item.id === candidateDraft.variantId) && <option value={candidateDraft.variantId} disabled>原版本已不可用，请重新选择</option>}{metadata?.coverVariants.map(item => <option key={item.id} value={item.id}>{item.name} · {item.ratio}</option>)}</PopupSelect></label></fieldset><Button htmlType="submit" theme="solid" disabled={!enabled || pendingCandidates.has(candidateDraft.id) || dirty}>保存候选信息</Button></form></ManagementDialog>}
    {enlarged && <CoverImageViewer url={enlarged.url} label={`封面候选 ${candidateMetadata.get(enlarged.id)?.displayNumber || candidateNumbers.get(enlarged.id)}`} close={() => setPreviewCandidateId(null)} previous={enlargedIndex > 0 ? () => setPreviewCandidateId(previewCandidates[enlargedIndex - 1].id) : undefined} next={enlargedIndex >= 0 && enlargedIndex < previewCandidates.length - 1 ? () => setPreviewCandidateId(previewCandidates[enlargedIndex + 1].id) : undefined}>{candidateActions(enlarged)}<Button disabled={!enabled || pendingCandidates.has(enlarged.id) || dirty || hasCandidateDraft} onClick={() => editCandidate(enlarged.id)}>备注与信息</Button>{candidateMetadata.get(enlarged.id)?.note && <p>{candidateMetadata.get(enlarged.id)?.note}</p>}</CoverImageViewer>}
    {preview && !preview.selection && preview.images.length === 1 ? <CoverImageViewer url={preview.images[0].url} label={preview.label} close={closePreview}/> : preview && <dialog ref={previewDialog} className={`image-preview${preview.selection ? ' cover-sample-preview' : ''}`} onKeyDown={event => {if (event.key === 'Escape' && !event.defaultPrevented && !event.nativeEvent.isComposing) {event.preventDefault(); event.stopPropagation(); closePreview();}}} onCancel={event => {event.preventDefault(); event.stopPropagation(); requestAnimationFrame(closePreview);}} aria-label={preview.label}><div className="dialog-heading"><div><h3>{preview.label}</h3>{preview.selection && <p role="status">本次已选 {preview.selection.hashes.length} / {preview.images.length} 张 · 应用后用于当前封面</p>}</div><Button onClick={closePreview}>关闭预览</Button></div>{preview.selection && <>{previewGroup.length > 1 && <label className="cover-template-versions">源模板或工作版本<PopupSelect searchable aria-label="样张预览的模板版本" value={preview.selection.id} disabled={!enabled} onChange={previewSamples}>{previewGroup.map(member => <option key={member.id} value={member.id}>{member.name} · v{member.version}</option>)}</PopupSelect></label>}<p className="cover-sample-description">{previewTemplate?.description}</p></>}<div className="preview-grid">{preview.images.map((image, index) => preview.selection ? <div key={image.assetHash} className="cover-sample-option"><ImagePreviewButton url={image.url} label={`${preview.label} 样张 ${index + 1}`} loading="lazy"/><Checkbox disabled={!enabled || invalidPreview} aria-label={`使用样张 ${index + 1}`} checked={preview.selection.hashes.includes(image.assetHash!)} onChange={event => setPreview(old => old?.selection ? {...old, selection: {...old.selection, hashes: event.target.checked ? [...old.selection.hashes, image.assetHash!] : old.selection.hashes.filter(hash => hash !== image.assetHash)}} : old)}>样张 {index + 1}</Checkbox></div> : <ImagePreviewButton key={index} url={image.url} label={`${preview.label} ${index + 1}`}/>)}</div>{preview.selection && <div className="cover-sample-footer"><div>{invalidPreview ? <p role="alert">模板版本或样张已变化，请关闭后重新选择可用模板。</p> : !preview.selection.hashes.length ? <p role="alert">请至少选择一张风格样张。</p> : <p>仅用于本次封面；关闭或 Esc 保留原选择。</p>}</div><Button theme="solid" disabled={!enabled || invalidPreview || !preview.selection.hashes.length} onClick={() => {if (!preview.selection || invalidPreview || !preview.selection.hashes.length) return; chooseTemplate(preview.selection.id); setSamples([...preview.selection.hashes]); closePreview();}}>使用所选样张</Button></div>}</dialog>}
    <p id="cover-notice" role="status" aria-live="polite">{notice}</p>
  </section>;
}
