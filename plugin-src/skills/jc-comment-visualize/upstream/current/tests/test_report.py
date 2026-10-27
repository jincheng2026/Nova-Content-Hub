"""Behavioral checks for citation integrity and scoped comment reporting."""
import copy
import json
import sys
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from render_report import digest, example, render, statistics, validate
from check_report import check
from reading_layout import highlight, chunks


class ReportTests(unittest.TestCase):
    def setUp(self):
        self.data = example()

    def test_real_missing_and_zero_are_distinct(self):
        stats = statistics(self.data, level='top')
        self.assertEqual(stats['total'], 2)
        self.assertIsNone(next(t for t in stats['topics'] if t['id'] == 'steps')['likes'])
        stats = statistics(self.data, level='reply')
        self.assertEqual(stats['total'], 1)
        self.assertEqual(stats['untagged'], 1)
        self.assertEqual(statistics(self.data)['unreviewed'], 1)

    def test_wrong_quote_is_rejected(self):
        self.data['findings'][0]['citations'][0]['quote'] = '评论没有说过的话'
        with self.assertRaisesRegex(ValueError, '引文与原文不一致'):
            render(self.data)

    def test_comment_identity_is_unique(self):
        self.data['comments'].append(copy.deepcopy(self.data['comments'][0]))
        self.data['coverage']['raw_rows'] += 1
        with self.assertRaisesRegex(ValueError, 'cid 重复'):
            render(self.data)

    def test_unreviewed_comment_cannot_support_finding(self):
        c = self.data['comments'][-1]
        self.data['findings'][0]['citations'] = [dict(source_id='comment:' + c['cid'], quote=c['text'])]
        with self.assertRaisesRegex(ValueError, '尚未语义复核'):
            render(self.data)

    def test_personal_advice_requires_own_source(self):
        r = self.data['recommendations'][0]
        r['audience'] = 'personal'
        r['own_citations'] = copy.deepcopy(self.data['findings'][0]['citations'])
        with self.assertRaisesRegex(ValueError, '必须引用本人材料'):
            render(self.data)

    def test_frozen_analysis_cannot_change_when_adding_advice(self):
        self.data['frozen_findings_sha256'] = digest(self.data['findings'])
        self.data['findings'][0]['title'] = '改变后的判断'
        with self.assertRaisesRegex(ValueError, '冻结内容不一致'):
            render(self.data)

    def test_quote_vocabulary_does_not_fail_style_check(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'report.html'
            path.write_text(render(self.data))
            result = check(path)
            self.assertEqual(result['expression_review'], [])
            self.assertIn('赋能', path.read_text())

    def test_html_edit_cannot_diverge_from_input(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'report.html'
            path.write_text(render(self.data).replace('<h2>评论在问什么</h2>', '<h2>随意替换后的结论</h2>'))
            with self.assertRaisesRegex(ValueError, '生成结果不一致'):
                check(path)

    def test_local_anchor_ids_and_sources_survive_hostile_text(self):
        c = self.data['comments'][0]
        c['text'] += '\n</script><script>alert(1)</script>'
        output = render(self.data)
        self.assertNotIn('</script><script>alert(1)</script>', output)
        c['source_url'] = 'javascript:alert(1)'
        with self.assertRaisesRegex(ValueError, 'HTTP'):
            render(self.data)

    def test_emphasis_keeps_every_character_and_escapes_markup(self):
        original = '原话：A&B <script>bad()</script>。「保留标点！」然后继续。'
        parts = []
        parser = HTMLParser(convert_charrefs=True)
        parser.handle_data = parts.append
        result = highlight(original, ['A&B', 'A&B <script>bad()</script>', '保留标点'])
        parser.feed(result)
        self.assertEqual(''.join(parts), original)
        self.assertNotIn('<script>', result)
        self.assertEqual(''.join(chunks(original, limit=15)), original)

    def test_reading_options_do_not_change_frozen_analysis_or_statistics(self):
        frozen = digest(self.data['findings'])
        before = statistics(self.data)
        self.data['frozen_findings_sha256'] = frozen
        self.data['presentation'] = {'version': 1, 'default_level': 'all',
            'emphasis': ['核对日期等关键字段'],
            'quote_emphasis': {'comment:sample-1': ['日期格式']}}
        snapshot = copy.deepcopy(self.data)
        output = render(self.data)
        self.assertEqual(self.data, snapshot)
        self.assertEqual(digest(self.data['findings']), frozen)
        self.assertEqual(statistics(self.data), before)
        self.assertIn('<option value="all" selected>全部层级</option>', output)
        self.assertIn('当前范围 4 条，其中 3 条已复核', output)
        self.assertIn('<strong class="key-phrase">日期格式</strong>', output)


if __name__ == '__main__':
    unittest.main()
