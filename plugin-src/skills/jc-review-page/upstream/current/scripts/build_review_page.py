#!/usr/bin/env python3
"""把「原稿 + 修改建议」生成左右两栏的审稿页。

用法：python3 build_review_page.py --spec spec.json --out 审稿页.html

spec.json：
{
  "title": "T028 Skill 教程逐字稿 · 审稿",
  "key": "t028-review",                       # 浏览器里存进度用，同一份稿子保持不变
  "hint": "可选，页面顶部说明，不写用默认",
  "original": "原稿全文，空行分段，一行一句",
  "changes": [
    {"old": "原稿里要改的那段文字（整句或句中一段，必须唯一）",
     "new": "改成什么，空字符串表示删掉",
     "verdict": "must | optional | keep | wait",   # 已定要改 / 待你定 / 不用改 / 等实测再定
     "reasons": [["voice", "参考视频口播 1:24：「……」"], ["ai", "……"]]},
    {"insert_after": "新内容插在哪一句后面（那句的完整原文）", "new": "新加的内容", "verdict": "must", "reasons": [...]}
  ]
}
依据类型：voice 口播、frame 画面、caption 发布文字、meet 会议、you 你定的、rule 已确认判断、plat 平台规则、op 原稿自己、ai AI 判断。
核对：old 必须在原稿里恰好出现一次；insert_after 必须是原稿里某一整行；依据类型必须在清单里。核对不过就报错，不出页面。
"""
from __future__ import annotations
import argparse, json, os, sys

KINDS = {"voice", "frame", "caption", "meet", "you", "rule", "plat", "op", "ai"}
VERDICTS = {"must", "optional", "keep", "wait"}
DEFAULT_HINT = ('左边是<b>原稿</b>，黄色高亮是建议修改的地方，「＋」是建议新加内容的位置。<b>左边高亮的句子可以直接点进去改字</b>，改了就自动算采纳；'
    '也可以在右边卡片点<b>采纳</b>或<b>不采纳</b>，「建议改成」那栏可以先改再采纳。每张卡片的依据按来源标了颜色：'
    '<div class="legend"><span><i class="src voice">口播</i>参考视频里说出来的话</span><span><i class="src frame">画面</i>参考视频里看得到的</span>'
    '<span><i class="src caption">发布文字</i>写在视频下面的文字，视频里没说</span><span><i class="src meet">会议</i>会上说的</span>'
    '<span><i class="src you">你定的</i>你之前亲手改稿或明确表态</span><span><i class="src rule">已确认判断</i>规则库里你确认过的</span>'
    '<span><i class="src op">原稿</i>原稿自己的内容</span><span><i class="src ai">AI 判断</i>没有外部依据，是 AI 的判断</span></div>'
    '<div style="margin-top:4px">改完点<b>复制提词稿</b>直接拿走；想让 AI 同步进文件，点<b>导出结果</b>复制发过去。</div>')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    spec = json.load(open(a.spec, encoding="utf-8"))
    tpl = open(os.path.join(os.path.dirname(__file__), "..", "assets", "template.html"), encoding="utf-8").read()

    paras = [[l for l in p.split("\n") if l.strip()] for p in spec["original"].strip().split("\n\n")]
    paras = [p for p in paras if p]
    lines, sections, order, orig = {}, [], [], {}
    for p in paras:
        ids = []
        for text in p:
            lid = f"L{len(order)+1}"
            lines[lid] = [{"t": text}]
            orig[lid] = text
            ids.append(lid); order.append(lid)
        sections.append(ids)

    errs, changes = [], []
    for n, ch in enumerate(spec["changes"], 1):
        cid = f"c{n}"
        v = ch.get("verdict")
        if v not in VERDICTS:
            errs.append(f"第 {n} 条 verdict 不对：{v}")
        for r in ch.get("reasons", []):
            if r[0] not in KINDS:
                errs.append(f"第 {n} 条依据类型不对：{r[0]}")
        if not ch.get("reasons"):
            errs.append(f"第 {n} 条没写依据")
        if ch.get("insert_after") is not None:
            anchor = [lid for lid in order if orig.get(lid) == ch["insert_after"]]
            if len(anchor) != 1:
                errs.append(f"第 {n} 条 insert_after 在原稿里找到 {len(anchor)} 处：{ch['insert_after'][:20]}")
                continue
            new_lid = f"L{len(order)+1}_{n}"
            lines[new_lid] = [{"c": cid}]
            for sec in sections:
                if anchor[0] in sec:
                    sec.insert(sec.index(anchor[0]) + 1, new_lid)
            order.insert(order.index(anchor[0]) + 1, new_lid)
            changes.append({"id": cid, "n": n, "old": "", "new": ch["new"], "reason": ch["reasons"], "line": new_lid, "verdict": v, "init": "pending"})
            continue
        old = ch.get("old", "")
        found = [(lid, i) for lid in order for i, s in enumerate(lines[lid]) if "t" in s and old and s["t"].count(old) >= 1]
        total = sum(lines[lid][i]["t"].count(old) for lid, i in found) if old else 0
        if total != 1:
            errs.append(f"第 {n} 条 old 在原稿里出现 {total} 次（要正好 1 次）：{old[:20]}")
            continue
        lid, i = found[0]
        t = lines[lid][i]["t"]
        pre, post = t.split(old, 1)
        seg = ([{"t": pre}] if pre else []) + [{"c": cid}] + ([{"t": post}] if post else [])
        lines[lid] = lines[lid][:i] + seg + lines[lid][i+1:]
        changes.append({"id": cid, "n": n, "old": old, "new": ch["new"], "reason": ch["reasons"], "line": lid, "verdict": v, "init": "pending"})
    if errs:
        sys.exit("核对没通过：\n- " + "\n- ".join(errs))

    data = {"sections": sections, "lines": lines, "changes": changes}
    html = (tpl.replace("__DATA__", json.dumps(data, ensure_ascii=False))
               .replace("__TITLE__", spec["title"])
               .replace("__KEY__", "jc-review-" + spec["key"])
               .replace("__HINT__", spec.get("hint") or DEFAULT_HINT))
    open(a.out, "w", encoding="utf-8").write(html)
    print(json.dumps({"ok": True, "out": a.out, "lines": len(order), "changes": len(changes)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
