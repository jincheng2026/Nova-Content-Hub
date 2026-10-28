import {ContentJourneyPanel} from './content-journey-panel.tsx';
import {FinalAssetsPanel} from './final-assets.tsx';
import {useEffect, useRef, useState, type ReactNode} from 'react';
import Banner from '@douyinfe/semi-ui-19/lib/es/banner';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import {invoke} from './client.ts';
import {errorInfo} from '../shared/contracts.ts';
import type {VaultDocument, VaultText, VaultWorkContext} from '../shared/vault-contracts.ts';
import {CreationFrame} from './creation-frame.tsx';
import {DocumentMarkdown} from './document-markdown.tsx';
import {ManagedCloseBoundary, ManagementDialog, hasManagedDrafts} from './library-panels.tsx';
import {parseTopicOverview, type TopicOverview} from './jincheng-directory.ts';
import {JinchengPublication} from './jincheng-publication.tsx';
import {JinchengCheckpoints} from './jincheng-checkpoints.tsx';
import {JinchengStageActions} from './jincheng-stage-actions.tsx';
import {detailFiles, resumeDocument, topicReferenceGroups, topicReferences, referenceTargets, type DetailFile, type TopicReference} from './jincheng-work-detail-data.ts';
import {PagedItems} from './paged-items.tsx';
import './jincheng-work-detail.css';

type CloseGuard = (() => Promise<void>) | null;
type ContentTool = 'production' | 'covers' | 'body' | 'materials' | 'publication';
interface Props {
  contentId: string | null;
  resumeOnOpen?: boolean;
  title: string;
  stage: string;
  busy: boolean;
  dirty: boolean;
  activeTool: ContentTool;
  chooseTool(tool: ContentTool): void;
  makeCover(): void;
  showTasks(): void;
  registerCloseGuard(guard: CloseGuard): void;
  sourceNotice: ReactNode;
  children: ReactNode;
}
const filename = (value: string) => value.split('/').at(-1) ?? value;
const roles: Record<string, string> = {'creation-page':'创作页', 'final-script':'录制／定稿', 'working-draft':'工作稿', 'legacy-compare':'历史对照页', 'topic-card':'选题卡', supporting:'参考／其他文件'};
const fileSize = (bytes?: number) => bytes === undefined ? '' : bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function Block({title, count, children}: {title: string; count?: number; children: ReactNode}) {
  return <section className="jincheng-detail-section"><h3>{title}{count !== undefined && <span>{count}</span>}</h3><div className="jincheng-detail-surface">{children}</div></section>;
}

export function JinchengReferences({references, contentId = '', busy, onRead, onLocate, onCopy, onOpen, onReveal}: {
  references: ReturnType<typeof topicReferenceGroups>;
  contentId?: string;
  busy: boolean;
  onRead(id: string): void;
  onLocate(id: string): void;
  onCopy(target: string, video: boolean): void;
  onOpen?(target: string): void;
  onReveal?(target: string): void;
}) {
  function linkRow(link: TopicReference, video = false) {
    return <div className="jincheng-detail-reference-link" key={link.target}>
      <div className="jincheng-detail-file"><strong>{link.title}</strong><p className="jincheng-detail-path">{link.target}</p></div>
      <div className="actions">{link.document && <>{link.document.format !== 'other' && <Button size="small" disabled={busy} onClick={() => onRead(link.document!.id)}>{/逐字稿/.test(link.title + link.target) ? '阅读逐字稿' : '阅读资料'}</Button>}<Button size="small" theme="borderless" disabled={busy} onClick={() => onLocate(link.document!.id)}>定位原件</Button></>}{link.url ? <>{onOpen && <Button size="small" disabled={busy} onClick={() => onOpen(link.url!)}>{video ? '打开原视频' : '打开链接'}</Button>}<Button size="small" theme="borderless" disabled={busy} onClick={() => onCopy(link.url!, video)}>{video ? '复制原视频链接' : '复制链接'}</Button></> : !link.document && <Button size="small" disabled={busy} onClick={() => onCopy(link.target, false)}>复制位置</Button>}</div>
    </div>;
  }
  return <>
    {references.videos.length > 0 && <Block title="参考视频" count={references.videos.length}>{<PagedItems items={references.videos} resetKey={contentId} label="参考视频分页">{pageItems => pageItems.map(reference => <article className="jincheng-detail-reference" key={reference.key}><h4>{reference.title}</h4>{onReveal && reference.key.startsWith('02_内容素材/') && <Button size="small" theme="borderless" disabled={busy} onClick={() => onReveal(reference.key)}>定位素材文件夹</Button>}{<PagedItems items={reference.links} resetKey={contentId + reference.key} label={`视频资料分页 · ${reference.title}`} compact>{pageItems => pageItems.map(link => linkRow(link, !!link.url))}</PagedItems>}</article>)}</PagedItems>}</Block>}
    {references.materials.length > 0 && <Block title="参考资料" count={references.materials.length}>{<PagedItems items={references.materials} resetKey={contentId} label="参考资料分页">{pageItems => pageItems.map(link => <article className="jincheng-detail-row" key={link.target}>{linkRow(link)}</article>)}</PagedItems>}</Block>}
  </>;
}

export function JinchengWorkDetail(props: Props) {
  return <ManagedCloseBoundary register={props.registerCloseGuard}>{flush => <WorkDetail {...props} flush={flush}/>}</ManagedCloseBoundary>;
}

function WorkDetail({contentId, resumeOnOpen = false, title, stage, busy, dirty, activeTool, chooseTool, makeCover, showTasks, sourceNotice, children, flush}: Props & {flush(): Promise<void>}) {
  const [context, setContext] = useState<VaultWorkContext | null>(null);
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [referenceDocuments, setReferenceDocuments] = useState<ReturnType<typeof referenceTargets>>([]);
  const [cards, setCards] = useState<VaultText[]>([]);
  const [overview, setOverview] = useState<TopicOverview | null>(null);
  const [loading, setLoading] = useState(!!contentId), [notice, setNotice] = useState(''), [working, setWorking] = useState(false);
  const [pageId, setPageId] = useState<string | null>(null), [readable, setReadable] = useState<VaultText | null>(null);
  const [tools, setTools] = useState(false);
  const [supportKey, setSupportKey] = useState(0);
  const [support, setSupport] = useState<'assistant' | 'writing' | 'publication' | 'checkpoints' | 'final-assets' | null>(null);
  const [bodyFocus, setBodyFocus] = useState<{contentId: string | null} | null>(null);
  const active = useRef(false);
  const resumed = useRef(false);
  const frameRegion = useRef<HTMLElement | null>(null);
  const bodyRegion = useRef<HTMLDivElement | null>(null);
  const work = context?.content;

  useEffect(() => {
    if (!contentId) {setLoading(false); return;}
    let live = true, reading = false, queued = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => {void load();}, 250); };
    async function load() {
      if (!live) return;
      if (reading) {queued = true; return;}
      reading = true;
      try {
      const next = await invoke('readVaultWorkContext', {contentId: contentId!});
      if (!live) return;
      setContext(next);
      if (!next?.content) {setLoading(false); return;}
      const snapshot = await invoke('readVault');
      if (!live) return;
      const docs = snapshot?.documents ?? [];
      setDocuments(docs);
      setReferenceDocuments(referenceTargets(snapshot));
      const topicIds = detailFiles(next.content, docs).topicCards.map(file => file.documentId);
      const results = await Promise.allSettled(topicIds.map(id => invoke('readVaultDocument', {id})));
      if (!live) return;
      setCards(results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []));
      if (results.some(result => result.status === 'rejected')) setNotice('有选题卡暂时未读到，原文件入口保留，可定位核对。');
      const source = docs.find(doc => doc.section === 'topics' && /(?:00_)?选题总览\.md$/.test(doc.relativePath));
      if (source) {
        const value = await invoke('readVaultDocument', {id: source.id});
        if (live) setOverview(parseTopicOverview(value.text));
      }
      } catch (error) {if (live) setNotice(errorInfo(error).message);}
      finally {reading = false; if (live) {setLoading(false); if (queued) {queued = false; refresh();}}}
    }
    void load();
    window.addEventListener('nova-vault-source-changed', refresh);
    window.addEventListener('nova-workspace-refresh', refresh);
    return () => {live = false; clearTimeout(timer); window.removeEventListener('nova-vault-source-changed', refresh); window.removeEventListener('nova-workspace-refresh', refresh);};
  }, [contentId]);

  useEffect(() => {
    if (pageId) frameRegion.current?.scrollIntoView({block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  }, [pageId]);

  useEffect(() => {
    if (!bodyFocus || bodyFocus.contentId !== contentId || activeTool !== 'body' || support || busy || working) return;
    // The parent's guarded tool change may finish after this click. Only focus
    // the committed editor in this detail, after its layout is available.
    const frame = requestAnimationFrame(() => {
      const editor = bodyRegion.current?.querySelector<HTMLTextAreaElement>('textarea#content-body');
      if (!editor?.isConnected || editor.disabled || !editor.getClientRects().length || editor.closest('[hidden], [aria-hidden="true"]')) return;
      editor.focus({preventScroll: true});
      editor.scrollIntoView({block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
      setBodyFocus(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [bodyFocus, contentId, activeTool, support, busy, working]);

  async function run(action: () => Promise<void>) {
    if (active.current || busy) return;
    active.current = true; setWorking(true); setNotice('');
    try {await action();} catch (error) {setNotice(errorInfo(error).message);}
    finally {active.current = false; setWorking(false);}
  }
  async function auxiliaryAction(action: () => void) {
    await run(async () => {
      await flush();
      if (dirty) throw new Error('标题与正文还有未保存的草稿，请先保存后再切换辅助操作。');
      if (hasManagedDrafts()) throw new Error('当前辅助窗口有未保存的填写，请先保存或清空本次填写后再切换。');
      action();
    });
  }
  function switchTool(tool: ContentTool, focusBody = false) {
    void auxiliaryAction(() => {setBodyFocus(focusBody ? {contentId} : null); setSupport(null); setTools(true); chooseTool(tool);});
  }
  function openSupport(value: 'assistant' | 'writing' | 'publication' | 'checkpoints' | 'final-assets') {
    void auxiliaryAction(() => {setBodyFocus(null); setSupport(value); setSupportKey(key => key + 1); setTools(true);});
  }
  async function openPage(id: string | null) {
    await run(async () => {await flush(); setPageId(id);});
  }
  async function read(id: string) {await run(async () => {setReadable(await invoke('readVaultDocument', {id}));});}
  async function locate(id?: string) {
    await run(async () => {
      if (id) await invoke('revealVaultDocument', {id});
      else if (contentId) await invoke('revealVaultContentDirectory', {contentId});
    });
  }
  async function selectSource(documentId: string, expectedHash: string) {
    if (!work || !context?.workflow || !contentId || dirty) return;
    await run(async () => {
      await flush();
      const candidate = work!.sourceCandidates.find(item => item.documentId === documentId);
      const next = await invoke('selectVaultCurrentWork', {contentId: contentId!, documentId, expectedHash, expectedRevision: context!.workflow!.revision, decisionText: `我明确选择 ${candidate?.relativePath ?? documentId} 作为本内容接着写的当前入口；保留其他原件。`});
      setContext(next); window.dispatchEvent(new Event('nova-vault-source-changed'));
    });
  }
  const files = work ? detailFiles(work, documents) : {pages: [], topicCards: [], others: []};
  const references = topicReferenceGroups(cards, referenceDocuments);
  const referenceIds = new Set([...references.videos.flatMap(reference => reference.links), ...references.materials].flatMap(reference => reference.document ? [reference.document.id] : []));
  const others = files.others.filter(file => !referenceIds.has(file.documentId));
  const selectedId = work ? resumeDocument(work) : null;
  const currentPage = files.pages.find(file => file.documentId === pageId);
  const currentFile = work?.sourceCandidates.find(file => file.documentId === selectedId);
  const plan = work ? overview?.plans.get(work.tNumber) : undefined;
  const row = work ? overview?.rows.get(work.tNumber) : undefined;
  const deferred = work ? overview?.deferred.get(work.tNumber) : undefined;
  const disabled = busy || working;
  const source = work?.sourceResolution === 'resolved' ? {documentId: work.sourceDocumentId, expectedHash: work.hash} : undefined;

  function resumeCurrent() {
    if (!selectedId || disabled || dirty) return;
    const page = files.pages.find(file => file.documentId === selectedId);
    if (page?.editable) void openPage(selectedId);
    else if (currentFile && documents.find(document => document.id === selectedId)?.writable) switchTool('body', true);
    else void read(selectedId);
  }
  useEffect(() => {
    if (!resumeOnOpen || resumed.current || loading || !work || busy || working || dirty) return;
    // Only the resolved source may be resumed, never a newest/first HTML fallback.
    resumed.current = true;
    resumeCurrent();
  }, [resumeOnOpen, loading, work, busy, working, dirty]);

  function fileRow(file: DetailFile, page = false) {
    const isCurrent = selectedId === file.documentId;
    return <article className="jincheng-detail-row" key={file.documentId}>
      <div className="jincheng-detail-file"><strong>{filename(file.relativePath)}</strong><div className="jincheng-detail-file-meta"><span>{page ? file.role && file.role !== 'supporting' ? roles[file.role] ?? '网页' : '网页' : file.role ? roles[file.role] ?? file.role : '文件'}</span>{isCurrent && <span className="jincheng-detail-current">接着写的当前入口</span>}{file.document?.bytes !== undefined && <span>{fileSize(file.document.bytes)}</span>}</div><p className="jincheng-detail-path">{file.relativePath}</p>{page && <p className="jincheng-detail-write-note">{file.editable ? '自动保存' : '此页未接入原页编辑，保留可读取正文与原文件入口。'}</p>}</div>
      <div className="actions">{page && file.editable ? <Button size="small" theme="solid" disabled={disabled} onClick={() => void openPage(file.documentId)}>{pageId === file.documentId ? '正在打开' : '在这里打开'}</Button> : <Button size="small" disabled={disabled} onClick={() => void read(file.documentId)}>{page ? '阅读正文' : '阅读'}</Button>}<Button size="small" theme="borderless" disabled={disabled} onClick={() => void locate(file.documentId)}>定位原件</Button></div>
    </article>;
  }

  return <div className="jincheng-work-detail">
    <section className="jincheng-detail-header">
      <div className="jincheng-detail-state">{work && <span className="jincheng-detail-number">{work.tNumber}</span>}{row?.type && <span className="tag">{row.type}</span>}<span className="tag">{work ? work.published ? '已有发布标记' : work.recorded ? '已录制' : row?.status || '尚未录制' : stage}</span><span id="dirty-state">{dirty ? '有未保存草稿' : '已保存'}</span></div>
      <h2>{title || '未命名内容'}</h2>
      {row?.summary && <p className="jincheng-detail-summary">{row.summary}</p>}
      {(plan || deferred) && <p className="jincheng-detail-summary">{deferred ? `暂缓／顺延：${deferred.text} · ${deferred.date}` : `${plan!.date} · ${plan!.text}`}</p>}
      {loading && <p role="status">正在读取选题卡与内容文件…</p>}
      {work && <div className="jincheng-detail-main-actions"><Button theme="solid" disabled={disabled || dirty || !selectedId} onClick={resumeCurrent}>接着写</Button>{<PagedItems items={files.topicCards} resetKey={contentId ?? ''} label="选题卡原文件分页" compact>{pageItems => pageItems.map(card => <Button key={card.documentId} disabled={disabled} onClick={() => void read(card.documentId)}>选题卡原文件{files.topicCards.length > 1 ? ` · ${filename(card.relativePath)}` : ''}</Button>)}</PagedItems>}<Button disabled={disabled} onClick={() => void locate()}>打开稿件文件夹</Button></div>}
      {work && <details className="jincheng-detail-facts"><summary>选题卡里的其他信息</summary>{row?.source && <p>来源：{row.source}</p>}{row?.publishDate && <p>原记录发布日期：{row.publishDate}</p>}<p className="jincheng-detail-path">当前入口：{work.relativePath}</p><p className="jincheng-detail-path">稿件目录：{context?.contentDirectory}</p><p>{work.recorded ? '已找到实际录完稿记录' : '尚无实际录完稿记录'} · {work.published ? '原来源有已发布标记；档案与平台记录可在“发布与档案”核对' : '尚无明确发布标记'}</p>{<PagedItems items={context?.sourceIssues ?? []} resetKey={contentId ?? ''} label="来源提示分页" compact>{pageItems => pageItems.map(issue => <p key={issue.message}>{issue.message}</p>)}</PagedItems>}</details>}
      {!work && !loading && <p className="jincheng-detail-summary">{contentId ? '本篇尚无绑定的原选题卡与创作页，可从更多操作继续创作。' : '先记资料或想法，标题可以稍后确定。'}</p>}
    </section>
    {notice && <Banner type="warning" closeIcon={null} description={notice}/>}
    {(!work || work.sourceResolution === 'resolved') && sourceNotice}
    {work && work.sourceResolution !== 'resolved' && <section className="jincheng-source-conflict" role="alert"><strong>{work.sourceResolution === 'missing' ? '原当前入口缺失' : '当前稿需要你选择'}</strong><p>{work.sourceConflict || '保留各个原件，请选择这次接着写的入口。'}</p>{dirty && <p>请先保存当前草稿，再选择入口。</p>}{<PagedItems items={work.sourceCandidates} resetKey={contentId ?? ''} label="当前入口候选分页">{pageItems => pageItems.map(candidate => <div className="jincheng-detail-row" key={candidate.documentId}><div className="jincheng-detail-file"><strong>{filename(candidate.relativePath)}</strong><p className="jincheng-detail-path">{candidate.relativePath}</p><details><summary>入口判定依据</summary><pre className="jincheng-readable-source">{JSON.stringify(candidate.evidence, null, 2)}</pre></details></div><div className="actions"><Button disabled={disabled} onClick={() => void read(candidate.documentId)}>阅读原件</Button><Button disabled={disabled || dirty || !context?.workflow} onClick={() => void selectSource(candidate.documentId, candidate.hash)}>选为这次接着写的入口</Button></div></div>)}</PagedItems>}</section>}
    {work && contentId && !loading && <ContentJourneyPanel contentId={contentId} busy={disabled} dirty={dirty} makeCover={makeCover} showCheckpoints={()=>openSupport('checkpoints')} showFinalAssets={()=>openSupport('final-assets')}/>}
    {work && !loading && files.pages.length === 0 && <section className="jincheng-detail-empty"><p>尚无创作页。</p><Button theme="solid" disabled={disabled || dirty || work.sourceResolution !== 'resolved'} onClick={() => openSupport('writing')}>和助手新建创作页</Button></section>}
    {files.pages.length > 0 && <Block title="网页" count={files.pages.length}>{<PagedItems items={files.pages} resetKey={contentId ?? ''} label="网页分页">{pageItems => pageItems.map(file => fileRow(file, true))}</PagedItems>}</Block>}
    {pageId && <section className="jincheng-detail-frame" ref={frameRegion} aria-label="打开的创作页"><div className="jincheng-detail-frame-heading"><div><h3>{currentPage ? filename(currentPage.relativePath) : '原创作页'}</h3><p>正在编辑</p></div><Button disabled={disabled} onClick={() => void openPage(null)}>关闭创作页</Button></div><CreationFrame key={pageId} documentId={pageId} busy={disabled}/></section>}
    <JinchengReferences references={references} contentId={contentId ?? ''} busy={disabled} onRead={id => void read(id)} onLocate={id => void locate(id)} onOpen={target => void run(async () => {
      const card = cards.find(item => topicReferences([item], documents).some(link => link.url === target));
      if (!card) throw new Error('原选题卡已变化，请刷新后再打开。');
      await invoke('openVaultReference', {id: card.document.id, url: target});
    })} onReveal={target => void run(async () => {
      const card = cards.find(item => topicReferences([item], documents).some(link => !link.url && (link.target.replace(/\/$/, '') === target || link.target.startsWith(target + '/'))));
      if (!card) throw new Error('原选题卡已变化，请刷新后核对素材位置。');
      await invoke('revealVaultReference', {id: card.document.id, target});
    })} onCopy={(target, video) => void run(async () => {await invoke('copyPrompt', {text: target}); setNotice(video ? '原视频链接已复制。' : /^https?:\/\//i.test(target) ? '链接已复制。' : '原卡中的位置已复制。');})}/>
    {(others.length > 0 || (work?.sourceCandidates.length ?? 0) > 1) && <Block title="其他文件与历史" count={others.length}>{<PagedItems items={others} resetKey={contentId ?? ''} label="其他文件分页">{pageItems => pageItems.map(file => fileRow(file))}</PagedItems>}{work?.sourceResolution === 'resolved' && work.sourceCandidates.length > 1 && <details className="jincheng-detail-facts"><summary>更换接着写的入口</summary>{<PagedItems items={work.sourceCandidates.filter(candidate => candidate.documentId !== selectedId)} resetKey={contentId ?? ''} label="更换当前入口分页">{pageItems => pageItems.map(candidate => <div className="jincheng-detail-row" key={candidate.documentId}><p className="jincheng-detail-path">{candidate.relativePath}</p><Button disabled={disabled || dirty || !context?.workflow} onClick={() => void selectSource(candidate.documentId, candidate.hash)}>选为当前入口</Button></div>)}</PagedItems>}</details>}</Block>}
    <section className="jincheng-detail-tools" aria-label="内容辅助操作"><div className="jincheng-detail-tool-actions"><Button id="make-content-cover" disabled={disabled || !contentId} onClick={() => void auxiliaryAction(() => {setSupport(null); setTools(true); makeCover();})}>制作封面</Button><Button disabled={disabled || !contentId} onClick={() => openSupport('final-assets')}>最终资产</Button><Button disabled={disabled || !contentId} onClick={() => openSupport('publication')}>发布与档案</Button><Button theme="borderless" aria-expanded={tools || activeTool !== 'production'} onClick={() => void auxiliaryAction(() => {if (tools || activeTool !== 'production') {setTools(false); setSupport(null); chooseTool('production');} else setTools(true);})}>更多操作{tools || activeTool !== 'production' ? ' · 收起' : ''}</Button></div>
      {(tools || activeTool !== 'production') && <div className="jincheng-detail-auxiliary"><div className="jincheng-detail-tool-menu" aria-label="更多内容操作">{([['body', '标题与正文'], ['materials', '资料与设置'], ['publication', '发布计划']] as const).map(([key, label]) => <Button key={key} theme={!support && activeTool === key ? 'solid' : 'borderless'} disabled={disabled} onClick={() => switchTool(key)}>{label}</Button>)}{!files.pages.length && <Button theme={activeTool === 'production' && !support ? 'solid' : 'borderless'} disabled={disabled} onClick={() => switchTool('production')}>旧创作任务与历史回执</Button>}{work && <><Button theme={support === 'assistant' ? 'solid' : 'borderless'} disabled={disabled} onClick={() => openSupport('assistant')}>和助手继续创作</Button><Button theme={support === 'checkpoints' ? 'solid' : 'borderless'} disabled={disabled} onClick={() => openSupport('checkpoints')}>阶段确认与验收</Button></>}<Button theme="borderless" disabled={disabled} onClick={showTasks}>助手任务与原任务继续</Button></div>
        {!support && !(activeTool === 'production' && files.pages.length > 0) && <div ref={bodyRegion}>{children}</div>}
        {work && contentId && support === 'final-assets' && <FinalAssetsPanel key={contentId} contentId={contentId} documents={documents} busy={disabled} flush={flush} makeCover={()=>void auxiliaryAction(()=>{setSupport(null);setTools(true);makeCover();})}/>}
        {work && contentId && support === 'publication' && <JinchengPublication contentId={contentId} busy={disabled || dirty}/>}
        {work && contentId && context && support === 'checkpoints' && <JinchengCheckpoints contentId={contentId} context={context} busy={disabled || dirty} changed={setContext}/>}
        {work && contentId && support === 'writing' && <JinchengStageActions key={`writing:${supportKey}`} actions={['writing']} initialAction="writing" contentId={contentId} source={source} busy={disabled || dirty || work.sourceResolution !== 'resolved'} showTasks={showTasks} title="和助手新建创作页"/>}
        {work && contentId && support === 'assistant' && <JinchengStageActions contentId={contentId} source={source} busy={disabled || dirty || work.sourceResolution !== 'resolved'} showTasks={showTasks}/>}
      </div>}
    </section>
    {readable && <ManagementDialog title={readable.document.title} busy={disabled} dirty={false} close={() => setReadable(null)}><p className="jincheng-detail-path">{readable.document.relativePath}</p>{readable.document.format === 'markdown' ? <DocumentMarkdown text={readable.text} title={readable.document.title}/> : <pre className="jincheng-readable-source">{readable.text}</pre>}<div className="actions"><Button disabled={disabled || new TextEncoder().encode(readable.text).byteLength > 256 * 1024} onClick={() => void run(async () => {await invoke('copyPrompt', {text: readable.text}); setNotice('已复制当前显示的完整文本。');})}>复制全文</Button><Button disabled={disabled} onClick={() => void locate(readable.document.id)}>定位原件</Button></div></ManagementDialog>}
  </div>;
}
