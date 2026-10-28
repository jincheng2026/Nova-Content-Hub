import {useEffect,useMemo,useRef,useState} from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import Input from '@douyinfe/semi-ui-19/lib/es/input';
import Banner from '@douyinfe/semi-ui-19/lib/es/banner';
import Radio from '@douyinfe/semi-ui-19/lib/es/radio';
import type {Content} from '../shared/contracts.ts';
import type {VaultWorkDirectoryRow,VaultSnapshot} from '../shared/vault-contracts.ts';
import type {ProductionSnapshot} from '../shared/production-contracts.ts';
import type {WorkspaceLibrarySnapshot} from '../shared/workspace-contracts.ts';
import {invoke} from './client.ts';
import {PopupSelect} from './semi-controls.tsx';
import {parseTopicOverview,workMatches,classifyWork} from './jincheng-directory.ts';
import {JinchengTopicMenus} from './jincheng-topic-menus.tsx';
import {JinchengStageActions} from './jincheng-stage-actions.tsx';
import {PaginationBar} from './pagination-bar.tsx';
import './jincheng-workbench.css';
import './jincheng-content-cards.css';
export type DirectoryUIState={query:string;type:string;status:'all'|'todo'|'paused'|'written';view:'cards'|'list';page:number;pageSize:number;doingSort?:'recent'|'plan';deferredPage:number;pastPage:number};
export function createDirectoryUIState():DirectoryUIState{return {query:'',type:'all',status:'all',view:'cards',page:1,pageSize:20,deferredPage:1,pastPage:1};}
export function JinchengContentDirectory({mode,contents,busy=false,embedded=false,library,openContent,resumeContent,createContent,uiState,onUIStateChange}:{mode:'topics'|'doing'|'published';contents:Content[];busy?:boolean;embedded?:boolean;library?:WorkspaceLibrarySnapshot|null;openContent(id:string):void;resumeContent?(id:string):void;createContent?():void;uiState?:DirectoryUIState;onUIStateChange?:(patch:Partial<DirectoryUIState>)=>void}){
 const [vault,setVault]=useState<VaultSnapshot|null>(null),[workRows,setWorkRows]=useState<VaultWorkDirectoryRow[]>([]),[production,setProduction]=useState<ProductionSnapshot|null>(null),[overviewText,setOverviewText]=useState(''),[loaded,setLoaded]=useState(false),[notice,setNotice]=useState(''),[version,setVersion]=useState(0);
 const [localUIState,setLocalUIState]=useState<DirectoryUIState>(uiState??{query:'',type:'all',status:'all',view:'cards',page:1,pageSize:20,deferredPage:1,pastPage:1});
 const {query,type,status='all',view,page,pageSize,doingSort='recent'}=uiState??localUIState;
 const updateUI=(patch:Partial<DirectoryUIState>)=>{setLocalUIState(current=>({...current,...patch}));onUIStateChange?.(patch);};
 const resetPages={page:1};
 const setQuery=(query:string)=>updateUI({query,...resetPages}),setType=(type:string)=>updateUI({type,...resetPages}),setStatus=(value:string)=>updateUI({status:value==='todo'||value==='paused'||value==='written'?value:'all',...resetPages}),setPageSize=(pageSize:number)=>updateUI({pageSize,...resetPages});
 // Parent background reads replace the array even when no content changed.
 // Only committed content revisions invalidate facts; notifications coalesce into
 // one follow-up rather than cancelling the batch that is already in flight.
 const contentRevision=JSON.stringify(contents.map(content=>[content.id,content.editToken,content.deletedAt]));
 const refreshDirectory=useRef<(()=>void)|null>(null);
 useEffect(()=>{
  let live=true,running=false,requested=false;
  const refresh=()=>{
   if(running){requested=true;return;}
   running=true;setNotice('');
   void Promise.allSettled([invoke('readVault'),invoke('readProduction'),invoke('readVaultWorkDirectory')]).then(async results=>{
    if(!live)return;
    const v=results[0].status==='fulfilled'?results[0].value:null,p=results[1].status==='fulfilled'?results[1].value:null;
    setVault(v);setProduction(p);setWorkRows(results[2].status==='fulfilled'?results[2].value:[]);setOverviewText('');
    if(results.some(result=>result.status==='rejected'))setNotice('部分来源暂时未读到，下面仅显示已核对的内容；可刷新重试。');
    const source=v?.documents.find(doc=>doc.section==='topics'&&/(?:00_)?选题总览\.md$/.test(doc.relativePath));
    if(source){try{const document=await invoke('readVaultDocument',{id:source.id});if(live)setOverviewText(document.text);}catch{if(live)setNotice('原选题总览暂时不可读，拍摄顺序和暂缓安排待核验。');}}
   }).catch(()=>{if(live)setNotice('目录来源暂时不可读，可刷新重试。');}).finally(()=>{
    running=false;if(!live)return;setLoaded(true);
    if(requested){requested=false;refresh();}
   });
  };
  refreshDirectory.current=refresh;
  window.addEventListener('nova-workspace-refresh',refresh);window.addEventListener('nova-vault-source-changed',refresh);
  return()=>{live=false;refreshDirectory.current=null;window.removeEventListener('nova-workspace-refresh',refresh);window.removeEventListener('nova-vault-source-changed',refresh);};
 },[]);
 useEffect(()=>{refreshDirectory.current?.();},[contentRevision,version]);
 const overview=useMemo(()=>parseTopicOverview(overviewText),[overviewText]);
 const rows=contents.filter(content=>!content.deletedAt).map(content=>{
  const fact=workRows.find(row=>row.contentId===content.id);
  const docs=vault?.documents.filter(doc=>doc.contentId===content.id)??[],creation=production?.creations.find(item=>item.contentId===content.id),tNumber=fact?.tNumber??docs.find(doc=>doc.tNumber)?.tNumber??creation?.tNumber??'',number=Number(tNumber.replace(/^T/,''))||0,entry=overview.rows.get(tNumber);
  const document=library?.contentDetails.find(item=>item.id===content.id),publications=document?.publications.filter(item=>!document.publicationEvents.some(event=>event.targetId===item.id))??[];
  const published=publications.length>0||fact?.published===true||entry?.status==='已发布'||!!entry?.publishDate&&/\d{4}[-./年]\d/.test(entry.publishDate),recorded=fact?.recorded||entry?.recorded||false,hasDraft=fact?.hasDraft??(docs.some(doc=>doc.section==='drafts'&&(doc.format==='html'||doc.format==='markdown'&&!/参考拆解|总览|原始|素材|转写|逐字稿/.test(doc.relativePath)))||!!creation&&(!!creation.analysis.trim()||!!creation.narrative.trim()||['writing','ready'].includes(creation.stage)));
  const category=classifyWork({published,recorded,hasDraft,paused:fact?.topicStatus?.paused}),deferred=fact?.topicStatus?.paused?{text:'原选题卡：'+(fact.topicStatus.reason??fact.topicStatus.status??'暂缓'),date:overview.deferred.get(tNumber)?.date??''}:overview.deferred.get(tNumber),plan=overview.plans.get(tNumber),index=overview.order.indexOf(tNumber),order=index<0?null:index+1;
  const inferredType=entry?.type||docs.find(doc=>doc.section==='topics')?.relativePath.split('/')[1]||'未分类';
  const topicStatus:Exclude<DirectoryUIState['status'],'all'>=category!=='topics'?'written':deferred?'paused':'todo';
  return {content,fact,tNumber,number,entry,category,deferred,plan,order,topicStatus,type:inferredType,published,recorded,publications,creation,hasDraft,docs};
 });
 const types=[...new Set(rows.map(row=>row.type))],shown=rows.filter(row=>(type==='all'||row.type===type)&&workMatches(query,{tNumber:row.tNumber,title:row.content.title,summary:row.entry?.summary??''}));
 const next=shown.filter(row=>row.category==='topics'&&!row.deferred).sort((a,b)=>(a.order??999)-(b.order??999)||a.number-b.number),deferred=shown.filter(row=>row.category==='topics'&&row.deferred).sort((a,b)=>a.number-b.number),past=shown.filter(row=>row.category!=='topics').sort((a,b)=>b.number-a.number),doing=shown.filter(row=>row.category==='doing').sort((a,b)=>doingSort==='plan'?(a.order??999)-(b.order??999)||a.number-b.number:(library?.contentDetails.find(item=>item.id===b.content.id)?.createdAt??'').localeCompare(library?.contentDetails.find(item=>item.id===a.content.id)?.createdAt??'')||b.number-a.number),published=shown.filter(row=>row.published).sort((a,b)=>b.number-a.number);
 const visible=mode==='topics'?[...next,...deferred,...past].filter(row=>status==='all'||row.topicStatus===status):mode==='doing'?doing:published,currentPage=Math.min(page,Math.max(1,Math.ceil(visible.length/pageSize))),pageItems=visible.slice((currentPage-1)*pageSize,currentPage*pageSize);
 const renderRow=(row:typeof rows[number])=>{
  const sourceSummary=row.entry?.summary?.trim(),summary=sourceSummary&&sourceSummary!==row.content.title.trim()?sourceSummary:(row.content.body.trim()||row.creation?.narrative.trim()||'');
  const deferredTopic=row.category==='topics'&&!!row.deferred,status=mode==='topics'?({todo:'待做',paused:'暂缓',written:'已写'}[row.topicStatus]):row.published?'已发布':deferredTopic?'暂缓':row.recorded?'已录制':row.category==='doing'?'正在写':'待写';
  return <article key={row.content.id} className={view==='cards'?'jincheng-content-card':'jincheng-topic-row'} data-content-id={row.content.id}>
   <div className="jincheng-topic-copy">
    <div className="jincheng-content-card-heading"><div className="jincheng-topic-meta"><span className="jincheng-content-number">{row.tNumber||'尚无 T 编号'}</span><span className="jincheng-content-type">{row.type}</span></div><span className={`jincheng-content-status is-${row.published?'published':deferredTopic?'deferred':row.category}`}>{status}</span></div>
    <h4 className="jincheng-content-title-heading"><Button className="jincheng-content-title" theme="borderless" disabled={busy} onClick={()=>openContent(row.content.id)}>{row.content.title||'未命名选题'}</Button></h4>
    <div className="jincheng-topic-meta jincheng-content-facts">{row.fact?.sourceResolution==='conflict'&&<span>当前稿待选择</span>}{row.fact?.sourceResolution==='missing'&&<span>原入口缺失</span>}{row.fact?.topicStatus?.paused&&<span>{row.published?'原卡暂缓 · 已发布事实优先':'原卡明确暂缓'}</span>}{row.recorded&&!row.published&&<span>{row.fact?.topicStatus?.paused?'已录制 · 当前暂缓':'拍完还没发'}</span>}{row.published&&<span>{row.publications.length?`${row.publications.length} 条有效发布记录`:`原选题人工发布记录${row.entry?.publishDate?' · '+row.entry.publishDate:''} · 待建档／未核平台`}</span>}{row.docs.some(doc=>doc.format==='html')&&<span>有创作页</span>}</div>
    {view==='cards'&&summary&&(summary.length>180?<details className="jincheng-content-summary"><summary><span className="jincheng-content-summary-preview">{summary.slice(0,180)}…</span><span className="jincheng-content-summary-expand">展开摘要</span><span className="jincheng-content-summary-collapse">收起摘要</span></summary><p>{summary}</p></details>:<p className="jincheng-content-summary-text">{summary}</p>)}
   </div>
   <div className="jincheng-plan">{row.order&&<span className="jincheng-source-state">接下来第 {row.order} 条拍</span>}{row.deferred?<p>{row.deferred.text}{row.deferred.date?` · ${row.deferred.date}`:''}</p>:row.plan?<p>{row.plan.date} · {row.plan.text}</p>:row.category==='doing'?<p>{row.recorded?'已录完，发布事实待确认':'正在写'}</p>:row.category==='published'?null:row.entry?.status&&!/待写|待做/.test(row.entry.status)?<p>原总览：{row.entry.status}</p>:null}{row.fact?.topicStatus?.paused&&<details><summary>原卡与总览的状态依据</summary>{row.entry&&<p>选题总览原状态：{row.entry.status||row.entry.group}</p>}{overview.deferred.get(row.tNumber)&&<p className="production-prewrap">选题总览原顺延：{overview.deferred.get(row.tNumber)!.date} · {overview.deferred.get(row.tNumber)!.text}</p>}{row.fact.statusEvidence?.map((evidence,index)=><article key={index}><p className="jincheng-document-path">{evidence.relativePath}{evidence.line?`:${evidence.line}`:''}</p>{evidence.section&&<p>原栏目：{evidence.section}</p>}<p className="production-prewrap">{evidence.text}</p></article>)}</details>}</div>
   <div className="jincheng-content-card-actions"><Button disabled={busy} onClick={()=>(mode==='doing'?(resumeContent??openContent):openContent)(row.content.id)}>{mode==='doing'?'接着写':'查看详情'}</Button></div>
  </article>;
 };
 const renderItems=(items:typeof rows)=><div className={view==='cards'?'jincheng-content-grid':'jincheng-content-list'}>{items.map(renderRow)}</div>;
 return <section className="production-workspace jincheng-content-directory" aria-label={mode==='topics'?'选题':mode==='doing'?'在做':'已发布'}>
  {!embedded&&<header className="production-page-head"><div><h2>{mode==='topics'?`选题 · ${visible.length}`:mode==='doing'?'在做':'已发布'}</h2></div>{createContent&&<Button disabled={busy} onClick={createContent}>新建选题</Button>}</header>}
  <div className="production-toolbar jincheng-content-toolbar"><Input aria-label="搜索内容编号或选题" placeholder="搜索 T 编号、选题或说明" value={query} onChange={setQuery}/><PopupSelect className="jincheng-type-filter" aria-label="内容类型" searchable value={type} onChange={setType}><option value="all">全部类型</option>{types.map(name=><option value={name} key={name}>{name}</option>)}</PopupSelect>{mode==='topics'&&<PopupSelect className="jincheng-status-filter" aria-label="选题状态" value={status} onChange={setStatus}><option value="all">全部状态</option><option value="todo">待做</option><option value="paused">暂缓</option><option value="written">已写</option></PopupSelect>}{mode==='doing'&&<PopupSelect aria-label="在做排序" value={doingSort} onChange={value=>updateUI({doingSort:value==='plan'?'plan':'recent',page:1})}><option value="recent">最新内容</option><option value="plan">拍摄顺序</option></PopupSelect>}<Radio.Group className="jincheng-content-view-switch" aria-label="内容呈现方式" type="button" value={view} onChange={event=>updateUI({view:event.target.value==='list'?'list':'cards'})} options={[{label:'卡片',value:'cards'},{label:'列表',value:'list'}]}/><Button disabled={busy||!loaded} onClick={()=>setVersion(n=>n+1)}>刷新</Button></div>
  {notice&&<Banner type="warning" closeIcon={null} description={notice}/>}
  <JinchengStageActions title={mode==='topics'?'准备一条新内容':'需要助手继续时'} busy={busy} actions={mode==='topics'?['topics','intake']:mode==='published'?['closeout','review']:['writing','tutorial']}/>
  {mode==='topics'&&<JinchengTopicMenus busy={busy} openContent={openContent}/>}
  {!loaded?<p role="status">正在读取原选题、安排与创作文件…</p>:<>
   <section className="jincheng-topic-group">{(embedded||mode!=='topics')&&<div className="jincheng-directory-heading"><h3>{mode==='topics'?'选题':mode==='doing'?'正在写与拍完还没发':'已发布'} · {visible.length}</h3></div>}{renderItems(pageItems)}{!visible.length&&<p className="production-empty">{query?'没有匹配内容。':mode==='published'?'暂无明确发布记录。':'暂无选题。'}</p>}<PaginationBar total={visible.length} page={currentPage} pageSize={pageSize} onPageChange={page=>updateUI({page})} onPageSizeChange={setPageSize} disabled={busy} label="选题列表分页"/></section>
  </>}
  {vault&&!overviewText&&loaded&&<p className="jincheng-directory-notice">暂无可读取的选题总览。</p>}
 </section>;
}
