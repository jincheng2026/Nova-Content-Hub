import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {WorkerClient} from '../../../../../workbench/src/main/worker-client.mts';
const child=new EventEmitter();child.postMessage=()=>{};child.kill=()=>child.emit('exit');
const worker=new WorkerClient(()=>child);
const pending=worker.call('readCover',{binding:{root:'/synthetic',libraryId:'synthetic',rootIdentity:{dev:'1',ino:'2'}},contentId:'fixture'}).catch(()=>{});
try {await assert.rejects(worker.call('list',{binding:{root:'/synthetic',libraryId:'not-a-library-id',rootIdentity:{dev:'0',ino:'0'}},view:'active'}),{code:'INVALID_INPUT'});}
finally{worker.stop();await pending;}
