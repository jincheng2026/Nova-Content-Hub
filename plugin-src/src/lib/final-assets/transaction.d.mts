import type {Buffer} from 'node:buffer';
export {applyFinalAssetsReceipt} from './index.mjs';
export const FINAL_ASSET_LIMITS: Readonly<{text:number;cover:number;raw:number;receipt:number}>;
export function readFinalBytes(root:string,relative:string,limit:number):Buffer;
