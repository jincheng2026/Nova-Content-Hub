import fs from 'node:fs';
import {validateImportedRaster} from '../image-validation/index.mjs';
const proofs=new Map(),VALIDATOR='imported-raster-v1',MAX_PROOFS=128,MAX_BYTES=64*1024*1024;
/** Copy only a bounded, singly linked fd; the expected asset hash is checked by readAssetInternal. */
export function selectedCoverBytes(filename,safePath,fail,limit=MAX_BYTES){
 const before=safePath(filename);if(!before.isFile()||before.nlink!==1||before.size<1||before.size>limit)fail('CORRUPT','Selected cover/evidence is not a bounded singly linked file');
 const fd=fs.openSync(filename,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0)|(fs.constants.O_NONBLOCK??0));const equal=(a,b)=>['dev','ino','size','nlink','mtimeMs','ctimeMs'].every(key=>a[key]===b[key]);
 try{const opened=fs.fstatSync(fd);if(!opened.isFile()||opened.nlink!==1||!equal(before,opened))fail('CONFLICT','Selected cover changed before read');const chunks=[];let total=0;for(;;){const block=Buffer.allocUnsafe(Math.min(64*1024,limit-total+1)),count=fs.readSync(fd,block,0,block.length,null);if(!count)break;total+=count;if(total>limit)fail('CORRUPT','Selected cover exceeds encoded limit');chunks.push(block.subarray(0,count));}if(!equal(opened,fs.fstatSync(fd))||!equal(before,safePath(filename))||total!==before.size)fail('CONFLICT','Selected cover changed during read');return Buffer.concat(chunks,total);}finally{fs.closeSync(fd);}
}
export function selectedCoverMethods(h){
 const {root,libraryId,locked,current,readAssetInternal,safePath,hash,fail,readGeneratedSelectedEvidence}=h;
 function raw(contentId){return locked(()=>{
  const meta=current(contentId);if(meta.deletedAt)fail('INVALID_STATE','Selected content is deleted');const selected=meta.selectedCover;if(!selected)fail('NOT_READY','Select a cover before saving final assets');
  const candidate=meta.candidates.find(candidate=>candidate.id===selected.candidateId);if(!candidate||!candidate.accepted||candidate.assetHash!==selected.assetHash||candidate.requestId!==selected.requestId||candidate.attemptId!==selected.attemptId)fail('CORRUPT','Selected cover ownership mismatch');
  const reference=(meta.unavailableReferences??[]).find(reference=>reference.kind==='candidate'&&(reference.resolvedObjectId===candidate.id||reference.id===candidate.id));
  if(reference&&(reference.deletedAt||reference.availability!=='available'||reference.assetHash!==candidate.assetHash))fail('INVALID_STATE','Selected imported cover reference is deleted or unavailable');
  const asset=readAssetInternal(root,candidate.assetHash,filename=>selectedCoverBytes(filename,safePath,fail));if(!['image/png','image/jpeg','image/webp','image/gif'].includes(asset.detectedType))fail('CORRUPT','Selected cover is not a supported raster');
  const generated=readGeneratedSelectedEvidence(meta,candidate,asset),stat=fs.lstatSync(root,{bigint:true});
  const identity={libraryId,root,dev:String(stat.dev),ino:String(stat.ino),contentId:meta.id,candidateId:candidate.id,assetHash:candidate.assetHash,selectedAt:selected.selectedAt};
  let provenance=generated?.provenance;if(!provenance){const batch=(meta.importedCoverBatches??[]).find(batch=>batch.candidateIds.includes(candidate.id));provenance=reference||batch?{kind:'imported',importId:reference?.id??batch.id,originalName:reference?.originalName??candidate.originalName??'',assetHash:candidate.assetHash}:{kind:'legacy',unknown:true};}
  return {identity,asset,provenance,proof:generated?.proof??null};
 });}
 const key=value=>JSON.stringify([VALIDATOR,value.identity.libraryId,value.identity.root,value.identity.dev,value.identity.ino,value.identity.assetHash]);
 function checkedProof(value,proof){if(!proof||proof.decoded!==true||proof.assetHash!==value.asset.assetHash||proof.bytes!==value.asset.bytes||!Number.isSafeInteger(proof.width)||!Number.isSafeInteger(proof.height)||proof.width<1||proof.height<1||proof.width*proof.height>40_000_000||'image/'+(proof.format==='jpeg'?'jpeg':proof.format)!==value.asset.detectedType)fail('NOT_READY','Selected existing cover requires trusted full raster decoding');return proof;}
 function readSelectedCoverSnapshot(contentId){const value=raw(contentId),proof=checkedProof(value,value.proof??proofs.get(key(value)));return {contentId:value.identity.contentId,candidateId:value.identity.candidateId,selectedAt:value.identity.selectedAt,assetHash:value.asset.assetHash,mime:value.asset.detectedType,width:proof.width,height:proof.height,bytes:Buffer.from(value.asset.data),decoded:true,provenance:structuredClone(value.provenance)};}
 async function ensureSelectedCoverDecoded(contentId){
  const before=raw(contentId),cached=before.proof??proofs.get(key(before));if(cached){checkedProof(before,cached);return;}
  // No Vault/runtime lock crosses the decoder await. No cache bytes or author facts are persisted.
  const decoded=await validateImportedRaster(before.asset.data),after=raw(contentId);
  if(JSON.stringify(after.identity)!==JSON.stringify(before.identity)||hash(after.asset.data)!==hash(before.asset.data))fail('CONFLICT','Selected cover changed while validating its raster');
  const proof=checkedProof(after,decoded),cacheKey=key(after);if(proofs.size>=MAX_PROOFS&&!proofs.has(cacheKey))proofs.delete(proofs.keys().next().value);proofs.set(cacheKey,Object.freeze({assetHash:proof.assetHash,bytes:proof.bytes,width:proof.width,height:proof.height,format:proof.format,decoded:true,validator:VALIDATOR}));
 }
 return {readSelectedCoverSnapshot,ensureSelectedCoverDecoded};
}
