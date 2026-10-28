#!/usr/bin/env python3
"""逐字稿对照页（T018 版式）：一段一屏，左边是几位博主讲这一处的原文（只读），右边蓝框是锦成版（可改、自动保存），
同色标注＝同一类讲法，点句子看每个人各自怎么讲，下划线＝连续字词相同，黄色区是批注。没有通用版。
用法: python3 make_compare_page.py 逐字稿.md 对照页.html

输入 Markdown：
# T0xx 题名
## 段：开头
### 锦成版
（锦成定稿的这一段）
### 大李
（他讲这一处的原文摘录，可用 {{比喻|文字}} 标句子在做哪类讲法，类名见文末 KINDS）
### 姜学长
……
### 不喝九
没有讲过
## 段：大模型
……
段的顺序按文件顺序；参考列的顺序按第一次出现的顺序；某列写「没有讲过」或缺省就显示为空。
已存在的对照页再次生成时，保留锦成版、批注、历史和 revision，只更新参考和标注。
"""
import datetime, html, json, os, re, sys, tempfile

MARK = re.compile(r'\{\{([^|{}]+)\|([^{}]*)\}\}')

def parse(md: str):
    m = re.search(r'^# (.+)$', md, re.M)
    full = m.group(1).strip() if m else '逐字稿对照'
    cm = re.match(r'(T\d+)\s*(.*)', full)
    code, title = (cm.group(1), cm.group(2).strip() or full) if cm else ('', full)
    order, sections = [], []
    for i, part in enumerate(re.split(r'^## 段：', md, flags=re.M)[1:], 1):
        st, _, body = part.partition('\n')
        refs, marks, mine = {}, {}, ''
        for sp in re.split(r'^### ', body, flags=re.M)[1:]:
            name, _, text = sp.partition('\n'); name = name.strip(); text = text.strip()
            if name == '锦成版':
                mine = MARK.sub(lambda x: x.group(2), text); continue
            if name not in order: order.append(name)
            marks[name] = [{'k': x.group(1).strip(), 't': x.group(2)} for x in MARK.finditer(text)]
            refs[name] = MARK.sub(lambda x: x.group(2), text)
        sections.append({'id': i, 'title': st.strip(), 'refs': refs, 'marks': marks, 'mine': mine, 'base': mine, 'note': '', 'history': []})
    if not sections: sys.exit('没有找到「## 段：名字」')
    for s in sections:
        for n in order:
            s['refs'].setdefault(n, ''); s['marks'].setdefault(n, [])
            for mk in s['marks'][n]:
                if mk['k'] not in KIND_NAMES: sys.exit(f"第 {s['id']} 段 {n} 列有不认识的标注类「{mk['k']}」，可用：{'、'.join(KIND_NAMES)}")
    return {'code': code, 'title': title, 'columns': order, 'sections': sections, 'revision': 0, 'updatedAt': None}

DATA = re.compile(r'(<script id="compare-data" type="application/json">)(.*?)(</script>)', re.S)

def merge_old(data, out_path):
    """已有页面：保留锦成版、批注、历史、revision。"""
    if not os.path.exists(out_path): return data
    try: old = json.loads(DATA.search(open(out_path, encoding='utf-8').read()).group(2))
    except Exception: return data
    by = {s['title']: s for s in old.get('sections', [])}
    kept = 0
    for s in data['sections']:
        o = by.get(s['title'])
        if o:
            s['mine'], s['note'], s['history'], s['base'] = o['mine'], o.get('note', ''), o.get('history', []), o.get('base', s['base']); kept += 1
    data['revision'], data['updatedAt'] = old.get('revision', 0), old.get('updatedAt')
    print(f'沿用旧页面的锦成版、批注和历史：{kept} 段，revision {data["revision"]}')
    return data

TEMPLATE = r'''<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>__TITLE__</title>
<style>
:root{color-scheme:light;--bg:#f5f5f7;--paper:#fff;--ink:#1d1d1f;--muted:#86868b;--line:#e5e5ea;--accent:#007aff;--tint:#f2f7ff;--warm:#936522;--font-size:17px}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Hiragino Sans GB","Helvetica Neue",sans-serif;font-size:15px;-webkit-font-smoothing:antialiased}
button,select,textarea{font:inherit}button,select{cursor:pointer;background:#fff;border:1px solid #dedee3;border-radius:9px;padding:8px 12px;color:var(--ink);font-size:13px;transition:background .15s,border-color .15s}
button:hover{background:#f2f7ff;border-color:#b8d5fa}button[aria-pressed="true"],button.primary{background:var(--accent);border-color:var(--accent);color:#fff}button:disabled{opacity:.45;cursor:default}
button:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid #007aff55;outline-offset:3px}
header{padding:26px 30px 20px;background:var(--paper);border-bottom:1px solid var(--line)}.top{display:flex;justify-content:space-between;gap:20px;align-items:center;flex-wrap:wrap}
h1{font-size:25px;letter-spacing:.02em;margin:0;font-weight:650;display:flex;align-items:center;gap:12px}.code{font:600 14px "SFMono-Regular",Menlo,monospace;color:#fff;background:var(--accent);border-radius:8px;padding:5px 9px}
.sub{color:var(--muted);margin:10px 0 0;line-height:1.7}.actions,.controls,.nav,.seg-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.save{font-size:13px;color:var(--accent);max-width:320px}.save.error{color:#c0392b}
.toolbar{position:sticky;top:0;z-index:3;background:rgba(245,245,247,.92);backdrop-filter:blur(10px);padding:12px 30px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}
.nav button{padding:7px 11px}.nav button b{font-weight:600;margin-right:4px}
.compare-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 30px 0;color:var(--muted);font-size:13px;line-height:1.7}.compare-bar select{padding:6px 8px}
.palette{display:inline-flex;gap:4px;flex-wrap:wrap}.palette i{display:inline-block;font-style:normal;padding:1px 7px;border-radius:5px;color:var(--ink);font-size:12px;cursor:default}
.same-words{text-decoration-line:underline;text-decoration-style:solid;text-decoration-color:#b4412c;text-decoration-thickness:2px;text-underline-offset:4px}
.compare-help{max-width:980px}.compare-help summary{cursor:pointer;color:var(--accent)}.compare-help p{margin:4px 0}
main{padding:20px 30px 40px}.segment{margin-bottom:30px;scroll-margin-top:90px}
.seg-top{display:flex;align-items:center;gap:12px;margin-bottom:13px;flex-wrap:wrap}.seg-top h2{font-size:19px;font-weight:600;margin:0}.seg-number{color:var(--accent);font:17px "SFMono-Regular",Menlo,monospace;margin-right:10px}
.cov{font-size:12px;border-radius:10px;padding:2px 9px;font-weight:500;background:#edf6fc;color:#185f85}.cov-5{background:#e7f6ec;color:#1e7e45}.cov-3{background:#fff4e6;color:#b05a1f}
.grid{display:grid;grid-template-columns:repeat(__GCOLS__,minmax(0,1fr)) minmax(0,1.18fr);border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--paper)}
.cell{min-width:0;padding:0 18px 18px;border-right:1px solid var(--line)}__ROWCSS__.mine-cell{grid-column:__MINECOL__;grid-row:1/span __GROWS__;border-right:0;background:var(--tint)}
.cell-head{display:flex;justify-content:space-between;align-items:center;padding:15px 0 11px;gap:8px;font-weight:600;border-bottom:1px solid var(--line);margin-bottom:12px}.cell-head .who{display:flex;align-items:center;gap:8px}
.small{color:var(--muted);font-weight:400;font-size:12px}.tag{font-size:11px;font-weight:500;padding:1px 7px;border:1px solid currentColor;border-radius:10px;opacity:.85}
.ref{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.95;font-size:var(--font-size);margin:0;min-height:120px}.ref.empty{color:var(--muted);font-size:14px}
textarea.mine{display:block;width:100%;resize:vertical;border:1px solid #8fc0f5;box-shadow:inset 0 0 0 2px #e3f0ff;background:#fff;color:var(--ink);padding:8px 10px;line-height:1.95;font-size:var(--font-size);min-height:235px;overflow:hidden;border-radius:8px}
.mine-preview{padding:6px 4px;min-height:235px;cursor:text}.count{font:12px "SFMono-Regular",Menlo,monospace;color:var(--muted)}.edit-toggle{font-size:12px;padding:5px 9px;white-space:nowrap}
.match{color:inherit;background:transparent;border-radius:3px;box-decoration-break:clone;-webkit-box-decoration-break:clone;cursor:pointer}.match.is-selected{outline:2px solid #37556c;outline-offset:1px}.hide-color .match{background:transparent!important}.hide-color .palette{opacity:.35}
__KINDCSS__
.relation-inspector{background:var(--paper);border:1px solid var(--line);border-top:0;padding:12px 18px;font-size:14px;line-height:1.8}.relation-inspector p{margin:6px 0;white-space:pre-wrap}.inspector-top{display:flex;justify-content:space-between;gap:12px;align-items:center}.inspector-top button{padding:3px 8px;font-size:12px}
.relation-inspector .source-quote{border-left:3px solid var(--line);padding-left:10px}.relation-inspector .source-quote b{margin-right:6px}.relation-inspector .source-quote.is-here{border-left-color:var(--accent);background:var(--tint)}.relation-inspector .scope{color:var(--muted);margin:0}
.comparison-report{border:1px solid var(--line);border-top:0;background:var(--paper);padding:10px 18px;line-height:1.8;font-size:13px}.comparison-report summary{cursor:pointer;color:var(--warm)}.comparison-report ul{margin:8px 0;padding-left:20px}.comparison-report .scope{color:var(--muted);margin:0}.review-changed{color:#87551b;margin:5px 0}
.kind-table{border:1px solid var(--line);border-top:0;background:var(--paper);padding:10px 18px;font-size:13px}.kind-table summary{cursor:pointer;color:var(--accent)}.kind-table .wrap{overflow-x:auto;margin-top:8px}
.kind-table table{border-collapse:collapse;width:100%;min-width:900px}.kind-table th,.kind-table td{border:1px solid var(--line);padding:7px 9px;vertical-align:top;text-align:left;line-height:1.6}.kind-table th{background:#fafafc;font-weight:600;white-space:nowrap}.kind-table td span{cursor:pointer;border-radius:3px;padding:0 2px}.kind-table td span:hover{outline:2px solid #b8d5fa}.kind-table td .none{color:#c7c7cc;cursor:default}
.note-area{padding:12px 18px 14px;background:#fffbea;border:1px solid #f0dc9a;border-top:0;border-radius:0 0 12px 12px}.note-area.collapsed .note,.note-area.collapsed .note-warn{display:none}.note-area .note-preview{font-size:13px;color:#6b5a1e;white-space:pre-wrap;line-height:1.6;margin:4px 0 0}.note-area:not(.collapsed) .note-preview{display:none}.note-warn{margin:8px 0 0;font-size:13px;color:#b05a1f;display:flex;gap:10px;align-items:center;flex-wrap:wrap}.note-warn button{font-size:12px;padding:4px 10px}.note-top{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:8px}.note-top label{font-weight:600}.note-top .small{font-weight:400}
.note{width:100%;min-height:70px;border:1px dashed #d9b84a;border-radius:8px;padding:10px 12px;line-height:1.7;background:#fffdf3;color:var(--ink);resize:vertical;display:block}
.bottom{display:flex;justify-content:space-between;align-items:center;gap:15px;margin-top:15px}details.hist{font-size:12px;color:var(--muted);max-width:850px}details.hist pre{white-space:pre-wrap;background:#fafbfc;padding:8px;border-radius:6px;font-family:inherit}
.footer{color:var(--muted);font-size:12px;text-align:right;padding:0 30px 25px}
.only-mine .grid{grid-template-columns:minmax(0,1fr)}.only-mine .ref-cell{display:none}.only-mine .mine-cell{grid-column:1;grid-row:1}.only-mine main{max-width:960px;margin:auto}
.one-reference .grid{grid-template-columns:minmax(0,1fr) minmax(0,1.18fr)}.one-reference .mine-cell{grid-column:2;grid-row:1}.one-reference .ref-cell{border-bottom:0}
[hidden]{display:none!important}::selection{background:#c8e2f0;color:#142b3b}
#note-bubble{position:fixed;z-index:99;display:none;padding:6px 12px;background:var(--accent);color:#fff;border-radius:8px;font-size:13px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25);user-select:none}
#note-panel{position:fixed;z-index:100;display:none;width:400px;max-width:90vw;background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.18);padding:12px;font-size:13px}
#note-panel .q{background:#f5f5f7;border-left:3px solid var(--accent);border-radius:4px;padding:6px 8px;margin-bottom:8px;line-height:1.5;max-height:120px;overflow-y:auto;white-space:pre-wrap;word-break:break-all}
#note-panel textarea{width:100%;min-height:88px;resize:none;border:1px solid var(--line);border-radius:8px;padding:6px 8px;line-height:1.6;overflow:hidden}#note-panel .btns{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}
@media(max-width:1100px){.grid,.one-reference .grid{grid-template-columns:repeat(2,minmax(0,1fr))}.mine-cell,.one-reference .mine-cell{grid-column:1/span 2;grid-row:auto;border-top:1px solid var(--line)}.ref-cell{border-bottom:1px solid var(--line)}.ref-cell:nth-child(2n){border-right:0}}
@media(max-width:700px){header,.toolbar,.compare-bar,main{padding-left:14px;padding-right:14px}.grid,.one-reference .grid{grid-template-columns:1fr}.cell{border-right:0!important}.mine-cell,.one-reference .mine-cell{grid-column:1}.toolbar{position:static}h1{font-size:21px}.ref{min-height:0}}
@media print{header .actions,.toolbar,.compare-bar,.note-area,.bottom,.footer,.relation-inspector,.comparison-report,.kind-table,.edit-toggle{display:none!important}main{padding:0}.segment{display:block!important;break-inside:avoid}body{background:#fff}.match{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body>
<header><div class="top"><h1><span class="code">__CODE__</span>逐字稿对照<span class="small" style="font-size:14px;font-weight:400">__TITLE__</span></h1><div class="actions"><span id="saveStatus" class="save" role="status">正在读取…</span><button id="saveNow" class="primary">保存修改</button><button id="downloadHtml">下载 HTML 副本</button><button id="exportText">导出锦成版</button></div></div>
<p class="sub">左边是参考，只读，都是各自视频的原文逐字稿摘录。右边蓝框是锦成版，直接改，改了自动保存；点「看同色对照」能看你这段和参考的同色标注。黄色批注区是写给 AI 的话，不是稿子。同一种颜色＝同一类讲法，点彩色句子能看到每个人各自是怎么讲这一处的。选中任何文字会浮出「批注这段」。</p></header>
<div class="toolbar"><nav id="nav" class="nav" aria-label="段落导航"></nav><div class="controls"><button id="allMode" aria-pressed="false">通读全文</button><select id="reference" aria-label="显示参考"></select><button id="smaller" aria-label="缩小字号">A−</button><button id="larger" aria-label="放大字号">A＋</button></div></div>
<div class="compare-bar"><span class="palette" id="palette" aria-hidden="true"></span><span>同色＝同一类讲法，点彩色句子看每个人各自怎么讲。</span><button id="colorToggle" aria-pressed="true">显示同色对照</button><label for="exactPair">字词重合：</label><select id="exactPair"><option value="mine">锦成版与参考</option></select><span class="same-words">下划线＝连续字词相同</span><details class="compare-help"><summary>标注怎么看</summary><p>颜色是按「这句话在做哪件事」标的：叫法（给它什么名字）、比喻、定义、场景、对照、产品、判断、我、过渡、动作，同一段里同一种颜色就是同一类，点开能并排看每个人的写法。颜色标注由 AI 逐句手标，不代表原创归属。下划线自动找至少 8 个汉字或数字连续相同的片段，忽略空格和标点，只提示重合，不判定照搬。锦成版改动后颜色和下划线会重新算，改过意思的句子颜色会消失，这是正常的。</p></details></div>
<main id="main"></main><div class="footer" id="footer"></div>
<script id="compare-data" type="application/json">__DATA__</script>
<script>
'use strict';
const data=JSON.parse(document.getElementById('compare-data').textContent),names=data.columns,N=names.length,MINE=N,writerNames=[...names,'锦成版'];
const PALETTE=['#1d6fb8','#2e8b57','#c05621','#7b5ea7','#b56576','#2a7f8f','#8a6d1f','#5c6b7a'],COL_COLOR={'大李':'#1d6fb8','姜学长':'#2e8b57','向行':'#c05621','阿朱':'#7b5ea7','不喝九':'#b56576'};names.forEach((c,i)=>{if(!COL_COLOR[c])COL_COLOR[c]=PALETTE[i%PALETTE.length]});
const COL_TAG=Object.fromEntries(names.map(c=>[c,data.tags&&data.tags[c]||'原文摘录']));
const KINDS=__KINDS__;const KIDX=Object.fromEntries(KINDS.map((k,i)=>[k[0],i]));
const key=(data.code||'kepu')+'-editor-pending-v1',online=location.protocol==='http:'||location.protocol==='https:';
let active=1,all=false,fontSize=17,dirty=false,inflight=false,conflict=false,timer,editVersion=0;
const status=document.getElementById('saveStatus');
const fields=()=>data.sections.map(s=>({id:s.id,mine:s.mine,note:s.note}));
function message(t,error=false){status.textContent=t;status.classList.toggle('error',error)}
function stash(){try{localStorage.setItem(key,JSON.stringify({baseRevision:data.revision,fields:fields(),pending:true}));return true}catch(e){message('浏览器暂存失败，请立即保存或下载副本',true);return false}}
try{const raw=localStorage.getItem(key);if(raw){const old=JSON.parse(raw);if(old.pending&&JSON.stringify(old.fields)===JSON.stringify(fields())){localStorage.removeItem(key)}else if(old.pending&&old.baseRevision===data.revision){for(const s of data.sections){const v=old.fields.find(x=>x.id===s.id);if(v){s.mine=v.mine;s.note=v.note}}dirty=true}else if(old.pending){for(const s of data.sections){const v=old.fields.find(x=>x.id===s.id);if(v){s.mine=v.mine;s.note=v.note}}dirty=true;message('已恢复你没保存成功的修改，正在保存…')}}}catch(e){}
function resize(el){el.style.height='auto';el.style.height=Math.max(el.classList.contains('mine')?120:70,el.scrollHeight+4)+'px'}
function changed(s,field,value){s[field]=value;dirty=true;editVersion++;stash();updateCounts();message(online?'正在保存…':'已暂存于此浏览器；下载 HTML 可保存文件');clearTimeout(timer);timer=setTimeout(save,1200)}
function make(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el}
function isEmptyRef(t){return !t||t.indexOf('没有讲过')>=0}
function normalizeMatch(text){const chars=[],positions=[];for(let i=0;i<text.length;i++){if(/[\p{L}\p{N}]/u.test(text[i])){chars.push(text[i]);positions.push(i)}}return {text:chars.join(''),positions}}
function exactRuns(left,right){
 const a=normalizeMatch(left),b=normalizeMatch(right),found=[];
 function keep(ai,bj,len){if(!len)return;const phrase=a.text.slice(ai,ai+len);if((phrase.match(/[\p{Script=Han}\p{N}]/gu)||[]).length<8)return;found.push({a:[a.positions[ai],a.positions[ai+len-1]+1],b:[b.positions[bj],b.positions[bj+len-1]+1],phrase})}
 for(let off=1-b.text.length;off<a.text.length;off++){let i=Math.max(0,off),j=Math.max(0,-off),run=0;for(;i<a.text.length&&j<b.text.length;i++,j++){if(a.text[i]===b.text[j])run++;else{keep(i-run,j-run,run);run=0}}keep(i-run,j-run,run)}
 return found.sort((x,y)=>y.phrase.length-x.phrase.length).filter((x,i,arr)=>!arr.slice(0,i).some(y=>y.a[0]<=x.a[0]&&y.a[1]>=x.a[1]&&y.b[0]<=x.b[0]&&y.b[1]>=x.b[1]));
}
function kindPhrases(s,kind){const out=[];names.forEach((c,a)=>{for(const m of (s.marks[c]||[]))if(m.k===kind)out.push({col:a,text:m.t})});const seen=new Set();names.forEach(c=>{for(const m of (s.marks[c]||[]))if(m.k===kind&&s.mine.indexOf(m.t)>=0&&!seen.has(m.t)){seen.add(m.t);out.push({col:MINE,text:m.t})}});return out}
function inspectMatch(group,ex,sectionId,clickedCol){
 document.querySelectorAll('.is-selected').forEach(el=>el.classList.remove('is-selected'));
 const box=document.getElementById('inspector-'+sectionId);box.replaceChildren();box.hidden=false;
 const top=make('div','inspector-top'),title=make('strong','',group?('「'+group.kind+'」'+KINDS[KIDX[group.kind]][1]+' · 每个人各自怎么讲'):'连续字词相同'),close=make('button','','收起');close.onclick=()=>{box.hidden=true;document.querySelectorAll('.is-selected').forEach(el=>el.classList.remove('is-selected'))};top.append(title,close);box.append(top);
 if(group){const s=data.sections.find(x=>x.id===sectionId);document.querySelectorAll('[data-group="'+group.id+'"]').forEach(el=>el.classList.add('is-selected'));
  const ph=kindPhrases(s,group.kind);for(let a=0;a<=MINE;a++){const items=ph.filter(p=>p.col===a);const p=make('p','source-quote'+(a===clickedCol?' is-here':''));const b=make('b','',writerNames[a]);b.style.color=COL_COLOR[writerNames[a]]||'var(--accent)';p.append(b);if(!items.length){p.append(make('span','small',a===MINE?'（锦成版里没有这一类的原句）':'（这位没有这一类的说法）'))}else{p.append(document.createTextNode(items.map(x=>x.text).join('　／　')))}box.append(p)}
  box.append(make('p','scope','颜色由 AI 逐句手标，只标「这句在做什么」，不代表谁抄谁。'))}
 if(ex){box.append(make('p','same-words','连续字词相同：'+ex.phrase),make('p','scope',writerNames[ex.left]+' ↔ '+writerNames[ex.right]+'；已忽略空格和标点。'))}
}
function paintParagraph(el,text,marks,sid,col){
 el.replaceChildren();const tags=Array.from({length:text.length},()=>({group:null,exact:null}));
 for(const m of marks)for(let i=m.start;i<m.end;i++){if(m.group&&!tags[i].group)tags[i].group=m.group;if(m.exact&&!tags[i].exact)tags[i].exact=m.exact}
 let start=0;while(start<text.length){const t=tags[start];let end=start+1;while(end<text.length&&tags[end].group===t.group&&tags[end].exact===t.exact)end++;const str=text.slice(start,end);if(!t.group&&!t.exact)el.append(document.createTextNode(str));else{const span=make('span','match'+(t.group?' k'+KIDX[t.group.kind]:'')+(t.exact?' same-words':''),str);if(t.group)span.dataset.group=t.group.id;span.title=(t.group?t.group.kind+'：'+KINDS[KIDX[t.group.kind]][1]:'')+(t.exact?' · 连续字词相同：'+t.exact.phrase:'');span.tabIndex=0;span.setAttribute('role','button');span.onpointerdown=e=>{span.dataset.pressX=e.clientX;span.dataset.pressY=e.clientY};span.onclick=e=>{if(Math.hypot(e.clientX-Number(span.dataset.pressX),e.clientY-Number(span.dataset.pressY))>5)return;inspectMatch(t.group,t.exact,sid,col)};span.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();inspectMatch(t.group,t.exact,sid,col)}};el.append(span)}start=end}
}
function refreshComparison(){
 const marks=new Map();for(const s of data.sections)for(let a=0;a<=MINE;a++)marks.set(s.id+':'+a,[]);
 for(const s of data.sections){names.forEach((c,a)=>{for(const m of (s.marks[c]||[])){const pos=s.refs[c].indexOf(m.t);if(pos>=0)marks.get(s.id+':'+a).push({start:pos,end:pos+m.t.length,group:{id:s.id+':'+m.k,kind:m.k}})}});
  const seen=[];names.forEach(c=>{for(const m of (s.marks[c]||[])){const pos=s.mine.indexOf(m.t);if(pos>=0&&!seen.some(r=>pos<r[1]&&pos+m.t.length>r[0])){seen.push([pos,pos+m.t.length]);marks.get(s.id+':'+MINE).push({start:pos,end:pos+m.t.length,group:{id:s.id+':'+m.k,kind:m.k}})}}})}
 
 for(const s of data.sections){const texts=[...names.map(c=>s.refs[c]||''),s.mine],pairs=names.map((c,a)=>[MINE,a]),matches=[];
  for(const [left,right] of pairs){if(isEmptyRef(texts[right])||isEmptyRef(texts[left]))continue;for(const match of exactRuns(texts[left],texts[right])){const ex={...match,left,right};matches.push(ex);marks.get(s.id+':'+left).push({start:match.a[0],end:match.a[1],exact:ex});marks.get(s.id+':'+right).push({start:match.b[0],end:match.b[1],exact:ex})}}
  for(let a=0;a<=MINE;a++){const el=document.querySelector('[data-paint="'+s.id+':'+a+'"]');if(el&&!isEmptyRef(texts[a]))paintParagraph(el,texts[a],marks.get(s.id+':'+a),s.id,a)}
  const report=document.getElementById('comparison-'+s.id);report.replaceChildren();if(s.mine!==(s.base||''))report.append(make('p','review-changed','本段锦成版已改：颜色和字词重合按当前文字重新算过。'));
  const details=make('details'),summary=make('summary','',matches.length?'查看连续相同的字词（'+matches.length+' 处）':'未找到达到标注长度的连续相同字词');details.append(summary,make('p','scope','只核对所选两侧的连续字词，不用这个结果判定整段是否照搬。'));if(matches.length){const list=make('ul');for(const ex of matches){const li=make('li'),bt=make('button','',writerNames[ex.left]+' ↔ '+writerNames[ex.right]+'：「'+ex.phrase+'」');bt.onclick=()=>inspectMatch(null,ex,s.id);li.append(bt);list.append(li)}details.append(list)}report.append(details);
 }
}
function kindTable(s){
 const box=make('details','kind-table'),sum=make('summary','','同类表达一览：按「叫法／比喻／定义……」一行一行对比每个人');box.append(sum);const wrap=make('div','wrap'),table=make('table'),thead=make('thead'),tr=make('tr');tr.append(make('th','','讲法'));names.forEach(c=>{const th=make('th','',c);th.style.color=COL_COLOR[c]||'';tr.append(th)});thead.append(tr);table.append(thead);const tb=make('tbody');
 for(const [k,desc] of KINDS){const rows=names.map(c=>(s.marks[c]||[]).filter(m=>m.k===k).map(m=>m.t));if(!rows.some(r=>r.length))continue;const r=make('tr'),th=make('th');const chip=make('span','match k'+KIDX[k],k);chip.style.cursor='default';th.append(chip);th.title=desc;r.append(th);rows.forEach((items,a)=>{const td=make('td');if(!items.length)td.append(make('span','none','—'));else items.forEach((t,i)=>{if(i)td.append(make('br'));const sp=make('span','',t);sp.onclick=()=>{inspectMatch({id:s.id+':'+k,kind:k},null,s.id,a);document.getElementById('inspector-'+s.id).scrollIntoView({block:'nearest',behavior:'smooth'})};td.append(sp)});r.append(td)});tb.append(r)}
 table.append(tb);wrap.append(table);box.append(wrap);return box
}
function render(){
 const nav=document.getElementById('nav'),main=document.getElementById('main');nav.replaceChildren();main.replaceChildren();
 for(const s of data.sections){
  const b=make('button');const bb=make('b','',String(s.id));b.append(bb,document.createTextNode(s.title));b.setAttribute('aria-pressed',String(s.id===active&&!all));b.onclick=()=>{active=s.id;all=false;display();window.scrollTo(0,0)};nav.append(b);
  const sec=make('section','segment');sec.id='segment-'+s.id;sec.dataset.id=s.id;
  const top=make('div','seg-top'),h=make('h2');h.append(make('span','seg-number',String(s.id).padStart(2,'0')),document.createTextNode(s.title));top.append(h);
  const covered=names.filter(c=>!isEmptyRef(s.refs[c]));const cov=make('span','cov '+(covered.length>=Math.min(5,N)?'cov-5':covered.length<=Math.min(3,N-1)?'cov-3':''),covered.length+' 人讲过'+(covered.length<N?' · '+covered.join('／'):''));top.append(cov);sec.append(top);
  const grid=make('div','grid');
  names.forEach((c,i)=>{const cell=make('article','cell ref-cell');cell.dataset.ref=i;const ch=make('div','cell-head'),who=make('span','who'),nm=make('span','',c);nm.style.color=COL_COLOR[c]||'';const tg=make('span','tag',COL_TAG[c]||'');tg.style.color=COL_COLOR[c]||'';who.append(nm,tg);ch.append(who);const text=s.refs[c]||'';const p=make('p','ref'+(isEmptyRef(text)?' empty':''),text||'（这列没写这段）');p.dataset.author=c;p.dataset.segment=s.id;p.dataset.paint=s.id+':'+i;cell.append(ch,p);grid.append(cell)});
  const mine=make('article','cell mine-cell'),ch=make('div','cell-head'),who=make('span','who'),count=make('span','count');count.id='count-'+s.id;who.append(make('span','','锦成版'),count);ch.append(who);
  const input=make('textarea','mine');input.value=s.mine;input.spellcheck=false;input.setAttribute('aria-label','第 '+s.id+' 段锦成版');input.oninput=()=>{resize(input);changed(s,'mine',input.value)};
  const preview=make('p','ref mine-preview');preview.dataset.author='锦成版';preview.dataset.segment=s.id;preview.dataset.paint=s.id+':'+MINE;preview.title='点空白处回到编辑';preview.hidden=true;const edit=make('button','edit-toggle','看同色对照');
  const toggle=()=>{const editing=input.hidden;input.hidden=!editing;preview.hidden=editing;edit.textContent=editing?'看同色对照':'回到编辑';if(editing){resize(input);input.focus()}else{refreshComparison()}};edit.onclick=toggle;preview.onclick=e=>{if(e.target===preview&&!(window.getSelection()&&!window.getSelection().isCollapsed))toggle()};
  ch.append(edit);mine.append(ch,preview,input);grid.append(mine);sec.append(grid);
  const inspector=make('div','relation-inspector');inspector.id='inspector-'+s.id;inspector.hidden=true;inspector.setAttribute('role','status');sec.append(inspector);const report=make('div','comparison-report');report.id='comparison-'+s.id;sec.append(report);sec.append(kindTable(s));
  const notes=make('div','note-area'),nt=make('div','note-top'),label=make('label','','批注：写给 AI 的话，不是稿子');label.htmlFor='note-'+s.id;const nbtn=make('button','','写批注');nt.append(label,make('span','small','稿子改右边蓝框的锦成版；选中文字会浮出「批注这段」'),nbtn);
  const note=make('textarea','note');note.id='note-'+s.id;note.value=s.note;note.placeholder='哪里不顺、想删哪句、想怎么改，都写在这里。';const npv=make('p','note-preview');const warn=make('div','note-warn');warn.hidden=true;
  const looksLikeScript=v=>{v=v.trim();if(v.length<80)return false;const pool=[s.mine,...names.map(c=>s.refs[c]||''),s.base||''].join('\n');for(let i=0;i+14<=v.length;i+=7){const g=v.slice(i,i+14);if(!/[，。？！、：；\n「」]/.test(g)&&pool.includes(g))return true}return false};
  const checkNote=()=>{npv.textContent=s.note.trim()?s.note.trim():'（这段还没有批注）';if(looksLikeScript(s.note)){warn.hidden=false;warn.replaceChildren(make('span','','这段批注看起来像稿子正文。是不是想改锦成版？'),(()=>{const b=make('button','','挪到锦成版');b.onclick=()=>{if(!confirm('把这段批注整个挪到锦成版，覆盖现在的锦成版？'))return;input.value=s.note.trim();s.mine=input.value;s.note='';note.value='';changed(s,'mine',s.mine);changed(s,'note','');resize(input);checkNote();refreshComparison()};return b})())}else{warn.hidden=true}};
  const setCollapsed=c=>{notes.classList.toggle('collapsed',c);nbtn.textContent=c?'写批注':'收起批注';if(!c){resize(note);note.focus()}};nbtn.onclick=()=>setCollapsed(!notes.classList.contains('collapsed'));
  note.oninput=()=>{resize(note);changed(s,'note',note.value);checkNote()};notes.append(nt,npv,note,warn);notes.classList.toggle('collapsed',!s.note.trim());checkNote();notes._open=()=>setCollapsed(false);
  if(s.history.length){const hist=make('details','hist'),sm=make('summary','','改过 '+s.history.length+' 次');hist.append(sm);for(const hh of s.history.slice(-8)){hist.append(make('pre','',hh.at.slice(0,16).replace('T',' ')+'\n'+hh.mine+(hh.note?'\n批注：'+hh.note:'')))}notes.append(hist)}
  sec.append(notes);
  const bottom=make('div','bottom');bottom.append(make('span','small',''));const steps=make('div','seg-actions');for(const [title,n] of [['上一段',s.id-1],['下一段',s.id+1]]){const bt=make('button','',title);bt.disabled=n<1||n>data.sections.length;bt.onclick=()=>{active=n;all=false;display();window.scrollTo(0,0)};steps.append(bt)}bottom.append(steps);sec.append(bottom);main.append(sec);
 }
 display();updateCounts();refreshComparison();
}
function display(){document.getElementById('allMode').setAttribute('aria-pressed',String(all));const filter=document.getElementById('reference').value;document.body.classList.toggle('only-mine',filter==='mine');document.body.classList.toggle('one-reference',!['all','mine'].includes(filter));document.querySelectorAll('.segment').forEach(s=>s.hidden=!all&&Number(s.dataset.id)!==active);document.querySelectorAll('.ref-cell').forEach(c=>c.hidden=filter==='mine'||(filter!=='all'&&filter!==c.dataset.ref));document.querySelectorAll('#nav button').forEach((b,i)=>b.setAttribute('aria-pressed',String(!all&&i+1===active)));document.querySelectorAll('textarea').forEach(el=>{if(el.offsetParent)resize(el)});}
function updateCounts(){let total=0;for(const s of data.sections){const count=s.mine.replace(/\s/g,'').length;total+=count;const base=s.base||'';document.getElementById('count-'+s.id).textContent=count+' 字'+(s.mine!==base?' · 已修改':'')}document.getElementById('footer').textContent='锦成版共 '+total+' 字 · '+data.sections.length+' 段'+(data.updatedAt?' · 最近保存 '+new Date(data.updatedAt).toLocaleString('zh-CN'):'')}
function syncEmbedded(){document.getElementById('compare-data').textContent=JSON.stringify(data).replace(/</g,'\\u003c')}
async function save(){clearTimeout(timer);if(conflict){message('保存冲突：请先下载当前副本，避免覆盖其他修改',true);return}if(!dirty){message(online?'全部修改已保存到 HTML':'当前内容未修改');return}if(!online){stash();message('已暂存于此浏览器；下载 HTML 可保存文件');return}if(inflight)return;inflight=true;const version=editVersion;try{const res=await fetch('/api/save',{method:'POST',headers:{'Content-Type':'application/json','X-Compare-Save':'1'},body:JSON.stringify({revision:data.revision,sections:fields()})});if(res.status===409){const j=await res.json();data.revision=j.revision;inflight=false;message('文件被别处改过，以你页面上的版本为准重新保存…');return save()}if(!res.ok)throw Error('保存失败，请保留页面并下载副本');const result=await res.json();data.revision=result.revision;data.updatedAt=result.updatedAt;if(editVersion===version){dirty=false;try{localStorage.removeItem(key)}catch(e){}message('已保存到 HTML · '+new Date(result.updatedAt).toLocaleTimeString('zh-CN'))}else{stash();timer=setTimeout(save,50)}syncEmbedded();updateCounts()}catch(e){stash();message(e.message==='Failed to fetch'?'本地保存暂时断开，修改已暂存；可下载副本':e.message,true)}finally{inflight=false}}
function download(text,name,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=make('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
(function(){const pal=document.getElementById('palette');for(const [k,desc] of KINDS){const i=make('i','match k'+KIDX[k],k);i.title=desc;pal.append(i)}
 const sel=document.getElementById('reference');sel.append(new Option('全部参考','all'));names.forEach((c,i)=>sel.append(new Option(c+' ＋ 锦成版',String(i))));sel.append(new Option('只看锦成版','mine'))})();
document.getElementById('colorToggle').onclick=()=>{const hidden=document.body.classList.toggle('hide-color');document.getElementById('colorToggle').setAttribute('aria-pressed',String(!hidden))};document.getElementById('exactPair').onchange=()=>{document.querySelectorAll('.relation-inspector').forEach(el=>el.hidden=true);refreshComparison()};
document.getElementById('saveNow').onclick=save;
document.getElementById('allMode').onclick=()=>{all=!all;display();window.scrollTo(0,0)};
document.getElementById('reference').onchange=display;
for(const [id,delta] of [['smaller',-1],['larger',1]])document.getElementById(id).onclick=()=>{fontSize=Math.max(14,Math.min(24,fontSize+delta));document.documentElement.style.setProperty('--font-size',fontSize+'px');display()};
document.getElementById('downloadHtml').onclick=()=>{syncEmbedded();download('<!doctype html>\n'+document.documentElement.outerHTML,(data.code||'kepu')+'_逐字稿对照.html','text/html;charset=utf-8')};
document.getElementById('exportText').onclick=()=>{const text='# '+(data.code||'')+' '+data.title+' · 锦成版\n\n'+data.sections.map(s=>'## '+s.id+'. '+s.title+'\n\n'+s.mine).join('\n\n')+'\n\n# 批注\n\n'+data.sections.filter(s=>s.note).map(s=>'## 第 '+s.id+' 段\n\n'+s.note).join('\n\n');download(text,(data.code||'kepu')+'_锦成版与批注.md','text/markdown;charset=utf-8')};
window.addEventListener('beforeunload',e=>{if(dirty&&online){e.preventDefault();e.returnValue=''}});window.addEventListener('resize',()=>document.querySelectorAll('textarea').forEach(el=>{if(el.offsetParent)resize(el)}));
render();if(!conflict){message(online?(dirty?'已恢复上次未保存的修改':'全部修改已保存到 HTML'):'直接打开模式：修改暂存于浏览器');if(dirty&&online)timer=setTimeout(save,100)}
/* 选中文字即批注：浮标 → 就地面板 → 写进该段批注 */
(function(){
 let bubble=null,panel=null,selCache=null;
 function ensureBubble(){if(bubble)return;bubble=make('div');bubble.id='note-bubble';bubble.textContent='批注这段';bubble.onmousedown=e=>{e.preventDefault();e.stopPropagation()};bubble.onclick=()=>{if(selCache){const r=bubble.getBoundingClientRect();openPanel(selCache.text,selCache.seg,selCache.who,r)}};document.body.appendChild(bubble)}
 function hideBubble(){if(bubble)bubble.style.display='none';selCache=null}
 function showBubble(x,y,text,seg,who){ensureBubble();selCache={text,seg,who};bubble.style.display='block';const bw=bubble.offsetWidth;bubble.style.left=Math.min(Math.max(8,x-bw/2),window.innerWidth-bw-8)+'px';bubble.style.top=Math.max(8,y-40)+'px'}
 function ensurePanel(){if(panel)return;panel=make('div');panel.id='note-panel';const q=make('div','q');q.id='note-panel-quote';const label=make('div','small','批注（存进这一段，给 AI 看）');label.style.margin='0 0 6px';const input=make('textarea');input.id='note-panel-input';input.placeholder='写为什么这样改、哪里不对、想要什么…';const btns=make('div','btns'),cancel=make('button','','取消'),save=make('button','primary','存进批注');btns.append(cancel,save);panel.append(q,label,input,btns);cancel.onclick=closePanel;save.onclick=saveNote;panel.onmousedown=e=>e.stopPropagation();input.addEventListener('input',()=>{input.style.height='auto';input.style.height=Math.max(88,input.scrollHeight)+'px'});document.body.appendChild(panel)}
 function openPanel(text,seg,who,anchor){ensurePanel();panel._text=text;panel._seg=seg;panel._who=who;if(bubble)bubble.style.display='none';const q=document.getElementById('note-panel-quote');q.textContent='你选中的'+(who?'（'+who+'）':'')+'：「'+text+'」';const input=document.getElementById('note-panel-input');input.value='';input.style.height='88px';panel.style.display='block';input.focus();const pw=panel.offsetWidth,ph=panel.offsetHeight;let left=anchor?anchor.left:(window.innerWidth-pw)/2,top=anchor?anchor.bottom+6:window.innerHeight*0.2;left=Math.max(8,Math.min(left,window.innerWidth-pw-8));if(top+ph>window.innerHeight-8&&anchor)top=Math.max(8,anchor.top-ph-6);top=Math.max(8,Math.min(top,window.innerHeight-ph-8));panel.style.left=left+'px';panel.style.top=top+'px'}
 function closePanel(){if(panel)panel.style.display='none';hideBubble()}
 function saveNote(){if(!panel)return;const seg=panel._seg,val=document.getElementById('note-panel-input').value.trim();if(!seg){closePanel();return}const note=seg.querySelector('textarea.note');if(note&&val){const area=note.closest('.note-area');if(area&&area._open)area._open();note.value=(note.value?note.value+'\n\n':'')+'【'+(panel._who||'')+'】「'+panel._text+'」\n'+val;note.dispatchEvent(new Event('input'))}closePanel();if(note){note.style.outline='2px solid #007aff';setTimeout(()=>{note.style.outline=''},800)}}
 document.addEventListener('mouseup',e=>{setTimeout(()=>{let text='',seg=null,who='';const t=e.target;if(t&&t.tagName==='TEXTAREA'&&t.classList.contains('note')){hideBubble();return}if(t&&t.tagName==='TEXTAREA'){if(t.selectionStart!==t.selectionEnd){text=t.value.substring(t.selectionStart,t.selectionEnd).trim();seg=t.closest('.segment');who='锦成版'}}else{const sel=window.getSelection();if(sel&&!sel.isCollapsed){text=sel.toString().trim();let n=sel.anchorNode;if(n&&n.nodeType===3)n=n.parentNode;seg=n&&n.closest?n.closest('.segment'):null;const ref=n&&n.closest?n.closest('.ref'):null;who=ref?ref.dataset.author||'':''}}if(!text||!seg){hideBubble();return}showBubble(e.clientX||0,e.clientY||0,text,seg,who)},10)});
 document.addEventListener('mousedown',e=>{if(bubble&&e.target!==bubble)hideBubble();if(panel&&e.target!==panel&&!panel.contains(e.target))closePanel()});
 document.addEventListener('scroll',()=>{if(panel&&panel.style.display!=='none')return;hideBubble()},true);
})();
</script>
</body></html>
'''

KINDS = [
    ('叫法', '给它什么名字：中文名、英文名、简称', '#ffd9d9'),
    ('比喻', '拿什么东西打比方', '#ffe4bf'),
    ('定义', '一句话说它是什么', '#d9eaf8'),
    ('场景', '从观众熟悉的一件事进', '#fff1b8'),
    ('对照', '以前怎样、现在怎样', '#d6f0dc'),
    ('产品', '点名手边的产品', '#e6dcf5'),
    ('判断', '要不要用、要不要管、要不要花钱', '#ffd9ec'),
    ('我', '说自己的经历', '#ece2cf'),
    ('过渡', '接到下一个词', '#d5f0f2'),
    ('动作', '让观众做一件事', '#e2e6ee'),
]
KIND_NAMES = [k for k, _, _ in KINDS]

def build(data):
    n = max(1, len(data['columns'])); gcols = min(3, n); grows = -(-n // gcols)
    rowcss = '.ref-cell:nth-child(-n+%d){border-bottom:1px solid var(--line)}' % (n - gcols) if grows > 1 else ''
    kindcss = ''.join('.match.k%d,.palette .k%d{background:%s}' % (i, i, c) for i, (k, _, c) in enumerate(KINDS))
    encoded = json.dumps(data, ensure_ascii=False).replace('<', '\\u003c')
    return (TEMPLATE.replace('__TITLE__', html.escape(data['title'])).replace('__CODE__', html.escape(data['code'] or ''))
            .replace('__GCOLS__', str(gcols)).replace('__GROWS__', str(grows)).replace('__MINECOL__', str(gcols + 1)).replace('__ROWCSS__', rowcss)
            .replace('__KINDCSS__', kindcss).replace('__KINDS__', json.dumps([[k, d] for k, d, _ in KINDS], ensure_ascii=False)).replace('__DATA__', encoded))

def main():
    if len(sys.argv) != 3: sys.exit(__doc__)
    src, out = sys.argv[1], sys.argv[2]
    data = merge_old(parse(open(src, encoding='utf-8').read()), out)
    page = build(data)
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=os.path.dirname(os.path.abspath(out)) or '.', prefix='.compare-build-', delete=False) as f:
        f.write(page); tmp = f.name
    os.replace(tmp, out)
    print(f"写入 {out}：{len(data['sections'])} 段，参考列 {'、'.join(data['columns']) or '无'}，revision {data['revision']}")

if __name__ == '__main__':
    main()
