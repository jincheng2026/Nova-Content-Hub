import fs from 'node:fs';
import path from 'node:path';
import {openLibrary} from '../../../plugin-src/src/lib/file-library/index.mjs';
import type {LibraryBinding} from '../shared/contracts.ts';

// Cache a handle, never document/asset data. Every method retains the core lock,
// recovery, current descriptor/root identity, and current-byte validation.
let current: {key: string; library: ReturnType<typeof openLibrary>} | undefined;
export function forgetBoundReader() { current = undefined; }
export function boundReader(binding: LibraryBinding) {
    const key = JSON.stringify([binding.root, binding.libraryId, binding.rootIdentity.dev, binding.rootIdentity.ino]);
    if (current?.key !== key) {
        current = undefined;
        current = {key, library: openLibrary(binding.root, {expectedLibraryId: binding.libraryId, expectedRootIdentity: binding.rootIdentity})};
    }
    return current.library;
}
/** A cached handle still runs a cheap guarded core read on each finite IPC. */
export function verifiedBoundReader(binding:LibraryBinding){const library=boundReader(binding);library.readLibrarySettings();return library;}

/** Verify only the selected directory and descriptor, without business recovery
 * or Vault projection. Location display must not open every source document. */
export function verifyBoundRoot(binding:LibraryBinding) {
    const reject=(code:string,message:string):never=>{throw Object.assign(new Error(message),{code});};
    const statPath=(filename:string)=>{
        const resolved=path.resolve(filename);let cursor=path.parse(resolved).root;
        for(const part of resolved.slice(cursor.length).split(path.sep).filter(Boolean)){
            cursor=path.join(cursor,part);
            if(fs.lstatSync(cursor).isSymbolicLink())reject('UNSAFE_PATH','内容库路径不能经过符号链接。');
        }
        return fs.lstatSync(resolved,{bigint:true});
    };
    const checkRoot=()=>{
        const stat=statPath(binding.root);
        if(!stat.isDirectory()||String(stat.dev)!==binding.rootIdentity.dev||String(stat.ino)!==binding.rootIdentity.ino)reject('CONFLICT','内容库目录身份已变化。');
    };
    checkRoot();
    const filename=path.join(binding.root,'内容库.json'),before=statPath(filename),limit=65_536;
    if(!before.isFile()||before.nlink!==1n||before.size>BigInt(limit))reject('CORRUPT','内容库描述文件无效。');
    const fd=fs.openSync(filename,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0)|(fs.constants.O_NONBLOCK??0));
    try {
        const opened=fs.fstatSync(fd,{bigint:true}),bytes=Buffer.alloc(limit+1);let length=0;
        for(;;){const read=fs.readSync(fd,bytes,length,bytes.length-length,null);length+=read;if(length>limit)reject('CORRUPT','内容库描述文件超过大小上限。');if(!read)break;}
        const finished=fs.fstatSync(fd,{bigint:true}),after=statPath(filename);
        if([opened,finished,after].some(stat=>stat.dev!==before.dev||stat.ino!==before.ino||stat.size!==before.size||stat.mtimeNs!==before.mtimeNs||stat.ctimeNs!==before.ctimeNs)||BigInt(length)!==before.size)reject('CONFLICT','内容库描述在读取时变化。');
        let value:unknown;try{value=JSON.parse(bytes.subarray(0,length).toString('utf8'));}catch{reject('CORRUPT','内容库描述不可读取。');}
        if(!value||typeof value!=='object'||!('format' in value)||value.format!=='nova-content-library'||!('schemaVersion' in value)||value.schemaVersion!==5)return reject('FORMAT_UNSUPPORTED','内容库格式不受支持。');
        let createdAtValid=false;try{createdAtValid='createdAt' in value&&typeof value.createdAt==='string'&&new Date(value.createdAt).toISOString()===value.createdAt;}catch{/* Invalid dates remain rejected below. */}
        if(!createdAtValid)reject('CORRUPT','内容库创建时间无效。');
        if(!('libraryId' in value)||value.libraryId!==binding.libraryId)reject('CONFLICT','内容库标识已变化。');
        for(const directory of ['内容','系统（别动）','系统（别动）/事务','系统（别动）/事务/待恢复','系统（别动）/事务/已提交','提示词','我的照片','模板','资产','资产/sha256','库配置','合集']){
            if(!statPath(path.join(binding.root,...directory.split('/'))).isDirectory())reject('UNSAFE_PATH','内容库目录结构已变化。');
        }
        checkRoot();
    } finally {fs.closeSync(fd);}
}
