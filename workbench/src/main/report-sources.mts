/** Read-only source catalog. Report scripts never receive app privileges. */
export function reportSources(html:string, sourceUrl?:string|null):string[] {
 const urls=new Set<string>();
 const add=(raw:string)=>{try{const decoded=raw.replace(/&amp;/gi,'&').replace(/&#(?:x([0-9a-f]+)|(\d+));/gi,(_,hex,decimal)=>String.fromCodePoint(Math.min(0x10ffff,parseInt(hex??decimal,hex?16:10))));const url=new URL(decoded);if(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&url.href.length<=4096)urls.add(url.href);}catch{}};
 if(sourceUrl)add(sourceUrl);
 for(const match of html.matchAll(/\bhref\s*=\s*(?:"([^"]+)"|'([^']+)')/gi)){if(urls.size>=100)break;add(match[1]??match[2]);}
 return [...urls];
}
