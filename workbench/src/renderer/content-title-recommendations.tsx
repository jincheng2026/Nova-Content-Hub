import {useEffect, useRef, useState} from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import type {Content} from '../shared/contracts.ts';
import {errorInfo} from '../shared/contracts.ts';
import type {ProductionCreationState, ProductionSnapshot} from '../shared/production-contracts.ts';
import {collectTitleRecommendations} from '../shared/content-title-recommendations.ts';
import type {ContentTitleRecommendation} from '../shared/content-title-recommendations.ts';
import {invoke} from './client.ts';
import './content-title-recommendations.css';

interface Props {
    content: Content | null; dirty: boolean; busy: boolean; conflict: boolean;
    run(action: () => Promise<void>): Promise<unknown>;
    adopt(candidate: ContentTitleRecommendation): boolean;
    showTasks(): void;
}
const statuses: Record<string, string> = {created: '待发送给助手', claimed: '助手处理中', 'waiting-user': '等待你补充信息', 'waiting-permission': '等待宿主权限确认', submitted: '已提交，待人工验收', accepted: '已人工验收', failed: '任务失败', cancelled: '任务已取消'};
export function ContentTitleRecommendations({content, dirty, busy, conflict, run, adopt, showTasks}: Props) {
    const [open, setOpen] = useState(false), [pending, setPending] = useState(false), [notice, setNotice] = useState('');
    const [data, setData] = useState<{state: ProductionCreationState; snapshot: ProductionSnapshot} | null>(null);
    const live = useRef(true);
    useEffect(() => {live.current = true; return () => {live.current = false;};}, []);
    const blocked = busy || pending;
    const canApply = !blocked && !dirty && !conflict && !!content && !content.deletedAt && data?.state.content.editToken === content.editToken;
    async function read() {
        if (!content) return;
        const [state, snapshot] = await Promise.all([invoke('readProductionCreation', {contentId: content.id}), invoke('readProduction')]);
        if (state.productionToken !== snapshot.editToken) throw new Error('候选读取期间资料发生变化，请重新读取。');
        if (live.current) setData({state, snapshot});
    }
    async function action(work: () => Promise<void>) {
        if (blocked) return;
        setPending(true); setNotice('');
        try {await run(work);} catch (failure) {if (live.current) setNotice(errorInfo(failure).message);}
        finally {if (live.current) setPending(false);}
    }
    const candidates = data ? collectTitleRecommendations({content: data.state.content, creation: data.state.creation, tasks: data.snapshot.tasks}) : [];
    const tasks = data?.snapshot.tasks.filter(task => task.contentId === content?.id && task.kind === 'packaging').slice().reverse() ?? [];
    return <section className="content-title-recommendations" aria-label="AI 标题推荐">
      <Button id="toggle-title-recommendations" theme="borderless" disabled={blocked} aria-expanded={open} aria-controls="content-title-recommendations-panel" onClick={() => {setOpen(!open); if (!open && content) void action(read);}}>AI 推荐标题</Button>
      {open && <div id="content-title-recommendations-panel" className="content-title-recommendations-panel">
        <p>让设置中的 AI 助手根据已保存的内容推荐标题。任务提交后先到“助手任务”人工验收，再回来读取候选；采用后请保存内容。</p>
        <div className="actions"><Button id="generate-title-recommendations" disabled={blocked || dirty || conflict || !content || !!content.deletedAt} loading={pending} onClick={() => void action(async () => {
            if (!content || dirty || conflict) return;
            const current = await invoke('readProductionCreation', {contentId: content.id});
            if (current.content.editToken !== content.editToken) throw new Error('内容已在其他位置改变，请先处理正文版本再推荐标题。');
            const result = await invoke('startProductionTask', {kind: 'packaging', title: `${content.title.slice(0, 475)} · 推荐内容标题`, prompt: '请基于本任务固定的已保存标题与正文，推荐 5 个不同表达角度的内容标题。贴合正文事实，不编造效果、数字或来源；每个标题不超过 500 字。仅提交 packaging 类型产物，结构化 data.packaging.titles 为带 UUID id 与 text 的候选数组，coverTexts 与 intros 可为空数组。保留人工选用，不直接修改内容、不自动选定标题、不发布。', contentId: content.id, mode: 'simple', comments: false});
            await read();
            if (live.current) setNotice(result.opened ? '已打开助手，请在助手中选择模型并手动发送。进度、等待、取消、重试和人工验收都在“助手任务”中继续。' : result.message ?? '任务已保存，请到“助手任务”继续打开助手。');
        })}>让助手推荐标题</Button><Button id="refresh-title-recommendations" disabled={blocked || !content} onClick={() => void action(read)}>读取最新候选</Button><Button disabled={blocked} onClick={showTasks}>查看助手任务</Button></div>
        {!content && <p role="status">先保存这篇内容，再让助手推荐标题。</p>}
        {dirty && <p role="status">请先保存或放弃当前标题与正文修改，再生成或采用推荐；当前草稿会保留。</p>}
        {conflict && <p role="status">内容存在版本冲突，请先在正文处理冲突。</p>}
        {data && content && data.state.content.editToken !== content.editToken && <p role="status">候选对应的内容版本与编辑器不同，请先读取最新内容。</p>}
        {notice && <p className="content-title-notice" role="status">{notice}</p>}
        {!!tasks.length && <details><summary>标题与包装任务（{tasks.length}）</summary>{tasks.map(task => {const attempt = task.attempts.find(value => value.id === task.activeAttemptId); return <p key={task.id}>{task.title} · {statuses[attempt?.status ?? ''] ?? '状态未知'}{attempt?.message ? ` · ${attempt.message}` : ''}</p>;})}</details>}
        {!!candidates.length && <div className="content-title-candidates">{candidates.map(candidate => <article key={candidate.key} className="content-title-candidate"><p className="content-title-candidate-text">{candidate.text}</p><p className="content-title-candidate-source">{candidate.source}{candidate.stale ? ' · 基于旧版正文，请先核对' : ''}</p><Button size="small" disabled={!canApply} onClick={() => {if (adopt(candidate)) setNotice('已采用到标题草稿，正文保持原样；请点击“保存内容”完成保存。');}}>{candidate.stale ? '采用旧稿候选到标题草稿' : '采用到标题草稿'}</Button></article>)}</div>}
        {data && !candidates.length && <p>还没有可采用的标题候选。可新建推荐任务，或在“助手任务”验收已有包装结果。</p>}
      </div>}
    </section>;
}
