import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import {DocumentMarkdown} from './document-markdown.tsx';
import {ImagePreviewButton} from './cover-image-viewer.tsx';
import {DOCUMENT_EMBED_DEPTH, DOCUMENT_REFERENCE_LIMIT} from '../shared/document-reading-contracts.ts';
import type {DocumentReader, DocumentReference, DocumentReferenceInput, DocumentReferenceResult, DocumentView, DocumentViewInput} from '../shared/document-reading-contracts.ts';

type Props = {scopeKey: string; document: DocumentViewInput; reader: DocumentReader; title?: string; draftText?: string; fallbackText?: string; onNavigate?(view: DocumentView): void};
type Budget = {claimed: Set<string>};
type ReadingPosition = {scroll: number; trigger: HTMLElement | null; referenceId: string | null};
const message = (error: unknown) => {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
    if (code === 'CONFLICT') return '原文、引用目标或内容库身份已变化，请重新打开资料。原文与本次填写仍保留。';
    if (code === 'SOURCE_NOT_AVAILABLE' || code === 'NOT_FOUND') return '已绑定的原文来源暂不可读，请恢复来源后重新打开。原文与本次填写仍保留。';
    if (code === 'PENDING' || code === 'PENDING_MUTATION') return '原文有待核验或待恢复的操作，请先处理后重新阅读。原文与本次填写仍保留。';
    return error instanceof Error ? error.message : '原文或引用暂不可读取，请恢复来源后重试。';
};
/** Changing library/saved-version unmounts all requests and revokes every Blob URL. */
export function DocumentSourceReader(props: Props) {
    return <ReaderSession key={`${props.scopeKey}:${props.document.documentId}:${props.document.expectedHash}`} {...props}/>;
}
function ReaderSession({document: input, reader, title, draftText, fallbackText, onNavigate}: Props) {
    const [view, setView] = useState<DocumentView | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0);
    const [history, setHistory] = useState<(ReadingPosition & {view: DocumentView})[]>([]);
    const area = useRef<HTMLDivElement>(null), restore = useRef<ReadingPosition | null>(null);
    useEffect(() => {
        let active = true; setView(null); setError(''); setHistory([]);
        void reader.readView(input).then(result => {
            if (!active) return;
            if (result.documentId !== input.documentId || result.hash !== input.expectedHash) throw Error('原文身份或版本已变化，请重新打开。');
            setView(result);
        }).catch(reason => {if (active) setError(message(reason));});
        return () => {active = false;};
    }, [reader, input.documentId, input.expectedHash, retry]);
    useLayoutEffect(() => {
        const target = restore.current; restore.current = null;
        if (area.current) area.current.scrollTop = target?.scroll ?? 0;
        const restored = target?.referenceId ? area.current?.querySelector<HTMLElement>(`[data-document-reference="${target.referenceId}"] button`) : null;
        if (restored) restored.focus({preventScroll: true});
        else if (target?.trigger?.isConnected) target.trigger.focus({preventScroll: true});
        else if (history.length) area.current?.focus({preventScroll: true});
    }, [view]);
    function navigate(next: DocumentView) {
        if (!view) return;
        const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setHistory(old => [...old, {view, scroll: area.current?.scrollTop ?? 0, trigger, referenceId: trigger?.closest('[data-document-reference]')?.getAttribute('data-document-reference') ?? null}]); setView(next); onNavigate?.(next);
    }
    return <section className="document-source-reader" aria-label={title ?? '来源资料阅读'}>
        {history.length > 0 && <Button className="document-reader-back" size="small" onClick={() => {const previous = history.at(-1)!; restore.current = previous; setHistory(old => old.slice(0, -1)); setView(previous.view);}}>返回原文位置</Button>}
        {error ? <div role="alert"><p>{error}</p><Button size="small" onClick={() => setRetry(value => value + 1)}>重新读取原文</Button>{fallbackText!==undefined&&<DocumentMarkdown text={draftText??fallbackText} title={title}/>}</div> : !view ? <><p role="status">正在读取已保存原文…</p>{fallbackText!==undefined&&<DocumentMarkdown text={draftText??fallbackText} title={title}/>}</> : <div ref={area} className="document-source-reader-body" tabIndex={-1}>
            <ViewBody key={`${view.documentId}:${view.hash}`} view={view} reader={reader} title={title} draftText={!history.length ? draftText : undefined} navigate={navigate}/>
        </div>}
    </section>;
}
function ViewBody({view, reader, title, draftText, navigate, budget: parentBudget, depth = 0, ancestry = []}: {view: DocumentView; reader: DocumentReader; title?: string; draftText?: string; navigate(view: DocumentView): void; budget?: Budget; depth?: number; ancestry?: string[]}) {
    const ownedBudget = useMemo<Budget>(() => ({claimed: new Set()}), [view.documentId, view.hash, draftText]), budget = parentBudget ?? ownedBudget;
    const references = new Map<string, DocumentReference[]>();
    for (const reference of view.references) {const queue = references.get(reference.raw) ?? []; queue.push(reference); references.set(reference.raw, queue);}
    const seen = new Map<string, number>(); let count = 0;
    return <>
        {draftText !== undefined && draftText !== view.text && <p className="document-reader-notice" role="status">当前为未保存草稿；新增或改动的引用请保存后解析。</p>}
        <DocumentMarkdown text={draftText ?? view.text} title={title} renderReference={raw => {
            const index = seen.get(raw) ?? 0; seen.set(raw, index + 1);
            const reference = references.get(raw)?.[index];
            if (!reference) return <span className="document-reference-unavailable">{raw}（保存后解析，或本次引用超过 100 项）</span>;
            if (++count > DOCUMENT_REFERENCE_LIMIT) return <span>{raw}（本次引用超过 100 项，可重新打开目标阅读）</span>;
            return <ReferenceSlot key={reference.refId} view={view} reference={reference} reader={reader} navigate={navigate} budget={budget} depth={depth} ancestry={ancestry}/>;
        }}/>
        {view.truncated && <p role="status">本次最多解析 100 个引用，其余原引用仍保留为文字。</p>}
    </>;
}
function ReferenceSlot({view, reference, reader, navigate, budget, depth, ancestry}: {view: DocumentView; reference: DocumentReference; reader: DocumentReader; navigate(view: DocumentView): void; budget: Budget; depth: number; ancestry: string[]}) {
    const [result, setResult] = useState<DocumentReferenceResult | null>(null), [url, setUrl] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [imageFailed, setImageFailed] = useState(false);
    const alive = useRef(true), input: DocumentReferenceInput | null = reference.targetIdentity ? {...(view.scope ? {scope:view.scope} : {}), documentId: view.documentId, expectedHash: view.hash, refId: reference.refId, targetIdentity: reference.targetIdentity} : null;
    const automatic = reference.kind === 'image' || reference.kind === 'embed';
    useEffect(() => {
        let active = true, published = ''; alive.current = true;
        setResult(null); setUrl(''); setError(''); setImageFailed(false);
        if (input && reference.state === 'ready' && automatic) {
            const claim = `${view.documentId}:${reference.refId}`;
            if (!budget.claimed.has(claim) && budget.claimed.size >= DOCUMENT_REFERENCE_LIMIT) setError('本次展开已达 100 个引用上限，可手动打开目标。');
            else if (depth >= DOCUMENT_EMBED_DEPTH) setError('嵌入已达 3 层上限，可手动打开目标。');
            else {
                budget.claimed.add(claim);
                void reader.readReference({...input, intent: 'embed'}).then(value => {
                    if (!active) return;
                    if (value.kind === 'image') {
                        if (value.identity !== reference.targetIdentity || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(value.mime) || value.data.byteLength > 8 * 1024 * 1024) throw Error('图片身份或格式无效，请重新读取原文。');
                        published = URL.createObjectURL(new Blob([new Uint8Array(value.data)], {type: value.mime})); setUrl(published);
                    } else if (value.kind === 'document' && [...ancestry, view.contentIdentity].includes(value.view.contentIdentity)) {setResult({kind: 'limited', message: '检测到循环嵌入，可手动打开目标。'}); return;}
                    setResult(value);
                }).catch(reason => {if (active) setError(message(reason));});
            }
        }
        return () => {active = false; alive.current = false; if (published) URL.revokeObjectURL(published);};
    }, [reader, view.documentId, view.hash, reference.refId, reference.targetIdentity, reference.state, automatic, budget, depth]);
    async function act(external: boolean) {
        if (!input || busy) return;
        setBusy(true); setError('');
        try {
            if (external) await reader.openExternal(input);
            else {const next = await reader.readReference({...input, intent: 'navigate'}); if (alive.current) {if (next.kind === 'document') navigate(next.view); else if (next.kind === 'limited') setError(next.message); else setError('请使用图片预览入口查看此引用。');}}
        } catch (reason) {if (alive.current) setError(message(reason));}
        finally {if (alive.current) setBusy(false);}
    }
    const external = reference.kind === 'link' && /^https?:\/\//i.test(reference.destination), ready = reference.state === 'ready', limited = result?.kind === 'limited' ? result.message : '';
    return <span data-document-reference={reference.refId} className={`document-reference${automatic ? ' document-reference-media' : ''}`}>
        {url && !imageFailed && <span className="document-reference-image" onErrorCapture={() => setImageFailed(true)}><ImagePreviewButton url={url} label={reference.label} loading="eager"/></span>}
        {result?.kind === 'document' && <span className="document-reference-embedded"><ViewBody view={result.view} reader={reader} navigate={navigate} budget={budget} depth={depth + 1} ancestry={[...ancestry, view.contentIdentity]}/></span>}
        <span className="document-reference-source">{reference.raw}</span>
        {!ready && <span className="document-reference-unavailable" role="status">（{reference.issue}）{reference.candidates?.join('；')}</span>}
        {ready && !automatic && <Button size="small" theme="borderless" className={external ? 'document-reference-open-external' : 'document-reference-navigate'} disabled={busy} onClick={() => void act(external)}>{external ? '打开外部链接' : '打开引用笔记'}</Button>}
        {automatic && ready && (error || limited) && <Button size="small" theme="borderless" className="document-reference-navigate" disabled={busy} onClick={() => void act(false)}>手动打开目标</Button>}
        {automatic && ready && !result && !error && <span role="status"> 正在读取引用…</span>}
        {(error || limited || imageFailed) && <span className="document-reference-unavailable" role="status">（{imageFailed ? '图片无法显示，请重新读取原文。' : error || limited}）</span>}
    </span>;
}
