import {useId, useState} from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import TextArea from '@douyinfe/semi-ui-19/lib/es/input/textarea';
import type {ProductionSnapshot, ProductionTask} from '../shared/production-contracts.ts';
import {invoke} from './client.ts';
import {ProductionDialog} from './production-dialog.tsx';
import {useManagedDraftGuard} from './library-panels.tsx';

type Target = {taskId:string;attemptId:string;receiptHash:string;expectedToken:string};
// Captures the reviewed receipt and CAS when opened; background refresh cannot rebase rejection.
export function ProductionRejection({task, productionToken, busy, onRejected}: {task:ProductionTask;productionToken:string;busy:boolean;onRejected(snapshot:ProductionSnapshot):void}) {
    const id=useId(),[target,setTarget]=useState<Target|null>(null),[reason,setReason]=useState(''),[pending,setPending]=useState(false),[notice,setNotice]=useState('');
    const attempt=task.attempts.find(item=>item.id===task.activeAttemptId),blocked=busy||pending;
    useManagedDraftGuard(!!target&&!!reason.trim());
    function close(){setTarget(null);setReason('');setNotice('');}
    async function reject(){
        if(!target||blocked||!reason.trim()||reason.length>2000)return;
        setPending(true);setNotice('');
        try{const snapshot=await invoke('actProductionTask',{...target,action:'reject',reason:reason.trim()});close();onRejected(snapshot);}
        catch(error){const code=(error as {code?:string})?.code;setNotice(code==='CONFLICT'||code==='STALE_INPUT'?'资料或回执已更新，拒绝原因已保留，本次未覆盖。请取消并核对最新任务后再决定。':error instanceof Error?error.message:'拒绝尚未完成，请核对恢复记录后重试。');}
        finally{setPending(false);}
    }
    if(!target&&(attempt?.status!=='submitted'||!attempt.receipt))return null;
    return <>{attempt?.status==='submitted'&&attempt.receipt&&<Button className="production-reject-button" type="danger" disabled={blocked} onClick={()=>{setNotice('');setTarget({taskId:task.id,attemptId:attempt.id,receiptHash:attempt.receipt!.sha256,expectedToken:productionToken});}}>拒绝本次结果</Button>}{target&&<ProductionDialog title="拒绝本次结果" busy={pending} close={close} initialFocus={`[id="${id}"]`} notice={notice} description="只拒绝当前提交及回执；保留原产物，不采用其中内容。取消不会拒绝结果。"><form className="production-modal-form" onSubmit={event=>{event.preventDefault();void reject();}}><div className="production-dialog-body"><p>{task.title}</p><label htmlFor={id}>拒绝原因（必填）</label><TextArea id={id} className="production-rejection-reason" value={reason} disabled={blocked} maxLength={2000} onChange={setReason} autosize={{minRows:3,maxRows:6}}/><p>原因会与本次任务、尝试和回执一起保存为反馈。拒绝后请返回创作，修改要求，再明确创建新任务；不会向原助手聊天自动发送。</p></div><footer className="production-dialog-footer"><Button disabled={pending} onClick={close}>取消</Button><Button className="confirm-reject-production" type="danger" theme="solid" htmlType="submit" loading={pending} disabled={blocked||!reason.trim()||reason.length>2000}>确认拒绝结果</Button></footer></form></ProductionDialog>}</>;
}
