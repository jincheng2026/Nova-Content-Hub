import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {createVault,readVaultSnapshot,createVaultDocument,trashVaultDocument,saveVaultDocument} from '/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/src/lib/vault/index.mjs';
import {linkSource} from '/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/src/lib/vault/source-map.mjs';
import {openLibrary} from '/Users/mac/code/dashboard/Nova-Content-Hub/plugin-src/src/lib/file-library/index.mjs';
import {reconcileVaultEditor} from '/Users/mac/code/dashboard/Nova-Content-Hub/workbench/src/shared/vault-editor-recovery.ts';
import {reportNavigation} from '/Users/mac/code/dashboard/Nova-Content-Hub/workbench/src/main/report-navigation.mts';
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'nova-crud-review-'));
try {
 const root=path.join(parent,'vault'); fs.mkdirSync(root);
 const binding=createVault(root),runtime=binding.root;
 const made=createVaultDocument(runtime,{section:'materials',title:'测试资料',text:'原文'},{mutationId:randomUUID()});
 trashVaultDocument(runtime,{id:made.document.id,expectedHash:made.document.hash},{mutationId:randomUUID()});
 console.log({case:'F1',remainingDocuments:readVaultSnapshot(runtime).documents.filter(d=>d.id===made.document.id).length,contentTrash:openLibrary(runtime).listTrash().length,receiptDirs:fs.readdirSync(path.join(root,'.workbench/trash')).length});
 const other=createVaultDocument(runtime,{section:'materials',title:'冲突资料',text:'基准'},{mutationId:randomUUID()});
 fs.writeFileSync(path.join(root,other.document.relativePath),'外部更新');
 const submission={method:'saveVaultDocument',input:{id:other.document.id,expectedHash:other.document.hash,text:'本人编辑'}};
 let first; try {saveVaultDocument(runtime,submission.input,{mutationId:randomUUID()});} catch(e) {first=e.code;}
 const recovered=reconcileVaultEditor({current:other,text:'本人编辑',title:'',category:'materials',submission},{...submission,mutationId:randomUUID(),outcome:'discarded',result:null,current:null});
 let second; try {saveVaultDocument(runtime,{id:recovered.current.document.id,expectedHash:recovered.current.document.hash,text:recovered.text},{mutationId:randomUUID()});} catch(e) {second=e.code;}
 console.log({case:'F2',first,discardConflictFlag:recovered.conflict,hashRefreshed:recovered.current.document.hash!==other.document.hash,second,keptInput:recovered.text});
 const external=path.join(parent,'external'); fs.mkdirSync(path.join(external,'sample'),{recursive:true});
 fs.writeFileSync(path.join(external,'sample','meta.json'),JSON.stringify({title:'关联报告',pages:[{file:'index.html',title:'首页'}]}));
 fs.writeFileSync(path.join(external,'sample','index.html'),'<html><body><a href="data.csv">完整数据</a></body></html>');
 fs.writeFileSync(path.join(external,'sample','data.csv'),'name,value\nhello,1');
 linkSource(root,{role:'reports',selectedRoot:external,authority:'candidate',writable:false});
 const api=openLibrary(runtime),reports=api.readProduction().reports,report=reports.find(r=>r.title==='关联报告');
 const html=api.readAsset(report.pages[0].assetHash).data.toString('utf8');
 console.log({case:'F3',reportFound:!!report,...reportNavigation(binding,reports,report.id,report.pages[0].id,html)});
} finally {fs.rmSync(parent,{recursive:true,force:true});}