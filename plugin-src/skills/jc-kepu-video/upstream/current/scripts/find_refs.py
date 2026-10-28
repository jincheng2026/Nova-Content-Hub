#!/usr/bin/env python3
"""在整个素材库里找「这一处别人是怎么讲的」。
来源自动汇总，素材库变了不用改脚本：
  1) 调研目录两批（2026-09-09、2026-09-14）的校正逐字稿；
  2) 02_内容素材 下任何带 目录.csv 的批量目录（如 2026-09-10_核心AI对标逐字稿）；
  3) 02_内容素材/未参考、已参考 下每条入库素材（笔记信息.md 加 转写/校正版逐字稿，或写在笔记信息里的逐字稿）。
同一作品出现在多处只算一次。
用法:
  python3 find_refs.py Agent 智能体            # 任一关键词命中即算，按数据好坏排
  python3 find_refs.py --author 大李 --author 不喝九 Skill
  python3 find_refs.py --width 260 --limit 3 上下文 失忆
输出每条命中：博主｜相对表现（点赞÷该账号中位数）｜视频短题｜id，然后是命中处前后的原文。
加 --stats 只看现在覆盖了哪些账号、各多少条。
相对表现 3 倍以上或点赞过万的视频标 ★。只给原文，不评价。
别的电脑上没有素材库时，改读 Skill 目录下 refs-data/ 里的语料快照。
快照用 --export 从素材库导出：python3 find_refs.py --export ../refs-data
"""
import argparse, json, re, statistics, sys, glob, os
from collections import defaultdict

ROOT = '/Users/hejincheng/AIJinCheng/个人IP与内容/第二大脑/01_对标账号/调研'
BUNDLE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'refs-data')
BATCHES = [
    (f'{ROOT}/2026-09-09_AI科普系列比较/normalized/videos_annotated.json', None),
    (f'{ROOT}/2026-09-14_AI科普系列/normalized/videos_annotated.json', f'{ROOT}/2026-09-14_AI科普系列/transcript'),
]
SHORT = {'大李书房一盏灯': '大李', '清华姜学长': '姜学长', '向行2028': '向行', '智能体阿朱': '阿朱',
         '不喝九': '不喝九', 'FredTalk': 'FredTalk', '小九学AI': '小九', '屯点AI知识': '屯点', '森森AI日记': '森森'}

MATERIAL = f'{ROOT}/../../02_内容素材'
NOTE_AUTHOR = [r'^> 作者：\s*(.+?)\s*$', r'^\|\s*(?:达人昵称|博主昵称|作者昵称|作者)\s*\|\s*(.+?)\s*\|']
NOTE_LIKES = r'^\|\s*点赞量\s*\|\s*([\d,]+)\s*\|'

def read(p):
    try: return open(p, encoding='utf-8').read()
    except Exception: return ''

def load():
    if not os.path.isdir(ROOT) and os.path.exists(os.path.join(BUNDLE, 'index.json')):
        rows = json.load(open(os.path.join(BUNDLE, 'index.json'), encoding='utf-8'))
        for r in rows: r['path'] = os.path.join(BUNDLE, r['path'])
        return rows
    rows, seen = [], set()
    def add(r):
        if r['id'] in seen or not r.get('path') or not os.path.exists(r['path']): return
        seen.add(r['id']); rows.append(r)
    # 1) 调研目录两批
    for meta, tdir in BATCHES:
        if not os.path.exists(meta): continue
        paths = {}
        if tdir:
            for f in glob.glob(f'{tdir}/batch_*/校正版逐字稿/*.md'):
                paths[re.search(r'-(\d+)\.md$', f).group(1)] = f
        for x in json.load(open(meta, encoding='utf-8')):
            add({'id': x['id'], 'author': x['author'], 'likes': x.get('likes') or 0,
                 'title': (x.get('short_title') or x.get('note') or x.get('title') or x.get('desc') or '')[:30],
                 'path': x.get('transcript_path') or paths.get(x['id']), 'src': '调研'})
    # 2) 素材库里的批量目录（目录.csv + normalized/videos.json）
    import csv
    for cat in glob.glob(f'{MATERIAL}/**/目录.csv', recursive=True):
        base = os.path.dirname(cat); likes = {}
        vj = os.path.join(base, 'normalized', 'videos.json')
        if os.path.exists(vj):
            for v in json.load(open(vj, encoding='utf-8')):
                likes[str(v.get('id'))] = (v.get('statistics') or {}).get('digg_count') or v.get('likes') or 0
        with open(cat, encoding='utf-8-sig') as f:
            for r in csv.DictReader(f):
                tp = r.get('逐字稿') or ''
                m = re.search(r'/(\d{10,})/', tp) or re.search(r'(\d{10,})', r.get('来源') or '')
                if not m or not tp: continue
                add({'id': m.group(1), 'author': r.get('作者') or '', 'likes': likes.get(m.group(1), 0),
                     'title': (r.get('标题') or '')[:30], 'path': os.path.join(base, tp), 'src': os.path.basename(base)})
    # 3) 单条入库的素材
    for note in glob.glob(f'{MATERIAL}/*/*/*/笔记信息.md'):
        d = os.path.dirname(note); text = read(note)
        m = re.search(r'_([0-9a-f]{12,})/?$', d)
        if not m: continue
        author = next((mm.group(1) for pat in NOTE_AUTHOR for mm in [re.search(pat, text, re.M)] if mm), '')
        lm = re.search(NOTE_LIKES, text, re.M); likes = int(lm.group(1).replace(',', '')) if lm else 0
        tfiles = sorted(glob.glob(f'{d}/转写/校正版逐字稿/*.md'))
        if tfiles: path = tfiles[0]
        elif '## 逐字稿' in text: path = note
        else: continue
        title = re.sub(r'^(抖音|小红书|视频号|公众号)_', '', os.path.basename(d)).rsplit('_', 1)[0][:30]
        add({'id': m.group(1), 'author': author.split('（')[0].strip() or '作者未记录', 'likes': likes, 'title': title, 'path': path,
             'src': '已参考' if '/已参考/' in d else '未参考'})
    med = defaultdict(list)
    for r in rows: med[r['author']].append(r['likes'])
    med = {a: statistics.median(v) for a, v in med.items()}
    for r in rows:
        r['rel'] = round(r['likes'] / med[r['author']], 1) if med[r['author']] else 0
        r['star'] = r['rel'] >= 3 or r['likes'] >= 10000
    return rows

def body(path):
    t = read(path)
    if path.endswith('笔记信息.md') and '## 逐字稿' in t:
        t = t.split('## 逐字稿', 1)[1]; t = re.split(r'^## ', t, maxsplit=1, flags=re.M)[0]
    t = re.sub(r'^---.*?---\s*', '', t, flags=re.S)
    t = re.sub(r'\[\d\d:\d\d:\d\d[^\]]*\]\s*', '', t)
    t = re.sub(r'^(#+ .*|作者：|原视频：|逐字稿来源：|来源：|校正依据：|说明：|已通读|时间码|范围外|> ).*$', '', t, flags=re.M)
    return re.sub(r'\n{3,}', '\n\n', t).strip()

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('keywords', nargs='*'); ap.add_argument('--stats', action='store_true', help='只列覆盖了哪些账号、各几条'); ap.add_argument('--author', action='append', help='只看这几位，用简称')
    ap.add_argument('--width', type=int, default=200, help='命中处前后各取多少字'); ap.add_argument('--limit', type=int, default=4, help='每位博主最多几条')
    ap.add_argument('--export', metavar='DIR', help='把素材库里的逐字稿导出成语料快照，给没有素材库的电脑用')
    a = ap.parse_args()
    allrows = load()
    if a.export:
        os.makedirs(os.path.join(a.export, 'texts'), exist_ok=True); index = []
        for r in allrows:
            rel = f"texts/{r['id']}.txt"
            open(os.path.join(a.export, rel), 'w', encoding='utf-8').write(body(r['path']))
            index.append({**r, 'path': rel})
        json.dump(index, open(os.path.join(a.export, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(f'导出 {len(index)} 条逐字稿到 {a.export}'); return
    if a.stats or not a.keywords:
        by = defaultdict(list)
        for r in allrows: by[r['author']].append(r)
        for au, v in sorted(by.items(), key=lambda kv: -len(kv[1])):
            print(f"{SHORT.get(au, au)}：{len(v)} 条，点赞中位数 {int(statistics.median([r['likes'] for r in v]))}，来源 {'/'.join(sorted(set(r['src'] for r in v)))}")
        print(f'共 {len(allrows)} 条逐字稿，{len(by)} 个账号。'); return
    rows = [r for r in allrows if not a.author or SHORT.get(r['author'], r['author']) in a.author or r['author'] in a.author]
    pat = re.compile('|'.join(re.escape(k) for k in a.keywords), re.I)
    hits = []
    for r in rows:
        t = body(r['path']); ms = list(pat.finditer(t))
        if not ms: continue
        spans = []
        for m in ms:
            s, e = max(0, m.start() - a.width), min(len(t), m.end() + a.width)
            if spans and s <= spans[-1][1]: spans[-1][1] = e
            else: spans.append([s, e])
        hits.append((r, [t[s:e] for s, e in spans[:2]]))
    per = defaultdict(int); n = 0
    for r, snips in sorted(hits, key=lambda h: -h[0]['rel']):
        k = SHORT.get(r['author'], r['author'])
        if per[k] >= a.limit: continue
        per[k] += 1; n += 1
        print(f"\n===== {k}｜{'★' if r['star'] else ''}{r['rel']} 倍｜{r['title']}｜{r['id']}")
        for s in snips: print('…' + s.replace('\n', ' ') + '…')
    if not n: print('没有命中。换个说法再搜，或去掉 --author。')
    else: print(f'\n共 {n} 条命中，{len(rows)} 条逐字稿里搜的。')

if __name__ == '__main__':
    main()
