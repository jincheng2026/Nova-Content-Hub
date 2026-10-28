import fs from 'node:fs';
import {safe} from '../vault/core.mjs';
import {fail,object,hash} from './common.mjs';
const reject=()=>fail('INTAKE_MEDIA_INVALID_PROOF','真实媒体证据、原片或封面不一致；保留暂存等待补验。');
const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const positive=(v,max)=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=max;
const integer=(v,max)=>Number.isInteger(v)&&positive(v,max);
const index=v=>Number.isInteger(v)&&v>=0&&v<256;
const codec=v=>typeof v==='string'&&/^[a-zA-Z0-9_.-]{1,64}$/.test(v);
const checks={header:'passed',sha256:'passed',containerProbe:'passed',videoDecode:'passed',audioDecode:'passed',coverScreenshot:'passed'};
const adaptation={file:'native-header-and-sha256',ffprobe:'pyav-container-and-stream-probe',ffmpegDecode:'pyav-short-video-and-audio-decode',screenshot:'pyav-decoded-frame-to-png'};
/** Consume only the trusted native readMedia hook's proof. No assistant input can supply it. */
export function validateIntakeProof(proof,bytes,coverBytes,extension,expectedHash){
 if(!exact(proof,['version','engine','decoder','pyavVersion','originalSha256','bytes','extension','container','video','audio','cover','checks','toolAdaptation'])||proof.version!==1||proof.engine!=='pyav'||!['bundled-pyav','external-pyav'].includes(proof.decoder)||typeof proof.pyavVersion!=='string'||!/^\d[\w.+-]{0,63}$/.test(proof.pyavVersion)||proof.originalSha256!==expectedHash||proof.originalSha256!==hash(bytes)||proof.bytes!==bytes.length||proof.extension!==extension||!['.mp4','.webm'].includes(extension))reject();
 if(!bytes.length||bytes.length>67108864||(extension==='.mp4'?bytes.length<16||bytes.toString('ascii',4,8)!=='ftyp':bytes.subarray(0,4).toString('hex')!=='1a45dfa3'))reject();
 const {container,video,audio,cover}=proof;
 if(!exact(container,['format','durationSeconds'])||typeof container.format!=='string'||container.format.length>128||!container.format.split(',').includes(extension==='.mp4'?'mov':'matroska')||!positive(container.durationSeconds,7200))reject();
 if(!exact(video,['streamIndex','codec','width','height','decodedFrames'])||!index(video.streamIndex)||!codec(video.codec)||!integer(video.width,8192)||!integer(video.height,8192)||video.width*video.height>33554432||video.decodedFrames!==1)reject();
 if(!exact(audio,['streamIndex','codec','sampleRate','channels','decodedSamples'])||!index(audio.streamIndex)||audio.streamIndex===video.streamIndex||!codec(audio.codec)||!integer(audio.sampleRate,384000)||!integer(audio.channels,32)||!integer(audio.decodedSamples,10000000))reject();
 if(!exact(cover,['sha256','mediaType','width','height','bytes','captureTimestampSeconds'])||cover.mediaType!=='image/png'||!integer(cover.width,640)||!integer(cover.height,640)||!integer(cover.bytes,2097152)||typeof cover.captureTimestampSeconds!=='number'||!Number.isFinite(cover.captureTimestampSeconds)||Math.abs(cover.captureTimestampSeconds)>7200||!(coverBytes instanceof Uint8Array))reject();
 const png=Buffer.from(coverBytes);if(png.length!==cover.bytes||png.length<33||png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||png.toString('ascii',12,16)!=='IHDR'||png.readUInt32BE(16)!==cover.width||png.readUInt32BE(20)!==cover.height||hash(png)!==cover.sha256)reject();
 for(const [name,wanted] of [['checks',checks],['toolAdaptation',adaptation]])if(!exact(proof[name],Object.keys(wanted))||Object.entries(wanted).some(([key,value])=>proof[name][key]!==value))reject();
 return structuredClone(proof);
}
/** File identity, link count and bounded bytes are checked again on every publication/replay. */
export function readIntakeFile(root,relative,limit=67108864){
 const target=safe(root,relative),st=fs.lstatSync(target);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size>limit)fail('INVALID_INPUT','验收文件类型、大小或链接无效。');
 const fd=fs.openSync(target,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));try{const opened=fs.fstatSync(fd);if(opened.dev!==st.dev||opened.ino!==st.ino||opened.size>limit)fail('CONFLICT');const bytes=fs.readFileSync(fd);if(bytes.length!==st.size||bytes.length>limit)fail('CONFLICT');return bytes;}finally{fs.closeSync(fd);}
}
export function verifyIntakeReceipt(root,receipt){
 if(receipt.fileHashes){for(const [relative,expected] of Object.entries(receipt.fileHashes)){if(hash(readIntakeFile(root,relative))!==expected)fail('CONFLICT','正式素材已变化，不能返回旧成功回执。');}}
 else { // Historical receipts are readable, but can never be promoted to strict success.
  if(!receipt.originalPath||hash(readIntakeFile(root,receipt.originalPath))!==receipt.source_sha256)fail('CONFLICT','历史原片已变化。');
  for(const relative of [receipt.transcriptPath,receipt.subtitlePath,receipt.notePath])if(relative)readIntakeFile(root,relative);
 }
 if(receipt.strictValidation?.ok){if(!receipt.mediaValidationPath||!receipt.coverPath||!receipt.fileHashes)fail('CONFLICT');const proof=JSON.parse(readIntakeFile(root,receipt.mediaValidationPath,262144));validateIntakeProof(proof,readIntakeFile(root,receipt.originalPath),readIntakeFile(root,receipt.coverPath,2097152),proof.extension,receipt.source_sha256);}
}
