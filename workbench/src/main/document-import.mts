import fs from 'node:fs';
import path from 'node:path';

export function readPromptDocument(file: string): {title: string; body: string} {
    const reject = () => Object.assign(new Error('请选择完整的 UTF-8 Markdown 或文本文件，大小不超过 1 MiB。原文件不会修改。'), {code: 'INVALID_DOCUMENT'});
    if (!path.isAbsolute(file) || file.includes('\0') || !['.md', '.txt', '.markdown'].includes(path.extname(file).toLowerCase())) throw reject();
    const named = fs.lstatSync(file, {bigint: true});
    if (named.isSymbolicLink() || !named.isFile() || named.size < 1n || named.size > 1048576n) throw reject();
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    let body: string;
    try {
        const before = fs.fstatSync(fd, {bigint: true});
        if (!before.isFile() || before.dev !== named.dev || before.ino !== named.ino || before.size !== named.size) throw reject();
        const bytes = Buffer.alloc(Number(before.size) + 1);
        let size = 0;
        while (size < bytes.length) { const count = fs.readSync(fd, bytes, size, bytes.length - size, null); if (!count) break; size += count; }
        const after = fs.fstatSync(fd, {bigint: true}), current = fs.lstatSync(file, {bigint: true});
        if (current.isSymbolicLink() || BigInt(size) !== before.size || ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].some(key => before[key as keyof typeof before] !== after[key as keyof typeof after] || after[key as keyof typeof after] !== current[key as keyof typeof current])) throw reject();
        try { body = new TextDecoder('utf-8', {fatal: true}).decode(bytes.subarray(0, size)); } catch { throw reject(); }
    } finally { fs.closeSync(fd); }
    if (!body.trim() || body.includes('\0') || body.length > 1_000_000) throw reject();
    const first = body.split(/\r?\n/).find(line => line.trim()) ?? path.basename(file, path.extname(file));
    return {title: first.replace(/^\s*#{1,6}\s*/, '').trim().slice(0, 500), body};
}
