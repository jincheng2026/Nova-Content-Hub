#!/usr/bin/env python3
"""交付前自检：检查规律提取汇总的字段完整性与三份规律文件的结构。"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

SUMMARY_FIELDS = [
    "素材文件",
    "平台与形式",
    "标题",
    "平台文案",
    "封面/首帧文字",
    "口播开头 1-3 句原文",
    "口播结构",
]
RULE_BULLETS = ["大白话解释", "适合什么内容", "不适合什么内容", "不可照搬点", "来源素材"]
FORBIDDEN = ["一定会爆", "必然爆", "肯定火", "算法喜欢", "平台就爱"]
PATTERN_FILES = ["标题规律.md", "开头规律.md", "正文结构规律.md"]


def check_summary(path: Path, problems: list[str]) -> int:
    if not path.is_file():
        problems.append(f"缺少汇总文件: {path}")
        return 0
    text = path.read_text(encoding="utf-8")
    sections = re.split(r"(?m)^## ", text)[1:]
    count = 0
    for sec in sections:
        title = sec.splitlines()[0].strip()
        if not title.startswith("素材"):
            continue
        count += 1
        for field in SUMMARY_FIELDS:
            if f"- {field}：" not in sec:
                problems.append(f"汇总「{title}」缺字段: {field}")
    if count == 0:
        problems.append("汇总文件里没有任何「## 素材」小节")
    return count


def check_pattern_file(path: Path, problems: list[str]) -> tuple[int, int]:
    if not path.is_file():
        problems.append(f"缺少规律文件: {path}")
        return 0, 0
    text = path.read_text(encoding="utf-8")
    for phrase in FORBIDDEN:
        if phrase in text:
            problems.append(f"{path.name} 含无法由素材证明的因果表述: 「{phrase}」")
    rules = re.split(r"(?m)^## ", text)[1:]
    n_rules = n_single = 0
    for sec in rules:
        title = sec.splitlines()[0].strip()
        if title.startswith("规律"):
            n_rules += 1
            for bullet in RULE_BULLETS:
                if f"- {bullet}：" not in sec:
                    problems.append(f"{path.name}「{title}」缺要素: {bullet}")
            sources = re.findall(r"(?m)^\s+- 素材 \d+", sec)
            if len(sources) < 2:
                problems.append(f"{path.name}「{title}」来源素材不足 2 条（{len(sources)} 条）")
            if re.search(r"02_内容素材/", sec):
                problems.append(f"{path.name}「{title}」出现带 ID 的完整路径，应改为素材编号引用")
        elif "单次观察" in title or "单条观察" in title:
            n_single += len(re.findall(r"(?m)^- ", sec))
    if "待确认" not in text:
        problems.append(f"{path.name} 缺「待确认」清单")
    return n_rules, n_single


def main() -> int:
    parser = argparse.ArgumentParser(description="检查规律提取产物的结构完整性")
    parser.add_argument("vault", help="vault 根目录（包含 03_内容规律/）")
    args = parser.parse_args()

    root = Path(args.vault).expanduser()
    gd = root / "03_内容规律"
    problems: list[str] = []

    n_materials = check_summary(gd / "_规律提取汇总.md", problems)
    total_rules = total_single = 0
    for name in PATTERN_FILES:
        r, s = check_pattern_file(gd / name, problems)
        total_rules += r
        total_single += s

    print(f"素材条目: {n_materials}  候选规律: {total_rules}  单条观察: {total_single}")
    if problems:
        print("FAIL")
        for p in problems:
            print(" -", p)
        return 1
    print("PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
