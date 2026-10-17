const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
module.exports = async function readZip(blob) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nch-zip-'));
  try {
    const file = path.join(dir, 'export.zip'); fs.writeFileSync(file, Buffer.from(await blob.arrayBuffer()));
    function unzip(args, encoding) {
      const result = spawnSync('unzip', args, { encoding, maxBuffer: 32 * 1024 * 1024 });
      assert.ifError(result.error); assert.equal(result.status, 0, String(result.stderr || result.stdout)); return result.stdout;
    }
    unzip(['-t', file], 'utf8');
    // macOS unzip may recode Unicode listing output; Python's independent reader preserves UTF8 names.
    const result = spawnSync('python3', ['-c', 'import sys,json,zipfile,base64; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps([[n,base64.b64encode(z.read(n)).decode("ascii")] for n in z.namelist()]))', file], { encoding:'utf8', maxBuffer:32*1024*1024 });
    assert.ifError(result.error); assert.equal(result.status,0,result.stderr);
    return new Map(JSON.parse(result.stdout).map(([name,data])=>[name,Buffer.from(data,'base64')]));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};
