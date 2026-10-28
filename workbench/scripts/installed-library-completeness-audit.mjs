// Read-only functional inventory against the actual installed 0.5.0 implementation.
// Only a disposable ZIP extraction is bound; installed application and source library are untouched.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const installed='/Applications/自媒体工作台.app/Contents/Resources/app';
const root=await fs.realpath(process.argv[2]);
const evidence=path.resolve(process.argv[3]);
if(!root.startsWith('/private/tmp/nova-installed-library-reaudit-')&&!root.startsWith('/tmp/nova-installed-library-reaudit-'))throw Error('Use an isolated audit extraction');
await fs.mkdir(evidence,{recursive:true});
const {execute}=await import(pathToFileURL(path.join(installed,'workbench/dist/main/worker.mjs')));
const {readCreationDocument,kindOf}=await import(pathToFileURL(path.join(installed,'plugin-src/src/lib/creation-document/index.mjs')));
const sha=x=>createHash('sha256').update(x).digest('hex');
const error=e=>({code:e.code??e.name,message:e.message});
const results={startedAt:new Date().toISOString(),installed,node:{execPath:process.execPath,version:process.version,arch:process.arch,platform:process.platform},root,scope:'Fresh execution of installed worker/helper read contracts on isolated original ZIP copy. No CUA, no network/model calls, no product edits, no source-library writes.',calls:[],contents:[],creationDocuments:[],accounts:[],reports:[],issues:[]};
async function call(op,args){const start=Date.now();try{const value=await execute(op,args,'disabled');results.calls.push({op,contentId:args.contentId,id:args.id,reportId:args.reportId,pageId:args.pageId,documentId:args.documentId,action:args.action,ok:true,ms:Date.now()-start});return {ok:true,value};}catch(e){const fail={ok:false,error:error(e)};results.calls.push({op,...args,binding:undefined,...fail,ms:Date.now()-start});return fail;}}
function must(result){if(!result.ok)throw Error(JSON.stringify(result));return result.value;}
function summarizeDoc(doc){return {document:doc.document,textBytes:Buffer.byteLength(doc.text??''),textHash:sha(doc.text??''),summaryOnly:doc.summaryOnly??false,workingDraftAvailable:doc.workingDraftAvailable??null};}
async function checkpoint(){await fs.writeFile(path.join(evidence,'all-library-items.json'),JSON.stringify(results,null,2));}
const beforeFiles=(await fs.readdir(root,{recursive:true,withFileTypes:true})).filter(e=>e.isFile()).map(e=>path.join(e.parentPath,e.name)).filter(p=>!path.relative(root,p).startsWith('.workbench/')).sort();
const originals=new Map();for(const f of beforeFiles)originals.set(path.relative(root,f),sha(await fs.readFile(f)));
results.originalInputFiles=originals.size;
results.binding=must(await call('bind',{destination:root}));const binding=results.binding;
const vault=must(await call('vaultRead',{binding})),production=must(await call('productionRead',{binding})),contents=must(await call('list',{binding,view:'active'}));
results.counts={contents:contents.length,accounts:production.accounts.length,reports:production.reports.length,pages:production.reports.reduce((n,r)=>n+r.pages.length,0),vaultDocuments:vault.documents.length};
results.vaultIssues=vault.issues;results.missingAssetHashes=production.missingAssetHashes;
results.sourceInventory=must(await call('vaultSources',{binding}));
results.workDirectory=must(await call('vaultWorkDirectory',{binding}));
console.log('Inventory',JSON.stringify(results.counts));await checkpoint();
if(process.argv[4]==='summary'){
 results.representativeContents=[];
 const chosen=[...contents.slice(0,1),...contents.filter(c=>vault.documents.some(d=>d.contentId===c.id&&d.format==='html')).slice(0,2)];
 for(const content of [...new Map(chosen.map(c=>[c.id,c])).values()]){
  const read=await call('readContent',{binding,id:content.id}),source=await call('vaultContentSource',{binding,contentId:content.id}),ctx=await call('vaultWorkContext',{binding,contentId:content.id});
  results.representativeContents.push({id:content.id,title:content.title,read:read.ok?{ok:true,bodyBytes:Buffer.byteLength(read.value.body),bodyHash:sha(read.value.body)}:read,source:source.ok?{ok:true,...source.value?summarizeDoc(source.value):{value:null}}:source,context:ctx.ok?{ok:true,content:ctx.value?.content,sourceIssues:ctx.value?.sourceIssues}:ctx});
 }
 results.originalIntegrity={checked:0,changed:[],missing:[]};for(const[relative,hash]of originals){try{const after=sha(await fs.readFile(path.join(root,relative)));if(after!==hash)results.originalIntegrity.changed.push({relativePath:relative,before:hash,after});}catch(e){results.originalIntegrity.missing.push({relativePath:relative,error:error(e)});}results.originalIntegrity.checked++;}
 results.completedAt=new Date().toISOString();await checkpoint();console.log('SUMMARY COMPLETE',JSON.stringify(results.counts));process.exit(0);
}
for(const content of contents){
 const read=await call('readContent',{binding,id:content.id}),ctx=await call('vaultWorkContext',{binding,contentId:content.id}),source=await call('vaultContentSource',{binding,contentId:content.id}),creation=await call('productionCreation',{binding,contentId:content.id});
 const row={id:content.id,title:content.title,read:read.ok?{ok:true,bodyBytes:Buffer.byteLength(read.value.body),bodyHash:sha(read.value.body),editTokenPresent:!!read.value.editToken}:read,source:source.ok?{ok:true,...source.value?summarizeDoc(source.value):{value:null}}:source,context:ctx.ok?{ok:true,...ctx.value}:ctx,creation:creation.ok?{ok:true,bodyHash:creation.value.content.bodyHash,productionTokenPresent:!!creation.value.productionToken,creation:creation.value.creation,history:creation.value.history}:creation};
 results.contents.push(row);
 for(const [op,value]of Object.entries({read,context:ctx,source,creation}))if(!value.ok)results.issues.push({kind:'content-read-error',id:content.id,title:content.title,op,...value.error});
 console.log('Content',results.contents.length,content.title);await checkpoint();
}
// Parse every original draft HTML, including history and alternatives, independently of the current draft selection.
for(const entry of vault.documents.filter(d=>d.section==='drafts'&&d.format==='html')){
 const bytes=await fs.readFile(path.join(root,entry.relativePath));
 const row={id:entry.id,contentId:entry.contentId,tNumber:entry.tNumber,relativePath:entry.relativePath,bytes:bytes.length,sha256:sha(bytes),jcDocMarker:/\bid\s*=\s*["']jc-doc["']/.test(bytes.toString('utf8'))};
 const read=await call('vaultDocument',{binding,id:entry.id});row.vaultRead=read.ok?{ok:true,...summarizeDoc(read.value)}:read;
 try{
  const parsed=await readCreationDocument(root,{sourceId:'drafts',documentId:entry.id,relativePath:entry.relativePath,vaultId:vault.vaultId});
  row.parse={ok:true,pageId:parsed.pageId,writable:parsed.writable,issues:parsed.issues,itemCount:parsed.items.length,kinds:{},fields:{},nonemptyNotes:[],lockedReferenceCount:0,rawHash:sha(JSON.stringify(parsed.raw))};
  for(const item of parsed.items){const kind=kindOf(item);row.parse.kinds[kind]=(row.parse.kinds[kind]??0)+1;for(const[k,v]of Object.entries(item.fields??{})){row.parse.fields[k]=(row.parse.fields[k]??0)+1;if(/note|comment|reply/i.test(k)&&v.trim())row.parse.nonemptyNotes.push({id:item.id,field:k,chars:v.length,sha256:sha(v)});}for(const ref of item.locked?.refs??[]){row.parse.lockedReferenceCount++;}}
  row.actions={};
  for(const action of ['read','meta','history','stash-read']){
   const res=await call('creationPage',{binding,documentId:entry.id,action});
   row.actions[action]=res.ok?{ok:true,...action==='read'?{htmlBytes:Buffer.byteLength(res.value.html),htmlHash:sha(res.value.html),pageId:res.value.pageId,fingerprint:res.value.fingerprint,stashRecords:res.value.stash.records.length}:action==='meta'?{fingerprint:res.value.fingerprint,rawHash:sha(JSON.stringify(res.value.doc))}:action==='history'?{changes:res.value.changes}:res.value}:res;
  }
  row.referenceChecks=[];
  const seen=new Set();for(const item of parsed.items)for(const ref of item.locked?.refs??[]){for(const key of ['video','url']){const href=ref[key];if(typeof href!=='string'||!href||seen.has(href))continue;seen.add(href);const res=await call('creationPage',{binding,documentId:entry.id,action:'reference',payload:{href}});row.referenceChecks.push({itemId:item.id,kind:key,href,...res});}}
 }catch(e){row.parse={ok:false,error:error(e)};if(row.jcDocMarker)results.issues.push({kind:'creation-parse-error',...row.parse.error,id:entry.id,relativePath:entry.relativePath});}
 results.creationDocuments.push(row);console.log('Creation',results.creationDocuments.length,entry.relativePath,row.parse.ok?'parsed':row.parse.error.code);await checkpoint();
}
for(const account of production.accounts){
 const src=account.vaultSource,row={id:account.id,name:account.name,platform:account.platform,url:account.url,source:src,noteBytes:Buffer.byteLength(account.note??''),noteHash:sha(account.note??''),images:account.images,reportIds:account.reportIds};
 if(src?.documentId){const read=await call('vaultDocument',{binding,id:src.documentId});row.originalRead=read.ok?{ok:true,...summarizeDoc(read.value)}:read;if(!read.ok)results.issues.push({kind:'account-read-error',id:account.id,name:account.name,source:src,...read.error});}else row.originalRead={ok:false,error:{code:'NO_SOURCE'}};
 results.accounts.push(row);console.log('Account',results.accounts.length,account.name);await checkpoint();
}
for(const report of production.reports){
 const row={id:report.id,title:report.title,source:report.meta?.vault,pages:[]};
 for(const page of report.pages){const read=await call('productionReport',{binding,reportId:report.id,pageId:page.id}),p={...page};if(read.ok){p.read={ok:true,htmlBytes:Buffer.byteLength(read.value.html),htmlHash:sha(read.value.html),navigation:read.value.navigation};p.attachments=[];for(const[index,link]of read.value.navigation.links.entries())if(link.target?.kind==='attachment'){const a=await call('productionReportAttachment',{binding,reportId:report.id,pageId:page.id,fingerprint:read.value.navigation.fingerprint,index});p.attachments.push({index,href:link.href,...a.ok?{ok:true,filename:a.value.filename,bytes:a.value.data.length,sha256:sha(a.value.data)}:a});}for(const link of read.value.navigation.links)if(!link.target)results.issues.push({kind:'unavailable-report-link',reportId:report.id,pageId:page.id,title:report.title,sourcePath:report.meta?.vault?.originalPages?.find(x=>x.id===page.id)?.relativePath??report.meta?.vault?.relativePath,href:link.href,message:link.message});}else{p.read=read;results.issues.push({kind:'report-read-error',reportId:report.id,pageId:page.id,...read.error});}row.pages.push(p);}
 results.reports.push(row);console.log('Report',results.reports.length,report.title);await checkpoint();
}
results.originalIntegrity={checked:0,changed:[],missing:[]};for(const[relative,hash]of originals){try{const current=sha(await fs.readFile(path.join(root,relative)));if(current!==hash)results.originalIntegrity.changed.push({relativePath:relative,before:hash,after:current});}catch(e){results.originalIntegrity.missing.push({relativePath:relative,error:error(e)});}results.originalIntegrity.checked++;}
results.completedAt=new Date().toISOString();
results.summary={contentReadErrors:results.issues.filter(x=>x.kind==='content-read-error').length,creationHTMLs:results.creationDocuments.length,parsedCreationDocuments:results.creationDocuments.filter(x=>x.parse.ok).length,jcParseErrors:results.issues.filter(x=>x.kind==='creation-parse-error').length,accountReadErrors:results.issues.filter(x=>x.kind==='account-read-error').length,reportReadErrors:results.issues.filter(x=>x.kind==='report-read-error').length,unavailableReportLinks:results.issues.filter(x=>x.kind==='unavailable-report-link').length,missingCreationLocalReferences:results.creationDocuments.flatMap(x=>x.referenceChecks??[]).filter(x=>x.kind==='video'&&!x.ok).length};
await checkpoint();console.log('COMPLETE',JSON.stringify(results.summary));
