import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {createLibrary,openLibrary,__testing} from '../index.mjs';

process.env.NODE_ENV='test';
const system='系统（别动）';
const config=path.join('库配置','default','配置.json');
const directories=[system,path.join(system,'事务'),path.join(system,'事务','待恢复'),path.join(system,'事务','已提交'),'内容','提示词','我的照片','模板','资产',path.join('资产','sha256'),'库配置','合集',path.join('库配置','default')];
function fixture(t) {
  const parent=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'nova-create-identity-')),root=path.join(parent,'library');
  fs.mkdirSync(root);
  t.after(()=>{__testing.setHook(undefined);fs.rmSync(parent,{recursive:true,force:true});});
  return {parent,root};
}
function identity(root) {
  const stat=fs.lstatSync(root,{bigint:true});
  return {dev:String(stat.dev),ino:String(stat.ino)};
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
function conflict(fn) {assert.throws(fn,e=>e.code==='CONFLICT');}
function pending(lib) {
  const item=lib.createContent({title:'before',body:'before'}),mutationId=randomUUID();
  __testing.setHook(e=>{if(e.phase==='afterJournal')throw new Error('pending fixture');});
  try {assert.throws(()=>lib.updateContent(item.id,{body:'after'},item.editToken,{mutationId}),e=>e.pendingRecovery===true);}
  finally {__testing.setHook(undefined);}
  return {item,mutationId};
}

test('selected empty directory replaced before create is refused and stays empty',t=>{
  const f=fixture(t),expectedRootIdentity=identity(f.root);
  fs.renameSync(f.root,path.join(f.parent,'selected'));fs.mkdirSync(f.root);
  conflict(()=>createLibrary(f.root,{expectedRootIdentity}));
  assert.deepEqual(tree(f.root),[]);assert.deepEqual(tree(path.join(f.parent,'selected')),[]);
});

test('missing selected directory is never recreated; old API still creates missing roots',t=>{
  const f=fixture(t),expectedRootIdentity=identity(f.root);
  fs.rmdirSync(f.root);
  conflict(()=>createLibrary(f.root,{expectedRootIdentity}));assert.equal(fs.existsSync(f.root),false);
  const lib=createLibrary(f.root);
  assert.deepEqual(lib.info.rootIdentity,identity(f.root));assert.equal(lib.readLibrarySettings().id,'default');
  const moved=path.join(f.parent,'moved');fs.renameSync(f.root,moved);
  assert.equal(openLibrary(moved).info.libraryId,lib.info.libraryId);
});

test('creation options are exact canonical decimal identities and invalid options never create files',t=>{
  const f=fixture(t),expectedRootIdentity=identity(f.root),good={expectedRootIdentity};
  const invalid=[null,[],{},'x',{...good,extra:true},{...good,[Symbol('extra')]:true},{expectedLibraryId:randomUUID(),...good},
    ...[null,[],{}, {...expectedRootIdentity,extra:'0'}, {...expectedRootIdentity,[Symbol('extra')]:'0'},
      {ino:expectedRootIdentity.ino},{dev:expectedRootIdentity.dev},
      ...['-1','+1','01','1.0','1e3',' 1','1 ','1\n','0\n','1\r\n','1\u0000','','0x10',1,1n,undefined].map(dev=>({dev,ino:'0'})),
      ...['-1','01',1,undefined].map(ino=>({dev:'0',ino})),
    ].map(expectedRootIdentity=>({expectedRootIdentity}))];
  for(const options of invalid) {
    assert.throws(()=>createLibrary(f.root,options),e=>e.code==='INVALID_INPUT');
    assert.throws(()=>createLibrary(path.join(f.parent,'missing'),options),e=>e.code==='INVALID_INPUT');
  }
  assert.deepEqual(tree(f.root),[]);assert.equal(fs.existsSync(path.join(f.parent,'missing')),false);
  const lib=createLibrary(f.root,good);assert.deepEqual(lib.info.rootIdentity,expectedRootIdentity);
  assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(path.join(f.root,'内容库.json'))),'rootIdentity'),false);
});

test('empty-check to first mkdir replacement is refused with or without options',t=>{
  for(const useOptions of [false,true]) {
    const f=fixture(t),expectedRootIdentity=identity(f.root);let swapped=false;
    __testing.setHook(e=>{
      if(e.phase==='createAfterEmptyCheck') {swapped=true;fs.renameSync(f.root,path.join(f.parent,'selected'));fs.mkdirSync(f.root);}
    });
    conflict(()=>createLibrary(f.root,useOptions?{expectedRootIdentity}:undefined));
    __testing.setHook(undefined);assert.equal(swapped,true);assert.deepEqual(tree(f.root),[]);assert.deepEqual(tree(path.join(f.parent,'selected')),[]);
  }
});

for(const [phase,relatives] of [['createBeforeDirectory',directories],['createAfterDirectory',directories],['createBeforeFile',[config,'内容库.json']],['createAfterFile',[config,'内容库.json']]]) {
  for(const relative of relatives) test(`root replacement at ${phase}: ${relative} preserves both paths`,t=>{
    const f=fixture(t),selected=path.join(f.parent,'selected');let before,swapped=false;
    __testing.setHook(e=>{
      if(e.phase===phase && e.relative===relative) {
        swapped=true;fs.renameSync(f.root,selected);before=tree(selected);fs.mkdirSync(f.root);
      }
    });
    conflict(()=>createLibrary(f.root,{expectedRootIdentity:identity(f.root)}));
    assert.equal(swapped,true);assert.deepEqual(tree(f.root),[]);assert.deepEqual(tree(selected),before);
  });
}

for(const relative of directories) test(`created subdirectory replacement is refused: ${relative}`,t=>{
  const f=fixture(t);let swapped=false,before;
  __testing.setHook(e=>{
    if(e.phase==='createAfterDirectory' && e.relative===relative) {
      swapped=true;const target=path.join(f.root,relative);fs.renameSync(target,path.join(f.parent,'original-subdir'));fs.mkdirSync(target);before=tree(f.root);
    }
  });
  conflict(()=>createLibrary(f.root));
  assert.equal(swapped,true);assert.deepEqual(tree(f.root),before);assert.deepEqual(tree(path.join(f.parent,'original-subdir')),[]);
});

for(const [phase,file,relative] of [
  ['createBeforeFile',config,path.join('库配置','default')],
  ['createAfterFile',config,'库配置'],
  ['createBeforeFile','内容库.json',path.join(system,'事务')],
  ['createAfterFile','内容库.json',system],
]) test(`late subdirectory replacement at ${phase}: ${relative} stays untouched`,t=>{
  const f=fixture(t);let swapped=false,before;
  __testing.setHook(e=>{
    if(e.phase===phase && e.relative===file) {
      swapped=true;const target=path.join(f.root,relative);fs.renameSync(target,path.join(f.parent,'original-subdir'));fs.mkdirSync(target);before=tree(f.root);
    }
  });
  conflict(()=>createLibrary(f.root));assert.equal(swapped,true);assert.deepEqual(tree(f.root),before);
});

test('initial config uses exclusive creation and never accepts preexisting bytes',t=>{
  const f=fixture(t);let before;
  __testing.setHook(e=>{
    if(e.phase==='createBeforeFile' && e.relative===config) {fs.writeFileSync(path.join(f.root,config),'foreign config');before=tree(f.root);}
  });
  assert.throws(()=>createLibrary(f.root),e=>e.code==='IO_ERROR' && e.cause.code==='EEXIST');
  assert.deepEqual(tree(f.root),before);
});

for(const sameId of [false,true]) test(`descriptor publication replacement cannot lock or recover a ${sameId?'same-ID clone':'foreign pending library'}`,t=>{
  const f=fixture(t),replacement=path.join(f.parent,'replacement');
  let replacementLib,p,before,swapped=false,acquired=false;
  if(!sameId) {replacementLib=createLibrary(replacement);p=pending(replacementLib);}
  const monitor=e=>{
    if(e.phase==='beforeOwnerWrite')acquired=true;
    if(e.phase!=='createAfterFile' || e.relative!=='内容库.json' || swapped)return;
    swapped=true;
    if(sameId) {
      __testing.setHook(undefined);replacementLib=openLibrary(f.root);p=pending(replacementLib);
      fs.cpSync(f.root,replacement,{recursive:true});__testing.setHook(monitor);
    }
    before=tree(replacement);fs.renameSync(f.root,path.join(f.parent,'selected'));fs.renameSync(replacement,f.root);
  };
  __testing.setHook(monitor);
  conflict(()=>createLibrary(f.root));__testing.setHook(undefined);
  assert.equal(swapped,true);assert.equal(acquired,false);assert.deepEqual(tree(f.root),before);
  assert.equal(fs.existsSync(path.join(f.root,system,'库锁')),false);
  assert.equal(fs.readFileSync(path.join(f.root,'内容',p.item.id,'正文.md'),'utf8'),'before');
  assert.equal(fs.existsSync(path.join(f.root,system,'事务','待恢复',p.mutationId)),true);
});

test('descriptor ID changed inside the same root is rejected before lock acquisition',t=>{
  const f=fixture(t);let before,acquired=false;
  __testing.setHook(e=>{
    if(e.phase==='beforeOwnerWrite')acquired=true;
    if(e.phase==='createAfterFile' && e.relative==='内容库.json') {
      const target=path.join(f.root,'内容库.json'),descriptor=JSON.parse(fs.readFileSync(target));
      fs.writeFileSync(target,JSON.stringify({...descriptor,libraryId:randomUUID()}));before=tree(f.root);
    }
  });
  conflict(()=>createLibrary(f.root));assert.equal(acquired,false);assert.deepEqual(tree(f.root),before);
});

test('creation root identity preserves BigInt precision above the safe integer range',t=>{
  const f=fixture(t),original=fs.lstatSync,dev=9007199254740997n,ino=9007199254740999n;
  fs.lstatSync=function(target,options) {
    const value=original.call(this,target,options);
    if(path.resolve(target)===f.root && options?.bigint)return new Proxy(value,{get:(stat,key)=>key==='dev'?dev:key==='ino'?ino:Reflect.get(stat,key)});
    return value;
  };
  try {
    conflict(()=>createLibrary(f.root,{expectedRootIdentity:{dev:String(dev),ino:String(ino-1n)}}));assert.deepEqual(tree(f.root),[]);
    const expectedRootIdentity={dev:String(dev),ino:String(ino)},lib=createLibrary(f.root,{expectedRootIdentity});
    assert.deepEqual(lib.info.rootIdentity,expectedRootIdentity);
  } finally {fs.lstatSync=original;}
});
