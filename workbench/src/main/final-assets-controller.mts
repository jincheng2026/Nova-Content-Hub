import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import type {DesktopController} from './controller.mts';
import type {Worker,LibraryBinding} from '../shared/contracts.ts';
import type {FinalAssetsInputs} from '../shared/final-assets-contracts.ts';
import type {FinalAssetsView,FinalAssetsPreview,VerifiedBundle} from '../../../plugin-src/src/lib/final-assets/index.mjs';
import {validateInput,fail} from '../shared/validation.ts';
import {externalExportParent} from './local-files.mts';
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
type Grant={binding:LibraryBinding;input:FinalAssetsInputs['exportFinalAssets'];assetHash:string};
const sameDirectory=(a:import('node:fs').Stats,b:import('node:fs').Stats)=>a.dev===b.dev&&a.ino===b.ino&&b.isDirectory()&&!b.isSymbolicLink();
export class FinalAssetsController {
 owner:DesktopController;reader?:Worker;grants=new Map<string,Grant>();
 constructor(owner:DesktopController,reader?:Worker){this.owner=owner;this.reader=reader;}
 revoke(){this.grants.clear();}
 private current(binding:LibraryBinding){try{return isDeepStrictEqual(binding,this.owner.current());}catch{return false;}}
 private grant(binding:LibraryBinding,input:Grant['input'],assetHash:string){if(!this.current(binding))fail('CONFLICT','知识库已切换，请重新读取最终资产。');for(const [existing,grant]of this.grants)if(isDeepStrictEqual(grant.binding,binding)&&isDeepStrictEqual(grant.input,input)&&grant.assetHash===assetHash)return existing;
  if(this.grants.size>=128)this.grants.delete(this.grants.keys().next().value!);
  const url='nova-content://assets/final-'+randomUUID();this.grants.set(url,{binding:structuredClone(binding),input:{...input},assetHash});return url;}
 allows(url:string){const grant=this.grants.get(url);return !!grant&&this.current(grant.binding);}
 async resource(url:string):Promise<{data:Buffer<ArrayBuffer>;mime:string}|null>{
  const grant=this.grants.get(url);if(!grant||!this.current(grant.binding))return null;
  try{const value=await (this.reader??this.owner.worker).call('finalAssetRaster',{binding:grant.binding,input:grant.input});if(this.grants.get(url)!==grant||!this.current(grant.binding))return null;
   const bytes=Buffer.from(value.data);if(digest(bytes)!==grant.assetHash||value.sha256!==grant.assetHash||!['image/png','image/jpeg','image/webp','image/gif'].includes(value.mime))fail('CORRUPT','最终封面校验失败。');return {data:bytes,mime:value.mime};
  }catch(error){if(!this.current(grant.binding)||!this.grants.has(url))return null;throw error;}
 }
 private decorate(view:FinalAssetsView,binding:LibraryBinding){return {...view,selected:view.selected?{...view.selected,cover:{...view.selected.cover,url:this.grant(binding,{contentId:view.contentId,bundleId:view.selected.bundleId,manifestHash:view.selected.manifestHash},view.selected.cover.assetHash)}}:null};}
 readFinalAssets(input:FinalAssetsInputs['readFinalAssets']){validateInput('readFinalAssets',input);return this.owner.exclusive(async()=>{const binding=structuredClone(this.owner.current());return this.decorate(await this.owner.worker.call('finalRead',{binding,input}),binding);});}
 previewFinalAssets(input:FinalAssetsInputs['previewFinalAssets']){validateInput('previewFinalAssets',input);return this.owner.exclusive(async()=>{const result:FinalAssetsPreview=await this.owner.worker.call('finalPreview',{binding:this.owner.current(),input});return {...result,cover:{...result.cover,url:this.owner.covers.grant(result.cover.assetHash)}};});}
 async saveFinalAssets(input:FinalAssetsInputs['saveFinalAssets']){validateInput('saveFinalAssets',input);const binding=structuredClone(this.owner.current());const result=await this.owner.vault.mutate('saveFinalAssets',input);if(!('bundles' in result))fail('CORRUPT','最终资产返回结果无效。');return this.decorate(result,binding);}
 exportFinalAssets(input:FinalAssetsInputs['exportFinalAssets']){validateInput('exportFinalAssets',input);return this.owner.exclusive(async()=>{
  const binding=structuredClone(this.owner.current()),chosen=await this.owner.dialogs.maintenanceParent?.();if(!chosen)return {cancelled:true as const};
  const wholeVault=await this.owner.worker.call('vaultLocation',{binding});
  const parent=await externalExportParent(await externalExportParent(chosen,wholeVault),binding.root),identity=await fs.lstat(parent);
  if(!identity.isDirectory()||identity.isSymbolicLink())fail('INVALID_DESTINATION','请选择普通导出文件夹。');
  const bundle=await this.owner.worker.call('finalExport',{binding,input});
  const check=async()=>{if(!this.current(binding)||!sameDirectory(identity,await fs.lstat(parent))||await fs.realpath(parent)!==parent)fail('CONFLICT','导出目录或知识库身份已变化。');};
  await check();return this.writeExport(parent,bundle,check);
 });}
 private async writeExport(parent:string,bundle:VerifiedBundle,check:()=>Promise<void>){
  // Reserve a new destination atomically. rename may replace only our own empty
  // reservation, never a pre-existing user directory. All data stays in stage
  // until every byte has been checked; no source file is ever an output target.
  const stamp=randomUUID(),directory=path.join(parent,'最终资产-'+bundle.bundleId+'-'+stamp),stage=path.join(parent,'.最终资产准备-'+stamp);
  await fs.mkdir(directory,{mode:0o700});const reserved=await fs.lstat(directory);let published=false,staging:import('node:fs').Stats|null=null;
  try{await fs.mkdir(stage,{mode:0o700});staging=await fs.lstat(stage);let total=0;const names=new Set<string>();
   for(const file of bundle.files){await check();if(!file.name||['.','..'].includes(file.name)||path.basename(file.name)!==file.name||/[\\:\u0000-\u001f]/.test(file.name)||names.has(file.name)||!sameDirectory(staging,await fs.lstat(stage)))fail('CORRUPT','导出清单文件名或目录无效。');names.add(file.name);
    const bytes=Buffer.from(file.bytes);total+=bytes.length;if(total>80*1024*1024||digest(bytes)!==file.sha256)fail('CORRUPT','导出资产字节校验失败。');
    const target=path.join(stage,file.name),handle=await fs.open(target,'wx',0o600);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
    if(digest(await fs.readFile(target))!==file.sha256)fail('CORRUPT','导出落盘校验失败。');
   }
   await check();if(!sameDirectory(staging,await fs.lstat(stage))||!sameDirectory(reserved,await fs.lstat(directory))||(await fs.readdir(directory)).length)fail('CONFLICT','新导出目录已变化。');
   if(process.platform==='win32'){await fs.rmdir(directory);await check();}
   await fs.rename(stage,directory);published=true;return {cancelled:false as const,directory};
  }finally{if(!published){try{await check();if(staging&&sameDirectory(staging,await fs.lstat(stage))&&await fs.realpath(stage)===stage)await fs.rm(stage,{recursive:true,force:true});if(sameDirectory(reserved,await fs.lstat(directory))&&!(await fs.readdir(directory)).length)await fs.rmdir(directory);}catch{/* Changed destinations are preserved for inspection. */}}}
 }
}
