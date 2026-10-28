import type {ProductionAccount,ProductionReport} from './production.d.ts';
export interface ProductionRecordPermission {editable:boolean;reason:string|null}
export function productionRecordPermissions(runtimeRoot:string,snapshot:{accounts:ProductionAccount[];reports:ProductionReport[]}):{accounts:Record<string,ProductionRecordPermission>;reports:Record<string,ProductionRecordPermission>};
export function assertProductionRecordMutation(runtimeRoot:string,snapshot:{accounts:ProductionAccount[];reports:ProductionReport[]},op:string,input:Record<string,unknown>):void;
