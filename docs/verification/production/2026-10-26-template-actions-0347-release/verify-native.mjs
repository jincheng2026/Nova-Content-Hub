import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
const out=process.env.RELEASE_EVIDENCE_DIR,read=async p=>JSON.parse(await fs.readFile(p,'utf8')),pkg=await read(path.join(out,'package.json'));
const {snapshotPackage}=await import(path.join(process.cwd(),'plugin-src/src/lib/package-snapshot.mjs'));
const files=[];
for(const [name,entry] of Object.entries(await snapshotPackage(pkg.source))){if(!entry.sha256)continue;const h=await fs.open(path.join(pkg.source,name),'r');const b=Buffer.alloc(8);let n;try{n=(await h.read(b,0,8,0)).bytesRead;}finally{await h.close();}if(n===8&&[0xfeedfacf,0xfeedface,0xcafebabe,0xcafebabf].includes(b.readUInt32LE(0))){assert.equal(b.readUInt32LE(0),0xfeedfacf);assert.equal(b.readUInt32LE(4),0x0100000c);files.push(name);}}
assert.ok(files.length>=19);await fs.writeFile(path.join(out,'all-macho-files.json'),JSON.stringify({recordedAt:new Date().toISOString(),thinArm64:true,count:files.length,files},null,2)+'\n',{flag:'wx'});
const plugins=await read(path.join(out,'plugins.json')),runtimeSignatures=[];for(const file of [path.join(pkg.source,'Contents/Resources/plugin-marketplace/nova-content-hub/runtime/node'),...plugins.hosts.map(h=>path.join(h.root,'runtime/node'))]){execFileSync('/usr/bin/codesign',['--verify','--strict',file]);const detail=spawnSync('/usr/bin/codesign',['-dvv',file],{encoding:'utf8'});assert.equal(detail.status,0);runtimeSignatures.push({file,detail:detail.stdout+detail.stderr});}await fs.writeFile(path.join(out,'runtime-signatures.json'),JSON.stringify({recordedAt:new Date().toISOString(),runtimeSignatures},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:'PASS',machoCount:files.length,runtimeCount:runtimeSignatures.length}));
