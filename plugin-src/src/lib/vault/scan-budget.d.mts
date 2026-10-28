import type {Dirent} from 'node:fs';
export const VAULT_SCAN_LIMITS:Readonly<{entries:number;directories:number;documents:number;depth:number}>;
export interface ScanBudget {limits:typeof VAULT_SCAN_LIMITS;entries:number;directories:number;documents:number}
export function createScanBudget(overrides?:Partial<typeof VAULT_SCAN_LIMITS>):ScanBudget;
export function enterScanDirectory(budget:ScanBudget,depth:number):void;
export function scanDirectoryEntries(directory:string,budget:ScanBudget,ignore?:(entry:Dirent)=>boolean):Dirent[];
export function consumeScanDocument(budget:ScanBudget):void;
