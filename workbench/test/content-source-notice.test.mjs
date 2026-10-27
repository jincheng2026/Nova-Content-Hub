import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
const source=await fs.readFile(new URL('../src/renderer/content-source-notice.tsx',import.meta.url),'utf8');
const start=source.indexOf('export function ContentSourceNotice('),end=source.indexOf('\n if(loading)return',start);
const compiled=stripTypeScriptTypes(source.slice(start,end).replace('export function','function')+'\nreturn {establish};}');
for(const changesToken of [true,false])test(`working-draft conversion keeps source access current when content token changes=${changesToken}`,async()=>{
 const original={document:{id:'original',hash:'before',writable:false},workingDraftAvailable:true},next={document:{id:'working',hash:'after',writable:true}};
 let index=0,access={key:'before',editable:false};
 const context=vm.createContext({useState(){const values=[original,false,false,'',0];return[values[index++],()=>{}];},useRef:current=>({current}),useEffect(){},invoke:async(method,input)=>{assert.equal(method,'createVaultWorkingDraft');assert.equal(input.id,'original');return next;},errorInfo:error=>({message:String(error)})});
 vm.runInContext(compiled,context);
 const component=context.ContentSourceNotice({contentId:'content',busy:false,dirty:false,access:editable=>{access={key:'before',editable};},run:action=>action(),converted:async()=>{if(changesToken)access={key:'after',editable:true};}});
 await component.establish();assert.deepEqual(access,{key:changesToken?'after':'before',editable:true});
});
