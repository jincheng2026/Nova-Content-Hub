"""Small, data-preserving reading components shared by the report renderers."""
from __future__ import annotations

import html
import re


def esc(value):
    return html.escape(str(value), quote=True)


def highlight(value, phrases=()):
    """Emphasize exact substrings only; never accept HTML from report inputs."""
    text = str(value)
    matches = []
    for phrase in phrases:
        if not isinstance(phrase, str) or not phrase:
            continue
        start = 0
        while True:
            start = text.find(phrase, start)
            if start < 0:
                break
            matches.append((start, start + len(phrase)))
            start += len(phrase)
    matches.sort(key=lambda span: (span[0], -span[1]))
    out, cursor = [], 0
    for start, end in matches:
        if start < cursor:
            continue
        out.extend([esc(text[cursor:start]), '<strong class="key-phrase">', esc(text[start:end]), '</strong>'])
        cursor = end
    out.append(esc(text[cursor:]))
    return ''.join(out)


def chunks(paragraph, limit=135):
    """Insert reading breaks at sentence ends, retaining every character/order."""
    sentences = re.split(r'(?<=[。！？])(?=[^」』”])', paragraph)
    out, current = [], ''
    for sentence in sentences:
        if current and len(current) + len(sentence) > limit:
            out.append(current)
            current = ''
        current += sentence
    if current:
        out.append(current)
    assert ''.join(out) == paragraph
    return out


def paragraphs(value, cls='reading-prose', emphasis=(), split=True):
    values = value if isinstance(value, list) else [str(value)]
    out = []
    for text in values:
        for paragraph in str(text).split('\n\n'):
            if not paragraph:
                continue
            for part in chunks(paragraph) if split else [paragraph]:
                out.append('<p class="' + esc(cls) + '">' + highlight(part, emphasis) + '</p>')
    return ''.join(out)


def options(payload):
    result = payload.get('presentation', {})
    if not isinstance(result, dict):
        raise ValueError('presentation must be an object')
    if result and result.get('version', 1) != 1:
        raise ValueError('Unsupported presentation version')
    if not isinstance(result.get('emphasis', []), list):
        raise ValueError('presentation.emphasis must be an array of exact text spans')
    return result


def heading(title, number=None):
    number_html = '<span class="reading-number" aria-hidden="true">' + f'{number:02d}' + '</span>' if number is not None else ''
    return '<div class="reading-heading">' + number_html + '<h3>' + esc(title) + '</h3></div>'


def context(alternatives=(), scope='', emphasis=()):
    alternatives = alternatives if isinstance(alternatives, list) else [alternatives] if alternatives else []
    if not alternatives and not scope:
        return ''
    out = '<div class="finding-context">'
    if alternatives:
        out += '<p class="secondary"><strong>另一种解释</strong> ' + highlight(alternatives[0], emphasis) + '</p>'
        if len(alternatives) > 1:
            out += '<details><summary>另外 ' + str(len(alternatives) - 1) + ' 种解释</summary>' + paragraphs(alternatives[1:], 'secondary', emphasis) + '</details>'
    if scope:
        out += paragraphs(scope, 'scope', emphasis)
    return out + '</div>'


def index(findings, prefix='finding-'):
    if len(findings) < 3:
        return ''
    return '<ul class="finding-index" aria-label="发现目录">' + ''.join(
        '<li><a href="#' + esc(prefix + f['id']) + '"><span aria-hidden="true">' + f'{i:02d}' + '</span>' + esc(f['title']) + '</a></li>'
        for i, f in enumerate(findings, 1)
    ) + '</ul>'


def composition(levels):
    total = sum(levels.values())
    if not total:
        return ''
    names = [('top', '顶层评论'), ('reply', '楼内回复'), ('unknown', '层级未知')]
    items = [(key, label, levels.get(key, 0)) for key, label in names if levels.get(key, 0)]
    label = '；'.join(f'{name} {count:,} 条' for _, name, count in items)
    out = '<figure class="sample-composition"><figcaption>本次评论的层级构成</figcaption><div class="sample-segments" role="img" aria-label="' + esc(label) + '">'
    out += ''.join('<span class="sample-' + key + '" style="width:' + f'{100 * count / total:.6f}' + '%"></span>' for key, _, count in items)
    out += '</div><div class="sample-legend">' + ''.join('<span><i class="sample-' + key + '"></i>' + name + ' <b>' + f'{count:,}' + '</b> 条</span>' for key, name, count in items)
    return out + '</div></figure>'


def chart_head(max_count, max_likes):
    likes_scale = '获赞未取得' if max_likes is None else '当前 0 赞' if max_likes == 0 else '0 至 ' + f'{max_likes:,}'
    return ('<div class="chart-head" aria-hidden="true"><span>需求主题</span>'
            '<span>评论条数 <small>0 至 ' + f'{max_count:,}' + '</small></span>'
            '<span>这些评论的获赞 <small>' + likes_scale + '</small></span></div>')
