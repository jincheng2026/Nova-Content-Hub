import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {createVault} from '../../plugin-src/src/lib/vault/index.mjs';
import {openLibrary} from '../../plugin-src/src/lib/file-library/index.mjs';
import {productionMutationInput} from '../src/shared/production-validation.ts';

for(const vault of [false,true])test(`manual report ${vault?'Vault':'legacy'}: bounded Markdown reaches real report pages without executable user HTML`,t=>{
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'nova-manual-report-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const library=vault?openLibrary(createVault(root).root):createLibrary(root);
 const markdown='# 研究结论\n\n<script>globalThis.untrustedExecuted=true</script>\n\n原始资料需继续核对。';
 const input={title:'手工记录的研究',type:'调研',accountIds:[],sourceUrl:null,collectedAt:null,meta:{method:'manual'},markdown,expectedToken:library.readProduction().editToken};
 assert.equal(productionMutationInput('saveReport',input),true);
 assert.equal(productionMutationInput('saveReport',{...input,path:'/tmp/outside'}),false);
 assert.equal(productionMutationInput('saveReport',{...input,pages:[]}),false);
 const snapshot=library.mutateProduction('saveReport',input,{mutationId:randomUUID()}),report=snapshot.reports.at(-1);
 assert.equal(report.title,input.title);assert.equal(report.meta.manualMarkdown,markdown);
 const html=library.readAsset(report.pages[0].assetHash).data.toString('utf8');
 assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));
 assert.equal(library.readProduction().reports.length,1);
 if(vault){const files=fs.readdirSync(path.join(root,'02_内容素材'),{recursive:true}).filter(name=>name.endsWith('.md'));assert(files.some(name=>fs.readFileSync(path.join(root,'02_内容素材',name),'utf8').includes(markdown)));}
});
