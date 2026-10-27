import {publicationRuntimeInput} from '../shared/publication-runtime-validation.ts';
import {fail,requireWrite} from '../shared/validation.ts';
import type {LibraryBinding,Worker} from '../shared/contracts.ts';
import type {PublicationMutation} from '../shared/publication-runtime-contracts.ts';
interface Owner {authMode:'required'|'disabled';worker:Worker;current():LibraryBinding;noPending():void;exclusive<T>(action:()=>Promise<T>):Promise<T>}
export class PublicationController {readonly owner:Owner;constructor(owner:Owner){this.owner=owner;}
 read(input:{contentId:string}){if(publicationRuntimeInput('readJinchengPublication',input)!==true)fail('INVALID_INPUT','内容身份无效');return this.owner.worker.call('publicationRead',{binding:this.owner.current(),input});}
 mutate(input:PublicationMutation){if(publicationRuntimeInput('mutateJinchengPublication',input)!==true)fail('INVALID_INPUT','发布参数无效');requireWrite(this.owner.authMode);return this.owner.exclusive(()=>{this.owner.noPending();return this.owner.worker.call('publicationMutate',{binding:this.owner.current(),input});});}
}
