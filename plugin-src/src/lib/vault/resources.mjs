import fs from 'node:fs';
import path from 'node:path';
import {readSourceMap, readBoundSourceCatalog, readBoundSourceFile} from './source-map.mjs';
import {randomUUID} from 'node:crypto';
import {bindingForRuntime, readBytes, digest, uuidFor, safe, json, writeJSON, mkdir, fail,
    saveVaultDocument, createVaultDocument, runMutation, queryVaultMutation, resumeVaultMutation} from './core.mjs';

const STATE = '.workbench/resource-projection.json';
const PROJECTION_POLICY_VERSION = 5;
const MARKDOWN_REPORT_POLICY_VERSION = 1;
const RESOURCE_INPUT_POLICY_VERSION = 1;
const BLOCK = /<!-- nova-content-hub:resource\r?\n([\s\S]*?)\r?\n-->/g;
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const now = () => new Date().toISOString();
const plain = v => v && typeof v === 'object' && !Array.isArray(v);
const strings = v => Array.isArray(v) ? [...new Set(v.filter(x => typeof x === 'string' && x.trim()))] : [];
const validURL = v => {try {return ['https:', 'http:'].includes(new URL(v).protocol) ? v : '';} catch {return '';}};
const htmlEscape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function management(text) {
    const matches=[...text.matchAll(BLOCK)];
    if(matches.length>1) fail('CORRUPT','资源包含重复管理块');
    if(!matches.length) {
        if(/^\s*\{/.test(text)){try{const parsed=JSON.parse(text);if(plain(parsed.$novaContentHub))return parsed.$novaContentHub;}catch{}}
        return null;
    }
    try {const value=JSON.parse(matches[0][1]);if(!plain(value)||!['account','report','prompt'].includes(value.kind)) throw Error();return value;}
    catch {fail('CORRUPT','资源管理块无效，请保留原文后修复');}
}
function withoutBlock(text) {
    const block=management(text);
    if((block?.promptBodyLayout==='after-block'||block?.bodyLayout==='after-block'))return text.replace(/<!-- nova-content-hub:resource\r?\n[\s\S]*?\r?\n-->\r?\n?/,'');
    return text.replace(BLOCK,'');
}
export function encodeResourceBlock(text, value) {
    const old=management(text);
    const next={...(old??{}),...value,record:{...(old?.record??{}),...value.record}};
    if(/^\s*\{/.test(text)){try{const obj=JSON.parse(text);if(plain(obj))return JSON.stringify({...obj,$novaContentHub:next},null,2)+'\n';}catch{}}
    // JSON string escapes prevent user body/HTML from terminating the comment.
    const block=`<!-- nova-content-hub:resource\n${JSON.stringify(next,null,2).replace(/</g,'\\u003c').replace(/>/g,'\\u003e')}\n-->`;
    return old ? text.replace(BLOCK,()=>block) : `${text}${text.endsWith('\n')?'':'\n'}\n${block}\n`;
}
function scalar(value) {
    value=value.trim();
    if(value.startsWith('[')) {try{return JSON.parse(value);}catch{return value.slice(1,-1).split(',').map(s=>s.trim().replace(/^['"]|['"]$/g,''));}}
    return value.replace(/^['"]|['"]$/g,'');
}
function frontmatter(text) {
    const match=text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/), fields={};
    if(match) {
        let list;
        for(const line of match[1].split(/\r?\n/)) {
            const m=line.match(/^([\w\u4e00-\u9fff-]+):\s*(.*)$/);
            if(m){fields[m[1]]=scalar(m[2]);list=m[2].trim()?null:m[1];}
            else if(list&&/^\s*-\s+/.test(line)){if(!Array.isArray(fields[list]))fields[list]=[];fields[list].push(scalar(line.replace(/^\s*-\s+/,'')));}
        }
    }
    return {fields,prefix:match?.[0]??'',body:match?text.slice(match[0].length):text};
}
function field(text, names) {
    for(const name of names){
        const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        const match=text.match(new RegExp(`^\\s*\\|\\s*${escaped}\\s*\\|\\s*([^|]+)\\|`,'m'))??text.match(new RegExp(`^\\s*(?:[-*>]\\s*)?(?:\\*\\*)?${escaped}(?:\\*\\*)?[：:]\\s*(.+)$`,'m'));
        if(match)return match[1].trim();
    }
    return '';
}
function reportCandidate(d,text) {
    const p=d.relativePath;
    if(!['markdown','html'].includes(d.format)) return false;
    if(/(?:^|\/)(?:corpus|transcript|transcripts|backups?|历史版本|原始识别|校正版逐字稿|逐字稿|字幕)(?:\/|$)/i.test(p))return false;
    if(/(?:^|\/)(?:备份|backup|归档副本|其他)(?:\/|$)|(?:副本|\.bak)(?:[._/]|$)/i.test(p)) return false;
    if(/(?:^|\/)(?:_?README|INDEX|AGENTS|CLAUDE|SOURCE_OF_TRUTH)(?:\.|$)|(?:总览|总表|索引|逐字稿|字幕|搜集清单|流程总控|项目总控|说明和进度|复盘方法|蒸馏样本)/i.test(path.posix.basename(p)))return false;
    if(d.section==='drafts'||d.section==='topics'||d.section==='prompts')return false;
    if(d.format==='html')return /调研|报告|复盘|分析|对标|比较/.test(p+' '+text.slice(0,2000));
    return /(?:报告|复盘|分析报告|调研结论)/.test(path.posix.basename(p)) || (/(?:调研|报告库)\//.test(p)&&/分析|结论|方法|拆解|蒸馏/.test(d.title));
}


const RESOURCE_ROLES=new Set(['benchmark-accounts','reports','prompts']);
const FORMAT={'.md':'markdown','.markdown':'markdown','.txt':'text','.html':'html','.htm':'html','.json':'json','.jsonl':'text'};
function resourceSnapshot(snapshot){
    if(!fs.existsSync(safe(snapshot.root,'.workbench/source-map.json',true)))return snapshot;
    const documents=snapshot.documents.map(d=>({...d})),issues=[],boundSources=[],sourceMap=readSourceMap(snapshot.root);
    const byPath=new Map(documents.map(document=>[document.relativePath,document]));
    for(const entry of sourceMap.sources.filter(s=>RESOURCE_ROLES.has(s.role))){
        let catalog;
        try{catalog=readBoundSourceCatalog(snapshot.root,{sourceId:entry.id});}catch(error){if(error.code==='INDEX_BUDGET_EXCEEDED')throw error;issues.push({sourceId:entry.id,relativePath:entry.root,code:error.code??'IO_ERROR',message:error.message});continue;}
        boundSources.push(catalog.source);issues.push(...catalog.issues.map(i=>({...i,relativePath:i.relativePath??entry.root})));
        for(const file of catalog.files){
            const reportSidecar=entry.role==='reports'&&(file.relativePath.split('/').length!==2||!/(?:\.html?$|(?:^|\/)meta\.json$)/i.test(file.relativePath));
            if(reportSidecar&&entry.mode==='internal')continue;
            const relativePath=entry.mode==='internal'?path.posix.join(entry.root,file.relativePath):`${entry.id}/${file.relativePath}`;
            const existing=entry.mode==='internal'?byPath.get(relativePath):null;
            const extra={explicitBinding:entry.mode==='linked'||!!entry.provenance,sourceId:entry.id,boundRole:entry.role,sourceRelativePath:file.relativePath,readRoot:catalog.source.root,readRelativePath:file.relativePath,sourceWritable:entry.mode==='internal'&&entry.writable};
            if(existing){Object.assign(existing,extra,{section:entry.role==='benchmark-accounts'?'accounts':entry.role==='prompts'?'prompts':existing.section});continue;}
            // Every bound sidecar participates in the current-byte signature too.
            // Images/styles can change a report even when its HTML is unchanged.
            const format=reportSidecar?'other':FORMAT[path.extname(file.relativePath).toLowerCase()]??'other';
            try{const data=readBoundSourceFile(snapshot.root,{sourceId:entry.id,relativePath:file.relativePath});documents.push({id:`source-${digest(entry.id+':'+file.relativePath).slice(0,32)}`,relativePath,hash:data.hash,format,section:entry.role==='benchmark-accounts'?'accounts':entry.role==='prompts'?'prompts':'materials',title:path.posix.basename(file.relativePath,path.posix.extname(file.relativePath)),bytes:data.bytes,writable:false,contentId:null,tNumber:null,...extra});}
            catch(error){issues.push({sourceId:entry.id,relativePath,code:error.code??'IO_ERROR',message:error.message});}
        }
    }
    return {...snapshot,documents,sourceIssues:issues,boundSources,sourceMap};
}
const sourceBytes=(snapshot,document)=>readBytes(document.readRoot??snapshot.root,document.readRelativePath??document.relativePath);
function reportHTMLEntities(text) {
    return text.replace(/&(?:amp|quot|apos|lt|gt|#(?:x[0-9a-f]+|\d+));/gi,entity=>{
        const named={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'};
        if(named[entity.toLowerCase()])return named[entity.toLowerCase()];
        const n=entity.slice(2,-1),value=parseInt(n[0].toLowerCase()==='x'?n.slice(1):n,n[0].toLowerCase()==='x'?16:10);
        return value>0&&value<=0x10ffff?String.fromCodePoint(value):'\0';
    });
}
// Only a direct href from a declared page can register an already-snapshotted
// HTML sibling. This never resolves arbitrary paths or follows appendix links.
function reportAppendixName(href) {
    if(!href||href.length>4096||href!==href.trim()||href.startsWith('/')||/^[a-z][a-z\d+.-]*:/i.test(href)||href.includes('?'))return null;
    const pathname=href.split('#',1)[0];if(!pathname)return null;
    let parts;try{parts=pathname.split('/').map(part=>decodeURIComponent(part));}catch{return null;}
    if(parts.some(part=>/[\\/\u0000-\u001f\u007f%:]/.test(part)))return null;
    if(parts.length===2&&parts[0]==='.')parts.shift();
    if(parts.length!==1||parts[0].startsWith('.')||!/^\.html?$/i.test(path.posix.extname(parts[0])))return null;
    return parts[0];
}
function referencedReportAppendices(snapshot,siblings,declaredPages,issues) {
    const appendices=[],seen=new Set(declaredPages.map(page=>page.document.id));
    const anchors=html=>html.replace(/<!--[\s\S]*?-->|<(script|style|textarea|title|xmp)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').matchAll(/<a\b[^>]*>/gi);
    for(const page of declaredPages)for(const anchor of anchors(page.html)){
        const href=anchor[0].match(/(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);if(!href)continue;
        const name=reportAppendixName(reportHTMLEntities(href[1]??href[2]??href[3]));if(!name)continue;
        const candidates=siblings.filter(document=>path.posix.basename(document.relativePath)===name);if(candidates.length!==1)continue;
        const document=candidates[0];if(seen.has(document.id))continue;
        const bytes=sourceBytes(snapshot,document);if(digest(bytes)!==document.hash)fail('CONFLICT','报告附页在读取时变化');
        let html;try{html=htmlBytes(bytes);}catch(error){if(error.code!=='INVALID_INPUT')throw error;issues.push({code:error.code,relativePath:document.relativePath,message:'原报告可选引用附页不是受支持的HTML；已保留声明页面'});continue;}
        const rawTitle=html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1];
        const title=rawTitle?reportHTMLEntities(rawTitle.replace(/<[^>]*>/g,'')).trim().slice(0,500):document.title;
        appendices.push({id:uuidFor(`${snapshot.vaultId}:${document.sourceId}:${document.sourceRelativePath}`),title:title||document.title,html,document});seen.add(document.id);
    }
    return appendices;
}
function originalReportGroups(snapshot,out){
    const grouped=new Set();
    for(const meta of snapshot.documents.filter(d=>d.boundRole==='reports'&&d.format==='json'&&path.posix.basename(d.relativePath)==='meta.json'&&d.sourceRelativePath.split('/').length===2)){
        try{
            const metadata=JSON.parse(sourceBytes(snapshot,meta).toString('utf8')),directory=path.posix.dirname(meta.relativePath);
            const siblings=snapshot.documents.filter(d=>d.sourceId===meta.sourceId&&d.format==='html'&&path.posix.dirname(d.relativePath)===directory);
            for(const d of siblings)grouped.add(d.id);
            if(metadata.workbenchVisible===false){for(const d of siblings)out.inventory.push({documentId:d.id,relativePath:d.relativePath,hash:d.hash,kind:'excluded',reason:'原报告meta明确隐藏；原件仍可按来源读取'});continue;}
            const declared=Array.isArray(metadata.pages)&&metadata.pages.length?metadata.pages:siblings.map(d=>({file:path.posix.basename(d.relativePath),title:d.title})),pages=[];
            for(const p of declared){
                if(typeof p.file!=='string'||!p.file||/[\\/]/.test(p.file)||p.file.startsWith('.')){out.issues.push({code:'INVALID_REPORT_PAGE',relativePath:meta.relativePath,message:'原报告页路径无效，未越界读取'});continue;}
                const d=siblings.find(d=>path.posix.basename(d.relativePath)===p.file);
                if(!d){out.issues.push({code:'SOURCE_MISSING',relativePath:`${directory}/${p.file}`,message:'原报告声明页缺失'});continue;}
                const bytes=sourceBytes(snapshot,d);if(digest(bytes)!==d.hash)fail('CONFLICT','报告在读取时变化');
                pages.push({id:uuidFor(`${snapshot.vaultId}:${meta.sourceId}:${d.sourceRelativePath}`),title:typeof p.title==='string'?p.title:d.title,html:bytes.toString('utf8'),document:d});
                out.inventory.push({documentId:d.id,relativePath:d.relativePath,hash:d.hash,kind:'report',reason:'原报告组内页面'});
            }
            if(!pages.length)continue;
            for(const appendix of referencedReportAppendices(snapshot,siblings,pages,out.issues)){
                pages.push(appendix);
                out.inventory.push({documentId:appendix.document.id,relativePath:appendix.document.relativePath,hash:appendix.document.hash,kind:'report',reason:'原报告同目录引用附页'});
            }
            const id=uuidFor(`${snapshot.vaultId}:source-report:${meta.sourceId}:${meta.sourceRelativePath}`),title=typeof metadata.title==='string'?metadata.title:path.posix.basename(directory).replace(/^\d{4}-\d{2}-\d{2}_/,'');
            out.reports.push({kind:'report',id,document:{...meta,format:'html',hash:digest(JSON.stringify([meta.hash,pages.map(p=>[p.id,p.document.hash])]))},originalDocument:meta,record:{title,type:metadata.type??'调研',accountIds:[],sourceUrl:validURL(metadata.source)||null,collectedAt:typeof metadata.collectedAt==='string'&&/^\d{4}-\d\d-\d\dT/.test(metadata.collectedAt)?metadata.collectedAt:null,meta:{original:metadata}},text:'',body:pages[0].html,block:null,originalPages:pages});
        }catch(error){out.issues.push({code:error.code??'CORRUPT',relativePath:meta.relativePath,message:error.message});}
    }
    return grouped;
}

/** Conservatively classify the one snapshot already read by the bridge. Every source gets an inventory entry. */
export function classifyVaultResources(snapshot) {
    return classifyPreparedResources(resourceSnapshot(snapshot));
}
function classifyPreparedResources(snapshot) {
    const out={accounts:[],reports:[],prompts:[],inventory:[],issues:[...(snapshot.sourceIssues??[])]},companions=[];
    const grouped=originalReportGroups(snapshot,out);
    for(const document of snapshot.documents){
        if(grouped.has(document.id))continue;
        if(document.boundRole==='prompts'&&document.readRoot&&fs.existsSync(safe(document.readRoot,'常用',true))&&!document.sourceRelativePath.startsWith('常用/')){out.inventory.push({documentId:document.id,relativePath:document.relativePath,hash:document.hash,kind:'excluded',reason:'原提示词工作台只列常用目录；历史方法与事件保留来源可读'});continue;}
        let text,block;
        const inv={documentId:document.id,relativePath:document.relativePath,hash:document.hash,kind:'excluded',reason:'不是结构化账号、提示词或报告'};
        out.inventory.push(inv);
        if(!['markdown','json','html','text'].includes(document.format))continue;
        try {
            text=sourceBytes(snapshot,document).toString('utf8');
            if(digest(text)!==document.hash)fail('CONFLICT','资源在投影读取时变化');
            block=management(text);
            if(block?.origin){companions.push({document,block,inv});inv.kind='companion';inv.reason='只读原件的可读管理档案';continue;}
            if(!block&&/^>\s*副本[：:]\s*主档案/m.test(text.slice(0,2000))){inv.reason='显式副本，保留原文和主档案关联，避免重复账号';continue;}
            let body=withoutBlock(text), {fields:fm,body:promptBody}=frontmatter(body),record=null,kind=null;
            if(block){kind=block.kind;record=block.record;}
            else if(document.section==='accounts'&&['markdown','json'].includes(document.format)&&!/(?:^|\/)(?:调研|其他|备份)\/|(?:总览|总表|总控|README|索引|待入库)/i.test(document.relativePath)){
                let obj={};
                if(document.format==='json'){try{obj=JSON.parse(body);}catch{}}
                const name=obj.account_name??obj.name??fm.name??fm.账号名称??field(body,['博主昵称','达人昵称','账号名称','账号名','博主名称','昵称','名称']),platform=obj.platform??fm.platform??field(body,['平台']);
                if(typeof name==='string'&&name.trim()&&(platform||/账号档案|基础信息/.test(body))){
                    kind='account';record={name:name.trim(),platform:typeof platform==='string'&&platform.trim()?platform:'未知',url:validURL(obj.url??fm.url??field(body,['主页链接','主页','链接']))||validURL(body.match(/https?:\/\/[^\s<>"\])]+/)?.[0]),note:obj.note??body,tags:strings(obj.tags??fm.tags),images:[],avatarAssetHash:null,reportIds:[]};
                }
            }
            if(!kind&&(document.section==='prompts'||/^07_[^/]*提示词\//.test(document.relativePath))&&['markdown','text'].includes(document.format)&&!/(?:^|\/)(?:_.*|README|INDEX)(?:\.|$)/i.test(document.relativePath)){
                kind='prompt';record={title:fm.title||document.title,body:promptBody,category:fm.category||fm.分类||(document.sourceRelativePath?.includes('/')?path.posix.basename(path.posix.dirname(document.sourceRelativePath)):''),tags:strings(Array.isArray(fm.tags)?fm.tags:typeof fm.tags==='string'?fm.tags.split(/[、,，]/).map(s=>s.trim()):[]),when:fm.when||'',summary:fm.summary||''};
            }
            if(!kind&&document.boundRole==='reports'&&document.format==='html'&&document.sourceRelativePath.split('/').length===2){kind='report';record={title:document.title,type:'调研',accountIds:[],meta:{}};}
            if(!kind&&(['research-report','report'].includes(fm.type)||['research-report','report'].includes(fm.kind)||(!document.boundRole||document.boundRole!=='reports')&&reportCandidate(document,body))){kind='report';record={title:fm.title||document.title,type:document.section==='reviews'?'复盘':'调研',accountIds:[],sourceUrl:validURL(fm.sourceUrl)||null,collectedAt:null,meta:{}};}
            if(!kind||!plain(record))continue;
            const id=UUID.test(block?.id??'')&&!document.explicitBinding?block.id:uuidFor(`${snapshot.vaultId}:resource:${kind}:${document.id}`);
            const source={kind,id,document,record:structuredClone(record),text,body:['prompt','report'].includes(kind)?promptBody:body,block};
            if(kind==='account'&&document.sourceId){const dir=path.posix.dirname(document.readRelativePath);source.imageFiles=fs.readdirSync(dir==='.'?document.readRoot:safe(document.readRoot,dir)).filter(name=>/\.(?:png|jpe?g|webp)$/i.test(name)).sort((a,b)=>(a.startsWith('头像')?0:1)-(b.startsWith('头像')?0:1)||a.localeCompare(b)).map(name=>{const relativePath=path.posix.join(dir,name);return {root:document.readRoot,relativePath,hash:digest(readBytes(document.readRoot,relativePath))};});}
            out[`${kind==='account'?'accounts':kind==='report'?'reports':'prompts'}`].push(source);
            inv.kind=kind;inv.resourceId=id;inv.reason=block?'明确工作台管理档案':'可辨识的原位资源';
        } catch(error){inv.kind='conflict';inv.reason=error.message;out.issues.push({code:error.code??'CORRUPT',relativePath:document.relativePath,message:error.message});}
    }
    for(const {document,block,inv}of companions){
        const source=out.reports.find(x=>x.document.id===block.origin.documentId&&x.id===block.id);
        if(!source){inv.kind='conflict';inv.reason='关联原件缺失或标识不一致';out.issues.push({code:'SOURCE_MISSING',relativePath:document.relativePath,message:inv.reason});continue;}
        source.record={...source.record,...block.record};source.block=block;source.companion=document;source.companionText=sourceBytes(snapshot,document).toString('utf8');
        if(block.bodyLayout==='after-block'){source.body=frontmatter(withoutBlock(source.companionText)).body;source.managedMarkdown=true;}
    }
    for(const source of out.reports)source.dependencies=reportDependencies(snapshot,source);
    return out;
}

/** Escape every author string; only this fixed block-layout subset generates tags. */
function markdownReportBlocks(lines, depth=0) {
    if(depth>12)return `<pre><code>${htmlEscape(lines.join('\n'))}</code></pre>`;
    const parts=[], marker=line=>line.match(/^( *)([-+*]|\d+[.)])\s+(.*)$/);
    let index=0;
    while(index<lines.length){
        const line=lines[index];
        if(!line.trim()){index++;continue;}
        const fence=line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
        if(fence){
            const code=[],close=new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}\\s*$`);index++;
            while(index<lines.length&&!close.test(lines[index]))code.push(lines[index++]);
            if(index<lines.length)index++;
            parts.push(`<pre><code>${htmlEscape(code.join('\n'))}${code.length?'\n':''}</code></pre>`);continue;
        }
        if(/^ {0,3}>/.test(line)){
            const quote=[];
            while(index<lines.length&&/^ {0,3}>/.test(lines[index]))quote.push(lines[index++].replace(/^ {0,3}> ?/,''));
            parts.push(`<blockquote>${markdownReportBlocks(quote,depth+1)}</blockquote>`);continue;
        }
        const list=marker(line);
        if(list){
            const ordered=/^\d/.test(list[2]),indent=list[1].length,items=[];
            while(index<lines.length){
                const item=marker(lines[index]);
                if(!item||item[1].length!==indent||/^\d/.test(item[2])!==ordered)break;
                const body=[item[3]],contentIndent=item[0].length-item[3].length;index++;
                while(index<lines.length){
                    const next=lines[index],nextMarker=marker(next),spaces=next.match(/^ */)[0].length;
                    if(nextMarker&&nextMarker[1].length<=indent||next.trim()&&spaces<=indent)break;
                    if(!next.trim()){
                        if(index+1<lines.length&&/^\s/.test(lines[index+1])){body.push('');index++;continue;}
                        break;
                    }
                    body.push(next.slice(Math.min(contentIndent,spaces)));index++;
                }
                items.push(`<li>${markdownReportBlocks(body,depth+1)}</li>`);
                if(!lines[index]?.trim()){
                    let next=index;while(next<lines.length&&!lines[next].trim())next++;
                    const candidate=marker(lines[next]??'');
                    if(candidate&&candidate[1].length===indent&&/^\d/.test(candidate[2])===ordered)index=next;else break;
                }
            }
            const tag=ordered?'ol':'ul';parts.push(`<${tag}${ordered?` start="${Number.parseInt(list[2],10)}"`:''}>${items.join('')}</${tag}>`);continue;
        }
        if(line.trim().startsWith('|')&&line.trim().endsWith('|')){
            const rows=[];
            while(index<lines.length&&lines[index].trim().startsWith('|')&&lines[index].trim().endsWith('|')){
                const cells=lines[index++].trim().slice(1,-1).split('|');
                if(!cells.every(cell=>/^\s*:?-+:?\s*$/.test(cell)))rows.push('<tr>'+cells.map(cell=>`<td>${htmlEscape(cell.trim())}</td>`).join('')+'</tr>');
            }
            parts.push(`<table><tbody>${rows.join('')}</tbody></table>`);continue;
        }
        const heading=line.match(/^(#{1,6})\s+(.+)$/);
        parts.push(heading?`<h${heading[1].length}>${htmlEscape(heading[2])}</h${heading[1].length}>`:`<p>${htmlEscape(line)}</p>`);index++;
    }
    return parts.join('');
}
export function renderMarkdownReport(markdown, title) {
    if(title&&!/^#\s/m.test(markdown))markdown=`# ${title}\n\n${markdown}`;
    const body=markdownReportBlocks(withoutBlock(markdown).split(/\r\n?|\n/));
    return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{margin:0;padding:24px;background:#fff;color:#1d1d1f;font:14px/1.7 -apple-system,BlinkMacSystemFont,"Microsoft YaHei",sans-serif;overflow-wrap:anywhere}article{max-width:960px;margin:auto}h1{font-size:24px}h2{font-size:21px}h3{font-size:18px}p{margin:.5em 0}blockquote{margin:1em 0;padding:8px 16px;border-left:3px solid #0071e3;background:#f2f7fd}ul,ol{padding-left:1.8em}li{margin:.35em 0}pre{overflow:auto;padding:14px;background:#fafafc;border-radius:10px;white-space:pre}table{display:block;max-width:100%;overflow:auto;border-collapse:collapse}td{min-width:100px;padding:8px 12px;border:1px solid #ddd}</style><body><article>${body}</article></body></html>`;
}

function loadState(root) {
    if(!fs.existsSync(safe(root,STATE,true)))return {format:'nova-vault-resources',version:1,resources:{account:{},report:{},prompt:{}},inventory:[],issues:[]};
    const state=json(root,STATE);
    if(state.format!=='nova-vault-resources'||state.version!==1||!plain(state.resources)||!['account','report','prompt'].every(k=>plain(state.resources[k])))fail('CORRUPT','结构化资源映射损坏');
    return state;
}
function reportDependencies(snapshot, source) {
    const dependencies=[];
    for(const page of source.originalPages??[{html:source.body,document:source.document}]) {
        const document=page.document, root=document.readRoot??snapshot.root,
            relative=document.readRelativePath??document.relativePath;
        const html=page.html??source.body;
        const urls=[...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>/gi)].map(match=>[match[1]??match[2],'.js']);
        for(const match of html.matchAll(/<link\b[^>]*>/gi)) {
            if(!/\brel\s*=\s*["']stylesheet["']/i.test(match[0]))continue;
            const href=match[0].match(/\bhref\s*=\s*(?:"([^"]+)"|'([^']+)')/i);
            if(href)urls.push([href[1]??href[2],'.css']);
        }
        for(const [url,extension]of urls) {
            try {
                if(/^(?:[a-z][a-z\d+.-]*:|\/\/|\/)/i.test(url)||/[?#]/.test(url))continue;
                const target=path.posix.normalize(path.posix.join(path.posix.dirname(relative),decodeURIComponent(url)));
                if(path.posix.extname(target).toLowerCase()!==extension)continue;
                let hash=null;
                try{hash=digest(readBytes(root,target));}catch(error){if(!['ENOENT','ENOTDIR','INVALID_INPUT'].includes(error.code))throw error;}
                dependencies.push({page:document.relativePath,relativePath:target,hash});
            } catch(error) {if(error.code)throw error;}
        }
    }
    return dependencies;
}
function sourceEntry(s) {
    const foreignOriginal=s.kind==='report'&&s.document.format==='html'&&!s.managedMarkdown&&!s.block?.pageOverrides?.length;
    return {documentId:s.document.id,relativePath:s.document.relativePath,hash:s.originalDocument?.hash??s.document.hash,format:s.document.format,
        ...(s.document.sourceId&&s.document.explicitBinding?{sourceId:s.document.sourceId,sourceRelativePath:s.document.sourceRelativePath,sourceWritable:s.document.sourceWritable}:{}),
        ...(s.originalPages?{originalPages:s.originalPages.map(p=>({id:p.id,relativePath:p.document.relativePath,hash:p.document.hash}))}:{}),
        ...(foreignOriginal?{htmlPolicyVersion:PROJECTION_POLICY_VERSION,previewMode:'isolated-html'}:{}),
        ...(s.kind==='report'?{currentBody:s.block?.pageOverrides?.length?'managed-pages':s.managedMarkdown?'managed-markdown':'original'}:{}),
        ...(s.dependencies?.length?{dependencies:s.dependencies}:{}),
        ...(s.imageFiles?.length?{imageDependencies:s.imageFiles.map(file=>({relativePath:file.relativePath,hash:file.hash}))}:{}),
        ...(s.companion?{companion:{documentId:s.companion.id,relativePath:s.companion.relativePath,hash:s.companion.hash}}:{}),
        ...(s.kind==='report'&&(s.document.format!=='html'||s.managedMarkdown)&&!s.block?.pageOverrides?.length?{markdownPolicyVersion:MARKDOWN_REPORT_POLICY_VERSION}:{})};
}
const markerPath=mid=>`.workbench/resource-projection-mutations/${mid}.json`;
function markProjection(root,mid,kind,objectId,meta,body) {
    mkdir(root,'.workbench/resource-projection-mutations');
    writeJSON(root,markerPath(mid),{kind,objectId,metaHash:digest(JSON.stringify(meta)),bodyHash:body===undefined?null:digest(body)});
}
function htmlBytes(bytes) {
    let html;
    try{html=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('INVALID_INPUT','报告必须是UTF-8 HTML');}
    if(bytes.length>8*1024*1024||html.includes('\0')||!/<(?:!doctype\s+html|html|body|article|section)\b/i.test(html))fail('INVALID_INPUT','报告必须是至多8MiB的UTF-8 HTML');
    return html;
}
function stagePage(vaultRoot,api,html) {
    const bytes=Buffer.from(html);htmlBytes(bytes);
    const rel=`.workbench/resource-assets/${digest(bytes)}.html`;
    mkdir(vaultRoot,'.workbench/resource-assets');
    if(!fs.existsSync(safe(vaultRoot,rel,true)))fs.writeFileSync(safe(vaultRoot,rel,true),bytes,{flag:'wx',mode:0o600});
    if(digest(readBytes(vaultRoot,rel))!==digest(bytes))fail('CORRUPT','报告投影暂存校验失败');
    const asset=api.importAsset(safe(vaultRoot,rel),{purpose:'production-report'});
    htmlBytes(api.readAsset(asset.assetHash).data);
    return asset.assetHash;
}
function reportPreviews(source) {
    const title=source.record.title;
    if(source.document.format!=='html'||source.managedMarkdown)return [{id:uuidFor(`${source.id}:page`),title,html:renderMarkdownReport(source.body,title)}];
    return (source.originalPages??[{id:uuidFor(`${source.id}:page`),title,html:source.body,document:source.document}]).map(p=>({...p,html:prepareOfflineReport(p.html,{root:p.document.readRoot??source.readRoot,relativePath:p.document.readRelativePath??p.document.relativePath})}));
}

function reportRecord(s,root,api,previous) {
    const r=s.record,overrides=s.block?.pageOverrides;
    const previews=Array.isArray(overrides)&&overrides.length?overrides:reportPreviews(s);
    const pages=previews.map(p=>({id:p.id,title:p.title,assetHash:stagePage(root,api,p.html)}));
    return {id:s.id,title:r.title,type:r.type||'调研',accountIds:strings(r.accountIds).filter(x=>UUID.test(x)),sourceUrl:validURL(r.sourceUrl)||null,collectedAt:r.collectedAt??null,pages,pageId:pages.some(p=>p.id===r.pageId)?r.pageId:pages[0].id,meta:{...(plain(r.meta)?r.meta:{}),...(typeof r.meta?.manualMarkdown==='string'&&!overrides?.length?{manualMarkdown:s.body}:{}),vault:{...sourceEntry(s),currentBody:overrides?.length?'managed-pages':s.managedMarkdown?'managed-markdown':'original',...(s.companion?{managedPath:s.companion.relativePath}:{})}},createdAt:previous?.createdAt??r.createdAt??now(),updatedAt:now(),deletedAt:r.deletedAt??null};
}
function accountRecord(s,previous,api) {
    const r=s.record;
    const imported=(s.imageFiles??[]).map(file=>{if(digest(readBytes(file.root,file.relativePath))!==file.hash)fail('CONFLICT','账号图片在投影期间变化');const asset=api.importAsset(safe(file.root,file.relativePath),{purpose:'photo'});if(asset.assetHash!==file.hash)fail('CONFLICT','账号图片在导入期间变化');return asset.assetHash;});
    return {id:s.id,name:r.name,platform:r.platform||'未知',url:validURL(r.url),note:r.note??'',tags:strings(r.tags),images:imported.length?imported:strings(r.images),avatarAssetHash:r.avatarAssetHash??null,reportIds:strings(r.reportIds).filter(x=>UUID.test(x)),createdAt:previous?.createdAt??r.createdAt??now(),updatedAt:now(),deletedAt:r.deletedAt??null};
}

/** The runtime is a rebuildable projection. Source writes are handled before runtime capture below. */
// This is a signature of inputs checked in THIS read, not a time-based cache.
// Only creation pages verified as excluded can omit author bytes. Changed
// pages receive a target read to check explicit resource declarations first.
// Identity/format/availability, all resource hashes, bound sidecars and source
// maps still participate on every read.
const creationOnly = document => document.section === 'drafts' &&
    document.editAdapter === 'creation-document' && !document.boundRole;
function creationExclusions(snapshot, state) {
    const previous=new Map(state.inventory.map(entry=>[entry.documentId,entry])), excluded=new Set();
    for(const document of snapshot.documents.filter(creationOnly)) {
        const old=previous.get(document.id);
        if(old?.kind!=='excluded')continue;
        if(old.hash===document.hash){excluded.add(document.id);continue;}
        // Changed creation pages are a single target read, never an assumption
        // that a jc-doc page cannot also declare an explicit resource block.
        const bytes=sourceBytes(snapshot,document);
        if(digest(bytes)!==document.hash)fail('CONFLICT','创作页在资源签名读取时变化');
        try {
            const text=bytes.toString('utf8'),block=management(text),fields=frontmatter(text).fields;
            if(!block&&!['report','research-report'].includes(fields.type)&&!['report','research-report'].includes(fields.kind))excluded.add(document.id);
        } catch { /* classify reports the exact malformed block */ }
    }
    return excluded;
}
function resourceInputFingerprint(snapshot, libraryId, excluded) {
    return digest(JSON.stringify([RESOURCE_INPUT_POLICY_VERSION,PROJECTION_POLICY_VERSION,MARKDOWN_REPORT_POLICY_VERSION, libraryId,
        snapshot.root, snapshot.vaultId, snapshot.sourceMap ?? null,
        snapshot.boundSources ?? [], snapshot.sourceIssues ?? [],
        snapshot.documents.map(document => excluded.has(document.id)
            ? {...document, hash: null, bytes: null} : document)]));
}
function refreshCreationInventory(state, snapshot, excluded) {
    const byId = new Map(snapshot.documents.filter(document=>excluded.has(document.id)).map(document => [document.id, document]));
    let changed = false;
    for (const entry of state.inventory) {
        const document = byId.get(entry.documentId);
        if (document && entry.kind === 'excluded' && entry.hash !== document.hash) {
            entry.hash = document.hash;
            changed = true;
        }
    }
    return changed;
}
export function projectVaultResources({runtimeRoot,vaultRoot,snapshot,rawApi,mutate}) {
    const state=loadState(vaultRoot), prepared=resourceSnapshot(snapshot),
        exclusions=creationExclusions(prepared,state),
        inputFingerprint=resourceInputFingerprint(prepared,rawApi.info.libraryId,exclusions);
    if (state.fingerprint && state.inputFingerprint === inputFingerprint && state.libraryId === rawApi.info.libraryId) {
        if (refreshCreationInventory(state, prepared, exclusions)) {
            state.fingerprint=digest(JSON.stringify([PROJECTION_POLICY_VERSION,MARKDOWN_REPORT_POLICY_VERSION,rawApi.info.libraryId,state.inventory,state.issues]));
            writeJSON(vaultRoot,STATE,state);
        }
        return;
    }
    const classified=classifyPreparedResources(prepared),fingerprint=digest(JSON.stringify([PROJECTION_POLICY_VERSION,MARKDOWN_REPORT_POLICY_VERSION,rawApi.info.libraryId,classified.inventory,classified.issues]));
    if(state.fingerprint===fingerprint) {
        state.inputFingerprint=inputFingerprint;
        writeJSON(vaultRoot,STATE,state);
        return;
    }
    const blocked=new Set();
    for(const issue of classified.issues)for(const [kind,group]of Object.entries(state.resources))for(const [id,entry]of Object.entries(group)){
        if(entry.relativePath===issue.relativePath||entry.companion?.relativePath===issue.relativePath||entry.originalPages?.some(p=>p.relativePath===issue.relativePath)){entry.missing=true;entry.sourceIssue=issue;blocked.add(`${kind}:${id}`);}
    }
    const production=rawApi.readProduction(),next=structuredClone(production);
    delete next.editToken;delete next.mutationId;delete next.missingAssetHashes;
    let changed=false;
    for(const [kind,collection]of [['account','accounts'],['report','reports']]){
        for(const source of classified[collection]){
            const previous=state.resources[kind][source.id],row=next[collection].find(r=>r.id===source.id);
            if(blocked.has(`${kind}:${source.id}`))continue;
            if(previous?.companion&&!source.companion){
                previous.missing=true;
                classified.inventory.push({documentId:previous.companion.documentId,relativePath:previous.companion.relativePath,hash:previous.companion.hash,kind:'missing',resourceId:source.id,reason:'当前报告管理档案缺失，保留最后当前正文，禁止回退原HTML'});
                continue;
            }
            const entry=sourceEntry(source);
            if(row&&JSON.stringify(previous)===JSON.stringify(entry))continue;
            const record=kind==='account'?accountRecord(source,row,rawApi):reportRecord({...source,readRoot:snapshot.root},vaultRoot,rawApi,row);
            if(row)Object.assign(row,record);else next[collection].push(record);
            state.resources[kind][source.id]=entry;changed=true;
        }
    }
    for(const [kind,key]of [['account','accounts'],['report','reports']]){
        const present=new Set(classified[key].map(s=>s.id));
        for(const [id,entry]of Object.entries(state.resources[kind]))if(!present.has(id)){
            entry.missing=true;
            classified.inventory.push({documentId:entry.documentId,relativePath:entry.relativePath,hash:entry.hash,kind:'missing',reason:'来源缺失或不再可辨识；保留历史并标为只读',resourceId:id});
        }
    }
    // Keep links valid only when their explicit target exists; never guess an association from a name.
    const accountIDs=new Set(next.accounts.map(a=>a.id)),reportIDs=new Set(next.reports.map(r=>r.id));
    for(const a of next.accounts)a.reportIds=a.reportIds.filter(id=>reportIDs.has(id));
    for(const r of next.reports)r.accountIds=r.accountIds.filter(id=>accountIDs.has(id));
    for(const r of next.reports)for(const aid of r.accountIds){const a=next.accounts.find(x=>x.id===aid);if(!a.reportIds.includes(r.id))a.reportIds.push(r.id);}
    if(changed){
        const mid=randomUUID();
        mutate('update','default',{vaultResourceProjection:true},production.editToken,{mutationId:mid},'workspace',meta=>{
            meta.schemaVersion=2;
            // readProduction is a public projection: it intentionally redacts
            // worker claim tokens. Only source-backed arrays may be projected
            // back; task authority and all other private state stay in meta.
            meta.production=meta.production?{...meta.production,accounts:next.accounts,reports:next.reports}:next;
            markProjection(vaultRoot,mid,'workspace','default',meta);return meta;
        });
    }
    const prompts=[...rawApi.listPrompts(),...rawApi.listPromptTrash()];
    const presentPrompts=new Set(classified.prompts.map(s=>s.id));
    for(const [id,entry]of Object.entries(state.resources.prompt))if(!presentPrompts.has(id)){
        entry.missing=true;
        classified.inventory.push({documentId:entry.documentId,relativePath:entry.relativePath,hash:entry.hash,kind:'missing',reason:'来源缺失或不再可辨识；保留历史并标为只读',resourceId:id});
    }
    for(const source of classified.prompts){
        if(blocked.has(`prompt:${source.id}`))continue;
        const entry=sourceEntry(source),previous=state.resources.prompt[source.id],old=prompts.find(p=>p.id===source.id);
        if(old&&JSON.stringify(previous)===JSON.stringify(entry))continue;
        const r=source.record,body=source.body,mid=randomUUID(),operation=!old?'create':old.deletedAt!==null?'restore':'update';
        mutate(operation,old?.id??null,{title:r.title,body},old?.editToken??null,{mutationId:mid},'prompt',meta=>{
            Object.assign(meta,{schemaVersion:2,enabled:r.enabled??true,title:r.title,category:r.category??'',when:r.when??'',summary:r.summary??'',tags:strings(r.tags),favorite:r.favorite??false,provenance:{...(plain(r.provenance)?r.provenance:{}),vault:{...entry}},builtinKey:r.builtinKey??null});
            if(r.deletedAt)meta.deletedAt=r.deletedAt;
            markProjection(vaultRoot,mid,'prompt',source.id,meta,body);return meta;
        },source.id);
        state.resources.prompt[source.id]=entry;
    }
    state.inventory=classified.inventory;state.issues=classified.issues;state.fingerprint=fingerprint;state.inputFingerprint=resourceInputFingerprint(prepared,rawApi.info.libraryId,creationExclusions(prepared,state));state.libraryId=rawApi.info.libraryId;
    writeJSON(vaultRoot,STATE,state);
}

function readReportPage(runtimeRoot,page) {
    if(!/^[a-f\d]{64}$/.test(page.assetHash??''))fail('INVALID_INPUT','报告页面资产标识无效');
    const bytes=readBytes(runtimeRoot,`资产/sha256/${page.assetHash.slice(0,2)}/${page.assetHash}`);
    if(digest(bytes)!==page.assetHash)fail('CORRUPT','报告页面资产校验失败');
    return {id:page.id,title:page.title,html:htmlBytes(bytes)};
}
function transactionChanges(tx) {
    const after=JSON.parse(tx.after[0].toString('utf8')),before=tx.before[0]?JSON.parse(tx.before[0].toString('utf8')):{};
    if(tx.kind==='prompt')return [{kind:'prompt',id:tx.objectId,record:{...Object.fromEntries(['title','category','when','summary','tags','enabled','favorite','builtinKey','provenance','deletedAt'].map(k=>[k,after[k]]))},body:tx.after[1].toString('utf8')}];
    if(tx.kind!=='workspace')return [];
    const changes=[];
    for(const [kind,key]of [['account','accounts'],['report','reports']])for(const record of after.production?.[key]??[]){
        const previous=before.production?.[key]?.find(x=>x.id===record.id);
        if(JSON.stringify(record)!==JSON.stringify(previous))changes.push({kind,id:record.id,record,previous});
    }
    return changes;
}
function receiptFor(runtimeRoot,mid,change,outerMid) {
    let receipt=queryVaultMutation(runtimeRoot,mid);
    if(!receipt)return null;
    if(receipt.status==='pending')receipt=resumeVaultMutation(runtimeRoot,mid);
    const block=management(receipt.result?.text??'');
    if(!receipt.result?.document||block?.kind!==change.kind||block.id!==change.id||block.transaction?.mutationId!==outerMid||block.transaction?.recordHash!==digest(JSON.stringify(change)))fail('INVALID_INPUT','资源mutationId已用于其他原位请求');
    return receipt.result;
}

/** Called from the persisted runtime intent, before any runtime file capture. Safe to replay after source commit. */
function resourceTransactionPlans(runtimeRoot,tx,{replay=false}={}) {
    if(tx.committed||!['workspace','prompt'].includes(tx.kind))return;
    const binding=bindingForRuntime(runtimeRoot);if(!binding)return;
    const root=binding.vaultRoot,mid=tx.intent.mutationId,marker=markerPath(mid);
    if(fs.existsSync(safe(root,marker,true))){
        const m=json(root,marker);
        if(m.kind!==tx.kind||m.objectId!==tx.objectId||m.metaHash!==digest(JSON.stringify(JSON.parse(tx.after[0].toString('utf8'))))||m.bodyHash!==(tx.after[1]?digest(tx.after[1]):null))fail('CORRUPT','资源投影事务标记不匹配');
        return;
    }
    const changes=transactionChanges(tx);if(!changes.length)return;
    const state=loadState(root),plans=changes.map(change=>{
        const resourceMid=uuidFor(`${mid}:resource:${change.kind}:${change.id}`),replayed=replay?receiptFor(runtimeRoot,resourceMid,change,mid):null,entry=state.resources[change.kind][change.id];
        if(replayed)return {change,resourceMid,replayed,entry};
        if(entry?.sourceId&&entry.sourceWritable===false&&change.kind!=='report')fail('FORBIDDEN','已关联外部来源只读，请先显式导入库内再编辑');

        if(entry?.missing)fail('CONFLICT','原位资源来源缺失或不可辨识，当前仅可读取历史');
        let text='',target=entry;
        if(entry){
            let sourceBytes;try{sourceBytes=entry.sourceId?readBoundSourceFile(root,{sourceId:entry.sourceId,relativePath:entry.sourceRelativePath}).data:readSourceForMutation(root,entry.relativePath);}catch(error){if(['ENOENT','ENOTDIR','SOURCE_NOT_AVAILABLE'].includes(error.code))fail('CONFLICT','原位资源来源已缺失');throw error;}
            if(digest(sourceBytes)!==entry.hash)fail('CONFLICT',`知识资源已在外部修改：${entry.relativePath}`);
            if(entry.companion){target=entry.companion;const companion=readSourceForMutation(root,target.relativePath);if(digest(companion)!==target.hash)fail('CONFLICT','报告管理档案已在外部修改');text=companion.toString('utf8');}
            else text=sourceBytes.toString('utf8');
        }
        return {change,resourceMid,entry,target,text};
    });
    return {root,state,plans};
}
function readSourceForMutation(root,relativePath){
    try{return readBytes(root,relativePath);}catch(error){if(['ENOENT','ENOTDIR'].includes(error.code))fail('CONFLICT',`原位资源来源已缺失：${relativePath}`);throw error;}
}

/** Validate known source conflicts before a runtime intent can enter the recovery queue. */
export function validateVaultResourceTransaction(runtimeRoot,tx){
    const context=resourceTransactionPlans(runtimeRoot,tx);
    if(context)for(const plan of context.plans)management(plan.text);
}

function createReportDocument(runtimeRoot,title,text,options){
    return runMutation(runtimeRoot,{action:'create-report',title,text},options,()=>{
        const root=bindingForRuntime(runtimeRoot).vaultRoot;
        const name=title.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,60)||'未命名报告';
        const relativePath='10_调研报告/'+name+'_'+digest(options.mutationId).slice(0,8)+'.md';
        if(fs.existsSync(safe(root,relativePath,true)))fail('CONFLICT','报告目标已存在，未覆盖');
        return {action:'create',path:relativePath,beforeHash:null,after:Buffer.from(text).toString('base64'),result:{document:{id:'doc-'+digest(relativePath).slice(0,32),section:'materials',title,relativePath,hash:digest(text),format:'markdown',writable:true,contentId:null,tNumber:null,bytes:Buffer.byteLength(text)},text}};
    }).result;
}

export function applyVaultResourceTransaction(runtimeRoot,tx){
    const context=resourceTransactionPlans(runtimeRoot,tx,{replay:true});
    if(!context)return;
    const {root,state,plans}=context,mid=tx.intent.mutationId;
    // All source CAS checks above complete before the first resource mutation.
    for(const plan of plans){
        const {change,resourceMid,entry}=plan;
        let result=plan.replayed;
        if(!result){
            const record=structuredClone(change.record),oldBlock=management(plan.text),block={...(oldBlock??{}),kind:change.kind,id:change.id,record,transaction:{mutationId:mid,recordHash:digest(JSON.stringify(change))}};
            if(change.kind==='prompt'&&record.provenance?.vault){record.provenance={...record.provenance};delete record.provenance.vault;}
            if(change.kind==='report'){
                if(record.meta?.vault){record.meta={...record.meta};delete record.meta.vault;}
                // Original report pages remain current until the user explicitly replaces them.
                if(!change.previous||JSON.stringify(change.record.pages)!==JSON.stringify(change.previous.pages))block.pageOverrides=change.record.pages.map(p=>readReportPage(runtimeRoot,p));
                else if(oldBlock?.pageOverrides)block.pageOverrides=oldBlock.pageOverrides;
                delete record.pages;
            }
            let text=plan.text;
            if(change.kind==='prompt')text=frontmatter(withoutBlock(text)).prefix+change.body;
            const explicitMarkdown=change.kind==='report'&&typeof record.meta?.manualMarkdown==='string'&&(!change.previous||record.meta.manualMarkdown!==change.previous.meta?.manualMarkdown);
            if(explicitMarkdown){block.pageOverrides=[];block.bodyLayout='after-block';text=frontmatter(withoutBlock(text)).prefix+record.meta.manualMarkdown;}
            const readOnly=entry&&entry.format==='html'&&!entry.companion;
            if(readOnly){block.origin={documentId:entry.documentId,relativePath:entry.relativePath,hash:entry.hash};text=`# ${record.title}\n\n原件：${entry.relativePath}\n当前正文：${block.pageOverrides?'下方管理块中的页面':'关联原件（原位只读）'}\n`;}
            if(!entry)text=change.kind==='report'&&explicitMarkdown?`---\ntype: research-report\ntitle: ${JSON.stringify(record.title)}\n---\n${record.meta.manualMarkdown}`:change.kind==='prompt'?change.body:`# ${record.name??record.title}\n\n工作台标准${change.kind==='account'?'账号档案':'报告档案'}。字段保存在下方管理块，可保留额外说明。\n`;
            if(change.kind==='prompt'){
                const prefix=frontmatter(withoutBlock(plan.text)).prefix;
                block.promptBodyLayout='after-block';
                text=prefix+encodeResourceBlock('',block).trim()+'\n'+change.body;
            } else if(explicitMarkdown){
                let prefix=frontmatter(withoutBlock(text)).prefix;
                if(!prefix)prefix=`---\ntype: research-report\ntitle: ${JSON.stringify(record.title)}\n---\n`;
                text=prefix+encodeResourceBlock('',block).trim()+'\n'+record.meta.manualMarkdown;
            } else text=encodeResourceBlock(text,block);
            if(!entry||readOnly){
                result=change.kind==='report'?createReportDocument(runtimeRoot,record.title,text,{mutationId:resourceMid}):createVaultDocument(runtimeRoot,{section:change.kind==='account'?'accounts':'prompts',title:record.name??record.title,text},{mutationId:resourceMid});
            } else result=saveVaultDocument(runtimeRoot,{id:plan.target.documentId,expectedHash:plan.target.hash,text},{mutationId:resourceMid});
        }
        const d=result.document;
        const resultBlock=management(result.text),authority=change.kind==='report'?{currentBody:resultBlock.pageOverrides?.length?'managed-pages':resultBlock.origin&&resultBlock.bodyLayout==='after-block'?'managed-markdown':'original'}:{};
        if(entry?.format==='html')state.resources[change.kind][change.id]={...entry,...authority,companion:{documentId:d.id,relativePath:d.relativePath,hash:d.hash}};
        else state.resources[change.kind][change.id]={...(entry??{}),documentId:d.id,relativePath:d.relativePath,hash:d.hash,format:d.format,...authority};
        if(change.kind==='report'){
            const reportEntry=state.resources.report[change.id];
            if(!resultBlock.pageOverrides?.length&&(entry?.format==='html'?authority.currentBody==='managed-markdown':d.format==='markdown'))reportEntry.markdownPolicyVersion=MARKDOWN_REPORT_POLICY_VERSION;
            else delete reportEntry.markdownPolicyVersion;
            if(authority.currentBody!=='original')delete reportEntry.previewMode;
        }
        delete state.fingerprint;writeJSON(root,STATE,state);
    }
}


/** Read annotations do not create a runtime revision or invalidate a just-returned editToken. */
export function annotateVaultResources(runtimeRoot,value) {
    const binding=bindingForRuntime(runtimeRoot);if(!binding)return value;
    const state=loadState(binding.vaultRoot);
    const sourceView=entry=>({...entry,status:entry.missing?'source-missing':'available',writable:!entry.missing&&entry.sourceWritable!==false});
    const prompt=p=>state.resources.prompt[p?.id]?{...p,provenance:{...(p.provenance??{}),vault:sourceView(state.resources.prompt[p.id])}}:p;
    if(Array.isArray(value))return value.map(prompt);
    if(!plain(value))return value;
    if(Array.isArray(value.reports))return {...value,accounts:value.accounts?.map(a=>state.resources.account[a.id]?{...a,vaultSource:sourceView(state.resources.account[a.id])}:a),reports:value.reports.map(r=>{
        const source=state.resources.report[r.id];return source?{...r,meta:{...(r.meta??{}),vault:{...sourceView(source),...(source.previewMode?{preview:{complete:true,scriptExecution:'sandbox',generatedPageCount:r.pages.length,originalPath:source.relativePath,scope:'原HTML、内联图表与评论层级在无主机权限的离线沙箱中阅读；外部网络请求已禁止'}}:{})}}}:r;
    })};
    if(value.snapshot)return {...value,snapshot:annotateVaultResources(runtimeRoot,value.snapshot)};
    return prompt(value);
}

/** Freeze only resources below the already bound root; external requests stay blocked by reader CSP. */
export function prepareOfflineReport(html,{root,relativePath}={}) {
    if(typeof html!=='string'||Buffer.byteLength(html)>8*1024*1024)fail('INVALID_INPUT','报告超过8MiB读取上限');
    let total=Buffer.byteLength(html);const issues=[];
    const read=(url,extensions)=>{
        if(!root||typeof relativePath!=='string')throw Error('原报告未提供已绑定资源根');
        if(typeof url!=='string'||/^(?:[a-z][a-z\d+.-]*:|\/\/|\/)/i.test(url)||/[?#]/.test(url))throw Error('外部或绝对资源未授权');
        const rel=path.posix.normalize(path.posix.join(path.posix.dirname(relativePath),decodeURIComponent(url)));
        if(!extensions.includes(path.posix.extname(rel).toLowerCase()))throw Error('资源类型未授权');
        const bytes=readBytes(root,rel);total+=bytes.length;if(total>8*1024*1024)throw Error('离线资源总量超过8MiB');return bytes.toString('utf8');
    };
    html=html.replace(/<script\b([^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*)>[\s\S]*?<\/script\s*>/gi,(whole,attrs,double,single)=>{try{const code=read(double??single,['.js']).replace(/<\/script/gi,'<\\/script'),body=/\bdefer\b/i.test(attrs)?`document.addEventListener('DOMContentLoaded',()=>{${code}\n});`:code;return `<script${attrs.replace(/\bsrc\s*=\s*(?:"[^"]*"|'[^']*')/i,'')}>${body}</script>`;}catch(error){issues.push(`${double??single}：${error.message}`);return whole;}});
    html=html.replace(/<link\b[^>]*>/gi,whole=>{
        if(!/\brel\s*=\s*["']stylesheet["']/i.test(whole))return whole;
        const url=whole.match(/\bhref\s*=\s*(?:"([^"]+)"|'([^']+)')/i);if(!url)return whole;
        try{return `<style>${read(url[1]??url[2],['.css']).replace(/<\/style/gi,'<\\/style')}</style>`;}catch(error){issues.push(`${url[1]??url[2]}：${error.message}`);return whole;}
    });
    if(issues.length){const notice=`<aside role="status" style="padding:12px;background:#FFF4E2;color:#7A4B00">本页保留原HTML；以下外部依赖未载入：${issues.map(htmlEscape).join('；')}</aside>`;html=/<body\b[^>]*>/i.test(html)?html.replace(/<body\b[^>]*>/i,m=>m+notice):notice+html;}
    htmlBytes(Buffer.from(html));return html;
}
