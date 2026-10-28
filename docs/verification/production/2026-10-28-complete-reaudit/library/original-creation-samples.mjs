import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execute} from '/Applications/自媒体工作台.app/Contents/Resources/app/workbench/dist/main/worker.mjs';
import {readCreationDocument,kindOf} from '/Applications/自媒体工作台.app/Contents/Resources/app/plugin-src/src/lib/creation-document/index.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex'),out=[];
for(const id of ['original-A','original-B']){
 const x=JSON.parse(await fs.readFile(new URL(`./${id}/all-library-items.json`,import.meta.url),'utf8'));
 const row={id,binding:x.binding,documents:[]};
 for(const entry of x.representativeContents.flatMap(c=>c.context?.content?.creationDocuments??[])){
  const parsed=await readCreationDocument(x.root,{sourceId:'drafts',documentId:entry.documentId,relativePath:entry.relativePath});
  const doc={...entry,pageId:parsed.pageId,parseIssues:parsed.issues,writable:parsed.writable,items:parsed.items.length,kinds:{},nonemptyNotes:[],rawHash:sha(JSON.stringify(parsed.raw)),actions:{}};
  for(const item of parsed.items){const kind=kindOf(item);doc.kinds[kind]=(doc.kinds[kind]??0)+1;for(const[k,v]of Object.entries(item.fields??{}))if(/note|comment|reply/i.test(k)&&v.trim())doc.nonemptyNotes.push({id:item.id,field:k,chars:v.length,sha256:sha(v)});}
  for(const action of ['read','meta','history','stash-read']){const t=Date.now();try{const r=await execute('creationPage',{binding:x.binding,documentId:entry.documentId,action},'disabled');doc.actions[action]={ok:true,ms:Date.now()-t,...action==='read'?{htmlBytes:Buffer.byteLength(r.html),htmlHash:sha(r.html),pageId:r.pageId,stash:r.stash}:action==='meta'?{fingerprint:r.fingerprint,rawHash:sha(JSON.stringify(r.doc))}:r};}catch(e){doc.actions[action]={ok:false,code:e.code,message:e.message};}}
  row.documents.push(doc);
 }
 out.push(row);
}
await fs.writeFile(new URL('./original-creation-samples.json',import.meta.url),JSON.stringify({at:new Date().toISOString(),results:out},null,2));console.log(out.map(r=>({id:r.id,documents:r.documents.map(d=>({relativePath:d.relativePath,items:d.items,writable:d.writable,issues:d.parseIssues,actions:d.actions}))})));
