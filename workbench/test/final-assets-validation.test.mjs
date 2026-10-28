import test from 'node:test';
import assert from 'node:assert/strict';
import {validateInput} from '../src/shared/validation.ts';

const contentId='9ad57f9a-85f4-46e1-a4d3-908af4d7501d';
const bundleId='67802656-7c76-4205-bb32-a8b431e3fc0f';
const documentId='doc-'+'c'.repeat(32), hash='a'.repeat(64);
const preview={contentId,packagingDocumentId:documentId,manuscript:{kind:'current'}};
const save={...preview,expectedPreviewToken:hash,expectedCurrentHash:null,acknowledgedWarnings:[]};

// Removing the finite DTO allowlist must fail this boundary, before filesystem IO.
test('final asset IPC accepts only identities, frozen versions and explicit source choices',()=>{
 for(const [method,input] of [
  ['readFinalAssets',{contentId}],['readFinalAssets',{contentId,bundleId}],
  ['previewFinalAssets',preview],
  ['previewFinalAssets',{contentId,manuscript:{kind:'recorded',documentId}}],
  ['saveFinalAssets',save],
  ['saveFinalAssets',{...save,expectedCurrentHash:hash,acknowledgedWarnings:['COVER_SOURCE_DIFFERENT']}],
  ['exportFinalAssets',{contentId,bundleId,manifestHash:hash}],
 ]) assert.doesNotThrow(()=>validateInput(method,input),method);
});

test('renderer cannot supply asset text, bytes, arbitrary paths or mutation identity',()=>{
 for(const [method,input] of [['readFinalAssets',{contentId}],['previewFinalAssets',preview],['saveFinalAssets',save],['exportFinalAssets',{contentId,bundleId,manifestHash:hash}]]){
  for(const field of ['root','path','destination','runtimeRoot','title','script','coverBytes','mutationId'])
   assert.throws(()=>validateInput(method,{...input,[field]:'/tmp/arbitrary'}),{code:'INVALID_INPUT'},method+':'+field);
 }
 for(const manuscript of [{kind:'current',text:'replacement'},{kind:'recorded',documentId,path:'/tmp'},{kind:'latest'},{kind:'recorded'}])
  assert.throws(()=>validateInput('previewFinalAssets',{...preview,manuscript}),{code:'INVALID_INPUT'});
});

test('final saving refuses malformed tokens, ambiguous warning acknowledgements and identities',()=>{
 for(const patch of [{expectedPreviewToken:''},{expectedPreviewToken:'a'.repeat(63)},{expectedCurrentHash:''},{acknowledgedWarnings:['COVER_SOURCE_DIFFERENT','COVER_SOURCE_DIFFERENT']},{acknowledgedWarnings:['arbitrary']},{acknowledgedWarnings:'all'},{contentId:'../../T001'},{packagingDocumentId:'doc-/tmp'}])
  assert.throws(()=>validateInput('saveFinalAssets',{...save,...patch}),{code:'INVALID_INPUT'});
 for(const input of [{contentId,bundleId:'../version',manifestHash:hash},{contentId,bundleId,manifestHash:null},{contentId,bundleId,manifestHash:hash,overwrite:true}])
  assert.throws(()=>validateInput('exportFinalAssets',input),{code:'INVALID_INPUT'});
});
