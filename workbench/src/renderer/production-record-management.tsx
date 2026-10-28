import {useEffect,useMemo,useRef,useState} from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import Input from '@douyinfe/semi-ui-19/lib/es/input';
import TextArea from '@douyinfe/semi-ui-19/lib/es/input/textarea';
import {PopupSelect,PopupMultiSelect,PopupCreatableSelect} from './semi-controls.tsx';
import {DataTable,ListToolbar} from './list-primitives.tsx';
import {ProductionDialog} from './production-dialog.tsx';
import {useManagedDraftGuard} from './library-panels.tsx';
import type {ProductionAccount,ProductionReport} from '../shared/production-contracts.ts';
import type {ProductionJSON} from '../../../plugin-src/src/lib/file-library/production.d.ts';

export type ManagedProductionRecord={kind:'account';record:ProductionAccount;canManage:boolean;readOnlyReason?:string;verifiedMarkdown?:string}|{kind:'report';record:ProductionReport;canManage:boolean;readOnlyReason?:string;verifiedMarkdown?:string};
export type AccountManagementInput=Pick<ProductionAccount,'id'|'name'|'platform'|'url'|'note'|'tags'|'images'|'avatarAssetHash'|'reportIds'>;
export type ReportManagementInput=Pick<ProductionReport,'id'|'title'|'type'|'accountIds'|'sourceUrl'|'collectedAt'|'meta'>&{pages?:ProductionReport['pages'];pageId?:string;markdown?:string};
export interface ProductionManagementActions {
 onSave(input:AccountManagementInput|ReportManagementInput,snapshotToken:string):Promise<void>;
 onTrash(id:string,snapshotToken:string):Promise<void>;
 onRestore(id:string,snapshotToken:string):Promise<void>;
 onChanged():Promise<void>;
 chooseReportPage?(reportId:string,pageId:string):Promise<{assetHash:string;title?:string}|null>;
}
interface EditorProps extends Pick<ProductionManagementActions,'onSave'|'onChanged'|'chooseReportPage'> {identityKey:string;record:ManagedProductionRecord;snapshotToken:string;open:boolean;busy:boolean;accounts:ProductionAccount[];close():void;onDirtyChange?(dirty:boolean):void}
const object=(value:ProductionJSON):Record<string,ProductionJSON>|null=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value:null;
const reason=(issue:unknown)=>issue&&typeof issue==='object'&&'message' in issue&&typeof issue.message==='string'?issue.message:String(issue);
function permission(entry:ManagedProductionRecord):string|null {
 if(!entry.canManage)return entry.readOnlyReason??'此记录由原来源管理，只读查看。';
 if(entry.kind==='report'){const meta=object(entry.record.meta);if(entry.record.type==='viral-radar'||(meta?.vault&&typeof meta.vault==='object'&&!Array.isArray(meta.vault)&&('sourceId' in meta.vault||meta.vault.sourceWritable===false))||meta?.taskId||meta?.attemptId||meta?.radar)return '此报告由来源或任务回执管理，请使用对应专属入口。';}
 return null;
}
type Draft={entry:ManagedProductionRecord;baseline:string;token:string;markdown:string|undefined;baselineMarkdown:string|undefined};
const makeDraft=(entry:ManagedProductionRecord,token:string):Draft=>{const markdown=entry.kind==='report'?entry.verifiedMarkdown:undefined;return {entry:structuredClone(entry),baseline:JSON.stringify(entry.record),token,markdown,baselineMarkdown:markdown};};
export function ProductionRecordEditor({identityKey,record,snapshotToken,open,busy,accounts,close,onSave,onChanged,chooseReportPage,onDirtyChange}:EditorProps){
 const [draft,setDraft]=useState(()=>makeDraft(record,snapshotToken)),[working,setWorking]=useState(false),[message,setMessage]=useState(''),[replaceId,setReplaceId]=useState(record.kind==='report'?record.record.pageId:''),[newTag,setNewTag]=useState(''),[confirmReload,setConfirmReload]=useState(false);
 const key=identityKey+':'+record.kind+':'+record.record.id,scope=useRef(key),generation=useRef(0),active=useRef(false),mounted=useRef(true);scope.current=key;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;};},[]);
 useEffect(()=>{generation.current++;active.current=false;setWorking(false);setDraft(makeDraft(record,snapshotToken));setReplaceId(record.kind==='report'?record.record.pageId:'');setNewTag('');setMessage('');setConfirmReload(false);},[key]);
 const recordSignature=JSON.stringify(record.record),dirty=JSON.stringify(draft.entry.record)!==draft.baseline||draft.markdown!==draft.baselineMarkdown||!!newTag.trim(),conflict=recordSignature!==draft.baseline,readOnly=permission(record),blocked=busy||working||!!readOnly||record.record.deletedAt!==null;
 useEffect(()=>{if(!dirty&&!working){setDraft(makeDraft(record,snapshotToken));setReplaceId(record.kind==='report'?record.record.pageId:'');}},[recordSignature,snapshotToken,working]);
 useManagedDraftGuard(dirty);useEffect(()=>{onDirtyChange?.(dirty);},[dirty]);
 function update(patch:Partial<ProductionAccount>|Partial<ProductionReport>){setDraft(current=>({...current,entry:{...current.entry,record:{...current.entry.record,...patch}} as ManagedProductionRecord}));}
 async function save(){
  if(active.current||blocked||conflict)return;const origin=key,token=generation.current,live=()=>mounted.current&&scope.current===origin&&generation.current===token;
  const entry=draft.entry;let input:AccountManagementInput|ReportManagementInput;
  if(entry.kind==='account'){const a=entry.record;input={id:a.id,name:a.name,platform:a.platform,url:a.url,note:a.note,tags:[...new Set([...a.tags,...(newTag.trim()?[newTag.trim()]:[])])],images:[...a.images],avatarAssetHash:a.avatarAssetHash??null,reportIds:[...a.reportIds]};}
  else {const r=entry.record;input={id:r.id,title:r.title,type:r.type,accountIds:[...r.accountIds],sourceUrl:r.sourceUrl,collectedAt:r.collectedAt,meta:structuredClone(r.meta),...(draft.markdown===undefined?{pages:r.pages.map(p=>({...p})),pageId:r.pageId}:{markdown:draft.markdown})};}
  active.current=true;setWorking(true);setMessage('');let committed=false;
  try{await onSave(input,snapshotToken);committed=true;if(live()){await onChanged();if(live()){setDraft({...draft,baseline:JSON.stringify(draft.entry.record),baselineMarkdown:draft.markdown,token:snapshotToken});setNewTag('');close();}}}
  catch(error){if(live())setMessage((committed?'修改已提交，刷新失败：':'')+reason(error));}
  finally{if(live()){active.current=false;setWorking(false);}}
 }
 async function replace(){
  if(!chooseReportPage||draft.entry.kind!=='report'||active.current||blocked||conflict)return;const origin=key,token=generation.current,pageId=replaceId;
  active.current=true;setWorking(true);setMessage('');
  try{const result=await chooseReportPage(draft.entry.record.id,pageId);if(result&&mounted.current&&scope.current===origin&&generation.current===token)setDraft(current=>current.entry.kind==='report'?{...current,entry:{...current.entry,record:{...current.entry.record,pages:current.entry.record.pages.map(p=>p.id===pageId?{...p,assetHash:result.assetHash,title:result.title??p.title}:p)}}}:current);}
  catch(error){if(scope.current===origin&&generation.current===token)setMessage(reason(error));}
  finally{if(scope.current===origin&&generation.current===token){active.current=false;setWorking(false);}}
 }
 if(!open)return null;
 const entry=draft.entry;
 return <ProductionDialog title={record.kind==='account'?'编辑账号':'编辑报告'} busy={busy||working} close={close} notice={message} initialFocus={`#production-managed-name-${record.record.id}`}>
  {readOnly?<p>{readOnly}</p>:<form className="production-modal-form" onSubmit={event=>{event.preventDefault();return save();}}>
   <div className="production-form production-dialog-body">
    {message&&<p role="alert">{message}</p>}
    {conflict&&<div role="alert"><p>原记录已变化，本次填写仍保留。请对照当前版本后重新编辑。</p><details><summary>查看当前已保存版本</summary><pre className="production-prewrap">{JSON.stringify(record.record,null,2)}</pre></details>{confirmReload?<div className="actions"><Button type="danger" disabled={blocked} onClick={()=>{setDraft(makeDraft(record,snapshotToken));setReplaceId(record.kind==='report'?record.record.pageId:'');setNewTag('');setMessage('');setConfirmReload(false);}}>确认放弃填写并载入</Button><Button disabled={blocked} onClick={()=>setConfirmReload(false)}>保留填写</Button></div>:<Button disabled={blocked} onClick={()=>setConfirmReload(true)}>载入当前记录</Button>}</div>}
    {entry.kind==='account'?<>
     <label>账号名称<Input id={`production-managed-name-${record.record.id}`} aria-label="账号名称" value={entry.record.name} disabled={blocked} onChange={name=>update({name})}/></label>
     <label>平台<PopupCreatableSelect aria-label="账号平台" value={entry.record.platform} options={[entry.record.platform,...accounts.map(a=>a.platform)]} disabled={blocked} onChange={platform=>update({platform})}/></label>
     <label>主页<Input aria-label="账号主页" value={entry.record.url} disabled={blocked} onChange={url=>update({url})}/></label>
     <label>备注<TextArea aria-label="账号备注" value={entry.record.note} disabled={blocked} autosize={{minRows:3,maxRows:12}} onChange={note=>update({note})}/></label>
     <label>添加标签<Input aria-label="新增账号标签" value={newTag} disabled={blocked} onChange={setNewTag}/></label><Button disabled={blocked||!newTag.trim()} onClick={()=>{update({tags:[...new Set([...entry.record.tags,newTag.trim()])]});setNewTag('');}}>添加标签</Button>
     <div className="actions">{entry.record.tags.map((tag,index)=><Button key={index} disabled={blocked} aria-label={`移除标签：${tag}`} onClick={()=>update({tags:entry.record.tags.filter((_,i)=>i!==index)})}>{tag} ×</Button>)}</div>
     <p>已保留 {entry.record.images.length} 张截图、{entry.record.reportIds.length} 份关联报告{entry.record.avatarAssetHash?'及独立头像':''}。</p>
    </>:<>
     <label>报告标题<Input id={`production-managed-name-${record.record.id}`} aria-label="报告标题" value={entry.record.title} disabled={blocked} onChange={title=>update({title})}/></label>
     <label>报告类型<PopupCreatableSelect aria-label="报告类型" value={entry.record.type} options={[entry.record.type,'调研','复盘']} disabled={blocked} onChange={type=>update({type})}/></label>
     <label>关联账号<PopupMultiSelect aria-label="关联账号" value={entry.record.accountIds} options={[...new Set([...accounts.map(a=>a.id),...entry.record.accountIds])].map(id=>({value:id,label:accounts.find(a=>a.id===id)?.name??`既有关联账号 ${id}`}))} disabled={blocked} onChange={accountIds=>update({accountIds})}/></label>
     <label>来源<Input aria-label="报告来源" value={entry.record.sourceUrl??''} disabled={blocked} onChange={sourceUrl=>update({sourceUrl:sourceUrl||null})}/></label>
     <label>采集时间<Input aria-label="报告采集时间" value={entry.record.collectedAt??''} disabled={blocked} onChange={collectedAt=>update({collectedAt:collectedAt||null})}/></label>
     {draft.markdown!==undefined?<label>报告正文<TextArea aria-label="报告正文" value={draft.markdown} disabled={blocked} maxLength={100000} autosize={{minRows:8,maxRows:20}} onChange={markdown=>setDraft(current=>({...current,markdown}))}/></label>:<>
      <p>阅读顺序：{entry.record.pages.map(p=>p.title).join(' → ')}</p>
      <label>替换页面<PopupSelect aria-label="替换页面" value={replaceId} disabled={blocked} onChange={setReplaceId}>{entry.record.pages.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</PopupSelect></label>
      {chooseReportPage&&<Button disabled={blocked||conflict} onClick={replace}>替换选定页</Button>}
     </>}
     <details><summary>完整元信息</summary><pre className="production-prewrap">{JSON.stringify(entry.record.meta,null,2)}</pre></details>
    </>}
   </div>
   <div className="production-dialog-footer"><Button disabled={working} onClick={close}>收起并保留</Button><Button type="danger" theme="borderless" disabled={working||!dirty} onClick={()=>{setDraft(makeDraft(record,snapshotToken));setNewTag('');setMessage('');close();}}>放弃填写</Button><Button theme="solid" htmlType="submit" loading={working} disabled={blocked||conflict||entry.kind==='account'&&(!entry.record.name.trim()||!entry.record.platform.trim())||entry.kind==='report'&&(!entry.record.title.trim()||!entry.record.type.trim())}>保存修改</Button></div>
  </form>}
 </ProductionDialog>;
}
interface ManagementProps extends ProductionManagementActions {identityKey:string;records:ManagedProductionRecord[];snapshotToken:string;busy:boolean;accounts:ProductionAccount[]}
export function ProductionRecordManagement({identityKey,records,snapshotToken,busy,accounts,...actions}:ManagementProps){
 const [scope,setScope]=useState('active'),[query,setQuery]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(20),[message,setMessage]=useState(''),[confirm,setConfirm]=useState<string|null>(null),[working,setWorking]=useState(false),[selected,setSelected]=useState<string|null>(null),[visited,setVisited]=useState<string[]>([]),[dirtyIds,setDirtyIds]=useState<string[]>([]);
 const active=useRef(false),identity=useRef(identityKey),generation=useRef(0),mounted=useRef(true);identity.current=identityKey;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;};},[]);
 useEffect(()=>{generation.current++;active.current=false;setScope('active');setQuery('');setPage(1);setMessage('');setConfirm(null);setWorking(false);setSelected(null);setVisited([]);setDirtyIds([]);},[identityKey]);
 const keyFor=(entry:ManagedProductionRecord)=>entry.kind+':'+entry.record.id;
 const rows=useMemo(()=>{const q=query.trim().toLocaleLowerCase();return records.filter(entry=>(scope==='trash'?entry.record.deletedAt!==null:entry.record.deletedAt===null)&&(!q||(entry.kind==='account'?entry.record.name:entry.record.title).toLocaleLowerCase().includes(q)));},[records,scope,query]);
 const currentPage=Math.min(page,Math.max(1,Math.ceil(rows.length/pageSize))),blocked=busy||working;
 async function lifecycle(entry:ManagedProductionRecord,restore:boolean){
  if(active.current||busy||permission(entry)||dirtyIds.includes(keyFor(entry)))return;const origin=identityKey,token=generation.current,live=()=>mounted.current&&identity.current===origin&&generation.current===token;
  active.current=true;setWorking(true);setMessage('');let committed=false;
  try{await (restore?actions.onRestore:actions.onTrash)(entry.record.id,snapshotToken);committed=true;if(live()){setConfirm(null);await actions.onChanged();if(live())setMessage(restore?'记录已恢复。':'记录已移入回收区。');}}
  catch(error){if(live())setMessage((committed?'操作已提交，刷新失败：':'')+reason(error));}finally{if(live()){active.current=false;setWorking(false);}}
 }
 const pending=records.find(entry=>keyFor(entry)===confirm);
 return <section aria-label="账号与报告管理">
  <ListToolbar search={{label:'搜索管理记录名称',value:query,change:value=>{setQuery(value);setPage(1);}}}><label>资料范围<PopupSelect aria-label="资料范围" value={scope} disabled={blocked} onChange={value=>{setScope(value);setPage(1);setConfirm(null);}}><option value="active">正常资料</option><option value="trash">回收区</option></PopupSelect></label></ListToolbar>
  {message&&<p role="status">{message}</p>}
  {pending&&<div role="alert"><p>将“{pending.kind==='account'?pending.record.name:pending.record.title}”移入回收区，之后可恢复。</p><Button type="danger" disabled={blocked} onClick={()=>lifecycle(pending!,false)}>确认移入回收区</Button><Button disabled={blocked} onClick={()=>setConfirm(null)}>取消</Button></div>}
  <DataTable rows={rows.slice((currentPage-1)*pageSize,currentPage*pageSize)} rowKey={entry=>entry?keyFor(entry):''} total={rows.length} page={currentPage} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={value=>{setPageSize(value);setPage(1);}} disabled={blocked} label="资料管理分页" columns={[
   {title:'名称',key:'title',render:(_,entry)=>entry.kind==='account'?entry.record.name:entry.record.title},
   {title:'状态',key:'status',render:(_,entry)=>permission(entry)??(entry.record.deletedAt?'已回收':'可管理')},
   {title:'操作',key:'actions',render:(_,entry)=><div className="actions">{entry.record.deletedAt?<Button disabled={blocked||!!permission(entry)} onClick={()=>lifecycle(entry,true)}>恢复</Button>:<><Button disabled={blocked||!!permission(entry)} onClick={()=>{const key=keyFor(entry);setSelected(key);setVisited(current=>current.includes(key)?current:[...current,key]);}}>编辑</Button><Button type="danger" theme="borderless" disabled={blocked||!!permission(entry)||dirtyIds.includes(keyFor(entry))} onClick={()=>setConfirm(keyFor(entry))}>移入回收区</Button></>}</div>}
  ]} empty={query?'没有匹配记录。':scope==='trash'?'回收区为空。':'暂无记录。'}/>
  {visited.map(key=>{const entry=records.find(record=>keyFor(record)===key);return entry?<ProductionRecordEditor key={identityKey+':'+key} identityKey={identityKey} record={entry} snapshotToken={snapshotToken} open={selected===key} busy={blocked} accounts={accounts} onSave={actions.onSave} onChanged={actions.onChanged} chooseReportPage={actions.chooseReportPage} close={()=>setSelected(null)} onDirtyChange={dirty=>setDirtyIds(current=>dirty?[...new Set([...current,key])]:current.filter(item=>item!==key))}/>:null;})}
 </section>;
}
