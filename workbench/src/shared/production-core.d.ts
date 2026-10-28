import type {ProductionCreationState, ProductionSnapshot} from './production-contracts.ts';
import type {ProductionMutation} from '../../../plugin-src/src/lib/file-library/production.d.ts';
export interface ProductionCoreLibrary {
 withProductionAuthority<T>(input:import('../../../plugin-src/src/lib/file-library/production.d.ts').ProductionWorkerIdentity,commit:()=>T):T;
 assertProductionAuthority(input:import('../../../plugin-src/src/lib/file-library/production.d.ts').ProductionWorkerIdentity):true;
 importProductionAsset(input:import('../../../plugin-src/src/lib/file-library/production.d.ts').ProductionWorkerIdentity,source:string,purpose:'production-reference'|'production-report'):{assetHash:string};
 readProductionAsset(input:import('../../../plugin-src/src/lib/file-library/production.d.ts').ProductionWorkerIdentity,hash:string):{assetHash:string;bytes:number;detectedType:string;data:Uint8Array};
 rebuildProductionArchive(taskId:string):import('../../../plugin-src/src/lib/file-library/production.d.ts').ProductionArchive;
 readProduction(): ProductionSnapshot;
 readProductionContext(taskId:string):import('../../../plugin-src/src/lib/file-library/production.d.ts').ProductionContext;
 readProductionCreation(contentId:string): ProductionCreationState & {history: import('../../../plugin-src/src/lib/file-library/production.d.ts').ProductionHistory};
 mutateProduction(op:ProductionMutation,input:Record<string,unknown>,options:{mutationId:string}):ProductionSnapshot;
 saveProductionDraft(contentId:string,input:{body:string;expectedBodyHash:string;expectedProductionToken:string;creationPatch:unknown},editToken:string,options:{mutationId:string}):unknown;
 queryMutation(id:string):{objectId:string;objectKind:string;content:unknown}|null;
 importAsset(source:string,options:{purpose:'photo'|'production-report'|'production-reference'}):{assetHash:string};
 readAsset(hash:string):{assetHash:string;bytes:number;detectedType:string;data:Uint8Array};
}
