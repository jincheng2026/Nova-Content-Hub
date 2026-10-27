#!/usr/bin/env python3
"""Verify that a local transcript is ready to support structural conclusions."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


PLACEHOLDER_MARKERS = (
    "待人工复核",
    "待复核",
    "待校正",
    "【待确认】",
)


class TranscriptNotReady(RuntimeError):
    """Raised when the transcript cannot yet be used as final evidence."""


def validate_transcript(transcript_dir: Path) -> dict[str, object]:
    root = transcript_dir.expanduser().resolve()
    manifest_path = root / "manifest.json"
    if not manifest_path.is_file():
        raise TranscriptNotReady("缺少 transcript/manifest.json。")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise TranscriptNotReady("manifest.json 无法读取或不是有效 JSON。") from exc

    status = manifest.get("status")
    if status != "corrected_validated":
        raise TranscriptNotReady(
            f"逐字稿状态是 {status or 'missing'}，必须完成复核并标记为 corrected_validated。"
        )

    corrected_path = root / "corrected" / "transcript_corrected.md"
    if not corrected_path.is_file():
        raise TranscriptNotReady("缺少 corrected/transcript_corrected.md。")
    corrected_text = corrected_path.read_text(encoding="utf-8").strip()
    if len(corrected_text) < 80:
        raise TranscriptNotReady("校正版逐字稿内容过短，不能支持视频结构结论。")
    found_markers = [marker for marker in PLACEHOLDER_MARKERS if marker in corrected_text]
    if found_markers:
        raise TranscriptNotReady("校正版仍含待处理标记：" + "、".join(found_markers))

    raw_path = root / "raw" / "segments.jsonl"
    if not raw_path.is_file():
        raise TranscriptNotReady("缺少 raw/segments.jsonl，无法核对分段覆盖。")
    segment_rows = [line for line in raw_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    declared_count = manifest.get("segment_count")
    if isinstance(declared_count, int) and declared_count != len(segment_rows):
        raise TranscriptNotReady(
            f"分段数量不一致：manifest={declared_count}，raw={len(segment_rows)}。"
        )
    if not segment_rows:
        raise TranscriptNotReady("原始分段为空。")

    return {
        "status": "ready",
        "manifest_status": status,
        "segment_count": len(segment_rows),
        "corrected_characters": len(corrected_text),
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--transcript-dir", required=True, type=Path)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        result = validate_transcript(args.transcript_dir)
    except TranscriptNotReady as exc:
        print(json.dumps({"status": "blocked", "error": str(exc)}, ensure_ascii=False))
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
