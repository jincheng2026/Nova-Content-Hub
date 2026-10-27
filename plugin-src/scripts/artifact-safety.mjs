import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isUtf8} from 'node:buffer';
import {gunzipSync, inflateRawSync} from 'node:zlib';

// Release-only rules: no developer home, environment or runtime userData is read.
const localNames = /^(?:credentials?(?:[._-].*)?|service-settings(?:[._-].*)?|machine-binding(?:[._-].*)?|local-preferences(?:[._-].*)?)\.(?:json|json5|enc|db|sqlite|tmp|bak)$/i;
const omittedDirectories = new Set(['test', 'tests', '__tests__', 'fixture', 'fixtures', '__fixtures__', 'logs', '.local-probes', '.git']);
const fixtureName = /(?:\.(?:test|spec)\.|(?:^|[._-])fixture(?:[._-]|$))/i;
const textExtension = /\.(?:[cm]?[jt]sx?|json5?|html?|css|md|txt|ya?ml|toml|ini|cfg|conf|sh|cmd|ps1|xml|pem|key)$/i;
const opaqueArchive = /\.(?:7z|rar|asar|bz2|xz|zst)$/i;
const maxText = 16 * 1024 * 1024, maxEntry = 64 * 1024 * 1024, maxArchive = 256 * 1024 * 1024;
const slash = value => value.replaceAll('\\', '/');
const dependency = file => slash(file).replaceAll('!', '/').split('/').includes('node_modules');
function pathRule(relative) {
    const parts = slash(relative).split('/'), name = parts.at(-1);
    if (name.startsWith('.env') && name !== '.env.example') return 'ENV_FILE';
    if (localNames.test(name) || ['.npmrc', '.netrc', '内容库.json'].includes(name)) return 'LOCAL_STATE';
    if (!dependency(relative) && (parts.some(part => omittedDirectories.has(part)) || fixtureName.test(name) || /\.(?:log|sqlite3?|db)$/i.test(name))) return 'USER_DATA_OR_FIXTURE';
    return null;
}

export function releaseSourceFilter(input) {
    return !pathRule(slash(input));
}

const placeholder = value => /^(?:<[^>]+>|\$\{[^}]+\}|(?:your|example|sample|mock|fake|dummy|test|placeholder|replace|insert)(?:[\s_:-].*)?|(?:x|\*|•){3,})$/i.test(value);
const credentialName = /^(?:api[_-]?key|access[_-]?(?:key|token)|secret[_-]?key|auth[_-]?token|client[_-]?secret|(?:tikhub|model|asr|groq|custom|openai|anthropic|volc)[_-]?(?:(?:api|access|secret)[_-]?)?(?:key|token|secret))$/i;
const secretLiteral = value => value.length >= 16 && !placeholder(value) && /^[A-Za-z0-9_+./=-]+$/.test(value);
function contentRules(bytes, file, allowExampleLibrary) {
    const text = bytes.toString('utf8'), rules = new Set();
    if (path.posix.basename(file.split('!').at(-1)) === '.env.example') {
        for (const line of text.split(/\r?\n/)) {
            if (!line.trim() || /^\s*#/.test(line)) continue;
            if (!/^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*(?:''|""|)\s*(?:#.*)?$/.test(line)) rules.add('ENV_EXAMPLE_VALUE');
        }
    }
    if (/-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/.test(text)) rules.add('PRIVATE_KEY');
    for (const match of text.matchAll(/\b(?:sk-(?:proj-|svcacct-|ant-api\d+-)?[A-Za-z0-9_-]{20,}|gsk_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16})\b/g)) if (!placeholder(match[0].replace(/^(?:sk-(?:proj-|svcacct-|ant-api\d+-)?|gsk_)/, ''))) rules.add('PROVIDER_KEY');
    // Third-party packages are checked for explicit provider/private keys, never generic entropy.
    if (dependency(file)) return rules;
    for (const match of text.matchAll(/["'`]?([A-Za-z][A-Za-z0-9_-]*)["'`]?\s*[:=]\s*(["'`])([^\r\n"'`]+)\2/g)) {
        if (credentialName.test(match[1]) && secretLiteral(match[3])) rules.add('CREDENTIAL_LITERAL');
    }
    // Bare scalars are meaningful in config/shell files, not JS/TS variable expressions.
    const member = file.split('!').at(-1);
    if (/\.(?:ya?ml|ini|cfg|conf|toml|sh|bash|zsh|cmd|ps1)$/i.test(member) || /^#![^\r\n]*\b(?:ba|z|k)?sh\b/.test(text)) {
        for (const line of text.split(/\r?\n/)) {
            const assignment = /^[ \t]*(?:-[ \t]+)?(?:(?:export|set)[ \t]+)?["']?([A-Za-z][A-Za-z0-9_-]*)["']?[ \t]*[:=][ \t]*([A-Za-z0-9_+./=-]+)[ \t]*(?:[#;].*)?$/.exec(line);
            if (!assignment || !credentialName.test(assignment[1])) continue;
            const value = assignment[2];
            if (/^(?:process\.env|import\.meta\.env|os\.environ|env|settings|config|credentials|secrets)\./.test(value)) continue;
            if (secretLiteral(value)) rules.add('CREDENTIAL_LITERAL');
        }
    }
    for (const match of text.matchAll(/\bBearer\s+([A-Za-z0-9_+./=-]{16,})/g)) if (!placeholder(match[1])) rules.add('BEARER_LITERAL');
    if (/\.json$/i.test(file) || /^\s*[\[{]/.test(text)) {
        let data; try {data = JSON.parse(text);} catch {return rules;}
        const visit = (value, serviceScope = false) => {
            if (!value || typeof value !== 'object') return;
            if (value.format === 'nova-content-library' && !allowExampleLibrary) rules.add('CONTENT_LIBRARY');
            if (allowExampleLibrary && value.format === 'nova-content' && value.isExample !== true) rules.add('NON_EXAMPLE_CONTENT');
            if (value.version === 1 && value.values && value.keys && typeof value.keys === 'object' && Object.values(value.keys).some(key => typeof key === 'string' && key.length)) rules.add('ENCRYPTED_CREDENTIAL_STORE');
            for (const [key, nested] of Object.entries(value)) {
                if ((credentialName.test(key) || serviceScope && /^(?:key|token|secret)$/i.test(key)) && typeof nested === 'string' && secretLiteral(nested)) rules.add('CREDENTIAL_LITERAL');
                visit(nested, serviceScope || /^(?:tikhub|model|asr|groq|custom|openai|anthropic|volc)$/i.test(key));
            }
        };
        visit(data);
    }
    return rules;
}

// Entry paths are never extracted to disk. Bounds and a closed set of formats avoid archive bypasses.
function archiveEntries(bytes, kind) {
    const entries = [];
    let expanded = 0;
    if (kind === 'zip') {
        let end = -1;
        for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index--) if (bytes.readUInt32LE(index) === 0x06054b50) {end = index; break;}
        if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) throw Error('ARCHIVE_INVALID');
        const count = bytes.readUInt16LE(end + 10); let cursor = bytes.readUInt32LE(end + 16);
        if (count === 65535 || cursor === 0xffffffff || cursor + bytes.readUInt32LE(end + 12) > end) throw Error('ARCHIVE_UNSUPPORTED');
        for (let index = 0; index < count; index++) {
            if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) throw Error('ARCHIVE_INVALID');
            const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10), compressed = bytes.readUInt32LE(cursor + 20), size = bytes.readUInt32LE(cursor + 24);
            const nameSize = bytes.readUInt16LE(cursor + 28), extraSize = bytes.readUInt16LE(cursor + 30), commentSize = bytes.readUInt16LE(cursor + 32), local = bytes.readUInt32LE(cursor + 42);
            const mode = bytes.readUInt32LE(cursor + 38) >>> 16;
            const name = bytes.subarray(cursor + 46, cursor + 46 + nameSize).toString('utf8');
            cursor += 46 + nameSize + extraSize + commentSize;
            if (cursor > end || flags & 1 || ![0, 8].includes(method) || (mode & 0xf000) === 0xa000) throw Error('ARCHIVE_UNSUPPORTED');
            expanded += size;
            if (size > maxEntry || compressed > maxArchive || expanded > maxArchive) throw Error('ARCHIVE_LIMIT');
            if (local + 30 > bytes.length || bytes.readUInt32LE(local) !== 0x04034b50) throw Error('ARCHIVE_INVALID');
            const localNameLength = bytes.readUInt16LE(local + 26);
            if (bytes.subarray(local + 30, local + 30 + localNameLength).toString('utf8') !== name) throw Error('ARCHIVE_INVALID');
            const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
            if (start + compressed > bytes.length) throw Error('ARCHIVE_INVALID');
            const payload = bytes.subarray(start, start + compressed);
            const content = method === 8 ? inflateRawSync(payload, {maxOutputLength:maxEntry}) : payload;
            if (content.length !== size) throw Error('ARCHIVE_INVALID');
            entries.push({name, bytes:content, directory:name.endsWith('/')});
        }
    } else {
        let cursor = 0;
        while (cursor + 512 <= bytes.length) {
            const header = bytes.subarray(cursor, cursor + 512);
            if (header.every(byte => byte === 0)) break;
            const field = (start, length) => header.subarray(start, start + length).toString('utf8').split('\0')[0];
            const rawSize = field(124, 12).trim();
            if (!/^[0-7]+$/.test(rawSize)) throw Error('ARCHIVE_INVALID');
            const size = Number.parseInt(rawSize, 8), type = field(156, 1), prefix = field(345, 155), name = (prefix ? prefix + '/' : '') + field(0, 100);
            if (size > maxEntry) throw Error('ARCHIVE_LIMIT');
            if (!['', '0', '5'].includes(type)) throw Error('ARCHIVE_UNSUPPORTED');
            cursor += 512;
            if (cursor + size > bytes.length) throw Error('ARCHIVE_INVALID');
            entries.push({name, bytes:bytes.subarray(cursor, cursor + size), directory:type === '5'});
            cursor += Math.ceil(size / 512) * 512;
        }
        if (!entries.length || cursor > bytes.length) throw Error('ARCHIVE_INVALID');
    }
    return entries;
}

export async function assertArtifactSafe(input, {allowGeneratedExampleLibrary = false} = {}) {
    const findings = [], add = (file, rule) => findings.push({file, rule});
    let expanded = 0;
    const scan = (bytes, file, depth = 0) => {
        const clean = file.split('!').at(-1);
        const issue = pathRule(clean);
        if (issue && !(allowGeneratedExampleLibrary && path.posix.basename(clean) === '内容库.json')) {add(file, issue); return;}
        const kind = /\.zip$/i.test(clean) || bytes.subarray(0, 4).equals(Buffer.from([80,75,3,4])) ? 'zip' : /\.tar$/i.test(clean) || bytes.subarray(257, 262).toString() === 'ustar' ? 'tar' : /\.(?:gz|tgz)$/i.test(clean) || bytes[0] === 31 && bytes[1] === 139 ? 'gzip' : null;
        if (opaqueArchive.test(clean) || bytes.subarray(0, 6).equals(Buffer.from([55,122,188,175,39,28])) || bytes.subarray(0,4).toString() === 'Rar!') {add(file, 'ARCHIVE_UNSUPPORTED'); return;}
        if (kind) {
            if (depth >= 4 || bytes.length > maxArchive) {add(file, 'ARCHIVE_LIMIT'); return;}
            try {
                const entries = kind === 'gzip'
                    ? [{name:path.posix.basename(clean).replace(/\.tgz$/i, '.tar').replace(/\.gz$/i, '') || 'payload', bytes:gunzipSync(bytes, {maxOutputLength:maxEntry})}]
                    : archiveEntries(bytes, kind);
                for (const entry of entries) {
                    const name = slash(entry.name);
                    if (!name || /^[A-Za-z]:|^\//.test(name) || /[\u0000-\u001f\u007f]/.test(name) || name.split('/').includes('..')) {add(file, 'ARCHIVE_PATH'); continue;}
                    expanded += entry.bytes.length;
                    if (expanded > maxArchive) throw Error('ARCHIVE_LIMIT');
                    const relative = file + '!' + name;
                    if (entry.directory) {const rule = pathRule(name.replace(/\/$/, '')); if (rule) add(relative, rule);}
                    else scan(entry.bytes, relative, depth + 1);
                }
            } catch (error) {add(file, error.code === 'ERR_BUFFER_TOO_LARGE' ? 'ARCHIVE_LIMIT' : /^ARCHIVE_/.test(error.message) ? error.message : 'ARCHIVE_INVALID');}
        } else if (textExtension.test(clean) || path.posix.basename(clean) === '.env.example' || isUtf8(bytes.subarray(0, 8192))) {
            if (bytes.length > maxText) {if (!dependency(file)) add(file, 'TEXT_LIMIT'); return;}
            if (!bytes.subarray(0, 8192).includes(0)) for (const rule of contentRules(bytes, file, allowGeneratedExampleLibrary)) add(file, rule);
        }
    };
    const root = path.resolve(input);
    if (!fs.lstatSync(root).isDirectory()) throw Error('Artifact scan requires a directory');
    const canonical = fs.realpathSync(root);
    const headInfo = file => {
        const handle = fs.openSync(file, 'r');
        try {const sample = Buffer.alloc(8192), count = fs.readSync(handle, sample); const bytes = sample.subarray(0,count); return {text:!bytes.includes(0) && isUtf8(bytes), archive:bytes.subarray(0,4).equals(Buffer.from([80,75,3,4])) || bytes[0] === 31 && bytes[1] === 139 || bytes.subarray(257,262).toString() === 'ustar'};}
        finally {fs.closeSync(handle);}
    };
    const walk = directory => {
        for (const entry of fs.readdirSync(directory, {withFileTypes:true}).sort((a,b) => a.name.localeCompare(b.name))) {
            const absolute = path.join(directory, entry.name), file = slash(path.relative(root, absolute));
            const issue = pathRule(file);
            if (issue && !(allowGeneratedExampleLibrary && entry.name === '内容库.json')) {add(file, issue); continue;}
            const stat = fs.lstatSync(absolute);
            if (stat.isSymbolicLink()) {
                let target; try {target = fs.realpathSync(absolute);} catch {add(file, 'SYMLINK_INVALID'); continue;}
                const relative = path.relative(canonical, target);
                if (path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep)) add(file, 'SYMLINK_OUTSIDE');
                else if (fs.statSync(target).isFile()) {
                    if (fs.statSync(target).size > maxText) add(file, 'SYMLINK_FILE_LIMIT');
                    else scan(fs.readFileSync(target), file);
                }
                // Internal directories are visited through their canonical tree entries.
            } else if (stat.isDirectory()) walk(absolute);
            else if (stat.isFile()) {
                if (opaqueArchive.test(file)) {add(file, 'ARCHIVE_UNSUPPORTED'); continue;}
                const info = stat.size > maxText ? headInfo(absolute) : null;
                const archive = /\.(?:zip|tar|tgz|gz)$/i.test(file) || info?.archive;
                if (stat.size > maxArchive) {if (archive) add(file, 'ARCHIVE_LIMIT'); else if (!dependency(file) && (textExtension.test(file) || info?.text)) add(file, 'TEXT_LIMIT'); continue;}
                // Do not load native runtimes or media just to search arbitrary binary bytes.
                if (stat.size > maxText && !archive) {if (!dependency(file) && (textExtension.test(file) || info?.text)) add(file, 'TEXT_LIMIT'); continue;}
                scan(fs.readFileSync(absolute), file);
            } else add(file, 'UNSUPPORTED_FILE');
        }
    };
    walk(root);
    if (findings.length) {
        const unique = [...new Map(findings.map(item => [item.file + '\0' + item.rule, item])).values()];
        // No snippets, credential values, absolute paths or underlying parser errors are reported.
        throw Object.assign(new Error('Release credential safety gate failed:\n' + unique.map(({file,rule}) => `- ${file}: ${rule}`).join('\n')), {code:'ARTIFACT_UNSAFE', findings:unique});
    }
    return {safe:true};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {if (process.argv.length !== 3) throw Error('Use artifact-safety.mjs /absolute/assembled-release-directory'); await assertArtifactSafe(process.argv[2]); console.log('Release credential safety gate passed.');}
    catch (error) {console.error(error.code === 'ARTIFACT_UNSAFE' ? error.message : 'Release credential safety scan could not complete.'); process.exitCode = 1;}
}
