import {bindingForRuntime,contentSources,scan,withVaultReadLock} from '../vault/core.mjs';
import {readWorkFlow} from '../vault/workflow.mjs';
import {readConfirmedCoverDesign} from '../method-adapters/runtime.mjs';
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
import {validCoverDesignSelection} from './cover-design-validation.mjs';
function scoped(runtimeRoot,contentId,read){
 const binding=bindingForRuntime(runtimeRoot);if(!binding)return read(null,null);
 return withVaultReadLock(binding.vaultRoot,()=>{const source=contentSources({root:binding.vaultRoot,vaultId:binding.vaultId,...scan(binding.vaultRoot,binding.vaultId)}).find(source=>source.contentId===contentId);if(!source)fail('STALE_INPUT','此内容已没有同篇设计来源，请刷新当前内容。');return read(binding.vaultRoot,{vaultId:binding.vaultId,workId:source.tNumber});});
}
export function readCoverDesigns(runtimeRoot,contentId){
 return scoped(runtimeRoot,contentId,(root,work)=>{if(!root)return [];const flow=readWorkFlow(root,work),artifact=flow.artifacts.findLast(a=>a.kind==='cover-design');if(!artifact||!flow.checkpointStates[artifact.artifactId]?.confirmed)return [];const design=readConfirmedCoverDesign(root,{work,artifactId:artifact.artifactId,artifactHash:artifact.hash});return [{title:design.title,prompt:design.prompt,ratio:design.ratio,identity:design.identity,designSource:design.designSource}];});
}
export function resolveCoverDesign(runtimeRoot,contentId,selection){
 if(!validCoverDesignSelection(selection))fail('INVALID_INPUT','封面设计引用无效。');
 return scoped(runtimeRoot,contentId,(root,work)=>{if(!root)fail('STALE_INPUT','此内容没有已确认设计来源。');try{return readConfirmedCoverDesign(root,{work,...selection});}catch(error){fail('STALE_INPUT','封面设计已变更、未确认或不属于本篇，请重新确认设计后再制作。');}});
}
