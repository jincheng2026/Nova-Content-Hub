/* ZIP STORE keeps already compressed images intact and needs no runtime dependency. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.NCHZip = api;
})(typeof window === 'object' ? window : globalThis, function () {
    'use strict';
    const table = Uint32Array.from({length: 256}, (_, n) => {
        for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
        return n >>> 0;
    });

    function crc32(data) {
        let crc = 0xffffffff;
        for (const byte of data) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
        return (crc ^ 0xffffffff) >>> 0;
    }

    function create(entries) {
        if (!Array.isArray(entries) || !entries.length || entries.length > 65535) throw Error('ZIP 文件数量无效');
        const files = [], directory = [], seen = new Set(), encoder = new TextEncoder();
        let offset = 0, directorySize = 0;
        for (const {name, data} of entries) {
            if (typeof name !== 'string' || !name || /[\\/\u0000-\u001f]/.test(name) || ['.', '..'].includes(name) || seen.has(name)) throw Error('ZIP 文件名无效或重复');
            seen.add(name);
            const filename = encoder.encode(name);
            // shortcut: classic ZIP is limited to 4 GiB; use ZIP64 if larger exports become necessary.
            if (!(data instanceof Uint8Array) || data.length > 0xffffffff || filename.length > 65535) throw Error('ZIP 文件超出容量或格式限制');
            const crc = crc32(data), local = new Uint8Array(30), central = new Uint8Array(46);
            const l = new DataView(local.buffer), c = new DataView(central.buffer);
            l.setUint32(0, 0x04034b50, true);
            l.setUint16(4, 20, true);
            l.setUint16(6, 0x800, true);
            l.setUint16(12, 0x21, true);
            l.setUint32(14, crc, true);
            l.setUint32(18, data.length, true);
            l.setUint32(22, data.length, true);
            l.setUint16(26, filename.length, true);
            c.setUint32(0, 0x02014b50, true);
            c.setUint16(4, 20, true);
            c.setUint16(6, 20, true);
            c.setUint16(8, 0x800, true);
            c.setUint16(14, 0x21, true);
            c.setUint32(16, crc, true);
            c.setUint32(20, data.length, true);
            c.setUint32(24, data.length, true);
            c.setUint16(28, filename.length, true);
            c.setUint32(42, offset, true);
            files.push(local, filename, data);
            directory.push(central, filename);
            offset += local.length + filename.length + data.length;
            directorySize += central.length + filename.length;
            if (offset + directorySize + 22 > 0xffffffff) throw Error('ZIP 总大小超过 4 GiB');
        }
        const end = new Uint8Array(22), view = new DataView(end.buffer);
        view.setUint32(0, 0x06054b50, true);
        view.setUint16(8, entries.length, true);
        view.setUint16(10, entries.length, true);
        view.setUint32(12, directorySize, true);
        view.setUint32(16, offset, true);
        return new Blob([...files, ...directory, end], {type: 'application/zip'});
    }

    return {create};
});
