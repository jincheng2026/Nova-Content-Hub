import {createScanBudget,enterScanDirectory,scanDirectoryEntries,consumeScanDocument} from './scan-budget.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {rootPath, identity, safe, isManagedAuthorPlanningPath, mkdir, json, writeJSON, fail, readBytes, digest, withVaultLock} from './core.mjs';
const FILE='.workbench/source-map.json';
const DEFAULTS=[
    ['accounts','benchmark-accounts','01_对标账号','official'],
    ['topics','topics','04_选题库','official'],['drafts','drafts','05_内容草稿','official'],
    ['materials','materials','02_内容素材','official'],['market-patterns','market-patterns','03_内容规律','candidate'],
    ['official-archives','official-archives','06_发布复盘/正式发布档案','official'],
    ['archive-analysis','archive-analysis','06_发布复盘/已发布视频档案','analysis-copy'],
    ['judgments','judgments','09_创作知识/判断库','official'],['methods','methods','09_创作知识/方法论','official'],
    ['author-evidence','author-evidence','09_创作知识/本人材料','official'],['cases','cases','09_创作知识/案例','candidate'],
    ['bookmarks','bookmarks','13_X收藏','official'],
    ['reports','reports','10_调研报告','official'],['prompts','prompts','11_提示词','official'],['visual-assets','visual-assets','12_视觉资产','official'],
];
function directory(root){root=rootPath(root);identity(root);return root;}
function validate(value){
    if(value?.format!=='nova-vault-source-map'||value.schemaVersion!==1||!Array.isArray(value.sources)||!Array.isArray(value.imports))fail('CORRUPT','来源映射格式无效');
    const seen=new Set();
    for(const s of value.sources){
        if(!s||!/^[a-zA-Z0-9_-]+$/.test(s.id??'')||seen.has(s.id)||!DEFAULTS.some(d=>d[1]===s.role)||!['internal','linked'].includes(s.mode)||!['official','analysis-copy','candidate'].includes(s.authority)||typeof s.root!=='string'||typeof s.writable!=='boolean')fail('CORRUPT','来源映射条目无效');
        if((s.role==='archive-analysis'&&s.authority!=='analysis-copy')||(s.role==='market-patterns'&&s.authority!=='candidate'))fail('INVALID_INPUT','市场候选与分析副本不能升级为正式事实');
        seen.add(s.id);
    }
    return value;
}
export function createDefaultSourceMap(root,{createDirectories=false}={}){
    root=directory(root);mkdir(root,'.workbench');
    if(fs.existsSync(safe(root,FILE,true)))return readSourceMap(root);
    // Keep legacy roles valid without provisioning excluded business in new maps.
    const defaults=DEFAULTS.filter(([,role])=>role!=='bookmarks');
    if(createDirectories)for(const [,,relative]of defaults)mkdir(root,relative);
    const value={format:'nova-vault-source-map',schemaVersion:1,sources:defaults.map(([id,role,relative,authority])=>({id,role,mode:'internal',root:relative,format:'files',authority,writable:authority!=='analysis-copy'})),imports:[]};
    writeJSON(root,FILE,value);return value;
}
export function readSourceMap(root){return validate(json(directory(root),FILE));}
export function resolveSource(root,sourceId){
    root=directory(root);const entry=readSourceMap(root).sources.find(s=>s.id===sourceId);
    if(!entry)fail('SOURCE_NOT_LINKED',`SOURCE_NOT_LINKED: ${sourceId}`);
    let resolved,available=true;
    if(entry.mode==='internal')resolved=safe(root,entry.root,true);
    else {
        if(!path.isAbsolute(entry.root))fail('CORRUPT','关联来源必须是绝对路径');
        resolved=path.resolve(entry.root);
        try{if(JSON.stringify(identity(resolved))!==JSON.stringify(entry.rootIdentity))fail('CONFLICT','已关联来源根身份变化，请重新选择');}catch(e){if(e.code==='ENOENT')available=false;else throw e;}
    }
    try{const st=fs.lstatSync(resolved);if(!st.isDirectory()||st.isSymbolicLink())fail('INVALID_INPUT','来源必须为真实目录');}catch(e){if(e.code==='ENOENT')available=false;else throw e;}
    return {...entry,root:resolved,available,writable:entry.writable&&available};
}
export function linkSource(root,input){
    root=directory(root);
    if(!input||!DEFAULTS.some(d=>d[1]===input.role)||!['official','analysis-copy','candidate'].includes(input.authority)||input.writable!==undefined&&typeof input.writable!=='boolean')fail('INVALID_INPUT','来源角色或权威类型无效');
    if(input.role==='archive-analysis'&&input.authority!=='analysis-copy')fail('INVALID_INPUT','分析副本不能作为正式档案');
    if(input.role==='market-patterns'&&input.authority!=='candidate')fail('INVALID_INPUT','市场候选不能作为本人判断');
    const selected=directory(input.selectedRoot);
    return withVaultLock(root,()=>{const map=readSourceMap(root),entry={id:`${input.role}-${randomUUID()}`,role:input.role,mode:'linked',root:selected,rootIdentity:identity(selected),format:'files',authority:input.authority,writable:input.writable??false};map.sources.push(entry);writeJSON(root,FILE,map);return resolveSource(root,entry.id);});
}
/** Register only the explicitly selected, hash-verified import plan. Body copying is a separate controlled transaction. */
export function importSource(root,{sourceId,selectedEntries,expectedHashes}){
    root=directory(root);
    if(!Array.isArray(selectedEntries)||!selectedEntries.length||!expectedHashes||typeof expectedHashes!=='object')fail('INVALID_INPUT','请选择明确导入文件及其hash');
    return withVaultLock(root,()=>{
        const source=resolveSource(root,sourceId),map=readSourceMap(root);
        const entries=selectedEntries.map(relativePath=>{const bytes=readBytes(source.root,relativePath),hash=digest(bytes);if(expectedHashes[relativePath]!==hash)fail('CONFLICT','导入来源已变化');return {relativePath,hash};});
        const record={id:randomUUID(),sourceId,sourceRoot:source.root,at:new Date().toISOString(),status:'registered',entries};map.imports.push(record);writeJSON(root,FILE,map);return record;
    });
}

/** Availability is distinct from desktop projection; linked roots are never silently scanned. */
export function readSourceInventory(root){
    const sources=[],issues=[];
    for(const entry of readSourceMap(root).sources){
        try{
            const resolved=resolveSource(root,entry.id);
            const paths=entry.role==='visual-assets'?['public/hub.html','public/index.html','public/cover-collection.html','public/face-expression-study/index.html']:entry.role==='bookmarks'?['X书签工作台.html']:[];
            const entries=paths.map(relativePath=>{let available=false;if(resolved.available)try{const st=fs.lstatSync(safe(resolved.root,relativePath));available=st.isFile()&&!st.isSymbolicLink()&&st.nlink===1;}catch{}return {relativePath,available};});
            sources.push({...resolved,...(paths.length?{entryPath:paths[0],entryReady:entries[0].available,entries}:{}),projection:entry.mode==='internal'?'vault-scan':'bound-source'});
            if(!resolved.available)issues.push({sourceId:entry.id,code:'SOURCE_NOT_AVAILABLE',message:entry.role+' 来源尚未提供：'+resolved.root});
        }
        catch(e){sources.push({...entry,available:false,writable:false,projection:'not-loaded'});issues.push({sourceId:entry.id,code:e.code??'IO_ERROR',message:e.message});}
    }
    return {sources,issues};
}

const SOURCE_EXTENSIONS = new Set(['.md','.markdown','.txt','.html','.htm','.json','.jsonl','.csv','.css','.js','.png','.jpg','.jpeg','.webp','.gif','.svg','.woff','.woff2']);
function managedAuthorSource(root,source,relative){
 const prefix=path.relative(rootPath(root),source.root).split(path.sep).join('/');
 return !path.isAbsolute(prefix)&&prefix!=='..'&&!prefix.startsWith('../')&&isManagedAuthorPlanningPath(prefix?path.posix.join(prefix,relative):relative);
}
/** Only a previously selected source root is traversed. No HOME or parent-directory inference. */
export function readBoundSourceCatalog(root,{sourceId,maxFiles=20000}={}) {
    if(!Number.isInteger(maxFiles)||maxFiles<1||maxFiles>20000)fail('INVALID_INPUT','来源文件数量上限无效');
    const source=resolveSource(root,sourceId),files=[],issues=[];
    if(!source.available)return {source,files,issues:[{sourceId,code:'SOURCE_NOT_AVAILABLE',message:'已绑定来源暂不可用，不代表空数据'}]};
    const beforeIdentity=identity(source.root),budget=createScanBudget({documents:maxFiles});
    function walk(relative='',depth=0){
        enterScanDirectory(budget,depth);
        const dir=relative?safe(source.root,relative):source.root;
        for(const entry of scanDirectoryEntries(dir,budget)){
            if(entry.name.startsWith('.')||['node_modules','skills','必要备份','备份','backups'].includes(entry.name))continue;
            const relativePath=relative?`${relative}/${entry.name}`:entry.name;
            if(managedAuthorSource(root,source,relativePath))continue;
            if(entry.isSymbolicLink()){issues.push({sourceId,relativePath,code:'SYMLINK_REJECTED',message:'来源符号链接不予读取'});continue;}
            if(entry.isDirectory()){walk(relativePath,depth+1);continue;}
            if(!entry.isFile()||!SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))continue;
            if(/\.(?:md|markdown|txt|html?|json)$/i.test(entry.name))consumeScanDocument(budget);
            const stat=fs.lstatSync(safe(source.root,relativePath));
            if(stat.nlink!==1||stat.size>8*1024*1024){issues.push({sourceId,relativePath,code:'SOURCE_FILE_UNAVAILABLE',message:'文件超过8MiB或存在硬链接，仅保留来源引用'});continue;}
            files.push({sourceId,relativePath,bytes:stat.size,modifiedAt:stat.mtime.toISOString()});
        }
    }
    try{walk();}catch(e){if(e.code==='INDEX_BUDGET_EXCEEDED')throw e;issues.push({sourceId,code:e.code??'IO_ERROR',message:e.message});}
    if(JSON.stringify(identity(source.root))!==JSON.stringify(beforeIdentity))fail('CONFLICT','来源根在读取时变化');
    return {source,files,issues};
}
export function readBoundSourceFile(root,{sourceId,relativePath,expectedHash}={}) {
    const source=resolveSource(root,sourceId);
    if(!source.available)fail('SOURCE_NOT_AVAILABLE','已绑定来源暂不可用');
    if(managedAuthorSource(root,source,relativePath))fail('INVALID_INPUT','作者安排受管记录不属于普通来源文件读取');
    if(!SOURCE_EXTENSIONS.has(path.extname(relativePath??'').toLowerCase()))fail('INVALID_INPUT','来源文件扩展名不允许读取');
    if(expectedHash!==undefined&&!/^[a-f0-9]{64}$/.test(expectedHash))fail('INVALID_INPUT','来源hash无效');
    const before=identity(source.root),data=readBytes(source.root,relativePath),hash=digest(data);
    if(JSON.stringify(identity(source.root))!==JSON.stringify(before))fail('CONFLICT','来源根在读取时变化');
    if(expectedHash!==undefined&&expectedHash!==hash)fail('CONFLICT','来源文件已变化');
    return {sourceId,relativePath,hash,bytes:data.length,data};
}
