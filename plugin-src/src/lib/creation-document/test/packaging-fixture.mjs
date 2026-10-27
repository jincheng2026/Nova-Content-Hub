/** Synthetic source-shaped fixture. Contains no author's draft or publishing copy. */
export function packagingBuildData(){
 const slots=['标题','封面文字','简介'];
 return {content_id:'T044',type:'AI教程',stage:'录制准备',title:'合成完整创作与发布验证',narrative:{story:'演示',audience:'创作者',problem:'版本兼容'},segments:[{id:'seg-one',title:'演示段落',role:'演示',mine:'合成原句只出现一次。',baseline:'合成底稿',refs:[{who:'合成参考',source_type:'口播原话',time:'0:00 到 0:10',text:'合成参考原文，逐句验证。'}],fields:{visual_type:'录屏',our_visual:'演示画面',todo_me:'录制演示',todo_editor:'保留结果'}}],suggestions:[{id:'sug-one',segment:'seg-one',category:'表达',original:'合成原句',proposed:'合成建议',reason:'合成理由',basis:{type:'AI 自己的判断',text:'只用于验证'}}],items:[
  {id:'step-one',kind:'step',locked:{segment:'seg-one',order:1,line:'合成原句',where:'合成工具',expect:'演示结果',caution:'合成'},fields:{prompt:'只用于验证的指令'}},
  {id:'refnote-one',kind:'refnote',locked:{segment:'seg-one',summary:'合成参考分析',points:[{tag:'解释',say:'展示结果',cover:'独有',who:['合成参考'],quotes:[{who:'合成参考',time:'0:02',text:'合成参考原文'}]}]},fields:{}},
  {id:'skeleton-one',kind:'skeleton',locked:{families:[{who:'合成参考'}],rows:[{step:'演示结果',segment:'seg-one',cells:{'合成参考':'给出可验证结果'}}]},fields:{}},
  ...slots.map((slot,i)=>({id:'pubslot-'+i,kind:'pubslot',locked:{slot,refs:[{who:'合成来源',text:'合成发布参考'+i,stat:'合成证据'}],future:{retain:i}},fields:{final:'合成候选'+i+'-0',note:'合成包装意见'+i}})),
  ...slots.flatMap((slot,i)=>Array.from({length:i===2?9:10},(_,n)=>({id:'pubcand-'+i+'-'+n,kind:'pubcand',locked:{slot,round:n>4?2:1,order:n+1,reason:'合成候选理由',angle:'演示角度',basis:{type:'合成证据',text:'不是作者历史材料'}},fields:{text:'合成候选'+i+'-'+n,decision:n===0?'选用':''}})))
 ]};
}
