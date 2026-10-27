/** Local acceptance only. Never writes the selected manifest's originals/copies. */
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {createVault,openVault} from '../../vault/index.mjs';
import {parseCreationHtml,replaceCreationData,itemFingerprint,saveKitChanges,readCreationDocument,readHistory,regenerateCreationPage,exportCreationData} from '../index.mjs';
import {sha256} from '../fingerprint.mjs';
const manifestFile=process.argv[2];if(!manifestFile)throw Error('manifest path required');
const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-creation-runtime-'));
createVault(root);
for(const sample of manifest.samples){const destination=path.join(root,sample.relativePath);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(sample.copy,destination);}
const vaultId=JSON.parse(fs.readFileSync(path.join(root,'.workbench/vault.json'))).vaultId;
const results=[];
for(const sample of manifest.samples){
 const beforeOriginal=sha256(fs.readFileSync(sample.original)),copyHash=sha256(fs.readFileSync(sample.copy));assert.equal(beforeOriginal,sample.sha256);
 const source={sourceId:'drafts',documentId:sample.workId,relativePath:sample.relativePath,vaultId};const bytes=fs.readFileSync(path.join(root,sample.relativePath)),doc=parseCreationHtml(bytes,source);assert.equal(doc.writable,true);assert.deepEqual(Buffer.from(replaceCreationData(bytes,doc)),bytes);
 const item=doc.items.find(it=>it.kind==='segment'),before=item.fields.note,after=before+'\n[isolated Node runtime acceptance]';const input={mutationId:'golden-edit-'+sample.workId,page_id:doc.pageId,token:doc.raw.token,changes:[{change_id:'golden-change-'+sample.workId,item_id:item.id,field:'note',before,after,item_fp:itemFingerprint(item)}]};
 const result=await saveKitChanges(root,source,input);assert.equal(result.results[0].reason,'written');assert.deepEqual(await saveKitChanges(root,source,input),result);openVault(root);
 const reloaded=await readCreationDocument(root,source),expected=structuredClone(doc.raw);expected.items.find(it=>it.id===item.id).fields.note=after;assert.deepEqual(reloaded.raw,expected);
 const hist=await readHistory(root,source,item.id);assert.equal(hist.changes.filter(rec=>rec.change_id==='golden-change-'+sample.workId).length,1);
 await regenerateCreationPage(root,{work:{vaultId,workId:doc.raw.content_id},source,data:exportCreationData(reloaded),templateVersion:'jincheng-source-v1',mutationId:'golden-rebuild-'+sample.workId,expectedRevision:reloaded.revision});const rebuilt=await readCreationDocument(root,source);
 for(const oldItem of reloaded.items){const nextItem=rebuilt.items.find(it=>it.id===oldItem.id);assert.ok(nextItem);assert.deepEqual(nextItem.fields,oldItem.fields);if(oldItem.locked.ai_state!==undefined)assert.deepEqual(nextItem.locked.ai_state,oldItem.locked.ai_state);}
 assert.equal(rebuilt.raw.token,reloaded.raw.token);assert.equal(rebuilt.pageId,reloaded.pageId);assert.equal(sha256(fs.readFileSync(sample.original)),beforeOriginal);assert.equal(sha256(fs.readFileSync(sample.copy)),copyHash);
 results.push({workId:sample.workId,pageId:doc.pageId,items:doc.items.length,kinds:sample.kinds,noOpBytes:true,saveReopen:true,idempotentRetry:true,regenerateAuthorFields:true,originalSha256:beforeOriginal,originalUnchanged:true,frozenCopyUnchanged:true,receiptHash:result.receiptHash});
}
const report={format:'nova-creation-runtime-local-acceptance',root,manifest:manifestFile,at:new Date().toISOString(),results,limitations:['Node runtime acceptance; no Electron UI or installed application claim','Standalone file is readonly; external browser editing is unsupported','Original source authority conflicts (including T020) require the UI selection flow']};const reportPath=path.join(root,'creation-runtime-report.json');fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,reportPath},null,2));
