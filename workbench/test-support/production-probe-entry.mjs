// Injected into a temporary external desktop copy by scripts/production-probe.mjs; never packaged.
import {app, BrowserWindow, shell} from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {startDesktop} from './desktop.mjs';

const root = process.env.NOVA_PRODUCTION_PROBE_ROOT, evidence = process.env.NOVA_PRODUCTION_PROBE_EVIDENCE;
if (!root || !path.isAbsolute(root) || !evidence || !path.isAbsolute(evidence)) throw new Error('Use scripts/production-probe.mjs.');
const fixture = JSON.parse(await fs.readFile(path.join(root, 'fixture.json'), 'utf8'));
const external = [], launches = [], checks = [];
let selection = fixture.library, browser;
shell.openExternal = async url => {external.push(url);};
const record = (name, detail = true) => {checks.push({name, detail}); console.log(`PASS ${name}`);};
startDesktop({show: false, userData: path.join(root, 'machine'), dialogs: {library: async () => selection, destination: async () => null, productionFiles: async kind => kind === 'report' ? [fixture.reportFile] : null}, async ready({window, controller, release}) {
    const run = script => window.webContents.executeJavaScript(script);
    const wait = (condition, target = window) => target.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+15000;const next=()=>{if(${condition})return resolve(true);if(Date.now()>end)return reject(Error('Timeout: '+${JSON.stringify(condition)}));setTimeout(next,30);};next();})`);
    const click = async (selector, target = window) => {await wait(`document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled`, target); await target.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)}).click()`);};
    const externalAfter = async count => {const end=Date.now()+15000;while(external.length<=count){if(Date.now()>end)throw new Error('Timeout waiting for external capability URL');await new Promise(resolve=>setTimeout(resolve,30));}return external.at(-1);};
    const textClick = async (text, scope = 'document', target = window) => {const expr = `[...${scope}.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled)`; await wait(expr, target); await target.webContents.executeJavaScript(`${expr}.click()`);};
    const input = async (selector, value, target = window) => target.webContents.executeJavaScript(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const bridge = async (method, input) => {const reply = await run(`window.contentHub[${JSON.stringify(method)}](${input === undefined ? '' : JSON.stringify(input)})`); assert.equal(reply.ok, true, JSON.stringify(reply)); return reply.value;};
    const screenshot = async (name, target = window) => {if(target===window){await wait('document.querySelector(\'main[data-loaded="true"][data-busy="false"]\')');await wait('document.querySelectorAll(\'button.nav-item[aria-current="page"]\').length===1');}await target.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await target.webContents.executeJavaScript('document.fonts.ready'); const image = await target.webContents.capturePage(); await fs.writeFile(path.join(evidence, name + '.png'), image.toPNG());};
    try {
        window.webContents.setBackgroundThrottling(false);
        await wait('document.querySelector(\'main[data-loaded="true"][data-busy="false"]\')');
        controller.production.callbacks.launch = async (binding, reference) => {launches.push(reference);};
        const arrows=await run(`(()=>Array.from(document.querySelectorAll('.nav-group-toggle')).map(button=>({label:button.textContent,right:button.getBoundingClientRect().right-button.querySelector('.nav-group-chevron').getBoundingClientRect().right})))()`);
        assert.equal(arrows.length,3);assert(arrows.every(arrow=>arrow.right>=0&&arrow.right<22));assert(Math.max(...arrows.map(arrow=>arrow.right))-Math.min(...arrows.map(arrow=>arrow.right))<1);
        record('primary menu chevrons align at the right edge');
        const settings = await bridge('readServiceSettings');
        const credentialTested = settings.encryptionAvailable;
        await bridge('saveServiceSettings', {values: {...settings.values, asr: {...settings.values.asr, localExecutable:path.join(root,'unused-python'),localModelPath:path.join(root,'unused-model')}, commentsEnabled: true}, ...(credentialTested ? {keys: {model: 'probe-not-real-secret'}} : {})});
        assert(!JSON.stringify(await bridge('readServiceSettings')).includes('probe-not-real-secret'));
        record('desktop safeStorage/settings views omit credential bytes', {encryptionAvailable: credentialTested});
        for (const [width, height] of [[1440,1000],[1000,800]]) {
            const suffix = `${width}x${height}`;
            window.setContentSize(width, height);
            await wait(`innerWidth===${width}&&innerHeight===${height}`);
            for (const group of ['today','content','research']) {
                if (await run(`document.querySelector('#nav-group-${group}').getAttribute('aria-expanded')==='true'`)) await click(`#nav-group-${group}`);
            }
            await click('#nav-prompts');
            await wait('document.querySelector("#nav-prompts").getAttribute("aria-current")==="page"');
            await screenshot(`sidebar-collapsed-${suffix}`);
            const collapsed=await run(`(()=>{const nav=document.querySelector('nav[aria-label="工作功能"]');const items=Array.from(nav.children).map(el=>{const rect=el.getBoundingClientRect();return {name:el.textContent.trim(),height:rect.height,top:rect.top,bottom:rect.bottom};});return {items,buttonHeights:Array.from(nav.querySelectorAll('.nav-group-toggle,#nav-prompts')).map(el=>el.getBoundingClientRect().height),hiddenGroups:Array.from(nav.querySelectorAll('.nav-children')).every(el=>el.hidden&&el.getBoundingClientRect().height===0)};})()`);
            assert(collapsed.hiddenGroups);assert(collapsed.buttonHeights.every(height=>height>=40&&height<=44),JSON.stringify(collapsed));
            assert(collapsed.items.every((item,index)=>index===0||item.top-collapsed.items[index-1].bottom<=10),JSON.stringify(collapsed));
            record(`collapsed primary navigation keeps normal 42px rows and compact gaps ${suffix}`,collapsed);
            await click('#nav-group-research');
            if (!await run('!!document.querySelector("#nav-accounts")?.getClientRects().length')) await click('#nav-group-research');
            await click('#nav-accounts');
            await wait('document.querySelectorAll(".production-account-card").length===3');
            await wait('[...document.querySelectorAll(".production-account-preview img")].every(img=>img.complete&&img.naturalWidth>0)');
            await wait('[...document.querySelectorAll("button")].some(button=>button.textContent.trim()==="新建调研"&&!button.disabled)');
            await wait('document.querySelector("#nav-accounts").getAttribute("aria-current")==="page"');
            await screenshot(`accounts-${suffix}`);
            record(`account wall has three readable real asset previews and one active navigation item ${suffix}`);
            await click('#nav-reports');
            await textClick('新建调研报告');
            await wait('document.querySelector("#production-research-title")');
            assert.equal(await run('document.querySelector("#production-research-form input[type=checkbox]").checked'), false);
            await input('#production-research-title', '职场 AI 教程调研报告');
            await input('#production-research-prompt', '比较三类 AI 教程账号的选题与表达结构，保留可核验来源。');
            assert(await run('document.querySelector("#production-research-prompt").getBoundingClientRect().height<150'));
            await screenshot(`report-create-${suffix}`);
            if (width === 1440) {
                await textClick('创建并打开助手');
                await wait('!document.querySelector("#production-research-form")');
                const snapshot = await bridge('readProduction'), task = snapshot.tasks.at(-1);
                assert.equal(task.title, '职场 AI 教程调研报告');
                assert.equal(task.request.prompt, '比较三类 AI 教程账号的选题与表达结构，保留可核验来源。');
                assert.equal(await run('!!document.querySelector("#production-max-followers,#production-min-likes")'),false);
                assert.equal(task.request.parameters.comments, false);
                assert.equal(launches.length, 1);
                record('report UI freezes explicit title and unchecked per-task comments; launch mocked');
            } else await textClick('放弃填写');
            if (width === 1440) {
                await textClick('导入 HTML 报告');
                await wait('document.querySelector("#production-report-title")');
                await input('#production-report-title', '带伴随元数据的导入报告');
                await input('#production-report-type', '对照调研');
                const companion={sourceUrl:'https://example.com/report-source',collectedAt:'2026-10-25T08:00:00.000Z',sampleCount:12,provenance:'synthetic test'};
                await run(`(()=>{const el=document.querySelector('#production-report-meta-file');const data=new DataTransfer();data.items.add(new File([${JSON.stringify(JSON.stringify(companion))}], 'report.meta.json',{type:'application/json'}));el.files=data.files;el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
                await wait(`document.querySelector('[aria-label="报告元数据 JSON"]').value.includes("sampleCount")`);
                await textClick('保存报告');
                await wait('!document.querySelector("#production-report-title")');
                const imported=(await bridge('readProduction')).reports.find(report=>report.title==='带伴随元数据的导入报告');
                assert(imported);assert.equal(imported.sourceUrl,companion.sourceUrl);assert.equal(imported.collectedAt,companion.collectedAt);assert.equal(imported.meta.sampleCount,12);assert.equal(imported.type,'对照调研');
                record('report HTML import and companion JSON preserve type, source, timestamp and sample metadata through actual UI and IPC; file selection simulated');
            }
            const reportCount=external.length;
            await textClick('继续阅读');
            const reportUrl = await externalAfter(reportCount), response = await fetch(reportUrl), html = await response.text();
            assert.equal(response.status, 200); assert.match(html, /表达结构/); assert.match(html, /sandbox="allow-scripts" src=/);
            record(`report opens capability URL with both pages ${suffix}`);
            await click('#open-settings');
            await run('[...document.querySelectorAll("[role=tab]")].find(el=>el.textContent.includes("服务与模型")).click()');
            await wait('document.querySelector("#service-model-id") && !document.querySelector("#service-model-id").disabled');
            assert.equal(await run('document.querySelector("#service-key-model").value'), '');
            assert.equal(await run('document.querySelector("#service-key-model").type'), 'password');
            assert.equal(await run('document.querySelectorAll(".service-settings-actions button").length'),1);
            assert.equal(await run('document.querySelector("#service-model-url").closest("details").open'),false);
            assert.equal(await run('document.querySelector("#service-asr-executable").closest("details").open'),false);
            if (width === 1440) {
                if (credentialTested) {
                    await textClick('清除 Key','document.querySelector(".service-settings")');
                    assert.equal(await run('document.querySelector("#service-key-model").disabled'),true);
                    await textClick('撤销清除','document.querySelector(".service-settings")');
                    assert.equal(await run('document.querySelector("#service-key-model").disabled'),false);
                    assert.equal((await bridge('readServiceSettings')).credentials.model.hasKey,true);
                }
                const originalUrl=(await bridge('readServiceSettings')).values.model.baseUrl;
                await run('document.querySelector("#service-model-url").closest("details").open=true');
                await input('#service-model-url','http://localhost');
                if (credentialTested) await input('#service-key-model','probe-replacement-not-real-secret');
                await textClick('保存并检查','document.querySelector(".service-settings")');
                await wait('document.querySelector(".service-settings-notice")?.textContent.startsWith("保存未确认")&&!document.querySelector("#service-key-model").disabled');
                assert.equal(await run('document.querySelector("#service-model-url").value'),'http://localhost');
                if (credentialTested) assert.equal(await run('document.querySelector("#service-key-model").value'),'probe-replacement-not-real-secret');
                assert.equal((await bridge('readServiceSettings')).values.model.baseUrl,originalUrl);
                await input('#service-model-url',originalUrl);
                await run('document.querySelector("#service-asr-executable").closest("details").open=true');
                await input('#service-asr-executable',path.join(root,'not-installed-python'));
                await textClick('保存并检查','document.querySelector(".service-settings")');
                await wait('document.querySelector(".service-settings-notice")?.textContent.startsWith("服务设置已保存。")&&!document.querySelector("#service-key-model").disabled');
                const saved=await bridge('readServiceSettings');assert.equal(saved.values.asr.localExecutable,path.join(root,'not-installed-python'));assert.equal(saved.values.budget.enabled,false);assert.equal(saved.values.commentsEnabled,true);assert.equal(saved.credentials.model.hasKey,credentialTested);
                const settingsPath=path.join(root,'machine','service-settings.json'),before=await fs.stat(settingsPath);
                await textClick('保存并检查','document.querySelector(".service-settings")');
                await wait('document.querySelector(".service-settings-notice")?.textContent.startsWith("服务设置已保存。")&&!document.querySelector("#service-key-model").disabled');
                assert.equal((await fs.stat(settingsPath)).mtimeMs,before.mtimeMs);
                await run('document.querySelector("#service-asr-executable").closest("details").open=false');
                await run('document.querySelector("#service-model-url").closest("details").open=false');
                record('one existing save action persists and checks local settings; invalid configuration retains inputs; clear toggles to undo; unchanged check does not rewrite credentials or enable budgets');
            }
            await run('document.querySelector(".service-settings").closest("dialog").scrollTop=0');
            await screenshot(`service-settings-${suffix}`);
            await click('#close-settings');
            if (!await run('!!document.querySelector("#nav-content")?.getClientRects().length')) await click('#nav-group-content');
            assert.equal(await run('document.querySelector("#nav-content-pages").querySelectorAll("button").length'), 2);
            await click('#nav-content');
            await wait('document.querySelectorAll(".workspace-view-tabs button").length===4');
            await screenshot(`content-projects-${suffix}`);
            await click('.content-title-link');
            await wait('document.querySelector("#creation-analysis")');
            await screenshot(`content-creation-${suffix}`);
            const creationCount=external.length;
            await textClick('打开本地创作页 ↗');
            const creationUrl = await externalAfter(creationCount);
            browser = new BrowserWindow({show: false, width, height, useContentSize: true, webPreferences: {partition: 'nova-production-browser-probe', sandbox: true, contextIsolation: true, nodeIntegration: false}});
            browser.webContents.setBackgroundThrottling(false);
            await browser.loadURL(creationUrl);
            await wait('document.querySelector("#body")&&!document.querySelector("#body").disabled', browser);
            await screenshot(`browser-creation-${suffix}`, browser);
            if (width === 1440) {
                const before = await (await fetch(`${creationUrl}state`)).json();
                const text = before.content.body + '\n\nElectron 浏览器页烟测：仅写入临时测试库。';
                await input('#body', text, browser);
                await click('#save', browser);
                await wait('document.querySelector("#notice").textContent.includes("修改已保存")', browser);
                assert.equal((await bridge('readProductionCreation', {contentId: fixture.contentId})).content.body, text);
                const conflict = await fetch(`${creationUrl}save`, {method: 'POST', headers: {'Content-Type': 'application/json', Origin: new URL(creationUrl).origin}, body: JSON.stringify({body: before.content.body, editToken: before.content.editToken, bodyHash: before.content.bodyHash, productionToken: before.productionToken, creationPatch: {}})});
                assert.equal(conflict.status, 409);
                const pending=await bridge('readProductionPending');
                if(pending.pending) await bridge('recoverProductionPending',{action:'discard'});
                record('browser creation saves through desktop durable transaction and rejects stale CAS; explicit stale recovery intent discarded in test library');
            }
            browser.destroy(); browser = undefined;
            await click('.back-to-contents');
        }
        const oldUrl = external.at(-1);
        selection = fixture.otherLibrary;
        await controller.openLibrary();
        assert.notEqual((await fetch(`${oldUrl}state`)).status, 200);
        record('switching libraries invalidates old browser capabilities');
        const receipt = {passed: true, recordedAt: new Date().toISOString(), release, platform: process.platform, arch: process.arch, viewports: [[1440,1000],[1000,800]], checks, launchMocked: true, paidRequests: 0, realLibrary: false, scope: 'Real Electron sandbox/preload/IPC/React navigation and isolated Chromium loopback creation page; excludes real assistant hosts, OS default browser, native installers and other platforms.', designRules: {'Foundation-01': 'screenshots captured for review', 'Layout-01': 'content group contains exactly content and cover; four project filters verified', 'Controls-02': 'report title required; per-task comments remain unchecked despite global enabled capability', 'Reading-02': 'account image assets decoded; settings credential values omitted', 'Acceptance-01': 'native typecheck and production smoke', 'Acceptance-02': 'two viewport screenshots; visual review required', 'Acceptance-03': `${process.platform}/${process.arch} native Electron only; no installer or cross-platform claim`}};
        await fs.writeFile(path.join(evidence, 'electron-production-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
        app.quit();
    } catch (error) {
        console.error(error);
        await screenshot('electron-production-failure').catch(() => {});
        await fs.writeFile(path.join(evidence, 'electron-production-failure.json'), JSON.stringify({error: String(error), stack: error.stack, checks}, null, 2));
        browser?.destroy();
        app.exit(1);
    }
}}).catch(error => {console.error(error); app.exit(1);});
