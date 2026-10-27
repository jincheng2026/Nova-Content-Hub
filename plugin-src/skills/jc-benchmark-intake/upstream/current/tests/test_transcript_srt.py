from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))


def load(name: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SRT = load("transcript_srt")
BACKFILL = load("backfill_srt")

# jc-zhuanxie 写出的原始识别：小句＋字级起点（秒），识别成了「Work Buddy」「skill」，漏了「超」字
RAW_CLAUSES = [
    {"i": 1, "start": 0.2, "end": 2.0, "text": "Work Buddy 到底有多牛？",
     "chars": [["Work", 0.2], ["Buddy", 0.5], ["到", 0.9], ["底", 1.1], ["有", 1.3], ["多", 1.5], ["牛", 1.7]]},
    {"i": 2, "start": 2.4, "end": 4.0, "text": "它能挂载各种 skill，",
     "chars": [["它", 2.4], ["能", 2.6], ["挂", 2.8], ["载", 3.0], ["各", 3.2], ["种", 3.4], ["skill", 3.6]]},
    {"i": 3, "start": 4.5, "end": 6.0, "text": "今天分享给你。",
     "chars": [["今", 4.5], ["天", 4.7], ["分", 4.9], ["享", 5.1], ["给", 5.3], ["你", 5.5]]},
]

CORRECTED = """---
engine: volcengine
---

# 校正版逐字稿 · 测试作品

- 来源：抖音作品 123456789
- 校正范围：Work Buddy 改为 WorkBuddy

WorkBuddy 到底有多牛？它能挂载各种超级 Skill【疑似：原识别「skill」】，今天分享给你。
"""


class TranscriptSrtTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def write_inputs(self) -> tuple[Path, Path]:
        timing = self.root / "001-视频.json"
        timing.write_text(json.dumps(RAW_CLAUSES, ensure_ascii=False), encoding="utf-8")
        transcript = self.root / "001-视频.md"
        transcript.write_text(CORRECTED, encoding="utf-8")
        return timing, transcript

    def test_body_skips_header_metadata_and_time_windows(self) -> None:
        text = "# 标题\n\n说明：只改错字。\n\n- 来源：抖音\n\n### [0001] 00:00:00–00:00:29\n[00:00:00–00:00:28]\n正文第一句。\n[00:01:05] 第二句\n"
        self.assertEqual(SRT.transcript_body(text), ["正文第一句。", "第二句"])

    def test_build_uses_corrected_text_with_asr_times(self) -> None:
        timing, transcript = self.write_inputs()
        result = SRT.build_srt(timing, transcript)
        self.assertTrue(result["ok"], result)
        cues = SRT.parse_srt(Path(result["srt"]).read_text(encoding="utf-8"))
        self.assertEqual(Path(result["srt"]).name, "001-视频.srt")
        self.assertEqual([cue["text"] for cue in cues], [
            "WorkBuddy 到底有多牛？",
            "它能挂载各种超级 Skill【疑似：原识别「skill」】，",
            "今天分享给你。",
        ])
        self.assertEqual(cues[0]["start"], 200)
        self.assertEqual(cues[1]["start"], 2400)
        self.assertEqual(cues[2]["start"], 4500)
        for previous, current in zip(cues, cues[1:]):
            self.assertLessEqual(previous["end"], current["start"])
        self.assertLess(result["match_ratio"], 1.0)  # 「超」是校正时补的字

    def test_build_refuses_to_overwrite_and_rebuilds_from_existing_srt(self) -> None:
        timing, transcript = self.write_inputs()
        first = SRT.build_srt(timing, transcript)
        with self.assertRaises(FileExistsError):
            SRT.build_srt(timing, transcript)
        # 逐字稿改过：原字幕的检查会报对不上；用现有字幕当时间来源重建后通过
        transcript.write_text(CORRECTED.replace("今天分享给你", "今天全部分享给你"), encoding="utf-8")
        codes = {item["code"] for item in SRT.check_srt(Path(first["srt"]), transcript)}
        self.assertIn("srt_text_mismatch", codes)
        rebuilt = SRT.build_srt(Path(first["srt"]), transcript, output=self.root / "新.srt")
        self.assertTrue(rebuilt["ok"], rebuilt)

    def test_build_stops_when_transcript_belongs_to_another_video(self) -> None:
        timing, transcript = self.write_inputs()
        transcript.write_text("# 另一条\n\n完全不相干的另外一段口播内容，讲的是做饭和旅行。\n", encoding="utf-8")
        with self.assertRaises(ValueError):
            SRT.build_srt(timing, transcript)


class BackfillTests(unittest.TestCase):
    def make_vault(self) -> Path:
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        vault = Path(temp.name)
        folder = vault / "02_内容素材" / "未参考" / "抖音" / "抖音_测试_123456789"
        corrected = folder / "转写" / "校正版逐字稿" / "001-视频.md"
        corrected.parent.mkdir(parents=True)
        corrected.write_text(CORRECTED, encoding="utf-8")
        (folder / "视频.mp4").write_bytes(b"video")
        (folder / "笔记信息.md").write_text(
            "# 测试\n\n> 平台：抖音\n> 作品 ID：123456789\n\n## 原始复制内容\n\n" + "测试文字" * 60
            + "\n\n## 本地媒体\n\n- SHA-256：`" + "a" * 64 + "`\n\n## 校正版逐字稿\n\n- 校正版文件：[[转写/校正版逐字稿/001-视频.md]]\n",
            encoding="utf-8",
        )
        raw = vault / ".trash" / "2026-09-24_对标素材逐字稿中间版本" / folder.name / "转写" / "原始识别"
        raw.mkdir(parents=True)
        (raw / "001-视频.json").write_text(json.dumps(RAW_CLAUSES, ensure_ascii=False), encoding="utf-8")
        other = vault / "02_内容素材" / "未参考" / "抖音" / "抖音_旧素材_987654321"
        (other / "转写" / "校正版逐字稿").mkdir(parents=True)
        (other / "转写" / "校正版逐字稿" / "001-视频.md").write_text("# 旧\n\n[00:00:00–00:00:28]\n旧内容。\n", encoding="utf-8")
        (other / "视频.mp4").write_bytes(b"video")
        (other / "笔记信息.md").write_text("# 旧\n\n> 平台：抖音\n> 作品 ID：987654321\n", encoding="utf-8")
        return vault

    def test_inventory_counts_zero_cost_and_coarse_items(self) -> None:
        vault = self.make_vault()
        statuses = {Path(str(row["folder"])).name: row["status"] for row in BACKFILL.inventory(vault)}
        self.assertEqual(statuses, {"抖音_测试_123456789": "可零成本补", "抖音_旧素材_987654321": "只有粗时间段"})

    def test_apply_requires_only_or_all(self) -> None:
        vault = self.make_vault()
        with self.assertRaises(SystemExit), contextlib.redirect_stderr(io.StringIO()):
            BACKFILL.main([str(vault), "--apply"])

    @patch.object(BACKFILL.validate_workspace, "sha256_file", return_value="a" * 64)
    @patch.object(BACKFILL.validate_workspace, "validate_video", return_value=(True, "duration=10.000s"))
    @patch.object(BACKFILL.transcript_srt, "probe_duration", return_value=10.0)
    def test_apply_only_writes_selected_item(self, *_mocks: object) -> None:
        vault = self.make_vault()
        with contextlib.redirect_stdout(io.StringIO()):
            code = BACKFILL.main([str(vault), "--apply", "--only", "123456789", "--json"])
        self.assertEqual(code, 0)
        srt = vault / "02_内容素材" / "未参考" / "抖音" / "抖音_测试_123456789" / "转写" / "校正版逐字稿" / "001-视频.srt"
        self.assertTrue(srt.is_file())
        self.assertFalse((vault / "02_内容素材" / "未参考" / "抖音" / "抖音_旧素材_987654321" / "转写" / "校正版逐字稿" / "001-视频.srt").exists())


if __name__ == "__main__":
    unittest.main()
