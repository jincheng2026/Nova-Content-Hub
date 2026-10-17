import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {createLibrary,openLibrary,__testing} from '../index.mjs';

process.env.NODE_ENV = 'test';
function fixture(t) {
  const parent=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'nova-open-identity-'));
  const root=path.join(parent,'library'),lib=createLibrary(root);
  t.after(()=>{__testing.setHook(undefined);fs.rmSync(parent,{recursive:true,force:true});});
  return {parent,root,lib};
}
function identity(root) {
  const s=fs.lstatSync(root,{bigint:true});
  return {dev:String(s.dev),ino:String(s.ino)};
}
function expectation(lib) {
  return {expectedLibraryId:lib.info.libraryId,expectedRootIdentity:identity(lib.info.root)};
}
function tree(root) {
  const entries=[];
  function visit(dir) {
    for(const name of fs.readdirSync(dir).sort()) {
      const file=path.join(dir,name),relative=path.relative(root,file);
      if(fs.lstatSync(file).isDirectory()){entries.push([relative,null]);visit(file);}
      else entries.push([relative,fs.readFileSync(file).toString('base64')]);
    }
  }
  visit(root);return entries;
}
function pending(lib) {
  const item=lib.createContent({title:'before',body:'before'}),mutationId=randomUUID();
  __testing.setHook(e=>{if(e.phase==='afterJournal')throw new Error('pending fixture');});
  try {
    assert.throws(()=>lib.updateContent(item.id,{body:'after'},item.editToken,{mutationId}),e=>e.pendingRecovery===true);
  } finally {__testing.setHook(undefined);}
  return {item,mutationId};
}
function conflictWithoutRecovery(root,expected) {
  const before=tree(root);
  let acquisition=false;
  __testing.setHook(e=>{if(e.phase==='beforeOwnerWrite')acquisition=true;});
  try {assert.throws(()=>openLibrary(root,expected),e=>e.code==='CONFLICT');}
  finally {__testing.setHook(undefined);}
  assert.equal(acquisition,false);
  assert.deepEqual(tree(root),before);
}

test('expected root identity rejects a same-ID full clone before pending recovery',t=>{
  const f=fixture(t),expected=expectation(f.lib),p=pending(f.lib);
  const clone=path.join(f.parent,'clone');fs.cpSync(f.root,clone,{recursive:true});
  fs.renameSync(f.root,path.join(f.parent,'original'));fs.renameSync(clone,f.root);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.root,'内容库.json'))).libraryId,expected.expectedLibraryId);
  conflictWithoutRecovery(f.root,expected);
  assert.equal(fs.readFileSync(path.join(f.root,'内容',p.item.id,'正文.md'),'utf8'),'before');
});

test('expected library ID rejects a different library at the selected path before pending recovery',t=>{
  const f=fixture(t),expectedId=f.lib.info.libraryId;
  fs.renameSync(f.root,path.join(f.parent,'original'));
  const replacement=createLibrary(f.root);pending(replacement);
  conflictWithoutRecovery(f.root,{expectedLibraryId:expectedId,expectedRootIdentity:identity(f.root)});
});

test('expected identity opens and recovers; identity projection is deeply frozen and old API stays compatible',t=>{
  const f=fixture(t),expected=expectation(f.lib),p=pending(f.lib);
  const lib=openLibrary(f.root,expected);
  assert.equal(lib.readContent(p.item.id).body,'after');
  assert.equal(lib.queryMutation(p.mutationId).status,'committed');
  assert.deepEqual(lib.info.rootIdentity,expected.expectedRootIdentity);
  assert.equal(Object.isFrozen(lib.info),true);
  assert.equal(Object.isFrozen(lib.info.rootIdentity),true);
  assert.throws(()=>{lib.info.rootIdentity.ino='0';},TypeError);
  const descriptor=JSON.parse(fs.readFileSync(path.join(f.root,'内容库.json')));
  assert.equal(Object.hasOwn(descriptor,'rootIdentity'),false);
  assert.equal(openLibrary(f.root).readContent(p.item.id).body,'after');
});

test('root identity captured for opening cannot be refreshed by a same-ID replacement before recovery',t=>{
  const f=fixture(t),expected=expectation(f.lib),p=pending(f.lib);
  const clone=path.join(f.parent,'clone');fs.cpSync(f.root,clone,{recursive:true});
  const before=tree(clone);let swaps=0,acquisition=false;
  __testing.setHook(e=>{
    if(e.phase==='afterOpenValidation'){
      swaps++;fs.renameSync(f.root,path.join(f.parent,'original'));fs.renameSync(clone,f.root);
    }
    if(e.phase==='beforeOwnerWrite')acquisition=true;
  });
  try {assert.throws(()=>openLibrary(f.root,expected),e=>e.code==='CONFLICT');}
  finally {__testing.setHook(undefined);}
  assert.equal(swaps,1);assert.equal(acquisition,false);assert.deepEqual(tree(f.root),before);
  assert.equal(fs.readFileSync(path.join(f.root,'内容',p.item.id,'正文.md'),'utf8'),'before');
});

test('opening options require exact UUID and canonical nonnegative decimal strings',t=>{
  const f=fixture(t),good=expectation(f.lib),before=tree(f.root);
  const invalid=[null,[],{},'x',{...good,extra:true},{...good,[Symbol('extra')]:true},
    {expectedRootIdentity:good.expectedRootIdentity},{expectedLibraryId:good.expectedLibraryId},
    {...good,expectedLibraryId:'not-a-uuid'},
    {...good,expectedLibraryId:123},{...good,expectedLibraryId:good.expectedLibraryId+'\n'},
    ...[null,[],{}, {...good.expectedRootIdentity,extra:'0'},
      {ino:good.expectedRootIdentity.ino},{dev:good.expectedRootIdentity.dev},
      ...['-1','+1','01','1.0','1e3',' 1','1 ','1\n','0\n','1\r\n','1\u0000','','0x10',1,1n,undefined].map(dev=>({dev,ino:'0'})),
      ...['-1','01',1,undefined].map(ino=>({dev:'0',ino})),
    ].map(expectedRootIdentity=>({...good,expectedRootIdentity}))];
  for(const options of invalid)assert.throws(()=>openLibrary(f.root,options),e=>e.code==='INVALID_INPUT');
  assert.deepEqual(tree(f.root),before);
  assert.throws(()=>openLibrary(f.root,{...good,expectedRootIdentity:{dev:'0',ino:'0'}}),e=>e.code==='CONFLICT');
});

test('opening root identity preserves BigInt precision above the safe integer range',t=>{
  const f=fixture(t),original=fs.lstatSync,dev=9007199254740992n,ino=18446744073709551615n;
  fs.lstatSync=function(file,options){
    const actual=original.apply(this,arguments);
    return file===f.root&&options?.bigint ? {...actual,dev,ino} : actual;
  };
  try {
    const expected={expectedLibraryId:f.lib.info.libraryId,expectedRootIdentity:{dev:String(dev),ino:String(ino)}};
    const lib=openLibrary(f.root,expected);
    assert.deepEqual(lib.info.rootIdentity,expected.expectedRootIdentity);
    assert.throws(()=>openLibrary(f.root,{...expected,expectedRootIdentity:{...expected.expectedRootIdentity,dev:String(dev+1n)}}),e=>e.code==='CONFLICT');
    assert.throws(()=>openLibrary(f.root,{...expected,expectedRootIdentity:{...expected.expectedRootIdentity,ino:String(ino-1n)}}),e=>e.code==='CONFLICT');
  } finally {fs.lstatSync=original;}
});
