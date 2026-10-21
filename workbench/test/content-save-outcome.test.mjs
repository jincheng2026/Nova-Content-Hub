import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {errorInfo} from '../src/shared/contracts.ts';

// Execute App's real save/leave state without JSX or a native content library.
const source = await fs.readFile(new URL('../src/renderer/app.tsx', import.meta.url), 'utf8');
const appStart = source.indexOf('function App() {'), layoutStart = source.indexOf('    const currentCollection =');
assert.ok(appStart >= 0 && layoutStart > appStart, 'App logic boundary must exist before compiling the save fixture');
const compiled = stripTypeScriptTypes(source.slice(appStart, layoutStart) + '\nreturn {save, guard, load, setDraft, setDisk, retainDraftAsNew, draft, base, disk, error, dirty};}');
function fixture() {
  const slots = [], calls = []; let cursor = 0, failure = '', pause, committed, managed = false;
  const context = vm.createContext({
    useState(initial) {const i=cursor++; if (!(i in slots)) slots[i]=initial; return [slots[i], value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
    useRef(initial) {const i=cursor++; return slots[i]??={current:initial};}, useMemo: fn=>fn(), useEffect() {}, useLayoutEffect() {},
    errorInfo, hasManagedDrafts:()=>managed, document:{hidden:false},
    async invoke(method, input) {
      calls.push({method,input});
      if(pause?.method===method) {const wait=pause.wait; pause=null; await wait;}
      if(failure===method) throw Error('INJECTED_READ_FAILURE');
      if(method==='createContent'||method==='updateContent') return committed ?? {id:input.id??'created',editToken:'committed-token',title:input.title,body:input.body};
      if(method==='status') return {currentName:'synthetic',busy:false,pending:null};
      if(method==='listContents') return [];
      return {version:1};
    }
  });
  vm.runInContext(compiled,context); const render=()=>{cursor=0; return context.App();};
  return {render,calls, managed:value=>{managed=value;}, fail:method=>{failure=method;}, commit:item=>{committed=item;}, pause(method){let release;const wait=new Promise(resolve=>{release=resolve;});pause={method,wait};return release;}};
}
const draft={title:'new title',body:'retained body'}, disk={id:'original',editToken:'external-token',title:'external',body:'external body'};
test('confirmed create remains saved when list refresh fails; retry refresh cannot create a duplicate',async()=>{
  const f=fixture(); f.render().setDraft(draft);f.fail('listContents');
  assert.equal(await f.render().save(),true); const state=f.render();
  assert.equal(state.base.id,'created');assert.equal(state.dirty,false); assert.match(state.error,/内容已保存，列表刷新未完成/);
  f.fail(''); await f.render().save();
  assert.equal(f.calls.filter(c=>c.method==='createContent').length,1);assert.equal(f.calls.filter(c=>c.method==='updateContent').length,1);
});
for(const method of ['updateContent','listContents'])test(`edits during ${method} keep the new draft and prevent leave/close success`,async()=>{
  const f=fixture();f.render().load({...disk,title:'old',body:'old'});f.render().setDraft(draft); const release=f.pause(method);
  const saving=f.render().save();await new Promise(resolve=>setImmediate(resolve));f.render().setDraft({...draft,body:'typed while saving'});f.render();release();
  assert.equal(await saving,false);const state=f.render();assert.equal(state.draft.body,'typed while saving');assert.equal(state.base.editToken,'committed-token');assert.equal(state.dirty,true);
});
test('concurrent reread result is preserved as disk conflict and never treated as the submitted draft',async()=>{
  const f=fixture();f.render().load(disk);f.render().setDraft(draft);f.commit({...disk,editToken:'later-writer'});
  assert.equal(await f.render().save(),false);assert.equal(f.render().disk.editToken,'later-writer');assert.equal(f.render().draft.body,draft.body);
});
test('keeping a conflict as a new document leaves the external version intact and creates with no original editToken',async()=>{
  const f=fixture();f.render().load(disk);f.render().setDraft(draft);f.render().setDisk(disk);assert.equal(await f.render().save(),false);
  f.render().retainDraftAsNew();assert.equal(f.render().base,null);assert.equal(f.render().disk,null);assert.equal(f.render().draft.body,draft.body);
  assert.equal(await f.render().save(),true);assert.equal(f.calls.filter(c=>c.method==='updateContent').length,0);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls.find(c=>c.method==='createContent').input)),draft);assert.equal(disk.body,'external body');
});

test('managed notes/publication drafts use App navigation and native close guards',async()=>{
  const f=fixture();let left=false;f.managed(true);await f.render().guard(async()=>{left=true;});assert.equal(left,false);assert.match(f.render().error,/未保存/);
  f.managed(false);await f.render().guard(async()=>{left=true;});assert.equal(left,true);
  const start=source.indexOf('        const prevent = (event: BeforeUnloadEvent) =>');const end=source.indexOf('        window.addEventListener',start);
  const prevent=vm.runInNewContext(stripTypeScriptTypes(source.slice(start,end))+';prevent', {dirtyRef:{current:false},hasManagedDrafts:()=>true});
  const event={preventDefault(){this.prevented=true;}};prevent(event);assert.equal(event.prevented,true);assert.equal(event.returnValue,'');
});

test('a background workspace read cannot delay a confirmed save or overwrite edits typed afterward', async () => {
  const f=fixture();f.render().load({...disk,title:'old',body:'old'});f.render().setDraft(draft);const release=f.pause('readWorkspace');
  assert.equal(await f.render().save(),true);
  f.render().setDraft({...draft,body:'typed after save'});f.render();release();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.render().draft.body,'typed after save');assert.equal(f.render().dirty,true);assert.equal(f.render().base.editToken,'committed-token');
});
