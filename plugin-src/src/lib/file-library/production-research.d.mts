import type {ProductionSnapshot,ProductionCreation,ProductionReference} from './production.d.ts';
export interface ResearchReferenceSource {taskId:string;attemptId:string;receiptHash:string;artifactId:string;title:string;summary:string;references:ProductionReference[]}
export function researchReferenceCatalog(snapshot:Pick<ProductionSnapshot,'tasks'>):ResearchReferenceSource[];
export function prepareResearchAdoption(input:{snapshot:ProductionSnapshot;taskId:string;attemptId:string;receiptHash:string;artifactId:string;creation:ProductionCreation;bodyHash:string;now:string}):Partial<ProductionCreation>;
