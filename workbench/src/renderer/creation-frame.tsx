import {useEffect,useRef,useState} from 'react';
import Banner from '@douyinfe/semi-ui-19/lib/es/banner';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import {invoke} from './client.ts';
import {useManagedDraftGuard,useManagedCloseGuard} from './library-panels.tsx';
import type {CreationFrame as Frame,CreationInputs} from '../shared/creation-contracts.ts';
import './creation-frame.css';
export function CreationFrame({documentId,busy=false}:{documentId:string;busy?:boolean}){
 const [frame,setFrame]=useState<Frame|null>(null),[error,setError]=useState(''),[version,setVersion]=useState(0),[pending,setPending]=useState(false),[ready,setReady]=useState(false);
 const controls=useRef(new Map<string,{resolve:(value:unknown)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>());
 const iframe=useRef<HTMLIFrameElement|null>(null),port=useRef<MessagePort|null>(null),current=useRef<Frame|null>(null);current.current=frame;
 useManagedDraftGuard(pending||!!error);
 useManagedCloseGuard(async()=>{if(!frame)return;const state=await control('flush') as {pending:number;error:string};if(state.pending||state.error)throw new Error(state.error||'输入仍在等待保全，请重试。');});
 useEffect(()=>{
  let live=true,opened:Frame|null=null;setFrame(null);setReady(false);setError('');
  void invoke('openCreationPage',{id:documentId}).then(value=>{opened=value;if(live)setFrame(value);else void invoke('closeCreationPage',{sessionId:value.sessionId}).catch(()=>{});}).catch(issue=>{if(live)setError(issue instanceof Error?issue.message:'创作页没有打开。');});
  return()=>{live=false;port.current?.close();port.current=null;if(opened)void invoke('closeCreationPage',{sessionId:opened.sessionId}).catch(()=>{});};
 },[documentId,version]);
 function control(action:'flush'|'retry'|'copy-pending'){
  return new Promise<unknown>((resolve,reject)=>{if(!port.current||!frame){reject(new Error('保存通道尚未连接'));return;}const id=crypto.randomUUID(),timer=setTimeout(()=>{controls.current.delete(id);reject(new Error('保存通道没有响应，当前输入仍保留。'));},25000);controls.current.set(id,{resolve,reject,timer});port.current.postMessage({kind:'control',sessionId:frame.sessionId,id,action});});
 }
 async function reload(){try{const state=await control('flush') as {pending:number;error:string};if(state.pending||state.error)throw new Error(state.error||'输入仍在等待保全，请重试。');setVersion(value=>value+1);}catch(issue){setError(issue instanceof Error?issue.message:'输入仍未保全。');}}
 function connect(){
  if(!frame||!iframe.current?.contentWindow)return;
  port.current?.close();const channel=new MessageChannel();port.current=channel.port1;
  const session=frame.sessionId;
  channel.port1.onmessage=event=>{
   const data:unknown=event.data;if(!data||typeof data!=='object')return;
   const request=data as Record<string,unknown>;
   if(request.sessionId!==session||current.current?.sessionId!==session)return;
   if(request.kind==='control-result'){const operation=controls.current.get(String(request.id));if(!operation)return;controls.current.delete(String(request.id));clearTimeout(operation.timer);if(request.ok)operation.resolve(request.value);else operation.reject(new Error(String(request.error||'输入仍未保全')));return;}
   if(request.kind==='state'){setReady(true);setPending(typeof request.pending==='number'&&request.pending>0);if(typeof request.error==='string')setError(request.error);return;}
   if(typeof request.id!=='string'||typeof request.action!=='string'||!['request','stash-read','stash-write','copy','open-link','reload'].includes(request.action))return;
   const input={sessionId:session,action:request.action as CreationInputs['creationPageRequest']['action'],payload:request.payload};
   void invoke('creationPageRequest',input).then(value=>{
    channel.port1.postMessage({sessionId:session,id:request.id,ok:true,value});
    if(request.action==='reload'){window.dispatchEvent(new Event('nova-vault-source-changed'));setVersion(value=>value+1);}
   }).catch(issue=>{const message=issue instanceof Error?issue.message:'保存没有完成。';setError(message);channel.port1.postMessage({sessionId:session,id:request.id,ok:false,error:message});});
  };
  channel.port1.start();iframe.current.contentWindow.postMessage({kind:'nova-creation-connect',sessionId:session},'*',[channel.port2]);
 }
 return <section className="creation-frame-workspace" aria-label="原创作页">
  {error&&<Banner type="warning" closeIcon={null} description={<><p>{error}</p><p>当前窗口仍保留未确认输入。请重试保全；发生同处冲突时，先复制输入再处理。</p>{frame&&<><Button disabled={busy||!ready} onClick={()=>{void control('retry').catch(issue=>setError(issue.message));}}>重试保全输入</Button><Button theme="borderless" disabled={!ready} onClick={()=>{void control('copy-pending').catch(issue=>setError(issue.message));}}>复制本窗口输入</Button></>}</>}/>}
  {!frame&&!error&&<p role="status">正在恢复原创作页与未提交修改…</p>}
  {frame&&<><div className="creation-frame-status"><span role="status">{!ready?'正在连接保存通道…':pending?'正在保全本次输入…':'已连接知识库保存通道'}</span><Button theme="borderless" disabled={busy||pending||!ready||!!error} onClick={()=>{void reload();}}>重新读取原页</Button></div><iframe ref={iframe} title={frame.title} sandbox="allow-scripts" src={frame.url} onLoad={connect}/></>}
 </section>;
}
