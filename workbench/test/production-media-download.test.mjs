import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import dns from 'node:dns/promises';
import {syncBuiltinESMExports} from 'node:module';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {downloadProductionMedia,PRODUCTION_MEDIA_MAX_BYTES} from '../src/main/production-media.mts';
const publicIp={address:'93.184.216.34',family:4},wav=Buffer.alloc(44);wav.write('RIFF');wav.write('WAVE',8);
const directories=async()=>new Set((await fs.readdir(os.tmpdir())).filter(n=>n.startsWith('nova-production-media-')));
async function transport(t,{responses=[{}],resolve=()=>[publicIp]}={}){
 const before=await directories(),requests=[],lookups=[],originalLookup=dns.lookup,originalRequest=https.request;
 dns.lookup=async(host,options)=>{lookups.push({host,options});return resolve(host,options);};
 https.request=(url,options,callback)=>{
  const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{
   const row=responses[requests.length-1]??{},response=Readable.from(row.chunks??[wav]);response.statusCode=row.status??200;response.headers={'content-type':'audio/wav',...row.headers};
   req.response=response;callback(response);req.emit('response',response);
  });req.destroy=error=>{req.response?.destroy(error);if(error)req.emit('error',error);return req;};requests.push({url:String(url),options});return req;
 };
 syncBuiltinESMExports();
 t.after(async()=>{dns.lookup=originalLookup;https.request=originalRequest;syncBuiltinESMExports();const after=await directories();for(const directory of after)if(!before.has(directory)){await fs.rm(path.join(os.tmpdir(),directory),{recursive:true,force:true});assert.fail(`Media temp directory was not cleaned: ${directory}`);}});
 return{requests,lookups};
}
test('media pins public DNS at each HTTPS hop without cookies, auth or redirect forwarding',async t=>{
 const f=await transport(t,{responses:[{status:302,headers:{location:'https://cdn-two.example.invalid/clip'}},{}]});
 const output=await downloadProductionMedia('https://cdn-one.example.invalid/video');
 try{
  assert.equal(f.lookups.length,2);assert.equal(f.requests.length,2);assert.deepEqual(f.lookups.map(r=>r.options),[{all:true,verbatim:true},{all:true,verbatim:true}]);
  for(const request of f.requests){const options=request.options;assert.equal(options.agent,false);assert.equal(options.rejectUnauthorized,true);assert.equal(options.family,4);assert.equal(options.servername,new URL(request.url).hostname);assert.deepEqual(options.headers,{'User-Agent':'Nova-Content-Hub','Accept-Encoding':'identity'});options.lookup('unused',{},(error,address,family)=>{assert.equal(error,null);assert.equal(address,publicIp.address);assert.equal(family,4);});}
  assert.deepEqual(await fs.readFile(output.file),wav);if(process.platform!=='win32'){assert.equal((await fs.stat(output.directory)).mode&0o777,0o700);assert.equal((await fs.stat(output.file)).mode&0o777,0o600);}
 }finally{await fs.rm(output.directory,{recursive:true,force:true});}
});
for(const host of ['cdn-private.example.invalid','api.tikhub.io'])test(`media refuses mixed public/private or synthetic DNS for ${host}`,async t=>{
 const f=await transport(t,{resolve:()=>[publicIp,{address:host==='api.tikhub.io'?'198.18.0.1':'127.0.0.1',family:4}]});
 await assert.rejects(downloadProductionMedia(`https://${host}/video`));assert.equal(f.requests.length,0);
});
test('media revalidates redirect DNS and refuses private destinations before connecting',async t=>{
 const f=await transport(t,{responses:[{status:302,headers:{location:'https://private.example.invalid/video'}}],resolve:host=>host.startsWith('private.')?[{address:'10.0.0.1',family:4}]:[publicIp]});
 await assert.rejects(downloadProductionMedia('https://public.example.invalid/video'));assert.equal(f.requests.length,1);assert.equal(f.lookups.length,2);
});
for(const url of ['http://example.invalid/video','https://example.invalid:444/video','https://user:secret@example.invalid/video'])test(`media refuses unsafe endpoint ${url.replace('user:secret@','credentials@')}`,async t=>{
 const f=await transport(t);await assert.rejects(downloadProductionMedia(url),{code:'UNSAFE_ENDPOINT'});assert.equal(f.requests.length,0);
});
test('media allows at most three redirects and cleans every failed download directory',async t=>{
 const rows=Array.from({length:4},(_,i)=>({status:302,headers:{location:`https://cdn-${i}.example.invalid/next`}})),f=await transport(t,{responses:rows});
 await assert.rejects(downloadProductionMedia('https://origin.example.invalid/video'),{code:'MEDIA_REDIRECT_LIMIT'});assert.equal(f.requests.length,4);
});
for(const [name,row]of [
 ['HTML',{headers:{'content-type':'text/html'},chunks:[Buffer.from('<html>private</html>')]}],
 ['HLS',{headers:{'content-type':'application/vnd.apple.mpegurl'},chunks:[Buffer.from('#EXTM3U')]}],
 ['unknown MIME',{headers:{'content-type':'application/octet-stream'}}],
 ['compressed body',{headers:{'content-encoding':'gzip'}}],
 ['forged media magic',{headers:{'content-type':'video/mp4'},chunks:[Buffer.from('<html>disguised as video</html>')]}],
 ['oversized Content-Length',{headers:{'content-length':String(PRODUCTION_MEDIA_MAX_BYTES+1)}}],
 ['invalid Content-Length',{headers:{'content-length':'many'}}],
 ['empty body',{chunks:[]}]
])test(`media rejects ${name} and removes its private temp files`,async t=>{await transport(t,{responses:[row]});await assert.rejects(downloadProductionMedia('https://cdn.example.invalid/video'),{code:'INVALID_MEDIA'});});
test('media enforces streaming size when Content-Length is absent',async t=>{
 const chunk=Buffer.alloc(1024*1024);wav.copy(chunk);await transport(t,{responses:[{chunks:Array.from({length:65},()=>chunk)}]});
 await assert.rejects(downloadProductionMedia('https://cdn.example.invalid/video'),{code:'MEDIA_TOO_LARGE'});
});
test('DNS lookup is bounded by remaining total deadline and clears timers without network',async t=>{
 const f=await transport(t,{resolve:()=>new Promise(()=>{})}),timers=[],cleared=[],start=Date.now();let nowCalls=0;
 t.mock.method(Date,'now',()=>nowCalls++===0?start:start+89999);
 t.mock.method(globalThis,'setTimeout',(fn,delay)=>{const timer={fn,delay};timers.push(timer);if(delay===1)queueMicrotask(fn);return timer;});
 t.mock.method(globalThis,'clearTimeout',timer=>cleared.push(timer));
 await assert.rejects(downloadProductionMedia('https://cdn.example.invalid/video'),{code:'DNS_FAILED'});
 assert.equal(f.requests.length,0);assert(timers.some(timer=>timer.delay===1));assert(timers.every(timer=>cleared.includes(timer)));
});
