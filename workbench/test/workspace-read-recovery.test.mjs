import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../src/shared/workspace-read-recovery.ts').catch(()=>({}));
test('only transient read contention schedules two epoch-bound recoveries and success cancels stale timers',()=>{
 assert.equal(typeof api.createWorkspaceReadRecovery,'function');let epoch=1,count=0;const timers=new Map();let id=0;
 const r=api.createWorkspaceReadRecovery({currentEpoch:()=>epoch,retry:()=>count++,schedule:(fn,delay)=>{timers.set(++id,{fn,delay});return id;},cancel:key=>timers.delete(key)});
 const tick=()=>{const [key,value]=timers.entries().next().value;timers.delete(key);value.fn();};
 assert.equal(r.schedule(1),true);assert.equal(r.schedule(1),true);assert.equal(timers.size,1);tick();assert.equal(count,1);
 assert.equal(r.schedule(1),true);tick();assert.equal(count,2);assert.equal(r.schedule(1),false);assert.equal(timers.size,0);
 r.reset();assert.equal(r.schedule(1),true);r.reset();assert.equal(timers.size,0);
 assert.equal(r.schedule(1),true);epoch=2;tick();assert.equal(count,2);assert.equal(r.schedule(1),false);
});
test('workspace read failures distinguish contention, timeout, access and corruption without broad repair advice',()=>{
 assert.equal(typeof api.workspaceReadFailure,'function');for(const code of ['BUSY','VAULT_BUSY']){const issue=api.workspaceReadFailure({code});assert.equal(issue.kind,'busy');assert.doesNotMatch(issue.message,/维护|损坏/);}
 assert.equal(api.workspaceReadFailure({code:'READ_TIMEOUT'}).kind,'timeout');assert.match(api.workspaceReadFailure({code:'READ_TIMEOUT'}).message,/重试/);
 assert.doesNotMatch(api.workspaceReadFailure({code:'EACCES'}).message,/损坏|维护/);assert.match(api.workspaceReadFailure({code:'CORRUPT'}).message,/维护/);
});
