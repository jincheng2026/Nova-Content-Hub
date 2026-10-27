/** Read the author's original overview as evidence; never derive shooting order from file times. */
export interface TopicOverviewRow {tNumber:string;type:string;group:string;summary:string;status:string;source:string;publishDate:string;recorded:boolean}
export interface TopicOverview {rows:Map<string,TopicOverviewRow>;plans:Map<string,{date:string;text:string}>;deferred:Map<string,{date:string;text:string}>;order:string[];schedule:{date:string;text:string}|null}
const clean=(value:string)=>value.replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*`]/g,'').trim();
const ids=(value:string)=>[...new Set(value.match(/T\d{3,}(?!\d)/g)??[])];
export function parseTopicOverview(markdown:string):TopicOverview {
 const rows:TopicOverview['rows']=new Map(),plans:TopicOverview['plans']=new Map(),deferred:TopicOverview['deferred']=new Map();let order:string[]=[],schedule:TopicOverview['schedule']=null,section='',type='',group='',header:string[]|null=null;
 for(const raw of markdown.split(/\r?\n/)){
  const line=raw.trim();if(line.startsWith('## ')){section=line.slice(3).trim();type='';group='';header=null;continue;}
  if(line.startsWith('### ')){type=line.slice(4).replace(/\s+/g,'');header=null;continue;}
  const mark=line.match(/^\*\*(已做|待做)\*\*/);if(mark){group=mark[1];header=null;continue;}
  if(!line.startsWith('|')){header=null;continue;}const cells=line.replace(/^\||\|$/g,'').split(/(?<!\\)\|/).map(clean);if(cells.every(cell=>/^:?-+:?$/.test(cell)))continue;
  if(!header){header=cells;continue;}const col=(name:string)=>{const i=header!.indexOf(name);return i<0?'':cells[i]??'';};
  if(section==='近三天内容安排'){const found=ids(col('对应选题'));for(const id of found)plans.set(id,{date:col('日期'),text:col('安排')});if(/顺序/.test(col('安排'))&&found.length){order=found;schedule={date:col('日期'),text:col('安排')};}}
  else if(section==='顺延事项'){for(const id of ids(col('对应选题')))deferred.set(id,{date:col('新日期'),text:col('安排')});}
  else {const id=ids(col('编号')||cells[0]||'')[0];if(id&&!rows.has(id))rows.set(id,{tNumber:id,type,group,summary:col('选题')||cells[1]||'',status:col('状态'),source:col('来源'),publishDate:col('发布日期'),recorded:(col('选题')+col('编号')).includes('✅')});}
 }
 return {rows,plans,deferred,order,schedule};
}
export function workMatches(query:string,work:{tNumber:string;title:string;summary:string}){const q=query.trim().toLocaleLowerCase();if(!q)return true;const n=q.match(/^t?(\d+)$/);if(n)return Number(work.tNumber.replace(/^T/i,''))===Number(n[1])||work.tNumber.toLowerCase().startsWith('t'+n[1]);return `${work.tNumber} ${work.title} ${work.summary}`.toLocaleLowerCase().includes(q);}
/** Explicit author publication entries are retained; recording or an 已做 folder alone never means published. */
export function classifyWork(facts:{published:boolean;recorded:boolean;hasDraft:boolean;overviewStatus?:string}):'topics'|'doing'|'published'{return facts.published?'published':facts.recorded||facts.hasDraft?'doing':'topics';}
