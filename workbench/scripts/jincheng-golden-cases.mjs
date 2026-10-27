/** Read source cases without executing HTML or changing the original Vault. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const GOLDEN_CASES = Object.freeze([
    ['T020', '05_内容草稿/T020_AI是00后最值得抓住的杠杆/T020_创作页.html'],
    ['T029', '05_内容草稿/T029_WorkBuddy必装三个Skill/T029_创作页.html'],
    ['T026', '05_内容草稿/已做/T026_书籍蒸馏成Skill/T026_创作页.html'],
    ['T044', '05_内容草稿/已做/T044_AI变现与执行力/T044_创作页.html'],
]);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function regularFile(root, relative) {
    let location = root;
    for (const part of relative.split('/')) {
        location = path.join(location, part);
        if (fs.lstatSync(location).isSymbolicLink()) throw Error('SYMLINK_REJECTED');
    }
    const stat = fs.statSync(location);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 16 * 1024 * 1024) throw Error('INVALID_SOURCE');
    return location;
}
function inspect(bytes) {
    const matches = [...bytes.toString('utf8').matchAll(/<script\b(?=[^>]*\bid=["']jc-doc["'])(?=[^>]*\btype=["']application\/json["'])[^>]*>([\s\S]*?)<\/script\s*>/gi)];
    if (matches.length !== 1) throw Error('JC_DOC_REQUIRED');
    const doc = JSON.parse(matches[0][1]);
    if (!Array.isArray(doc.items) || typeof doc.page_id !== 'string') throw Error('INVALID_JC_DOC');
    const kinds = {}, fields = {};
    for (const item of doc.items) {
        kinds[item.kind] = (kinds[item.kind] ?? 0) + 1;
        for (const [key, value] of Object.entries(item.fields ?? {})) {
            if (typeof value === 'string' && value.trim()) fields[key] = (fields[key] ?? 0) + 1;
        }
    }
    return {pageId: doc.page_id, kinds, nonemptyFields: fields, dataHash: hash(JSON.stringify(doc))};
}
export function freezeGoldenCases(source, destination) {
    if (!path.isAbsolute(source) || !path.isAbsolute(destination)) throw Error('ABSOLUTE_ROOT_REQUIRED');
    if (fs.lstatSync(source).isSymbolicLink()) throw Error('SYMLINK_REJECTED');
    source = fs.realpathSync(source);
    const parent = fs.realpathSync(path.dirname(destination));
    destination = path.join(parent, path.basename(destination));
    const relative = path.relative(source, destination);
    const reverse = path.relative(destination, source);
    if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)) || (!reverse.startsWith(`..${path.sep}`) && reverse !== '..' && !path.isAbsolute(reverse))) throw Error('COPY_REQUIRED');
    if (fs.existsSync(destination)) throw Error('DESTINATION_MUST_BE_NEW');
    // Validate every source before creating any output.
    const cases = GOLDEN_CASES.map(([workId, relativePath]) => {
        const original = regularFile(source, relativePath), bytes = fs.readFileSync(original);
        return {workId, relativePath, original, bytes, sha256: hash(bytes), ...inspect(bytes)};
    });
    fs.mkdirSync(destination, {mode: 0o700});
    for (const name of ['00_个人背景', '04_选题库', '05_内容草稿']) fs.mkdirSync(path.join(destination, name));
    const samples = cases.map(({bytes, ...entry}) => {
        const copy = path.join(destination, entry.relativePath);
        fs.mkdirSync(path.dirname(copy), {recursive: true});
        fs.writeFileSync(copy, bytes, {flag: 'wx', mode: 0o600});
        if (hash(fs.readFileSync(entry.original)) !== entry.sha256) throw Error('SOURCE_CHANGED');
        return {...entry, copy, currentAuthority: entry.workId === 'T020' ? 'conflict-with-later-working-draft; historical-page-only' : 'source-page; not-proof-of-latest-authority'};
    });
    const manifest = {format: 'jincheng-golden-cases', version: 1, createdAt: new Date().toISOString(), sourceRoot: source, copyRoot: destination, samples};
    fs.writeFileSync(path.join(destination, 'golden-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {flag: 'wx', mode: 0o600});
    return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const args = process.argv.slice(2);
    if (args.length !== 4 || args[0] !== '--source' || args[2] !== '--out') throw Error('Use --source <absolute-vault> --out <new-absolute-copy>');
    const manifest = freezeGoldenCases(args[1], args[3]);
    process.stdout.write(JSON.stringify({copyRoot: manifest.copyRoot, cases: manifest.samples.map(({workId, kinds, nonemptyFields, sha256}) => ({workId, kinds, nonemptyFields, sha256}))}, null, 2) + '\n');
}
