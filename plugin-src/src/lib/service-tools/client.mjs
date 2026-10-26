/** Main-process service bridge. Provider credentials are never accepted here. */
import fs from 'node:fs/promises';
import http from 'node:http';
import {pathToFileURL} from 'node:url';
const fail=code=>{throw Object.assign(new Error(code),{code});};
export async function callServiceTool(descriptorPath,request){
 const stat=await fs.lstat(descriptorPath);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2048||process.platform!=='win32'&&(stat.mode&0o077))fail('UNSAFE_BROKER_DESCRIPTOR');
 const d=JSON.parse(await fs.readFile(descriptorPath,'utf8'));
 if(d.version!==1||d.host!=='127.0.0.1'||!Number.isInteger(d.port)||d.port<1||d.port>65535||typeof d.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(d.token)||Object.keys(d).sort().join(',')!=='host,port,token,version')fail('INVALID_BROKER_DESCRIPTOR');
 const body=JSON.stringify(request);if(Buffer.byteLength(body)>256*1024)fail('INVALID_INPUT');
 return new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port:d.port,path:'/execute',method:'POST',headers:{Authorization:`Bearer ${d.token}`,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},agent:false},res=>{let bytes=0;const parts=[];res.on('data',chunk=>{bytes+=chunk.length;if(bytes>5*1024*1024){req.destroy();reject(Object.assign(new Error('RESPONSE_TOO_LARGE'),{code:'RESPONSE_TOO_LARGE'}));}else parts.push(chunk);});res.on('end',()=>{try{const result=JSON.parse(Buffer.concat(parts).toString('utf8'));if(result.ok!==true)fail(result.error?.code||'SERVICE_FAILED');resolve(result.value);}catch(error){reject(error);}});res.on('error',reject);});req.setTimeout(660000,()=>req.destroy(new Error('BROKER_TIMEOUT')));req.on('error',reject);req.end(body);});
}
export async function serviceToolCLI(args=process.argv.slice(2)){
 if(args.length!==1)fail('USAGE: service-tools <descriptor-path> (JSON request on stdin)');
 let bytes=0;const parts=[];for await(const part of process.stdin){bytes+=part.length;if(bytes>256*1024)fail('INVALID_INPUT');parts.push(part);}
 const request=JSON.parse(Buffer.concat(parts).toString('utf8'));const value=await callServiceTool(args[0],request);process.stdout.write(JSON.stringify(value)+'\n');return value;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)serviceToolCLI().catch(error=>{process.stderr.write(JSON.stringify({ok:false,error:{code:/^[A-Z_]{1,80}$/.test(error?.code)?error.code:'SERVICE_FAILED'}})+'\n');process.exitCode=1;});
