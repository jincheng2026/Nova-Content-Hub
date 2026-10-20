import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const out=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(out,'../../../..');
const electron=createRequire(path.join(repo,'workbench/package.json'))('electron');
const resources='/Applications/自媒体工作台.app/Contents/Resources',base=path.join(resources,'app');
const root=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'nova-native-0327-fresh-'));
const files=['workbench/dist/release.json','workbench/dist/main/desktop.mjs','workbench/dist/main/controller.mjs','workbench/dist/main/worker.mjs','workbench/dist/main/maintenance-worker.mjs','workbench/dist/main/maintenance-controller.mjs','workbench/dist/main/workspace-controller.mjs','workbench/dist/preload/index.cjs','plugin-src/src/lib/file-library/index.mjs','plugin-src/src/lib/file-library/backup.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async relative=>[relative,createHash('sha256').update(await fs.readFile(path.join(base,relative))).digest('hex')])));
const before=await hashes();
const manifest={scope:'Repository Electron 44.9.0 development host (app.isPackaged=false), actual installed /Applications/自媒体工作台.app 0.3.27 resource modules, hidden startDesktop, real renderer/preload/IPC/utility worker, isolated os.tmpdir userData and synthetic library. File dialogs return only probe paths. Not Finder launch or real user-library/TCC/manual UI acceptance.',at:new Date().toISOString(),resources,electron,root,installedHashesBefore:before,phases:[],limits:['No Finder/LaunchServices packaged launch, TCC permission, real user library, external host, generation, clipboard, notification test, or reinstall','Offline-moved-library recovery covered separately; active move requires active-move.mjs and is unresolved in manifest.json; malformed binding reset and crash-during-maintenance recovery not exercised']};
try {
    for(const phase of ['fresh','fault-moved','reopen-recover','restored-reopen']) {
        if(phase==='fault-moved')await fs.rename(path.join(root,'合成内容库'),path.join(root,'合成内容库-暂时移动'));
        const result=await new Promise((resolve,reject)=>{
            const chunks=[],child=spawn(electron,[path.join(out,'entry.mjs'),root,phase,out],{cwd:repo,env:{...process.env,ELECTRON_RUN_AS_NODE:''},stdio:['ignore','pipe','pipe']});
            const timer=setTimeout(()=>child.kill('SIGKILL'),210000);
            for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{chunks.push(data);process.stdout.write(data);});
            child.once('error',reject);child.once('close',async(code,signal)=>{clearTimeout(timer);await fs.writeFile(path.join(out,phase+'.log'),Buffer.concat(chunks));resolve({phase,code,signal,pid:child.pid});});
        });
        if(phase==='fault-moved')await fs.rename(path.join(root,'合成内容库-暂时移动'),path.join(root,'合成内容库'));
        manifest.phases.push(result);assert.equal(result.code,0,phase+' failed');
        const receipt=JSON.parse(await fs.readFile(path.join(out,phase+'.json'),'utf8'));assert.equal(receipt.passed,true);
    }
    manifest.installedHashesAfter=await hashes();assert.deepEqual(manifest.installedHashesAfter,before);
    manifest.passed=true;
} catch(error){manifest.passed=false;manifest.error=String(error);process.exitCode=1;}
finally {manifest.finishedAt=new Date().toISOString();await fs.writeFile(path.join(out,'core-manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({passed:manifest.passed,root,phases:manifest.phases}));}
