import type {ProductionComposition,ProductionSegment,ProductionFilming,ProductionAdoption} from './production.js';
export interface SegmentStructureInput {body:string;composition:ProductionComposition;segmentId:string;filming?:ProductionFilming}
export interface SegmentStructureResult {body:string;composition:ProductionComposition;filming?:ProductionFilming}
export interface CompositionRuntime {
 bodyHash(body:string):string;
 position(body:string,quote:string):number;
 validComposition(value:unknown,body?:string,expectedHash?:string,referenceIds?:string[]):value is ProductionComposition;
 assertComposition(value:ProductionComposition,body:string):void;
 createComposition(body:string,createId?:()=>string):ProductionComposition;
 completeComposition(composition:ProductionComposition,body:string,createId?:()=>string):ProductionComposition;
 migrateComposition(composition:ProductionComposition,previousBody:string,body:string):{composition:ProductionComposition;unmatchedSegments:(ProductionSegment&{quote:string})[];requiresReview:boolean};
 replaceSegment(input:{body:string;composition:ProductionComposition;segmentId:string;replacement:string}):{body:string;composition:ProductionComposition};
 splitSegment(input:SegmentStructureInput&{offset:number;createId?:()=>string}):SegmentStructureResult;
 mergeSegment(input:SegmentStructureInput):SegmentStructureResult;
 deleteSegment(input:SegmentStructureInput):SegmentStructureResult;
 filmingScript(body:string,composition:ProductionComposition,filming?:ProductionFilming):string;
 validAdoptions(values:unknown):values is ProductionAdoption[];
}
export function productionCompositionRuntime():CompositionRuntime;
export const compositionBodyHash:CompositionRuntime['bodyHash'];
export const validProductionComposition:CompositionRuntime['validComposition'];
export const createProductionComposition:CompositionRuntime['createComposition'];
export const migrateProductionComposition:CompositionRuntime['migrateComposition'];
export const replaceProductionSegment:CompositionRuntime['replaceSegment'];
export const productionFilmingScript:CompositionRuntime['filmingScript'];
export const validProductionAdoptions:CompositionRuntime['validAdoptions'];
export const splitProductionSegment:CompositionRuntime['splitSegment'];
export const mergeProductionSegment:CompositionRuntime['mergeSegment'];
export const deleteProductionSegment:CompositionRuntime['deleteSegment'];
export const completeProductionComposition:CompositionRuntime['completeComposition'];
