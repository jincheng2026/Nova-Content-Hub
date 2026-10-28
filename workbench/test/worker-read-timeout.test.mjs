import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {WorkerClient} from '../src/main/worker-client.mts';
import {createOperationQueue} from '../src/main/operation-queue.mts';

test('a hung refresh stops its reader and releases the operation queue only after worker exit', async t => {
    t.mock.timers.enable({apis: ['setTimeout']});
    const children = [], run = createOperationQueue();
    const client = new WorkerClient(() => {
        const child = new EventEmitter(); children.push(child);
        child.postMessage = request => {child.request = request; if (children.length > 1) child.emit('message', {id: request.id, ok: true, value: 'current'});};
        child.kill = () => {child.killed = true;};
        return child;
    });
    t.after(() => client.stop());
    const hung = run(() => client.call('workspace', {}));
    const rejected = assert.rejects(hung, {code: 'READ_TIMEOUT'});
    let continued = false;
    const next = run(async () => {continued = true; return client.call('list', {});});
    await new Promise(resolve => setImmediate(resolve));
    t.mock.timers.tick(15_000);
    try {
        assert.equal(children[0].killed, true, 'hung readonly IPC must have a bounded lifetime');
        assert.equal(continued, false, 'a replacement cannot overlap the retiring process');
    } finally {children[0].emit('exit');}
    await rejected;
    assert.equal(await next, 'current');
    assert.equal(children.length, 2);
});

test('writes have no read deadline, are sent once, and keep their exact pending slot', async t => {
    t.mock.timers.enable({apis: ['setTimeout']});
    const child = new EventEmitter(); let kills = 0, sent = 0, request;
    child.postMessage = value => {sent++; request = value;}; child.kill = () => {kills++; child.emit('exit');};
    const client = new WorkerClient(() => child);
    const write = client.call('workspaceMutate', {pending: {mutationId: 'same-intent'}});
    t.mock.timers.tick(120_000);
    assert.equal(kills, 0); assert.equal(sent, 1);
    await assert.rejects(client.call('workspaceMutate', {}), {code: 'BUSY'});
    child.emit('message', {id: request.id, ok: true, value: 'committed'});
    assert.equal(await write, 'committed'); client.stop();
});

for(const operation of ['finalRead','finalPreview','finalExport','finalAssetRaster','readCoverPackaging','vaultWorkDirectory','vaultTopicMenus','vaultWorkContext','vaultContentSource','vaultContentDirectory','vaultSources'])test(`${operation} uses the finite read deadline and can retry after exit`,async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const children=[];const client=new WorkerClient(()=>{
  const child=new EventEmitter();children.push(child);
  child.postMessage=request=>{if(children.length>1)child.emit('message',{id:request.id,ok:true,value:[]});};
  child.kill=()=>{child.killed=true;child.emit('exit');};return child;
 });
 t.after(()=>client.stop());
 const first=client.call(operation,{}),rejected=assert.rejects(first,{code:'READ_TIMEOUT'});
 t.mock.timers.tick(15_000);assert.equal(children[0].killed,true);
 await rejected;assert.deepEqual(await client.call(operation,{}),[]);
});
