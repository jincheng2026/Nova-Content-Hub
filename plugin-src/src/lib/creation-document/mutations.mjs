import {itemFingerprint,norm} from './fingerprint.mjs';
import {protocolError,kindOf,isRecord} from './parse.mjs';
export function assertActorCanWrite(actor,item,field) {
 if(!actor||!['author','assistant'].includes(actor.kind))protocolError('ACTOR_REQUIRED');
 if(!item?.fields||!Object.hasOwn(item.fields,field))protocolError('FIELD_GONE',field);
 if(actor.kind==='author')return;
 if(!actor.taskId||!actor.requestId)protocolError('ASSISTANT_REQUEST_REQUIRED');
 const allowed=(kindOf(item)==='suggestion'&&field==='proposed')||(kindOf(item)==='step'&&field==='prompt');
 if(!allowed)protocolError('AUTHOR_FIELD',field);
}
export function sameSource(a,b){return a?.sourceId===b?.sourceId&&a?.documentId===b?.documentId&&a?.relativePath===b?.relativePath&&a?.vaultId===b?.vaultId;}
export function applyEditGroup(current,group) {
 if(!current.writable)protocolError('READ_ONLY');
 if(!sameSource(current.source,group?.source)||current.pageId!==group.pageId)protocolError('IDENTITY_CHANGED');
 if(!/^[a-f0-9]{64}$/.test(group.baseRevision??'')||!Array.isArray(group.edits)||!group.edits.length)protocolError('INVALID_EDIT_GROUP');
 const seen=new Set();
 for(const edit of group.edits){
  if(!isRecord(edit)||typeof edit.itemId!=='string'||typeof edit.field!=='string'||typeof edit.before!=='string'||typeof edit.after!=='string')protocolError('INVALID_FIELD_EDIT');
  const key=JSON.stringify([edit.itemId,edit.field]);if(seen.has(key))protocolError('DUPLICATE_FIELD_EDIT');seen.add(key);
  const item=current.items.find(x=>x.id===edit.itemId);
  if(!item||itemFingerprint(item)!==edit.itemFingerprint||item.fields[edit.field]!==edit.before)protocolError('CONFLICT',key);
  assertActorCanWrite(group.actor,item,edit.field);
 }
 const next=structuredClone(current);next.items=next.raw.items;
 for(const edit of group.edits)next.items.find(x=>x.id===edit.itemId).fields[edit.field]=edit.after;
 return next;
}
function judge(item,c) {
 const r={change_id:c.change_id};
 if(!item)return {...r,status:'conflict',reason:'item_gone'};
 const fp=itemFingerprint(item),fields=item.fields;
 if(fp!==c.item_fp)return {...r,status:'conflict',reason:'item_changed',item_fp:fp,...(Object.hasOwn(fields,c.field)?{current:fields[c.field]}:{})};
 if(!Object.hasOwn(fields,c.field))return {...r,status:'conflict',reason:'field_gone'};
 if(norm(fields[c.field])===norm(c.after))return {...r,status:'ok',reason:'already'};
 if(norm(fields[c.field])===norm(c.before)){fields[c.field]=c.after;return {...r,status:'ok',reason:'written'};}
 return {...r,status:'conflict',reason:'changed',current:fields[c.field]};
}
export function applyKitChanges(current,changes,actor) {
 if(!current.writable)protocolError('READ_ONLY');
 if(!Array.isArray(changes)||changes.length>2000)protocolError('INVALID_KIT_CHANGES');
 const ids=new Set();for(const c of changes){
  if(!isRecord(c)||['change_id','item_id','field','before','after','item_fp'].some(k=>typeof c[k]!=='string')||(c.group!==undefined&&typeof c.group!=='string')||!c.change_id||ids.has(c.change_id))protocolError('INVALID_KIT_CHANGE');ids.add(c.change_id);
  const item=current.items.find(it=>it.id===c.item_id);if(item&&Object.hasOwn(item.fields,c.field))assertActorCanWrite(actor,item,c.field);
 }
 const failed=new Set();let next,results;
 // Exact source protocol: discard failed groups and retry to a fixed point,
 // because another group may depend on a change that was rolled back.
 for(;;){
  next=structuredClone(current);next.items=next.raw.items;const items=new Map(next.items.map(it=>[it.id,it]));
  results=changes.map(c=>c.group&&failed.has(c.group)?null:judge(items.get(c.item_id),c));
  const bad=changes.filter((c,i)=>c.group&&results[i]?.status==='conflict'&&!failed.has(c.group)).map(c=>c.group);
  if(!bad.length)break;for(const group of bad)failed.add(group);
 }
 for(let i=0;i<changes.length;i++)if(results[i]===null){const c=changes[i],item=next.items.find(it=>it.id===c.item_id),own=judge(item?structuredClone(item):null,c);results[i]=own.status==='conflict'?{...own,group:c.group}:{change_id:c.change_id,status:'conflict',reason:'group_conflict',group:c.group,...(item?{item_fp:itemFingerprint(item),...(Object.hasOwn(item.fields,c.field)?{current:item.fields[c.field]}:{})}:{})};}
 return {doc:next,results};
}
