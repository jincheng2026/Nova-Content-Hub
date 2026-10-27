import {readBytes,json,digest,queryVaultMutation} from '../vault/core.mjs';
import {boundRuntime,transactCreation,sourcePath} from './store.mjs';
import {parseCreationHtml,kindOf,protocolError} from './parse.mjs';
/** Only the trusted author controller may invoke this capability. It is not an
 * assistant tool. The resulting immutable decision is revision/item specific. */
export async function confirmCreationRemoval(root,input){
 return transactCreation(root,{operation:'confirm-removal',source:input.source,input},input.mutationId,r=>{
  const current=parseCreationHtml(readBytes(r,sourcePath(input.source)),input.source);
  if(!current.writable||current.revision!==input.expectedRevision)protocolError('CONFLICT');
  if(!Array.isArray(input.itemIds)||!input.itemIds.length||new Set(input.itemIds).size!==input.itemIds.length||input.itemIds.some(id=>!current.items.some(it=>it.id===id&&kindOf(it)!=='info')))protocolError('INVALID_REMOVAL_IDS');
  const decision={format:'nova-creation-author-decision',kind:'remove-items',decisionId:input.mutationId,source:input.source,pageId:current.pageId,revision:current.revision,itemIds:[...input.itemIds].sort(),actor:'author',at:new Date().toISOString()};
  const bytes=Buffer.from(JSON.stringify(decision,null,2)+'\n');
  return {action:'create',path:'.workbench/creation-decisions/'+input.mutationId+'.json',beforeHash:null,after:bytes.toString('base64'),result:{decisionId:input.mutationId,decisionHash:digest(bytes)}};
 });
}
export function verifyCreationRemoval(root,source,revision,pageId,itemIds,decisionId){
 if(typeof decisionId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(decisionId)||!Array.isArray(itemIds)||!itemIds.length)protocolError('VERIFIED_AUTHOR_DECISION_REQUIRED');
 const {runtime}=boundRuntime(root,source),receipt=queryVaultMutation(runtime,decisionId);
 if(!receipt||receipt.status!=='committed'||receipt.request?.operation!=='confirm-removal')protocolError('VERIFIED_AUTHOR_DECISION_REQUIRED');
 const bytes=readBytes(root,'.workbench/creation-decisions/'+decisionId+'.json'),decision=JSON.parse(bytes);
 if(digest(bytes)!==receipt.result?.decisionHash||decision.actor!=='author'||decision.kind!=='remove-items'||decision.revision!==revision||decision.pageId!==pageId||decision.source?.sourceId!==source.sourceId||decision.source?.documentId!==source.documentId||decision.source?.relativePath!==source.relativePath||JSON.stringify([...itemIds].sort())!==JSON.stringify(decision.itemIds))protocolError('AUTHOR_DECISION_BINDING_CONFLICT');
 return decision;
}
