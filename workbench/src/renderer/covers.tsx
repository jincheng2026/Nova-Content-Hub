import { useEffect, useRef, useState } from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import Card from '@douyinfe/semi-ui-19/lib/es/card';
import { invoke } from './client.ts';
import { ASSISTANTS } from '../shared/cover-contracts.ts';
import type { CoverView, CoverResults, CoverReference, Assistant } from '../shared/cover-contracts.ts';
import type { Content, Status } from '../shared/contracts.ts';
interface Props { status: Status | null; content: Content | null; dirty: boolean; busy: boolean; blocked: boolean; run<T>(action: () => Promise<T>): Promise<T | undefined>; onContent(content: Content): void }
export function CoverPanel({ status, content, dirty, busy, blocked, run, onContent }: Props) {
  const [assets, setAssets] = useState<CoverResults['listCoverAssets'] | null>(null);
  const [cover, setCover] = useState<CoverView | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [samples, setSamples] = useState<string[]>([]);
  const [photoId, setPhotoId] = useState('');
  const [own, setOwn] = useState(false);
  const [count, setCount] = useState(1);
  const [ratio, setRatio] = useState('3:4');
  const [prompt, setPrompt] = useState('根据当前标题与正文创作封面，参考所选风格；不要照抄样张文案或加入未经核实的事实。');
  const [notice, setNotice] = useState('');
  const [settings, setSettings] = useState(false);
  const settingsDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (settings && settingsDialog.current && !settingsDialog.current.open) settingsDialog.current.showModal(); }, [settings]);
  const [preview, setPreview] = useState<{ url: string; label: string } | null>(null);
  const previewDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (preview && previewDialog.current && !previewDialog.current.open) previewDialog.current.showModal(); }, [preview]);
  const template = assets?.templates.find(t => t.id === templateId);
  const selectedPhoto = assets?.photos.find(p => p.id === photoId);
  const invalidPhoto = !!photoId && (!selectedPhoto || !selectedPhoto.isOwnPhoto || selectedPhoto.availability !== 'available' || !selectedPhoto.assetHash);
  const apply = (next: CoverView) => { setCover(next); onContent(next.content); };
  async function refreshAssets() {
    const next = await invoke('listCoverAssets'); setAssets(next);
    if (!templateId && next.templates[0]) { setTemplateId(next.templates[0].id); setSamples(next.templates[0].samples.map(r => r.assetHash)); }
  }
  useEffect(() => { setCover(null); }, [content?.id]);
  const enabled = !!status?.currentName && !busy && !blocked;
  return <>
    <Card title="封面工作台"><p>当前助手：{status?.assistant === 'workbuddy' ? 'WorkBuddy' : 'Codex'} <Button id="open-settings" disabled={busy || blocked} onClick={() => setSettings(true)}>设置</Button></p><p>模板组可选多个风格样张；生成数量独立设置。实际结果回库并通过完整图片校验后才会出现候选。</p>
      {status?.seedPending && <p role="alert">内置模板初始化未完成，已保留恢复状态。<Button id="retry-builtins" disabled={busy || blocked} onClick={() => void run(async () => { await invoke('retryBuiltins'); await refreshAssets(); })}>继续初始化内置模板</Button></p>}
      {status?.coverActionPending && <div role="alert"><p>封面选用或取消结果待核验；本次操作标识已保留，核验会读取当前结果。</p><Button id="resume-cover-action" disabled={busy} onClick={() => void run(async () => apply(await invoke('resumeCoverAction')))}>核验并继续同一操作</Button><Button id="abandon-cover-action" disabled={busy} onClick={() => void run(() => invoke('abandonCoverAction'))}>明确放弃这次操作意图</Button></div>}
      {status?.photoPending && <div role="alert"><p>照片导入结果待核验，原选择与声明已保留。恢复使用同一操作；原文件缺失时保留待处理记录。</p><Button id="resume-photo" disabled={busy} onClick={() => void run(async () => { await invoke('resumePhoto'); await refreshAssets(); })}>核验并继续照片导入</Button><Button id="abandon-photo" disabled={busy} onClick={() => void run(() => invoke('abandonPhoto'))}>明确放弃这次导入</Button></div>}
      {status?.coverPending && <div role="alert"><p>封面准备结果待核验。请求与尝试使用固定操作标识，不能开始第二笔写入。</p><Button id="resume-cover" disabled={busy} onClick={() => void run(async () => apply(await invoke('resumeCover')))}>核验并继续封面准备</Button><Button id="abandon-cover" disabled={busy} onClick={() => void run(() => invoke('abandonCover'))}>明确放弃这次准备意图</Button><p>放弃意图会保留库中已提交的任务，可重新打开内容查看。</p></div>}
      <Button id="load-cover-assets" disabled={!enabled} onClick={() => void run(refreshAssets)}>查看模板组与照片</Button>
      {assets && <><div className="template-groups">{assets.templates.map(t => <section key={t.id} className={t.id === templateId ? 'template-group selected' : 'template-group'}><Button disabled={!enabled} onClick={() => { setTemplateId(t.id); setSamples(t.samples.map(r => r.assetHash)); }}>{t.name}</Button><p>{t.description}</p><p>{t.accepted && t.aiTested ? '已记录验收' : '尚未完成生图验收'}</p><div className="samples">{t.samples.map((sample, index) => <div className="sample" key={sample.assetHash}><button type="button" disabled={!enabled} aria-pressed={t.id === templateId && samples.includes(sample.assetHash)} onClick={() => { if (t.id !== templateId) { setTemplateId(t.id); setSamples([sample.assetHash]); } else setSamples(old => old.includes(sample.assetHash) ? old.filter(h => h !== sample.assetHash) : [...old, sample.assetHash]); }}><img src={sample.url} alt={`${t.name}风格样张 ${index + 1}`} /><span>样张 {index + 1}{t.id === templateId && samples.includes(sample.assetHash) ? ' · 已选' : ''}</span></button><button type="button" disabled={!enabled} onClick={() => setPreview({ url: sample.url, label: `${t.name}风格样张 ${index + 1}` })}>放大查看</button></div>)}</div></section>)}</div>
      <label htmlFor="own-photo" className="checkbox"><input id="own-photo" type="checkbox" checked={own} disabled={!enabled} onChange={event => setOwn(event.target.checked)} />我确认新导入的照片是本人照片（默认不声明）</label><Button id="choose-photo" disabled={!enabled} onClick={() => void run(async () => { const photo = await invoke('choosePhoto', { title: '我的照片', isOwnPhoto: own }); if (photo) { await refreshAssets(); if (photo.isOwnPhoto) setPhotoId(photo.id); else setNotice('照片已导入，尚未声明为本人。请明确选择可用本人照，或选择这次不放人物。'); setOwn(false); } })}>从本机选择照片</Button>
      <label htmlFor="cover-photo">这次人物</label><select id="cover-photo" value={photoId} disabled={!enabled} onChange={event => setPhotoId(event.target.value)}><option value="">这次不放人物</option>{invalidPhoto && <option value={photoId} disabled>原选择已失效，请明确重选</option>}{assets.photos.map(p => <option key={p.id} value={p.id} disabled={!p.isOwnPhoto || p.availability !== 'available'}>{p.title}{!p.isOwnPhoto ? ' · 未声明为本人' : p.availability === 'unavailable' ? ' · 原图缺失' : ''}</option>)}</select>{invalidPhoto && <p role="alert">所选照片已失效、不可用或不再声明为本人。请重新选择，或<Button onClick={() => setPhotoId('')}>这次不放人物</Button>。</p>}{selectedPhoto?.url && <img className="photo-preview" src={selectedPhoto.url} alt="本次选择的本人照片" />}
      <label htmlFor="cover-count">生成数量（与样张数无关）</label><input id="cover-count" type="number" min={1} max={20} value={count} disabled={!enabled} onChange={event => setCount(Number(event.target.value))} /><label htmlFor="cover-ratio">封面比例</label><select id="cover-ratio" value={ratio} disabled={!enabled} onChange={event => setRatio(event.target.value)}><option value="3:4">3:4 · 900 × 1200</option><option value="1:1">1:1 · 1200 × 1200</option><option value="16:9">16:9 · 1600 × 900</option></select><label htmlFor="cover-prompt">这次封面要求</label><textarea id="cover-prompt" maxLength={30000} value={prompt} disabled={!enabled} onChange={event => setPrompt(event.target.value)} />
      <Button id="generate-cover" theme="solid" disabled={!enabled || !content || dirty || !!content.deletedAt || !template || invalidPhoto || !samples.length || !Number.isInteger(count) || count < 1 || count > 20 || !prompt.trim()} onClick={() => void run(async () => { if (!content || !template) return; if (invalidPhoto) throw Object.assign(new Error('所选照片已失效，请明确重选或选择这次不放人物。'), { code: 'PHOTO_SELECTION_INVALID' }); const [width, height] = ratio === '1:1' ? [1200, 1200] : ratio === '16:9' ? [1600, 900] : [900, 1200]; apply(await invoke('generateCover', { contentId: content.id, editToken: content.editToken, input: { template: { id: template.id, version: template.version }, styleAssetHashes: samples, photo: photoId ? { id: selectedPhoto!.id, assetHash: selectedPhoto!.assetHash! } : null, materialIds: [], prompt, pixels: { width, height }, ratio, count, outputFormat: 'png', scope: 'cover-only' } })); setNotice('封面任务已准备。点击“交给当前助手继续”请求打开助手。'); })}>准备封面任务</Button>{dirty && <p>请先保存当前标题和正文，再准备封面。</p>}</>}
      <Button id="refresh-cover" disabled={busy || !status?.currentName || !content} onClick={() => void run(async () => { if (content) apply(await invoke('readCover', { contentId: content.id })); })}>刷新任务与候选</Button>
      {cover && cover.content.id === content?.id && <><div id="cover-jobs">{cover.jobs.map(job => {
        const activeAttempt = job.attempts.find(a => a.attemptId === job.activeAttemptId);
        const latest = activeAttempt ?? job.attempts.at(-1);
        const ref: CoverReference | null = latest ? { contentId: cover.content.id, requestId: job.id, attemptId: latest.attemptId } : null;
        const live = !!activeAttempt && ['created', 'claimed'].includes(activeAttempt.status);
        return <section key={job.id}><p>任务 {job.id.slice(0, 8)} · {activeAttempt?.status ?? latest?.status ?? '尚无尝试'}</p>
          <details><summary>尝试记录（{job.attempts.length}）</summary>{job.attempts.map(a => <p key={a.attemptId}>{a.host} · {a.status}{a.failure ? ` · ${a.failure.message}` : ''}</p>)}</details>
          {live && ref && <><Button id="continue-cover" disabled={!enabled || dirty} onClick={() => void run(async () => { await invoke('continueCover', ref); apply(await invoke('readCover', { contentId: ref.contentId })); setNotice('已请求系统打开当前助手。请在助手中确认执行；这不表示生成成功。'); })}>交给当前助手继续</Button><Button disabled={!enabled || dirty} onClick={() => void run(async () => apply(await invoke('cancelCover', ref)))}>取消这次尝试</Button></>}
          {ref && <Button disabled={!enabled || dirty} onClick={() => void run(async () => apply(await invoke('retryCover', ref)))}>明确重新生成</Button>}
        </section>;
      })}</div><div id="cover-candidates" className="candidates">{cover.candidates.map(c => <section key={c.id}><img src={c.url} alt={c.originalName || '封面候选'} /><p>{cover.selectedCandidateId === c.id ? '当前封面' : '候选封面'}</p><Button disabled={!enabled || dirty} onClick={() => void run(async () => apply(await invoke('selectCover', { contentId: cover.content.id, candidateId: c.id, editToken: cover.content.editToken })))}>选为封面</Button><Button disabled={busy || !status?.currentName} onClick={() => void run(async () => { const result = await invoke('exportCover', { contentId: cover.content.id, candidateId: c.id }); if (result.exported) setNotice('候选封面已导出原始校验字节。'); })}>导出原图</Button></section>)}</div></>}
      {settings && <dialog ref={settingsDialog} className="leave-dialog" onCancel={() => setSettings(false)} aria-labelledby="settings-title"><h3 id="settings-title">设置</h3><label htmlFor="assistant">全局助手</label><select id="assistant" value={status?.assistant ?? 'codex'} disabled={busy || blocked} onChange={event => void run(async () => { await invoke('setAssistant', { host: event.target.value as Assistant }); setNotice('助手设置已保存。'); })}>{ASSISTANTS.map(host => <option key={host} value={host}>{host === 'codex' ? 'Codex（默认）' : 'WorkBuddy'}</option>)}</select><p>照片只留在本机内容库。继续任务会授权所选本机助手读取这次固定输入；请求系统打开助手不代表图片已生成。</p><Button id="close-settings" onClick={() => setSettings(false)}>关闭设置</Button></dialog>}
      {preview && <dialog ref={previewDialog} className="image-preview" onCancel={() => setPreview(null)} aria-label={preview.label}><img src={preview.url} alt={preview.label} /><Button onClick={() => setPreview(null)}>关闭预览</Button></dialog>}
      <p id="cover-notice" role="status" aria-live="polite">{notice}</p>
    </Card>
  </>;
}
