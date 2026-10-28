import fs from 'node:fs';
import path from 'node:path';
import * as fileLibrary from '../file-library/index.mjs';
import {bindingForRuntime,contentSources,digest,fail,identity,json,readBytes,recoverVault,runMutation,safe,scan,uuidFor,withVaultReadLock} from '../vault/core.mjs';
import {readVaultPackaging} from '../vault/packaging.mjs';
import {orderedSegments,parseCreationHtml} from '../creation-document/parse.mjs';
import {assertUniqueCreationPage} from '../creation-document/store.mjs';
import {applyFinalAssetsReceipt,FINAL_ASSET_LIMITS,jsonBytes,namesFor,optionalFinalBytes,readFinalBytes,same,validBundle,validDirectory,validHash,validateCurrent,validateManifest,verifyBundle} from './transaction.mjs';
export {applyFinalAssetsReceipt};
const WARNINGS=['COVER_SOURCE_DIFFERENT','COVER_SOURCE_UNKNOWN'];
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>record(value)&&Object.keys(value).every(key=>keys.includes(key));
const validContent=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
function selection(input){
 if(!exact(input,['contentId','packagingDocumentId','manuscript'])||!validContent(input.contentId)||input.packagingDocumentId!==undefined&&!/^doc-[a-f0-9]{32}$/.test(input.packagingDocumentId)||!record(input.manuscript)||!['current','recorded'].includes(input.manuscript.kind)||!exact(input.manuscript,input.manuscript.kind==='current'?['kind']:['kind','documentId'])||input.manuscript.kind==='recorded'&&!/^doc-[a-f0-9]{32}$/.test(input.manuscript.documentId))fail('INVALID_INPUT','最终资产来源选择无效');
 return {contentId:input.contentId,...(input.packagingDocumentId===undefined?{}:{packagingDocumentId:input.packagingDocumentId}),manuscript:input.manuscript.kind==='current'?{kind:'current'}:{kind:'recorded',documentId:input.manuscript.documentId}};
}
function binding(runtimeRoot){const value=bindingForRuntime(runtimeRoot);if(!value)fail('NOT_READY','最终资产需要已绑定的第二大脑知识库');return value;}
function locked(runtimeRoot,fn){const bound=binding(runtimeRoot);return withVaultReadLock(bound.vaultRoot,()=>{const issues=recoverVault(bound.vaultRoot);return fn(bound,issues);});}
const snapshot=bound=>({root:bound.vaultRoot,vaultId:bound.vaultId,...scan(bound.vaultRoot,bound.vaultId)});
function directories(bound,contentId){
 const state=snapshot(bound),work=contentSources(state).find(work=>work.contentId===contentId),found=new Set();
 if(work&&validDirectory(work.contentDirectory))found.add(work.contentDirectory);
 for(const document of state.documents){if(document.contentId!==contentId)continue;const match=/^(05_内容草稿\/(?:已做\/)?T\d{3,}_[^/]+)\/最终资产(?:\/|$)/.exec(document.relativePath);if(match)found.add(match[1]);}
 if(found.size>1)fail('CONFLICT','同一内容有多个最终资产目录，请先核对原件');return {state,work,directory:[...found][0]??null};
}
function currentPointer(root,directory,work=null){
 const bytes=directory?optionalFinalBytes(root,directory+'/最终资产/当前.json'):null;if(!bytes)return null;
 let pointer;try{pointer=validateCurrent(JSON.parse(bytes.toString('utf8')));}catch(error){if(error.code)throw error;fail('CORRUPT','当前最终资产不能解析');}
 if(work&&!same(pointer.work,work))fail('CORRUPT','当前最终资产属于其他内容');return {...pointer,hash:digest(bytes)};
}
function sourceScript(bound,packaging,choice,state){
 const source=packaging.script.manuscriptSource;
 const parse=document=>{const bytes=readBytes(bound.vaultRoot,document.relativePath);if(digest(bytes)!==document.hash)fail('CONFLICT','稿件在快照期间变化');const ref={sourceId:'drafts',documentId:document.id,relativePath:document.relativePath,vaultId:bound.vaultId},doc=parseCreationHtml(bytes,ref);if(!doc.writable||doc.raw.schema!==1||doc.raw.content_id!==undefined&&doc.raw.content_id!==packaging.source.workId)fail('INVALID_INPUT','原创作页无法安全读取');assertUniqueCreationPage(bound.vaultRoot,ref,doc.pageId);return doc;};
 if(choice.kind==='recorded'){
  const document=state.documents.find(document=>document.id===choice.documentId&&document.contentId===packaging.contentId&&document.section==='drafts'&&document.format==='html');if(!document)fail('INVALID_INPUT','录完稿来源必须是同一内容的原页');const doc=parse(document),infos=doc.items.filter(item=>item.kind==='info');if(infos.length!==1||typeof infos[0].fields?.recorded!=='string'||!infos[0].fields.recorded.trim())fail('INVALID_INPUT','没有唯一已存在的录完稿，请选择当前确认稿');
  const text=infos[0].fields.recorded;return {text,source:{kind:'recorded',vaultId:bound.vaultId,workId:packaging.source.workId,documentId:document.id,pageId:doc.pageId,relativePath:document.relativePath,revision:doc.revision,infoItemId:infos[0].id,hash:digest(text)}};
 }
 if(source.format!=='html')return {text:packaging.script.text,source:{...source,kind:'current-document',hash:packaging.script.hash}};
 const document=state.documents.find(document=>document.id===source.documentId&&document.hash===source.revision);if(!document)fail('CONFLICT','当前原创作页在快照期间变化');const doc=parse(document);if(doc.issues.some(issue=>/^(?:MISSING_ORDER|DUPLICATE_ORDER):/.test(issue)))fail('INVALID_INPUT','原稿段落顺序不明确');const segments=orderedSegments(doc),text=segments.map(item=>item.fields.mine).join('\n\n');if(digest(text)!==packaging.script.hash)fail('CONFLICT','当前稿与包装读取不一致');return {text,source:{...source,kind:'jc-doc-segments',pageId:doc.pageId,hash:digest(text),segments:segments.map(item=>({itemId:item.id,hash:digest(item.fields.mine)}))}};
}
function finiteClone(value){const bytes=JSON.stringify(value);if(!bytes||Buffer.byteLength(bytes)>64*1024)fail('INVALID_INPUT','封面来源记录无效或过大');return JSON.parse(bytes);}
function coverSnapshot(runtimeRoot,input,packaging,manuscriptHash,h){
 const reader=h&&Object.hasOwn(h,'readSelectedCoverSnapshot')?h.readSelectedCoverSnapshot:fileLibrary.readSelectedCoverSnapshot;if(typeof reader!=='function')fail('NOT_READY','当前后端尚未提供可信已选封面读取');const raw=reader(runtimeRoot,{contentId:input.contentId});
 if(!record(raw)||raw.then||raw.contentId!==input.contentId||!validBundle(raw.candidateId)||!validHash(raw.assetHash)||!Buffer.isBuffer(raw.bytes)||raw.bytes.length<1||raw.bytes.length>FINAL_ASSET_LIMITS.cover||digest(raw.bytes)!==raw.assetHash||raw.decoded!==true||!Number.isSafeInteger(raw.width)||!Number.isSafeInteger(raw.height)||raw.width<1||raw.height<1||raw.width*raw.height>40_000_000||typeof raw.selectedAt!=='string'||!Number.isFinite(Date.parse(raw.selectedAt))||new Date(raw.selectedAt).toISOString()!==raw.selectedAt)fail('INVALID_INPUT','已选封面身份、字节或解码验收无效');
 const mime=raw.mime,bytes=Buffer.from(raw.bytes),signature=mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:mime==='image/webp'?bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP':mime==='image/gif'?['GIF87a','GIF89a'].includes(bytes.subarray(0,6).toString()):false;
 if(!signature)fail('INVALID_INPUT','封面格式与已验证字节不一致');
 let provenance,sourceMatch='unknown';const original=raw.provenance;
 if(original?.kind==='generated'){
  if(!validBundle(original.requestId)||!validBundle(original.attemptId)||!validHash(original.requestHash)||!validHash(original.receiptHash))fail('INVALID_INPUT','封面生成回执身份不完整');
  provenance={kind:'generated',requestId:original.requestId,requestHash:original.requestHash,attemptId:original.attemptId,receiptHash:original.receiptHash,template:finiteClone(original.template??null),packagingSource:original.packagingSource?finiteClone(original.packagingSource):null,bodyHash:validHash(original.bodyHash)?original.bodyHash:null};
  const source=provenance.packagingSource;if(source?.workId&&source.workId!==packaging.source.workId||source?.vaultId&&source.vaultId!==packaging.source.vaultId)fail('INVALID_INPUT','选用封面不属于当前知识内容');if(validHash(source?.selectionToken)&&provenance.bodyHash)sourceMatch=source.selectionToken===packaging.selectionToken&&provenance.bodyHash===manuscriptHash?'current':'different';
 }else if(original?.kind==='imported'){
  if(typeof original.importId!=='string'||!original.importId||original.importId.length>100||typeof original.originalName!=='string'||original.originalName.length>500||original.assetHash!==raw.assetHash)fail('INVALID_INPUT','封面导入来源无效');provenance={kind:'imported',importId:original.importId,originalName:original.originalName,assetHash:original.assetHash};
 }else if(original?.kind==='legacy'&&original.unknown===true)provenance={kind:'legacy',unknown:true};else fail('INVALID_INPUT','封面缺少明确来源类型');
 return {bytes,cover:{candidateId:raw.candidateId,assetHash:raw.assetHash,selectedAt:raw.selectedAt,mime,width:raw.width,height:raw.height,bytes:bytes.length,provenance,sourceMatch}};
}
function canonical(value){return JSON.stringify(value,(_key,item)=>record(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);}
function previewLocked(runtimeRoot,input,bound,h){
 const before=identity(bound.vaultRoot),packaging=readVaultPackaging(runtimeRoot,{contentId:input.contentId,...(input.packagingDocumentId?{documentId:input.packagingDocumentId}:{})});
 if(packaging.kind!=='jc-doc')fail(packaging.kind==='choose-source'?'INVALID_INPUT':'NOT_READY','请明确选择可用的原页包装来源：'+packaging.issues.join('、'));if(packaging.issues.length)fail('INVALID_INPUT','原页包装字段不完整或歧义：'+packaging.issues.join('、'));
 for(const role of ['title','coverText','description'])if(!packaging.fields[role]?.value.trim())fail('INVALID_INPUT','最终资产缺少已采用的'+role);
 const {state,work,directory}=directories(bound,input.contentId);if(!work||!directory||!validDirectory(directory)||work.tNumber!==packaging.source.workId)fail('NOT_READY','没有唯一同内容的原稿目录');
 const manuscript=sourceScript(bound,packaging,input.manuscript,state),selected=coverSnapshot(runtimeRoot,input,packaging,manuscript.source.hash,h),finalWork={vaultId:bound.vaultId,workId:work.tNumber},current=currentPointer(bound.vaultRoot,directory,finalWork);
 if(current)verifyBundle(bound.vaultRoot,directory,current.bundleId,input.contentId,current.manifestHash);
 const fields=Object.fromEntries(['title','coverText','description'].map(role=>[role,{itemId:packaging.fields[role].itemId,hash:packaging.fields[role].hash}])),source={...packaging.source,selectionToken:packaging.selectionToken,slots:fields};
 const warnings=selected.cover.sourceMatch==='different'?['COVER_SOURCE_DIFFERENT']:selected.cover.sourceMatch==='unknown'?['COVER_SOURCE_UNKNOWN']:[];
 const texts={script:manuscript.text,title:packaging.fields.title.value,description:packaging.fields.description.value,coverText:packaging.fields.coverText.value};for(const value of Object.values(texts))if(Buffer.byteLength(value)>FINAL_ASSET_LIMITS.text)fail('INVALID_INPUT','最终文本超过8 MiB');
 const after=readVaultPackaging(runtimeRoot,{contentId:input.contentId,...(input.packagingDocumentId?{documentId:input.packagingDocumentId}:{})});if(after.kind!=='jc-doc'||after.selectionToken!==packaging.selectionToken||!same(identity(bound.vaultRoot),before))fail('CONFLICT','最终资产读取期间来源已变化');if(input.manuscript.kind==='recorded'&&sourceScript(bound,after,input.manuscript,snapshot(bound)).source.hash!==manuscript.source.hash)fail('CONFLICT','录完稿读取期间变化');
 const preview={contentId:input.contentId,work:finalWork,texts,packaging:source,manuscript:manuscript.source,cover:selected.cover,warnings,currentHash:current?.hash??null};preview.previewToken=digest(canonical({format:'nova-final-assets-preview',schemaVersion:1,...preview}));return {preview,coverBytes:selected.bytes,directory};
}
export function previewFinalAssets(runtimeRoot,input,h){const checked=selection(input);return locked(runtimeRoot,bound=>previewLocked(runtimeRoot,checked,bound,h).preview);}
function readStored(bound,input,issues=[]){
 const {directory,work}=directories(bound,input.contentId);const workIdentity=work?{vaultId:bound.vaultId,workId:work.tNumber}:null;const view={contentId:input.contentId,work:workIdentity,current:null,bundles:[],selected:null,sourceState:'not-checked',issues:[...issues]};if(!directory)return view;
 try{view.current=currentPointer(bound.vaultRoot,directory,workIdentity);if(view.current)view.work=view.current.work;}catch(error){view.issues.push({code:error.code??'CORRUPT',message:error.message,relativePath:directory+'/最终资产/当前.json'});}
 let names=[];try{names=fs.readdirSync(safe(bound.vaultRoot,directory+'/最终资产/版本'));}catch(error){if(error.code!=='ENOENT')view.issues.push({code:error.code??'CORRUPT',message:error.message});}
 const selectedId=input.bundleId??view.current?.bundleId;let metadataBytes=0,visited=0;
 for(const bundleId of names.sort()){
  if(!validBundle(bundleId)){view.issues.push({code:'FINAL_ASSET_UNKNOWN_ENTRY',message:'版本目录含未识别项目'});continue;}
  if(bundleId===selectedId)continue;
  if(visited++>=128){view.issues.push({code:'FINAL_ASSET_HISTORY_LIMIT',message:'历史摘要超过本次128项读取范围；当前或明确选择的版本仍完整核验'});break;}
  try{const relative=directory+'/最终资产/版本/'+bundleId+'/manifest.json',stat=fs.lstatSync(safe(bound.vaultRoot,relative));
   if(metadataBytes+stat.size>FINAL_ASSET_LIMITS.text){view.issues.push({code:'FINAL_ASSET_HISTORY_LIMIT',message:'历史清单达到本次8 MiB元数据读取范围'});break;}
   const bytes=readFinalBytes(bound.vaultRoot,relative,FINAL_ASSET_LIMITS.text);metadataBytes+=bytes.length;const manifest=validateManifest(JSON.parse(bytes.toString('utf8')));
   if(manifest.bundleId!==bundleId||manifest.work.vaultId!==bound.vaultId||manifest.contentIdAtSave!==input.contentId)fail('CORRUPT','历史版本身份无效');
   view.bundles.push({bundleId,manifestHash:digest(bytes),adoptedAt:manifest.adoptedAt,complete:false,issues:['FINAL_ASSET_BYTES_NOT_VERIFIED']});view.work??=manifest.work;
  }catch(error){view.bundles.push({bundleId,manifestHash:'',adoptedAt:'',complete:false,issues:[error.code??'CORRUPT']});view.issues.push({code:error.code??'CORRUPT',message:error.message,relativePath:directory+'/最终资产/版本/'+bundleId});}
 }
 if(selectedId){try{const {selected}=verifyBundle(bound.vaultRoot,directory,selectedId,input.contentId);view.selected=selected;view.work??=selected.manifest.work;view.bundles.push({bundleId:selectedId,manifestHash:selected.manifestHash,adoptedAt:selected.manifest.adoptedAt,complete:true,issues:[]});}catch(error){view.bundles.push({bundleId:selectedId,manifestHash:'',adoptedAt:'',complete:false,issues:[error.code??'CORRUPT']});view.issues.push({code:error.code??'CORRUPT',message:error.message,relativePath:directory+'/最终资产/版本/'+selectedId});}}
 view.bundles.sort((a,b)=>b.adoptedAt.localeCompare(a.adoptedAt));
 if(view.current&&view.selected?.bundleId===view.current.bundleId&&view.selected.manifestHash!==view.current.manifestHash){view.issues.push({code:'FINAL_ASSET_CURRENT_MISMATCH',message:'当前指针与版本清单不一致'});view.selected=null;}
 if(view.selected){try{const p=readVaultPackaging(path.join(bound.vaultRoot,'.workbench/runtime'),{contentId:input.contentId,documentId:view.selected.manifest.packaging.documentId});if(p.kind!=='jc-doc')view.sourceState='unavailable';else{const original=view.selected.manifest.manuscript,choice=original.kind==='recorded'?{kind:'recorded',documentId:original.documentId}:{kind:'current'},script=sourceScript(bound,p,choice,snapshot(bound));view.sourceState=p.selectionToken===view.selected.manifest.packaging.selectionToken&&script.source.hash===original.hash?'current':'changed';}}catch{view.sourceState='unavailable';}}
 return view;
}
export function readFinalAssets(runtimeRoot,input){if(!exact(input,['contentId','bundleId'])||!validContent(input.contentId)||input.bundleId!==undefined&&!validBundle(input.bundleId))fail('INVALID_INPUT','最终资产读取参数无效');return locked(runtimeRoot,(bound,issues)=>readStored(bound,input,issues));}
export function saveFinalAssets(runtimeRoot,input,options,h){
 if(!exact(input,['contentId','packagingDocumentId','manuscript','expectedPreviewToken','expectedCurrentHash','acknowledgedWarnings']))fail('INVALID_INPUT','最终资产保存参数无效');const chosen=selection(Object.fromEntries(Object.entries(input).filter(([key])=>['contentId','packagingDocumentId','manuscript'].includes(key))));
 if(!validHash(input.expectedPreviewToken)||!(input.expectedCurrentHash===null||validHash(input.expectedCurrentHash))||!Array.isArray(input.acknowledgedWarnings)||input.acknowledgedWarnings.some(warning=>!WARNINGS.includes(warning))||new Set(input.acknowledgedWarnings).size!==input.acknowledgedWarnings.length)fail('INVALID_INPUT','最终资产版本或确认集合无效');
 const checked={...chosen,expectedPreviewToken:input.expectedPreviewToken,expectedCurrentHash:input.expectedCurrentHash,acknowledgedWarnings:[...input.acknowledgedWarnings].sort()};
 const receipt=runMutation(runtimeRoot,{action:'final-assets',input:checked},options,bound=>{
  const {preview,coverBytes,directory}=previewLocked(runtimeRoot,chosen,{...bound,vaultRoot:bound.root},h);if(preview.previewToken!==checked.expectedPreviewToken||preview.currentHash!==checked.expectedCurrentHash)fail('CONFLICT','来源、封面或当前采用版本已变化，请重新预览');if(!same(preview.warnings,checked.acknowledgedWarnings))fail('INVALID_INPUT','请明确确认本次预览中的封面来源警告');
  const bundleId=uuidFor('final-assets:'+preview.work.vaultId+':'+options.mutationId),relativeDirectory=directory+'/最终资产/版本/'+bundleId,adoptedAt=new Date().toISOString(),names=namesFor(preview.cover.mime);
  const sources={format:'nova-final-assets-sources',schemaVersion:1,work:preview.work,packaging:preview.packaging,manuscript:preview.manuscript,cover:preview.cover};
  const contents={script:Buffer.from(preview.texts.script),title:Buffer.from(preview.texts.title),description:Buffer.from(preview.texts.description),coverText:Buffer.from(preview.texts.coverText),cover:coverBytes,sources:jsonBytes(sources),readme:Buffer.from('# 最终资产交接版本\n\n这是作者明确保存的不可变快照；日常修改继续在原稿。\n\n- [逐字稿](逐字稿.md)\n- [标题](标题.txt)\n- [简介](简介.txt)\n- [封面文字](封面文字.txt)\n- [封面]('+names.cover+')\n- [来源](来源.json)\n\n本次保存不代表录完或发布。\n')};
  if(Object.values(contents).reduce((sum,bytes)=>sum+bytes.length,0)>FINAL_ASSET_LIMITS.raw)fail('INVALID_INPUT','最终资产原始字节超过保存上限');
  const files=Object.keys(names).map(role=>({role,name:names[role],sha256:digest(contents[role]),bytes:contents[role].length,mime:role==='cover'?preview.cover.mime:role==='sources'?'application/json':role==='script'||role==='readme'?'text/markdown':'text/plain'}));
  const manifest=validateManifest({format:'nova-final-assets',schemaVersion:1,bundleId,work:preview.work,contentIdAtSave:chosen.contentId,adoptedAt,adoption:{kind:'author-save',mutationId:options.mutationId,previewToken:preview.previewToken},packaging:preview.packaging,manuscript:preview.manuscript,cover:preview.cover,files}),manifestBytes=jsonBytes(manifest),manifestHash=digest(manifestBytes),pointer={format:'nova-final-assets-current',schemaVersion:1,work:preview.work,bundleId,manifestHash,mutationId:options.mutationId,adoptedAt},pointerBytes=jsonBytes(pointer);
  const raw=[...Object.values(contents),manifestBytes,pointerBytes];if(raw.reduce((sum,bytes)=>sum+bytes.length,0)>FINAL_ASSET_LIMITS.raw||raw.some((bytes,index)=>index!==4&&bytes.length>FINAL_ASSET_LIMITS.text))fail('INVALID_INPUT','最终资产原始字节超过保存上限');
  const writes=[...Object.keys(names).map(role=>({relativePath:relativeDirectory+'/'+names[role],beforeHash:null,after:contents[role].toString('base64')})),{relativePath:relativeDirectory+'/manifest.json',beforeHash:null,after:manifestBytes.toString('base64')},{relativePath:directory+'/最终资产/当前.json',beforeHash:checked.expectedCurrentHash,after:pointerBytes.toString('base64')}];
  const previous=readStored({...bound,vaultRoot:bound.root},chosen),selected={bundleId,manifestHash,relativeDirectory,manifest,texts:preview.texts,cover:{...preview.cover,resource:{contentId:chosen.contentId,bundleId,manifestHash,role:'cover'}}},result={contentId:chosen.contentId,work:preview.work,current:{...pointer,hash:digest(pointerBytes)},bundles:[...previous.bundles,{bundleId,manifestHash,adoptedAt,complete:true,issues:[]}],selected,sourceState:'current',issues:[]};
  const plan={action:'final-assets',work:preview.work,contentDirectory:directory,bundleId,writes,result};if(Buffer.byteLength(JSON.stringify({format:'nova-vault-mutation',mutationId:options.mutationId,request:{action:'final-assets',input:checked},requestHash:'0'.repeat(64),status:'pending',...plan}))>FINAL_ASSET_LIMITS.receipt)fail('INVALID_INPUT','最终资产冻结收据超过120 MiB');return plan;
 });return receipt.result;
}
export function readFinalAssetExport(runtimeRoot,input){if(!exact(input,['contentId','bundleId','manifestHash'])||!validContent(input.contentId)||!validBundle(input.bundleId)||!validHash(input.manifestHash))fail('INVALID_INPUT','最终资产导出身份无效');return locked(runtimeRoot,bound=>{const {directory}=directories(bound,input.contentId);if(!directory)fail('NOT_FOUND','最终资产版本不存在');const {selected,files}=verifyBundle(bound.vaultRoot,directory,input.bundleId,input.contentId,input.manifestHash);return {contentId:input.contentId,bundleId:input.bundleId,manifestHash:selected.manifestHash,manifest:selected.manifest,files};});}
