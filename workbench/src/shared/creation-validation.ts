import {exact,uuid} from './validation.ts';
import {isRecord} from './contracts.ts';
import {vaultDocumentId} from './vault-validation.ts';
export function creationDesktopInput(method:string,input:unknown):boolean|undefined {
 if(method==='openCreationPage')return exact(input,['id'])&&vaultDocumentId(input.id);
 if(method==='closeCreationPage')return exact(input,['sessionId'])&&uuid(input.sessionId);
 if(method==='creationPageRequest')return exact(input,['sessionId','action','payload'])&&uuid(input.sessionId)&&['request','stash-read','stash-write','copy','open-link','reload'].includes(input.action as string)&&jsonPayload(input.payload);
}
export function jsonPayload(value:unknown):boolean {
 try{return JSON.stringify(value).length<=4_000_000&&value!==undefined;}catch{return false;}
}
export function stringMap(value:unknown):value is Record<string,string>{return isRecord(value)&&Object.keys(value).length<2000&&Object.entries(value).every(([key,text])=>key.length<500&&typeof text==='string'&&text.length<1_000_000);}
