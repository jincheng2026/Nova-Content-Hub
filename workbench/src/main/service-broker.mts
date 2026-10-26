import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import type {ServiceBrokerDescriptor,ServiceToolRequest,ServiceToolResult} from '../shared/service-contracts.ts';
import {serviceToolRequest} from '../shared/service-validation.ts';
export interface ServiceBrokerOptions {descriptorPath:string;execute(request:ServiceToolRequest):Promise<ServiceToolResult>}
export class ServiceToolBroker {
    private readonly options:ServiceBrokerOptions;private server?:http.Server;private active=0;private token=randomBytes(32).toString('base64url');private descriptor?:ServiceBrokerDescriptor;
    private stopping?:Promise<void>;private drain?:()=>void;
    constructor(options:ServiceBrokerOptions){this.options=options;}
    async start():Promise<ServiceBrokerDescriptor>{
        if(this.stopping)throw Object.assign(new Error('本机工具服务正在关闭。'),{code:'BROKER_STOPPED'});
        if(this.descriptor)return this.descriptor;
        this.server=http.createServer((req,res)=>{void this.handle(req,res);});this.server.requestTimeout=120000;this.server.headersTimeout=10000;this.server.maxHeadersCount=20;
        await new Promise<void>((resolve,reject)=>{this.server!.once('error',reject);this.server!.listen(0,'127.0.0.1',()=>resolve());});
        const address=this.server.address();if(!address||typeof address==='string')throw new Error('BROKER_FAILED');
        this.descriptor={version:1,host:'127.0.0.1',port:address.port,token:this.token};
        try{await fs.mkdir(path.dirname(this.options.descriptorPath),{recursive:true,mode:0o700});const temp=`${this.options.descriptorPath}.${randomBytes(8).toString('hex')}.tmp`;try{await fs.writeFile(temp,JSON.stringify(this.descriptor),{mode:0o600,flag:'wx'});await fs.rename(temp,this.options.descriptorPath);}finally{await fs.rm(temp,{force:true});}}catch(error){await this.stop();throw error;}return {...this.descriptor};
    }
    private async handle(req:http.IncomingMessage,res:http.ServerResponse){
        const reply=(code:number,value:unknown)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
        const supplied=req.headers.authorization??'',expected=`Bearer ${this.token}`;const valid=Buffer.byteLength(supplied)===Buffer.byteLength(expected)&&timingSafeEqual(Buffer.from(supplied),Buffer.from(expected));
        if(this.stopping||req.headers.origin!==undefined||req.method!=='POST'||req.url!=='/execute'||req.headers.host!==`127.0.0.1:${this.descriptor?.port}`||!valid){req.resume();reply(403,{ok:false,error:{code:'BROKER_FORBIDDEN'}});return;}
        if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']??'')||req.headers['content-encoding']||Number(req.headers['content-length']??0)>256*1024){req.resume();reply(400,{ok:false,error:{code:'INVALID_INPUT'}});return;}
        if(this.active>=2){req.resume();reply(429,{ok:false,error:{code:'BROKER_BUSY'}});return;}
        this.active++;let timer:ReturnType<typeof setTimeout>|undefined;
        try{
            const body=await new Promise<Buffer>((resolve,reject)=>{let size=0;const parts:Buffer[]=[];timer=setTimeout(()=>reject(new Error('BODY_TIMEOUT')),10000);req.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>256*1024)reject(new Error('BODY_TOO_LARGE'));else parts.push(chunk);});req.on('end',()=>resolve(Buffer.concat(parts)));req.on('error',reject);});clearTimeout(timer);
            let request:unknown;try{request=JSON.parse(body.toString('utf8'));}catch{reply(400,{ok:false,error:{code:'INVALID_INPUT'}});return;}
            if(!serviceToolRequest(request)){reply(400,{ok:false,error:{code:'INVALID_INPUT'}});return;}
            const value=await this.options.execute(request);reply(200,{ok:true,value});
        }catch(error){const code=error&&typeof error==='object'&&'code'in error&&typeof error.code==='string'&&/^[A-Z_]{1,80}$/.test(error.code)?error.code:'SERVICE_FAILED';reply(400,{ok:false,error:{code}});}finally{clearTimeout(timer);this.active--;if(this.active===0)this.drain?.();}
    }
    async stop():Promise<void>{
        if(this.stopping)return this.stopping;
        this.stopping=(async()=>{
            const server=this.server;this.server=undefined;
            const drained=this.active===0?Promise.resolve():new Promise<void>(resolve=>{this.drain=resolve;});
            if(server)await new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections();});
            // A disconnected HTTP client does not cancel a provider request. Wait for its cost settlement.
            await drained;this.drain=undefined;
            try{const bytes=JSON.parse(await fs.readFile(this.options.descriptorPath,'utf8'));if(bytes.token===this.token)await fs.rm(this.options.descriptorPath,{force:true});}catch{}
            this.descriptor=undefined;
        })();
        try{await this.stopping;}finally{this.stopping=undefined;}
    }
}
