import type {ProductionCreationState, ProductionSnapshot} from './production-contracts.ts';
import type {ProductionMutation} from '../../../plugin-src/src/lib/file-library/production.d.ts';
export interface ProductionCoreLibrary {
 readProduction(): ProductionSnapshot;
 readProductionContext(taskId:string):import('../../../plugin-src/src/lib/file-library/production.d.ts').ProductionContext;
 readProductionCreation(contentId:string): ProductionCreationState & {history: import('../../../plugin-src/src/lib/file-library/production.d.ts').ProductionHistory};
 mutateProduction(op:ProductionMutation,input:Record<string,unknown>,options:{mutationId:string}):ProductionSnapshot;
 saveProductionDraft(contentId:string,input:{body:string;expectedBodyHash:string;expectedProductionToken:string;creationPatch:unknown},editToken:string,options:{mutationId:string}):unknown;
 queryMutation(id:string):{objectId:string;objectKind:string;content:unknown}|null;
 importAsset(source:string,options:{purpose:'photo'|'production-report'|'production-reference'}):{assetHash:string};
 readAsset(hash:string):{assetHash:string;bytes:number;detectedType:string;data:Uint8Array};
}
