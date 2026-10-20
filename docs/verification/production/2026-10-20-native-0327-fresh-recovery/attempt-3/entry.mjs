import {app, ipcMain} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const [root, phase, out] = process.argv.slice(2);
assert.ok(root && root.includes('nova-native-0327-fresh-') && path.isAbsolute(root));
assert.ok(['fresh', 'reopen-recover', 'restored-reopen'].includes(phase));
const base = '/Applications/自媒体工作台.app/Contents/Resources/app';
const machine = path.join(root, 'machine'), original = path.join(root, '合成内容库');
const receipt = {phase, startedAt: new Date().toISOString(), root, appIsPackaged: app.isPackaged, calls: [], failures: [], checks: []};
assert.equal(app.isPackaged, false, 'Repository Electron is explicitly a development host');
let selectedLibrary = original, selectedBackup = null, win;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function fingerprint(directory) {
    const files = [];
    async function visit(dir, prefix = '') {
        for (const name of (await fs.readdir(dir)).sort()) {
            if (name === '库锁') continue;
            const relative = path.join(prefix, name), file = path.join(dir, name), stat = await fs.lstat(file);
            assert.ok(!stat.isSymbolicLink());
            if (stat.isDirectory()) await visit(file, relative);
            else { assert.ok(stat.isFile()); files.push({path: relative, bytes: stat.size, sha256: sha(await fs.readFile(file))}); }
        }
    }
    await visit(directory);
    return {files, treeSha256: sha(JSON.stringify(files))};
}
const summarize = library => ({
    prompts: library.prompts.map(x => ({id:x.id,title:x.title,body:x.body})),
    templates: library.templates.map(x => ({id:x.id,title:x.title})),
    contents: library.contentDetails.map(x => ({id:x.id,title:x.title,body:x.body,plans:x.plans,publications:x.publications,publicationEvents:x.publicationEvents}))
});
const save = () => fs.writeFile(path.join(out, phase + '.json'), JSON.stringify(receipt, null, 2) + '\n');
const originalHandle = ipcMain.handle;
const allowed = new Set(['readBootstrapRecovery','readPreferences','readReminderStatus','readSetup','status','listContents','listCoverAssets','readWorkspace','readWorkspaceLibrary','readContent','readMaintenanceStatus','inspectLibraryHealth','createLibrary','openLibrary','createContent','mutateWorkspace','backupLibrary','verifyLibraryBackup','restoreLibraryBackup']);
ipcMain.handle = function(channel, listener) { return originalHandle.call(this, channel, async (...args) => {
    receipt.calls.push(channel);
    if (!allowed.has(channel.replace(/^nova:/, ''))) { receipt.failures.push({blocked:channel}); return {ok:false,error:{code:'PROBE_BLOCKED',message:'External or unrelated action blocked'}}; }
    return listener(...args);
}); };
const deadline = setTimeout(() => {receipt.failures.push({error:'180s timeout'});void save().finally(() => app.exit(1));}, 180000);
const {startDesktop} = await import(path.join(base, 'workbench/dist/main/desktop.mjs'));
startDesktop({show:false,userData:machine,marketRoot:'/Applications/自媒体工作台.app/Contents/Resources/plugin-marketplace',
        dialogs:{destination:async()=>original,library:async()=>selectedLibrary,maintenanceParent:async()=>root,libraryBackup:async()=>selectedBackup},
        async ready({window, controller, release}) {
            win = window;
            receipt.release = release; receipt.userData = app.getPath('userData'); receipt.pid = process.pid;
            assert.equal(release.version,'0.3.27'); assert.equal(receipt.userData,machine); assert.equal(window.isVisible(),false);
            controller.copyText = () => {throw Error('Clipboard forbidden');};
            controller.openPublicationURL = async () => {throw Error('External URL forbidden');};
            controller.revealFolder = () => {throw Error('Reveal forbidden');};
            const raw = (method,input) => window.webContents.executeJavaScript(`window.contentHub[${JSON.stringify(method)}](${input === undefined ? '' : JSON.stringify(input)})`);
            const call = async (method,input) => {const result = await raw(method,input);assert.equal(result.ok,true,method+': '+JSON.stringify(result));return result.value;};
            receipt.bootstrap = await call('readBootstrapRecovery'); assert.equal(receipt.bootstrap.state,'ready');assert.equal(receipt.bootstrap.reasonCode,'none');assert.equal(receipt.bootstrap.canReset,false);
            const checkSeeds = library => {assert.equal(library.templates.length,20);assert.equal(library.prompts.length,52);assert.ok(library.prompts.every(x=>x.body.length));};
            if (phase === 'fresh') {
                receipt.freshStatus = await call('status'); assert.equal(receipt.freshStatus.currentName,null);assert.equal(controller.binding.current,null);
                await call('createLibrary');
                let library = await call('readWorkspaceLibrary');checkSeeds(library);
                receipt.initialCounts = {templates:library.templates.length,prompts:library.prompts.length,contents:library.contentDetails.length};
                const item = await call('createContent',{title:'独立验证 · 合成内容 0.3.27',body:'仅用于一次性隔离 native 验证。\n保留 UTF-8、换行和 emoji 🧪。\nNo provider calls.'});
                const schedule = {precision:'date',date:'2026-11-02'};
                let result = await call('mutateWorkspace',{op:'savePublicationPlan',kind:'content',id:item.id,editToken:item.editToken,plan:{channelId:library.settings.channels.find(x=>x.deletedAt===null).id,text:'合成发布计划，不触发外部发布',schedule,coverChoice:null}});
                let current = result.library.contentDetails.find(x=>x.id===item.id);assert.equal(current.plans.length,1);
                result = await call('mutateWorkspace',{op:'recordPublication',kind:'content',id:item.id,editToken:current.editToken,planId:current.plans[0].id,schedule,url:null});
                current = result.library.contentDetails.find(x=>x.id===item.id);assert.equal(current.publications.length,1);assert.equal(current.plans[0].status,'published');
                library = await call('readWorkspaceLibrary'); checkSeeds(library);
                receipt.saved = summarize(library);receipt.binding = structuredClone(controller.binding.current);
                receipt.health = await call('inspectLibraryHealth'); assert.equal(receipt.health.state,'healthy');assert.equal(receipt.health.complete,true);
                receipt.libraryFiles = await fingerprint(original);
                await fs.writeFile(path.join(root,'expected.json'),JSON.stringify({saved:receipt.saved,binding:receipt.binding,itemId:item.id,files:receipt.libraryFiles},null,2));
                receipt.checks.push('Empty machine bootstrap and native createLibrary with seed install','20 templates and 52 nonempty prompt bodies readable','Native createContent + savePublicationPlan + manual recordPublication','Healthy complete native diagnostic');
            } else if (phase === 'reopen-recover') {
                const expected = JSON.parse(await fs.readFile(path.join(root,'expected.json'),'utf8'));
                assert.deepEqual(controller.binding.current,expected.binding);
                let library = await call('readWorkspaceLibrary');checkSeeds(library);assert.deepEqual(summarize(library),expected.saved);
                assert.deepEqual(await fingerprint(original),expected.files);
                receipt.persistence = {savedContentId:expected.itemId,libraryId:controller.binding.current.libraryId,identicalBusinessProjection:true,identicalFileBytes:true};
                const bindingBytes = await fs.readFile(path.join(machine,'machine-binding.json'));
                const moved = path.join(root,'合成内容库-暂时移动');
                await fs.rename(original,moved);
                try {
                    receipt.movedHealth = await call('inspectLibraryHealth');assert.equal(receipt.movedHealth.state,'blocked');assert.ok(receipt.movedHealth.issues.some(x=>x.code==='ROOT_MISSING'));
                    receipt.movedRead = await raw('readWorkspaceLibrary');assert.equal(receipt.movedRead.ok,false);
                    assert.deepEqual(await fs.readFile(path.join(machine,'machine-binding.json')),bindingBytes);
                    assert.deepEqual(await fingerprint(moved),expected.files);
                } finally {await fs.rename(moved,original);}
                receipt.returnedHealth = await call('inspectLibraryHealth');assert.equal(receipt.returnedHealth.state,'healthy');
                await call('openLibrary');library = await call('readWorkspaceLibrary');assert.deepEqual(summarize(library),expected.saved);
                receipt.backup = await call('backupLibrary');assert.equal(receipt.backup.kind,'backup');
                selectedBackup = path.join(root,receipt.backup.destinationName);
                receipt.verifiedBackup = await call('verifyLibraryBackup');assert.equal(receipt.verifiedBackup.kind,'verify');
                receipt.restore = await call('restoreLibraryBackup');assert.equal(receipt.restore.kind,'restore');assert.equal(receipt.restore.interruptedAttempts,0);
                const restored = path.join(root,receipt.restore.destinationName), restoredFiles = await fingerprint(restored), backupFiles = await fingerprint(path.join(selectedBackup,'data'));
                assert.deepEqual(backupFiles,expected.files,'Backup preserves every source file byte');
                const restoredMap = new Map(restoredFiles.files.map(x=>[x.path,x]));
                for(const file of expected.files.files)assert.deepEqual(restoredMap.get(file.path),file,'Restored bytes: '+file.path);
                const extra = restoredFiles.files.filter(x=>!expected.files.files.some(y=>y.path===x.path));
                assert.equal(extra.length,1);assert.ok(extra[0].path.startsWith('系统（别动）/恢复来源/'));
                const provenance = JSON.parse(await fs.readFile(path.join(restored,extra[0].path),'utf8'));
                assert.equal(provenance.libraryId,expected.binding.libraryId);assert.deepEqual(provenance.interruptedAttempts,[]);
                receipt.restoredByteEvidence = {sourceFiles:expected.files.files.length,backupFiles:backupFiles.files.length,restoredFiles:restoredFiles.files.length,sourceTreeSha256:expected.files.treeSha256,backupTreeSha256:backupFiles.treeSha256,extra,provenance};
                selectedLibrary = restored;await call('openLibrary');
                assert.equal(controller.binding.current.libraryId,expected.binding.libraryId);assert.notDeepEqual(controller.binding.current.rootIdentity,expected.binding.rootIdentity);
                library = await call('readWorkspaceLibrary');checkSeeds(library);assert.deepEqual(summarize(library),expected.saved);
                receipt.restoredBinding = structuredClone(controller.binding.current);
                receipt.restoreHealth = await call('inspectLibraryHealth');assert.equal(receipt.restoreHealth.state,'healthy');assert.equal(receipt.restoreHealth.complete,true);
                await fs.writeFile(path.join(root,'restore-expected.json'),JSON.stringify({binding:receipt.restoredBinding,saved:expected.saved,files:await fingerprint(restored)},null,2));
                assert.deepEqual(await fingerprint(original),expected.files,'Original retained after restore');
                receipt.checks.push('Separate process reopens all content, plan, manual publication and original bytes','Moved library diagnosed ROOT_MISSING; failing read preserves binding and bytes; returning original folder recovers without reset','Native backupLibrary → verifyLibraryBackup → restoreLibraryBackup','All source/backup/restored business bytes match; one provenance addition; same libraryId and independent target inode','Restored library opens through native openLibrary and is healthy');
            } else {
                const expected = JSON.parse(await fs.readFile(path.join(root,'restore-expected.json'),'utf8'));
                assert.deepEqual(controller.binding.current,expected.binding);
                const library = await call('readWorkspaceLibrary');checkSeeds(library);assert.deepEqual(summarize(library),expected.saved);
                assert.deepEqual(await fingerprint(expected.binding.root),expected.files);
                receipt.binding=structuredClone(controller.binding.current);receipt.saved=summarize(library);receipt.health=await call('inspectLibraryHealth');assert.equal(receipt.health.state,'healthy');
                receipt.checks.push('Third independent process reopens restored library, same binding/identity/content/plan/manual publication and exact bytes');
            }
            assert.deepEqual(receipt.failures,[]);
            receipt.passed=true;receipt.finishedAt=new Date().toISOString();await save();clearTimeout(deadline);app.quit();
        }
    }).catch(async error => {receipt.failures.push({message:String(error),stack:error.stack});await save();clearTimeout(deadline);app.exit(1);});
