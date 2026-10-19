import {FileDropzone} from './file-dropzone.tsx';
import { useEffect, useRef, useState } from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import TextArea from '@douyinfe/semi-ui-19/lib/es/input/textarea';
import Checkbox from '@douyinfe/semi-ui-19/lib/es/checkbox';
import Input from '@douyinfe/semi-ui-19/lib/es/input';
import { invoke } from './client.ts';
import {coverCandidateGroups, ratioPixels} from './cover-gallery.ts';
import {ManagementDialog, materialSize, materialType} from './library-panels.tsx';
import {PopupSelect, CoverCountInput} from './semi-controls.tsx';
import {CoverAnnotationEditor} from './cover-annotation.tsx';
import './cover-workspace.css';
import type { Attempt, CoverView, CoverHandoff, CoverResults, CoverReference } from '../shared/cover-contracts.ts';
import type { Content, Status } from '../shared/contracts.ts';
import type { WorkspaceLibrarySnapshot, WorkspaceContentDetails, WorkspaceCandidate } from '../shared/workspace-contracts.ts';
interface Props { startOpenKey?: number; library?: WorkspaceLibrarySnapshot | null; refresh?(): Promise<void>; selectedTemplate?: {id: string; key: number} | null; status: Status | null; content: Content | null; dirty: boolean; busy: boolean; blocked: boolean; refreshToken: number; readAutomatically(contentId: string): Promise<{assets: CoverResults['listCoverAssets']; cover: CoverView} | undefined>; run<T>(action: () => Promise<T>): Promise<T | undefined>; onContent(content: Content): void }
const attemptLabels: Record<Attempt['status'], string> = { created: '待接单', claimed: '已接单', committed: '已入库', failed: '失败', cancelled: '已取消', superseded: '已替换' };
const launchNotice = '已请求系统打开助手。请在助手中确认执行；接单与结果将显示在这里。';
function CoverArtwork({url, alt}: {url: string; alt: string}) {
  return <><img className="cover-artwork-backdrop" src={url} alt="" aria-hidden="true" loading="lazy"/><img className="cover-artwork-original" src={url} alt={alt} loading="lazy"/></>;
}
function CoverMaterials({materials, selected, invalid, disabled, change}: {materials: WorkspaceContentDetails['materials']; selected: string[]; invalid: string[]; disabled: boolean; change(ids: string[]): void}) {
  return <fieldset className="cover-materials" disabled={disabled}><legend>本次封面要参考的内容资料（可选）</legend><p>默认不带资料。只有你在这里明确勾选的文件，才会进入本次请求；请先确认资料适合交给当前助手使用。</p>{materials.filter(item => !item.deletedAt).map(item => <div key={item.id} className="checkbox"><Checkbox checked={selected.includes(item.id)} disabled={disabled || item.availability !== 'available' && !selected.includes(item.id)} onChange={event => change(event.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id))}><span>{item.originalName || '未命名资料'}<span className="material-detail">{materialType(item.detectedType)} · {materialSize(item.bytes)} · {item.availability === 'available' ? '可用' : '原资料缺失，无法使用'}</span></span></Checkbox></div>)}{!materials.some(item => !item.deletedAt) && <p>还没有资料，可先在“内容资料附件”中添加，也可以不带资料继续。</p>}{invalid.length > 0 && <div role="alert"><p>已选的 {invalid.length} 份资料已被移除或不可用，请明确取消失效选择，或重新添加后勾选。</p><Button disabled={disabled} onClick={() => change(selected.filter(id => !invalid.includes(id)))}>取消失效资料的选择</Button></div>}<p>本次已选 {selected.length} 份资料。</p></fieldset>;
}
export function CoverPanel({ startOpenKey, library, refresh: refreshWorkspace, selectedTemplate, status, content, dirty, busy, blocked, refreshToken, readAutomatically, run, onContent }: Props) {
  const [assets, setAssets] = useState<CoverResults['listCoverAssets'] | null>(null);
  const [cover, setCover] = useState<CoverView | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [samples, setSamples] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [photoId, setPhotoId] = useState('');
  const [materialIds, setMaterialIds] = useState<string[]>([]);
  const [own, setOwn] = useState(false);
  const [count, setCount] = useState(1);
  const [ratio, setRatio] = useState('3:4');
  const [customRatio, setCustomRatio] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [annotationDraft, setAnnotationDraft] = useState<(WorkspaceCandidate & {editToken: string; url: string}) | null>(null);
  const [prompt, setPrompt] = useState('根据当前标题与正文创作封面，参考所选风格；不要照抄样张文案或加入未经核实的事实。');
  const [notice, setNotice] = useState('');
  const [metadata, setMetadata] = useState<WorkspaceContentDetails | null>(null);
  const [candidateDraft, setCandidateDraft] = useState<(WorkspaceCandidate & {editToken: string}) | null>(null);
  const hasCandidateDraft = !!candidateDraft || !!annotationDraft;
  const [composerOpen, setComposerOpen] = useState(false);
  const composerDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (startOpenKey) setComposerOpen(true); }, [startOpenKey]);
  useEffect(() => { if (composerOpen && composerDialog.current && !composerDialog.current.open) composerDialog.current.showModal(); }, [composerOpen, content?.id]);
  useEffect(() => { setMetadata(library?.contentDetails.find(item => item.id === content?.id) ?? null); }, [library, content?.id]);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [preview, setPreview] = useState<{ label: string; images: { url: string }[] } | null>(null);
  const previewDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (preview && previewDialog.current && !previewDialog.current.open) previewDialog.current.showModal(); }, [preview]);
  const template = assets?.templates.find(t => t.id === templateId);
  const templateMetadata = library?.templates.find(item => item.id === templateId);
  const previewSample = template?.samples.find(sample => samples.includes(sample.assetHash));
  const invalidTemplate = !!templateId && (!template || !!templateMetadata?.deletedAt);
  const selectedPhoto = assets?.photos.find(p => p.id === photoId);
  const photoMetadata = library?.photos.find(item => item.id === photoId);
  const invalidPhoto = !!photoId && (!selectedPhoto || !selectedPhoto.isOwnPhoto || selectedPhoto.availability !== 'available' || !selectedPhoto.assetHash || !!photoMetadata && (!!photoMetadata.deletedAt || !photoMetadata.isOwnPhoto || photoMetadata.availability !== 'available' || photoMetadata.assetHash !== selectedPhoto.assetHash));
  const materials = library?.contentDetails.find(item => item.id === content?.id)?.materials ?? [];
  const invalidMaterialIds = materialIds.filter(id => !materials.some(item => item.id === id && !item.deletedAt && item.availability === 'available' && !!item.assetHash));
  const apply = (next: CoverView) => { if (!alive.current || next.content.id !== content?.id) return; setCover(next); onContent(next.content); };
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
  const initialized = useRef<string | null>(null);
  const touched = useRef({ template: false, photo: false, count: false });
  useEffect(() => {
    initialized.current = null;
    touched.current = { template: false, photo: false, count: false };
    setTemplateId(''); setSamples([]); setPhotoId(''); setMaterialIds([]); setCount(1); setRatio('3:4'); setCustomRatio(false); setCompareIds([]); setComparing(false); setOnlyFavorites(false); setAnnotationDraft(null); setCandidateDraft(null); setCover(null); setNotice('');
  }, [content?.id]);
  useEffect(() => {
    // A supplied null snapshot is still loading; an omitted prop keeps the standalone panel usable.
    if (!assets || !content || library === null || initialized.current === content.id) return;
    initialized.current = content.id;
    if (!touched.current.template) {
      const preferred = selectedTemplate?.id ?? library?.contentDetails.find(item => item.id === content.id)?.preferredTemplateId ?? library?.settings.defaults.templateId ?? assets.templates[0]?.id ?? '';
      const selected = assets.templates.find(item => item.id === preferred);
      setTemplateId(preferred); setSamples(selected?.samples.map(item => item.assetHash) ?? []);
    }
    if (!touched.current.photo) setPhotoId(library?.settings.defaults.photoId ?? '');
    if (!touched.current.count) setCount(library?.settings.defaults.coverCount ?? 1);
  }, [assets, library, content?.id, selectedTemplate?.id]);
  const appliedSelection = useRef<number | null>(null);
  useEffect(() => {
    if (!selectedTemplate || !assets || appliedSelection.current === selectedTemplate.key) return;
    const next = assets.templates.find(template => template.id === selectedTemplate.id);
    if (next) { appliedSelection.current = selectedTemplate.key; touched.current.template = true; setTemplateId(next.id); setSamples(next.samples.map(sample => sample.assetHash)); }
  }, [selectedTemplate?.id, selectedTemplate?.key, assets]);
  const enabled = !!status?.currentName && !busy && !blocked;
  const matching = assets?.templates.filter(t => `${t.name} ${t.description}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  const pages = Math.max(1, Math.ceil(matching.length / 6));
  const visibleTemplates = matching.slice(Math.min(page, pages - 1) * 6, (Math.min(page, pages - 1) + 1) * 6);
  function chooseTemplate(id: string) { const next = assets?.templates.find(t => t.id === id); if (next) { touched.current.template = true; setTemplateId(id); setSamples(next.samples.map(r => r.assetHash)); } }
  const ratios = [...new Set(['3:4', '1:1', '16:9', ...(library?.settings.customRatios ?? [])])];
  const pixels = ratioPixels(ratio);
  const assistant = status?.assistant === 'workbuddy' ? 'WorkBuddy' : 'Codex';
  const currentCover = cover?.content.id === content?.id ? cover : null;
  const jobs = [...(currentCover?.jobs ?? [])].reverse();
  const favoriteIds = new Set(metadata?.candidates.filter(item => item.favorite).map(item => item.id) ?? []);
  const candidateGroups = currentCover ? coverCandidateGroups(currentCover, favoriteIds, onlyFavorites) : [];
  const candidateBatches = new Map(currentCover ? coverCandidateGroups(currentCover).flatMap(group => group.candidates.map(candidate => [candidate.id, group.batchNumber ? `第${group.batchNumber}批` : "历史"] as const)) : []);
  const compareCandidates = currentCover?.candidates.filter(item => compareIds.includes(item.id)) ?? [];
  const liveJob = jobs.find(job => job.attempts.some(attempt => attempt.attemptId === job.activeAttemptId && ['created', 'claimed'].includes(attempt.status)));
  const liveAttempt = liveJob?.attempts.find(attempt => attempt.attemptId === liveJob.activeAttemptId);
  useEffect(() => { if (!liveAttempt && notice === launchNotice) setNotice(''); }, [liveAttempt, notice]);
  const liveReference: CoverReference | null = currentCover && liveJob && liveAttempt ? { contentId: currentCover.content.id, requestId: liveJob.id, attemptId: liveAttempt.attemptId } : null;
  const selectedCandidate = currentCover?.candidates.find(candidate => candidate.id === currentCover.selectedCandidateId);
  async function saveCandidate(draft: WorkspaceCandidate & {editToken: string}, closeDraft = false) {
    if (!content) return;
    const result = await invoke('mutateWorkspace', { op: 'updateCandidate', kind: 'content', id: content.id, editToken: draft.editToken, candidateId: draft.id, favorite: draft.favorite, displayNumber: draft.displayNumber, note: draft.note, variantId: draft.variantId });
    if (!alive.current) return;
    const nextMetadata = result.library.contentDetails.find(item => item.id === content.id) ?? null;
    setMetadata(nextMetadata);
    if (nextMetadata) setAnnotationDraft(old => old?.id === draft.id ? {...old, note: draft.note, editToken: nextMetadata.editToken} : old);
    if (closeDraft) setCandidateDraft(null); setNotice('候选信息已保存。');
    const nextCover = await invoke('readCover', { contentId: content.id }); apply(nextCover); await refreshWorkspace?.();
    return nextCover;
  }
  const annotationCandidate = currentCover?.candidates.find(item => item.id === annotationDraft?.id);
  const annotationSummary = currentCover?.jobs.find(job => job.id === annotationCandidate?.requestId)?.summary;
  const refinementRatio = annotationSummary?.ratio ?? ratio;
  const refinementPixels = annotationSummary?.pixels ?? ratioPixels(refinementRatio);
  const refinementDisabled = !!liveJob || !!content?.deletedAt || !template || invalidTemplate || invalidPhoto || !samples.length || !refinementPixels;
  async function refineCandidate(note: string) {
    if (!content || !annotationDraft || !annotationCandidate || !template || refinementDisabled) return;
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
    await openCoverTask(() => invoke('generateCover', {contentId: content.id, editToken: referenceEditToken, input: {template: {id: template.id, version: template.version}, styleAssetHashes: samples, photo: photoId ? {id: selectedPhoto!.id, assetHash: selectedPhoto!.assetHash!} : null, materialIds: [material.id], prompt: `以所附候选原图（${annotationCandidate.id}）为基础，按以下批注修改；保持未要求修改的内容与布局。位置从原图左上角起按宽、高百分比定位。\n${note}`, pixels: refinementPixels!, sizePolicy: annotationSummary?.sizePolicy ?? 'ratio-minimum', ratio: refinementRatio, count: 1, outputFormat: 'png', scope: 'cover-only'}}));
    if (alive.current) setAnnotationDraft(null);
    await refreshWorkspace?.();
  }
  const generationDisabled = !enabled || dirty || hasCandidateDraft || !currentCover || !content || !!content.deletedAt || !!liveJob || !template || invalidTemplate || !pixels || invalidPhoto || invalidMaterialIds.length > 0 || !samples.length || !Number.isInteger(count) || count < 1 || count > 20 || !prompt.trim();
  async function generate() {
    if (!content || generationDisabled || !template) return;
    if (invalidPhoto) throw Object.assign(new Error('所选照片已失效，请明确重选或选择这次不放人物。'), { code: 'PHOTO_SELECTION_INVALID' });
    if (invalidMaterialIds.length) throw Object.assign(new Error('所选资料已失效，请取消失效选择或重新添加后勾选。'), { code: 'MATERIAL_SELECTION_INVALID' });
    if (!pixels) throw Object.assign(new Error('封面比例无法生成合法的整数尺寸，请重新选择。'), { code: 'INVALID_INPUT' });
    await openCoverTask(() => invoke('generateCover', { contentId: content.id, editToken: content.editToken, input: { template: { id: template.id, version: template.version }, styleAssetHashes: samples, photo: photoId ? { id: selectedPhoto!.id, assetHash: selectedPhoto!.assetHash! } : null, materialIds, prompt, pixels, sizePolicy: 'ratio-minimum', ratio, count, outputFormat: 'png', scope: 'cover-only' } }));
  }
  return <section className="cover-panel cover-workspace" aria-label="封面作品">
    <div className="cover-workspace-heading"><div><h3>封面作品</h3><p>{content && !currentCover ? '正在读取这篇内容的封面作品…' : currentCover?.candidates.length ? `共 ${currentCover.candidates.length} 张候选，按批次保留。${selectedCandidate ? '已选好本篇封面。' : '选一张用作本篇封面。'}` : '选好风格，生成的封面会回到这里。'}</p></div><div className="cover-toolbar"><Button id="open-cover-folder" disabled={busy || !status?.currentName || !currentCover?.candidates.length} title="选择保存位置后，将全部候选原图导出到独立新文件夹并打开；不会覆盖已有文件" onClick={() => void run(async () => { const result = await invoke('revealCoverFolder', {contentId: currentCover!.content.id}); if (alive.current) setNotice(result.revealed ? "全部候选原图已导出到独立新文件夹，并请求系统打开；已有文件不会覆盖。" : "已取消选择保存位置，原图仍保留在内容库中。"); })}>打开原图文件夹</Button><Button id="refresh-cover" disabled={busy || !status?.currentName || !content} onClick={() => void run(refresh)}>刷新结果</Button><Button theme="solid" disabled={!enabled || !currentCover || !content || !!content.deletedAt || !!liveJob} onClick={() => {setNotice(''); setComposerOpen(true);}}>{currentCover?.candidates.length ? '再生成一批' : '制作封面'}</Button></div></div>
    {!content && <div className="cover-empty"><h4>先准备一篇内容</h4><p>保存标题与正文后，就可以为它制作封面。</p></div>}
    {liveJob && liveAttempt && liveReference && <div className="cover-live-job" id="cover-jobs"><div><span className="cover-state">{liveAttempt.status === 'claimed' ? '助手正在制作' : '等待助手接单'}</span><h4>{liveJob.summary ? `${liveJob.summary.count} 张封面 · ${liveJob.summary.ratio}` : '这次封面正在准备'}</h4><p>请在助手中确认执行。完成后回到这里刷新结果。</p>{liveAttempt.failure && <p role="alert">{liveAttempt.failure.message}</p>}</div><div className="cover-toolbar"><Button id="continue-cover" theme="solid" disabled={!enabled || dirty} onClick={() => void run(() => openCoverTask(async () => { await invoke('continueCover', liveReference); return { ...await invoke('readCover', { contentId: liveReference.contentId }), launchRequested: true }; }))}>去 {assistant} 继续</Button><Button disabled={!enabled || dirty} onClick={() => void run(async () => apply(await invoke('cancelCover', liveReference)))}>取消这次生成</Button></div></div>}
    {selectedCandidate && <div className="cover-selected"><button type="button" className="cover-selected-preview cover-artwork" onClick={() => setPreview({ label: '当前选用封面', images: [selectedCandidate] })}><CoverArtwork url={selectedCandidate.url} alt="当前选用封面"/></button><div><span className="cover-state">当前选用</span><h4>{content?.title}</h4></div><Button size="small" disabled={busy || !status?.currentName} onClick={() => void run(async () => { const result = await invoke('exportCover', { contentId: currentCover!.content.id, candidateId: selectedCandidate.id }); if (result.exported && alive.current) setNotice('封面原图已下载到所选位置。'); })}>下载原图</Button></div>}
    {content && !currentCover?.candidates.length && <div className="cover-empty"><span className="cover-empty-mark" aria-hidden="true">▧</span><h4>{!currentCover ? '正在读取封面作品…' : liveJob ? '封面制作中' : '你的第一张封面，从这里开始'}</h4><p>{!currentCover ? '原有候选和选用状态会在读取后显示。' : liveJob ? '通过校验的图片会出现在这里。' : '选择一组模板，也可以加入本人照片，一次生成多张候选。'}</p></div>}
    {!!currentCover?.candidates.length && <div className="cover-gallery-toolbar"><div className="checkbox"><Checkbox checked={onlyFavorites} onChange={event => setOnlyFavorites(!!event.target.checked)}>只看收藏</Checkbox></div><span>收藏优先 · 已勾选 {compareCandidates.length} / 4 张</span><Button disabled={compareCandidates.length < 2 || compareCandidates.length > 4} onClick={() => setComparing(true)}>并排比较（{compareCandidates.length}）</Button>{compareIds.length > 0 && <Button theme="borderless" onClick={() => setCompareIds([])}>清空勾选</Button>}</div>}
    {onlyFavorites && !candidateGroups.length && <p className="cover-filter-empty">还没有收藏的封面。取消“只看收藏”后，可从候选中收藏。</p>}
    <div id="cover-candidates" className="cover-result-groups">{currentCover && candidateGroups.map(({key, job, attempt, candidates, batchNumber, latest, label}) => {
      const summary = job?.summary, templateName = summary && assets?.templates.find(item => item.id === summary.template.id)?.name;
      return <section key={key} className="cover-result-group" aria-label={label || (attempt ? `第 ${batchNumber} 批封面` : '历史候选')}>
        <div className="cover-batch-heading"><div><h4>{label || (attempt ? `第 ${batchNumber} 批` : '历史候选')}<span className="cover-batch-count">{candidates.length} 张</span>{latest && <span className="cover-batch-latest">最近生成</span>}</h4><p>{attempt ? [templateName || '原模板', summary?.ratio, summary ? summary.hasOwnPhoto ? '本人照片' : '不放人物' : '', attempt.host === 'workbuddy' ? 'WorkBuddy' : 'Codex'].filter(Boolean).join(' · ') : label ? '收藏的候选会集中显示，原图与生成批次继续保留' : '原生成设置未记录，候选完整保留'}</p></div></div>
        <div className="cover-result-grid">{candidates.map(candidate => {
          const details = metadata?.candidates.find(item => item.id === candidate.id), selected = currentCover.selectedCandidateId === candidate.id;
          const number = details?.displayNumber || String(currentCover.candidates.findIndex(item => item.id === candidate.id) + 1).padStart(2, '0');
          return <article key={candidate.id} title={`${candidateBatches.get(candidate.id) ?? "历史"} · 候选 ${number}`} className={`cover-result-card${selected ? ' is-selected' : ''}`}>
            <button type="button" className="cover-result-image cover-artwork" aria-label={`放大候选 ${number}`} onClick={() => setPreview({ label: `封面候选 ${number}`, images: [candidate] })}>
              <CoverArtwork url={candidate.url} alt={candidate.originalName || `封面候选 ${number}`}/>
              <span className="cover-candidate-number"><span>{number}</span><small>{candidateBatches.get(candidate.id)}</small></span><span className="cover-result-badges">{selected && <span>已选定</span>}{details?.favorite && <span>已收藏</span>}</span>
            </button>
            <div className="cover-result-caption"><div className="cover-card-title"><strong>候选 {number}</strong><div className="cover-card-tools"><div className="checkbox"><Checkbox aria-label={`比较候选 ${number}`} checked={compareIds.includes(candidate.id)} disabled={compareIds.length >= 4 && !compareIds.includes(candidate.id)} onChange={event => setCompareIds(old => event.target.checked ? [...old, candidate.id] : old.filter(id => id !== candidate.id))}>比较</Checkbox></div><Button size="small" theme="borderless" aria-label="候选备注与信息" title={hasCandidateDraft ? "请先保存或放弃正在填写的备注" : "备注与信息"} disabled={!enabled || dirty || !details || !metadata || hasCandidateDraft} onClick={() => { if (details && metadata && !hasCandidateDraft) setCandidateDraft({...details, editToken: metadata.editToken}); }}>⋯</Button></div></div>{details?.note && <p title={details.note}>{details.note}</p>}
              <div className="cover-result-actions">
                <Button size="small" aria-label={selected ? "当前封面" : "选为封面"} theme={selected ? 'light' : 'solid'} disabled={!enabled || dirty || hasCandidateDraft || selected} onClick={() => void run(async () => apply(await invoke('selectCover', { contentId: currentCover.content.id, candidateId: candidate.id, editToken: currentCover.content.editToken })))}>{selected ? '已选' : '选用'}</Button>
                <Button size="small" theme="borderless" disabled={!enabled || dirty || !details || !metadata || hasCandidateDraft} onClick={() => { if (details && metadata) setAnnotationDraft({...details, url: candidate.url, editToken: metadata.editToken}); }}>批注</Button>
                <Button size="small" theme="borderless" aria-pressed={details?.favorite ?? false} title={hasCandidateDraft ? '请先保存或放弃正在填写的备注，再修改收藏' : undefined} disabled={!enabled || dirty || !details || !metadata || hasCandidateDraft} onClick={() => { if (details && metadata && !hasCandidateDraft) void run(() => saveCandidate({...details, favorite: !details.favorite, editToken: metadata.editToken})); }}>收藏</Button>
                <Button size="small" theme="borderless" disabled={busy || !status?.currentName} onClick={() => void run(async () => { const result = await invoke('exportCover', { contentId: currentCover.content.id, candidateId: candidate.id }); if (result.exported && alive.current) setNotice('封面原图已下载到所选位置。'); })}>下载</Button>
              </div>
            </div>
          </article>;
        })}</div>
      </section>;
    })}</div>
    {jobs.length > 0 && <details className="cover-history"><summary>生成记录（{jobs.length} 组设置）</summary>{jobs.map((job, index) => {
      const latest = job.attempts.find(attempt => attempt.attemptId === job.activeAttemptId) ?? job.attempts.at(-1);
      const reference: CoverReference | null = currentCover && latest ? { contentId: currentCover.content.id, requestId: job.id, attemptId: latest.attemptId } : null;
      const live = !!latest && ['created', 'claimed'].includes(latest.status);
      const summary = job.summary;
      const templateName = summary && assets?.templates.find(item => item.id === summary.template.id)?.name;
      return <div key={job.id} className="cover-history-row"><div><strong>{index === 0 ? '最近一组设置' : `第 ${jobs.length - index} 组设置`} · {latest ? attemptLabels[latest.status] : '准备未完成'}</strong>{summary ? <p>{templateName || '原模板'} · 版本 {summary.template.version} · {summary.styleSampleCount} 张样张 · {summary.hasOwnPhoto ? '含本人照' : '不放人物'} · {summary.count} 张 · {summary.ratio} · {summary.sizePolicy === 'ratio-minimum' ? '至少' : '精确'}{summary.pixels.width}×{summary.pixels.height}{summary.sizePolicy === 'ratio-minimum' ? '；实际尺寸以生成结果为准' : ''}</p> : <p>原输入摘要暂不可用，任务与候选仍保留。</p>}{latest?.failure && <p role="alert">{latest.failure.message}</p>}<details><summary>查看尝试记录（{job.attempts.length}）</summary>{job.attempts.map(attempt => <p key={attempt.attemptId}>{attempt.attemptId === job.activeAttemptId ? '当前尝试' : '历史尝试'} · {attempt.host === 'workbuddy' ? 'WorkBuddy' : 'Codex'} · {attemptLabels[attempt.status]}{attempt.failure ? ` · ${attempt.failure.message}` : ''}</p>)}</details></div>{reference && !live && <Button disabled={!enabled || dirty || hasCandidateDraft || !!liveJob} onClick={() => void run(() => openCoverTask(() => invoke('retryCover', reference)))}>按这组设置重做</Button>}</div>;
    })}</details>}
    {composerOpen && content && <dialog ref={composerDialog} className="cover-create-dialog" aria-labelledby="cover-create-title" onCancel={event => { event.preventDefault(); if (!busy) setComposerOpen(false); }}>
      <div className="cover-dialog-heading"><div><h2 id="cover-create-title">制作封面</h2><p>当前助手：{assistant} · 可在全局设置中修改</p></div><Button onClick={() => setComposerOpen(false)}>暂时收起</Button></div>
      <div className="cover-create-body"><aside className="cover-creation-preview"><span className="cover-field-label">{template?.name || '所选风格'}{template ? ` · ${samples.length} 张参考` : ''}</span><div className="cover-style-preview cover-artwork">{previewSample ? <CoverArtwork url={previewSample.url} alt={`${template?.name ?? '所选模板'}风格参考，非生成结果`}/> : <p>选择模板后在这里查看风格样张</p>}</div><div className="cover-content-summary"><span className="cover-field-label">本篇内容</span><h3>{content.title || '未命名内容'}</h3><p>{content.body ? content.body.slice(0, 240) + (content.body.length > 240 ? '…' : '') : '正文为空'}</p><span>直接使用已保存的标题与正文</span></div>{selectedPhoto?.url && <div className="cover-person-summary"><img src={selectedPhoto.url} alt="本次人物参考"/><span>本次人物参考</span></div>}<p className="cover-preview-note">样张只参考风格，生成结果会回到封面作品中。</p></aside>
      <div className="cover-create-settings">{!assets ? <div className="cover-empty"><p>正在准备模板与照片。</p><Button id="load-cover-assets" disabled={busy || !status?.currentName} onClick={() => void run(refreshAssets)}>读取模板与照片</Button></div> : <>
        <div className="cover-field-heading"><h3>模板组</h3><Button theme="borderless" disabled={busy || !status?.currentName} onClick={() => void run(refreshAssets)}>刷新</Button></div><details className="cover-template-browser" open={!template || invalidTemplate ? true : undefined}><summary>{template && !invalidTemplate ? `更换模板组 · ${template.name}` : '选择模板组'}</summary><Input className="semi-control-text" disabled={busy || blocked} id="template-search" type="search" aria-label="搜索封面模板" value={query} onChange={value => { setQuery(value); setPage(0); }} placeholder="搜索模板名称或风格" />
        <div className="cover-template-grid">{visibleTemplates.map(item => <button key={item.id} className={`cover-template-choice${item.id === templateId ? ' is-selected' : ''}`} type="button" disabled={!enabled} aria-pressed={item.id === templateId} onClick={() => chooseTemplate(item.id)}><span className="cover-template-art cover-artwork">{item.samples[0] ? <CoverArtwork url={item.samples[0].url} alt={`${item.name}模板预览`}/> : <span className="cover-template-missing">暂无样张</span>}</span><strong>{item.name}</strong><span>{item.samples.length} 张样张 · {item.builtin ? '内置' : item.accepted && item.aiTested ? '已验收' : '我的模板'}</span></button>)}</div>
        {invalidTemplate && <p role="alert">原先选择的模板已不可用，请明确选择一个可用模板组。</p>}{!matching.length && <p>没有匹配的模板，换个关键词试试。</p>}{pages > 1 && <div className="cover-template-pages"><Button disabled={page === 0} onClick={() => setPage(old => old - 1)}>上一页</Button><span>{Math.min(page + 1, pages)} / {pages}</span><Button disabled={page >= pages - 1} onClick={() => setPage(old => old + 1)}>下一页</Button></div>}</details>
        {template && <details className="cover-style-details"><summary>整组样张 · 已选 {samples.length} / {template.samples.length} 张</summary><p>{template.description}</p><div className="cover-sample-grid">{template.samples.map((sample, index) => <div key={sample.assetHash} className="cover-sample"><Checkbox disabled={!enabled} checked={samples.includes(sample.assetHash)} onChange={event => setSamples(old => event.target.checked ? [...old, sample.assetHash] : old.filter(hash => hash !== sample.assetHash))}><span className="cover-sample-art cover-artwork"><CoverArtwork url={sample.url} alt={`${template.name}样张 ${index + 1}`}/></span><span>样张 {index + 1}</span></Checkbox></div>)}</div><Button onClick={() => setPreview({ label: template.name, images: template.samples })}>放大整组样张</Button>{!samples.length && <p role="alert">请至少选择一张风格样张。</p>}</details>}
        <div className="cover-setting-section"><h3>人物参考</h3><Button id="no-person" theme={photoId ? 'light' : 'solid'} disabled={!enabled} onClick={() => { touched.current.photo = true; setPhotoId(''); }}>这次不放人物{!photoId ? ' · 已选' : ''}</Button><label className="cover-field-label" htmlFor="cover-photo">或选择我的本人照片</label><PopupSelect id="cover-photo" value={photoId} disabled={!enabled} onChange={value => { touched.current.photo = true; setPhotoId(value); }}><option value="">这次不放人物</option>{invalidPhoto && <option value={photoId} disabled>原照片已失效，请明确重选</option>}{assets.photos.map(photo => <option key={photo.id} value={photo.id} disabled={!photo.isOwnPhoto || photo.availability !== 'available'}>{photo.title}{!photo.isOwnPhoto ? ' · 未声明为本人' : photo.availability === 'unavailable' ? ' · 原图缺失' : ''}</option>)}</PopupSelect>{invalidPhoto && <p role="alert">原照片已失效或不再声明为本人，请重选，或选择“这次不放人物”。</p>}<details className="cover-photo-import"><summary>从本机添加本人照片</summary><div className="checkbox"><Checkbox id="own-photo" checked={own} disabled={!enabled} onChange={event => setOwn(!!event.target.checked)} >我确认新导入的照片是本人照片</Checkbox></div><FileDropzone kind="photo" buttonId="choose-photo" disabled={!enabled} run={run} photo={{title: "我的照片", isOwnPhoto: own}} buttonLabel="选择照片文件" onImported={async photo => {if (alive.current) {await refreshAssets(); if (photo.isOwnPhoto) {touched.current.photo = true; setPhotoId(photo.id);} else setNotice("照片已导入，尚未声明为本人。请明确选择可用本人照，或选择这次不放人物。"); setOwn(false);}}}/></details></div>
        <div className="cover-size-settings"><label htmlFor="cover-count">生成张数<CoverCountInput id="cover-count" value={count} disabled={!enabled} onChange={value => { touched.current.count = true; setCount(value); }} /></label><label htmlFor="cover-ratio">封面比例<PopupSelect id="cover-ratio" value={customRatio ? "custom" : ratio} disabled={!enabled} onChange={value => { setCustomRatio(value === "custom"); if (value !== "custom") setRatio(value); }}>{ratios.map(value => <option key={value} value={value}>{value}</option>)}<option value="custom">自定义</option></PopupSelect></label>{customRatio && <label htmlFor="cover-custom-ratio">自定义比例<Input id="cover-custom-ratio" className="semi-control-text" aria-label="自定义封面比例" value={ratio} disabled={!enabled} placeholder="如 2:3 或 21:9" maxLength={17} onChange={value => setRatio(value.trim().replace(/：/g, ":"))}/></label>}</div>{pixels ? <p className="cover-size-hint">{ratio} · 至少{pixels.width}×{pixels.height} · PNG原图；实际尺寸以生成结果为准</p> : <p role="alert">此比例无法生成合法尺寸，请重新选择。</p>}
        <details className="cover-advanced" open={invalidMaterialIds.length > 0 ? true : undefined}><summary>补充要求与资料 · {materialIds.length > 0 ? `已选 ${materialIds.length} 份` : '默认不带资料'}</summary><label htmlFor="cover-prompt">补充要求</label><TextArea className="semi-control-text" id="cover-prompt" maxLength={30000} value={prompt} disabled={!enabled} onChange={value => setPrompt(value)} /><CoverMaterials materials={materials} selected={materialIds} invalid={invalidMaterialIds} disabled={!enabled || dirty} change={setMaterialIds}/></details>
      </>}</div></div>
      <div className="cover-dialog-footer"><div>{dirty ? <p role="alert">请先收起窗口，保存标题与正文后继续。</p> : liveJob ? <p>已有一批正在生成，可收起窗口后继续任务。</p> : blocked ? <p role="alert">请收起窗口，先处理工作台中的恢复提示。</p> : <p>使用已保存的内容和本次选择。收起窗口会保留设置。</p>}<span>生成由 {assistant} 执行，完成后回这里选图。{assistant === 'WorkBuddy' ? '原图可能包含助手平台标识。' : ''}</span>{notice && <p role="status">{notice}</p>}</div><Button id="generate-cover" theme="solid" disabled={generationDisabled} onClick={() => void run(generate)}>去 {assistant} 生成封面</Button></div>
    </dialog>}
    {comparing && currentCover && <ManagementDialog title="并排比较封面" busy={busy} dirty={false} close={() => setComparing(false)}><p>每张原图完整显示，可直接选用或收藏。最多比较 4 张。</p><div className="cover-compare-grid" style={{gridTemplateColumns: `repeat(${Math.max(2, compareCandidates.length)}, minmax(200px, 1fr))`}}>{compareCandidates.map(candidate => { const details = metadata?.candidates.find(item => item.id === candidate.id), selected = currentCover.selectedCandidateId === candidate.id; return <article key={candidate.id}><div className="cover-compare-image cover-artwork"><CoverArtwork url={candidate.url} alt={candidate.originalName}/></div><strong>候选 {details?.displayNumber || String(currentCover.candidates.findIndex(item => item.id === candidate.id) + 1).padStart(2, '0')}</strong><div className="cover-result-actions"><Button theme="solid" disabled={!enabled || dirty || hasCandidateDraft || selected} onClick={() => void run(async () => apply(await invoke('selectCover', {contentId: currentCover.content.id, candidateId: candidate.id, editToken: currentCover.content.editToken})))}>{selected ? '当前封面' : '选为封面'}</Button><Button aria-pressed={details?.favorite ?? false} disabled={!enabled || dirty || !details || !metadata || hasCandidateDraft} onClick={() => { if (details && metadata) void run(() => saveCandidate({...details, favorite: !details.favorite, editToken: metadata.editToken})); }}>{details?.favorite ? '已收藏' : '收藏'}</Button></div>{details?.note && <p>{details.note}</p>}</article>; })}</div></ManagementDialog>}
    {annotationDraft && content && <CoverAnnotationEditor candidate={annotationDraft} busy={busy} disabled={!enabled || dirty} refinementDisabled={refinementDisabled} assistant={assistant} referenceSummary={`本次模板：${template?.name || '未选择可用模板'}（${samples.length} 张样张）；人物参考：${photoId ? selectedPhoto?.title || '原照片不可用' : '这次不放人物'}；比例：${refinementRatio}。需要更换模板或照片时，先收起批注，在“再生成一批”中调整设置。`} close={() => setAnnotationDraft(null)} save={async note => { await saveCandidate({...annotationDraft, note}); setAnnotationDraft(null); }} refine={refineCandidate} run={run}/>}
    {candidateDraft && content && <ManagementDialog title="候选备注与信息" busy={busy} close={() => setCandidateDraft(null)}><form className="management-form" onSubmit={event => {
      event.preventDefault();
      void run(() => saveCandidate(candidateDraft, true));
    }}><fieldset disabled={busy || blocked}><div className="checkbox"><Checkbox disabled={busy || blocked} checked={candidateDraft.favorite} onChange={event => setCandidateDraft({ ...candidateDraft, favorite: !!event.target.checked })} >收藏这张候选</Checkbox></div><label>展示编号<Input className="semi-control-text" disabled={busy || blocked} maxLength={500} value={candidateDraft.displayNumber} onChange={(_, event) => setCandidateDraft({ ...candidateDraft, displayNumber: event.target.value })} /></label><label>备注<TextArea className="semi-control-text" disabled={busy || blocked} maxLength={10000} value={candidateDraft.note} onChange={value => setCandidateDraft({ ...candidateDraft, note: value })} /></label><label>所属封面版本<PopupSelect disabled={busy || blocked} value={candidateDraft.variantId ?? ''} onChange={value => setCandidateDraft({ ...candidateDraft, variantId: value || null })}><option value="">不指定版本</option>{candidateDraft.variantId && !metadata?.coverVariants.some(item => item.id === candidateDraft.variantId) && <option value={candidateDraft.variantId} disabled>原版本已不可用，请重新选择</option>}{metadata?.coverVariants.map(item => <option key={item.id} value={item.id}>{item.name} · {item.ratio}</option>)}</PopupSelect></label></fieldset><Button htmlType="submit" theme="solid" disabled={!enabled || dirty}>保存候选信息</Button></form></ManagementDialog>}
    {preview && <dialog ref={previewDialog} className="image-preview" onCancel={() => setPreview(null)} aria-label={preview.label}><div className="dialog-heading"><h3>{preview.label}</h3><Button onClick={() => setPreview(null)}>关闭预览</Button></div><div className="preview-grid">{preview.images.map((image, index) => <img key={index} src={image.url} alt={`${preview.label} ${index + 1}`} />)}</div></dialog>}
    <p id="cover-notice" role="status" aria-live="polite">{notice}</p>
  </section>;
}
