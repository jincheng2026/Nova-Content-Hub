import {verifyVaultProductionArchive} from '../../../plugin-src/src/lib/file-library/production-vault-archive.mjs';
import {PRODUCTION_ARCHIVE_CATEGORIES} from '../../../plugin-src/src/lib/file-library/production-archive-category.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {LibraryBinding} from '../shared/contracts.ts';
import type {ProductionArchive} from '../../../plugin-src/src/lib/file-library/production.d.ts';
import {fail,uuid} from '../shared/validation.ts';
/** Validate the worker-derived directory again immediately before handing it to the OS. */
export async function productionArchiveDirectory(binding:LibraryBinding,archive:ProductionArchive):Promise<string>{
 if(!archive.ready)fail('ARCHIVE_NOT_READY',archive.warnings.join('；')||'任务回执已保存，归档目录尚待修复。');
 const vaultDirectory=verifyVaultProductionArchive(binding,archive);
 if(vaultDirectory!==null)return vaultDirectory;
 const parts=path.relative(binding.root,archive.directory).split(path.sep);
 if(parts.length!==6||parts[0]!=='知识库'||parts[1]!=='助手产物'||parts[2]!==archive.category||!PRODUCTION_ARCHIVE_CATEGORIES.includes(archive.category)||parts[3]!==archive.taskId||parts[4]!==archive.attemptId||!uuid(parts[3])||!uuid(parts[4])||!/^[a-f0-9]{64}$/.test(parts[5])||path.resolve(binding.root,...parts)!==archive.directory)fail('UNSAFE_PATH','归档位置与当前任务不一致。');
 const root=await fs.lstat(binding.root,{bigint:true});
 if(root.isSymbolicLink()||!root.isDirectory()||String(root.dev)!==binding.rootIdentity.dev||String(root.ino)!==binding.rootIdentity.ino||await fs.realpath(binding.root)!==binding.root)fail('CONFLICT','内容库位置已改变，请重新打开内容库。');
 let current=binding.root;
 for(const part of parts){current=path.join(current,part);const stat=await fs.lstat(current);if(stat.isSymbolicLink()||!stat.isDirectory())fail('UNSAFE_PATH','归档路径含符号链接或非目录。');}
 return current;
}
