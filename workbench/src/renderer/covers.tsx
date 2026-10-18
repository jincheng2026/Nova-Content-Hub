import { useEffect, useRef, useState } from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import { invoke } from './client.ts';
import {coverCandidateGroups} from './cover-gallery.ts';
import {ManagementDialog, materialSize, materialType} from './library-panels.tsx';
import './cover-workspace.css';
import type { Attempt, CoverView, CoverHandoff, CoverResults, CoverReference } from '../shared/cover-contracts.ts';
import type { Content, Status } from '../shared/contracts.ts';
import type { WorkspaceLibrarySnapshot, WorkspaceContentDetails, WorkspaceCandidate } from '../shared/workspace-contracts.ts';
interface Props { startOpenKey?: number; library?: WorkspaceLibrarySnapshot | null; refresh?(): Promise<void>; selectedTemplate?: {id: string; key: number} | null; status: Status | null; content: Content | null; dirty: boolean; busy: boolean; blocked: boolean; refreshToken: number; run<T>(action: () => Promise<T>): Promise<T | undefined>; onContent(content: Content): void }
const attemptLabels: Record<Attempt['status'], string> = { created: '待接单', claimed: '已接单', committed: '已入库', failed: '失败', cancelled: '已取消', superseded: '已替换' };
function ratioPixels(ratio: string): { width: number; height: number } | null {
  if (!/^\d{1,8}:\d{1,8}$/.test(ratio)) return null;
  const [width, height] = ratio.split(':').map(Number);
  if (!width || !height) return null;
  let a = width, b = height;
  while (b) { const remainder = a % b; a = b; b = remainder; }
  const w = width / a, h = height / a;
  if (w * h > 40_000_000) return null;
  const scale = Math.max(1, Math.floor(Math.min(1200 / Math.max(w, h), Math.sqrt(40_000_000 / (w * h)))));
  return { width: w * scale, height: h * scale };
}
function CoverMaterials({materials, selected, invalid, disabled, change}: {materials: WorkspaceContentDetails['materials']; selected: string[]; invalid: string[]; disabled: boolean; change(ids: string[]): void}) {
  return <fieldset className="cover-materials" disabled={disabled}><legend>本次封面要参考的内容资料（可选）</legend><p>默认不带资料。只有你在这里明确勾选的文件，才会进入本次请求；请先确认资料适合交给当前助手使用。</p>{materials.filter(item => !item.deletedAt).map(item => <label key={item.id} className="checkbox"><input type="checkbox" checked={selected.includes(item.id)} disabled={item.availability !== 'available' && !selected.includes(item.id)} onChange={event => change(event.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id))}/><span>{item.originalName || '未命名资料'}<span className="material-detail">{materialType(item.detectedType)} · {materialSize(item.bytes)} · {item.availability === 'available' ? '可用' : '原资料缺失，无法使用'}</span></span></label>)}{!materials.some(item => !item.deletedAt) && <p>还没有资料，可先在“内容资料附件”中添加，也可以不带资料继续。</p>}{invalid.length > 0 && <div role="alert"><p>已选的 {invalid.length} 份资料已被移除或不可用，请明确取消失效选择，或重新添加后勾选。</p><Button disabled={disabled} onClick={() => change(selected.filter(id => !invalid.includes(id)))}>取消失效资料的选择</Button></div>}<p>本次已选 {selected.length} 份资料。</p></fieldset>;
}
export function CoverPanel({ startOpenKey, library, refresh: refreshWorkspace, selectedTemplate, status, content, dirty, busy, blocked, refreshToken, run, onContent }: Props) {
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
  const [prompt, setPrompt] = useState('根据当前标题与正文创作封面，参考所选风格；不要照抄样张文案或加入未经核实的事实。');
  const [notice, setNotice] = useState('');
  const [metadata, setMetadata] = useState<WorkspaceContentDetails | null>(null);
  const [candidateDraft, setCandidateDraft] = useState<(WorkspaceCandidate & {editToken: string}) | null>(null);
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
      if (alive.current) setNotice(next.launchRequested ? '已请求系统打开助手。请在助手中确认执行；接单与结果将显示在这里。' : '这次固定请求已有结果或已结束，已显示原任务与候选。需要重做时，请明确重新生成。');
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
    void run(refresh);
  }, [status?.currentName, content?.id, busy, refreshToken]);
  const initialized = useRef<string | null>(null);
  const touched = useRef({ template: false, photo: false, count: false });
  useEffect(() => {
    initialized.current = null;
    touched.current = { template: false, photo: false, count: false };
    setTemplateId(''); setSamples([]); setPhotoId(''); setMaterialIds([]); setCount(1); setRatio('3:4'); setCandidateDraft(null); setCover(null); setNotice('');
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
  const ratios = [...new Set(['3:4', '1:1', '16:9', ...(library?.settings.customRatios ?? []), ratio])];
  const pixels = ratio === '3:4' ? { width: 900, height: 1200 } : ratio === '1:1' ? { width: 1200, height: 1200 } : ratio === '16:9' ? { width: 1600, height: 900 } : ratioPixels(ratio);
  const assistant = status?.assistant === 'workbuddy' ? 'WorkBuddy' : 'Codex';
  const currentCover = cover?.content.id === content?.id ? cover : null;
  const jobs = [...(currentCover?.jobs ?? [])].reverse();
  const candidateGroups = currentCover ? coverCandidateGroups(currentCover) : [];
  const liveJob = jobs.find(job => job.attempts.some(attempt => attempt.attemptId === job.activeAttemptId && ['created', 'claimed'].includes(attempt.status)));
  const liveAttempt = liveJob?.attempts.find(attempt => attempt.attemptId === liveJob.activeAttemptId);
  const liveReference: CoverReference | null = currentCover && liveJob && liveAttempt ? { contentId: currentCover.content.id, requestId: liveJob.id, attemptId: liveAttempt.attemptId } : null;
  const selectedCandidate = currentCover?.candidates.find(candidate => candidate.id === currentCover.selectedCandidateId);
  const generationDisabled = !enabled || dirty || !content || !!content.deletedAt || !!liveJob || !template || invalidTemplate || !pixels || invalidPhoto || invalidMaterialIds.length > 0 || !samples.length || !Number.isInteger(count) || count < 1 || count > 20 || !prompt.trim();
  async function generate() {
    if (!content || generationDisabled || !template) return;
    if (invalidPhoto) throw Object.assign(new Error('所选照片已失效，请明确重选或选择这次不放人物。'), { code: 'PHOTO_SELECTION_INVALID' });
    if (invalidMaterialIds.length) throw Object.assign(new Error('所选资料已失效，请取消失效选择或重新添加后勾选。'), { code: 'MATERIAL_SELECTION_INVALID' });
    if (!pixels) throw Object.assign(new Error('封面比例无法生成合法的整数尺寸，请重新选择。'), { code: 'INVALID_INPUT' });
    await openCoverTask(() => invoke('generateCover', { contentId: content.id, editToken: content.editToken, input: { template: { id: template.id, version: template.version }, styleAssetHashes: samples, photo: photoId ? { id: selectedPhoto!.id, assetHash: selectedPhoto!.assetHash! } : null, materialIds, prompt, pixels, ratio, count, outputFormat: 'png', scope: 'cover-only' } }));
  }
  return <section className="cover-panel cover-workspace" aria-label="封面作品">
    <div className="cover-workspace-heading"><div><h3>封面作品</h3><p>{currentCover?.candidates.length ? `共 ${currentCover.candidates.length} 张候选，选一张用作本篇封面。` : '选好风格，生成的封面会回到这里。'}</p></div><div className="cover-toolbar"><Button id="refresh-cover" disabled={busy || !status?.currentName || !content} onClick={() => void run(refresh)}>刷新结果</Button><Button theme="solid" disabled={!enabled || !content || !!content.deletedAt || !!liveJob} onClick={() => setComposerOpen(true)}>{currentCover?.candidates.length ? '再生成一批' : '制作封面'}</Button></div></div>
    {!content && <div className="cover-empty"><h4>先准备一篇内容</h4><p>保存标题与正文后，就可以为它制作封面。</p></div>}
    {liveJob && liveAttempt && liveReference && <div className="cover-live-job" id="cover-jobs"><div><span className="cover-state">{liveAttempt.status === 'claimed' ? '助手正在制作' : '等待助手接单'}</span><h4>{liveJob.summary ? `${liveJob.summary.count} 张封面 · ${liveJob.summary.ratio}` : '这次封面正在准备'}</h4><p>请在助手中确认执行。完成后回到这里刷新结果。</p>{liveAttempt.failure && <p role="alert">{liveAttempt.failure.message}</p>}</div><div className="cover-toolbar"><Button id="continue-cover" theme="solid" disabled={!enabled || dirty} onClick={() => void run(() => openCoverTask(async () => { await invoke('continueCover', liveReference); return { ...await invoke('readCover', { contentId: liveReference.contentId }), launchRequested: true }; }))}>去 {assistant} 继续</Button><Button disabled={!enabled || dirty} onClick={() => void run(async () => apply(await invoke('cancelCover', liveReference)))}>取消这次生成</Button></div></div>}
    {selectedCandidate && <div className="cover-selected"><button type="button" className="cover-selected-preview" onClick={() => setPreview({ label: '当前选用封面', images: [selectedCandidate] })}><img src={selectedCandidate.url} alt="当前选用封面" /></button><div><span className="cover-state">当前选用</span><h4>{content?.title}</h4><p>本篇内容使用这张封面。</p><Button disabled={busy || !status?.currentName} onClick={() => void run(async () => { const result = await invoke('exportCover', { contentId: currentCover!.content.id, candidateId: selectedCandidate.id }); if (result.exported && alive.current) setNotice('封面原图已下载到所选位置。'); })}>下载原图</Button></div></div>}
    {content && !currentCover?.candidates.length && <div className="cover-empty"><span className="cover-empty-mark" aria-hidden="true">▧</span><h4>{liveJob ? '封面制作中' : '你的第一张封面，从这里开始'}</h4><p>{liveJob ? '通过校验的图片会出现在这里。' : '选择一组模板，也可以加入本人照片，一次生成多张候选。'}</p></div>}
    <div id="cover-candidates" className="cover-result-groups">{currentCover && candidateGroups.map(({key, job, attempt, candidates}, groupIndex) => {
      return <section key={key} className="cover-result-group"><div className="cover-batch-heading"><h4>{attempt ? groupIndex === 0 ? '最近生成' : '较早生成' : '历史候选'} · {candidates.length} 张</h4><span>{attempt ? `${attempt.host === 'workbuddy' ? 'WorkBuddy' : 'Codex'}${job?.summary ? ` · ${job.summary.ratio}` : ''}` : '没有对应的生成记录，助手与生成设置未知'}</span></div><div className="cover-result-grid">{candidates.map((candidate, index) => { const details = metadata?.candidates.find(item => item.id === candidate.id), selected = currentCover.selectedCandidateId === candidate.id; return <article key={candidate.id} className={`cover-result-card${selected ? ' is-selected' : ''}`}><button type="button" className="cover-result-image" aria-label={`放大候选 ${details?.displayNumber || index + 1}`} onClick={() => setPreview({ label: `封面候选 ${details?.displayNumber || index + 1}`, images: [candidate] })}><img src={candidate.url} alt={candidate.originalName || `封面候选 ${index + 1}`} /><span className="cover-result-badges">{selected && <span>已选定</span>}{details?.favorite && <span>已收藏</span>}</span></button><div className="cover-result-caption"><strong>候选 {details?.displayNumber || index + 1}</strong>{details?.note && <p>{details.note}</p>}<div className="cover-result-actions"><Button theme={selected ? 'light' : 'solid'} disabled={!enabled || dirty || selected} onClick={() => void run(async () => apply(await invoke('selectCover', { contentId: currentCover.content.id, candidateId: candidate.id, editToken: currentCover.content.editToken })))}>{selected ? '当前封面' : '选为封面'}</Button><Button disabled={busy || !status?.currentName} onClick={() => void run(async () => { const result = await invoke('exportCover', { contentId: currentCover.content.id, candidateId: candidate.id }); if (result.exported && alive.current) setNotice('封面原图已下载到所选位置。'); })}>下载</Button><Button theme="borderless" disabled={!enabled || dirty || !details || !metadata} onClick={() => { if (details && metadata) setCandidateDraft({ ...details, editToken: metadata.editToken }); }}>收藏 / 备注</Button></div></div></article>; })}</div></section>;
    })}</div>
    {jobs.length > 0 && <details className="cover-history"><summary>生成记录（{jobs.length} 批）</summary>{jobs.map((job, index) => {
      const latest = job.attempts.find(attempt => attempt.attemptId === job.activeAttemptId) ?? job.attempts.at(-1);
      const reference: CoverReference | null = currentCover && latest ? { contentId: currentCover.content.id, requestId: job.id, attemptId: latest.attemptId } : null;
      const live = !!latest && ['created', 'claimed'].includes(latest.status);
      const summary = job.summary;
      const templateName = summary && assets?.templates.find(item => item.id === summary.template.id)?.name;
      return <div key={job.id} className="cover-history-row"><div><strong>{index === 0 ? '最近一批' : `第 ${jobs.length - index} 批`} · {latest ? attemptLabels[latest.status] : '准备未完成'}</strong>{summary ? <p>{templateName || '原模板'} · 版本 {summary.template.version} · {summary.styleSampleCount} 张样张 · {summary.hasOwnPhoto ? '含本人照' : '不放人物'} · {summary.count} 张 · {summary.pixels.width} × {summary.pixels.height} · {summary.ratio}</p> : <p>原输入摘要暂不可用，任务与候选仍保留。</p>}{latest?.failure && <p role="alert">{latest.failure.message}</p>}<details><summary>查看尝试记录（{job.attempts.length}）</summary>{job.attempts.map(attempt => <p key={attempt.attemptId}>{attempt.attemptId === job.activeAttemptId ? '当前尝试' : '历史尝试'} · {attempt.host === 'workbuddy' ? 'WorkBuddy' : 'Codex'} · {attemptLabels[attempt.status]}{attempt.failure ? ` · ${attempt.failure.message}` : ''}</p>)}</details></div>{reference && !live && <Button disabled={!enabled || dirty || !!liveJob} onClick={() => void run(() => openCoverTask(() => invoke('retryCover', reference)))}>按这批设置重做</Button>}</div>;
    })}</details>}
    {composerOpen && content && <dialog ref={composerDialog} className="cover-create-dialog" aria-labelledby="cover-create-title" onCancel={event => { event.preventDefault(); if (!busy) setComposerOpen(false); }}>
      <div className="cover-dialog-heading"><div><h2 id="cover-create-title">制作封面</h2><p>当前助手：{assistant} · 可在全局设置中修改</p></div><Button onClick={() => setComposerOpen(false)}>暂时收起</Button></div>
      <div className="cover-create-body"><aside className="cover-creation-preview"><span className="cover-field-label">所选风格</span><div className="cover-style-preview">{previewSample ? <img src={previewSample.url} alt={`${template?.name ?? '所选模板'}风格参考，非生成结果`} /> : <p>选择模板后在这里查看风格样张</p>}</div><div className="cover-content-summary"><span className="cover-field-label">本篇内容</span><h3>{content.title || '未命名内容'}</h3><p>{content.body ? content.body.slice(0, 240) + (content.body.length > 240 ? '…' : '') : '正文为空'}</p><span>直接使用已保存的标题与正文</span></div>{selectedPhoto?.url && <div className="cover-person-summary"><img src={selectedPhoto.url} alt="本次人物参考"/><span>本次人物参考</span></div>}<p className="cover-preview-note">样张只参考风格，生成结果会回到封面作品中。</p></aside>
      <div className="cover-create-settings">{!assets ? <div className="cover-empty"><p>正在准备模板与照片。</p><Button id="load-cover-assets" disabled={busy || !status?.currentName} onClick={() => void run(refreshAssets)}>读取模板与照片</Button></div> : <>
        <div className="cover-field-heading"><h3>封面模板</h3><Button theme="borderless" disabled={busy || !status?.currentName} onClick={() => void run(refreshAssets)}>刷新</Button></div><input id="template-search" type="search" aria-label="搜索封面模板" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="搜索模板名称或风格" />
        <div className="cover-template-grid">{visibleTemplates.map(item => <button key={item.id} className={`cover-template-choice${item.id === templateId ? ' is-selected' : ''}`} type="button" disabled={!enabled} aria-pressed={item.id === templateId} onClick={() => chooseTemplate(item.id)}>{item.samples[0] ? <img src={item.samples[0].url} alt={`${item.name}模板预览`} /> : <span className="cover-template-missing">暂无样张</span>}<strong>{item.name}</strong><span>{item.samples.length} 张样张 · {item.builtin ? '内置' : item.accepted && item.aiTested ? '已验收' : '我的模板'}</span></button>)}</div>
        {invalidTemplate && <p role="alert">原先选择的模板已不可用，请明确选择一个可用模板组。</p>}{!matching.length && <p>没有匹配的模板，换个关键词试试。</p>}{pages > 1 && <div className="cover-template-pages"><Button disabled={page === 0} onClick={() => setPage(old => old - 1)}>上一页</Button><span>{Math.min(page + 1, pages)} / {pages}</span><Button disabled={page >= pages - 1} onClick={() => setPage(old => old + 1)}>下一页</Button></div>}
        {template && <details className="cover-style-details"><summary>风格样张 · 已选 {samples.length} 张</summary><p>{template.description}</p><div className="cover-sample-grid">{template.samples.map((sample, index) => <label key={sample.assetHash}><img src={sample.url} alt={`${template.name}样张 ${index + 1}`} /><span><input type="checkbox" disabled={!enabled} checked={samples.includes(sample.assetHash)} onChange={event => setSamples(old => event.target.checked ? [...old, sample.assetHash] : old.filter(hash => hash !== sample.assetHash))}/>样张 {index + 1}</span></label>)}</div><Button onClick={() => setPreview({ label: template.name, images: template.samples })}>放大整组样张</Button>{!samples.length && <p role="alert">请至少选择一张风格样张。</p>}</details>}
        <div className="cover-setting-section"><h3>人物参考</h3><Button id="no-person" theme={photoId ? 'light' : 'solid'} disabled={!enabled} onClick={() => { touched.current.photo = true; setPhotoId(''); }}>这次不放人物{!photoId ? ' · 已选' : ''}</Button><label className="cover-field-label" htmlFor="cover-photo">或选择我的本人照片</label><select id="cover-photo" value={photoId} disabled={!enabled} onChange={event => { touched.current.photo = true; setPhotoId(event.target.value); }}><option value="">这次不放人物</option>{invalidPhoto && <option value={photoId} disabled>原照片已失效，请明确重选</option>}{assets.photos.map(photo => <option key={photo.id} value={photo.id} disabled={!photo.isOwnPhoto || photo.availability !== 'available'}>{photo.title}{!photo.isOwnPhoto ? ' · 未声明为本人' : photo.availability === 'unavailable' ? ' · 原图缺失' : ''}</option>)}</select>{invalidPhoto && <p role="alert">原照片已失效或不再声明为本人，请重选，或选择“这次不放人物”。</p>}<details className="cover-photo-import"><summary>从本机添加本人照片</summary><label htmlFor="own-photo" className="checkbox"><input id="own-photo" type="checkbox" checked={own} disabled={!enabled} onChange={event => setOwn(event.target.checked)} />我确认新导入的照片是本人照片</label><Button id="choose-photo" disabled={!enabled} onClick={() => void run(async () => { const photo = await invoke('choosePhoto', { title: '我的照片', isOwnPhoto: own }); if (photo && alive.current) { await refreshAssets(); if (photo.isOwnPhoto) { touched.current.photo = true; setPhotoId(photo.id); } else setNotice('照片已导入，尚未声明为本人。请明确选择可用本人照，或选择这次不放人物。'); setOwn(false); } })}>选择照片文件</Button></details></div>
        <div className="cover-size-settings"><label htmlFor="cover-count">生成张数<input id="cover-count" type="number" min={1} max={20} value={count} disabled={!enabled} onChange={event => { touched.current.count = true; setCount(Number(event.target.value)); }} /></label><label htmlFor="cover-ratio">封面比例<select id="cover-ratio" value={ratio} disabled={!enabled} onChange={event => setRatio(event.target.value)}>{ratios.map(value => <option key={value} value={value}>{value}</option>)}</select></label></div>{pixels ? <p className="cover-size-hint">输出 {pixels.width} × {pixels.height} · PNG 原图</p> : <p role="alert">此比例无法生成合法尺寸，请重新选择。</p>}
        <details className="cover-advanced" open={invalidMaterialIds.length > 0 ? true : undefined}><summary>高级选项{materialIds.length > 0 ? ` · 已选 ${materialIds.length} 份资料` : ''}</summary><label htmlFor="cover-prompt">补充要求</label><textarea id="cover-prompt" maxLength={30000} value={prompt} disabled={!enabled} onChange={event => setPrompt(event.target.value)} /><CoverMaterials materials={materials} selected={materialIds} invalid={invalidMaterialIds} disabled={!enabled || dirty} change={setMaterialIds}/></details>
      </>}</div></div>
      <div className="cover-dialog-footer"><div>{dirty ? <p role="alert">请先收起窗口，保存标题与正文后继续。</p> : liveJob ? <p>已有一批正在生成，可收起窗口后继续任务。</p> : blocked ? <p role="alert">请收起窗口，先处理工作台中的恢复提示。</p> : <p>使用已保存的内容和本次选择。收起窗口会保留设置。</p>}<span>生成由 {assistant} 执行，完成后回这里选图。</span>{notice && <p role="status">{notice}</p>}</div><Button id="generate-cover" theme="solid" disabled={generationDisabled} onClick={() => void run(generate)}>去 {assistant} 生成封面</Button></div>
    </dialog>}
    {candidateDraft && content && <ManagementDialog title="编辑候选信息" busy={busy} close={() => setCandidateDraft(null)}><form className="management-form" onSubmit={event => {
      event.preventDefault();
      const draft = candidateDraft;
      void run(async () => {
        const result = await invoke('mutateWorkspace', { op: 'updateCandidate', kind: 'content', id: content.id, editToken: draft.editToken, candidateId: draft.id, favorite: draft.favorite, displayNumber: draft.displayNumber, note: draft.note, variantId: draft.variantId });
        if (!alive.current) return;
        setMetadata(result.library.contentDetails.find(item => item.id === content.id) ?? null); setCandidateDraft(null); setNotice('候选信息已保存。');
        apply(await invoke('readCover', { contentId: content.id })); await refreshWorkspace?.();
      });
    }}><fieldset disabled={busy || blocked}><label className="checkbox"><input type="checkbox" checked={candidateDraft.favorite} onChange={event => setCandidateDraft({ ...candidateDraft, favorite: event.target.checked })} />收藏这张候选</label><label>展示编号<input maxLength={500} value={candidateDraft.displayNumber} onChange={event => setCandidateDraft({ ...candidateDraft, displayNumber: event.target.value })} /></label><label>备注<textarea maxLength={10000} value={candidateDraft.note} onChange={event => setCandidateDraft({ ...candidateDraft, note: event.target.value })} /></label><label>所属封面版本<select value={candidateDraft.variantId ?? ''} onChange={event => setCandidateDraft({ ...candidateDraft, variantId: event.target.value || null })}><option value="">不指定版本</option>{candidateDraft.variantId && !metadata?.coverVariants.some(item => item.id === candidateDraft.variantId) && <option value={candidateDraft.variantId} disabled>原版本已不可用，请重新选择</option>}{metadata?.coverVariants.map(item => <option key={item.id} value={item.id}>{item.name} · {item.ratio}</option>)}</select></label></fieldset><Button htmlType="submit" theme="solid" disabled={!enabled || dirty}>保存候选信息</Button></form></ManagementDialog>}
    {preview && <dialog ref={previewDialog} className="image-preview" onCancel={() => setPreview(null)} aria-label={preview.label}><div className="dialog-heading"><h3>{preview.label}</h3><Button onClick={() => setPreview(null)}>关闭预览</Button></div><div className="preview-grid">{preview.images.map((image, index) => <img key={index} src={image.url} alt={`${preview.label} ${index + 1}`} />)}</div></dialog>}
    <p id="cover-notice" role="status" aria-live="polite">{notice}</p>
  </section>;
}
