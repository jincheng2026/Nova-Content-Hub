import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {rootPath,identity,safe,readBytes,digest,fail,mkdir,atomic,withVaultLock} from './core.mjs';
import {readSourceMap} from './source-map.mjs';

/** Paths are transcribed from the provided package's paths.mjs, never inferred from HOME. */
export const JINCHENG_SUPPLEMENT_SOURCES=Object.freeze({
    bookmarks:{role:'bookmarks',relativePath:'AIJinCheng/个人IP与内容/选题研究/X书签工作台',authority:'official'},
    accounts:{role:'benchmark-accounts',relativePath:'AIJinCheng/个人IP与内容/选题研究/对标账号',authority:'official'},
    reports:{role:'reports',relativePath:'AIJinCheng/个人IP与内容/调研报告库',authority:'official'},
    prompts:{role:'prompts',relativePath:'AIJinCheng/通用资源/工具与效率/提示词库',authority:'official'},
    visuals:{role:'visual-assets',relativePath:'Documents/ChatGPT/锦成VI/视觉评审网站',authority:'official'},
    archives:{role:'official-archives',relativePath:'AIJinCheng/个人IP与内容/内容数据统计/视频项目',authority:'official'},
    methods:{role:'methods',relativePath:'AIJinCheng/个人IP与内容/方法论沉淀',authority:'official'},
});
const MANIFEST='.workbench/jincheng-supplement-imports.json';
const EXTENSIONS=new Set(['.md','.markdown','.html','.htm','.txt','.json','.jsonl','.csv','.css','.js','.png','.jpg','.jpeg','.webp','.gif','.svg','.woff','.woff2']);
const excluded=name=>name.startsWith('.')||['node_modules','skills','必要备份','备份','backups','__pycache__'].includes(name);
function selectedDefinition(packageRoot,key){
    const definition=JINCHENG_SUPPLEMENT_SOURCES[key];if(!definition)fail('INVALID_INPUT','未授权的锦成补充来源角色');
    const relativePath=path.basename(packageRoot)==='AIJinCheng'&&definition.relativePath.startsWith('AIJinCheng/')?definition.relativePath.slice('AIJinCheng/'.length):definition.relativePath;
    return {...definition,key,relativePath};
}
export function planJinchengSupplement({packageRoot,selection}){
    packageRoot=rootPath(packageRoot);const packageIdentity=identity(packageRoot);
    if(!Array.isArray(selection)||!selection.length||new Set(selection).size!==selection.length)fail('INVALID_INPUT','必须显式选择唯一的补充来源');
    const sources=[],issues=[];let count=0,totalBytes=0;
    for(const key of selection){
        const definition=selectedDefinition(packageRoot,key),entries=[];
        const source={...definition,entries};sources.push(source);
        let sourceRoot;
        try{sourceRoot=safe(packageRoot,definition.relativePath);identity(sourceRoot);}catch(error){issues.push({key,relativePath:definition.relativePath,code:error.code??'SOURCE_NOT_AVAILABLE',message:'选定来源未取得或不可读取'});continue;}
        function walk(relative='',depth=0){
            if(depth>24)fail('INVALID_INPUT','导入目录层级超过24');
            for(const entry of fs.readdirSync(relative?safe(sourceRoot,relative):sourceRoot,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
                if(++count>20000)fail('INVALID_INPUT','导入文件数超过20000');if(excluded(entry.name)||/^(?:config|credentials|secrets|tokens?)\.json$/i.test(entry.name)){if(/^(?:config|credentials|secrets|tokens?)\.json$/i.test(entry.name))issues.push({key,relativePath:relative?`${relative}/${entry.name}`:entry.name,code:'CREDENTIALS_EXCLUDED',message:'运行时配置与凭据不随内容来源导入'});continue;}
                const rel=relative?`${relative}/${entry.name}`:entry.name;
                if(entry.isSymbolicLink()){issues.push({key,relativePath:rel,code:'SYMLINK_REJECTED',message:'未复制符号链接'});continue;}
                if(entry.isDirectory()){walk(rel,depth+1);continue;}
                if(!entry.isFile()||!EXTENSIONS.has(path.extname(entry.name).toLowerCase())){issues.push({key,relativePath:rel,code:'REFERENCE_ONLY',message:'原媒体/程序不搬运；保留上游来源引用'});continue;}
                try{const bytes=readBytes(sourceRoot,rel);totalBytes+=bytes.length;if(totalBytes>512*1024*1024)fail('INVALID_INPUT','补充导入总量超过512MiB');entries.push({relativePath:rel,hash:digest(bytes),bytes:bytes.length});}
                catch(error){if(error.message.includes('512MiB'))throw error;issues.push({key,relativePath:rel,code:error.code??'IO_ERROR',message:'文件超出8MiB或读取失败；未复制'});}
            }
        }
        walk();
    }
    if(JSON.stringify(identity(packageRoot))!==JSON.stringify(packageIdentity))fail('CONFLICT','同事包根在规划时变化');
    const plan={format:'nova-jincheng-supplement-plan',schemaVersion:1,packageRoot,packageIdentity,sources,totalBytes,issues};
    return {...plan,planHash:digest(JSON.stringify(plan))};
}
/** Copy into the explicitly selected delivery/acceptance vault. Never point this at an original vault. */
export function importJinchengSupplement({vaultRoot,packageRoot,selection,expectedPlanHash,expectedManifestHash,importId=randomUUID()}){
    vaultRoot=rootPath(vaultRoot);identity(vaultRoot);packageRoot=rootPath(packageRoot);
    if(vaultRoot===packageRoot||vaultRoot.startsWith(packageRoot+path.sep)||packageRoot.startsWith(vaultRoot+path.sep))fail('INVALID_INPUT','交付副本必须独立于只读来源包');
    if(!/^[a-zA-Z0-9_-]{1,80}$/.test(importId)||!/^[a-f0-9]{64}$/.test(expectedPlanHash??'')||!(expectedManifestHash===null||/^[a-f0-9]{64}$/.test(expectedManifestHash??'')))fail('INVALID_INPUT','导入需要规划hash和manifest CAS');
    const plan=planJinchengSupplement({packageRoot,selection});if(plan.planHash!==expectedPlanHash)fail('CONFLICT','来源相对规划已变化，未复制');
    if(plan.sources.some(s=>!s.entries.length))fail('SOURCE_NOT_AVAILABLE','某个选定来源没有可导入文件；请核对明确缺口');
    return withVaultLock(vaultRoot,()=>{
        const targetManifest=safe(vaultRoot,MANIFEST,true),oldBytes=fs.existsSync(targetManifest)?readBytes(vaultRoot,MANIFEST):null;
        if((oldBytes?digest(oldBytes):null)!==expectedManifestHash)fail('CONFLICT','补充导入manifest已变化');
        const sourceMapBytes=readBytes(vaultRoot,'.workbench/source-map.json'),sourceMap=readSourceMap(vaultRoot),manifest=oldBytes?JSON.parse(oldBytes):{format:'nova-jincheng-supplement-imports',schemaVersion:1,imports:[]};
        if(manifest.format!=='nova-jincheng-supplement-imports'||manifest.schemaVersion!==1||!Array.isArray(manifest.imports))fail('CORRUPT','补充导入manifest格式无效');
        if(manifest.imports.some(i=>i.id===importId))fail('CONFLICT','导入ID已存在，未覆盖');
        const destination=`08_原锦成来源/${importId}`;
        if(fs.existsSync(safe(vaultRoot,destination,true)))fail('CONFLICT','导入目标已存在，未覆盖');
        // Check every source again before creating a destination. wx copies never replace existing bytes.
        for(const source of plan.sources)for(const entry of source.entries)if(digest(readBytes(packageRoot,`${source.relativePath}/${entry.relativePath}`))!==entry.hash)fail('CONFLICT','来源在复制前变化');
        const record={id:importId,at:new Date().toISOString(),planHash:plan.planHash,sourceRoot:packageRoot,sourceIdentity:plan.packageIdentity,destination,status:'imported',templateFactsArePersonal:false,sources:[],issues:plan.issues};
        for(const source of plan.sources){
            const relativeRoot=`${destination}/${source.key}`,sourceId=`jincheng-${source.key}-${importId}`;
            for(const entry of source.entries){
                const relative=`${relativeRoot}/${entry.relativePath}`,bytes=readBytes(packageRoot,`${source.relativePath}/${entry.relativePath}`);
                if(digest(bytes)!==entry.hash)fail('CONFLICT','来源在复制时变化；保留未登记副本供核查');
                mkdir(vaultRoot,path.posix.dirname(relative));fs.writeFileSync(safe(vaultRoot,relative,true),bytes,{flag:'wx',mode:0o600});
                if(digest(readBytes(vaultRoot,relative))!==entry.hash)fail('CORRUPT','导入副本hash核验失败');
            }
            sourceMap.sources.push({id:sourceId,role:source.role,mode:'internal',root:relativeRoot,format:'files',authority:source.authority,writable:true,provenance:{importId,sourceRoot:source.relativePath,personalFacts:false}});
            record.sources.push({sourceId,key:source.key,originalRoot:source.relativePath,relativeRoot,entries:source.entries});
        }
        // Source-map and manifest use CAS; unfinished copies are never scanned as a registered source.
        const nextManifest={...manifest,imports:[...manifest.imports,record]};
        atomic(vaultRoot,'.workbench/source-map.json',Buffer.from(JSON.stringify(sourceMap,null,2)+'\n'),digest(sourceMapBytes));
        atomic(vaultRoot,MANIFEST,Buffer.from(JSON.stringify(nextManifest,null,2)+'\n'),expectedManifestHash);
        return {record,manifestHash:digest(readBytes(vaultRoot,MANIFEST)),sourceMapHash:digest(readBytes(vaultRoot,'.workbench/source-map.json'))};
    });
}
