import {randomBytes} from 'node:crypto';
import {verifyCreationRemoval} from './decisions.mjs';
import {readBytes} from '../vault/core.mjs';
import {parseCreationHtml,replaceCreationData,kindOf,protocolError,isRecord,validateRaw} from './parse.mjs';
import {transactCreation,sourcePath,resultFor} from './store.mjs';
import {assembleCreationData,exportCreationData,validateBuildData,countQuote} from './build.mjs';
const structuralKeys={info:['type','stage','title','narrative','speech_rate','spare_refs'],segment:['order','title','role','refs','baseline','teleprompter'],suggestion:['segment','category','source','original','reason','basis','verdict'],step:['segment','order','line','where','expect','caution'],refnote:['segment','summary','points','borrow','merged'],skeleton:['families','rows'],pubslot:['slot','refs'],pubcand:['slot','round','order','reason','angle','basis']};
export async function commitCreationStructure(root,input){
 if(!input.actor||!['author','assistant'].includes(input.actor.kind))protocolError('ACTOR_REQUIRED');if(input.actor.kind==='assistant'&&(!input.actor.taskId||!input.actor.requestId))protocolError('ASSISTANT_REQUEST_REQUIRED');
 return transactCreation(root,{operation:'structure',source:input.source,input},input.mutationId,r=>{
  const bytes=readBytes(r,sourcePath(input.source)),current=parseCreationHtml(bytes,input.source);if(!current.writable)protocolError('READ_ONLY');if(current.revision!==input.expectedRevision)protocolError('CONFLICT');
  const next=structuredClone(current);next.items=next.raw.items;const action=input.action,p=action?.payload;if(!isRecord(p))protocolError('INVALID_STRUCTURE_ACTION');
  if(action.kind==='append-suggestion'){
   const data=exportCreationData(next),suggestion={...p,id:p.id??'sug-'+randomBytes(6).toString('hex')};
   if(next.items.some(x=>x.id===suggestion.id))protocolError('DUPLICATE_ITEM_ID');data.suggestions.push(suggestion);
   next.raw=assembleCreationData(data,current.raw).raw;next.items=next.raw.items;
  }else if(action.kind==='append-item'){
   const item=structuredClone(p);if(!item.id)item.id=item.kind+'-'+randomBytes(6).toString('hex');
   if(!['step','refnote','skeleton','pubslot','pubcand'].includes(item.kind))protocolError('UNSUPPORTED_APPEND_KIND');
   if(next.items.some(it=>it.id===item.id))protocolError('DUPLICATE_ITEM_ID');
   if(item.locked?.ai_state!==undefined)protocolError('AI_STATE_REQUIRES_REPLY');
   if(!isRecord(item.fields)||Object.values(item.fields).some(x=>typeof x!=='string')||['mine','note','decision','approved','final','recorded'].some(k=>item.fields[k]))protocolError('AUTHOR_FIELD');
   next.items.push(item);
  }else if(action.kind==='set-locked'){
   const item=next.items.find(x=>x.id===p.itemId);if(!item)protocolError('ITEM_REQUIRED');
   if(p.key==='ai_state')protocolError('AI_STATE_REQUIRES_REPLY');
   if(typeof p.key!=='string'||!structuralKeys[kindOf(item)]?.includes(p.key))protocolError('UNKNOWN_LOCKED_READ_ONLY');
   if(p.key==='order'&&(!Number.isInteger(p.value)||p.value<1))protocolError('INVALID_ORDER');
   item.locked[p.key]=structuredClone(p.value);
   if(kindOf(item)==='suggestion'&&['segment','original'].includes(p.key)){const seg=next.items.find(x=>x.id===item.locked.segment&&kindOf(x)==='segment');if(!seg||typeof item.locked.original!=='string'||countQuote(seg.fields.mine,item.locked.original)!==1)protocolError('QUOTE_NOT_UNIQUE');}
  }else if(action.kind==='reorder'){
   const segments=next.items.filter(x=>kindOf(x)==='segment'),ids=p.itemIds;
   if(!Array.isArray(ids)||ids.length!==segments.length||new Set(ids).size!==ids.length||ids.some(id=>!segments.some(s=>s.id===id)))protocolError('INVALID_REORDER');
   ids.forEach((id,i)=>{segments.find(s=>s.id===id).locked.order=i+1;});
  }else if(action.kind==='rebase'){
   if(input.actor.kind!=='author')protocolError('AUTHOR_DECISION_REQUIRED');
   if(!Array.isArray(p.itemIds)||!p.itemIds.length)protocolError('ITEM_IDS_REQUIRED');
   for(const id of p.itemIds){const item=next.items.find(it=>it.id===id&&kindOf(it)==='segment');if(!item)protocolError('SEGMENT_REQUIRED');item.locked.baseline=item.fields.mine;}
  }else if(action.kind==='remove-items'){
   if(input.actor.kind!=='author')protocolError('AUTHOR_DECISION_REQUIRED');
   verifyCreationRemoval(r,input.source,current.revision,current.pageId,p.itemIds,input.authorDecisionId);
   next.raw.items=next.items.filter(it=>!p.itemIds.includes(it.id));next.items=next.raw.items;
   if(next.items.some(it=>typeof it.locked.segment==='string'&&p.itemIds.includes(it.locked.segment)))protocolError('DANGLING_ITEM_REFERENCE');
  }else protocolError('UNSUPPORTED_STRUCTURE_ACTION');
  const issues=validateRaw(next.raw);if(issues.length)protocolError('BUILD_SCHEMA',issues.join(','));
  validateBuildData(exportCreationData(next));const out=replaceCreationData(bytes,next);
  return {action:'save',path:sourcePath(input.source),beforeHash:current.revision,after:Buffer.from(out).toString('base64'),creationPageId:current.pageId,creationBefore:bytes.toString('base64'),result:resultFor(input.mutationId,out,['structure:'+action.kind])};
 });
}
