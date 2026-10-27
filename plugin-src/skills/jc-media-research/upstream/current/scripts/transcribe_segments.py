#!/usr/bin/env python3
"""Transcribe media with Volcengine Doubao ASR and preserve ~28s review layers."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from typing import Any


DEFAULT_SEGMENT_SECONDS = 28

# 优先用同机 jc-zhuanxie 的最新引擎；单独安装本 Skill 时用 scripts/shared 里的副本。
_ENGINE_DIRS = (
    Path(__file__).resolve().parents[2] / "jc-zhuanxie" / "scripts",
    Path.home() / ".agents" / "skills" / "jc-zhuanxie" / "scripts",
    Path(__file__).resolve().parent / "shared",
)
ENGINE_DIR = next(path for path in _ENGINE_DIRS if (path / "volc_asr.py").is_file())
sys.path.insert(0, str(ENGINE_DIR))
import volc_asr  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="使用火山引擎豆包语音转写媒体，并按时间片整理复核层。"
    )
    parser.add_argument("--input", type=Path, help="本地音频或视频文件。")
    parser.add_argument("--output-dir", type=Path, help="独立转写输出目录。")
    parser.add_argument("--segment-seconds", type=int, default=DEFAULT_SEGMENT_SECONDS)
    parser.add_argument("--ffmpeg", help="ffmpeg 可执行文件。")
    parser.add_argument("--ffprobe", help="ffprobe 可执行文件。")
    parser.add_argument("--check", action="store_true", help="只检查依赖，不读取媒体。")
    return parser.parse_args()


def expand(path: Path | None) -> Path | None:
    return path.expanduser().resolve() if path else None


def resolve_executable(explicit: str | None, env_name: str, command: str) -> str | None:
    value = explicit or os.environ.get(env_name)
    if value:
        resolved = shutil.which(value) or str(expand(Path(value)))
        if Path(resolved).is_file():
            return resolved
    return shutil.which(command)


def dependency_state(args: argparse.Namespace) -> dict[str, Any]:
    ffmpeg = resolve_executable(args.ffmpeg, "FFMPEG_BIN", "ffmpeg")
    ffprobe = resolve_executable(args.ffprobe, "FFPROBE_BIN", "ffprobe")
    try:
        volc_asr.load_key()
        key_ok = True
    except SystemExit:
        key_ok = False
    local_ok = volc_asr.local_available()
    return {
        "ok": all((ffmpeg, ffprobe)) and (key_ok or local_ok),
        "ffmpeg_available": bool(ffmpeg),
        "ffprobe_available": bool(ffprobe),
        "volc_api_key_available": key_ok,
        "local_fallback_available": local_ok,
        "engine": f"volcengine {volc_asr.RESOURCE_ID}，失败时本地 {volc_asr.LOCAL_MODEL}",
        "_ffprobe": ffprobe,
    }


def public_state(state: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in state.items() if not key.startswith("_")}


def probe_media(ffprobe: str, media: Path) -> dict[str, Any]:
    result = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(media),
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=120,
    )
    payload = json.loads(result.stdout)
    duration = float(payload.get("format", {}).get("duration", 0))
    if duration <= 0:
        raise RuntimeError("媒体时长不可用。")
    return {"duration_seconds": duration}


def media_sha256(media: Path) -> str:
    digest = hashlib.sha256()
    with media.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run_recognizer(*, media: Path, segment_seconds: int, duration: float) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """火山转写后按句子起点归入固定时间片，保持旧 segments.jsonl 结构。"""
    data = volc_asr.transcribe(media)
    sentences = data["sentences"]
    if not sentences:
        raise RuntimeError("火山转写没有返回任何句子。")
    records = []
    total = max(1, int(-(-duration // segment_seconds)))
    for index in range(total):
        start = index * segment_seconds
        end = min(duration, start + segment_seconds)
        text = "".join(
            item["text"] for item in sentences
            if start <= item["start"] < end or (index == total - 1 and item["start"] >= end)
        )
        records.append({"segment": index + 1, "start_seconds": start, "end_seconds": end, "text": text})
    return records, data


def stamp(seconds: float) -> str:
    whole = max(0, int(seconds))
    hours, remainder = divmod(whole, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def write_new(path: Path, text: str) -> None:
    if path.exists():
        raise FileExistsError(f"拒绝覆盖已有文件：{path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(f".{path.name}.tmp")
    temp.write_text(text, encoding="utf-8")
    os.replace(temp, path)


def write_outputs(
    *, output_dir: Path, media: Path, records: list[dict[str, Any]], duration: float,
    segment_seconds: int, asr: dict[str, Any],
) -> dict[str, Any]:
    manifest_path = output_dir / "manifest.json"
    if manifest_path.exists():
        raise FileExistsError(f"输出目录已有 manifest，拒绝覆盖：{manifest_path}")

    raw_lines = [json.dumps(record, ensure_ascii=False, sort_keys=True) for record in records]
    raw_text = "\n".join(str(record.get("text") or "") for record in records if record.get("text"))
    review_blocks = [
        f"[{stamp(float(record['start_seconds']))}–{stamp(float(record['end_seconds']))}] "
        f"{record.get('text') or '【空段】'}"
        for record in records
    ]
    corrected_placeholder = (
        "# 校正版逐字稿\n\n"
        "状态：待人工复核。\n\n"
        "请根据 `../review/transcript_review.md` 只纠正确定错误，保留口语表达；"
        "不确定处使用「【待确认】」。完成后再把 manifest 的状态改为 `corrected_validated`。\n"
    )

    relative_files = {
        "segments_jsonl": "raw/segments.jsonl",
        "raw_transcript": "raw/transcript_raw.txt",
        "review_transcript": "review/transcript_review.md",
        "corrected_transcript": "corrected/transcript_corrected.md",
    }
    write_new(output_dir / relative_files["segments_jsonl"], "\n".join(raw_lines) + "\n")
    volc_asr.write_outputs(asr, output_dir / "raw" / "asr_sentences", review_md=False)
    write_new(output_dir / relative_files["raw_transcript"], raw_text + "\n")
    write_new(
        output_dir / relative_files["review_transcript"],
        "# 分段复核稿\n\n" + "\n\n".join(review_blocks) + "\n",
    )
    write_new(output_dir / relative_files["corrected_transcript"], corrected_placeholder)

    manifest = {
        "schema_version": 1,
        "status": "transcribed_pending_review",
        "source_name": media.name,
        "source_bytes": media.stat().st_size,
        "source_sha256": media_sha256(media),
        "duration_seconds": round(duration, 3),
        "segment_seconds": segment_seconds,
        "segment_count": len(records),
        "engine": volc_asr.engine_label(asr),
        "sentence_files": "raw/asr_sentences.{json,srt,txt,volc.json}（逐句与逐字时间为 ASR 估计值，未复核）",
        "empty_segments": sum(1 for record in records if not record.get("text")),
        "files": relative_files,
    }
    write_new(manifest_path, json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    return manifest


def main() -> int:
    args = parse_args()
    if args.segment_seconds < 5 or args.segment_seconds > 120:
        raise SystemExit("--segment-seconds 必须在 5–120 之间。")

    state = dependency_state(args)
    if args.check:
        print(json.dumps(public_state(state), ensure_ascii=False, indent=2, sort_keys=True))
        return 0 if state["ok"] else 2
    if not state["ok"]:
        print(json.dumps(public_state(state), ensure_ascii=False, indent=2, sort_keys=True))
        raise SystemExit("转写依赖不完整（需要 ffmpeg／ffprobe，以及火山密钥或本地 Qwen3-ASR 至少一个）。")
    if not args.input or not args.output_dir:
        raise SystemExit("转写时必须同时提供 --input 和 --output-dir。")

    media = expand(args.input)
    output_dir = expand(args.output_dir)
    if media is None or not media.is_file():
        raise SystemExit("输入媒体不存在或不是文件。")
    if output_dir is None:
        raise SystemExit("输出目录无效。")

    probe = probe_media(str(state["_ffprobe"]), media)
    output_dir.mkdir(parents=True, exist_ok=True)
    records, asr = run_recognizer(
        media=media, segment_seconds=args.segment_seconds, duration=probe["duration_seconds"],
    )

    manifest = write_outputs(
        output_dir=output_dir,
        media=media,
        records=records,
        duration=probe["duration_seconds"],
        segment_seconds=args.segment_seconds,
        asr=asr,
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
        print(f"转写失败：{exc}", file=sys.stderr)
        raise SystemExit(1)
