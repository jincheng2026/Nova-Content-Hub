#!/usr/bin/env python3
"""Account report: reviewed prose + one computed dataset + shared offline charts."""
from __future__ import annotations
from collections import Counter, defaultdict
import hashlib
import html
import importlib.util
import json
import math
from pathlib import Path
import statistics

ROOT = Path(__file__).resolve().parents[1]
VERSION = 'account-2'
# 优先用同级 jc-comment-visualize 的阅读排版，保持两份报告一致；单独安装时用自带副本。
_SIBLING_READING = ROOT.parent / 'jc-comment-visualize'
if (_SIBLING_READING / 'scripts/reading_layout.py').is_file():
    READING_SCRIPT, READING_CSS = _SIBLING_READING / 'scripts/reading_layout.py', _SIBLING_READING / 'assets/reading.css'
else:
    READING_SCRIPT, READING_CSS = ROOT / 'scripts/shared/reading_layout.py', ROOT / 'assets/shared/reading.css'
_reading_spec = importlib.util.spec_from_file_location('jc_account_reading', READING_SCRIPT)
reading = importlib.util.module_from_spec(_reading_spec)
_reading_spec.loader.exec_module(reading)
METRICS = [('like_count','点赞'),('comment_count','评论'),('collect_count','收藏'),('share_count','分享')]
CHAPTERS = [('narration','内容表达'),('positioning','账号定位'),('directions','方向与表现'),('comments','评论需求'),('transfer','如何借鉴'),('commercial','商业证据')]

def valid_number(x):
    return isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x) and x >= 0

def median(rows, key):
    values=[r[key] for r in rows if valid_number(r.get(key))]
    return statistics.median(values) if values else None

def safe_json(value):
    return json.dumps(value,ensure_ascii=False,allow_nan=False).replace('<','\\u003c')

def fmt(value):
    if value is None: return '未取得'
    return f'{value:,.0f}' if float(value).is_integer() else f'{value:,.2f}'.rstrip('0').rstrip('.')

def fingerprint(value):
    return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,allow_nan=False).encode()).hexdigest()

def check_records(records, comments):
    for rows,field in [(records,'content_id'),(comments,'comment_id')]:
        seen=set()
        for row in rows:
            if not isinstance(row,dict) or not row.get(field): raise ValueError(f'缺少 {field}')
            key=(row.get('platform'),row.get('content_id'),row[field])
            if key in seen: raise ValueError(f'重复的 {field}，请先规范化去重')
            seen.add(key)
    for field in ['platform','author_id','collection_batch_id']:
        if len({r[field] for r in records if r.get(field)})>1:
            raise ValueError(f'账号报告不能混合多个 {field}')
    for r in records:
        b=r.get('baseline',{})
        if b.get('ratio') is not None:
            if (not valid_number(b['ratio']) or b.get('reason') or not valid_number(b.get('median')) or b['median']<=0
                or not valid_number(b.get('sample_count')) or b['sample_count']<1):
                raise ValueError('基线倍率与基线有效状态不一致')
            metric=b.get('metric')
            if not valid_number(r.get(metric)) or not math.isclose(b['ratio'],r[metric]/b['median'],rel_tol=1e-6):
                raise ValueError('基线倍率无法由目标指标和中位数复算')
            values=b.get('sample_values')
            if values is not None and (len(values)!=b['sample_count'] or not all(valid_number(v) for v in values)
                or not math.isclose(statistics.median(values),b['median'],rel_tol=1e-6)):
                raise ValueError('基线中位数与样本明细不一致')
    known={str(r['content_id']) for r in records}
    if known and any(str(c.get('content_id')) not in known for c in comments):
        raise ValueError('评论引用了作品明细之外的作品')
    for c in comments:
        if not isinstance(c.get('demand_tags',[]),list): raise ValueError('demand_tags 必须为数组')
        if len(set(c.get('demand_tags',[]))) != len(c.get('demand_tags',[])): raise ValueError('同一评论的需求标签重复')

def compute_account(payload):
    records,comments=payload.get('records',[]),payload.get('comments',[])
    if not isinstance(records,list) or not isinstance(comments,list): raise ValueError('records 和 comments 必须为数组')
    check_records(records,comments)
    directions=defaultdict(list)
    for r in records: directions[r.get('main_direction') or '未分类'].append(r)
    groups=[]
    for name,rows in directions.items():
        groups.append({'name':name,'n':len(rows),'valid_n':{key:sum(valid_number(r.get(key)) for r in rows) for key,_ in METRICS},
                       **{key:median(rows,key) for key,_ in METRICS}})
    groups.sort(key=lambda g:-(g['like_count'] if g['like_count'] is not None else -1))
    likes=[r['like_count'] for r in records if valid_number(r.get('like_count'))]
    levels=Counter(c.get('level') if c.get('level') in {'top_level','reply'} else 'unknown' for c in comments)
    return {'works':len(records),'comments':len(comments),'medians':{key:median(records,key) for key,_ in METRICS},
            'valid_n':{key:sum(valid_number(r.get(key)) for r in records) for key,_ in METRICS},
            'groups':groups,'comment_levels':dict(levels),'likes_total':sum(likes),
            'top3_likes_share':sum(sorted(likes,reverse=True)[:3])/sum(likes) if sum(likes)>0 else None,
            'reviewed_comments':sum(c.get('annotation_reviewed') is True for c in comments)}

def chart_specs(payload, computed=None):
    data=computed or compute_account(payload)
    records,comments=payload.get('records',[]),payload.get('comments',[])
    titles={str(r['content_id']):r.get('title',str(r['content_id'])) for r in records}
    def work(r):
        return {'id':str(r['content_id']),'title':str(r.get('title','')),'date':str(r.get('published_at') or '')[:10],
                **{k:r[k] if valid_number(r.get(k)) else None for k,_ in METRICS}}
    works=[work(r) for r in records]
    specs=[{'id':'account-trend','kind':'trend','title':'按发布时间看作品表现','rows':sorted([r for r in works if r['date']],key=lambda r:r['date']),
            'medians':data['medians'],'note':'同批采集的互动快照；横轴为发布时间。虚线为本批样本中位数，不是播放率或涨粉。对数刻度只显示正值。'}]
    if data['groups'] and any(r.get('main_direction') for r in records):
        for key,label in METRICS:
            specs.append({'id':'direction-'+key,'kind':'directions','metric':key,'title':label+'中位数','rows':data['groups'],
                          'note':'n 为本指标有效作品数／该方向作品总数；未取得不补零。各图分别使用自己的刻度。'})
    valid=[]
    for r in records:
        b=r.get('baseline',{})
        if valid_number(b.get('ratio')):
            valid.append({'title':str(r.get('title','')),'ratio':b['ratio']})
    if valid: specs.append({'id':'relative-performance','kind':'relative','title':'相对账号自身基线','rows':valid,'note':'倍率来自逐条 baseline；样本时间窗、排除自身规则及分组见作品明细。'})
    by_id={r['id']:r for r in works}
    for i,pair in enumerate(payload.get('account_analysis',{}).get('comparisons',[])):
        ids=[str(v) for v in pair.get('content_ids',[])]
        if len(set(ids))<2 or any(pid not in by_id for pid in ids): raise ValueError('对照至少需要两条不同且已取得的作品')
        specs.append({'id':'comparison-'+str(i),'kind':'pairs','title':pair.get('title','作品对照'),'rows':[by_id[pid] for pid in ids],
                      'note':'数值为各作品同批采集快照；日期和分发差异仍需考虑，不能据此证明因果。'})
    if comments:
        videos=sorted({str(c['content_id']) for c in comments})
        subsets=[]
        for video in ['all',*videos]:
            for level in ['top_level','reply','unknown','all']:
                subset=[c for c in comments if (video=='all' or str(c['content_id'])==video) and
                        (level=='all' or (c.get('level') if c.get('level') in {'top_level','reply'} else 'unknown')==level)]
                themes=defaultdict(list)
                for c in subset:
                    if c.get('annotation_reviewed') is True:
                        for tag in c.get('demand_tags',[]): themes[tag].append(c)
                rows=[]
                for name,cs in themes.items():
                    like_values=[c['like_count'] for c in cs if valid_number(c.get('like_count'))]
                    rows.append({'name':name,'count':len(cs),'likes':sum(like_values) if like_values else None,'likes_missing':len(cs)-len(like_values),
                                 'examples':[{'id':str(c['comment_id']),'text':c.get('text',''),'likes':c.get('like_count') if valid_number(c.get('like_count')) else None}
                                             for c in sorted(cs,key=lambda c:-(c.get('like_count') or 0))[:3]]})
                rows.sort(key=lambda r:(-r['count'],r['name']))
                subsets.append({'video':video,'level':level,'rows':rows,'denominator':len(subset),
                    'reviewed':sum(c.get('annotation_reviewed') is True for c in subset),
                    'tagged':sum(c.get('annotation_reviewed') is True and bool(c.get('demand_tags')) for c in subset)})
        default_level=reading.options(payload).get('default_level','top_level')
        if default_level=='top': default_level='top_level'
        if default_level not in {'top_level','reply','unknown','all'}: raise ValueError('Invalid default comment level')
        default=next(s for s in subsets if s['video']=='all' and s['level']==default_level)
        specs.append({'id':'comment-themes','kind':'themes','metric':'count','title':'评论里出现了哪些具体需求',**default,'subsets':subsets,
                      'videos':[{'id':v,'title':titles.get(v,v)} for v in videos],
                      'note':'主题来自语义复核，可多标签；条数不是人数。默认显示'+{'top_level':'顶层评论','reply':'楼内回复','unknown':'未知层级','all':'全部层级'}[default_level]+'；未知层级不混入顶层分母。'})
        rows=[]
        for video in videos:
            levels=Counter(c.get('level') if c.get('level') in {'top_level','reply'} else 'unknown' for c in comments if str(c['content_id'])==video)
            rows.append({'title':titles.get(video,video),**{k:levels[k] for k in ['top_level','reply','unknown']}})
        specs.append({'id':'comment-coverage','kind':'coverage','title':'这些评论来自哪些作品','rows':rows,
                      'note':'图中是实际取得的评论行数。回复列为 0 只表示本次未取得回复行，不能解释为无人回复。'})
    return specs

def chart_html(spec, esc=html.escape):
    kind=spec['kind']
    controls=''
    if kind in {'trend','pairs'}:
        controls='<label>指标<select data-metric>'+''.join(f'<option value="{k}">{v}</option>' for k,v in METRICS)+'</select></label>'
    if kind=='trend':
        controls+='<label>刻度<select data-scale><option value="linear">线性</option><option value="log">对数，仅正值</option></select></label>'
    if kind=='themes':
        controls='<label>统计<select data-metric><option value="count">出现条数</option><option value="likes">获赞总数</option></select></label><label>作品<select data-video><option value="all">全部已采集作品</option>'+''.join('<option value="'+esc(v['id'])+'">'+esc(v['title'][:36])+'</option>' for v in spec['videos'])+'</select></label><label>层级<select data-level><option value="top_level">顶层评论</option><option value="reply">回复</option><option value="unknown">层级未知</option><option value="all">全部层级</option></select></label>'
        controls=controls.replace('<option value="'+spec.get('level','top_level')+'">','<option value="'+spec.get('level','top_level')+'" selected>')
    n=max([len(s['rows']) for s in spec.get('subsets',[])] or [len(spec['rows'])])
    height=360 if kind=='trend' else max(220,n*38+64)
    out='<article class="chart-block" data-chart="'+esc(spec['id'])+'"><h3>'+esc(spec['title'])+'</h3><div class="chart-controls">'+controls+'</div>'
    out+='<div class="chart" id="'+esc(spec['id'])+'" style="height:'+str(height)+'px" role="img" aria-label="'+esc(spec['title'])+'"></div><p class="note">'+esc(spec['note'])+'</p>'
    if kind=='themes':out+='<p class="note" data-theme-note></p><div data-theme-evidence></div>'
    return out+'</article>'

def chart_scripts(specs):
    vendor=(ROOT/'assets/vendor/echarts.min.js').read_text(encoding='utf-8')
    client=(ROOT/'assets/account-charts.mjs').read_text(encoding='utf-8')
    return '<script>'+vendor+'</script><script>'+client+'</script><script id="chart-data" type="application/json">'+safe_json(specs)+'</script><script>AccountCharts.mount(JSON.parse(document.getElementById("chart-data").textContent));</script>'

def render_account_report(payload,title=None):
    # Imports occur after render_report has initialized; keep one URL/redaction policy.
    from render_report import _escape, _safe_source_url, _redact_text
    from research_decisions import source_index, validate_citation
    data=compute_account(payload)
    sources=source_index(payload.get('sources',[]))
    analysis=payload.get('account_analysis',{})
    presentation=reading.options(payload)
    emphasis=presentation.get('emphasis',[])
    if analysis.get('version',1)!=1: raise ValueError('不支持的 account_analysis.version')
    specs=chart_specs(payload,data)
    records,comments=payload.get('records',[]),payload.get('comments',[])
    citations_checked=0
    def esc(value):
        return _escape(value,fallback='')
    def clean(value):
        return [_redact_text(v,fallback='') for v in value] if isinstance(value,list) else _redact_text(value,fallback='')
    safe_emphasis=clean(emphasis)
    def prose(value,cls='reading-prose',emphasis=None):
        return reading.paragraphs(clean(value),cls,safe_emphasis)
    def marked(value,phrases=None):
        return reading.highlight(clean(value),clean(phrases or safe_emphasis))
    def heading(value,number=None):
        return reading.heading(clean(value),number)
    def link(url,label):
        url=_safe_source_url(url)
        return '<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+'</a>' if url else esc(label)
    def citations(refs,with_labels=False):
        nonlocal citations_checked
        blocks=[]
        for ref in refs:
            validate_citation(ref,sources);citations_checked+=1
            src=sources[ref['source_id']]
            quote=reading.highlight(clean(ref['quote']),clean(presentation.get('quote_emphasis',{}).get(ref['source_id'],[])))
            label=presentation.get('source_labels',{}).get(ref['source_id'],'') if with_labels else ''
            label_html='<span class="quote-label">'+esc(label)+'</span>' if label else ''
            blocks.append('<blockquote>'+label_html+'<p>'+quote+'</p><small><a href="#source-'+esc(ref['source_id'])+'">'+esc(src.get('title',ref['source_id']))+'</a> · '+esc(src.get('kind','证据类型未标注'))+' · '+esc(src.get('review_status','复核状态未标注'))+'</small></blockquote>')
        return ''.join(blocks)
    def card(item,number=None,mode='standard'):
        if not item.get('title') or not item.get('observation'): raise ValueError('分析卡片缺少 title 或 observation')
        refs=item.get('citations',[])
        content_ids={sources[c['source_id']].get('content_id') for c in refs if c.get('source_id') in sources}
        content_ids.discard(None)
        if item.get('pattern_type')=='repeated' and len(content_ids)<2: raise ValueError('重复模式需要两条不同作品的证据')
        if item.get('pattern_type')=='repeated' and any(sources[c['source_id']].get('kind')=='transcript' and sources[c['source_id']].get('text_reviewed') is not True for c in refs if c.get('source_id') in sources):
            raise ValueError('未经文字复核的转写只能支持待核对观察，不能确认重复模式')
        tag={'single':'单次观察','repeated':'重复出现','inference':'分析推断','unknown':'尚待验证'}.get(item.get('pattern_type'),'观察与判断')
        out='<article class="finding"><span class="badge">'+tag+'</span>'+heading(item['title'],number)
        out+='<div class="finding-observation">'+prose(item['observation'])+'</div>'
        interpreted=prose(item.get('interpretation',''),'reasoning-paragraph')
        test_shown=False
        if mode=='summary':
            out+='<div class="summary-copy">'+interpreted+'</div><details><summary>查看依据'+('' if refs else '：尚缺可核对引用')+'</summary>'+citations(refs)+'</details>'
        elif mode=='recommendation' and item.get('testable_change'):
            out+='<div class="recommendation-panel"><div class="recommendation-action"><h4 class="evidence-heading">具体怎么做</h4>'+interpreted+'</div><div class="recommendation-check"><h4 class="evidence-heading">怎样检查是否有用</h4>'+prose(item['testable_change'])+'</div></div>'
            out+='<details><summary>查看对标依据</summary>'+citations(refs)+'</details>'
            test_shown=True
        else:
            tagged=any(ref.get('display') for ref in refs)
            primary=[ref for ref in refs if ref.get('display','primary')=='primary'] if tagged else refs[:2]
            supporting=[ref for ref in refs if ref not in primary]
            out+='<div class="finding-columns"><div class="finding-evidence"><h4 class="evidence-heading">关键原话</h4><div class="quote-list">'+citations(primary,tagged)+'</div></div>'
            if interpreted:out+='<div class="finding-reasoning"><h4 class="evidence-heading">怎样理解</h4>'+interpreted+'</div>'
            out+='</div>'
            if supporting:out+='<details><summary>另外 '+str(len(supporting))+' 条依据</summary>'+citations(supporting,tagged)+'</details>'
        if item.get('testable_change') and not test_shown:
            out+='<div class="recommendation-check"><h4 class="evidence-heading">可以怎样试</h4>'+prose(item['testable_change'])+'</div>'
        for key,label in [('conditions','适用条件'),('not_suitable','不宜照搬的前提')]:
            if item.get(key):out+='<p><strong>'+label+'：</strong>'+marked(item[key])+'</p>'
        out+=reading.context(clean(item.get('alternative_explanations',[])),emphasis=safe_emphasis)
        if item.get('own_citations'):out+='<details><summary>用户本人的材料依据</summary>'+citations(item['own_citations'])+'</details>'
        return out+'</article>'
    def table(headers,rows):
        return '<div class="table-scroll"><table><thead><tr>'+''.join('<th scope="col">'+esc(h)+'</th>' for h in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+v+'</td>' for v in row)+'</tr>' for row in rows)+'</tbody></table></div>'
    def section(sid,title,lead,body):
        return '<section class="card" id="'+esc(sid)+'"><h2>'+esc(title)+'</h2><p class="lead">'+esc(lead)+'</p>'+body+'</section>'
    body='<header><div class="eyebrow">账号对标研究</div><h1>'+esc(title or payload.get('title','账号研究报告'))+'</h1>'+prose(payload.get('conclusion','以下结论仅对应本次已取得的材料。'),'lead')+'<p class="meta">采集时点：'+esc(payload.get('as_of','未记录'))+'</p></header>'
    body+='<div class="stats">'+''.join('<div class="stat"><b>'+esc(fmt(v))+'</b><span>'+label+'</span></div>' for label,v in [('作品样本',data['works']),('评论样本',data['comments']),('点赞中位数',data['medians']['like_count']),('原文来源',len(sources))])+'</div>'
    nav=[('summary','先看结论'),*CHAPTERS,('catalog','作品明细'),('scope','研究范围')]
    body+='<nav class="navbar" aria-label="报告章节"><div class="nav-scroll">'+''.join('<a class="nav-link'+(' light' if sid in {'catalog','scope'} else '')+'" href="#'+sid+'">'+label+'</a>' for sid,label in nav)+'</div></nav>'
    summaries=analysis.get('summary_cards',[])
    body+=section('summary','先看结论','先判断值得学什么，再核对依据。','<div class="summary-grid">'+''.join(card(c,i,'summary') for i,c in enumerate(summaries,1))+'</div>' if summaries else '<p class="note">尚未完成内容分析。当前页面展示已取得数据，不能代替账号内容判断。</p>')
    chapter_list=analysis.get('chapters',[])
    chapter_ids=[c.get('id') for c in chapter_list]
    if len(chapter_ids)!=len(set(chapter_ids)) or any(v not in dict(CHAPTERS) for v in chapter_ids): raise ValueError('账号章节 id 重复或不支持')
    chapters={c['id']:c for c in chapter_list}
    for sid,label in CHAPTERS:
        chapter=chapters.get(sid,{})
        content=''.join(card(c,i,'recommendation' if sid=='transfer' else 'standard') for i,c in enumerate(chapter.get('cards',[]),1))
        if sid=='directions':
            content+=chart_html(specs[0],esc)
            grouped=[s for s in specs if s['kind']=='directions']
            if grouped: content+='<div class="chart-grid">'+''.join(chart_html(s,esc) for s in grouped)+'</div>'
            content+=table(['主方向','作品数',*[l+'中位数' for _,l in METRICS]],[[esc(g['name']),str(g['n']),*[fmt(g[k]) for k,_ in METRICS]] for g in data['groups']])
            for s in specs:
                if s['kind']=='relative':content+=chart_html(s,esc)
            for i,pair in enumerate(analysis.get('comparisons',[])):
                content+=chart_html(next(s for s in specs if s['id']=='comparison-'+str(i)),esc)
                if pair.get('observation'):content+=card({**pair,'title':pair.get('title','作品对照'),'pattern_type':'inference'})
        if sid=='comments':
            content+='<p class="note">实际取得：'+str(data['comments'])+' 条。'+esc('；'.join({'top_level':'顶层','reply':'回复','unknown':'层级未知'}[k]+' '+str(v)+' 条' for k,v in data['comment_levels'].items()))+'。分类复核 '+str(data['reviewed_comments'])+' 条。</p>'
            content+=''.join(chart_html(s,esc) for s in specs if s['kind'] in {'themes','coverage'})
            content+='<details><summary>查看全部评论原文与层级</summary><div class="table-scroll"><table><thead><tr><th>原评论</th><th>获赞</th><th>层级</th><th>作品</th><th>回复覆盖</th></tr></thead><tbody>'
            work_urls={str(r['content_id']):r.get('source_url') for r in records}
            for c in comments:
                url=_safe_source_url(c.get('source_url')) or _safe_source_url(work_urls.get(str(c['content_id'])))
                source_link=link(url,str(c['content_id'])) if url else esc(str(c['content_id']))+'（未取得公开来源链接）'
                content+='<tr id="comment-'+esc(str(c['comment_id']))+'"><td>'+esc(c.get('text',''))+'</td><td>'+fmt(c.get('like_count') if valid_number(c.get('like_count')) else None)+'</td><td>'+esc({'top_level':'顶层','reply':'回复'}.get(c.get('level'),'层级未知'))+'</td><td>'+source_link+'</td><td>'+esc({'complete':'已取声明的可见回复','partial':'部分取得','not_fetched':'未取得'}.get(c.get('reply_coverage'),'未知'))+'</td></tr>'
            content+='</tbody></table></div></details>'
        if not content:content='<p class="note">当前材料尚未支持这一部分的具体判断。</p>'
        body+=section(sid,chapter.get('title',label),chapter.get('lead',''),content)
    rows=''
    for r in records:
        baseline=r.get('baseline',{})
        baseline_text=''
        if baseline:
            baseline_text='<details><summary>基线依据</summary><p>'+esc(str(baseline.get('reason') or '有效倍率'))+' · n='+str(baseline.get('sample_count',0))+' · 中位数 '+fmt(baseline.get('median'))+' · 倍率 '+fmt(baseline.get('ratio'))+'</p><p class="audit">'+esc(json.dumps(baseline,ensure_ascii=False))+'</p></details>'
        original=esc(r['text']) if isinstance(r.get('text'),str) and r['text'].strip() else '未取得发布正文；当前仅有标题。'
        rows+='<tr id="work-'+esc(str(r['content_id']))+'"><td>'+esc(str(r.get('published_at') or '')[:10])+'</td><td>'+link(r.get('source_url'),r.get('title','未提供标题'))+'<details><summary>发布原文</summary><p class="source-text">'+original+'</p></details>'+baseline_text+'</td><td>'+esc(r.get('main_direction','未分类'))+'</td>'+''.join('<td class="num">'+fmt(r[k] if valid_number(r.get(k)) else None)+'</td>' for k,_ in METRICS)+'</tr>'
    body+=section('catalog','作品明细','图表与本表使用同一份规范化数据。','<div class="toolbar"><label>搜索作品 <input id="work-search" type="search" placeholder="输入标题或方向"></label><output id="work-count" aria-live="polite">'+str(len(records))+' 条</output></div><div class="table-scroll"><table id="works-table"><thead><tr><th>日期</th><th>作品</th><th>方向</th>'+''.join('<th>'+l+'</th>' for _,l in METRICS)+'</tr></thead><tbody>'+rows+'</tbody></table></div>')
    scope=prose(analysis.get('collection_note','采集排序与覆盖范围尚未补充。'))
    scope+=''.join(prose(s,'note') for s in payload.get('limitations',[]))
    scope+='<h3>原文来源</h3>'
    for sid,source in sources.items():
        scope+='<details id="source-'+esc(sid)+'"><summary>'+esc(source.get('title',sid))+'</summary><p>'+link(source.get('source_url'),'公开来源')+'</p><p class="note">'+esc(source.get('kind','类型未标注'))+' · '+esc(source.get('review_status','复核状态未标注'))+'</p><div class="source-text">'+esc(source['text'])+'</div></details>'
    audit={'renderer_version':VERSION,'input_sha256':fingerprint(payload),'works':data['works'],'comments':data['comments'],'comment_levels':data['comment_levels'],'citations_checked':citations_checked}
    scope+='<details><summary>生成依据与数据一致性</summary><p class="audit">'+esc(json.dumps(audit,ensure_ascii=False))+'</p></details>'
    body+=section('scope','研究范围','已取得、可推断与仍未知的内容分别记录。',scope)
    body+='<footer>公开材料支持观察与判断；互动快照不证明因果。所有数字均对应本次样本。</footer>'
    script=r"""
const nav=document.querySelector('.navbar'),links=[...nav.querySelectorAll('a')];
function openTarget(id){const el=document.getElementById(id);if(!el)return;if(el.hidden&&id.startsWith('work-')){const input=document.getElementById('work-search');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}))}for(let n=el;n;n=n.parentElement){if(n.tagName==='DETAILS')n.open=true;n.hidden=false}el.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'start'});}
document.addEventListener('click',e=>{const a=e.target.closest('a[href^="#"]');if(!a)return;const id=a.getAttribute('href').slice(1);if(!document.getElementById(id))return;e.preventDefault();history.replaceState(null,'','#'+id);openTarget(id)});
function updateNav(){const line=nav.getBoundingClientRect().height+30;let chosen=links[0];for(const a of links){if(document.getElementById(a.hash.slice(1)).getBoundingClientRect().top<=line)chosen=a}links.forEach(a=>a===chosen?a.setAttribute('aria-current','location'):a.removeAttribute('aria-current'));document.documentElement.style.setProperty('--nav-height',nav.offsetHeight+'px');}
window.addEventListener('scroll',updateNav,{passive:true});window.addEventListener('resize',updateNav);updateNav();if(location.hash)openTarget(decodeURIComponent(location.hash.slice(1)));
document.getElementById('work-search').addEventListener('input',e=>{let n=0;document.querySelectorAll('#works-table tbody tr').forEach(r=>{r.hidden=!r.textContent.toLowerCase().includes(e.target.value.toLowerCase());if(!r.hidden)n++});document.getElementById('work-count').textContent=n+' 条'});
"""
    template=(ROOT/'assets/account-template.html').read_text(encoding='utf-8')
    template=template.replace('</style>','</style><style>'+READING_CSS.read_text(encoding='utf-8')+'</style>',1).replace('<body>','<body class="reading-report">',1)
    scripts=chart_scripts(specs)+'<script id="report-audit" type="application/json">'+safe_json(audit)+'</script><script>'+script+'</script>'
    # Sanitize fields inside chart JSON as well as visible prose.
    scripts=scripts.replace(safe_json(specs),safe_json(json.loads(_redact_text(safe_json(specs)))))
    return template.replace('{{TITLE}}',esc(title or payload.get('title','账号研究报告'))).replace('{{BODY}}',body).replace('{{SCRIPTS}}',scripts)
