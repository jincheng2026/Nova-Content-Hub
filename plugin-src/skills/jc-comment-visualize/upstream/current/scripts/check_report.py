#!/usr/bin/env python3
"""Check regenerated data/HTML consistency; inspect authored prose, never alter quotes."""
import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

from render_report import analysis_strings, digest, render, statistics, validate


class ReportParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.scripts = {}
        self.stack = []
        self.current_script = None
        self.visible = []
        self.ids = []
        self.links = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('id'):
            self.ids.append(attrs['id'])
        if tag == 'a' and attrs.get('href', '').startswith('#'):
            self.links.append(attrs['href'][1:])
        if tag == 'script':
            self.current_script = attrs.get('id')
            if self.current_script:
                self.scripts[self.current_script] = ''
        skip = tag in ('script', 'style', 'blockquote', 'cite', 'footer') or 'data-original' in attrs or bool(self.stack and self.stack[-1][1])
        if tag not in ('meta', 'link', 'br', 'hr', 'img', 'input', 'source', 'wbr'):
            self.stack.append((tag, skip))

    def handle_endtag(self, tag):
        if tag == 'script':
            self.current_script = None
        for i in range(len(self.stack)-1, -1, -1):
            if self.stack[i][0] == tag:
                self.stack = self.stack[:i]
                break

    def handle_data(self, text):
        if self.current_script:
            self.scripts[self.current_script] += text
        if not self.stack or not self.stack[-1][1]:
            self.visible.append(text)


STYLE_PATTERNS = [
    r'声量与钱包错位|收藏是行动的替身|最想掏钱的人|真正的伤口|不愿承认的',
    r'洋葱[一二三四五六]|三张洋葱|千机塔|莫斯塔|施瓦茨|FBBE|意识[①②③④⑤]|人群 ?[A-G](?![a-zA-Z])',
    r'心结闭环|承接动作|放量人群|自裂变|复爆|弹药底仓|赞池|供血',
]


def check(path, level='L4'):
    content = Path(path).read_text()
    parsed = ReportParser()
    parsed.feed(content)
    if len(parsed.ids) != len(set(parsed.ids)):
        raise ValueError('页面含重复 HTML id')
    missing = set(parsed.links) - set(parsed.ids)
    if missing:
        raise ValueError('页面锚点找不到目标：' + ', '.join(sorted(missing)))
    if 'comment-report-data' in parsed.scripts:
        data = json.loads(parsed.scripts['comment-report-data'])
        audit = json.loads(parsed.scripts.get('report-audit', '{}'))
        validate(data, level)
        if audit.get('input_sha256') != digest(data) or audit.get('statistics') != statistics(data):
            raise ValueError('嵌入输入、统计和审计记录不一致')
        if content != render(data, audit.get('validation_level', level)):
            raise ValueError('页面与当前输入/模板生成结果不一致；请修改输入后重新生成')
        prose = '\n'.join(analysis_strings(data))
        checks = ['唯一评论与层级', '主题统计', '逐字引用', '建议依据', 'HTML 与输入一致']
    else:
        raise ValueError('页面缺少 comment-report-data 数据块；请用 scripts/render_report.py 重新生成')
    warnings = sorted({match.group(0) for pattern in STYLE_PATTERNS for match in re.finditer(pattern, prose)})
    return {'level': level, 'checks': checks, 'expression_review': warnings,
            'visual_review': '未由本脚本验证', 'quote_policy': '文风提示不扫描或修改原文引文'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('html', type=Path)
    parser.add_argument('level', nargs='?', default='L4', choices=['L1', 'L2', 'L3', 'L4'])
    args = parser.parse_args()
    try:
        result = check(args.html, args.level)
    except (ValueError, KeyError, TypeError, OSError, json.JSONDecodeError) as exc:
        print('FAIL：' + str(exc), file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if result['expression_review']:
        print('待人工复核表达：' + '、'.join(result['expression_review']))
    print('PASS：机器项目通过。仍需核对解释是否成立、表达是否自然及实际页面显示。')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
