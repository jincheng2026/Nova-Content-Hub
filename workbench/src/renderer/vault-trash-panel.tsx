import {useEffect,useMemo,useRef,useState} from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import {DataTable,ListToolbar} from './list-primitives.tsx';
import {PopupSelect} from './semi-controls.tsx';

export interface VaultTrashEntry {
 trashId:string;documentId:string;title:string;relativePath:string;section:string|null;
 hash:string|null;deletedAt:string|null;restorable:boolean;issue:string|null;
}
export interface VaultTrashPanelProps {
 identityKey:string;entries:VaultTrashEntry[];busy:boolean;loading?:boolean;error?:string;
 onRestore(input:{trashId:string;expectedHash:string}):Promise<unknown>;
 onRestored():Promise<void>;
 onRefresh?():Promise<void>;
 onLocateExisting?(trashId:string):Promise<void>;
}
const labels:Record<string,string>={profile:'个人定位',accounts:'账号',materials:'素材',patterns:'规律',topics:'选题',drafts:'稿件',reviews:'复盘',prompts:'提示词'};
/** Pure renderer boundary: the parent owns current-library identity and mutations. */
export function VaultTrashPanel({identityKey,entries,busy,loading=false,error='',onRestore,onRestored,onRefresh,onLocateExisting}:VaultTrashPanelProps) {
 const [query,setQuery]=useState(''),[category,setCategory]=useState('all'),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(20),[message,setMessage]=useState(''),[working,setWorking]=useState<string|null>(null);
 const active=useRef(false),scope=useRef(identityKey),generation=useRef(0),mounted=useRef(true);scope.current=identityKey;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;};},[]);
 useEffect(()=>{generation.current++;active.current=false;setWorking(null);setMessage('');setQuery('');setCategory('all');setPage(1);},[identityKey]);
 const rows=useMemo(()=>{const q=query.trim().toLocaleLowerCase();return entries.filter(item=>(category==='all'||item.section===category)&&(!q||`${item.title} ${item.relativePath}`.toLocaleLowerCase().includes(q)));},[entries,query,category]);
 const currentPage=Math.min(page,Math.max(1,Math.ceil(rows.length/pageSize))),disabled=busy||working!==null;
 async function run(key:string,operation:()=>Promise<unknown>,success:string) {
  if(active.current||busy)return;
  const origin=identityKey,token=generation.current;
  active.current=true;setWorking(key);setMessage('');
  const current=()=>mounted.current&&scope.current===origin&&generation.current===token;
  try {await operation();if(current()){await onRestored();if(current())setMessage(success);}}
  catch(error){if(current())setMessage(error instanceof Error?error.message:String(error));}
  finally{if(current()){active.current=false;setWorking(null);}}
 }
 return <section className="vault-trash-panel" aria-label="资料回收区">
  <div className="actions"><h3>资料回收区</h3>{onRefresh&&<Button disabled={disabled} loading={working==='refresh'} onClick={()=>run('refresh',onRefresh,'已刷新回收记录。')}>刷新</Button>}</div>
  {(message||error)&&<p role="status">{message||error}</p>}
  <ListToolbar search={{label:'搜索回收资料',placeholder:'搜索资料名称或原路径',value:query,disabled:working!==null,change:value=>{setQuery(value);setPage(1);}}}>
   <label>分类<PopupSelect aria-label="回收资料分类" value={category} disabled={working!==null} onChange={value=>{setCategory(value);setPage(1);}}><option value="all">全部分类</option>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</PopupSelect></label>
  </ListToolbar>
  {loading&&<p role="status">正在读取回收记录…</p>}
  <DataTable rowKey="trashId" rows={rows.slice((currentPage-1)*pageSize,currentPage*pageSize)} total={rows.length} page={currentPage} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={value=>{setPageSize(value);setPage(1);}} disabled={disabled} label="资料回收分页" columns={[
   {title:'资料与原路径',key:'title',render:(_,item)=><><span>{item.title}</span><p className="vault-source-path" style={{overflowWrap:'anywhere'}}>{item.relativePath}</p></>},
   {title:'分类',key:'section',width:100,render:(_,item)=>labels[item.section??'']??'无法识别'},
   {title:'回收时间',key:'deletedAt',width:170,render:(_,item)=>item.deletedAt?new Date(item.deletedAt).toLocaleString():'未记录'},
   {title:'状态',key:'issue',render:(_,item)=>item.issue??'可恢复'},
   {title:'操作',key:'actions',width:180,render:(_,item)=><div className="actions"><Button disabled={disabled||!item.restorable||!item.hash} loading={working===item.trashId} onClick={()=>{if(item.restorable&&item.hash)return run(item.trashId,()=>onRestore({trashId:item.trashId,expectedHash:item.hash!}),'资料已恢复到原路径。');}}>恢复资料</Button>{onLocateExisting&&item.issue?.includes('已有文件')&&<Button theme="borderless" disabled={disabled} onClick={()=>run('locate:'+item.trashId,()=>onLocateExisting(item.trashId),'')}>定位已有文件</Button>}</div>}
  ]} empty={query||category!=='all'?'没有匹配的回收资料。':'资料回收区为空。'}/>
 </section>;
}
