import {PagedItems} from './paged-items.tsx';
import {useEffect,useRef,useState} from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import TextArea from '@douyinfe/semi-ui-19/lib/es/input/textarea';
import {PopupSelect} from './semi-controls.tsx';
import type {AuthorPlanningStatus,AuthorPlanningView,SetAuthorPlanningStatusInput} from '../../../plugin-src/src/lib/vault/author-planning.mjs';

export interface AuthorPlanningStatusEditorProps {
 initialEditing?:boolean;onDirtyChange?(dirty:boolean):void;onBusyChange?(busy:boolean):void;
 identityKey:string;value:AuthorPlanningView|null;busy:boolean;error?:string;compact?:boolean;
 onSave(input:SetAuthorPlanningStatusInput):Promise<AuthorPlanningView>;
 onChanged():Promise<void>;
}
const labels:Record<AuthorPlanningStatus,string>={todo:'待做',paused:'暂缓',written:'已写'};
const signature=(value:AuthorPlanningView)=>JSON.stringify([value.revision,value.sourcePins]);
/** Can be mounted in a card or list cell; persistence and the active library belong to its parent. */
export function AuthorPlanningStatusEditor({identityKey,value,busy,error='',compact=false,onSave,onChanged,initialEditing=false,onDirtyChange,onBusyChange}:AuthorPlanningStatusEditorProps) {
 const [editing,setEditing]=useState(false),[selection,setSelection]=useState<AuthorPlanningStatus|'source'>('source'),[reason,setReason]=useState(''),[baseline,setBaseline]=useState<AuthorPlanningView|null>(null),[acknowledged,setAcknowledged]=useState(''),[message,setMessage]=useState(''),[working,setWorking]=useState(false);
 const content=useRef(value?.contentId??'');if(value)content.current=value.contentId;
 const key=identityKey+':'+content.current,scope=useRef(key),generation=useRef(0),active=useRef(false),mounted=useRef(true);scope.current=key;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;};},[]);
 useEffect(()=>{generation.current++;active.current=false;setEditing(initialEditing&&!!value);setWorking(false);setBaseline(initialEditing?value:null);if(initialEditing&&value){setSelection(value.status??'source');setReason(value.reason);}setMessage('');setAcknowledged(initialEditing&&value&&!value.stale?signature(value):'');},[key]);
 const currentSignature=value?signature(value):'',needsReview=!!value&&editing&&(!baseline||signature(baseline)!==currentSignature||value.stale&&acknowledged!==currentSignature);
 const status:AuthorPlanningStatus|null=selection==='source'?null:selection,dirty=!!baseline&&(status!==baseline.status||reason!==baseline.reason),canReconfirm=!!value?.stale&&acknowledged===currentSignature;
 useEffect(()=>{onDirtyChange?.(editing&&dirty);},[editing,dirty,onDirtyChange]);
 useEffect(()=>{onBusyChange?.(working);return()=>onBusyChange?.(false);},[working,onBusyChange]);
 function begin(){if(!value||busy||working)return;setBaseline(value);setSelection(value.status??'source');setReason(value.reason);setAcknowledged(value.stale?'':signature(value));setMessage('');setEditing(true);}
 async function save(){
  if(!value||!baseline||active.current||busy||needsReview||!dirty&&!canReconfirm)return;
  const origin=key,token=generation.current,input:SetAuthorPlanningStatusInput={contentId:baseline.contentId,status,reason,expectedRevision:baseline.revision,sourcePins:baseline.sourcePins};
  const live=()=>mounted.current&&scope.current===origin&&generation.current===token;
  active.current=true;setWorking(true);setMessage('');let committed=false;
  try{await onSave(input);committed=true;if(live()){await onChanged();if(live()){setEditing(false);setMessage('作者安排已保存。');}}}
  catch(error){if(live())setMessage((committed?'作者安排已提交，刷新失败：':'')+(error&&typeof error==='object'&&'message' in error&&typeof error.message==='string'?error.message:String(error)));}
  finally{if(live()){active.current=false;setWorking(false);}}
 }
 return <section className={`author-planning-status${compact?' author-planning-status-compact':''}`} aria-label="作者安排">
  <div className="actions">{value?<span>{value.status===null?`按来源推导：${labels[value.derivedStatus]}`:value.status==='written'?'本人标记已写':`本人安排：${labels[value.status]}`}</span>:<span>作者安排暂不可读</span>}{!editing&&value&&<Button theme="borderless" disabled={busy||working} onClick={begin}>修改作者安排</Button>}</div>
  {value&&<div className="actions"><span>{value.facts.hasDraft?'有稿件':'尚未找到稿件'}</span>{value.facts.recorded&&<span>已录制</span>}{value.facts.published&&<span>已发布</span>}</div>}
  {value?.stale&&<p role="status">来源已变化，待核对。</p>}
  {(message||error)&&<p role="alert">{message||error}</p>}
  {editing&&<div className="author-planning-form">
   <label>作者安排<PopupSelect aria-label="作者安排" value={selection} disabled={busy||working} onChange={next=>{if(next==='source'||next==='todo'||next==='paused'||next==='written')setSelection(next);}}><option value="source">按来源推导</option><option value="todo">待做</option><option value="paused">暂缓</option><option value="written">已写</option></PopupSelect></label>
   <label>安排说明<TextArea aria-label="安排说明" value={reason} maxLength={2000} disabled={busy||working} autosize={{minRows:2,maxRows:6}} onChange={setReason}/></label>
   {selection==='written'&&!value?.facts.hasDraft&&<p>本人标记已写；尚未找到稿件。</p>}
   {value&&<details open={needsReview}><summary>当前来源依据</summary><p>原卡状态：{value.sourceStatus??'未明确标记'}</p><PagedItems compact items={value.sourcePins} resetKey={currentSignature} label="来源依据分页">{pins=>pins.map(pin=><p key={pin.documentId} style={{overflowWrap:'anywhere'}}>{pin.relativePath}</p>)}</PagedItems></details>}
   {needsReview&&<div role="alert"><p>来源或作者安排版本已变化，本次选择与说明仍保留。</p><Button disabled={busy||working} onClick={()=>{if(value){setBaseline(value);setAcknowledged(signature(value));}}}>已核对当前来源，保留本次选择</Button></div>}
   <div className="actions"><Button theme="solid" disabled={busy||working||!value||needsReview||!dirty&&!canReconfirm} loading={working} onClick={save}>保存作者安排</Button><Button disabled={working} onClick={()=>{setEditing(false);setMessage('');}}>取消</Button></div>
  </div>}
 </section>;
}
