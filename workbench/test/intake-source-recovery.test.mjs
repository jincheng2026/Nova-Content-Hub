import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {createHash} from 'node:crypto';
import {ServiceTools} from '../src/main/service-tools.mts';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
test('a registered video response can be recovered by its exact original hash without another request or credential access',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nova-intake-source-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const cachePath=path.join(root,'cache.json'),data={aweme_detail:{aweme_id:'12345',desc:'真实作品说明'}};
 await fs.writeFile(cachePath,JSON.stringify([[digest(['video','12345','0']),{collectedAt:'2020-01-01T00:00:00Z',data}]]));
 const tools=new ServiceTools({cachePath,settings:{read(){throw Error('No settings required');},secret(){throw Error('No credential access');}}});
 const result=await tools.cachedVideoResponse('12345',digest(data));assert.deepEqual(result,data);result.aweme_detail.desc='caller mutation';assert.deepEqual(await tools.cachedVideoResponse('12345',digest(data)),data);
 assert.equal(await tools.cachedVideoResponse('12345','0'.repeat(64)),null);assert.equal(await tools.cachedVideoResponse('999',digest(data)),null);
});
test('missing or uncertain response evidence is unavailable rather than a paid metadata fetch',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nova-intake-missing-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const cachePath=path.join(root,'cache.json'),data={aweme_detail:{aweme_id:'12345'}};
 await fs.writeFile(cachePath,JSON.stringify([[digest(['video','12345','0']),{collectedAt:new Date().toISOString(),data,unknown:true}]]));
 const tools=new ServiceTools({cachePath,settings:{secret(){throw Error('No credential access');}}});assert.equal(await tools.cachedVideoResponse('12345',digest(data)),null);
 assert.equal(await new ServiceTools({cachePath:path.join(root,'missing'),settings:{}}).cachedVideoResponse('12345',digest(data)),null);
});

test('registered source metadata uses only the exact video response and preserves the complete description',async()=>{
 const {registeredIntakeSource}=await import('../src/main/intake-media-source.mts');
 const description='如何配置 API key（示例）\n'+'完整原文'.repeat(150);
 const source=registeredIntakeSource({data:{aweme_detail:{aweme_id:'12345',desc:description,author:{nickname:'原作者'},create_time:1700000000}},authorization:'never copied'},'12345');
 assert.equal(source.videoId,'12345');assert.equal(source.platform,'douyin');assert.equal(source.title,'如何配置 API key（示例）');assert.equal(source.description,description);assert.equal(source.author,'原作者');assert.equal('authorization' in source,false);
 assert.equal(registeredIntakeSource({aweme_detail:{aweme_id:'999',desc:'other'}},'12345'),null);
 const long=registeredIntakeSource({aweme_detail:{aweme_id:'12345',desc:'长'.repeat(500)}},'12345');assert.ok(Buffer.byteLength(`抖音_${long.title}_12345`)<240);assert.equal(long.description.length,500);
});
