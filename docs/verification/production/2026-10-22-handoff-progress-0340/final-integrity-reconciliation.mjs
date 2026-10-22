// This release-only reconciliation accepts one observed photo soft deletion; every other byte must match the installation backup.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {snapshotPackage} from '../../../../plugin-src/src/lib/package-snapshot.mjs';

const out = import.meta.dirname;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => hash(JSON.stringify(value));
const photoId = 'a62b4874-ec22-486b-bf3d-480ebe7071b4';
const mutationId = '0fab52d6-0a47-413c-aeac-004b95d4d475';
const deletedAt = '2026-10-22T05:44:27.321Z';
const photo = `我的照片/${photoId}/照片.json`;
const transaction = `系统（别动）/事务/已提交/${mutationId}`;
const marker = '.COMMITTED-d8104d9b-4fb3-4dc2-80e8-97def56a637d';
const beforeSha256 = 'b59082a08f68172c8853987c2ec83afc93085c6148683bf4f26b82287c832ec4';
const afterSha256 = 'e30e75e715726d4d67b4922ab531329d091f481f0449b33658bd6dd0ed04f180';

export async function verifyReconciliation(installation, binding, library) {
  assert.equal(installation.library.beforeSha256, beforeSha256);
  assert.equal(installation.library.afterSha256, beforeSha256);
  assert.equal(digest(binding.current), installation.library.bindingSha256);
  const baseline = await snapshotPackage(path.join(installation.libraryRecoveryDirectory, 'library'));
  assert.equal(digest(baseline), beforeSha256, 'Original installation backup must remain unchanged');
  assert.equal(digest(library), afterSha256, 'Any further user changes require a new explicit reconciliation');
  const diff = [...new Set([...Object.keys(baseline), ...Object.keys(library)])].sort().filter(file => JSON.stringify(baseline[file]) !== JSON.stringify(library[file])).map(file => ({path: file, ...(baseline[file] ? {before: baseline[file]} : {}), ...(library[file] ? {after: library[file]} : {})}));
  assert.deepEqual(diff.map(entry => entry.path).sort(), [photo, transaction, ...[marker, 'COMMITTED', 'captured-0', 'intent.json'].map(file => `${transaction}/${file}`)].sort());
  assert.equal(Object.keys(baseline).length, 2283); assert.equal(Object.keys(library).length, 2288);
  const read = file => fs.readFile(path.join(binding.current.root, file));
  const oldBytes = await fs.readFile(path.join(installation.libraryRecoveryDirectory, 'library', photo));
  const newBytes = await read(photo), oldPhoto = JSON.parse(oldBytes), newPhoto = JSON.parse(newBytes);
  assert.equal(oldPhoto.id, photoId); assert.equal(oldPhoto.revision, 1); assert.equal(oldPhoto.deletedAt, null);
  assert.deepEqual(newPhoto, {...oldPhoto, revision: 2, updatedAt: deletedAt, deletedAt});
  const intentBytes = await read(`${transaction}/intent.json`), intent = JSON.parse(intentBytes);
  assert.deepEqual(Object.keys(intent).sort(), ['schemaVersion', 'libraryId', 'mutationId', 'objectKind', 'objectId', 'operation', 'requestDigest', 'before', 'after'].sort());
  assert.equal(intent.schemaVersion, 3); assert.equal(intent.libraryId, binding.current.libraryId);
  assert.equal(intent.mutationId, mutationId); assert.equal(intent.objectKind, 'photo'); assert.equal(intent.objectId, photoId); assert.equal(intent.operation, 'trash');
  assert.deepEqual(intent.before, [{bytes: oldBytes.toString('base64'), sha256: hash(oldBytes)}]);
  assert.deepEqual(intent.after, [{bytes: newBytes.toString('base64'), sha256: hash(newBytes)}]);
  const expectedToken = hash(Buffer.from(hash(oldBytes), 'hex'));
  assert.equal(intent.requestDigest, hash(Buffer.from(JSON.stringify({objectKind: 'photo', operation: 'trash', objectId: photoId, input: {}, expectedToken}, null, 2) + '\n')));
  assert.deepEqual(await read(`${transaction}/captured-0`), oldBytes);
  const committed = Buffer.from(hash(intentBytes) + '\n');
  assert.deepEqual(await read(`${transaction}/COMMITTED`), committed); assert.deepEqual(await read(`${transaction}/${marker}`), committed);
  const evidence = [];
  for (const file of ['system/acceptance-library-baseline.json', 'system/native-library-diff.json', 'system/concurrent-user-change.json', 'system/native-acceptance.json', 'system/native-settings.txt']) {
    const bytes = await fs.readFile(path.join(out, file)); evidence.push({path: file, sha256: hash(bytes)});
    if (file.endsWith('.txt')) { assert.equal((bytes.toString().match(/按钮 管理照片：/g) ?? []).length, 5); continue; }
    const value = JSON.parse(bytes);
    if (file.endsWith('acceptance-library-baseline.json')) { assert.equal(value.sha256, beforeSha256); assert.deepEqual(value.binding, binding.current); }
    if (file.endsWith('native-library-diff.json')) assert.deepEqual(value.diff, diff);
    if (file.endsWith('concurrent-user-change.json')) {
      assert.equal(value.before.managedPhotoButtons, 5); assert.equal(value.after.managedPhotoButtons, 4);
      assert.match(value.exactToolResponse, /The user changed/); assert.match(value.agentActions, /No photo-management\/delete\/save action/);
    }
    if (file.endsWith('native-acceptance.json')) {
      assert.equal(value.sourceCommit, installation.sourceCommit); assert.equal(value.version, installation.version);
      assert.equal(value.systemPermission.permissionPending, false); assert.equal(value.systemPermission.libraryLoaded, true);
      assert.equal(value.nativeChecks.normalQuit.exactProcessAbsentVerified, true); assert.equal(value.nativeChecks.normalReopen.originalLibraryAndCoverReloaded, true);
    }
  }
  assert.deepEqual(await snapshotPackage(binding.current.root), library, 'Library changed during reconciliation');
  return {format: 'nova-0340-single-photo-deletion-reconciliation', sourceCommit: installation.sourceCommit, libraryId: binding.current.libraryId, bindingSha256: installation.library.bindingSha256, beforeSha256, afterSha256, entriesBefore: 2283, entriesAfter: 2288, mutationId, photoId, operation: 'trash', deletedAt, intentSha256: hash(intentBytes), capturedBeforeSha256: hash(oldBytes), photoAfterSha256: hash(newBytes), diff, allOtherEntriesUnchanged: true, evidence, scope: 'Only this observed concurrent user photo soft deletion and its committed journal are reconciled; no rollback, generation or other library change is accepted.'};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2);
  const installation = JSON.parse(await fs.readFile(path.join(out, 'installation.json'), 'utf8'));
  const binding = JSON.parse(await fs.readFile('/Users/mac/Library/Application Support/Nova 内容库技术验证/machine-binding.json', 'utf8'));
  const receipt = {recordedAt: new Date().toISOString(), ...await verifyReconciliation(installation, binding, await snapshotPackage(binding.current.root))};
  await fs.writeFile(path.join(out, 'final-integrity-reconciliation.json'), JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx'});
  console.log(JSON.stringify({status: 'PASS', ...receipt}));
}
