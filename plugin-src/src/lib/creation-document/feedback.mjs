import {itemFingerprint,norm} from './fingerprint.mjs';
import {kindOf,protocolError} from './parse.mjs';
import {countQuote} from './build.mjs';
export function noteStatus(item){const note=norm(item.fields[kindOf(item)==='info'?'overall_note':'note']??'');if(!note.trim())return 'empty';return note===norm(item.locked.ai_state?.handled_note??'')?'handled':'pending';}
export function buildSuggestionEdits(doc,input){
 const suggestion=doc.items.find(it=>it.id===input.suggestionId&&kindOf(it)==='suggestion');if(!suggestion)protocolError('SUGGESTION_REQUIRED');
 if(!['采纳','不采纳','部分采纳'].includes(input.decision))protocolError('INVALID_DECISION');
 const edits=[];const add=(item,field,after)=>{if(!Object.hasOwn(item.fields,field)||typeof after!=='string')protocolError('INVALID_FIELD');if(item.fields[field]!==after)edits.push({itemId:item.id,field,before:item.fields[field],after,itemFingerprint:itemFingerprint(item)});};
 const proposed=input.proposed??suggestion.fields.proposed;if(typeof proposed!=='string')protocolError('PROPOSED_REQUIRED');
 if(input.proposed!==undefined)add(suggestion,'proposed',proposed);
 if(input.decision!=='不采纳'){
  const seg=doc.items.find(it=>it.id===suggestion.locked.segment&&kindOf(it)==='segment');if(!seg)protocolError('SEGMENT_REQUIRED');
  if(countQuote(seg.fields.mine,suggestion.locked.original)!==1)protocolError('QUOTE_NOT_UNIQUE');
  if(input.decision==='部分采纳'){if(typeof input.partialMine!=='string')protocolError('PARTIAL_MINE_REQUIRED');add(seg,'mine',input.partialMine);}
  else add(seg,'mine',norm(seg.fields.mine).replace(norm(suggestion.locked.original),()=>proposed.trim()?proposed:''));
 }
 add(suggestion,'decision',input.decision);return edits;
}
