import type {LibraryBinding} from './contracts.ts';
export interface CreationStash {
 version:string;
 records:Record<string,unknown>[];
 storage:{local:Record<string,string>;session:Record<string,string>};
}
export interface CreationFrame {
 sessionId:string;pageId:string;title:string;html:string;url:string;
}
export interface CreationInputs {
 openCreationPage:{id:string};
 creationPageRequest:{sessionId:string;action:'request'|'stash-read'|'stash-write'|'copy'|'open-link'|'reload';payload:unknown};
 closeCreationPage:{sessionId:string};
}
export interface CreationResults {
 openCreationPage:CreationFrame;
 creationPageRequest:unknown;
 closeCreationPage:{closed:true};
}
export type CreationWorkerAction='read'|'meta'|'save'|'history'|'stash-read'|'stash-write'|'reference';
export interface CreationWorkerOperations {
 creationPage:{args:{binding:LibraryBinding;documentId:string;pageId?:string;action:CreationWorkerAction;payload?:unknown};result:unknown};
}
