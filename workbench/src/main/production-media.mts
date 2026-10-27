// Only broker-owned TikHub receipts may supply a URL to this downloader.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {publicEndpoint,publicAddress,ServiceToolError} from './service-tools.mts';
export const PRODUCTION_MEDIA_MAX_BYTES=64*1024*1024;
const types:Record<string,string>={'video/mp4':'.mp4','video/webm':'.webm','audio/mp4':'.m4a','audio/mpeg':'.mp3','audio/wav':'.wav','audio/x-wav':'.wav','audio/ogg':'.ogg','audio/flac':'.flac'};
export async function downloadProductionMedia(input:string):Promise<{directory:string;file:string}> {
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'nova-production-media-')),deadline=Date.now()+90000;
 try {
  await fs.chmod(directory,0o700);
  let next=input;
  for(let hop=0;hop<=3;hop++) {
   const target=await publicEndpoint(next,async(host,options)=>{const addresses=await lookup(host,options);if(addresses.some(entry=>!publicAddress(entry.address)))throw new ServiceToolError('UNSAFE_ENDPOINT');return addresses;});
   // publicEndpoint permits synthetic TUN addresses for fixed API providers; media never does.
   if(!publicAddress(target.address)||Date.now()>=deadline)throw new ServiceToolError('UNSAFE_ENDPOINT');
   const response=await new Promise<import('node:http').IncomingMessage>((resolve,reject)=>{
    const req=https.request(target.url,{method:'GET',headers:{'User-Agent':'Nova-Content-Hub','Accept-Encoding':'identity'},rejectUnauthorized:true,servername:target.url.hostname,family:target.family,lookup:(_host,_options,callback)=>callback(null,target.address,target.family),agent:false},resolve);
    const timer=setTimeout(()=>req.destroy(new ServiceToolError('NETWORK_TIMEOUT')),Math.max(1,deadline-Date.now()));
    req.once('error',()=>{clearTimeout(timer);reject(new ServiceToolError('MEDIA_DOWNLOAD_FAILED'));});
    req.once('response',res=>{res.once('close',()=>clearTimeout(timer));});req.end();
   });
   if([301,302,303,307,308].includes(response.statusCode??0)) {
    const location=response.headers.location;response.destroy();
    if(!location||hop===3)throw new ServiceToolError('MEDIA_REDIRECT_LIMIT');
    try{next=new URL(location,target.url).href;}catch{throw new ServiceToolError('UNSAFE_ENDPOINT');}continue;
   }
   const type=String(response.headers['content-type']??'').split(';')[0].trim().toLowerCase(),extension=types[type],length=response.headers['content-length'];
   if(response.statusCode!==200||!extension||(response.headers['content-encoding']&&response.headers['content-encoding']!=='identity')||(length!==undefined&&(!/^\d+$/.test(length)||Number(length)>PRODUCTION_MEDIA_MAX_BYTES))) {response.destroy();throw new ServiceToolError('INVALID_MEDIA');}
   const file=path.join(directory,`source${extension}`),handle=await fs.open(file,'wx',0o600);let size=0;
   try{for await(const chunk of response){const bytes=Buffer.from(chunk);size+=bytes.length;if(size>PRODUCTION_MEDIA_MAX_BYTES||Date.now()>=deadline) {response.destroy();throw new ServiceToolError('MEDIA_TOO_LARGE');}await handle.writeFile(bytes);}if(!size)throw new ServiceToolError('INVALID_MEDIA');}finally{await handle.close();response.destroy();}
   const header=Buffer.alloc(16),reader=await fs.open(file,'r');try{await reader.read(header,0,16,0);}finally{await reader.close();}
   const magic=extension==='.mp4'||extension==='.m4a'?header.toString('ascii',4,8)==='ftyp':extension==='.webm'?header.subarray(0,4).toString('hex')==='1a45dfa3':extension==='.mp3'?header.toString('ascii',0,3)==='ID3'||header[0]===0xff&&(header[1]&0xe0)===0xe0:extension==='.wav'?header.toString('ascii',0,4)==='RIFF'&&header.toString('ascii',8,12)==='WAVE':extension==='.ogg'?header.toString('ascii',0,4)==='OggS':header.toString('ascii',0,4)==='fLaC';
   if(!magic)throw new ServiceToolError('INVALID_MEDIA');
   return{directory,file};
  }
  throw new ServiceToolError('MEDIA_REDIRECT_LIMIT');
 }catch(error){await fs.rm(directory,{recursive:true,force:true});if(error instanceof ServiceToolError)throw error;throw new ServiceToolError('MEDIA_DOWNLOAD_FAILED');}
}
