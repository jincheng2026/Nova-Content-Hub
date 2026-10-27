import type {ProductionCreation} from './production-contracts.ts';
import {migrateProductionComposition,replaceProductionSegment} from '../../../plugin-src/src/lib/file-library/production-composition.mjs';
/** Stage a review/history body without silently dropping paragraph evidence. */
export function prepareCreationBodyChange(creation:ProductionCreation,previousBody:string,body:string,edit?:{quote:string;replacement:string}){
 const next={...creation,confirmedBodyHash:null,...(creation.filming?{filming:{...creation.filming,readThroughBodyHash:null,recordedBodyHash:null}}:{})};
 if(!creation.composition||body===previousBody)return {body,creation:next,requiresReview:false};
 if(edit){const start=previousBody.indexOf(edit.quote),end=start+edit.quote.length,segment=creation.composition.segments.find(value=>value.start<=start&&value.end>=end);
  if(start>=0&&previousBody.indexOf(edit.quote,start+1)<0&&segment){const local=previousBody.slice(segment.start,segment.end),replacement=local.slice(0,start-segment.start)+edit.replacement+local.slice(end-segment.start);if(replacement){const changed=replaceProductionSegment({body:previousBody,composition:creation.composition,segmentId:segment.id,replacement});if(changed.body===body)return {body,creation:{...next,composition:changed.composition},requiresReview:false};}}
 }
 const migrated=migrateProductionComposition(creation.composition,previousBody,body);
 return {body,creation:{...next,composition:migrated.unmatchedSegments.length?creation.composition:migrated.composition},requiresReview:migrated.unmatchedSegments.length>0};
}
