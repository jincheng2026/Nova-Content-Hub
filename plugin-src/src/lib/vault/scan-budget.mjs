import {LibraryError} from '../file-library/index.mjs';
import fs from 'node:fs';
const fail=message=>{throw new LibraryError('INDEX_BUDGET_EXCEEDED',message);};
export const VAULT_SCAN_LIMITS=Object.freeze({entries:250000,directories:25000,documents:20000,depth:24});
export function createScanBudget(overrides={}){const limits={...VAULT_SCAN_LIMITS,...overrides};for(const [key,value]of Object.entries(limits))if(!Object.hasOwn(VAULT_SCAN_LIMITS,key)||!Number.isInteger(value)||value<0||value>VAULT_SCAN_LIMITS[key])throw new LibraryError('INVALID_INPUT','知识库索引预算无效');return{limits,entries:0,directories:0,documents:0};}
export function enterScanDirectory(budget,depth){if(depth>budget.limits.depth)fail(`知识库索引目录深度超过${budget.limits.depth}层预算，请缩短目录层级`);if(++budget.directories>budget.limits.directories)fail(`知识库索引目录数超过${budget.limits.directories}项目录预算`);}
/** Bound enumeration before sorting, including ignored names; never follow links. */
export function scanDirectoryEntries(directory,budget,ignore=()=>false){const entries=[],handle=fs.opendirSync(directory);try{for(let entry;(entry=handle.readSync());){if(++budget.entries>budget.limits.entries)fail(`知识库索引遍历超过${budget.limits.entries}项目预算；附件不会占用${budget.limits.documents}篇文档预算`);if(!ignore(entry))entries.push(entry);}}finally{handle.closeSync();}return entries.sort((a,b)=>a.name.localeCompare(b.name));}
export function consumeScanDocument(budget){if(++budget.documents>budget.limits.documents)fail(`知识库索引超过${budget.limits.documents}篇文档预算；尚未提交任何不完整投影`);}
