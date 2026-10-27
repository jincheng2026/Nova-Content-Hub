import type {LibraryBinding} from './contracts.ts';
export type SourceSummary={sourceId:string;role:string;title:string;available:boolean;entryPath:string|null};
export interface JinchengSourceWorkerOperations {
 jinchengSources:{args:{binding:LibraryBinding};result:SourceSummary[]};
 jinchengSourceCatalog:{args:{binding:LibraryBinding;sourceId:string};result:{sourceId:string;files:{relativePath:string;bytes:number;modifiedAt:string}[];issues:unknown[]}};
 jinchengSourcePage:{args:{binding:LibraryBinding;sourceId:string;relativePath:string};result:{html:string;hash:string;api:Record<string,unknown>;storage:Record<string,string>;stateHash:string|null;title:string;allowWrites:boolean}};
 jinchengSourceAsset:{args:{binding:LibraryBinding;sourceId:string;relativePath:string};result:{data:Uint8Array;detectedType:string;hash:string}};
 jinchengSourceRequest:{args:{binding:LibraryBinding;sourceId:string;expectedHash:string|null;request:{method:'POST';path:string;body:unknown}};result:{data:unknown;stateHash:string|null}};
}
