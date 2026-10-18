import { useEffect, useRef, useState } from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import Card from '@douyinfe/semi-ui-19/lib/es/card';
import { invoke } from './client.ts';
import type { Attempt, CoverView, CoverResults, CoverReference } from '../shared/cover-contracts.ts';
import type { Content, Status } from '../shared/contracts.ts';
interface Props { selectedTemplate?: {id: string; key: number} | null; status: Status | null; content: Content | null; dirty: boolean; busy: boolean; blocked: boolean; refreshToken: number; run<T>(action: () => Promise<T>): Promise<T | undefined>; onContent(content: Content): void }
const attemptLabels: Record<Attempt['status'], string> = { created: '待接单', claimed: '已接单', committed: '已入库', failed: '失败', cancelled: '已取消', superseded: '已替换' };
export function CoverPanel({ selectedTemplate, status, content, dirty, busy, blocked, refreshToken, run, onContent }: Props) {
  const [assets, setAssets] = useState<CoverResults['listCoverAssets'] | null>(null);
  const [cover, setCover] = useState<CoverView | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [samples, setSamples] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [photoId, setPhotoId] = useState('');
  const [own, setOwn] = useState(false);
  const [count, setCount] = useState(1);
  const [ratio, setRatio] = useState('3:4');
  const [prompt, setPrompt] = useState('根据当前标题与正文创作封面，参考所选风格；不要照抄样张文案或加入未经核实的事实。');
  const [notice, setNotice] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [preview, setPreview] = useState<{ label: string; images: { url: string }[] } | null>(null);
  const previewDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (preview && previewDialog.current && !previewDialog.current.open) previewDialog.current.showModal(); }, [preview]);
  const template = assets?.templates.find(t => t.id === templateId);
  const selectedPhoto = assets?.photos.find(p => p.id === photoId);
  const invalidPhoto = !!photoId && (!selectedPhoto || !selectedPhoto.isOwnPhoto || selectedPhoto.availability !== 'available' || !selectedPhoto.assetHash);
  const apply = (next: CoverView) => { if (!alive.current || next.content.id !== content?.id) return; setCover(next); onContent(next.content); };
  async function refreshAssets() {
    const next = await invoke('listCoverAssets'); if (!alive.current) return; setAssets(next);
    if (!templateId && next.templates[0]) { setTemplateId(next.templates[0].id); setSamples(next.templates[0].samples.map(r => r.assetHash)); }
  }
  async function refresh() { await refreshAssets(); if (content && alive.current) apply(await invoke('readCover', { contentId: content.id })); }
  const refreshed = useRef<number | null>(null);
  useEffect(() => {
    if (!status?.currentName || !content || busy || refreshed.current === refreshToken) return;
    refreshed.current = refreshToken;
    void run(refresh);
  }, [status?.currentName, busy, refreshToken]);
  const appliedSelection = useRef<number | null>(null);
  useEffect(() => {
    if (!selectedTemplate || !assets || appliedSelection.current === selectedTemplate.key) return;
    const next = assets.templates.find(template => template.id === selectedTemplate.id);
    if (next) { appliedSelection.current = selectedTemplate.key; setTemplateId(next.id); setSamples(next.samples.map(sample => sample.assetHash)); }
  }, [selectedTemplate?.id, selectedTemplate?.key, assets]);
  const enabled = !!status?.currentName && !busy && !blocked;
  const matching = assets?.templates.filter(t => `${t.name} ${t.description}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  const pages = Math.max(1, Math.ceil(matching.length / 6));
  const visibleTemplates = matching.slice(Math.min(page, pages - 1) * 6, (Math.min(page, pages - 1) + 1) * 6);
  function chooseTemplate(id: string) { const next = assets?.templates.find(t => t.id === id); if (next) { setTemplateId(id); setSamples(next.samples.map(r => r.assetHash)); } }
  return <Card title="封面创作" className="cover-panel"><p>选风格 → 准备任务 → 交给助手 → 回库选图。当前助手：{status?.assistant === 'workbuddy' ? 'WorkBuddy' : 'Codex'}（可在左下角设置修改）</p>
    {status?.seedPending && <p role="alert">内置模板初始化未完成，已保留恢复状态。<Button id="retry-builtins" disabled={busy || blocked} onClick={() => void run(async () => { await invoke('retryBuiltins'); await refreshAssets(); })}>继续初始化内置模板</Button></p>}
    {status?.coverActionPending && <div role="alert"><p>封面选用或取消结果待核验；本次操作标识已保留，核验会读取当前结果。</p><Button id="resume-cover-action" disabled={busy} onClick={() => void run(async () => apply(await invoke('resumeCoverAction')))}>核验并继续同一操作</Button><Button id="abandon-cover-action" disabled={busy} onClick={() => void run(() => invoke('abandonCoverAction'))}>明确放弃这次操作意图</Button></div>}
    {status?.photoPending && <div role="alert"><p>照片导入结果待核验，原选择与声明已保留。原文件缺失时保留待处理记录。</p><Button id="resume-photo" disabled={busy} onClick={() => void run(async () => { await invoke('resumePhoto'); await refreshAssets(); })}>核验并继续照片导入</Button><Button id="abandon-photo" disabled={busy} onClick={() => void run(() => invoke('abandonPhoto'))}>明确放弃这次导入</Button></div>}
    {status?.coverPending && <div role="alert"><p>封面准备结果待核验。固定请求与操作标识已保留，不能开始第二笔写入。</p><Button id="resume-cover" disabled={busy} onClick={() => void run(async () => apply(await invoke('resumeCover')))}>核验并继续封面准备</Button><Button id="abandon-cover" disabled={busy} onClick={() => void run(() => invoke('abandonCover'))}>明确放弃这次准备意图</Button><p>已提交的任务会保留在原内容中，请打开原内容查看。</p></div>}
    {!content && <p>先打开一篇内容并保存正文，再创作封面。</p>}
    <div className="actions"><Button id="load-cover-assets" disabled={busy || !status?.currentName} onClick={() => void run(refreshAssets)}>刷新模板与照片</Button><Button id="refresh-cover" disabled={busy || !status?.currentName || !content} onClick={() => void run(refresh)}>刷新任务与候选</Button></div>
    {assets && content && <><div className="cover-compose"><div className="style-picker"><h3>1. 选择模板组</h3><label htmlFor="template-search">搜索风格</label><input id="template-search" type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="输入模板名称或风格" />
      <div className="template-groups">{visibleTemplates.map(t => <section key={t.id} className={t.id === templateId ? 'template-group selected' : 'template-group'}><button className="template-choice" type="button" disabled={!enabled} aria-pressed={t.id === templateId} onClick={() => chooseTemplate(t.id)}>{t.samples[0] && <img src={t.samples[0].url} alt={`${t.name}模板预览`} />}<strong>{t.name}</strong><span>{t.samples.length} 张样张 · {t.accepted && t.aiTested ? '已记录验收' : '生图待验收'}</span></button><Button onClick={() => setPreview({ label: t.name, images: t.samples })}>整组预览</Button></section>)}</div>
      {!matching.length && <p>没有匹配的模板组。</p>}<div className="actions"><Button disabled={page === 0} onClick={() => setPage(p => p - 1)}>上一批</Button><span>{Math.min(page + 1, pages)} / {pages} · 共 {matching.length} 组</span><Button disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>下一批</Button></div>
      {template && <section><h3>{template.name} · 已选 {samples.length} 张风格样张</h3><p>{template.description}</p><div className="samples">{template.samples.map((sample, index) => <div className="sample" key={sample.assetHash}><button type="button" disabled={!enabled} aria-pressed={samples.includes(sample.assetHash)} onClick={() => setSamples(old => old.includes(sample.assetHash) ? old.filter(h => h !== sample.assetHash) : [...old, sample.assetHash])}><img src={sample.url} alt={`${template.name}风格样张 ${index + 1}`} /><span>样张 {index + 1}{samples.includes(sample.assetHash) ? ' · 已选' : ''}</span></button><button type="button" onClick={() => setPreview({ label: `${template.name}样张 ${index + 1}`, images: [sample] })}>放大查看</button></div>)}</div></section>}
    </div><div className="cover-options"><h3>2. 设置这次封面</h3><Button id="no-person" theme={photoId ? 'light' : 'solid'} disabled={!enabled} onClick={() => setPhotoId('')}>这次不放人物{!photoId ? ' · 已选' : ''}</Button>
      <label htmlFor="cover-photo">或使用已声明的本人照</label><select id="cover-photo" value={photoId} disabled={!enabled} onChange={event => setPhotoId(event.target.value)}><option value="">这次不放人物</option>{invalidPhoto && <option value={photoId} disabled>原选择已失效，请明确重选</option>}{assets.photos.map(p => <option key={p.id} value={p.id} disabled={!p.isOwnPhoto || p.availability !== 'available'}>{p.title}{!p.isOwnPhoto ? ' · 未声明为本人' : p.availability === 'unavailable' ? ' · 原图缺失' : ''}</option>)}</select>
      {invalidPhoto && <p role="alert">所选照片已失效、不可用或不再声明为本人。请重新选择，或点击“这次不放人物”。</p>}{selectedPhoto?.url && <img className="photo-preview" src={selectedPhoto.url} alt="本次选择的本人照片" />}
      <details><summary>导入一张新照片</summary><label htmlFor="own-photo" className="checkbox"><input id="own-photo" type="checkbox" checked={own} disabled={!enabled} onChange={event => setOwn(event.target.checked)} />我确认新导入的照片是本人照片（默认不声明）</label><Button id="choose-photo" disabled={!enabled} onClick={() => void run(async () => { const photo = await invoke('choosePhoto', { title: '我的照片', isOwnPhoto: own }); if (photo && alive.current) { await refreshAssets(); if (photo.isOwnPhoto) setPhotoId(photo.id); else setNotice('照片已导入，尚未声明为本人。请明确选择可用本人照，或选择这次不放人物。'); setOwn(false); } })}>从本机选择照片</Button></details>
      <label htmlFor="cover-count">生成张数（与风格样张数独立）</label><input id="cover-count" type="number" min={1} max={20} value={count} disabled={!enabled} onChange={event => setCount(Number(event.target.value))} /><label htmlFor="cover-ratio">封面比例</label><select id="cover-ratio" value={ratio} disabled={!enabled} onChange={event => setRatio(event.target.value)}><option value="3:4">3:4 · 900 × 1200</option><option value="1:1">1:1 · 1200 × 1200</option><option value="16:9">16:9 · 1600 × 900</option></select><label htmlFor="cover-prompt">这次封面要求</label><textarea id="cover-prompt" maxLength={30000} value={prompt} disabled={!enabled} onChange={event => setPrompt(event.target.value)} />
      <Button id="generate-cover" theme="solid" disabled={!enabled || dirty || !!content.deletedAt || !template || invalidPhoto || !samples.length || !Number.isInteger(count) || count < 1 || count > 20 || !prompt.trim()} onClick={() => void run(async () => { if (!template) return; if (invalidPhoto) throw Object.assign(new Error('所选照片已失效，请明确重选或选择这次不放人物。'), { code: 'PHOTO_SELECTION_INVALID' }); const [width, height] = ratio === '1:1' ? [1200, 1200] : ratio === '16:9' ? [1600, 900] : [900, 1200]; apply(await invoke('generateCover', { contentId: content.id, editToken: content.editToken, input: { template: { id: template.id, version: template.version }, styleAssetHashes: samples, photo: photoId ? { id: selectedPhoto!.id, assetHash: selectedPhoto!.assetHash! } : null, materialIds: [], prompt, pixels: { width, height }, ratio, count, outputFormat: 'png', scope: 'cover-only' } })); if (alive.current) setNotice('任务已准备。请点击“交给助手继续”，并在助手中确认执行。'); })}>准备封面任务</Button>{dirty && <p>请先保存标题与正文，再准备封面。</p>}
    </div></div></>}
    {cover && cover.content.id === content?.id && <><h3>3. 任务进展</h3><div id="cover-jobs">{[...cover.jobs].reverse().map((job, index) => {
      const activeAttempt = job.attempts.find(a => a.attemptId === job.activeAttemptId), latest = activeAttempt ?? job.attempts.at(-1);
      const reference: CoverReference | null = latest ? { contentId: cover.content.id, requestId: job.id, attemptId: latest.attemptId } : null;
      const live = !!activeAttempt && ['created', 'claimed'].includes(activeAttempt.status);
      const summary = job.summary;
      return <details key={job.id} open={live || index === 0} className="cover-job"><summary>{live ? '进行中' : index === 0 ? '最近请求' : '较早请求'} · 任务 {job.id.slice(0, 8)} · {latest ? attemptLabels[latest.status] : '准备中断，尚无尝试'}</summary>
        {summary ? <p className="request-summary">固定输入：模板 {summary.template.id} · v{summary.template.version} · {summary.styleSampleCount} 张风格样张 · {summary.hasOwnPhoto ? '含本人照' : '不放人物'} · 生成 {summary.count} 张 · {summary.pixels.width} × {summary.pixels.height} · {summary.ratio} · {summary.outputFormat}</p> : <p>固定请求摘要暂不可用；任务与候选记录仍保留。</p>}
        {latest?.failure && <p role="alert">{latest.failure.message}</p>}
        {live && reference && <><Button id={index === 0 ? 'continue-cover' : `continue-${job.id}`} disabled={!enabled || dirty} onClick={() => void run(async () => { await invoke('continueCover', reference); apply(await invoke('readCover', { contentId: reference.contentId })); if (alive.current) setNotice('已请求系统打开助手。请在助手中确认执行；接单与结果将显示在这里。'); })}>交给助手继续</Button><Button disabled={!enabled || dirty} onClick={() => void run(async () => apply(await invoke('cancelCover', reference)))}>取消这次尝试</Button></>}
        {reference && <Button disabled={!enabled || dirty} onClick={() => void run(async () => apply(await invoke('retryCover', reference)))}>明确重新生成</Button>}
        <details><summary>历史尝试（{job.attempts.length}）</summary>{job.attempts.map(a => <p key={a.attemptId}>{a.attemptId === job.activeAttemptId ? '当前尝试' : '历史尝试'} · {a.host} · {attemptLabels[a.status]}{a.failure ? ` · ${a.failure.message}` : ''}</p>)}</details></details>;
    })}</div><h3>4. 回库候选与导出</h3><div id="cover-candidates">{!cover.candidates.length && <p>图片通过完整校验并回库后，会出现在这里。可手动刷新查看。</p>}{[...cover.jobs].reverse().map(job => [...job.attempts].reverse().map(attempt => {
      const candidates = cover.candidates.filter(c => c.requestId === job.id && c.attemptId === attempt.attemptId);
      return candidates.length > 0 && <section key={attempt.attemptId} className="candidate-round"><h4>任务 {job.id.slice(0, 8)} · {attempt.attemptId === job.activeAttemptId ? '当前尝试' : attempt.attemptId === job.attempts.at(-1)?.attemptId ? '最近尝试' : '历史尝试'} · {attempt.host}</h4><div className="candidates">{candidates.map(c => <section key={c.id}><img src={c.url} alt={c.originalName || '封面候选'} /><p>{cover.selectedCandidateId === c.id ? '当前选用封面' : '候选封面'}</p><Button disabled={!enabled || dirty} onClick={() => void run(async () => apply(await invoke('selectCover', { contentId: cover.content.id, candidateId: c.id, editToken: cover.content.editToken })))}>选为封面</Button><Button disabled={busy || !status?.currentName} onClick={() => void run(async () => { const result = await invoke('exportCover', { contentId: cover.content.id, candidateId: c.id }); if (result.exported && alive.current) setNotice('封面原图已导出。'); })}>导出原图</Button></section>)}</div></section>;
    }))}</div></>}
    {preview && <dialog ref={previewDialog} className="image-preview" onCancel={() => setPreview(null)} aria-label={preview.label}><h3>{preview.label}</h3><div className="preview-grid">{preview.images.map((image, index) => <img key={index} src={image.url} alt={`${preview.label} ${index + 1}`} />)}</div><Button onClick={() => setPreview(null)}>关闭预览</Button></dialog>}
    <p id="cover-notice" role="status" aria-live="polite">{notice}</p>
  </Card>;
}
