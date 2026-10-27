/* Shared declarative ECharts options. Also usable with ECharts' offline SVG SSR. */
(function(root){
  const metrics=[['like_count','点赞'],['comment_count','评论'],['collect_count','收藏'],['share_count','分享']];
  const fmt=n=>n==null?'未取得':Number(n.toFixed(2)).toLocaleString('zh-CN');
  const short=s=>s.length>24?s.slice(0,24)+'…':s;
  function option(s,width=900,metric='like_count',scale='linear'){
    const ink='#23313e',blue='#1d4f78',gray='#7d8fa1';
    const base={animation:false,color:[blue,gray,'#c2c9d1'],textStyle:{color:ink,fontFamily:'sans-serif'},aria:{enabled:true},tooltip:{trigger:'item',renderMode:'richText',confine:true}};
    const label={show:true,position:'right',color:ink,formatter:p=>fmt(p.value)};
    const bars=(names,values)=>({...base,grid:{left:8,right:74,top:18,bottom:28,containLabel:true},xAxis:{type:'value',splitNumber:width<540?2:4,axisLabel:{hideOverlap:true},splitLine:{lineStyle:{color:'#e9edf2'}}},yAxis:{type:'category',inverse:true,data:names,axisLabel:{width:width<540?130:250,overflow:'truncate',fontSize:12,lineHeight:16}},series:[{type:'bar',barMaxWidth:20,label,data:values}]});
    if(s.kind==='trend'){
      const rows=s.rows.filter(r=>r[metric]!=null && (scale!=='log'||r[metric]>0));
      const med=s.medians[metric];
      return {...base,grid:{left:65,right:28,top:35,bottom:70},xAxis:{type:'category',data:rows.map(r=>r.date),axisLabel:{hideOverlap:true}},yAxis:{type:scale==='log'?'log':'value',name:(metrics.find(m=>m[0]===metric)||[])[1]||metric,splitLine:{lineStyle:{color:'#e9edf2'}}},dataZoom:[{type:'inside'},{type:'slider',height:20,bottom:8}],series:[{type:'scatter',symbolSize:9,data:rows.map(r=>({value:r[metric],name:r.title,source_id:r.id})),markLine:med!=null&&(scale!=='log'||med>0)?{silent:true,symbol:'none',lineStyle:{color:gray,type:'dashed'},label:{position:'insideEndTop',formatter:'本批中位数 '+fmt(med)},data:[{yAxis:med}]}:undefined}]};
    }
    if(s.kind==='directions') return bars(s.rows.map(r=>r.name+'\nn='+r.valid_n[metric]+'/'+r.n),s.rows.map(r=>r[metric]));
    if(s.kind==='pairs') return bars(s.rows.map(r=>r.date+'\n'+short(r.title)),s.rows.map(r=>({value:r[metric],name:r.title,source_id:r.id})));
    if(s.kind==='themes') return {...bars(s.rows.map(r=>r.name),s.rows.map(r=>r[metric==='likes'?'likes':'count'])),color:[metric==='likes'?gray:blue]};
    if(s.kind==='coverage'){
      const o=bars(s.rows.map(r=>short(r.title)),[]);o.legend={top:0};o.grid.top=38;
      o.series=[['top_level','顶层'],['reply','回复'],['unknown','层级未知']].map(([key,name])=>({name,type:'bar',stack:'coverage',barMaxWidth:22,label:{show:true,position:'inside',color:key==='unknown'?ink:'#fff',formatter:p=>p.value?fmt(p.value):''},data:s.rows.map(r=>r[key])}));return o;
    }
    return bars(s.rows.map(r=>short(r.title)),s.rows.map(r=>r.ratio));
  }
  function mount(specs){
    const charts=[];
    function render(s){
      const el=document.getElementById(s.id);if(!el)return;
      const card=el.closest('[data-chart]');
      const metric=card?.querySelector('[data-metric]')?.value||s.metric||'like_count';
      const scale=card?.querySelector('[data-scale]')?.value||'linear';
      let active=s;
      if(s.kind==='themes'){
        const video=card.querySelector('[data-video]').value,level=card.querySelector('[data-level]').value;
        active={...s,...s.subsets.find(x=>x.video===video&&x.level===level)};
        const note=card.querySelector('[data-theme-note]');if(note)note.textContent='已采集 '+active.denominator+' 条；已复核分类 '+active.reviewed+' 条；'+active.tagged+' 条含需求主题。按独立评论计，可多标签；获赞只累计已取得的数值。';
        const evidence=card.querySelector('[data-theme-evidence]');
        if(evidence){evidence.replaceChildren();active.rows.forEach(row=>{const d=document.createElement('details'),su=document.createElement('summary');su.textContent=row.name+' · '+row.count+' 条 · '+fmt(row.likes)+' 赞'+(row.likes_missing?' · '+row.likes_missing+' 条获赞未取得':'');d.append(su);for(const q of row.examples||[]){const p=document.createElement('p'),a=document.createElement('a');a.href='#'+(s.comment_prefix||'comment-')+q.id;a.textContent=q.text+'（'+fmt(q.likes)+' 赞）';p.append(a);d.append(p)}evidence.append(d)})}
      }
      if(!active.rows.length){el.textContent='当前范围没有可用数据。';if(el._chart){el._chart.dispose();el._chart=null}return}
      const valueKey=s.kind==='relative'?'ratio':metric;
      if(s.kind!=='coverage'&&!active.rows.some(r=>typeof r[valueKey]==='number'&&Number.isFinite(r[valueKey])&&(scale!=='log'||r[valueKey]>0))){
        el.textContent=scale==='log'?'当前范围没有正值；对数刻度不显示 0。':'当前范围未取得这个指标，缺失值没有补零。';if(el._chart){el._chart.dispose();el._chart=null}return
      }
      const c=el._chart||(el._chart=echarts.init(el));if(!charts.includes(c))charts.push(c);
      c.setOption(option(active,el.clientWidth,metric,scale),true);
      c.off('click');c.on('click',p=>{const id=p.data?.source_id;if(!id)return;const target=document.getElementById((s.work_prefix||'work-')+id);if(!target)return;
        if(target.hidden){const reset=document.getElementById('work-reset');if(reset)reset.click();else{const input=document.getElementById('work-search');if(input){input.value='';input.dispatchEvent(new Event('input',{bubbles:true}))}}}
        for(let n=target;n;n=n.parentElement){if(n.tagName==='DETAILS')n.open=true;n.hidden=false}target.scrollIntoView({behavior:'smooth',block:'center'})});
    }
    specs.forEach(s=>{render(s);document.getElementById(s.id)?.closest('[data-chart]')?.querySelectorAll('select').forEach(e=>e.addEventListener('change',()=>render(s)))});
    if(root.ResizeObserver){const ro=new ResizeObserver(()=>charts.forEach(c=>!c.isDisposed()&&c.resize()));specs.forEach(s=>{const el=document.getElementById(s.id);if(el)ro.observe(el)})}
    root.reportCharts=charts;root.__REPORT_READY__=true;document.documentElement.dataset.reportReady='true';
  }
  root.AccountCharts={option,mount,metrics};if(typeof module!=='undefined')module.exports=root.AccountCharts;
})(typeof window!=='undefined'?window:globalThis);
