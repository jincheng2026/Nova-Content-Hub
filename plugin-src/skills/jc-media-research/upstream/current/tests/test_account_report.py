"""Account statistics, evidence boundaries and offline rendering; synthetic inputs only."""
from copy import deepcopy
import json
from pathlib import Path
import re
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import account_report as account
import render_report as renderer

def fixture():
    return {'schema_version':2,'record_type':'account_research','as_of':'2026-08-30','title':'合成账号',
      'records':[{'platform':'douyin','author_id':'synthetic-author','collection_batch_id':'synthetic-batch','content_id':'synthetic-'+str(i),'title':'合成作品 '+str(i),'published_at':'2026-08-'+str(10+i),
                  'main_direction':'任务教程','like_count':likes,'collect_count':collects,'source_url':'https://example.invalid/video/synthetic-'+str(i)}
                 for i,(likes,collects) in enumerate([(0,0),(100,None),(200,20)])],
      'comments':[{'platform':'douyin','content_id':'synthetic-1','comment_id':'synthetic-comment-'+str(i),'text':'合成问题 '+str(i),'like_count':likes,'level':level,'annotation_reviewed':reviewed,'demand_tags':tags}
                 for i,(likes,level,reviewed,tags) in enumerate([(0,'top_level',True,['重复任务']),(8,'reply',True,['重复任务']),(20,'unknown',True,['工具费用']),(3,'top_level',False,['重复任务']),(2,'top_level',True,[])])],
      'sources':[{'source_id':'synthetic-source-'+str(i),'content_id':'synthetic-'+str(i),'text':'原文证据 '+str(i),'title':'合成来源 '+str(i),'kind':'description','review_status':'已核对'} for i in range(2)],
      'account_analysis':{'version':1,'summary_cards':[{'title':'合成判断','observation':'出现共同表达','pattern_type':'repeated','citations':[{'source_id':'synthetic-source-'+str(i),'quote':'原文证据 '+str(i)} for i in range(2)]}],
                          'comparisons':[{'title':'同题对照','content_ids':['synthetic-0','synthetic-1']}]}}

class AccountReportTest(unittest.TestCase):
    def test_missing_and_zero_have_different_denominators(self):
        data=account.compute_account(fixture())
        self.assertEqual(data['medians']['like_count'],100)
        self.assertEqual(data['medians']['collect_count'],10)
        self.assertEqual(data['valid_n']['collect_count'],2)
        self.assertIsNone(data['medians']['comment_count'])
        self.assertEqual(data['comment_levels'],{'top_level':3,'reply':1,'unknown':1})

    def test_comment_scope_and_review_are_not_mixed(self):
        themes=next(s for s in account.chart_specs(fixture()) if s['kind']=='themes')
        self.assertEqual(themes['denominator'],3)
        self.assertEqual(themes['reviewed'],2)
        self.assertEqual(themes['rows'][0]['count'],1)
        self.assertEqual(themes['rows'][0]['likes'],0)
        replies=next(s for s in themes['subsets'] if s['video']=='all' and s['level']=='reply')
        self.assertEqual(replies['rows'][0]['likes'],8)

    def test_invalid_ids_batches_and_quotes_fail_before_delivery(self):
        for mutation in [lambda p:p['records'].append(deepcopy(p['records'][0])),
                         lambda p:p['records'][0].update(collection_batch_id='another-batch'),
                         lambda p:p['account_analysis']['summary_cards'][0]['citations'][0].update(quote='不存在的引文'),
                         lambda p:p['sources'][1].update(content_id='synthetic-0')]:
            p=fixture();mutation(p)
            with self.assertRaises(renderer.ReportError):renderer.render_report(p)

    def test_comment_likes_missing_is_not_zero(self):
        p=fixture();p['comments'][0]['like_count']=None
        themes=next(s for s in account.chart_specs(p) if s['kind']=='themes')
        self.assertIsNone(themes['rows'][0]['likes'])
        self.assertEqual(themes['rows'][0]['likes_missing'],1)

    def test_inconsistent_baseline_is_not_presented_as_valid(self):
        p=fixture();p['records'][0]['baseline']={'ratio':42,'median':0,'sample_count':0,'reason':'zero_baseline'}
        with self.assertRaises(renderer.ReportError):renderer.render_report(p)

    def test_unreviewed_transcripts_cannot_confirm_repetition(self):
        p=fixture()
        for s in p['sources']:s['kind']='transcript'
        with self.assertRaises(renderer.ReportError):renderer.render_report(p)
        for s in p['sources']:s['text_reviewed']=True
        self.assertIn('重复出现',renderer.render_report(p))

    def test_comment_source_falls_back_to_matching_work(self):
        p=fixture()
        self.assertNotIn('未取得公开来源链接',renderer.render_report(p))
        for r in p['records']:r.pop('source_url',None)
        self.assertIn('未取得公开来源链接',renderer.render_report(p))

    def test_empty_legacy_and_input_audit(self):
        for p in [fixture(),{'record_type':'account_research','records':[]}, {'record_type':'account_research','records':[{'content_id':'synthetic-legacy','like_count':10}]}]:
            rendered=renderer.render_report(p)
            audit=json.loads(re.search(r'<script id="report-audit" type="application/json">(.*?)</script>',rendered).group(1))
            self.assertEqual(audit['works'],len(p['records']))
            self.assertEqual(audit['input_sha256'],account.fingerprint(p))
            self.assertNotRegex(rendered,r'<script[^>]+src=')

    def test_sensitive_text_and_markup_are_not_executed_or_exposed(self):
        p=fixture();p['records'][0]['title']='<script>bad()</script>'
        p['records'][1]['title']='/'+ 'Users/private-user/private-notes'
        rendered=renderer.render_report(p)
        self.assertNotIn('<script>bad()</script>',rendered)
        self.assertNotIn('/Users/private-user',rendered)

if __name__=='__main__':unittest.main()
