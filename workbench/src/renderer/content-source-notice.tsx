import {useEffect,useRef,useState} from 'react';
import Banner from '@douyinfe/semi-ui-19/lib/es/banner';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import type {VaultText} from '../shared/vault-contracts.ts';
import {invoke} from './client.ts';
import {errorInfo} from '../shared/contracts.ts';

export function ContentSourceNotice({contentId,busy,dirty,access,converted,run}:{contentId:string;busy:boolean;dirty:boolean;access(editable:boolean):void;converted():Promise<void>;run<T>(action:()=>Promise<T>):Promise<T|undefined>}){
 const [source,setSource]=useState<VaultText|null>(null),[loading,setLoading]=useState(true),[working,setWorking]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const active=useRef(false),accessRef=useRef(access),dirtyRef=useRef(dirty);accessRef.current=access;dirtyRef.current=dirty;
 useEffect(()=>{
  let cancelled=false;setLoading(true);accessRef.current(false);
  invoke('readVaultContentSource',{contentId}).then(value=>{if(cancelled)return;setSource(value);setError('');accessRef.current(!value||value.document.writable);}).catch(issue=>{if(!cancelled){setError(errorInfo(issue).message);accessRef.current(false);}}).finally(()=>{if(!cancelled)setLoading(false);});
  const changed=()=>{if(!dirtyRef.current&&!active.current)setRetry(value=>value+1);};window.addEventListener('nova-vault-source-changed',changed);
  return()=>{cancelled=true;window.removeEventListener('nova-vault-source-changed',changed);};
 },[contentId,retry]);
 async function establish(){
  if(!source?.workingDraftAvailable||active.current||busy||dirty)return;
  active.current=true;setWorking(true);setError('');
  try{const next=await run(()=>invoke('createVaultWorkingDraft',{id:source.document.id,expectedHash:source.document.hash}));if(!next){setError('工作稿尚未确认，原稿保留；请查看保存结果并核验待处理记录。');return;}setSource(next);accessRef.current(next.document.writable);await converted();}
  catch(issue){setError(`${errorInfo(issue).message} 原稿保留；如有待核验记录，请先在内容库中核验。`);accessRef.current(false);}
  finally{active.current=false;setWorking(false);}
 }
 if(loading)return <p role="status">正在核对当前稿件来源…</p>;
 if(error)return <Banner type="warning" closeIcon={null} description={<><p>{error}</p><Button disabled={busy||working} onClick={()=>setRetry(value=>value+1)}>重新核对稿件来源</Button></>}/>;
 if(!source||source.document.writable)return null;
 return <Banner type="info" closeIcon={null} description={<><p>{source.workingDraftAvailable?'当前人工稿来自 HTML。建立工作稿后，可在这一篇内容中继续编辑，原 HTML 保留。':'当前来源格式只供阅读，可定位原件；也可以将想法另存为新内容。'}</p><p className="vault-source-path">{source.document.relativePath}</p>{source.workingDraftAvailable&&<Button id="establish-content-working-draft" theme="solid" disabled={busy||working||dirty} loading={working} onClick={()=>void establish()}>建立可编辑工作稿</Button>}<Button disabled={busy||working} onClick={()=>void invoke('revealVaultDocument',{id:source.document.id}).catch(issue=>setError(errorInfo(issue).message))}>定位原文件</Button>{dirty&&<p>已有本地修改，请先保留到新内容，或放弃本次修改后再建立工作稿。</p>}</>}/>;
}
