import {useEffect,useState} from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import Input from '@douyinfe/semi-ui-19/lib/es/input';
import type {Content} from '../shared/contracts.ts';
import type {ProductionSnapshot} from '../shared/production-contracts.ts';
import type {ResearchReferenceSource} from '../../../plugin-src/src/lib/file-library/production-research.mjs';
import {ProductionDialog} from './production-dialog.tsx';
import {PopupSelect} from './semi-controls.tsx';
import {useManagedDraftGuard} from './library-panels.tsx';
import {invoke} from './client.ts';
export async function adoptResearchIntoContent(contentId:string,source:ResearchReferenceSource){
 let snapshot=await invoke('readProduction');
 if(!snapshot.creations.some(item=>item.contentId===contentId))snapshot=await invoke('mutateProduction',{op:'ensureCreation',input:{contentId,expectedToken:snapshot.editToken},mutationId:crypto.randomUUID()});
 const state=await invoke('readProductionCreation',{contentId});
 return invoke('mutateProduction',{op:'adoptResearchReferences',input:{contentId,taskId:source.taskId,attemptId:source.attemptId,receiptHash:source.receiptHash,artifactId:source.artifactId,expectedToken:state.productionToken,expectedContentToken:state.content.editToken},mutationId:crypto.randomUUID()});
}
export function ResearchToContent({source,busy,close,adopted,openContent}:{source:ResearchReferenceSource;busy:boolean;close():void;adopted(snapshot:ProductionSnapshot):void;openContent?(id:string):void}){
 const [contents,setContents]=useState<Content[]>([]),[target,setTarget]=useState('new'),[title,setTitle]=useState(source.title),[working,setWorking]=useState(false),[notice,setNotice]=useState(''),[createdId,setCreatedId]=useState<string|null>(null);
 useManagedDraftGuard(title!==source.title||target!=='new'||createdId!==null);
 useEffect(()=>{let live=true;void invoke('listContents',{view:'active'}).then(items=>{if(live)setContents(items);}).catch(()=>{if(live)setNotice('内容列表读取失败，可稍后重试。');});return()=>{live=false;};},[]);
 const blocked=busy||working;
 async function apply(){if(blocked)return;setWorking(true);setNotice('');try{
  let contentId=target==='new'?createdId:target;
  if(!contentId){const content=await invoke('createContent',{title:title.trim(),body:''});contentId=content.id;setCreatedId(content.id);}
  const snapshot=await adoptResearchIntoContent(contentId,source);adopted(snapshot);close();openContent?.(contentId);
 }catch(error){setNotice((error instanceof Error?error.message:'采用未完成。')+(createdId?' 已创建的内容保留，重试会继续使用它。':''));}finally{setWorking(false);}}
 return <ProductionDialog title="用这份研究开始创作" busy={blocked} close={close} initialFocus="#research-target" notice={notice}><div className="production-dialog-body production-form"><p>{source.title} · {source.references.length} 条已验收资料</p><label htmlFor="research-target">保存到</label><PopupSelect id="research-target" searchable value={target} disabled={blocked||!!createdId} onChange={setTarget}><option value="new">新建内容项目</option>{contents.map(content=><option key={content.id} value={content.id}>{content.title}</option>)}</PopupSelect>{target==='new'&&<><label htmlFor="research-content-title">内容标题</label><Input id="research-content-title" value={title} maxLength={500} disabled={blocked||!!createdId} onChange={setTitle}/></>}<details><summary>核对将采用的资料与来源</summary><pre>{source.summary}</pre>{source.references.map(reference=><section key={reference.id}><h4>{reference.title}</h4><p>{reference.url??'全文及来源见任务归档'}</p><pre>{reference.correctedText||reference.originalText}</pre></section>)}</details><p>保存参考和来源回执，不会改写已有正文或自动发起采集。</p>{createdId&&<p>内容项目已创建，继续完成资料采用即可。</p>}</div><div className="production-dialog-footer"><Button disabled={blocked} onClick={close}>取消</Button><Button theme="solid" loading={working} disabled={blocked||target==='new'&&!title.trim()} onClick={()=>void apply()}>采用资料并打开内容</Button></div></ProductionDialog>;
}
