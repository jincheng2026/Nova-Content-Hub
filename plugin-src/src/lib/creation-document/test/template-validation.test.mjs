import test from 'node:test';
import assert from 'node:assert/strict';
import * as build from '../build.mjs';

const raw={page_id:'template-check',content_id:'T001',items:[{id:'seg-one',kind:'segment',locked:{order:1},fields:{mine:'https://example.com/reference </script> {{APP}}'}}]};
const rendered=()=>build.renderCreationHtml(raw).toString();

test('template validation refuses missing slots and network dependencies before rendering',()=>{
 assert.equal(typeof build.validateCreationTemplate,'function');
 const {parts}=build.loadTrustedCreationTemplate();
 assert.doesNotThrow(()=>build.validateCreationTemplate(parts));
 assert.throws(()=>build.validateCreationTemplate({...parts,shell:parts.shell.replace('{{APP}}','')}),/TEMPLATE_PLACEHOLDER/);
 assert.throws(()=>build.validateCreationTemplate({...parts,shell:parts.shell.replace('{{APP}}','{{APP}}{{APP}}')}),/TEMPLATE_PLACEHOLDER/);
 for(const dependency of ['<script src="https://example.com/app.js"></script>','<link rel="stylesheet" href="local.css">','<img src="//example.com/a.png">'])assert.throws(()=>build.validateCreationTemplate({...parts,shell:parts.shell+dependency}),/TEMPLATE_EXTERNAL_RESOURCE/);
 for(const dependency of ['body{background:url(https://example.com/a.png)}','@import "local.css";'])assert.throws(()=>build.validateCreationTemplate({...parts,style:parts.style+dependency}),/TEMPLATE_EXTERNAL_RESOURCE/);
});

test('generated page validation refuses broken replacement regions and a different document',()=>{
 assert.equal(typeof build.validateRenderedCreationHtml,'function');
 const html=rendered();
 assert.doesNotThrow(()=>build.validateRenderedCreationHtml(html,raw));
 for(const name of ['style','kit','app']){
  const start='<!--jc-'+name+':start-->',end='<!--jc-'+name+':end-->',tag=name==='style'?'style':'script';
  assert.throws(()=>build.validateRenderedCreationHtml(html+start,raw),/TEMPLATE_REGION/);
  assert.throws(()=>build.validateRenderedCreationHtml(html.replace(end,''),raw),/TEMPLATE_REGION/);
  assert.throws(()=>build.validateRenderedCreationHtml(html.replace(start,start+'<'+tag+'></'+tag+'>'),raw),/TEMPLATE_REGION/);
 }
 assert.throws(()=>build.validateRenderedCreationHtml(html,{...raw,content_id:'T999'}),/TEMPLATE_DOCUMENT_MISMATCH/);
});
