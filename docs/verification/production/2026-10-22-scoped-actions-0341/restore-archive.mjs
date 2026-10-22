import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {snapshotPackage} from '../../../../plugin-src/src/lib/package-snapshot.mjs';

const out=import.meta.dirname;
const pkg=JSON.parse(await fs.readFile(path.join(out,'package.json'),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(pkg.version,'0.3.41');
assert.equal(hash(await fs.readFile(pkg.dmg)),pkg.dmgSha256,'Frozen DMG bytes must match before restoration');
await assert.rejects(fs.lstat(pkg.source),{code:'ENOENT'});
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'nova-0341-archive-restoration-'));
const mount=path.join(temporary,'mount');
await fs.mkdir(mount);
let mounted=false;
try{
 execFileSync('/usr/bin/hdiutil',['attach',pkg.dmg,'-readonly','-nobrowse','-mountpoint',mount,'-plist'],{stdio:'pipe'});
 mounted=true;
 const source=path.join(mount,'自媒体工作台.app');
 const frozen=await snapshotPackage(source);
 assert.equal(Object.keys(frozen).length,pkg.entries);
 assert.equal(hash(JSON.stringify(frozen)),pkg.treeSha256,'Read-only DMG tree must match frozen receipt');
 await fs.mkdir(path.dirname(pkg.source),{recursive:true});
 execFileSync('/usr/bin/ditto',[source,pkg.source]);
 const restored=await snapshotPackage(pkg.source);
 assert.deepEqual(restored,frozen);
 execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',pkg.source]);
 const old=JSON.parse(await fs.readFile(path.join(out,'../2026-10-22-handoff-progress-0340/package.json'),'utf8'));
 let oldDmgCurrentlyExists;
 try{await fs.lstat(old.dmg);oldDmgCurrentlyExists=true;}catch(e){if(e.code!=='ENOENT')throw e;oldDmgCurrentlyExists=false;}
 const receipt={recordedAt:new Date().toISOString(),version:pkg.version,sourceCommit:pkg.sourceCommit,source:pkg.source,dmg:pkg.dmg,dmgSha256:pkg.dmgSha256,treeSha256:pkg.treeSha256,entries:pkg.entries,restoredFromShaVerifiedReadOnlyDmg:true,strictSignatureVerified:true,missingArchiveObserved:true,observedParentDirectoryChangeAt:'2026-10-22T07:21:06.923Z',deletionCause:'unknown',originalPackageReceiptPreserved:true,old0340Dmg:{path:old.dmg,historicallyVerifiedSha256:old.dmgSha256,historicalVerificationAt:'2026-10-22T07:19:46.628Z',currentlyExists:oldDmgCurrentlyExists},nativePayloadRecreated:false,installedAppMutated:false,userLibraryAccessed:false,deliveryMutated:false};
 await fs.writeFile(path.join(out,'archive-restoration.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({status:'PASS',...receipt}));
}finally{if(mounted)execFileSync('/usr/bin/hdiutil',['detach',mount],{stdio:'pipe'});}
