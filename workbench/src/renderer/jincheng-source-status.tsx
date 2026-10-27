import {useEffect,useState} from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import Banner from '@douyinfe/semi-ui-19/lib/es/banner';
import {invoke} from './client.ts';
import {errorInfo} from '../shared/contracts.ts';
import type {VaultResults} from '../shared/vault-contracts.ts';
import type {SourceRole} from '../../../plugin-src/src/lib/vault/source-map.mjs';
import './jincheng-workbench.css';
const names:Partial<Record<SourceRole,string>>={'benchmark-accounts':'对标账号',reports:'原调研报告',prompts:'原提示词','visual-assets':'封面 VI',materials:'素材',methods:'本人方法','official-archives':'正式发布档案','archive-analysis':'历史分析副本'};
export function JinchengSourceStatus({roles,title='原资料来源',busy=false}:{roles:SourceRole[];title?:string;busy?:boolean}){
 const [inventory,setInventory]=useState<VaultResults['readVaultSources']|null>(null),[notice,setNotice]=useState(''),[version,setVersion]=useState(0),[working,setWorking]=useState(false);
 useEffect(()=>{let live=true;void invoke('readVaultSources').then(value=>{if(live){setInventory(value);setNotice('');}}).catch(error=>{if(live)setNotice(errorInfo(error).message);});const refresh=()=>setVersion(n=>n+1);window.addEventListener('nova-workspace-refresh',refresh);return()=>{live=false;window.removeEventListener('nova-workspace-refresh',refresh);};},[version]);
 async function choose(role:SourceRole){if(busy||working)return;setWorking(true);setNotice('');try{await invoke('chooseVaultSource',{role});setVersion(n=>n+1);window.dispatchEvent(new Event('nova-workspace-refresh'));}catch(error){setNotice(errorInfo(error).message);}finally{setWorking(false);}}
 const sources=inventory?.sources.filter(source=>roles.includes(source.role))??[],issues=inventory?.issues.filter(issue=>sources.some(source=>source.id===issue.sourceId))??[];
 return <details className="jincheng-resource-library" open={issues.length?true:undefined}><summary>{title} · {sources.length} 个登记来源</summary>{notice&&<Banner type="warning" closeIcon={null} description={notice}/>}<p className="jincheng-helper">本页读取当前知识库已登记的来源。原账号、HTML 报告与提示词有独立入口；外部目录不可用时会保留缺口，不把它当成资料为空。</p>{sources.map(source=><article className="jincheng-source-row" key={source.id}><strong>{names[source.role]??source.role}</strong><p className="jincheng-document-path">{source.root}</p><p>{source.mode==='linked'?'显式关联外部目录':'当前知识库内'} · {source.available?source.projection==='not-loaded'?'来源可用，内容尚未接入':'来源可读取':'来源目前不可用'} · {source.writable?'可按原流程保存':'原件只读'}</p></article>)}{!sources.length&&<p>没有登记这类来源。现有内容仍可继续使用；原外部资料需先显式关联或导入当前知识库。</p>}{issues.map((issue,index)=><p key={index} role="status">{issue.message} · {issue.sourceId}</p>)}<div className="actions">{roles.map(role=><Button key={role} disabled={busy||working} onClick={()=>void choose(role)}>关联{names[role]??role}目录</Button>)}<Button disabled={busy||working} onClick={()=>setVersion(n=>n+1)}>重新核对来源</Button></div></details>;
}
