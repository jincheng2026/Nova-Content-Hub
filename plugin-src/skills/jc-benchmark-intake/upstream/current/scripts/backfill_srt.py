#!/usr/bin/env python3
"""给已经入库、还没有时间码字幕的旧素材补 .srt（只用已有的原始识别，不重新转写、不花钱）。

用法：
  python3 backfill_srt.py <Vault>                         # 只盘点：多少条能零成本补、多少条补不了
  python3 backfill_srt.py <Vault> --apply --only 关键词 …   # 只补名字里含关键词（作品 ID 或标题片段）的条目
  python3 backfill_srt.py <Vault> --apply --all           # 全库补齐（需要锦成同意后才用）

时间来源按顺序找：素材目录自己残留的 `转写/原始识别/<逐字稿名>.json`，再到 Vault 的
`.trash/*/<素材目录名>/转写/原始识别/` 和 `02_内容素材/.trash/*/<素材目录名>/转写/原始识别/`
里找同名 `.json`（首选）或 `.srt`。多批都有时用日期最新的一批。只新增字幕文件，
不覆盖已有字幕，不改笔记和逐字稿。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import transcript_srt  # noqa: E402
import validate_workspace  # noqa: E402


COARSE_WINDOW = re.compile(r"^\s*\[?\d{1,2}:\d{2}(?::\d{2})?\s*[–—\-~]\s*\d{1,2}:\d{2}(?::\d{2})?\]?\s*$", re.MULTILINE)


def formal_items(content_root: Path) -> list[Path]:
    folders = []
    for note in sorted(content_root.rglob("笔记信息.md")):
        parts = note.relative_to(content_root).parts
        if ".staging" in parts or ".trash" in parts or any(part.startswith("_") for part in parts):
            continue
        folders.append(note.parent)
    return folders


def timing_sources(vault: Path, folder: Path, stem: str) -> list[Path]:
    """按优先级返回可用的时间来源：素材目录残留 > 各 .trash 批次（日期新的在前）；同批 .json 优先于 .srt。"""
    found: list[Path] = []
    own = folder / "转写" / "原始识别"
    for suffix in (".json", ".srt"):
        if (own / f"{stem}{suffix}").is_file():
            found.append(own / f"{stem}{suffix}")
    batches: list[Path] = []
    for trash in (vault / ".trash", vault / "02_内容素材" / ".trash"):
        if trash.is_dir():
            batches.extend(path for path in trash.iterdir() if (path / folder.name / "转写" / "原始识别").is_dir())
    for batch in sorted(batches, key=lambda path: path.name, reverse=True):
        raw = batch / folder.name / "转写" / "原始识别"
        for suffix in (".json", ".srt"):
            candidate = raw / f"{stem}{suffix}"
            if candidate.is_file() and candidate.stat().st_size > 0:
                found.append(candidate)
    usable = []
    for candidate in found:
        try:
            if transcript_srt.load_timing(candidate):  # 读得出带时间的字才算数（排除别的格式的同名文件）
                usable.append(candidate)
        except (ValueError, KeyError, TypeError, json.JSONDecodeError, UnicodeDecodeError):
            continue
    return usable


def inventory(vault: Path) -> list[dict[str, object]]:
    content_root = vault / "02_内容素材"
    rows: list[dict[str, object]] = []
    for folder in formal_items(content_root):
        videos = sorted(p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in validate_workspace.VIDEO_SUFFIXES)
        if not videos:
            continue
        transcripts = validate_workspace.find_transcript_files(folder)
        base = {"folder": str(folder.relative_to(content_root)), "video": str(videos[0])}
        if not transcripts:
            rows.append({**base, "status": "没有校正版逐字稿"})
            continue
        for transcript in transcripts:
            row = {**base, "transcript": str(transcript)}
            srt = transcript.with_suffix(".srt")
            if srt.is_file():
                row["status"] = "已有字幕"
            elif sources := timing_sources(vault, folder, transcript.stem):
                row.update(status="可零成本补", source=str(sources[0]), other_sources=[str(p) for p in sources[1:]])
            elif COARSE_WINDOW.search(transcript.read_text(encoding="utf-8", errors="replace")):
                row["status"] = "只有粗时间段"
            else:
                row["status"] = "没有时间来源"
            rows.append(row)
    return rows


def apply(vault: Path, rows: list[dict[str, object]]) -> list[dict[str, object]]:
    content_root = vault / "02_内容素材"
    records = validate_workspace.load_records(content_root)
    results = []
    for row in rows:
        transcript = Path(str(row["transcript"]))
        try:
            built = transcript_srt.build_srt(Path(str(row["source"])), transcript, None, Path(str(row["video"])))
        except (ValueError, FileExistsError, OSError, KeyError, json.JSONDecodeError) as exc:
            results.append({"folder": row["folder"], "ok": False, "error": str(exc)})
            continue
        folder = content_root / str(row["folder"])
        check = validate_workspace.validate_folder(folder, content_root, True, records, require_srt=True)
        results.append({
            "folder": row["folder"],
            "ok": bool(built["ok"]) and bool(check["ok"]),
            "srt": built["srt"],
            "source": built["timing"],
            "cues": built["cues"],
            "match_ratio": built["match_ratio"],
            "last_end": built["last_end"],
            "duration_seconds": built["duration_seconds"],
            "srt_problems": built["problems"],
            "strict_issues": [item for item in check["issues"] if item["level"] == "error"],
        })
    return results


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="用已有原始识别给旧素材补时间码字幕（不重新转写）。")
    parser.add_argument("vault", nargs="?", default=".", help="Vault 根目录（包含 02_内容素材）")
    parser.add_argument("--apply", action="store_true", help="真正写字幕；不加只盘点")
    parser.add_argument("--only", action="append", default=[], help="只处理目录名含这个关键词的条目，可重复")
    parser.add_argument("--all", action="store_true", help="处理全部可零成本补的条目")
    parser.add_argument("--json", action="store_true", help="输出 JSON")
    args = parser.parse_args(argv)
    vault = Path(args.vault).expanduser().resolve()
    if not (vault / "02_内容素材").is_dir():
        parser.error(f"找不到 {vault / '02_内容素材'}")

    rows = inventory(vault)
    counts: dict[str, int] = {}
    for row in rows:
        counts[str(row["status"])] = counts.get(str(row["status"]), 0) + 1
    ready = [row for row in rows if row["status"] == "可零成本补"]
    if args.only:
        ready = [row for row in ready if any(key in str(row["folder"]) for key in args.only)]
    report: dict[str, object] = {"vault": str(vault), "counts": counts, "backfillable": ready}

    if args.apply:
        if not args.only and not args.all:
            parser.error("--apply 需要配 --only 关键词（先小范围试）或 --all（全库，需锦成同意）")
        report["applied"] = apply(vault, ready)
        report["ok"] = all(bool(item["ok"]) for item in report["applied"])  # type: ignore[union-attr]
    else:
        report["ok"] = True

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print("盘点：" + "，".join(f"{key} {value} 条" for key, value in sorted(counts.items())))
        label = "本次处理" if args.apply else "可零成本补"
        print(f"{label}：{len(ready)} 条")
        for row in ready:
            print(f"- {row['folder']}  ←  {row['source']}")
        for item in report.get("applied", []):  # type: ignore[union-attr]
            if item.get("error"):
                print(f"  失败 {item['folder']}：{item['error']}")
            else:
                print(f"  {'通过' if item['ok'] else '未通过'} {item['folder']}：{item['cues']} 条，"
                      f"原样对上 {item['match_ratio']:.1%}，末条 {item['last_end']} 秒 / 视频 {item['duration_seconds']} 秒")
                for problem in item["srt_problems"] + item["strict_issues"]:
                    print(f"    {problem.get('code')}: {problem.get('detail')}")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
