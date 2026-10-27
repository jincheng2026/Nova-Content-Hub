import {exact,token,uuid,identity} from './validation.ts';
import type {VaultPending} from './vault-contracts.ts';
export const vaultSections = ['profile','accounts','materials','patterns','topics','drafts','reviews','prompts'] as const;
// IDs are opaque source identities, never filesystem paths supplied by a renderer.
export const vaultDocumentId = (value:unknown):value is string => typeof value==='string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);
const text = (value:unknown,max:number) => typeof value==='string' && value.length<=max && !value.includes('\0') && new TextEncoder().encode(value).byteLength<=max;
export function vaultDesktopInput(method:string,input:unknown):boolean|undefined {
 switch(method){
 case 'readVault':return input===undefined;
 case 'readVaultDocument':case 'revealVaultDocument':return exact(input,['id'])&&vaultDocumentId(input.id);
 case 'saveVaultDocument':return exact(input,['id','expectedHash','text'])&&vaultDocumentId(input.id)&&token(input.expectedHash)&&text(input.text,1_000_000);
 case 'createVaultDocument':return exact(input,['section','title','text'])&&vaultSections.includes(input.section as typeof vaultSections[number])&&text(input.title,500)&&text(input.text,1_000_000);
 case 'trashVaultDocument':return exact(input,['id','expectedHash'])&&vaultDocumentId(input.id)&&token(input.expectedHash);
 case 'recoverVaultMutation':return exact(input,['action'])&&['retry','discard'].includes(input.action as string);
 }
}
export function vaultPending(value:unknown):value is VaultPending {
 return exact(value,['method','input','mutationId','binding']) && ['saveVaultDocument','createVaultDocument','trashVaultDocument'].includes(value.method as string) && uuid(value.mutationId) && exact(value.binding,['libraryId','rootIdentity']) && uuid(value.binding.libraryId)&&identity(value.binding.rootIdentity)&&vaultDesktopInput(value.method as string,value.input)===true;
}
