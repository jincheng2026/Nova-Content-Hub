import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
const api=await import('../scripts/prepare-media-codec.mjs').catch(()=>({}));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
test('source extraction rejects untrusted and same-size changed files before exposing a destination',async t=>{
    assert.equal(typeof api.prepareMediaCodecRuntime,'function');const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'nova-codec-extraction-'));t.after(()=>fs.rm(tmp,{recursive:true,force:true}));const source=path.join(tmp,'source'),output=path.join(tmp,'output');await fs.mkdir(source);const sourceBytes=Buffer.from('binary');const manifest=Buffer.from(JSON.stringify({version:1,files:[{path:'python/bin/python3',bytes:6,sha256:digest(sourceBytes)}]}));await fs.writeFile(path.join(source,'payload-manifest.json'),manifest);await fs.mkdir(path.join(source,'python/bin'),{recursive:true});await fs.writeFile(path.join(source,'python/bin/python3'),'change');
    await assert.rejects(api.prepareMediaCodecRuntime({sourceRoot:source,outputRoot:output,sourceManifestSha256:'0'.repeat(64)}),/SOURCE_MANIFEST_HASH/);await assert.rejects(api.prepareMediaCodecRuntime({sourceRoot:source,outputRoot:output,sourceManifestSha256:digest(manifest)}),/SOURCE_FILE_HASH/);await assert.rejects(fs.stat(output),{code:'ENOENT'});
});
test('selects codec standard library and AV files without copying Python tooling, ML engines or weights',()=>{
    assert.equal(typeof api.selectMediaCodecSourceFiles,'function');const selected=api.selectMediaCodecSourceFiles([
        'python/bin/python3','python/bin/python','python/lib/libpython3.11.dylib','python/lib/python3.11/json/__init__.py','python/lib/python3.11/encodings/utf_8.py','python/lib/python3.11/site-packages/mlx/__init__.py','python/lib/python3.11/tkinter/__init__.py','python/lib/python3.11/lib-dynload/_tkinter.cpython-311-darwin.so','timing-site/av/__init__.py','timing-site/av/_core.abi3.so','timing-site/av/.dylibs/libavcodec.dylib','timing-site/numpy/__init__.py','timing-site/av-18.1.0.dist-info/licenses/LICENSE.txt','models/whisper/model.bin','models/qwen/model.safetensors','licenses/python-standalone/LICENSE.cpython.txt','python-source.json',
    ]);
    assert.deepEqual([...new Set(selected.map(x=>x.source))].sort(),['licenses/python-standalone/LICENSE.cpython.txt','python-source.json','python/bin/python3','python/lib/python3.11/encodings/utf_8.py','python/lib/python3.11/json/__init__.py','timing-site/av-18.1.0.dist-info/licenses/LICENSE.txt','timing-site/av/.dylibs/libavcodec.dylib','timing-site/av/__init__.py','timing-site/av/_core.abi3.so'].sort());
});
test('supplemental license texts must match their recorded original source hashes',async t=>{
    assert.equal(typeof api.readMediaCodecLicenseFiles,'function');const root=await fs.mkdtemp(path.join(os.tmpdir(),'nova-codec-licenses-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.writeFile(path.join(root,'COPYING'),'changed');await fs.writeFile(path.join(root,'sources.json'),JSON.stringify([{path:'COPYING',url:'https://example.org/COPYING',bytes:7,sha256:'0'.repeat(64)}]));await assert.rejects(api.readMediaCodecLicenseFiles(root),/LICENSE_SOURCE_HASH/);
});
