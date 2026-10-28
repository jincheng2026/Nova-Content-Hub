import type {ProductionLibrary,ProductionWorkerIdentity} from './file-library/production.js';
export function withProductionWriteScope<T>(library:Pick<ProductionLibrary,'withProductionAuthority'|'readProductionContext'>,identity:ProductionWorkerIdentity,execute:()=>T):T;
export function productionExecution():{taskId:string;attemptId:string;requestHash:string}|null;
export function atProductionCommit<T>(commit:()=>T,options?:{sourceMutationId:string}):T;
