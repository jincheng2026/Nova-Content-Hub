import {useEffect,useRef,useState} from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import Select from '@douyinfe/semi-ui-19/lib/es/select';
import Checkbox from '@douyinfe/semi-ui-19/lib/es/checkbox';
import Banner from '@douyinfe/semi-ui-19/lib/es/banner';
import {invoke} from './client.ts';
import {errorInfo} from '../shared/contracts.ts';
import {listenVaultRecovery} from '../shared/vault-editor-recovery.ts';
import type {FinalAssetsView,FinalAssetWarning} from '../shared/final-assets-contracts.ts';
import type {VaultDocument} from '../shared/vault-contracts.ts';
import type {VaultPackaging} from '../shared/cover-contracts.ts';
import {ImagePreviewButton} from './cover-image-viewer.tsx';
import {FinalAssetsDraft} from './final-assets-state.ts';
import './final-assets.css';
const warningText:Record<FinalAssetWarning,string>={COVER_SOURCE_DIFFERENT:'这张封面来自另一版正文或包装。保留其真实来源，确认本次仍采用这张图。',COVER_SOURCE_UNKNOWN:'这张封面的历史来源尚未完整记录。确认本次采用，并保留来源未记录标记。'};
export function FinalAssetsPanel({contentId,documents,busy,flush,makeCover}:{contentId:string;documents:VaultDocument[];busy:boolean;flush():Promise<void>;makeCover():void}){
 const draft=useRef(new FinalAssetsDraft(contentId)).current;
 const [view,setView]=useState<FinalAssetsView|null>(null),[packaging,setPackaging]=useState<VaultPackaging|null>(null),[notice,setNotice]=useState(''),[working,setWorking]=useState(false),[display,setDisplay]=useState<'preview'|'saved'>('saved'),[,render]=useState(0);
 const mounted=useRef(true),active=useRef(false);const refresh=()=>render(value=>value+1);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 async function run(action:()=>Promise<void>){if(active.current)return;active.current=true;setWorking(true);setNotice('');try{await action();}catch(error){if(mounted.current)setNotice(errorInfo(error).message);}finally{active.current=false;if(mounted.current){setWorking(false);refresh();window.dispatchEvent(new Event('nova-workspace-refresh'));window.dispatchEvent(new Event('nova-final-assets-status'));}}}
 async function read(bundleId?:string){const result=await invoke('readFinalAssets',{contentId,...(bundleId?{bundleId}:{})});if(mounted.current)setView(result);}
 async function readPackaging(){const result=await invoke('readCoverPackaging',{contentId,...(draft.selection.packagingDocumentId?{documentId:draft.selection.packagingDocumentId}:{})});if(mounted.current)setPackaging(result);return result;}
 useEffect(()=>{void run(async()=>{await read();await readPackaging();});return listenVaultRecovery(window,recovery=>{if(draft.recovered(recovery)){refresh();void run(async()=>{await read();setNotice(recovery.outcome==='committed'?'上次保存已确认，来源选择与本次预览已保留。':'上次保存未提交，来源选择与本次预览已保留。');});}});},[contentId]);
 const disabled=busy||working,selection=draft.selection,preview=draft.preview;
 const recordedDocuments=documents.filter(document=>document.contentId===contentId&&document.format==='html');
 const choices=packaging?.kind==='choose-source'?packaging.candidates:[];
 const selected=view?.selected;
 async function previewNow(){await run(async()=>{await draft.readPreview(flush,async input=>{await readPackaging();return invoke('previewFinalAssets',input);});setDisplay('preview');refresh();});}
 async function save(){await run(async()=>{const next=await draft.save(flush,input=>invoke('saveFinalAssets',input),()=>invoke('status'));if(mounted.current){setView(next);setDisplay('saved');setNotice('四项最终资产已保存为新版本。');}refresh();});}
 const shownPreview=display==='preview'?preview:null;
 const texts=shownPreview?.texts??selected?.texts,url=shownPreview?.cover.url??selected?.cover.url;
 return <section className="final-assets-panel" aria-label="最终资产">
  <div className="final-assets-heading"><div><h3>最终资产</h3><p>确认逐字稿、标题、简介和封面，保存为同一篇的独立版本。</p></div><Button disabled={disabled} onClick={()=>void run(async()=>{await read();setDisplay('saved');})}>重新读取已保存版本</Button></div>
  {notice&&<Banner type="warning" closeIcon={null} description={notice}/>}
  {(view?.issues??[]).map((issue,index)=><p className="final-assets-warning" role="alert" key={index}>{issue.message}</p>)}
  {view&&view.work===null&&<p>尚无已保存的最终版本。完成下方来源选择后，可预览并保存第一版。</p>}
  <div className="final-assets-controls">
   <label>稿件来源<Select aria-label="最终逐字稿来源" disabled={disabled||draft.pending} value={selection.manuscript.kind} onChange={value=>{if(value==='recorded'){const doc=recordedDocuments[0];if(!doc){setNotice('未找到可选的创作页录完稿。');return;}draft.select({...selection,manuscript:{kind:'recorded',documentId:doc.id}});}else draft.select({...selection,manuscript:{kind:'current'}});refresh();}} optionList={[{value:'current',label:'当前确认稿'},{value:'recorded',label:'明确选择已存在的录完稿'}]}/></label>
   {selection.manuscript.kind==='recorded'&&<label>录完稿所在页<Select aria-label="录完稿所在创作页" filter disabled={disabled||draft.pending} value={selection.manuscript.documentId} optionList={recordedDocuments.map(doc=>({value:doc.id,label:doc.relativePath}))} onChange={value=>{draft.select({...selection,manuscript:{kind:'recorded',documentId:String(value)}});refresh();}}/></label>}
   {(choices.length>0||selection.packagingDocumentId)&&<label>包装来源<Select aria-label="最终包装来源" filter disabled={disabled||draft.pending} placeholder="请选择本次采用的包装页" value={selection.packagingDocumentId} optionList={(choices.length?choices:documents.filter(doc=>doc.contentId===contentId&&doc.format==='html')).map(doc=>({value:'documentId'in doc?doc.documentId:doc.id,label:doc.relativePath}))} onChange={value=>{draft.select({...selection,packagingDocumentId:String(value)});refresh();}}/></label>}
   <Button disabled={disabled||draft.pending} onClick={()=>void previewNow()}>预览最终资产</Button>
  </div>
  <FinalAssetReview display={display} preview={preview} selected={selected??null} acknowledged={draft.acknowledged} busy={disabled} pending={draft.pending} onAcknowledge={(code,checked)=>{draft.acknowledge(code,checked);refresh();}} onSave={()=>void save()} onCopy={text=>void run(async()=>{await invoke('copyPrompt',{text});setNotice('已复制完整逐字稿。');})} onReturnPreview={()=>setDisplay('preview')}/>
  {draft.pending&&<p role="status">上次保存结果待核验；本次来源选择、预览和确认保持保留，请使用“继续处理待确认操作”。</p>}
  {view&&view.bundles.length>0&&<div className="final-assets-controls"><label>已保存的最终版本<Select aria-label="已保存的最终版本" filter disabled={disabled} value={selected?.bundleId} optionList={view.bundles.map(bundle=>({value:bundle.bundleId,label:bundle.adoptedAt+(view.current?.bundleId===bundle.bundleId?' · 当前采用':'')+(bundle.complete?'':bundle.issues.length===1&&bundle.issues[0]==='FINAL_ASSET_BYTES_NOT_VERIFIED'?' · 待核验':' · 校验未通过')}))} onChange={value=>void run(async()=>{await read(String(value));setDisplay('saved');})}/></label>{selected&&display==='saved'&&<><Button disabled={disabled} onClick={()=>void run(async()=>{const output=await invoke('exportFinalAssets',{contentId,bundleId:selected.bundleId,manifestHash:selected.manifestHash});setNotice(output.cancelled?'已取消导出。':'已核验并导出到 '+output.directory);})}>导出这一版</Button><Button theme="borderless" disabled={disabled} onClick={()=>void run(async()=>{await invoke('revealVaultContentDirectory',{contentId});})}>定位内容目录</Button></>}</div>}
  {view&&<div className="final-assets-version-issues">{view.bundles.filter(bundle=>!bundle.complete&&!(bundle.issues.length===1&&bundle.issues[0]==='FINAL_ASSET_BYTES_NOT_VERIFIED')).map(bundle=><p role="alert" key={bundle.bundleId}>版本 {bundle.adoptedAt} 校验未通过：{bundle.issues.join('、')}</p>)}</div>}
  {selected&&<p className="final-assets-source">已保存：{selected.relativeDirectory} · {view?.sourceState==='changed'?'当前原稿或包装后来已有变化，所存版本保持原样。':view?.sourceState==='unavailable'?'活源暂时不可读取，此版本仍可读回与导出。':'版本文件已核验。'}</p>}
  {!texts&&<p>先完成包装并选用一张封面，再预览四项资产。已有录完／发布记录保持其原有事实。</p>}
  {!preview&&<Button theme="borderless" disabled={disabled} onClick={makeCover}>查看与选择封面</Button>}
 </section>;
}

/** The visible version and its actions are selected together. A retained review
 * never becomes a hidden target of a save button while reading history. */
export function FinalAssetReview({display,preview,selected,acknowledged,busy,pending,onAcknowledge,onSave,onCopy,onReturnPreview}:{display:'preview'|'saved';preview:import('../shared/final-assets-contracts.ts').FinalAssetsPreview|null;selected:FinalAssetsView['selected'];acknowledged:ReadonlySet<FinalAssetWarning>;busy:boolean;pending:boolean;onAcknowledge(code:FinalAssetWarning,checked:boolean):void;onSave():void;onCopy(text:string):void;onReturnPreview():void}){
 const shown=display==='preview'?preview:null,texts=shown?.texts??selected?.texts,url=shown?.cover.url??selected?.cover.url;
 return <>
  {shown&&<p className="final-assets-source">本次预览：{shown.manuscript.kind==='recorded'?'明确选用录完稿':'当前确认稿'} · {shown.manuscript.relativePath} · 包装页 {shown.packaging.pageId}</p>}
  {!shown&&preview&&<Button disabled={busy} onClick={onReturnPreview}>返回本次预览</Button>}
  {texts&&<div className="final-assets-preview"><div className="final-assets-texts"><h4>{texts.title}</h4><p className="final-assets-cover-text">封面字：{texts.coverText}</p><details><summary>查看完整简介</summary><pre>{texts.description}</pre></details><details><summary>查看完整逐字稿</summary><pre>{texts.script}</pre><Button size="small" disabled={busy} onClick={()=>onCopy(texts.script)}>复制逐字稿</Button></details></div>{url&&<ImagePreviewButton url={url} label={shown?'本次最终资产预览封面':'已保存版本封面'}/>}</div>}
  {shown&&<div className="final-assets-save">{shown.warnings.map(code=><Checkbox key={code} checked={acknowledged.has(code)} disabled={busy||pending} onChange={event=>onAcknowledge(code,event.target.checked===true)}>{warningText[code]}</Checkbox>)}<Button theme="solid" disabled={busy||pending||shown.warnings.some(code=>!acknowledged.has(code))} onClick={onSave}>保存这一版</Button></div>}
 </>;
}
