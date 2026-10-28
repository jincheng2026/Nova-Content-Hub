import {validateInput,fail} from '../shared/validation.ts';
import type {DesktopController} from './controller.mts';
import type {ReportSearchInput} from '../shared/report-search-contracts.ts';
/** Finite native reads queue behind writes and stay pinned to the selected library. */
export class ReportSearchController {
 private queue:Promise<unknown>=Promise.resolve();private queued=0;
 private owner:DesktopController;
 constructor(owner:DesktopController){this.owner=owner;}
 search(input:ReportSearchInput){
  validateInput('searchProductionReports',input);const requested=structuredClone(this.owner.binding.current);
  if(this.queued>=20)return Promise.reject(Object.assign(new Error('报告检索队列已满，请稍后重试'),{code:'BUSY'}));
  this.queued++;const result=this.queue.then(async()=>{
   const deadline=Date.now()+10000;while(this.owner.busy){if(Date.now()>deadline)fail('BUSY','当前修改未完成，请稍后重新检索');await new Promise(resolve=>setTimeout(resolve,40));}
   return this.owner.exclusive(async()=>{this.owner.noPending();const binding=this.owner.current();if(JSON.stringify(requested)!==JSON.stringify(binding))fail('STALE_SEARCH','内容库已变化，请重新检索');
    const value=await this.owner.worker.call('productionReportSearch',{binding,input:structuredClone(input)});if(JSON.stringify(binding)!==JSON.stringify(this.owner.current()))fail('STALE_SEARCH','内容库已变化，请重新检索');return value;
   });
  }).finally(()=>{this.queued--;});this.queue=result.catch(()=>{});return result;
 }
}
