import {DocumentMarkdown} from './document-markdown.tsx';
import {JinchengStageActions} from './jincheng-stage-actions.tsx';
import {JinchengSourceStatus} from './jincheng-source-status.tsx';
import {CreationFrame} from './creation-frame.tsx';
import {useEffect,useMemo,useRef,useState} from 'react';
import {listenVaultRecovery,reconcileVaultEditor} from '../shared/vault-editor-recovery.ts';
import type {VaultEditorSubmission} from '../shared/vault-editor-recovery.ts';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import Input from '@douyinfe/semi-ui-19/lib/es/input';
import TextArea from '@douyinfe/semi-ui-19/lib/es/input/textarea';
import Banner from '@douyinfe/semi-ui-19/lib/es/banner';
import {DataTable,ListToolbar} from './list-primitives.tsx';
import {ManagementDialog} from './library-panels.tsx';
import {PopupSelect} from './semi-controls.tsx';
import {invoke} from './client.ts';
import {errorInfo} from '../shared/contracts.ts';
import {vaultSections} from '../shared/vault-validation.ts';
import type {VaultDocument,VaultSection,VaultSnapshot,VaultText} from '../shared/vault-contracts.ts';
import type {ProductionTask} from '../shared/production-contracts.ts';
import './vault-workspace.css';
const labels:Record<VaultSection,string>={profile:'个人定位',accounts:'账号',materials:'素材',patterns:'规律',topics:'选题',drafts:'稿件',reviews:'复盘',prompts:'提示词'};
function DocumentEditor({source,section,busy,close,saved,openContent,statusChanged}:{source:VaultText|null;section:VaultSection;busy:boolean;close():void;saved():Promise<void>;openContent(id:string):void;statusChanged():Promise<void>}){
 const [title,setTitle]=useState(''),[text,setText]=useState(source?.text??''),[category,setCategory]=useState<VaultSection>(section),[working,setWorking]=useState(false),[message,setMessage]=useState(''),[confirmTrash,setConfirmTrash]=useState(false);
 const active=useRef(false),[current,setCurrent]=useState(source);
 const submission=useRef<VaultEditorSubmission|null>(null),local=useRef({current,text,title,category});local.current={current,text,title,category};
 const [sourceUnavailable,setSourceUnavailable]=useState(false),[conflict,setConflict]=useState(false),[confirmReload,setConfirmReload]=useState(false);
 useEffect(()=>listenVaultRecovery(window,recovery=>{const next=reconcileVaultEditor({...local.current,submission:submission.current},recovery);if(!next)return;submission.current=null;setCurrent(next.current);setText(next.text);setSourceUnavailable(next.sourceUnavailable);setConflict(next.conflict);setMessage(next.message);void saved().catch(error=>setMessage(errorInfo(error).message));}),[]);
 const readonly=!!current&&!current.document.writable;
 const [editing,setEditing]=useState(!source||source.document.format!=='markdown');
 const markdownDocument=current?.document.format==='markdown';
 const originalCreation=!!current?.workingDraftAvailable&&current.document.format==='html';
 const dirty=current?text!==current.text:!!title||!!text;
 async function save(){
  if(active.current||busy||readonly||sourceUnavailable||conflict)return;
  active.current=true;setWorking(true);setMessage('');
  const pending:VaultEditorSubmission=current?{method:'saveVaultDocument',input:{id:current.document.id,expectedHash:current.document.hash,text}}:{method:'createVaultDocument',input:{section:category,title,text}};
  submission.current=pending;
  try{const result=pending.method==='saveVaultDocument'?await invoke('saveVaultDocument',pending.input as import('../shared/vault-contracts.ts').VaultInputs['saveVaultDocument']):await invoke('createVaultDocument',pending.input as import('../shared/vault-contracts.ts').VaultInputs['createVaultDocument']);submission.current=null;setCurrent(result);setText(result.text);setMessage('已保存。');await saved();return result;}
  catch(error){setMessage(`${errorInfo(error).message} 本次填写仍保留；请先核验上次修改。`);}
  finally{active.current=false;setWorking(false);await statusChanged();}
 }
 async function establishWorkingDraft(){
  if(!current?.workingDraftAvailable||active.current||busy||sourceUnavailable||conflict)return;
  active.current=true;setWorking(true);setMessage('');
  const input={id:current.document.id,expectedHash:current.document.hash};submission.current={method:'createVaultWorkingDraft',input};
  try{const result=await invoke('createVaultWorkingDraft',input);submission.current=null;setCurrent(result);setText(result.text);setMessage('可编辑工作稿已建立，原 HTML 保留在同一内容目录。');await saved();}
  catch(error){setMessage(`${errorInfo(error).message} 原 HTML 与当前显示内容仍保留；请先核验上次修改。`);}
  finally{active.current=false;setWorking(false);await statusChanged();}
 }
 async function topics(){
  if(active.current||busy)return;
  let source=current;
  if(dirty||!source){source=await save()??null;if(!source)return;}
  active.current=true;setWorking(true);setMessage('');
  try{const result=await invoke('startProductionTask',{kind:'research',workflow:'topic-suggestion',businessSkill:'xindao-xuanti',title:'推荐选题',prompt:'使用新岛选题方法，根据当前定位和已保存资料推荐可选方向。先交回候选供我选择，选题名不是最终标题，不覆盖原文。',source:{documentId:source.document.id,expectedHash:source.document.hash},contentId:source.document.contentId??null,accountId:null,mode:'simple',comments:false});setMessage(result.message??'选题任务已保留，请在助手任务中查看候选并选择。');}catch(error){setMessage(errorInfo(error).message);}finally{active.current=false;setWorking(false);await statusChanged();}
 }
 async function trash(){if(!current||active.current)return;active.current=true;setWorking(true);submission.current={method:'trashVaultDocument',input:{id:current.document.id,expectedHash:current.document.hash}};try{await invoke('trashVaultDocument',{id:current.document.id,expectedHash:current.document.hash});submission.current=null;await saved();close();}catch(error){setMessage(errorInfo(error).message);}finally{active.current=false;setWorking(false);await statusChanged();}}
 return <ManagementDialog title={current?.document.title||'新建资料'} dirty={dirty} busy={busy||working} close={close}>
  <div className="vault-document-form">
   {current?<p className="vault-source-path">来源：{current.document.relativePath}</p>:<><label>分类<PopupSelect value={category} disabled={working} onChange={value=>setCategory(value as VaultSection)}>{vaultSections.map(value=><option key={value} value={value}>{labels[value]}</option>)}</PopupSelect></label><label>名称（可稍后填写）<Input aria-label="资料名称" value={title} maxLength={500} disabled={working} onChange={setTitle}/></label></>}
   {originalCreation&&current&&<CreationFrame documentId={current.document.id} busy={busy||working}/>}
   {!originalCreation&&readonly&&<Banner type="info" closeIcon={null} description={current?.workingDraftAvailable?"当前稿只读；建立工作稿后可编辑，原 HTML 保留。":"此格式仅供阅读，原文件保留。"}/>}
   {!originalCreation&&markdownDocument&&<div className="actions"><Button disabled={working} onClick={()=>setEditing(!editing)}>{editing?'阅读排版':readonly?'查看原文':'编辑原文'}</Button>{dirty&&!editing&&<p role="status">正在预览本次未保存的修改。</p>}</div>}
   {!originalCreation&&markdownDocument&&!editing&&<DocumentMarkdown text={text}/>}
   {!originalCreation&&(!markdownDocument||editing)&&<label>{readonly?'资料原文':'正文'}<TextArea aria-label="资料正文" className="semi-control-text vault-document-text" value={text} readonly={readonly} disabled={working} maxLength={1_000_000} autosize={{minRows:12,maxRows:28}} onChange={setText}/></label>}
   <p role="status">{message}</p>
   {sourceUnavailable&&<Banner type="warning" closeIcon={null} description="已保留原文档身份。请恢复或定位原件后重新打开，本次输入可以复制保留。"/>}
   {conflict&&current&&<section role="alert"><p>当前原文与本次填写不同。原文：</p><pre className="vault-current-source">{current.text}</pre>{!sourceUnavailable&&<Button disabled={busy||working} onClick={()=>{setConflict(false);setConfirmReload(false);setEditing(true);setMessage('已保留本次填写，可对照当前版本继续编辑并保存。');}}>已对照，保留填写继续编辑</Button>}{confirmReload?<div className="actions"><Button type="danger" onClick={()=>{setText(current.text);setConflict(false);setConfirmReload(false);}}>放弃本次填写并载入原文</Button><Button onClick={()=>setConfirmReload(false)}>保留填写</Button></div>:<Button onClick={()=>setConfirmReload(true)}>载入当前原文</Button>}</section>}
   <div className="actions">{current?.workingDraftAvailable&&!originalCreation&&<Button theme="solid" loading={working} disabled={busy||working||sourceUnavailable||conflict} onClick={()=>void establishWorkingDraft()}>建立可编辑工作稿</Button>}{!readonly&&<Button theme="solid" loading={working} disabled={busy||working||sourceUnavailable||conflict||!!current&&!dirty} onClick={()=>void save()}>保存资料</Button>}<Button disabled={busy||working} onClick={()=>void topics()}>{dirty||!current?'保存并推荐选题':'推荐选题'}</Button>{current&&<Button disabled={working} onClick={()=>void invoke('revealVaultDocument',{id:current.document.id}).catch(error=>setMessage(errorInfo(error).message))}>定位原文件</Button>}{current?.document.contentId&&<Button disabled={working||dirty} onClick={()=>{close();openContent(current.document.contentId!);}}>进入内容工作区</Button>}</div>
   {current&&!readonly&&<details className="vault-document-more"><summary>更多操作</summary>{dirty?<p>请先保存或放弃本次修改，再回收资料。</p>:confirmTrash?<div role="alert"><p>将原资料移入知识库回收区，保留恢复原件的机会。</p><Button type="danger" disabled={working} onClick={()=>void trash()}>确认移入回收区</Button><Button onClick={()=>setConfirmTrash(false)}>取消</Button></div>:<Button type="danger" theme="borderless" onClick={()=>setConfirmTrash(true)}>移入回收区</Button>}</details>}
  </div>
 </ManagementDialog>;
}
export function VaultWorkspace({busy,openContent,showTasks,openResources,openAccounts,openReports,statusChanged}:{busy:boolean;openContent(id:string):void;showTasks():void;openResources():void;openAccounts():void;openReports():void;statusChanged():Promise<void>}){
 const [snapshot,setSnapshot]=useState<VaultSnapshot|null>(null),[loaded,setLoaded]=useState(false),[message,setMessage]=useState(''),[working,setWorking]=useState(false),[query,setQuery]=useState(''),[section,setSection]=useState('all'),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(20),[editor,setEditor]=useState<{source:VaultText|null;section:VaultSection}|null>(null),[tasks,setTasks]=useState<ProductionTask[]>([]);
 const active=useRef(false);
 async function refresh(includeTasks=true){const next=await invoke('readVault');setSnapshot(next);setLoaded(true);if(!includeTasks)return;try{setTasks((await invoke('readProduction')).tasks);}catch{/* Knowledge files remain readable if the task projection is unavailable. */}}
 useEffect(()=>{void refresh().catch(error=>{setLoaded(true);setMessage(errorInfo(error).message);});const reload=()=>{void refresh().catch(error=>setMessage(errorInfo(error).message));};const sourceReload=()=>{void refresh(false).catch(error=>setMessage(errorInfo(error).message));};window.addEventListener('nova-workspace-refresh',reload);window.addEventListener('nova-vault-source-changed',sourceReload);return()=>{window.removeEventListener('nova-workspace-refresh',reload);window.removeEventListener('nova-vault-source-changed',sourceReload);};},[]);
 const rows=useMemo(()=>{const q=query.trim().toLocaleLowerCase();return(snapshot?.documents??[]).filter(item=>(section==='all'||section==='other'?section==='all'||item.format==='other':item.section===section)&&(!q||`${item.title} ${item.relativePath} ${item.tNumber??''}`.toLocaleLowerCase().includes(q)));},[snapshot,section,query]);
 const currentPage=Math.min(page,Math.max(1,Math.ceil(rows.length/pageSize)));
 const positioningTask=[...tasks].reverse().find(task=>task.request.parameters&&typeof task.request.parameters==='object'&&!Array.isArray(task.request.parameters)&&task.request.parameters.workflow==='positioning-interview'&&task.attempts.some(attempt=>attempt.id===task.activeAttemptId&&['created','claimed','waiting-user','waiting-permission','submitted'].includes(attempt.status)));
 const positioningLabel=positioningTask?'继续定位':snapshot?.positioning.status==='available'?'调整定位':'梳理定位';
 async function positioning(){if(active.current||busy)return;active.current=true;setWorking(true);setMessage('');try{const result=await invoke('startProductionTask',{kind:'writing',workflow:'positioning-interview',businessSkill:'xindao-interview',title:positioningLabel,prompt:'使用新岛定位访谈方法，读取当前知识库已有个人定位与访谈资料。按已有阶段继续，逐步与我确认身份、受众、内容方向和表达方式；保存阶段检查点与定位候选，未经确认不覆盖现有正式定位。',contentId:null,accountId:null,mode:'simple',comments:false});setTasks(result.snapshot.tasks);setMessage(result.message??(result.opened?'已打开所选助手，访谈与结果可在助手任务中继续。':'定位任务已保存，可在助手任务中继续。'));}catch(error){setMessage(errorInfo(error).message);}finally{active.current=false;setWorking(false);await statusChanged();}}
 async function read(item:VaultDocument){if(active.current)return;active.current=true;setWorking(true);setMessage('');try{const source=await invoke('readVaultDocument',{id:item.id});setEditor({source,section:item.section});}catch(error){setMessage(errorInfo(error).message+' 可通过该行的定位入口查看原文件。');}finally{active.current=false;setWorking(false);await statusChanged();}}
 return <section className="vault-workspace" aria-label="知识库资料">
  <div className="vault-page-heading"><div><p className="eyebrow">知识库</p><h2>资料与定位</h2></div>{snapshot&&<Button theme="solid" disabled={busy||working} onClick={()=>setEditor({source:null,section:section==='all'||section==='other'?'materials':section as VaultSection})}>新建资料</Button>}</div>
  {message&&<Banner type="warning" closeIcon={null} description={message}/>}
  {snapshot?<>
   <div className="vault-positioning"><div><h3>个人定位</h3><p>{positioningTask?'已有定位访谈，可继续。':snapshot.positioning.status==='available'?'定位资料已就绪。':snapshot.positioning.status==='partial'?'定位资料待完善。':'尚未梳理定位。'}</p></div><div className="actions"><Button disabled={busy||working} loading={working} onClick={()=>void positioning()}>{positioningLabel}</Button><Button theme="borderless" disabled={busy||working} onClick={showTasks}>助手任务</Button></div></div>
   <JinchengStageActions title="资料入库、定题与规律" busy={busy||working} actions={['intake','topics','patterns']} showTasks={showTasks}/>
   <JinchengSourceStatus roles={['benchmark-accounts','reports','prompts','visual-assets','official-archives','archive-analysis','methods']} busy={busy||working} title="独立资料与外部来源"/>
   <ListToolbar search={{label:'搜索知识库资料',placeholder:'搜索名称、原路径或 T 号',value:query,change:value=>{setQuery(value);setPage(1);}}}><label>分类<PopupSelect value={section} onChange={value=>{setSection(value);setPage(1);}}><option value="all">全部资料</option>{vaultSections.map(value=><option value={value} key={value}>{labels[value]}</option>)}<option value="other">未知格式</option></PopupSelect></label></ListToolbar>
   <DataTable rows={rows.slice((currentPage-1)*pageSize,currentPage*pageSize)} total={rows.length} page={currentPage} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} disabled={busy||working} label="知识库资料分页" columns={[
    {title:'资料',key:'title',render:(_,item)=><><Button theme="borderless" className="vault-document-link" disabled={working} onClick={()=>void read(item)}>{item.title||'未命名资料'}</Button><p className="vault-source-path">{item.relativePath}</p></>},
    {title:'分类',key:'section',width:100,render:(_,item)=>labels[item.section]},
    {title:'格式',key:'format',width:110,render:(_,item)=>`${item.format}${item.writable?'':' · 只读'}`},
    {title:'操作',key:'actions',width:170,render:(_,item)=><div className="actions">{item.contentId?<Button theme="borderless" disabled={busy||working} onClick={()=>openContent(item.contentId!)}>内容工作区</Button>:null}<Button theme="borderless" disabled={working} onClick={()=>void invoke('revealVaultDocument',{id:item.id}).catch(error=>setMessage(errorInfo(error).message))}>定位</Button></div>}
   ]} empty={query?'没有匹配资料，请调整搜索。':'这里还没有资料，可以新建记录。'}/>
   {snapshot.issues.length>0&&<details className="vault-issues"><summary>有 {snapshot.issues.length} 项资料需要留意</summary>{snapshot.issues.map((issue,index)=><p key={index}>{issue.message}{issue.relativePath?` · ${issue.relativePath}`:''}</p>)}</details>}
  </>:loaded?<div className="vault-legacy-empty"><p>当前是原有内容库。继续管理已有资料，或新建知识库开始整理。</p><div className="actions"><Button onClick={openResources}>个人资料与素材</Button><Button onClick={openAccounts}>对标账号</Button><Button onClick={openReports}>调研报告</Button></div></div>:<p role="status">正在读取知识库资料…</p>}
  {editor&&<DocumentEditor source={editor.source} section={editor.section} busy={busy} close={()=>setEditor(null)} saved={refresh} openContent={openContent} statusChanged={statusChanged}/>}
 </section>;
}
