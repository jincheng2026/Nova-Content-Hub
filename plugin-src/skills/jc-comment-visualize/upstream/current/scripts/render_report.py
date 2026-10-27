#!/usr/bin/env python3
"""Render a self-contained comment report from reviewed, source-bound JSON."""
from __future__ import annotations

import argparse
import importlib.util
import hashlib
import html
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
VERSION = '2.1.0'
LEVELS = {'top': '一级评论', 'reply': '楼内回复', 'unknown': '层级未知'}
_reading_spec = importlib.util.spec_from_file_location('jc_report_reading', ROOT / 'scripts/reading_layout.py')
reading = importlib.util.module_from_spec(_reading_spec)
_reading_spec.loader.exec_module(reading)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def esc(value):
    return html.escape(str(value), quote=True)


def anchor(source_id):
    return 'source-' + hashlib.sha256(source_id.encode()).hexdigest()[:20]


def paras(value, cls=''):
    values = value if isinstance(value, list) else [value]
    return ''.join(f'<p class="{cls}">{esc(p)}</p>' for v in values for p in str(v).split('\n\n') if p.strip())


def require(condition, message):
    if not condition:
        raise ValueError(message)


def string(row, key):
    require(isinstance(row.get(key), str) and row[key].strip(), f'{key} 需要非空文字')


def number(value, name, nullable=False):
    require((nullable and value is None) or (type(value) is int and value >= 0), f'{name} 应为非负整数' + ('或 null' if nullable else ''))


def valid_url(value, required=False):
    if not value and not required:
        return
    require(isinstance(value, str), '来源链接应为字符串')
    parts = urlsplit(value)
    require(parts.scheme in ('http', 'https') and bool(parts.hostname) and not parts.username and not parts.password, '来源链接需要不含登录信息的 HTTP(S) URL')


def source_map(data):
    sources = {s['id']: s for s in data.get('sources', [])}
    for c in data['comments']:
        sources['comment:' + c['cid']] = dict(c, id='comment:' + c['cid'], kind='comment', title=c['video_title'], review_status=LEVELS[c['level']])
    return sources


def check_citations(citations, sources, personal=False):
    require(isinstance(citations, list) and bool(citations), '需要至少一条原文引用')
    for citation in citations:
        sid, quote = citation.get('source_id'), citation.get('quote')
        require(sid in sources, f'找不到引用来源：{sid}')
        require(isinstance(quote, str) and quote.strip() and quote in sources[sid]['text'], f'引文与原文不一致：{sid}')
        require(citation.get('display', 'primary') in ('primary', 'supporting'), '引用 display 需为 primary 或 supporting')
        if sources[sid]['kind'] == 'comment':
            require(sources[sid]['reviewed'] is True, f'引用评论尚未语义复核：{sid}')
        if personal:
            require(sources[sid]['kind'] == 'own_material', '个人建议必须引用本人材料')


def validate(data, level='L4'):
    require(level in ('L1', 'L2', 'L3', 'L4'), '未知检查层级')
    require(data.get('schema_version') == 2, 'schema_version 必须为 2')
    for key in ('title', 'summary', 'collected_at'):
        string(data, key)
    for key in ('comments', 'topics', 'sources', 'findings', 'recommendations'):
        require(isinstance(data.get(key), list), f'{key} 必须是列表')
    coverage = data.get('coverage', {})
    for key in ('note', 'reported_total_scope', 'collection_note'):
        string(coverage, key)
    number(coverage.get('raw_rows'), 'raw_rows')
    number(coverage.get('reported_total'), 'reported_total', True)
    require(coverage['raw_rows'] >= len(data['comments']), '原始行数小于去重后评论数')
    for name in ('topics', 'sources', 'findings', 'recommendations'):
        ids = []
        for row in data[name]:
            string(row, 'id')
            require(bool(re.fullmatch(r'[A-Za-z][A-Za-z0-9_.-]*', row['id'])), f'{name} id 需为稳定的英文标识')
            ids.append(row['id'])
        require(len(ids) == len(set(ids)), f'{name} 含重复 id')
    topic_ids = {t['id'] for t in data['topics']}
    for t in data['topics']:
        string(t, 'label')
        string(t, 'description')
    cids = []
    for c in data['comments']:
        for key in ('cid', 'content_id', 'video_title', 'text'):
            string(c, key)
        require(c.get('level') in LEVELS, '评论层级需为 top、reply 或 unknown')
        require(type(c.get('reviewed')) is bool, 'reviewed 需要布尔值')
        number(c.get('likes'), 'likes', True)
        tags = c.get('topic_ids')
        require(isinstance(tags, list) and all(isinstance(t, str) for t in tags), 'topic_ids 需为字符串列表')
        require(set(tags) <= topic_ids and len(tags) == len(set(tags)), f'评论主题未知或重复：{c["cid"]}')
        valid_url(c.get('source_url'), required=True)
        cids.append(c['cid'])
    require(len(cids) == len(set(cids)), '评论 cid 重复，先按 cid 去重')
    for s in data['sources']:
        for key in ('title', 'text', 'kind', 'review_status'):
            string(s, key)
        require(s['kind'] in ('transcript', 'description', 'own_material', 'interview', 'document'), '未知材料类型')
        valid_url(s.get('source_url'))
    if level != 'L1':
        used = {t for c in data['comments'] if c['reviewed'] for t in c['topic_ids']}
        require(topic_ids <= used, '部分主题没有已复核评论支撑；删除空主题或完成复核')
    sources = source_map(data)
    for f in data['findings']:
        for key in ('title', 'observation', 'explanation', 'scope'):
            string(f, key)
        require(f.get('status') in ('observation', 'inference'), '发现状态需为 observation 或 inference')
        if f['status'] == 'inference':
            alt = f.get('alternatives')
            require(bool(alt) and (isinstance(alt, str) or isinstance(alt, list) and all(isinstance(x, str) for x in alt)), '推断需要说明其他解释')
        check_citations(f.get('citations'), sources)
        require(any(c.get('display', 'primary') == 'primary' for c in f['citations']), '每项发现至少直接展示一处关键原话')
    if level in ('L3', 'L4') and (data['comments'] or data['sources']):
        require(bool(data['findings']), 'L3 需要有原文依据的发现')
    finding_ids = {f['id'] for f in data['findings']}
    for r in data['recommendations']:
        for key in ('title', 'action', 'verification'):
            string(r, key)
        refs = r.get('finding_ids')
        require(isinstance(refs, list) and refs and all(isinstance(x, str) for x in refs) and set(refs) <= finding_ids, '建议缺少有效的发现引用')
        require(r.get('audience') in ('general', 'personal'), '建议对象需为 general 或 personal')
        if r['audience'] == 'personal':
            check_citations(r.get('own_citations'), sources, personal=True)
        elif r.get('own_citations'):
            check_citations(r['own_citations'], sources)
    if level == 'L4' and data['findings']:
        require(bool(data['recommendations']), 'L4 需要说明可验证的应用建议')
    if data.get('frozen_findings_sha256'):
        require(data['frozen_findings_sha256'] == digest(data['findings']), '对象分析与冻结内容不一致')
    return sources


def selected_comments(data, video='all', level='all'):
    return [c for c in data['comments'] if (video == 'all' or c['content_id'] == video) and (level == 'all' or c['level'] == level)]


def statistics(data, video='all', level='all', sort='count'):
    comments = selected_comments(data, video, level)
    reviewed = [c for c in comments if c['reviewed']]
    topics = []
    for t in data['topics']:
        rows = [c for c in reviewed if t['id'] in c['topic_ids']]
        known = [c['likes'] for c in rows if c['likes'] is not None]
        topics.append(dict(t, count=len(rows), likes=sum(known) if known else None,
                           likes_missing=len(rows)-len(known), cids=[c['cid'] for c in rows]))
    key = 'likes' if sort == 'likes' else 'count'
    topics.sort(key=lambda x: (-(x[key] if x[key] is not None else -1), -x['count'], x['id']))
    return dict(total=len(comments), reviewed=len(reviewed), unreviewed=len(comments)-len(reviewed),
                tagged=sum(bool(c['topic_ids']) for c in reviewed), untagged=sum(not c['topic_ids'] for c in reviewed),
                levels={k: sum(c['level'] == k for c in comments) for k in LEVELS}, topics=topics)


def likes_text(value, missing=0, has_rows=True):
    if not has_rows:
        return '无评论'
    if value is None:
        return '获赞未取得'
    return (f'已知 {value:,} 赞 · {missing:,} 条未取得' if missing else f'{value:,} 赞')


def topic_chart(stats):
    if not stats['reviewed']:
        return '<p class="empty">当前范围没有已复核评论。可切换视频或评论层级。</p>'
    if not stats['topics']:
        return '<p class="empty">当前材料未归纳需求主题，原文保留在下方。</p>'
    if not any(t['count'] for t in stats['topics']):
        return '<p class="empty">当前范围没有归入需求主题的已复核评论，原文仍可查看。</p>'
    max_count = max((t['count'] for t in stats['topics']), default=0) or 1
    likes_limit = max((t['likes'] for t in stats['topics'] if t['likes'] is not None), default=None)
    max_likes = likes_limit or 1
    rows = [reading.chart_head(max_count, likes_limit)]
    for t in stats['topics']:
        counts = f'{t["count"]:,} 条'
        likes = likes_text(t['likes'], t['likes_missing'], bool(t['count']))
        rows.append(f'<div class="topic-row"><button class="topic-label" type="button" data-topic="{esc(t["id"])}" aria-pressed="false">{esc(t["label"])}</button>'
                    f'<div class="measure"><span class="metric-label">评论条数</span><div class="track"><i style="width:{100*t["count"]/max_count:.4f}%"></i></div><b>{counts}</b></div>'
                    f'<div class="measure likes"><span class="metric-label">这些评论的获赞</span><div class="track"><i style="width:{100*(t["likes"] or 0)/max_likes:.4f}%"></i></div><b>{likes}</b></div></div>')
    return ''.join(rows)


def citation_html(citation, sources, presentation=None):
    presentation = presentation or {}
    s = sources[citation['source_id']]
    meta = s['title'] + ' · ' + s['review_status']
    if s['kind'] == 'comment':
        meta += ' · ' + likes_text(s['likes'])
    label = presentation.get('source_labels', {}).get(citation['source_id'], '')
    label_html = '<span class="quote-label">' + esc(label) + '</span>' if label else ''
    quote = reading.highlight(citation['quote'], presentation.get('quote_emphasis', {}).get(citation['source_id'], []))
    return (f'<blockquote>{label_html}<p data-original="{esc(s["id"])}">{quote}</p>'
            f'<cite>{esc(meta)} · <a href="#{anchor(s["id"])}" data-source="{esc(s["id"])}">查看完整原文</a></cite></blockquote>')


def analysis_strings(data):
    output = [data['title'], data['summary'], data['coverage']['note'], data['coverage']['collection_note']]
    for collection, keys in [('topics', ('label', 'description')), ('findings', ('title', 'observation', 'explanation', 'scope', 'alternatives')), ('recommendations', ('title', 'action', 'verification'))]:
        for row in data[collection]:
            for key in keys:
                value = row.get(key)
                output.extend(value if isinstance(value, list) else [value] if isinstance(value, str) else [])
    return output


def render(data, level='L4'):
    sources = validate(data, level)
    presentation = reading.options(data)
    emphasis = presentation.get('emphasis', [])
    stats = statistics(data)
    default_level = presentation.get('default_level', 'top' if stats['levels']['top'] else 'all')
    require(default_level in ('all', 'top', 'reply', 'unknown'), 'Invalid default comment level')
    initial = statistics(data, level=default_level)
    coverage = data['coverage']
    out = [f'<header><p class="eyebrow">评论区洞察</p><h1>{esc(data["title"])}</h1>{reading.paragraphs(data["summary"], "lead", emphasis)}<p class="meta">材料采集：{esc(data["collected_at"])}</p></header>']
    nav = [('overview', '研究范围')]
    if data['comments']:
        nav.append(('themes', '评论在问什么'))
    if data['findings']:
        nav.append(('findings', '具体发现'))
    if data['recommendations']:
        nav.append(('recommendations', '可以怎样用'))
    nav += [('originals', '查原文'), ('coverage', '采集说明')]
    out.append('<nav class="navbar" aria-label="报告章节"><div class="nav-scroll">' + ''.join(f'<a class="nav-link" href="#{sid}">{label}</a>' for sid, label in nav) + '</div></nav>')
    out.append('<section id="overview" class="card"><h2>这份报告看了哪些材料</h2>')
    if data['comments']:
        metrics = [(stats['total'], '去重后评论'), (len({c['content_id'] for c in data['comments']}), '涉及视频'), (stats['reviewed'], '已复核评论')]
    else:
        metrics = [(len(data['sources']), '来源材料'), (len(data['findings']), '有原文依据的发现')]
    out.append('<div class="stats">' + ''.join(f'<div class="stat"><b>{value:,}</b><span>{label}</span></div>' for value, label in metrics) + '</div>')
    coverage_paragraphs = coverage['note'].split('\n\n')
    out.append(reading.paragraphs(coverage_paragraphs[:2], emphasis=emphasis))
    if len(coverage_paragraphs) > 2:
        out.append('<details class="material-details"><summary>逐条查看材料范围</summary>' + reading.paragraphs(coverage_paragraphs[2:], emphasis=emphasis) + '</details>')
    if data['comments']:
        out.append(reading.composition(stats['levels']))
        out.append(f'<p class="meta">一级评论 {stats["levels"]["top"]:,} 条，楼内回复 {stats["levels"]["reply"]:,} 条，层级未知 {stats["levels"]["unknown"]:,} 条。未复核 {stats["unreviewed"]:,} 条。</p>')
    out.append('</section>')
    if data['comments']:
        videos = {c['content_id']: c['video_title'] for c in data['comments']}
        options = ''.join(f'<option value="{esc(k)}">{esc(v)}</option>' for k, v in videos.items())
        lev_options = '<option value="all"' + (' selected' if default_level == 'all' else '') + '>全部层级</option>' + ''.join(f'<option value="{k}"'+(' selected' if k == default_level else '')+f'>{v}</option>' for k, v in LEVELS.items())
        out.append('<section id="themes" class="card"><h2>评论在问什么</h2><p>评论条数和获赞分别展示。点主题名称可查看原话，两个条长使用各自的刻度。</p>')
        out.append(f'<div class="toolbar"><label>视频<select id="video-filter"><option value="all">全部视频</option>{options}</select></label><label>层级<select id="level-filter">{lev_options}</select></label><label>排序<select id="sort-filter"><option value="count">按评论条数</option><option value="likes">按获赞</option></select></label></div>')
        out.append(f'<p id="theme-scope" class="note" aria-live="polite">当前范围 {initial["total"]:,} 条，其中 {initial["reviewed"]:,} 条已复核、{initial["tagged"]:,} 条有需求标签。{initial["untagged"]:,} 条已复核评论未归入需求主题。</p>')
        out.append('<p class="meta">一条评论可有多个主题，主题合计不能当作人数；未复核评论不进入主题统计。点赞不表示购买意愿，缺失值不补零。</p>')
        out.append('<div id="theme-chart" class="topic-chart">' + topic_chart(initial) + '</div><div id="topic-evidence" class="evidence-panel" hidden></div></section>')
    if data['findings']:
        heading = '从这些评论能看出什么' if data['comments'] else '从这些材料能看出什么'
        out.append(f'<section id="findings" class="card"><h2>{heading}</h2>')
        out.append(reading.index(data['findings']))
        for number, f in enumerate(data['findings'], 1):
            out.append(f'<article id="finding-{esc(f["id"])}" class="finding">' + reading.heading(f['title'], number) + '<div class="finding-observation">' + reading.paragraphs(f['observation'], emphasis=emphasis) + '</div>')
            evidence_mode = presentation.get('evidence_styles', {}).get(f['id'], 'quotes')
            require(evidence_mode in ('quotes', 'thread'), 'Unknown evidence presentation')
            caption = '同一楼的连续表达' if evidence_mode == 'thread' else '关键原话'
            out.append('<div class="finding-columns"><div class="finding-evidence"><h4 class="evidence-heading">' + caption + '</h4><div class="quote-list' + (' quote-thread' if evidence_mode == 'thread' else '') + '">')
            out.extend(citation_html(c, sources, presentation) for c in f['citations'] if c.get('display', 'primary') == 'primary')
            out.append('</div></div><div class="finding-reasoning"><h4 class="evidence-heading">怎样理解这些反应</h4>' + reading.paragraphs(f['explanation'], 'reasoning-paragraph', emphasis) + '</div></div>')
            out.append(reading.context(f.get('alternatives'), f['scope'], emphasis))
            supporting = [c for c in f['citations'] if c.get('display') == 'supporting']
            if supporting:
                out.append(f'<details><summary>其他 {len(supporting)} 条依据</summary>' + ''.join(citation_html(c, sources, presentation) for c in supporting) + '</details>')
            if f['status'] == 'inference':
                out.append('<span class="badge">含基于材料的解释</span>')
            out.append('</article>')
        out.append('</section>')
    if data['recommendations']:
        out.append('<section id="recommendations" class="card"><h2>这些发现可以怎样用</h2>')
        for number, r in enumerate(data['recommendations'], 1):
            out.append('<article class="finding">' + reading.heading(r['title'], number))
            action_parts = r['action'].split('\n\n')
            if len(action_parts) > 1:
                out.append('<div class="finding-observation">' + reading.paragraphs(action_parts[0], emphasis=emphasis) + '</div>')
                action_parts = action_parts[1:]
            out.append('<div class="recommendation-panel"><div class="recommendation-action"><h4 class="evidence-heading">具体怎么做</h4>' + reading.paragraphs(action_parts, emphasis=emphasis) + '</div><div class="recommendation-check"><h4 class="evidence-heading">怎样检查是否有用</h4>' + reading.paragraphs(r['verification'], emphasis=emphasis) + '</div></div>')
            out.append('<p class="meta">依据：' + '；'.join(f'<a href="#finding-{esc(fid)}">{esc(next(f["title"] for f in data["findings"] if f["id"] == fid))}</a>' for fid in r['finding_ids']) + '</p>')
            out.append('<div class="recommendation-sources">' + ''.join(citation_html(c, sources, presentation) for c in r.get('own_citations', [])) + '</div>')
            out.append('</article>')
        out.append('</section>')
    out.append('<section id="originals" class="card"><h2>查原文</h2>')
    if data['comments']:
        if len(data['comments']) > 40:
            out.append(f'<details id="comment-browser" class="material-details"><summary>搜索与查看全部 {len(data["comments"]):,} 条评论</summary>')
        out.append('<div class="toolbar"><label>查找评论<input id="comment-search" type="search" placeholder="输入评论中的文字"></label><button id="clear-filters" type="button">查看全部评论</button></div><p id="comment-count" class="meta" aria-live="polite"></p>')
        out.append('<div class="table-scroll"><table id="comment-table"><thead><tr><th>评论原文</th><th>获赞</th><th>层级与来源</th><th>需求主题</th></tr></thead><tbody>')
        topic_labels = {t['id']: t['label'] for t in data['topics']}
        for c in data['comments']:
            tags = '、'.join(topic_labels[t] for t in c['topic_ids']) or '未归入需求主题'
            if not c['reviewed']:
                tags = '未复核标签：' + tags
            out.append(f'<tr id="{anchor("comment:" + c["cid"])}" data-cid="{esc(c["cid"])}"><td class="comment-text" data-original="comment:{esc(c["cid"])}">{esc(c["text"])}</td><td class="num">{esc(likes_text(c["likes"]))}</td><td>{esc(LEVELS[c["level"]])}<br><a href="{esc(c["source_url"])}" target="_blank" rel="noopener noreferrer">{esc(c["video_title"])}</a></td><td>{esc(tags)}</td></tr>')
        out.append('</tbody></table></div>')
        if len(data['comments']) > 40:
            out.append('</details>')
    for s in data['sources']:
        out.append(f'<details id="{anchor(s["id"])}"><summary>{esc(s["title"])} · {esc(s["review_status"])}</summary><div class="source-text" data-original="{esc(s["id"])}">{esc(s["text"])}</div>')
        if s.get('source_url'):
            out.append(f'<a href="{esc(s["source_url"])}" target="_blank" rel="noopener noreferrer">打开材料来源</a>')
        out.append('</details>')
    if not data['comments'] and not data['sources']:
        out.append('<p>本次未取得可分析的评论或其他材料。</p>')
    out.append('</section><section id="coverage" class="card"><h2>采集说明</h2>')
    reported = '未取得' if coverage['reported_total'] is None else f'{coverage["reported_total"]:,}'
    out.append(f'<p>原始返回 {coverage["raw_rows"]:,} 行，按 cid 去重后 {stats["total"]:,} 条。平台显示评论总数：{reported}。{esc(coverage["reported_total_scope"])}</p>')
    out.append(reading.paragraphs(coverage['collection_note'], emphasis=emphasis))
    out.append('</section><footer>结论与建议依据本次列出的材料；可从每处引用返回完整原文。</footer>')
    audit = dict(generator='jc-comment-visualize', version=VERSION, validation_level=level,
                 input_sha256=digest(data), findings_sha256=digest(data['findings']), statistics=stats)
    jsdata = canonical(data).replace('<', '\\u003c')
    jsaudit = canonical(audit).replace('<', '\\u003c')
    scripts = f'<script id="comment-report-data" type="application/json">{jsdata}</script><script id="report-audit" type="application/json">{jsaudit}</script>'
    scripts += '<script>' + (ROOT / 'assets/report.js').read_text() + '</script>'
    template = (ROOT / 'assets/report-template.html').read_text()
    template = template.replace('</style>', '</style><style>' + (ROOT / 'assets/reading.css').read_text() + '</style>', 1).replace('<body>', '<body class="reading-report">', 1)
    return template.replace('{{TITLE}}', esc(data['title'])).replace('{{BODY}}', ''.join(out)).replace('{{SCRIPTS}}', scripts)


def example():
    text1 = 'SYNTHETIC：工具装好了，但导出的表格没有保留原来的日期格式。'
    text2 = 'SYNTHETIC：请把步骤整理成文字，文档里的「赋能」是原文。'
    comments = [dict(cid='sample-1', content_id='sample-video', video_title='合成演示视频', text=text1, likes=2, level='top', reviewed=True, topic_ids=['format'], source_url='https://example.org/sample'),
                dict(cid='sample-2', content_id='sample-video', video_title='合成演示视频', text=text2, likes=None, level='top', reviewed=True, topic_ids=['steps'], source_url='https://example.org/sample'),
                dict(cid='sample-3', content_id='sample-video', video_title='合成演示视频', text='SYNTHETIC：收到，我会补充格式设置。', likes=0, level='reply', reviewed=True, topic_ids=[], source_url='https://example.org/sample'),
                dict(cid='sample-4', content_id='sample-video', video_title='合成演示视频', text='SYNTHETIC：日期格式', likes=7, level='unknown', reviewed=False, topic_ids=['format'], source_url='https://example.org/sample')]
    return dict(schema_version=2, title='合成示例：教程评论可以怎样阅读', summary='这是用于验证模板的合成数据，不是真实观众或账号结论。示例展示评论数量、获赞、原文与解释的阅读关系。', collected_at='合成数据，无真实采集日期',
                coverage=dict(note='SYNTHETIC：4 条合成评论，包含一级评论、回复与层级未知的情况。', reported_total=None, reported_total_scope='没有平台总数，不计算覆盖比例。', raw_rows=4, collection_note='离线合成示例，未调用采集接口。'),
                comments=comments, topics=[dict(id='format', label='导出后的格式问题', description='评论明确提出日期格式没有保留。'), dict(id='steps', label='希望有文字步骤', description='评论直接请求文字整理。')], sources=[],
                findings=[dict(id='format-problem', title='装好工具后，还需要检查导出结果', observation='合成评论里，一条留言提到导出的日期格式改变了。', explanation='教程可以展示完成后的文件，再核对日期等关键字段。示例中的问题具体到输出结果，可以直接设计复现步骤。', citations=[dict(source_id='comment:sample-1', quote=text1)], status='observation', scope='这只是一条合成评论，不代表真实用户的普遍情况。', alternatives='')],
                recommendations=[dict(id='check-output', title='把结果核对加入演示', action='演示导出后打开文件，核对日期与原始内容是否一致。', verification='使用同一份样例文件，记录设置修改前后的日期显示。', finding_ids=['format-problem'], audience='general', own_citations=[])])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path)
    parser.add_argument('--example', action='store_true')
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--level', default='L4', choices=['L1', 'L2', 'L3', 'L4'])
    args = parser.parse_args()
    require(bool(args.input) != args.example, '使用 --input 或 --example，不能同时使用')
    data = example() if args.example else json.loads(args.input.read_text())
    result = render(data, args.level)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(result)
    print(json.dumps(dict(output=str(args.out), comments=len(data['comments']), findings=len(data['findings']), input_sha256=digest(data)), ensure_ascii=False))


if __name__ == '__main__':
    main()
