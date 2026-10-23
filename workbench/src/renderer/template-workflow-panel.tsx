import {ImagePreviewButton} from './cover-image-viewer.tsx';
import {assistantLaunchNotice, taskProgressLabel, taskStatusChanged, mergeTaskProgress} from '../shared/task-progress.ts';
import {useTaskProgress, TaskProgressDetails} from './task-progress.tsx';
import {useManagedDraftGuard} from './library-panels.tsx';
import {useEffect, useRef, useState} from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import TextArea from '@douyinfe/semi-ui-19/lib/es/input/textarea';
import Checkbox from '@douyinfe/semi-ui-19/lib/es/checkbox';
import {PopupSelect} from './semi-controls.tsx';
import type {CoverResults} from '../shared/cover-contracts.ts';
import type {TemplateAssistantSetup, TemplateAttemptView, TemplateWorkflowResult, TemplateWorkflowView} from '../shared/template-contracts.ts';
import {List} from './list-primitives.tsx';
import type {WorkspaceLibrarySnapshot} from '../shared/workspace-contracts.ts';
import type {WorkspaceRun} from './library-panels.tsx';
import {invoke} from './client.ts';
import './template-workflow.css';

export interface TemplateWorkflowPanelProps {templateId: string; library: WorkspaceLibrarySnapshot | null; assets: CoverResults['listCoverAssets'] | null; busy: boolean; run: WorkspaceRun; refresh(): Promise<void>; onDerive?(): Promise<void>}
const statusNames = {created: '待助手接单', claimed: '助手已接单', committed: '结果已回传，待你确认', failed: '失败', cancelled: '已取消', superseded: '已被后续尝试替代'};
export function TemplateWorkflowPanel({templateId, library, assets, busy, run, refresh, onDerive}: TemplateWorkflowPanelProps) {
    const [view, setView] = useState<TemplateWorkflowView | null>(null), [setup, setSetup] = useState<TemplateAssistantSetup | null>(null), [notes, setNotes] = useState(''), [selected, setSelected] = useState(''), [confirm, setConfirm] = useState(false), [notice, setNotice] = useState(''), [loading, setLoading] = useState(false);
    const [submittedNotes, setSubmittedNotes] = useState(''), [reportWarnings, setReportWarnings] = useState<string[]>([]);
    const notesDirty = notes !== submittedNotes;
    useManagedDraftGuard(notesDirty);
    const viewRef = useRef(view);
    viewRef.current = view;
    useEffect(() => {setNotes(''); setSubmittedNotes(''); setView(null); setSelected(''); setConfirm(false); setNotice(''); setReportWarnings([]);}, [templateId]);
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        Promise.all([invoke('readTemplateWorkflow', {templateId}), invoke('readTemplateAssistantSetup')]).then(([next, assistant]) => {
            if (!cancelled) {if (viewRef.current?.editToken !== next.editToken) setConfirm(false); setView(next); setSetup(assistant);}
        }).catch(error => {if (!cancelled) setNotice(error instanceof Error ? error.message : '暂时无法读取拆解历史。');}).finally(() => {if (!cancelled) setLoading(false);});
        return () => {cancelled = true;};
    }, [templateId, library, assets]);
    const template = library?.templates.find(t => t.id === templateId), asset = assets?.templates.find(t => t.id === templateId);
    const attempts = view?.jobs.flatMap(j => j.attempts) ?? [];
    const activeAttempt = attempts.find(a => view?.jobs.some(j => j.activeAttemptId === a.attemptId && ['created', 'claimed'].includes(a.status)));
    const progressEpoch = useRef({id: templateId, library}); progressEpoch.current = {id: templateId, library};
    const mounted = useRef(true); useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);
    useTaskProgress(activeAttempt ? templateId : '', async () => {
        if (busy || !viewRef.current) return;
        const id = templateId, snapshot = await invoke('readTemplateProgress', {templateId: id});
        if (!mounted.current || progressEpoch.current.id !== id || progressEpoch.current.library !== library || !viewRef.current) return;
        if (taskStatusChanged(viewRef.current.jobs, snapshot)) {
            const next = await invoke('readTemplateWorkflow', {templateId: id});
            if (mounted.current && progressEpoch.current.id === id && progressEpoch.current.library === library) {if (viewRef.current?.editToken !== next.editToken) setConfirm(false); setView(next);}
        } else setView(old => old?.templateId === id ? {...old, jobs: mergeTaskProgress(old.jobs, snapshot)} : old);
    });
    const attempt = selected ? attempts.find(a => a.attemptId === selected) : attempts.at(-1);
    const job = view?.jobs.find(j => j.id === attempt?.reference.requestId);
    const live = attempt && job?.activeAttemptId === attempt.attemptId && ['created', 'claimed'].includes(attempt.status);
    const accepted = !!job?.acceptance && job.acceptance.attemptId === attempt?.attemptId;
    const jobAccepted = !!job?.acceptance;
    const sourceMatches = attempt?.reference.sourceVersion === view?.currentVersion && attempt?.reference.sourcePackageHash === template?.versions.find(v => v.version === view?.currentVersion)?.packageHash;
    const unavailable = !view || busy || loading || !!view.deletedAt;
    async function update(action: () => Promise<TemplateWorkflowResult>, submitted?: string) {
        if (unavailable) return;
        await run(async () => {
            try {
                const result = await action();
                setView(result.view); setConfirm(false); if (result.view.reportWarnings?.length) setReportWarnings(result.view.reportWarnings);
                if (submitted !== undefined) setSubmittedNotes(submitted);
                setNotice(result.launchRequested ? '已请求打开助手，请按上方任务提示继续。' : '模板操作已保存。');
                await refresh();
            } catch (error) {
                setNotice(error instanceof Error ? error.message : '操作尚未确认，请检查全局恢复入口。');
                // 打开宿主失败前可能已保存任务，重新读取后保留同一次尝试的续接入口。
                try {setView(await invoke('readTemplateWorkflow', {templateId})); setConfirm(false);} catch {}
                throw error;
            }
        });
    }
    async function reload() {
        if (busy || loading) return;
        await run(async () => {const [next, assistant] = await Promise.all([invoke('readTemplateWorkflow', {templateId}), invoke('readTemplateAssistantSetup')]); setView(next); setSetup(assistant); setConfirm(false); setNotice('已读取当前拆解记录。');});
    }
    return <section className="template-workflow" aria-label="AI拆解与人工确认">
        {(template?.sourceScopeWarning ?? asset?.sourceScopeWarning) && <p className="template-source-scope" role="note">{template?.sourceScopeWarning ?? asset?.sourceScopeWarning}</p>}
        <div className="management-toolbar"><div><h3>{view?.title ?? template?.title ?? asset?.name ?? '模板'} · AI拆解风格</h3><p>让 AI 看整组样张、总结风格，并还原第 1 张；最后由你对照确认。</p></div><Button disabled={busy || loading} onClick={() => void reload()}>刷新拆解结果</Button></div>
        <p className="muted">点 AI拆解 → 去已选助手选模型、手动发送 → 回来看进度 → 对照确认</p>
        {attempt && <div className="template-study-progress" role="status" aria-live="polite"><strong>{accepted ? '已确认' : attempt.status === 'committed' ? statusNames.committed : taskProgressLabel(attempt)}</strong><p>{accepted ? '规则与首张还原效果已经你确认并保存。' : attempt.status === 'created' ? assistantLaunchNotice(attempt) : attempt.status === 'claimed' ? '助手已领取任务；进度报告会自动更新。' : attempt.status === 'committed' ? '请对照原样张、规则证据与首张还原图，再勾选确认。回传结果尚未经过你的确认。' : '历史任务与已回传证据仍保留。'}</p><TaskProgressDetails attempt={attempt}/>{live && !attempt.progress?.sessionId && <p>尚未绑定原会话；打开助手后，按同一任务编号继续。</p>}</div>}
        {view?.builtin ? <div className="template-workflow-message"><p>点击后会保留原样张，并为你准备可编辑的模板。</p>{onDerive && <Button theme="solid" disabled={busy} onClick={() => void onDerive()}>AI拆解风格</Button>}</div> : <>
            <p className="muted">本次助手：{(activeAttempt?.host ?? setup?.host) === 'workbuddy' ? 'WorkBuddy' : 'Codex'}。{setup && !setup.ready ? '新任务暂不可用，请在设置中检查助手与配套插件。' : '可在左下角设置中更换助手。'}</p>
            <details className="template-study-options" open={notesDirty ? true : undefined}><summary>补充要求（可选，不填也能拆解）</summary><label className="template-study-notes">希望 AI 特别注意什么？<TextArea className="semi-control-text" maxLength={10_000} value={notes} disabled={unavailable} placeholder="比如：重点还原标题层级与留白关系" onChange={setNotes}/></label>{notesDirty && <Button disabled={busy} onClick={() => setNotes(submittedNotes)}>放弃未提交的补充要求</Button>}</details>
            {!activeAttempt && !jobAccepted && attempt?.status !== 'committed' && <Button theme="solid" disabled={unavailable || !setup?.ready} onClick={() => view && void update(() => invoke('startTemplateStudy', {templateId, version: view.currentVersion, editToken: view.editToken, notes}), notes)}>{attempts.length ? '重新拆解' : 'AI拆解风格'}</Button>}
            {activeAttempt && attempt?.attemptId !== activeAttempt.attemptId && <Button disabled={busy} onClick={() => {setSelected(activeAttempt.attemptId); setConfirm(false);}}>查看进行中的AI拆解</Button>}
            {live && !attempt.unavailable && !jobAccepted && <Button theme="solid" disabled={unavailable || !sourceMatches || attempt.progressUnavailable} onClick={() => void update(() => invoke('continueBoundTemplate', attempt.reference))}>{attempt.progress?.sessionId ? '去 ' + (attempt.host === 'codex' ? 'Codex' : 'WorkBuddy') + (attempt.progress.state.startsWith('waiting-') ? ' 确认' : ' 继续') : '打开 ' + (attempt.host === 'codex' ? 'Codex' : 'WorkBuddy') + ' 继续'}</Button>}
        </>}
        <p role="status" aria-live="polite">{loading ? '正在读取拆解记录…' : notice}</p>
        {[...new Set([...reportWarnings, ...view?.reportWarnings ?? []])].map(warning => <p role="alert" key={warning}>{warning}；可通过“打开模板文件夹”重新生成说明，已保存的拆解结果不受影响。</p>)}
        {(!!attempts.length || !!selected) && <>
            <details className="template-study-options"><summary>历史与更多操作（重试、换助手、取消）</summary>
                <label>查看哪一次拆解<PopupSelect searchable aria-label="拆解历史" value={selected || attempt?.attemptId || ''} disabled={busy} onChange={value => {setSelected(value); setConfirm(false);}}>{selected && !attempt && <option value={selected} disabled>原拆解记录暂不可用，请重新选择</option>}{[...attempts].reverse().map(a => <option key={a.attemptId} value={a.attemptId}>源版本 v{a.reference.sourceVersion || '?'} · {a.host === 'codex' ? 'Codex' : 'WorkBuddy'} · {statusNames[a.status]} · {a.attemptId.slice(0, 8)}</option>)}</PopupSelect></label>
                {attempt && !attempt.unavailable && !jobAccepted && !view?.builtin && <div className="management-actions">{live && <>{setup?.host !== attempt.host && <Button disabled={unavailable || !sourceMatches || !setup?.ready} onClick={() => void update(() => invoke('continueTemplateStudy', attempt.reference))}>换用当前助手继续</Button>}<Button disabled={unavailable} onClick={() => void update(() => invoke('cancelTemplateStudy', attempt.reference))}>取消本次尝试</Button></>}{!activeAttempt && <Button disabled={unavailable || !sourceMatches || !setup?.ready} onClick={() => void update(() => invoke('retryTemplateStudy', attempt.reference))}>重新AI拆解</Button>}</div>}
                {!activeAttempt && !view?.builtin && <Button disabled={unavailable || !setup?.ready} onClick={() => view && void update(() => invoke('startTemplateStudy', {templateId, version: view.currentVersion, editToken: view.editToken, notes}), notes)}>开始新一轮AI拆解</Button>}
            </details>
            {selected && !attempt && <p role="alert">原拆解记录暂不可用，本次选择仍保留。请刷新记录或明确选择另一轮拆解。</p>}
            {attempt && <List split={false}><List.Item><div className="template-attempt">
                {attempt.failure && <p role="alert">{attempt.failure.message}（{attempt.failure.code}）</p>}
                {attempt.unavailable && <p role="alert">这次拆解的历史证据暂不可读。记录已保留，请核验内容库完整性。</p>}
                {!sourceMatches && !accepted && <p role="alert">当前已切换模板版本。此次结果保留在源版本下，请返回源版本后继续或验收；进行中的尝试也可以直接取消。</p>}
                {attempt.result && <TemplateComparison key={attempt.attemptId} attempt={attempt}/>}
                {attempt.result && !jobAccepted && !attempt.unavailable && !view?.builtin && <div className="template-accept">{activeAttempt && <p>请先完成或取消当前进行中的拆解，再验收历史结果。</p>}<Checkbox className="semi-control-check" checked={confirm} disabled={unavailable || !sourceMatches || !!activeAttempt} onChange={event => setConfirm(event.target.checked === true)}>我已对照样张、规则证据和首张还原效果，确认可用于后续生成。</Checkbox><Button theme="solid" disabled={unavailable || !sourceMatches || !!activeAttempt || !confirm} onClick={() => view && void update(() => invoke('acceptTemplateStudy', {...attempt.reference, resultHash: attempt.result!.resultHash, editToken: view.editToken}))}>确认规则与还原效果，保存为新版本</Button></div>}
                {accepted && <p>验收保存为 v{job?.acceptance?.acceptedTemplate.version}。{view?.currentVersion === job?.acceptance?.acceptedTemplate.version ? '当前版本已记录人工验收，可用于封面生成。' : '当前所选版本不同，此验收记录不会自动套用。'}</p>}
            </div></List.Item></List>}
        </>}
        {view && !attempts.length && !selected && <p className="muted">尚未确认AI拆解结果。手动导入的规则可继续使用，拆解记录将在这里保留。</p>}
    </section>;
}
function TemplateComparison({attempt}: {attempt: TemplateAttemptView}) {
    const result = attempt.result!;
    const [samplesExpanded, setSamplesExpanded] = useState(false);
    return <div><div className="template-comparison"><figure>{attempt.samples[0] && <ImagePreviewButton url={attempt.samples[0].url} label="固定参考组中的第 1 张样张"/>}<figcaption>原样张 · 第 1 张（整组共 {attempt.samples.length} 张）</figcaption></figure><figure><ImagePreviewButton url={result.restore.url} label="助手提交的首张还原图，等待人工确认"/><figcaption>首张还原图 · 待你判断效果</figcaption></figure></div><details onToggle={event => setSamplesExpanded(event.currentTarget.open)}><summary>查看本次固定的全部 {attempt.samples.length} 张样张</summary>{samplesExpanded && <div className="template-evidence-samples">{attempt.samples.map((sample, i) => <figure key={sample.assetHash}><ImagePreviewButton url={sample.url} label={`本次固定参考样张 ${i + 1}`}/><figcaption>样张 {i + 1}</figcaption></figure>)}</div>}</details><div className="template-rules">{(['fixed', 'variable'] as const).map(type => <section key={type}><h4>{type === 'fixed' ? '固定规则' : '可变规则'}</h4><ol>{result.rules[type].map((rule, i) => <li key={`${type}:${i}`}><p>{rule}</p>{result.rules.evidence.filter(e => e.ruleType === type && e.ruleIndex === i).map((e, n) => <p className="muted" key={n}>样张 {attempt.samples.findIndex(s => s.assetHash === e.sourceAssetHash) + 1}：{e.observation}</p>)}</li>)}</ol></section>)}</div></div>;
}
