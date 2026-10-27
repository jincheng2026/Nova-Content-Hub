// Explicit, bounded opt-in. Never changes the installed application's settings or bundles.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../../',import.meta.url));
const args=process.argv.slice(2);
if(args.length!==3||!['--run-live','--run-radar-one','--run-model-asr','--run-qwen-asr','--run-tikhub-all','--run-radar-multi'].includes(args[0]))throw new Error('Usage: node workbench/scripts/live-service-probe.mjs --run-live|--run-radar-one|--run-model-asr|--run-qwen-asr|--run-tikhub-all|--run-radar-multi SETTINGS_PATH EVIDENCE_DIR. TikHub-all requires user-authorized recharge/all-feature scope and a public NOVA_TIKHUB_TARGET_SEC_UID.');
const [,_settings,output]=args,settings=path.resolve(_settings),evidence=path.resolve(output);
const sourceStat=await fs.lstat(settings);if(!sourceStat.isFile()||sourceStat.isSymbolicLink()||sourceStat.size>100000)throw new Error('Expected a regular encrypted settings file.');
try{if((await fs.readdir(evidence)).length)throw new Error('Evidence directory must be empty; refusing an accidental paid rerun.');}catch(error){if(error.code!=='ENOENT')throw error;}
const settingsHash=createHash('sha256').update(await fs.readFile(settings)).digest('hex');
const protectedHash=bytes=>{const value=JSON.parse(bytes);return createHash('sha256').update(JSON.stringify({keys:value.keys,model:value.values.model,budget:value.values.budget,commentsEnabled:value.values.commentsEnabled})).digest('hex');};
const protectedSettingsHash=protectedHash(await fs.readFile(settings,'utf8'));
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'nova-live-service-'));
let activeChild;
const interrupt=()=>activeChild?.kill('SIGTERM');process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
async function run(binary,argv,env=process.env){return new Promise((resolve,reject)=>{const child=spawn(binary,argv,{cwd:root,env,stdio:'inherit',shell:false});activeChild=child;child.once('error',reject);child.once('exit',code=>{activeChild=undefined;code===0?resolve():reject(new Error(`Probe process exited ${code}`));});});}
try{
 await fs.mkdir(evidence,{recursive:true});await fs.mkdir(path.join(temp,'workbench/scripts'),{recursive:true});
 await fs.writeFile(path.join(temp,'package.json'),'{"type":"module"}\n',{mode:0o600});
 await fs.copyFile(settings,path.join(temp,'settings.json'));await fs.chmod(path.join(temp,'settings.json'),0o600);
 await fs.symlink(path.join(root,'plugin-src'),path.join(temp,'plugin-src'),'dir');
 await fs.copyFile(path.join(root,args[0]==='--run-radar-multi'?'workbench/scripts/live-radar-multi-entry.mjs':args[0]==='--run-radar-one'?'workbench/scripts/live-radar-entry.mjs':args[0]==='--run-model-asr'?'workbench/scripts/live-model-asr-entry.mjs':args[0]==='--run-qwen-asr'?'workbench/scripts/live-qwen-asr-entry.mjs':args[0]==='--run-tikhub-all'?'workbench/scripts/live-tikhub-all-entry.mjs':'workbench/scripts/live-service-entry.mjs'),path.join(temp,'workbench/scripts/live-service-entry.mjs'));
 await run(path.join(root,'workbench/node_modules/.bin/tsc'),['-p',path.join(root,'workbench/tsconfig.native.json'),'--outDir',path.join(temp,'workbench/src')]);
 const electron=fileURLToPath(new URL('../node_modules/electron/cli.js',import.meta.url));
 await run(process.execPath,[electron,path.join(temp,'workbench/scripts/live-service-entry.mjs'),temp,evidence],{...process.env,ELECTRON_DISABLE_SECURITY_WARNINGS:'1'});
 {const file=path.join(evidence,'summary.json'),summary=JSON.parse(await fs.readFile(file,'utf8')),after=await fs.readFile(settings);summary.originalSettingsChanged=settingsHash!==createHash('sha256').update(after).digest('hex');if(['--run-tikhub-all','--run-radar-multi'].includes(args[0])){summary.protectedSettingsChanged=protectedSettingsHash!==protectedHash(after.toString('utf8'));summary.allowedConcurrentAsrChange=summary.originalSettingsChanged&&!summary.protectedSettingsChanged;}await fs.writeFile(file,JSON.stringify(summary,null,2)+'\n');if(summary.originalSettingsChanged&&(!['--run-tikhub-all','--run-radar-multi'].includes(args[0])||summary.protectedSettingsChanged))throw new Error('Original settings changed during probe; inspect concurrent application edits.');}
}finally{await fs.rm(temp,{recursive:true,force:true});process.off('SIGINT',interrupt);process.off('SIGTERM',interrupt);console.log('Temporary encrypted settings, descriptors, cache and test library removed.');}
