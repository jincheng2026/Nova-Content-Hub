import type {ProductionReference} from './production.js';
export function serializeProductionReference(reference:ProductionReference):string;
export function productionReferenceHash(reference:ProductionReference):Promise<string>;
export function validateTranscriptReference(reference:ProductionReference,intent:'extract'|'correct'|'reextract',missingAssetHashes?:string[]):void;
