import {useRef,useState} from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import Input from '@douyinfe/semi-ui-19/lib/es/input';
import TextArea from '@douyinfe/semi-ui-19/lib/es/input/textarea';
import {ProductionDialog} from './production-dialog.tsx';
import {useManagedDraftGuard} from './library-panels.tsx';

export function ManualReport({open,busy,close,save}:{open:boolean;busy:boolean;close():void;save(input:{title:string;markdown:string}):Promise<void>}){
 const [title,setTitle]=useState(''),[markdown,setMarkdown]=useState(''),[working,setWorking]=useState(false),[error,setError]=useState('');
 const active=useRef(false),dirty=!!title||!!markdown;
 useManagedDraftGuard(dirty);
 if(!open)return null;
 async function submit(){
  if(active.current||busy||!markdown.trim())return;
  active.current=true;setWorking(true);setError('');
  try{await save({title:title.trim()||'手工调研报告',markdown});setTitle('');setMarkdown('');close();}
  catch(issue){setError(issue instanceof Error?issue.message:'保存未完成，填写仍保留。');}
  finally{active.current=false;setWorking(false);}
 }
 return <ProductionDialog title="手工新建报告" busy={busy||working} close={close} initialFocus="#manual-report-title" notice={error}>
  <form className="production-modal-form" onSubmit={event=>{event.preventDefault();void submit();}}>
   <div className="production-form production-dialog-body">
    <label htmlFor="manual-report-title">报告名称（选填）</label><Input id="manual-report-title" value={title} onChange={setTitle} disabled={busy||working} maxLength={500}/>
    <label htmlFor="manual-report-body">报告正文</label><TextArea id="manual-report-body" value={markdown} onChange={setMarkdown} disabled={busy||working} maxLength={100000} autosize={{minRows:8,maxRows:20}} placeholder="写下结论、来源和需要继续核实的内容，支持 Markdown。"/>
   </div>
   <div className="production-dialog-footer"><Button disabled={busy||working} onClick={close}>收起并保留</Button><Button type="danger" theme="borderless" disabled={busy||working||!dirty} onClick={()=>{setTitle('');setMarkdown('');setError('');close();}}>放弃填写</Button><Button theme="solid" htmlType="submit" loading={working} disabled={busy||working||!markdown.trim()}>保存报告</Button></div>
  </form>
 </ProductionDialog>;
}
