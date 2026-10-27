// Fixed loopback readiness probes only. No credentials, generation, downloads or public endpoints.
import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {publicEndpoint} from '../src/main/service-tools.mts';
import {defaultServiceSettings,serviceSettingsValues} from '../src/shared/service-validation.ts';
const [output,settingsPath]=process.argv.slice(2);
if(!output)throw Error('Usage: node workbench/scripts/local-language-model-probe.mjs EVIDENCE_FILE');
const result={checkedAt:new Date().toISOString(),platform:process.platform,arch:process.arch,connections:[],applicationSupport:{},notes:['常见端口检查不能证明其他端口不存在本地模型。','端口可连不等于模型服务；脚本不发送HTTP。','本地ASR不等于本地语言模型。']};
if(settingsPath){const stored=JSON.parse(await fs.readFile(settingsPath,'utf8'));if(!serviceSettingsValues(stored.values))throw Error('Invalid service settings');result.configuredModel=stored.values.model;result.localLanguageModelConfigured=['127.0.0.1','localhost','[::1]'].includes(new URL(stored.values.model.baseUrl).hostname);}
for(const port of [11434,1234,8000]){
 const observed=await new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port});const finish=value=>{socket.destroy();resolve({host:'127.0.0.1',port,...value});};socket.setTimeout(1500,()=>finish({connected:false,code:'TIMEOUT'}));socket.once('connect',()=>finish({connected:true}));socket.once('error',error=>finish({connected:false,code:error.code??'CONNECTION_FAILED'}));});
 result.connections.push(observed);
}
for(const [name,file]of Object.entries({ollama:'/Applications/Ollama.app',lmStudio:'/Applications/LM Studio.app',ollamaModels:path.join(os.homedir(),'.ollama/models/manifests')})){try{await fs.stat(file);result.applicationSupport[name]=true;}catch{result.applicationSupport[name]=false;}}
const values=defaultServiceSettings();result.acceptsLocalHttpSettings=serviceSettingsValues({...values,model:{provider:'compatible',baseUrl:'http://127.0.0.1:11434/v1',modelId:'local-model'}});
try{await publicEndpoint('https://127.0.0.1/v1');result.localHttpsPreflight='accepted';}catch(error){result.localHttpsPreflight=error.code??'FAILED';}
await fs.mkdir(path.dirname(path.resolve(output)),{recursive:true});await fs.writeFile(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({connections:result.connections,acceptsLocalHttpSettings:result.acceptsLocalHttpSettings,localHttpsPreflight:result.localHttpsPreflight}));
