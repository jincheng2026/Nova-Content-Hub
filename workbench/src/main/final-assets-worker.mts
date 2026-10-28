import * as fileLibrary from '../../../plugin-src/src/lib/file-library/index.mjs';
import {readFinalAssets,previewFinalAssets,readFinalAssetExport} from '../../../plugin-src/src/lib/final-assets/index.mjs';
import {verifyBoundRoot} from './bound-reader.mts';
import {exact,libraryBinding,validateInput,fail} from '../shared/validation.ts';
import type {FinalAssetsWorkerOperations,FinalAssetsInputs} from '../shared/final-assets-contracts.ts';
import type {LibraryBinding} from '../shared/contracts.ts';
export const isFinalAssetsOperation=(op:unknown):op is keyof FinalAssetsWorkerOperations=>typeof op==='string'&&['finalRead','finalPreview','finalExport','finalAssetRaster'].includes(op);
async function readFinalAssetsOperation(op:keyof FinalAssetsWorkerOperations,args:unknown){
 if(!exact(args,['binding','input'])||!libraryBinding(args.binding))fail('INVALID_INPUT','最终资产请求无效。');
 const method=op==='finalRead'?'readFinalAssets':op==='finalPreview'?'previewFinalAssets':'exportFinalAssets';
 validateInput(method,args.input);const binding=args.binding as LibraryBinding;
 // Saved bundle reads must not depend on runtime image caches or reproject live sources.
 verifyBoundRoot(binding);
 if(op==='finalRead')return readFinalAssets(binding.root,args.input as FinalAssetsInputs['readFinalAssets']);
 if(op==='finalPreview'){if(typeof fileLibrary.ensureSelectedCoverDecoded!=='function')fail('NOT_READY','已选封面验证能力尚未就绪。');await fileLibrary.ensureSelectedCoverDecoded(binding.root,{contentId:(args.input as FinalAssetsInputs['previewFinalAssets']).contentId});verifyBoundRoot(binding);return previewFinalAssets(binding.root,args.input as FinalAssetsInputs['previewFinalAssets']);}
 const bundle=readFinalAssetExport(binding.root,args.input as FinalAssetsInputs['exportFinalAssets']);
 if(op==='finalExport')return bundle;
 const cover=bundle.manifest.files.find(file=>file.role==='cover'),file=cover&&bundle.files.find(file=>file.name===cover.name);
 if(!cover||!file||cover.sha256!==file.sha256||!['image/png','image/jpeg','image/webp','image/gif'].includes(file.mime))fail('CORRUPT','已保存版本缺少可验证的封面。');
 return {data:Buffer.from(file.bytes),mime:file.mime,sha256:file.sha256};
}

export async function executeFinalAssets(op:keyof FinalAssetsWorkerOperations,args:unknown){
 try{return await readFinalAssetsOperation(op,args);}
 catch(error){
  // This exact core lock contention is retryable. Missing helpers and other
  // NOT_READY capabilities retain their meaning and are never retried here.
  if(op==='finalAssetRaster'&&error instanceof Error&&'code'in error&&error.code==='NOT_READY'&&error.message==='知识库正由另一项写入操作使用，请稍后重试')throw Object.assign(Error('最终资产读取暂时被知识库锁占用。'),{code:'BUSY'});
  throw error;
 }
}
