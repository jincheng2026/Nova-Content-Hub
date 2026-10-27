export type SourceRole = 'bookmarks'|'benchmark-accounts'|'topics'|'drafts'|'materials'|'market-patterns'|'official-archives'|'archive-analysis'|'judgments'|'methods'|'author-evidence'|'cases'|'reports'|'prompts'|'visual-assets';
export type SourceBinding = {id:string;role:SourceRole;mode:'internal'|'linked';root:string;format:string;authority:'official'|'analysis-copy'|'candidate';writable:boolean;available?:boolean;entryPath?:string;entryReady?:boolean;rootIdentity?:{dev:string;ino:string}};
export type SourceMap = {format:'nova-vault-source-map';schemaVersion:1;sources:SourceBinding[];imports:SourceImport[]};
export type SourceImport = {id:string;sourceId:string;sourceRoot:string;at:string;status:'registered';entries:{relativePath:string;hash:string}[]};
export function createDefaultSourceMap(root:string,options?:{createDirectories?:boolean}):SourceMap;
export function readSourceMap(root:string):SourceMap;
export function resolveSource(root:string,sourceId:string):SourceBinding & {available:boolean};
export function linkSource(root:string,input:{role:SourceRole;selectedRoot:string;authority:SourceBinding['authority'];writable?:boolean}):SourceBinding;
/** Registers a hash-verified import plan; does not copy bodies. */
export function importSource(root:string,input:{sourceId:string;selectedEntries:string[];expectedHashes:Record<string,string>}):SourceImport;

export function readSourceInventory(root:string):{sources:(SourceBinding & {available:boolean;projection:'vault-scan'|'bound-source'|'not-loaded'})[];issues:{sourceId:string;code:string;message:string}[]};
export type BoundSourceFile = {sourceId:string;relativePath:string;bytes:number;modifiedAt:string};
export function readBoundSourceCatalog(root:string,input:{sourceId:string;maxFiles?:number}):{source:SourceBinding & {available:boolean};files:BoundSourceFile[];issues:{sourceId:string;relativePath?:string;code:string;message:string}[]};
export function readBoundSourceFile(root:string,input:{sourceId:string;relativePath:string;expectedHash?:string}):{sourceId:string;relativePath:string;hash:string;bytes:number;data:Buffer};
