import type {ProductionReport} from '../../../plugin-src/src/lib/file-library/production.d.ts';
export interface ReportSearchInput {query:string;type:string|null;from:string|null;scope:'active'|'trash'|'all';cursor?:string|null}
export type ReportSearchField='title'|'account'|'body';
export interface ReportSearchSnippet {field:ReportSearchField;text:string;pageId?:string}
export interface ReportSearchHit {reportId:string;fields:ReportSearchField[];snippets:ReportSearchSnippet[]}
export interface ReportSearchResult {hits:ReportSearchHit[];status:'complete'|'partial';cursor:string|null;pendingPages:number;unreadablePages:number;issues:{reportId:string;pageId:string;message:string}[];snapshotKey:string}
export const reportSearchText=(value:string)=>value.normalize('NFC').toLocaleLowerCase();
export function reportSearchSnippet(text:string,query:string):string {
 const at=reportSearchText(text).indexOf(reportSearchText(query)),start=Math.max(0,at-50);return (start?'…':'')+text.slice(start,start+220)+(text.length>start+220?'…':'');
}
/** Markdown is supplied only after the native reader verifies the registered manual page. */
export function matchReportSearchFields(report:Pick<ProductionReport,'id'|'title'|'accountIds'>,accountNames:ReadonlyMap<string,string>,query:string,registeredMarkdown?:string):ReportSearchHit|null {
 const q=reportSearchText(query.trim()),fields:ReportSearchField[]=[],snippets:ReportSearchSnippet[]=[];
 const add=(field:ReportSearchField,text:string)=>{if(!q||reportSearchText(text).includes(q)){fields.push(field);snippets.push({field,text:reportSearchSnippet(text,query)});}};
 add('title',report.title);const names=report.accountIds.map(id=>accountNames.get(id)).filter((name):name is string=>typeof name==='string').join(' · ');if(names)add('account',names);if(registeredMarkdown!==undefined)add('body',registeredMarkdown);
 return fields.length?{reportId:report.id,fields,snippets}:null;
}

export function validReportSearchInput(value:unknown):value is ReportSearchInput {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;const input=value as Record<string,unknown>;
 return ['query','type','from','scope'].every(k=>Object.hasOwn(input,k))&&Object.keys(input).every(k=>['query','type','from','scope','cursor'].includes(k))&&typeof input.query==='string'&&input.query.length<=500&&!input.query.includes('\0')&&(input.type===null||typeof input.type==='string'&&input.type.length<=200)&&(input.from===null||typeof input.from==='string'&&/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(input.from)&&Number.isFinite(Date.parse(input.from)))&&['active','trash','all'].includes(String(input.scope))&&(input.cursor===undefined||input.cursor===null||typeof input.cursor==='string'&&/^[A-Za-z0-9_-]{32,100}$/.test(input.cursor));
}
