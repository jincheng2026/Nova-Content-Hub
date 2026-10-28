export type SearchSample = {videoId:string;title:string;authorId:string;authorName:string;canonicalUrl:string}
export function researchResponseDigest(response:unknown):string;
export function deriveSearchSamples(response:unknown,limit:number):SearchSample[];
