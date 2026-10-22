// Release-only evidence: artifact integrity and observed journal changes remain separate conclusions.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {snapshotPackage} from '../../../../plugin-src/src/lib/package-snapshot.mjs';
import {assertMachO} from '../../../../workbench/scripts/native-payload.mjs';
import {validateInstallerMarketplace} from '../../../../workbench/scripts/dist.mjs';

const out=import.meta.dirname,repo=path.resolve(out,'../../../..');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),digest=value=>hash(JSON.stringify(value));
const json=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const jsonBytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const pkg=await json(path.join(out,'package.json')),installation=await json(path.join(out,'installation.json'));
assert.equal(pkg.version,'0.3.41');assert.equal(pkg.sourceCommit,'310efee2bb00edf18a34dddf9027d6064b19697b');
assert.equal(pkg.dmgSha256,'49c1766e09396aecbfe7595f3654521e6c5ae7f5d6fd32d05ad92ebf166e5025');
assert.equal(pkg.treeSha256,'c786b6b9a95a9982f9cb5d1d442c10e9316b1ed8da6cd89231dcdd456288dcac');
const strict='docs/verification/production/2026-10-22-scoped-actions-0341/final-integrity.mjs';
assert.deepEqual(await fs.readFile(path.join(repo,strict)),execFileSync('git',['-C',repo,'show',`${pkg.sourceCommit}:${strict}`]),'Strict verifier must remain unchanged');
const target='/Applications/自媒体工作台.app',installed=await snapshotPackage(target),archived=await snapshotPackage(pkg.source);
assert.deepEqual(installed,archived);assert.equal(digest(installed),pkg.treeSha256);assert.equal(Object.keys(installed).length,1859);
execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',target]);
const signature=spawnSync('/usr/bin/codesign',['-dvv',target],{encoding:'utf8'});assert.equal(signature.status,0);assert.match(signature.stdout+signature.stderr,/Signature=adhoc/);
assert.equal(hash(await fs.readFile(pkg.dmg)),pkg.dmgSha256);
const files=(await fs.readdir(pkg.deliveryDirectory)).sort();
assert.deepEqual(files,['SHA256SUMS.txt','安装与使用.txt','自媒体工作台-0.3.41-Mac苹果芯片.dmg']);
assert.equal(hash(await fs.readFile(path.join(pkg.deliveryDirectory,files[2]))),pkg.dmgSha256);
assert.match(await fs.readFile(path.join(pkg.deliveryDirectory,'SHA256SUMS.txt'),'utf8'),new RegExp(pkg.dmgSha256));
for(const name of files.filter(x=>x.endsWith('.txt')))assert.doesNotMatch(await fs.readFile(path.join(pkg.deliveryDirectory,name),'utf8'),/研发|测试|验收|调试|probe|verification/i);
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'nova-0341-scoped-')),mount=path.join(temporary,'mount');await fs.mkdir(mount);
let mounted=false;
try{execFileSync('/usr/bin/hdiutil',['attach',pkg.dmg,'-readonly','-nobrowse','-mountpoint',mount,'-plist'],{stdio:'pipe'});mounted=true;assert.deepEqual(await snapshotPackage(path.join(mount,'自媒体工作台.app')),installed);}finally{if(mounted)execFileSync('/usr/bin/hdiutil',['detach',mount],{stdio:'pipe'});}
const app=path.join(target,'Contents/Resources/app'),release=await json(path.join(app,'workbench/dist/release.json'));
assert.deepEqual(release,pkg.release);assert.equal(release.AUTH_MODE,'disabled');assert.equal(release.productionReady,false);assert.equal(release.arch,'arm64');assert.equal(release.platform,'darwin');
assert.equal((await json(path.join(app,'package.json'))).version,pkg.version);assert.deepEqual(await json(path.join(app,'workbench/package.json')),{type:'module',main:'dist/main/index.mjs'});
const plist=JSON.parse(execFileSync('/usr/bin/plutil',['-convert','json','-o','-',path.join(target,'Contents/Info.plist')],{encoding:'utf8'}));
assert.equal(plist.CFBundleDisplayName,'自媒体工作台');assert.equal(plist.CFBundleVersion,pkg.version);assert.equal(plist.CFBundleShortVersionString,pkg.version);assert.equal(plist.NSHumanReadableCopyright,'© 2026 杭州新岛橙灵智能科技有限责任公司');
for(const relative of [...pkg.nativeArtifact.nativeFiles,'Contents/Resources/plugin-marketplace/nova-content-hub/runtime/node'])assertMachO(await fs.readFile(path.join(target,relative)),'arm64');
const market=path.join(target,'Contents/Resources/plugin-marketplace');await validateInstallerMarketplace(market,{...release,format:'nova-content-plugin-release'});
const transaction=await json(path.join(installation.installation.transaction,'record.json'));assert.equal(transaction.phase,'complete');
const{installedAssistantSkill}=await import(path.join(app,'workbench/dist/main/assistant-skill.mjs'));
const skills=[];for(const host of ['codex','workbuddy'])for(const capability of ['cover','template'])skills.push({host,capability,skill:installedAssistantSkill(host,release,{capability})});
let librarySnapshot=null;
try{
const protection=await json(path.join(out,'library-protection.json')),bindingBytes=await fs.readFile(protection.bindingFile),binding=JSON.parse(bindingBytes);
assert.deepEqual(binding.current,protection.current);assert.equal(digest(binding.current),installation.library.bindingSha256);
const baseline=await snapshotPackage(path.join(protection.backup,'library')),library=await snapshotPackage(binding.current.root);librarySnapshot={observedAt:new Date().toISOString(),sha256:digest(library),entries:Object.keys(library).length};
assert.equal(digest(baseline),'b6163320344103d8b401fff17806da42e8c65a087d6df9f202b17c4873f217ae');assert.equal(digest(baseline),installation.library.beforeSha256);
assert.equal(digest(library),'9e72b02b4b83dfe8a8b2912d3c1fafd873986036f07bfdeddd1742beaac81d5f');
const diff=[...new Set([...Object.keys(baseline),...Object.keys(library)])].sort().filter(p=>!isDeepStrictEqual(baseline[p],library[p])).map(p=>({path:p,before:baseline[p]??null,after:library[p]??null}));
const observedBytes=await fs.readFile(path.join(out,'library-diff-after-restoration.json')),observed=JSON.parse(observedBytes);const furtherBytes=await fs.readFile(path.join(out,'library-further-change.json')),further=JSON.parse(furtherBytes);assert.deepEqual(diff,further.allChangesFromInstallation);assert.equal(diff.length,71);assert.equal(Object.keys(baseline).length,2303);assert.equal(Object.keys(library).length,2371);assert.equal(further.additionalChanges.length,10);assert.ok(further.additionalChanges.every(x=>path.basename(x.path)==='.DS_Store'));const businessDiff=diff.filter(x=>path.basename(x.path)!=='.DS_Store');assert.deepEqual(businessDiff,observed.changes);
const contentId='12c4e2b6-ea9d-4b3b-8ed6-37c107e23d64',content=`内容/${contentId}/内容.json`,body=`内容/${contentId}/正文.md`;
assert.deepEqual(businessDiff.filter(x=>x.before).map(x=>x.path),[content]);assert.equal(businessDiff.filter(x=>!x.before).length,60);assert.equal(diff.filter(x=>!x.after).length,0);
const deltas=(a,b,p='')=>{if(isDeepStrictEqual(a,b))return[];if(a&&b&&typeof a==='object'&&typeof b==='object')return[...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>deltas(a[k],b[k],p+'/'+k));return[{field:p,before:a,after:b}];};
const decode=entry=>{assert.deepEqual(Object.keys(entry).sort(),['bytes','sha256']);const bytes=Buffer.from(entry.bytes,'base64');assert.equal(bytes.toString('base64'),entry.bytes);assert.equal(hash(bytes),entry.sha256);return bytes;};
const read=p=>fs.readFile(path.join(binding.current.root,p));const journals=[];
for(const entry of diff.filter(x=>x.path.endsWith('/intent.json'))){
 const raw=await read(entry.path),intent=JSON.parse(raw),dir=path.dirname(entry.path);
 assert.deepEqual(Object.keys(intent).sort(),['schemaVersion','libraryId','mutationId','objectKind','objectId','operation','requestDigest','before','after'].sort());
 assert.equal(intent.schemaVersion,3);assert.equal(intent.libraryId,binding.current.libraryId);assert.equal(intent.objectKind,'content');assert.equal(intent.objectId,contentId);assert.equal(intent.operation,'update');assert.equal(path.basename(dir),intent.mutationId);
 assert.equal(intent.before.length,2);assert.equal(intent.after.length,2);const before=intent.before.map(decode),after=intent.after.map(decode),old=JSON.parse(before[0]),next=JSON.parse(after[0]);
 assert.deepEqual(before[1],after[1]);assert.deepEqual(before[1],await fs.readFile(path.join(protection.backup,'library',body)));assert.equal(next.revision,old.revision+1);assert.equal(next.createdAt,old.createdAt);assert.equal(next.deletedAt,null);
 const names=await fs.readdir(path.join(binding.current.root,dir)),markers=names.filter(x=>x.startsWith('.COMMITTED-'));assert.equal(markers.length,1);assert.deepEqual(names.sort(),[markers[0],'COMMITTED','captured-0','intent.json'].sort());
 assert.deepEqual(await read(`${dir}/captured-0`),before[0]);const marker=Buffer.from(hash(raw)+'\n');assert.deepEqual(await read(`${dir}/COMMITTED`),marker);assert.deepEqual(await read(`${dir}/${markers[0]}`),marker);
 const changes=deltas(old,next),business=changes.filter(x=>!['/revision','/updatedAt'].includes(x.field));let input;
 if(business.length===1&&/^\/candidates\/[01]\/favorite$/.test(business[0].field)){const index=Number(business[0].field.split('/')[2]);const c=next.candidates[index];input={action:'updateCandidate',candidateId:c.id,favorite:c.favorite,displayNumber:c.displayNumber,note:c.note,variantId:c.variantId};}
 else if(business.some(x=>x.field==='/selectedCover/candidateId')){assert.equal(business.length,4);assert.ok(business.every(x=>/^\/candidates\/[01]\/acceptedAt$|^\/selectedCover\/(candidateId|assetHash|selectedAt)$/.test(x.field)));input={action:'selectCover',candidateId:next.selectedCover.candidateId,variantId:null};}
 else{assert.deepEqual(business.map(x=>x.field),['/plans/0/text','/plans/0/updatedAt']);const plan=next.plans[0];input={action:'savePlan',id:plan.id,channelId:plan.channelId,text:plan.text,schedule:plan.schedule,coverChoice:plan.coverChoice};}
 const expectedToken=hash(Buffer.concat(before.map(bytes=>Buffer.from(hash(bytes),'hex'))));assert.equal(intent.requestDigest,hash(jsonBytes({operation:'update',contentId,input,expectedToken})));
 journals.push({mutationId:intent.mutationId,operation:input.action,input,beforeRevision:old.revision,afterRevision:next.revision,updatedAt:next.updatedAt,intentSha256:hash(raw),capturedSha256:hash(before[0]),afterSha256:hash(after[0]),bodySha256:hash(before[1]),requestDigest:intent.requestDigest,changes,before,after});
}
assert.equal(journals.length,12);journals.sort((a,b)=>a.beforeRevision-b.beforeRevision);let previous=[await fs.readFile(path.join(protection.backup,'library',content)),await fs.readFile(path.join(protection.backup,'library',body))];
for(const[j,journal]of journals.entries()){assert.equal(journal.beforeRevision,12+j);assert.deepEqual(journal.before,previous);previous=journal.after;}
assert.deepEqual(previous[0],await read(content));assert.deepEqual(previous[1],await read(body));assert.deepEqual(await snapshotPackage(binding.current.root),library,'Library changed during verification');assert.deepEqual(await fs.readFile(protection.bindingFile),bindingBytes);
const failure=await fs.readFile(path.join(out,'logs/final-integrity-after-archive-restoration.log'));assert.match(failure.toString(),/ERR_ASSERTION/);assert.match(failure.toString(),new RegExp(observed.afterSha256));assert.match(failure.toString(),new RegExp(digest(baseline)));
const restoration=await json(path.join(out,'archive-restoration.json'));assert.equal(restoration.old0340Dmg.currentlyExists,false);assert.equal(restoration.nativePayloadRecreated,false);await assert.rejects(fs.lstat(restoration.old0340Dmg.path),{code:'ENOENT'});await assert.rejects(fs.lstat(pkg.nativeArtifact.path),{code:'ENOENT'});
const receipt={recordedAt:new Date().toISOString(),status:'ARTIFACTS_VERIFIED_LIBRARY_CHANGED',version:pkg.version,sourceCommit:pkg.sourceCommit,artifactIntegrity:true,strictLibraryUnchanged:false,strictVerifierUnmodified:true,strictFailurePreserved:{file:'logs/final-integrity-after-archive-restoration.log',sha256:hash(failure)},artifacts:{installed:target,archived:pkg.source,entries:pkg.entries,treeSha256:pkg.treeSha256,dmg:pkg.dmg,dmgSha256:pkg.dmgSha256,deliveryDirectory:pkg.deliveryDirectory,deliveryFiles:files,readOnlyDmgTreeVerified:true,strictSignatureVerified:true,developerIdSigned:false,notarized:false,nativeArch:'darwin-arm64',pairedMarketplaceVerified:true,transactionPhase:transaction.phase,skills},library:{bindingCurrentPreserved:true,originalBackupVerified:true,beforeEntries:2303,currentEntries:2371,beforeSha256:digest(baseline),currentSha256:digest(library),observedAt:librarySnapshot.observedAt,stableSecondRead:true,businessDiffReceiptSha256:hash(observedBytes),finderMetadataReceiptSha256:hash(furtherBytes),exactDiff:diff,businessAndJournalDiffEntries:61,finderMetadataDiffEntries:10,finderMetadataChanges:further.additionalChanges,existingBusinessEntriesChanged:1,addedJournalEntries:60,originalEntriesRemoved:0,allOtherOriginalBusinessEntriesUnchanged:true,journalChainVerified:true,journalCount:12,revisionBefore:12,revisionAfter:24,bodyUnchanged:true,originalAssetsUnchanged:true,semanticDiff:deltas(JSON.parse(await fs.readFile(path.join(protection.backup,'library',content))),JSON.parse(await read(content))),journals:journals.map(({before,after,...j})=>j)},attribution:{initiatorIndependentlyProven:false,interpretation:'Committed journal bytes prove favorite toggles, selected-cover changes and one publication-text correction. They do not prove who initiated the actions. Root reports no business-write actions and concurrent user-interaction tool warnings; native evidence is recorded separately.'},missingHistoricalArtifacts:{old0340DmgCurrentlyAvailable:false,nativePayloadCurrentlyAvailable:false,archiveRestoredFromExactDmg:true},scope:'Release artifact integrity plus exact observed library-change record; strict unchanged-library acceptance remains failed. No installed app, user library or delivery writes; no native UI acceptance inferred.'};
await fs.writeFile(path.join(out,'final-scoped-integrity.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,artifactIntegrity:true,strictLibraryUnchanged:false,transactionPhase:transaction.phase,journalChainVerified:true,journalCount:12,exactDiffEntries:71,currentLibrarySha256:digest(library),operations:journals.map(j=>({revision:j.afterRevision,operation:j.operation}))}));

}catch(error){const receipt={recordedAt:new Date().toISOString(),status:'ARTIFACTS_VERIFIED_LIBRARY_SNAPSHOT_NOT_ACCEPTED',version:pkg.version,sourceCommit:pkg.sourceCommit,artifactIntegrity:true,strictLibraryUnchanged:false,strictVerifierUnmodified:true,artifactChecks:{installedAndArchivedTreeSha256:pkg.treeSha256,dmgSha256:pkg.dmgSha256,deliveryFiles:files,readOnlyDmgTreeVerified:true,signatureVerified:true,transactionPhase:transaction.phase,skills},librarySnapshot,libraryStableForScopedAcceptance:false,libraryVerificationError:String(error),scope:'Artifact checks completed independently. The current library did not meet the bounded explicit snapshot assertions; no new baseline, no full-library acceptance, and no library writes.'};await fs.writeFile(path.join(out,'final-scoped-integrity.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));}
