import fs from 'node:fs';
import path from 'node:path';
import {openLibrary} from '../../../plugin-src/src/lib/file-library/index.mjs';
import {readVaultSnapshot,readVaultDocument,saveVaultDocument,createVaultDocument,trashVaultDocument,vaultRootForRuntime,resolveVaultMutation} from '../../../plugin-src/src/lib/vault/index.mjs';
import {exact,libraryBinding,requireWrite,fail,uuid} from '../shared/validation.ts';
import {vaultDocumentId,vaultPending} from '../shared/vault-validation.ts';
import type {VaultWorkerOperations,VaultPending,VaultResolution} from '../shared/vault-contracts.ts';
import {isRecord} from '../shared/contracts.ts';
import type {LibraryBinding} from '../shared/contracts.ts';
export const isVaultOperation = (op:unknown):op is keyof VaultWorkerOperations => typeof op==='string'&&['vaultResolve','vaultRead','vaultDocument','vaultMutate','vaultLocation'].includes(op);
export function executeVault(op:keyof VaultWorkerOperations,args:unknown,mode:'required'|'disabled') {
 const fields=op==='vaultResolve'?['binding','mutationId']:op==='vaultRead'?['binding']:op==='vaultMutate'?['binding','pending']:op==='vaultDocument'?['binding','id']:null;
 if (!isRecord(args))fail('INVALID_INPUT','资料请求无效。');
 if (!(fields?exact(args,fields):exact(args,['binding'])||exact(args,['binding','id'])) || !libraryBinding(args.binding)||!path.isAbsolute(args.binding.root)||args.binding.root.includes('\0'))fail('INVALID_INPUT','资料操作拒绝额外、路径或无效字段。');
 const binding=args.binding as LibraryBinding;
 // Verify the exact current runtime binding before resolving any source Vault.
 openLibrary(binding.root,{expectedLibraryId:binding.libraryId,expectedRootIdentity:binding.rootIdentity});
 if(op==='vaultResolve'){requireWrite(mode);if(!uuid(args.mutationId))fail('INVALID_INPUT','资料恢复标识无效。');return resolveVaultMutation(binding.root,args.mutationId) as VaultResolution;}
 if(op==='vaultRead')return readVaultSnapshot(binding.root);
 if(op==='vaultMutate'){
  requireWrite(mode);
  if(!vaultPending(args.pending))fail('INVALID_INPUT','资料变更意图无效。');
  const pending=args.pending as VaultPending;
  if(pending.binding.libraryId!==binding.libraryId||pending.binding.rootIdentity.dev!==binding.rootIdentity.dev||pending.binding.rootIdentity.ino!==binding.rootIdentity.ino)fail('CONFLICT','资料变更绑定的知识库已改变。');
  const options={mutationId:pending.mutationId};
  if(pending.method==='saveVaultDocument')return saveVaultDocument(binding.root,pending.input,options);
  if(pending.method==='createVaultDocument')return createVaultDocument(binding.root,pending.input,options);
  return trashVaultDocument(binding.root,pending.input,options);
 }
 if(op==='vaultLocation'){
  const root=vaultRootForRuntime(binding.root)??binding.root;
  if(args.id===undefined)return root;
  if(!vaultDocumentId(args.id))fail('INVALID_INPUT','资料标识无效。');
  const document=readVaultSnapshot(binding.root)?.documents.find(item=>item.id===args.id);
  if(!document)fail('NOT_FOUND','资料不存在，请刷新知识库。');
  const location=path.resolve(root,document.relativePath),relative=path.relative(root,location);
  if(!relative||relative.startsWith(`..${path.sep}`)||relative==='..'||path.isAbsolute(relative))fail('UNSAFE_PATH','资料位置超出知识库。');
  let current=root;
  for(const part of relative.split(path.sep)){
   current=path.join(current,part);const stat=fs.lstatSync(current);
   if(stat.isSymbolicLink())fail('UNSAFE_PATH','资料位置不能经过符号链接。');
  }
  if(fs.realpathSync(location)!==location)fail('UNSAFE_PATH','资料位置已改变。');
  return location;
 }
 if(!vaultDocumentId(args.id))fail('INVALID_INPUT','资料标识无效。');
 return readVaultDocument(binding.root,args.id);
}
