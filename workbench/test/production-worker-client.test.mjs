import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {WorkerClient} from '../src/main/worker-client.mts';
const reads=['productionRead','productionCreation','productionReport','productionContext','productionAsset'];
const writes=['productionMutate','productionRecover','productionReserve','productionTaskMutation'];
test('production reads retry BUSY three times with the same pinned request; writes and receipt verification never auto-replay',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const child=new EventEmitter(),requests=[];child.postMessage=request=>{requests.push(structuredClone(request));child.emit('message',{id:request.id,ok:false,error:{code:'BUSY'}});};child.kill=()=>child.emit('exit');const client=new WorkerClient(()=>child);t.after(()=>client.stop());
 for(const op of reads){const before=requests.length,args={binding:{root:'/original',libraryId:'pinned',rootIdentity:{dev:'1',ino:'2'}}},promise=assert.rejects(client.call(op,args),{code:'BUSY'});args.binding.root='/changed';t.mock.timers.tick(80);t.mock.timers.tick(240);t.mock.timers.tick(600);await promise;assert.equal(requests.length-before,4);assert.equal(requests.at(-1).args.binding.root,'/original');assert.deepEqual(requests.at(-1),requests[before]);}
 for(const op of writes){const before=requests.length;await assert.rejects(client.call(op,{}),{code:'BUSY'});t.mock.timers.tick(60000);assert.equal(requests.length-before,1);}
});
test('a production read has a 15-second bound and retains its worker slot until actual exit',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const child=new EventEmitter();let killed=false;child.postMessage=()=>{};child.kill=()=>{killed=true;};const client=new WorkerClient(()=>child);t.after(()=>client.stop());const result=assert.rejects(client.call('productionRead',{}),{code:'READ_TIMEOUT'});t.mock.timers.tick(15000);assert.equal(killed,true);await assert.rejects(client.call('productionRead',{}),{code:'BUSY'});child.emit('exit');await result;
});
