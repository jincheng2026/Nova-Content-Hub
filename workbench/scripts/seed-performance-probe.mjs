// Diagnostic: seed only a new copy of an explicitly supplied library; never write its source.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {openLibrary, __testing} from '../../plugin-src/src/lib/file-library/index.mjs';
import {installBuiltins} from '../../plugin-src/src/lib/library-seed/index.mjs';
import {snapshotPackage} from '../../plugin-src/src/lib/package-snapshot.mjs';

const [source, output, maximumLocks] = process.argv.slice(2);
assert.ok(source && path.isAbsolute(source) && output && path.isAbsolute(output), 'Provide absolute source-library and output JSON paths');
const budget = maximumLocks === undefined ? Infinity : Number(maximumLocks);
assert.ok(budget === Infinity || Number.isSafeInteger(budget) && budget >= 0);
const root = await fsp.mkdtemp(path.join(await fsp.realpath(os.tmpdir()), 'nova-seed-performance-'));
process.env.NODE_ENV = 'test';
const target = path.join(root, 'library'), before = await snapshotPackage(source);
await fsp.cp(source, target, {recursive: true});
assert.deepEqual(await snapshotPackage(target), before);
const library = openLibrary(target), reads = {bundle: 0, assets: 0, otherLibrary: 0}, times = {};
let locks = 0;
const original = fs.readFileSync, originalOpen = fs.openSync, originalClose = fs.closeSync, descriptors = new Map();
fs.openSync = function(file, ...args) { const fd = Reflect.apply(originalOpen, this, [file, ...args]); descriptors.set(fd, file); return fd; };
fs.closeSync = function(fd) { try { return Reflect.apply(originalClose, this, [fd]); } finally { descriptors.delete(fd); } };
fs.readFileSync = function(file, ...args) {
    const input = typeof file === 'number' ? descriptors.get(file) : file;
    const relative = typeof input === 'string' ? path.relative(target, input) : null;
    const group = relative === null || relative.startsWith('..') || path.isAbsolute(relative) ? 'bundle' : relative.startsWith(`资产${path.sep}`) ? 'assets' : 'otherLibrary';
    const start = performance.now();
    try { return Reflect.apply(original, this, [file, ...args]); }
    finally { reads[group]++; times[group] = (times[group] ?? 0) + performance.now() - start; }
};
__testing.setHook(event => { if (event.phase === 'afterOwnerWrite') locks++; });
let report, durationMs;
try { const start = performance.now(); report = installBuiltins(library); durationMs = performance.now() - start; }
finally { __testing.setHook(undefined); fs.readFileSync = original; fs.openSync = originalOpen; fs.closeSync = originalClose; }
assert.equal(report.createdPrompts, 0, 'Fixture must already contain all builtins');
assert.equal(report.templates.length, 20);
assert.deepEqual(await snapshotPackage(source), before, 'Source library changed');
assert.deepEqual(await snapshotPackage(target), before, 'Repeat seed changed library bytes');
const result = {at: new Date().toISOString(), scope: 'Current Node core, copied prepared library, warm page cache; not Electron latency proof', root, fixture: {entries: Object.keys(before).length, digest: createHash('sha256').update(JSON.stringify(before)).digest('hex')}, durationMs, locks, reads, readTimeMs: times, unchanged: true, lockBudget: Number.isFinite(budget) ? budget : null, passed: locks <= budget};
await fsp.writeFile(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
assert.ok(result.passed, `Repeat seed used ${locks} durable lock/recovery cycles; budget ${budget}`);
