import {stageDesktopInput} from '../shared/stage-validation.ts';
import {fail,requireWrite} from '../shared/validation.ts';
import type {LibraryBinding,Worker} from '../shared/contracts.ts';
import type {StageInputs} from '../shared/stage-contracts.ts';
interface Owner {authMode:'required'|'disabled';worker:Worker;current():LibraryBinding;noPending():void;exclusive<T>(action:()=>Promise<T>):Promise<T>}
export class StageController {
 readonly owner:Owner;
 constructor(owner:Owner){this.owner=owner;}
 run<K extends keyof StageInputs>(method:K,input:StageInputs[K]){if(stageDesktopInput(method,input)!==true)fail('INVALID_INPUT','阶段决定只接受当前作者输入与准确版本。');requireWrite(this.owner.authMode);return this.owner.exclusive(async()=>{this.owner.noPending();const binding=this.owner.current();return method==='confirmJinchengCheckpoint'?this.owner.worker.call('stageConfirm',{binding,input:input as StageInputs['confirmJinchengCheckpoint']}):this.owner.worker.call('stageAuthorAnalysis',{binding,input:input as StageInputs['saveJinchengAuthorAnalysis']});});}
}
