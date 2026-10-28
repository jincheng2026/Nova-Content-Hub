import fs from 'node:fs';
import path from 'node:path';
import {safe,readBytes} from '../vault/core.mjs';
import {fail,object,hash} from './common.mjs';
const textKeys=['title','author','publishedAt','sourceText','description','shareUrl','sourceDescription'];
const sensitive=/(?:authorization|cookie|password|secret|token|api[-_]?key|headers)/i;
const credentialText=/(?:\bBearer\s+[A-Za-z0-9._~+/-]{8,}|\bsk-[A-Za-z0-9_-]{12,}|\b(?:api[_-]?key|access[_-]?token|authorization|cookie|password|secret)\s*[:=]\s*["']?[^\s,;"']{4,})/i;
export function canonicalIntakeUrl(value){try{const url=new URL(value);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return null;url.search='';url.hash='';return url.href.replace(/\/$/,'');}catch{return null;}}
function boundedJSON(value,depth=0){if(depth>6)fail('INVALID_INPUT');if(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return;if(typeof value==='string'){if(value.length>10000||credentialText.test(value))fail('INVALID_INPUT','页面数据含敏感凭据或超过上限。');return;}if(Array.isArray(value)){if(value.length>100)fail('INVALID_INPUT');for(const v of value)boundedJSON(v,depth+1);return;}if(!object(value)||Object.keys(value).length>100)fail('INVALID_INPUT');for(const [k,v] of Object.entries(value)){if(sensitive.test(k)||k.length>100)fail('INVALID_INPUT','不保存服务凭据或请求头。');boundedJSON(v,depth+1);}}
export function validateIntakeInput(input){
 if(!object(input)||Object.keys(input).some(k=>!['videoId','mediaId','platform','pageData',...textKeys].includes(k)))fail('INVALID_INPUT');
 const videoId=input.videoId??input.mediaId;if(typeof videoId!=='string'||!/^\d{1,32}$/.test(videoId)||input.videoId!==undefined&&input.mediaId!==undefined&&input.videoId!==input.mediaId||!['抖音','douyin'].includes(input.platform)||typeof input.title!=='string'||!input.title.trim())fail('INVALID_INPUT');
 for(const key of textKeys)if(input[key]!==undefined&&(typeof input[key]!=='string'||input[key].length>(['sourceText','description'].includes(key)?256*1024:key==='shareUrl'?4096:500)||credentialText.test(input[key])))fail('INVALID_INPUT','来源字段无效、超过上限或含凭据；原文未被静默改写。');
 if(input.shareUrl!==undefined&&!canonicalIntakeUrl(input.shareUrl))fail('INVALID_INPUT');
 if(input.pageData!==undefined){boundedJSON(input.pageData);if(Buffer.byteLength(JSON.stringify(input.pageData))>65536)fail('INVALID_INPUT');}
 return {...input,videoId,platform:'抖音'};
}
export function intakeSource(source,videoId){
 if(source===undefined)return undefined;
 if(!object(source)||source.videoId!==videoId||!['douyin','抖音'].includes(source.platform)||Object.keys(source).some(k=>!['videoId','platform','title','description','author','publishedAt'].includes(k))||typeof source.title!=='string'||!source.title.trim())fail('INVALID_MEDIA_GRANT','作品来源元数据未绑定已登记作品。');
 validateIntakeInput({...source,platform:'抖音'});return structuredClone(source);
}
export function intakeMetadata(input,media){
 const source=intakeSource(media.source,media.videoId);if(source){for(const key of ['title','author','publishedAt','description'])if(input[key]!==undefined&&source[key]!==undefined&&input[key]!==source[key])fail('INTAKE_SOURCE_MISMATCH','入库字段与已登记作品来源不一致。');}
 const data={...input,...source,videoId:media.videoId,platform:'抖音'};
 const name=data.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/[. ]+$/g,'_');
 if(Buffer.byteLength(`抖音_${name}_${data.videoId}`)>240)fail('INVALID_INPUT','标题超过跨平台目录长度上限，请保留原文并明确缩短展示标题。');
 return {...data,directory:`02_内容素材/未参考/抖音/抖音_${name}_${data.videoId}`,sourceProvenance:source?'registered-provider-metadata':'legacy-user-supplied'};
}
export function findIntakeDuplicates(root,{videoId,canonicalUrl,assetHash},exclude){
 const records=[];let count=0;
 const directories=relative=>{const target=safe(root,relative,true);if(!fs.existsSync(target))return[];const entries=fs.readdirSync(target,{withFileTypes:true});count+=entries.length;if(count>20000)fail('INVALID_INPUT','素材去重扫描超过上限。');return entries.filter(e=>!e.name.startsWith('.')&&!e.name.startsWith('_')&&e.isDirectory()&&!e.isSymbolicLink()).map(e=>`${relative}/${e.name}`);};
 for(const state of ['已参考','未参考'])for(const platform of directories(`02_内容素材/${state}`))for(const directory of directories(platform)){
  if(directory===exclude)continue;const note=`${directory}/笔记信息.md`;if(!fs.existsSync(safe(root,note,true)))continue;
  const text=readBytes(root,note).toString('utf8'),field=name=>text.match(new RegExp(`(?:^>\\s*${name}\\s*[：:]|\\|\\s*${name}\\s*\\|)\\s*([^|\\n]+)`,'im'))?.[1]?.trim();
  const recordedPlatform=field('平台')??path.posix.basename(platform),ids=[...text.matchAll(/(?:作品|笔记|视频)\s*ID\s*(?:\||[：:])\s*([A-Za-z0-9_-]+)/gi)].map(m=>m[1]);
  const urls=text.split(/\r?\n/).filter(l=>!/(?:达人|作者)链接\s*(?:\||[：:])/.test(l)).flatMap(l=>[...l.matchAll(/https?:\/\/[^\s<>\]]+/g)].map(m=>canonicalIntakeUrl(m[0].replace(/[|)>，。]+$/g,''))));
  const foundBy=[];if(['抖音','douyin'].includes(recordedPlatform)&&ids.includes(videoId))foundBy.push('work-id');if(urls.includes(canonicalIntakeUrl(canonicalUrl)))foundBy.push('canonical-url');if([...text.matchAll(/\b[a-fA-F0-9]{64}\b/g)].some(m=>m[0].toLowerCase()===assetHash))foundBy.push('media-sha256');
  if(foundBy.length)records.push({directory,foundBy});
 }
 const ordered=['work-id','canonical-url','media-sha256'];records.sort((a,b)=>ordered.indexOf(a.foundBy[0])-ordered.indexOf(b.foundBy[0])||a.directory.localeCompare(b.directory));return records;
}
const cell=value=>String(value??'未提供').replace(/\|/g,'\\|').replace(/\r?\n/g,'<br>');
export function intakeNote(data,media,corrected,extension,at){return `# ${data.title}\n\n> 入库日期：${at.slice(0,10)}\n> 平台：抖音\n> 作品 ID：${media.videoId}\n> 信息来源：${data.sourceDescription??(data.sourceProvenance==='registered-provider-metadata'?'已登记作品采集元数据与授权原片':'用户提供字段与授权原片；旧任务来源标题待核对')}\n\n## 基础信息\n\n| 字段 | 内容 |\n| --- | --- |\n| 平台 | 抖音 |\n| 作品ID | ${media.videoId} |\n| 作品链接 | ${media.canonicalUrl} |\n| 分享链接 | ${canonicalIntakeUrl(data.shareUrl??media.canonicalUrl)} |\n| 作者昵称 | ${cell(data.author)} |\n| 发布时间 | ${cell(data.publishedAt)} |\n| 作品描述 | ${cell(data.description)} |\n| 页面数据 | ${cell(data.pageData===undefined?undefined:typeof data.pageData==='string'?data.pageData:JSON.stringify(data.pageData))} |\n\n## 原始复制内容\n\n${data.sourceText??'未提供；已保存授权原片及可追溯作品来源。'}\n\n## 本地媒体\n\n- 视频：[[视频${extension}]]\n- SHA-256：${media.assetHash}\n- 媒体检测：原片 SHA-256、容器探测、视频与音频短解码、封面 PNG 截图均通过原生 PyAV 验证；证据：[[媒体校验.json]]；封面：[[封面.png]]。\n\n## 校正版逐字稿\n\n- 校正版文件：[[转写/校正版逐字稿/${media.videoId}.md]]\n- 时间码字幕：[[转写/校正版逐字稿/${media.videoId}.srt]]\n\n${corrected}\n`;}
export function intakeReport({id,videoId,directory,at,validation,status='published',dedup=[]}){return `\n<!-- intake:${id}:${videoId} -->\n### ${at} · ${videoId}\n\n- 正式目录：${directory}\n- 平台：抖音；作品 ID：${videoId}\n- 结果：${status==='duplicate'?'发现重复，停止新建；未合并或覆盖现有作品':'原片、封面、媒体证据、校正版与时间码字幕已通过严格验收并保存'}\n- 图片：${status==='duplicate'?0:1}；视频：${status==='duplicate'?0:1}；逐字稿：${status==='duplicate'?'未变更已有素材':'已校正并保留全文'}\n- 时间码字幕：${validation?.cues??'未检查'} 条；原样对上比例：${validation?.match_ratio??'未检查'}\n- 三层去重：${dedup.length?dedup.map(d=>`${d.directory} [${d.foundBy.join(', ')}]`).join('；'):'作品 ID、规范链接与媒体 SHA-256 均未命中'}\n- 暂存校正版与字幕验收：${validation?.ok?'通过':'待验收'}；中间证据：${status==='duplicate'?'保留暂存，不清理':'可恢复归档'}\n- 正式目录严格验收：${status==='duplicate'?'未改写已有目录，未重新验收已有素材':'通过；原片哈希、容器探测、真实音视频短解码、封面截图、字幕与校正版一致性已核验（PyAV 原生适配，详见媒体校验.json）。'}\n`;}
export const intakeContentHash=data=>hash(data);
