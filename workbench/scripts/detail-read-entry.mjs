// Test entry copied beside desktop.mjs; assertions use real IPC plus actual React/Semi controls.
import {app} from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {startDesktop} from './desktop.mjs';
const root = process.env.NOVA_DETAIL_ROOT;
assert.ok(root && path.isAbsolute(root));
let target = path.join(root, 'library-a');
const photo = path.join(root, 'photo.png');
await fs.writeFile(photo, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
startDesktop({show: false, userData: path.join(root, 'machine'), dialogs: {destination: async () => target, library: async () => target, photo: async () => photo}, async ready({window, controller}) {
    const calls = [], checks = [];
    let failAssets = false, reading = 0;
    const run = code => window.webContents.executeJavaScript(code).catch(error=>{console.error('Failed renderer assertion:',code);throw error;});
    const wait = condition => run(`new Promise((resolve,reject)=>{const end=Date.now()+30000;function check(){if(${condition})return resolve(true);if(Date.now()>end)return reject(new Error('Timed out: '+${JSON.stringify(condition)}+' / '+document.body.innerText.slice(-1500)));setTimeout(check,20)}check()})`);
    const idle = `document.querySelector('main[data-loaded="true"][data-busy="false"]')`;
    const click = async selector => {assert.equal(await run(`!!document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled`), true, `Enabled ${selector}`); await run(`document.querySelector(${JSON.stringify(selector)}).click()`);};
    const clickText = text => run(`[...document.querySelectorAll('button')].find(e=>e.textContent===${JSON.stringify(text)} && !e.disabled).click()`);
    for (const method of ['listCoverAssets', 'readCover', 'readWorkspace', 'readWorkspaceLibrary', 'status', 'listContents']) {
        const original = controller[method].bind(controller);
        controller[method] = async (...args) => {calls.push(method); reading++; try {if (method === 'listCoverAssets' && failAssets) throw Object.assign(new Error('detail probe assets failure'), {code: 'CORRUPT'}); return await original(...args);} finally {reading--;}};
    }
    const settle = async () => {const end=Date.now()+30000; while(Date.now()<end) {const before=calls.length; await new Promise(resolve=>setTimeout(resolve,600)); if(before===calls.length && reading===0) {await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))'); return;}} throw new Error('Reads did not settle');};
    const openComposer = async () => {await clickText('制作封面'); await wait('document.querySelector("dialog[open] #cover-photo")');};
    const photoText = async () => {
        await click('#cover-photo'); await wait(`document.querySelector('[role="option"]')`);
        const text = await run(`[...document.querySelectorAll('[role="option"]')].map(e=>e.textContent).join(" / ")`);
        await run(`document.querySelector('[role="option"]').click()`); return text;
    };
    const closeComposer = async () => {await clickText('暂时收起'); await wait('!document.querySelector("dialog[open] #cover-photo")');};
    const refresh = async () => {const before=calls.length; await click('#refresh-workspace'); await wait(idle); await settle(); assert.ok(calls.length>before);};
    try {
        await wait(idle); await click('#welcome-create-library'); await wait(idle+' && !document.getElementById("welcome-create-library")');
        assert.equal((await run('window.contentHub.createContent({title:"Detail A",body:"Saved A"})')).ok, true);
        await refresh(); await click('#nav-content'); await wait('document.querySelector(".content-title-link")'); await settle();
        const start=calls.length; await click('.content-title-link'); await wait(idle+' && document.querySelector(".cover-workspace-heading p")?.textContent.includes("选好风格")'); await settle();
        const selection=calls.slice(start); checks.push({name:'detail-selection',calls:selection});
        console.log(JSON.stringify(checks.at(-1)));
        assert.equal(selection.filter(method=>method==='listCoverAssets').length,1,'one asset scan per detail selection');
        assert.equal(selection.filter(method=>method==='readCover').length,1,'valid cover loaded exactly once');
        await openComposer();
        await run('document.getElementById("own-photo").click()'); await click('#choose-photo');
        await wait(idle+' && document.querySelector(".file-dropzone-notice")?.textContent.includes("照片已导入")'); await settle();
        assert.match(await photoText(), /我的照片/); checks.push({name:'photo-import-visible',passed:true});
        await closeComposer();
        const imported=await run('window.contentHub.choosePhoto({title:"External refresh photo",isOwnPhoto:true})'); assert.equal(imported.ok,true);
        await refresh(); await openComposer(); assert.match(await photoText(), /External refresh photo/); await closeComposer(); checks.push({name:'explicit-refresh-visible',passed:true});
        assert.equal((await run('window.contentHub.choosePhoto({title:"Focus photo",isOwnPhoto:true})')).ok,true);
        await run('window.dispatchEvent(new Event("focus"))'); await settle(); await openComposer(); assert.match(await photoText(), /Focus photo/); await closeComposer(); checks.push({name:'focus-refresh-visible',passed:true});
        // A rejected asset read must leave new content without a falsely published cover snapshot.
        await click('.back-to-contents'); await wait('document.querySelector(".content-title-link")'); await settle(); failAssets=true;
        const failedStart=calls.length; await click('.content-title-link'); await wait(idle+' && document.body.innerText.includes("detail probe assets failure")'); await settle();
        assert.equal(calls.slice(failedStart).filter(method=>method==='readCover').length,0,'failed assets cannot publish retained assets with a fresh cover');
        assert.equal(await run('document.querySelector(".cover-workspace-heading p").textContent'), '正在读取这篇内容的封面作品…'); checks.push({name:'failed-assets-no-stale-cover',passed:true});
        failAssets=false; await refresh(); await wait('document.querySelector(".cover-workspace-heading p")?.textContent.includes("选好风格")');
        // The storage UI performs clearEditor and a real content-library epoch change.
        await click('#library-menu'); await clickText('备份与维护'); await wait('document.getElementById("create-library")');
        target=path.join(root,'library-b'); await click('#create-library'); await wait(idle+' && !document.querySelector("dialog[open] #create-library")'); await settle();
        assert.equal((await run('window.contentHub.createContent({title:"Detail B",body:"Saved B"})')).ok,true);
        await refresh(); await click('#nav-content'); await wait('document.querySelector(".content-title-link")'); await click('.content-title-link'); await wait(idle+' && document.querySelector(".cover-workspace-heading p")?.textContent.includes("选好风格")'); await settle();
        await openComposer(); assert.doesNotMatch(await photoText(), /我的照片|External refresh photo|Focus photo/); checks.push({name:'library-switch-no-old-photos',passed:true});
        await closeComposer();
        let releaseCover, enterCover, finishCover;
        const coverGate=new Promise(resolve=>{releaseCover=resolve;}), coverStarted=new Promise(resolve=>{enterCover=resolve;}), coverFinished=new Promise(resolve=>{finishCover=resolve;});
        const readCover=controller.readCover.bind(controller); let paused=false;
        controller.readCover=async input=>{if(!paused){paused=true;enterCover();await coverGate;} const result=await readCover(input);finishCover();return result;};
        await run('window.dispatchEvent(new Event("focus"))'); await coverStarted;
        const control=await run('(()=>{const e=[...document.querySelectorAll(".content-detail-tabs button")].find(e=>e.textContent==="正文"),r=e.getBoundingClientRect();return {disabled:e.disabled,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()');
        assert.equal(control.disabled,false,'background cover read leaves first tab click enabled');
        window.webContents.sendInputEvent({type:'mouseDown',x:control.x,y:control.y,button:'left',clickCount:1});
        window.webContents.sendInputEvent({type:'mouseUp',x:control.x,y:control.y,button:'left',clickCount:1});
        await wait('document.getElementById("content-body")');
        await run('(()=>{const e=document.getElementById("content-body");Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set.call(e,"Unsaved during cover read");e.dispatchEvent(new Event("input",{bubbles:true}));})()');
        await wait('document.getElementById("editor-dirty-state")?.textContent.includes("有未保存草稿")'); releaseCover(); await coverFinished; await settle();
        assert.equal(await run('document.getElementById("content-body").value'),'Unsaved during cover read'); checks.push({name:'trusted-first-click-and-draft',passed:true});
        const receipt={passed:true,scope:'Fresh source renderer/native; copied 0.3.18 resource package; real IPC and worker IO; synthetic photo and isolated libraries; hidden Electron window, no installed application modified.',checks,calls,electron:process.versions.electron};
        await fs.writeFile(path.join(root,'receipt.json'),JSON.stringify(receipt,null,2)); console.log('PASS detail-read actual React/Semi/Electron',JSON.stringify(checks)); app.exit(0);
    } catch(error) {console.error(error); await fs.writeFile(path.join(root,'receipt.json'),JSON.stringify({passed:false,error:String(error),checks,calls},null,2)); await fs.writeFile(path.join(root,'failure.html'),await run('document.documentElement.outerHTML')); await fs.writeFile(path.join(root,'failure.png'),(await window.webContents.capturePage()).toPNG()); app.exit(1);}
}}).catch(error=>{console.error(error);app.exit(1);});
