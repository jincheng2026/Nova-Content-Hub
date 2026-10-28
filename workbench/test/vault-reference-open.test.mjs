import test from 'node:test';
import assert from 'node:assert/strict';
import {VaultController} from '../src/main/vault-controller.mts';
import {validateInput} from '../src/shared/validation.ts';

function fixture(text='[原视频](https://www.douyin.com/video/123)') {
 const calls=[], opened=[];
 const owner={authMode:'disabled',current:()=>({libraryId:'bound'}),exclusive:async fn=>fn(),openPublicationURL:async url=>opened.push(url),worker:{call:async(op,args)=>{calls.push({op,args});return {document:{id:'card',relativePath:'04_选题库/T001.md',section:'topics',format:'markdown'},text};}}};
 return {controller:new VaultController(owner),owner,calls,opened};
}
test('opens only an exact parsed reference from the current bound document',async()=>{
 const {controller,calls,opened}=fixture();
 assert.deepEqual(await controller.openVaultReference({id:'card',url:'https://www.douyin.com/video/123'}),{opened:true});
 assert.deepEqual(opened,['https://www.douyin.com/video/123']);
 assert.deepEqual(calls,[{op:'vaultDocument',args:{binding:{libraryId:'bound'},id:'card'}}]);
});
test('rejects a substituted URL, stale reference, protocol, credentials and invisible characters',async()=>{
 for(const [text,url] of [
 ['https://example.com/a','https://example.com/b'],
 ['reference removed','https://example.com/a'],
 ['[bad](file:///tmp/x)','file:///tmp/x'],
 ['https://user:secret@example.com/a','https://user:secret@example.com/a'],
 ['https://example.com/\u0001a','https://example.com/\u0001a'],
 ]){
  const {controller,opened}=fixture(text);
  await assert.rejects(async()=>controller.openVaultReference({id:'card',url}));
  assert.deepEqual(opened,[]);
 }
});
test('balanced URLs retain parentheses and bare URLs trim prose punctuation',async()=>{
 for(const text of ['[视频](https://example.com/a_(b))','视频 https://example.com/a_(b)。']){
  const {controller,opened}=fixture(text);
  await controller.openVaultReference({id:'card',url:'https://example.com/a_(b)'});
  assert.deepEqual(opened,['https://example.com/a_(b)']);
 }
});
test('rejects extra fields and unavailable browser; required mode cannot open business sources',async()=>{
 const input={id:'card',url:'https://www.douyin.com/video/123'};
 assert.throws(()=>validateInput('openVaultReference',{...input,path:'/tmp/a'}),{code:'INVALID_INPUT'});
 const {controller,owner,opened}=fixture();owner.openPublicationURL=undefined;
 await assert.rejects(controller.openVaultReference(input),{code:'NOT_READY'});
 owner.authMode='required';await assert.rejects(async()=>controller.openVaultReference(input),{code:'AUTH_NOT_CONFIGURED'});
 assert.deepEqual(opened,[]);
});

test('a normal draft cannot impersonate an original topic card',async()=>{
 const {controller,owner,opened}=fixture();owner.worker.call=async()=>({document:{id:'draft',section:'drafts',format:'markdown'},text:'https://example.com/a'});
 await assert.rejects(controller.openVaultReference({id:'draft',url:'https://example.com/a'}),{code:'INVALID_REFERENCE_LINK'});assert.deepEqual(opened,[]);
});
