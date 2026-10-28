import type {Buffer} from 'node:buffer';
import type {Stats} from 'node:fs';
import type {SelectedCoverSnapshot} from '../final-assets/index.mjs';
export function selectedCoverBytes(filename:string,safePath:(filename:string)=>Stats,fail:(code:string,message:string)=>never,limit?:number):Buffer;
export function selectedCoverMethods(h:Record<string,unknown>):{readSelectedCoverSnapshot(contentId:string):SelectedCoverSnapshot;ensureSelectedCoverDecoded(contentId:string):Promise<void>};
