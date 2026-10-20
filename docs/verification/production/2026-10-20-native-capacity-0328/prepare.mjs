import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
const [root,resources,targetRaw,budgetRaw,out]=process.argv.slice(2),target=Number(targetRaw),budget=Number(budgetRaw),start=performance.now();
assert.ok(root.includes('nova-capacity-0328-'));assert.ok([100,300,1000].includes(target));
const base=path.join(resources,'app'),{createLibrary,openLibrary}=await import(path.join(base,'plugin-src/src/lib/file-library/index.mjs')),{installBuiltins}=await import(path.join(base,'plugin-src/src/lib/library-seed/index.mjs'));
const stateFile=path.join(root,'state.json'),libraryRoot=path.join(root,'library');
let state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{ids:[],collections:[]};
const library=fs.existsSync(libraryRoot)?openLibrary(libraryRoot):createLibrary(libraryRoot);
if(!state.ids.length)installBuiltins(library,base);
const channelId=library.readLibrarySettings().channels.find(x=>x.deletedAt===null).id;
const firstTemplate=library.listTemplates()[0],sample=Object.values(library.readTemplate(firstTemplate.id,firstTemplate.currentVersion).resources).find(x=>x.detectedType==='image/png');assert.ok(sample);const referenceAssetHash=sample.assetHash;
const expired=()=>performance.now()-start>=budget;
while(state.ids.length<target&&!expired()){
 const number=state.ids.length+1,title='CAPACITY-'+String(number).padStart(6,'0');
 const size=number%100===0?65536:2048;const header=title+' synthetic text\n';
 let item=library.createContent({title,body:header+'x'.repeat(size-Buffer.byteLength(header))});
 if(number<=100){item=library.registerContentCandidate(item.id,{assetHash:referenceAssetHash,requestId:'manual',attemptId:'capacity'},item.editToken);item=library.selectContentCover(item.id,item.candidates.at(-1).id,item.editToken);}
 for(let j=0;j<2;j++)item=library.savePublicationPlan(item.id,{channelId,text:'Synthetic plan '+number+'/'+j,schedule:{precision:'local-minute',date:'2026-11-'+String(number%28+1).padStart(2,'0'),time:j?'15:00':'09:00',timezone:'Asia/Shanghai'},coverChoice:null},item.editToken);
 state.ids.push(item.id);fs.writeFileSync(stateFile,JSON.stringify(state));
}
while(state.collections.length<Math.floor(state.ids.length/20)&&!expired()){
 const i=state.collections.length;let group=library.createCollection({title:'GROUP-'+String(i+1).padStart(4,'0'),body:'Synthetic collection '+(i+1),channelIds:[channelId],dateRange:{start:null,end:null}});
 group=library.setCollectionMembers(group.id,state.ids.slice(i*20,i*20+20),group.editToken);state.collections.push(group.id);fs.writeFileSync(stateFile,JSON.stringify(state));
}
const contents=library.listContents(),collections=library.listCollections(),prompts=library.listPrompts(),templates=library.listTemplates();
assert.equal(contents.length,state.ids.length);assert.equal(templates.length,20);assert.equal(prompts.length,52);
const disk={files:0,bytes:0,assets:0,assetBytes:0,directories:0};
function visit(dir,relative=''){for(const name of fs.readdirSync(dir)){if(name==='库锁')continue;const file=path.join(dir,name),rel=path.join(relative,name),s=fs.lstatSync(file);assert.ok(!s.isSymbolicLink());if(s.isDirectory()){disk.directories++;visit(file,rel);}else{disk.files++;disk.bytes+=s.size;if(rel.startsWith('资产/')){disk.assets++;disk.assetBytes+=s.size;}}}}
visit(libraryRoot);
const receipt={target,actualContents:contents.length,actualCollections:collections.length,plans:contents.reduce((n,x)=>n+x.plans.length,0),templates:templates.length,prompts:prompts.length,shortBodyBytes:2048,longBodyBytes:65536,longBodyCount:contents.filter(x=>Buffer.byteLength(x.body)>=65536).length,bodyBytes:contents.reduce((n,x)=>n+Buffer.byteLength(x.body),0),preparationMs:performance.now()-start,budgetMs:budget,budgetReached:expired(),binding:{root:library.info.root,libraryId:library.info.libraryId,rootIdentity:library.info.rootIdentity},saveId:state.ids[0],candidates:contents.reduce((n,x)=>n+x.candidates.length,0),selectedContents:contents.filter(x=>x.selectedCover).length,candidateUniqueAssetHashes:[...new Set(contents.flatMap(x=>x.candidates.map(c=>c.assetHash)))],candidateReferencesReuseExistingSeedAsset:true,referenceAssetHash,lastId:state.ids.at(-1),lastTitle:contents.find(x=>x.id===state.ids.at(-1))?.title,disk};
fs.writeFileSync(path.join(out,'prepare-'+target+'.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
