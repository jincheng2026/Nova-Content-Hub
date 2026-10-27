import type {ProductionFile} from './production-contracts.ts';
export interface ReportImportPage {title:string;assetHash:string;originalName?:string}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const filename=(value:string)=>value.replace(/\\/g,'/').split('/').at(-1)??value;
export function reportImportMetadata(pages:ReportImportPage[], raw:unknown) {
 if(!record(raw))throw Error('报告元数据必须为 JSON 对象。');
 let collectedAt:string|null=null;
 const date=raw.collectedAt??raw.date;
 if(date!==undefined&&date!==null&&date!==''){
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(date))throw Error('采集日期须为 YYYY-MM-DD 或 ISO 时间。');
  const parsed=new Date(date.length===10?`${date}T00:00:00.000Z`:date);
  if(!Number.isFinite(parsed.valueOf())||date.length===10&&parsed.toISOString().slice(0,10)!==date)throw Error('采集日期无效。');
  collectedAt=parsed.toISOString();
 }
 const ordered:ReportImportPage[]=[],used=new Set<string>();
 if(Array.isArray(raw.pages))for(const item of raw.pages){
  if(!record(item)||typeof item.file!=='string'||typeof item.title!=='string'||!item.title.trim())throw Error('元数据页面须包含 file 和 title。');
  const name=filename(item.file),matches=pages.filter(page=>filename(page.originalName??'')===name);
  if(matches.length!==1)throw Error(`无法唯一匹配报告文件：${name}，请核对已选 HTML 文件。`);
  const page=matches[0];if(used.has(page.assetHash))throw Error('元数据重复引用同一报告页面，请为不同页面提供独立 HTML。');
  used.add(page.assetHash);ordered.push({...page,title:item.title.trim().slice(0,500)});
 }
 for(const page of pages)if(!used.has(page.assetHash))ordered.push(page);
 return {pages:ordered,title:typeof raw.title==='string'?raw.title.trim().slice(0,500):null,type:typeof raw.type==='string'?raw.type.trim().slice(0,100):null,collectedAt,sourceUrl:typeof raw.sourceUrl==='string'?raw.sourceUrl:null,meta:raw};
}
export const reportImportPages=(files:ProductionFile[]):ReportImportPage[]=>files.map(file=>({title:file.originalName,assetHash:file.assetHash,originalName:file.originalName}));
