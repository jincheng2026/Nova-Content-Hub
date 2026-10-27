import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {vaultRootForRuntime,readVaultTaskContext} from '../vault/index.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
const HASH=/^[a-f0-9]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const rel=(root,file)=>path.relative(root,file).split(path.sep).join('/');
const link=value=>value.split('/').map(encodeURIComponent).join('/');

function checked(root,target,create=false){
    const relative=path.relative(root,target);
    if(relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative))fail('UNSAFE_PATH','产物位置超出当前知识库。');
    let cursor=root;
    for(const part of [null,...relative.split(path.sep).filter(Boolean)]){
        if(part)cursor=path.join(cursor,part);
        if(create&&!fs.existsSync(cursor))fs.mkdirSync(cursor,{mode:0o700});
        const stat=fs.lstatSync(cursor);
        if(stat.isSymbolicLink()||!stat.isDirectory())fail('UNSAFE_PATH','产物路径包含链接或非目录。');
    }
    return target;
}
function read(file,limit=4*1024*1024){
    const before=fs.lstatSync(file);
    if(before.isSymbolicLink()||!before.isFile()||before.size>limit)fail('UNSAFE_PATH','产物文件无效或超过限制。');
    const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    try{
        const opened=fs.fstatSync(fd);
        if(opened.ino!==before.ino||opened.dev!==before.dev||opened.size>limit)fail('CONFLICT','产物文件读取时发生变化。');
        const bytes=fs.readFileSync(fd),after=fs.fstatSync(fd);
        if(bytes.length>limit||after.size!==opened.size||after.mtimeMs!==opened.mtimeMs||after.ctimeMs!==opened.ctimeMs)fail('CONFLICT','产物文件读取时发生变化。');
        return bytes;
    }finally{fs.closeSync(fd);}
}

/** Publish a readable, receipted candidate beside the content. Runtime data stays a projection. */
export function publishVaultProductionArchive({root,task,attempt,archive}){
    const vaultRoot=vaultRootForRuntime(root);
    if(!vaultRoot)return archive;
    const context=readVaultTaskContext(root,task.contentId);
    let base;
    if(task.contentId){
        const directory=context?.contentDirectory;
        if(typeof directory!=='string'||!directory||path.isAbsolute(directory)||directory.split(/[\\/]/).includes('..'))fail('ARCHIVE_NOT_READY','当前内容目录尚未正确关联，任务回执已保留。');
        base=path.join(vaultRoot,directory,'助手产物');
    }else if(task.request.parameters?.workflow==='positioning-interview')base=path.join(vaultRoot,'00_个人背景','访谈记录');
    else if(task.kind==='research'||task.accountId)base=path.join(vaultRoot,'02_内容素材','调研报告',`R_${task.id}`,'助手产物');
    else base=path.join(vaultRoot,'03_内容规律','助手产物');
    checked(vaultRoot,base,true);
    const sourceManifest=JSON.parse(read(path.join(archive.directory,'manifest.json')).toString('utf8'));
    const outputs={};
    for(const file of sourceManifest.files){
        if(!['结果.md','结果.json'].includes(file.name))continue;
        const bytes=read(path.join(archive.directory,file.name));
        if(digest(bytes)!==file.sha256)fail('CORRUPT','任务产物与原提交清单不一致。');
        outputs[file.name]=bytes;
    }
    if(!outputs['结果.md']||!outputs['结果.json'])fail('CORRUPT','任务产物缺少结果正文或回执数据。');
    const sourceFacts=JSON.parse(outputs['结果.json'].toString('utf8'));
    if(sourceFacts.taskId!==task.id||sourceFacts.attemptId!==attempt.id||sourceFacts.receiptHash!==archive.receiptHash)fail('CORRUPT','任务产物归属不一致。');
    const generation=sourceManifest.generation;
    if(!HASH.test(generation))fail('CORRUPT','任务产物版本无效。');
    const parent=path.join(base,task.id,attempt.id),home=path.join(parent,generation);
    checked(vaultRoot,parent,true);
    let markdown=outputs['结果.md'].toString('utf8');
    const assets=(sourceManifest.assets??[]).map(asset=>{
        if(!HASH.test(asset.assetHash))fail('CORRUPT','产物资产标识无效。');
        const sourcePath=path.join(root,'资产','sha256',asset.assetHash.slice(0,2),asset.assetHash);
        const relativePath=rel(home,sourcePath);
        markdown=markdown.split(link(asset.relativePath)).join(link(relativePath));
        return {...asset,relativePath};
    });
    outputs['结果.md']=Buffer.from(markdown);
    const manifest={format:'nova-vault-production-archive-manifest',schemaVersion:1,taskId:task.id,attemptId:attempt.id,contentId:task.contentId,receiptHash:archive.receiptHash,generation,files:Object.entries(outputs).map(([name,bytes])=>({name,sha256:digest(bytes),bytes:bytes.length})),assets};
    outputs['manifest.json']=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
    if(fs.existsSync(home)){
        checked(vaultRoot,home);
        if(JSON.stringify(fs.readdirSync(home).sort())!==JSON.stringify(Object.keys(outputs).sort())||Object.entries(outputs).some(([name,bytes])=>!read(path.join(home,name)).equals(bytes)))return {...archive,directory:home,ready:false,warnings:[...archive.warnings,'内容目录中的产物有人工修改，已保留，请先另存整理结果。']};
    }else{
        const stage=path.join(parent,`.archive-${randomUUID()}`);fs.mkdirSync(stage,{mode:0o700});
        try{
            for(const [name,bytes]of Object.entries(outputs)){
                const fd=fs.openSync(path.join(stage,name),fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
                try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
            }
            checked(vaultRoot,parent);vaultRootForRuntime(root);
            if(fs.existsSync(home))fail('CONFLICT','产物目录已出现，请核实同一任务。');
            fs.renameSync(stage,home);
            if(process.platform!=='win32'){const fd=fs.openSync(parent,fs.constants.O_RDONLY);try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
        }catch(error){
            try{for(const name of Object.keys(outputs)){const file=path.join(stage,name);const stat=fs.lstatSync(file);if(stat.isFile()&&!stat.isSymbolicLink())fs.unlinkSync(file);}fs.rmdirSync(stage);}catch{}
            throw error;
        }
    }
    return {...archive,directory:home};
}

/** Used again by Electron immediately before revealing the worker-derived directory. */
export function verifyVaultProductionArchive(binding,archive){
    const root=fs.lstatSync(binding.root,{bigint:true});
    if(root.isSymbolicLink()||!root.isDirectory()||String(root.dev)!==binding.rootIdentity.dev||String(root.ino)!==binding.rootIdentity.ino)fail('CONFLICT','内容库绑定已变化。');
    const vaultRoot=vaultRootForRuntime(binding.root);
    if(!vaultRoot)return null;
    if(!archive.ready)fail('ARCHIVE_NOT_READY',archive.warnings.join('；')||'任务产物尚待核验。');
    const parts=path.relative(vaultRoot,archive.directory).split(path.sep);
    if(!['00_个人背景','02_内容素材','03_内容规律','05_内容草稿'].includes(parts[0])||parts.length<4||parts.at(-3)!==archive.taskId||parts.at(-2)!==archive.attemptId||!UUID.test(archive.taskId)||!UUID.test(archive.attemptId)||!HASH.test(parts.at(-1)))fail('UNSAFE_PATH','产物目录与本知识库的任务不一致。');
    checked(vaultRoot,archive.directory);
    const manifest=JSON.parse(read(path.join(archive.directory,'manifest.json')).toString('utf8'));
    if(manifest.format!=='nova-vault-production-archive-manifest'||manifest.schemaVersion!==1||manifest.taskId!==archive.taskId||manifest.attemptId!==archive.attemptId||manifest.receiptHash!==archive.receiptHash||manifest.generation!==parts.at(-1))fail('CORRUPT','知识库产物清单归属不一致。');
    if(!Array.isArray(manifest.files)||manifest.files.length!==2||new Set(manifest.files.map(file=>file.name)).size!==2)fail('CORRUPT','知识库产物清单不完整。');
    for(const file of manifest.files??[]){if(!['结果.md','结果.json'].includes(file.name)||digest(read(path.join(archive.directory,file.name)))!==file.sha256)fail('CORRUPT','知识库产物与清单不一致。');}
    return archive.directory;
}
