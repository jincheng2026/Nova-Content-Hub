#!/usr/bin/env python3
"""Render an offline HTML report to a PNG preview with local Chromium."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile


COMMON_BROWSER_PATHS = (
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
)
COMMON_BROWSER_COMMANDS = (
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "chrome",
    "msedge",
)


class PreviewError(RuntimeError):
    """Raised when a trustworthy PNG preview cannot be produced."""


def find_browser(explicit: str | None = None) -> Path:
    candidates: list[str] = []
    if explicit:
        candidates.append(explicit)
    if os.environ.get("CHROME_PATH"):
        candidates.append(os.environ["CHROME_PATH"])
    candidates.extend(COMMON_BROWSER_PATHS)
    for command in COMMON_BROWSER_COMMANDS:
        found = shutil.which(command)
        if found:
            candidates.append(found)

    for candidate in candidates:
        path = Path(candidate).expanduser()
        if path.is_file() and os.access(path, os.X_OK):
            return path.resolve()
    raise PreviewError(
        "未找到可执行的 Chrome、Chromium 或 Edge；安装浏览器，或通过 --browser / CHROME_PATH 指定路径。"
    )


def png_dimensions(path: Path) -> tuple[int, int]:
    data = path.read_bytes()[:24]
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
        raise PreviewError("浏览器没有生成有效 PNG。")
    return struct.unpack(">II", data[16:24])


def render_preview(
    input_path: Path,
    output_path: Path,
    *,
    browser: Path,
    width: int,
    height: int,
    force: bool = False,
) -> dict[str, object]:
    source = input_path.expanduser().resolve()
    target = output_path.expanduser().resolve()
    if not source.is_file():
        raise PreviewError(f"HTML 不存在：{source.name}")
    if source.suffix.lower() not in {".html", ".htm"}:
        raise PreviewError("预览输入必须是 HTML 文件。")
    if target.exists() and not force:
        raise FileExistsError(f"输出已存在：{target.name}；使用 --force 明确覆盖。")
    if width < 720 or height < 720:
        raise PreviewError("预览宽度和高度都不能小于 720。")

    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="jc-media-preview-") as profile_dir:
        base_args = [
            str(browser),
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-gpu",
            "--hide-scrollbars",
            "--no-first-run",
            "--no-default-browser-check",
            f"--user-data-dir={profile_dir}",
            f"--window-size={width},{height}",
            f"--screenshot={target}",
            source.as_uri(),
        ]
        attempts = (
            [str(browser), "--headless=new", *base_args[1:]],
            [str(browser), "--headless", *base_args[1:]],
        )
        errors: list[str] = []
        for command in attempts:
            completed = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=45,
                check=False,
            )
            if completed.returncode == 0 and target.is_file():
                break
            errors.append((completed.stderr or completed.stdout or "unknown error").strip())
        else:
            raise PreviewError("浏览器截图失败：" + " | ".join(errors[-2:]))

    actual_width, actual_height = png_dimensions(target)
    if target.stat().st_size < 1024:
        raise PreviewError("PNG 文件异常小，不能作为报告预览。")
    return {
        "status": "ok",
        "input": source.name,
        "output": target.name,
        "width": actual_width,
        "height": actual_height,
        "bytes": target.stat().st_size,
        "browser": browser.name,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="自包含 HTML 报告")
    parser.add_argument("--output", required=True, type=Path, help="PNG 输出路径")
    parser.add_argument("--browser", help="Chrome、Chromium 或 Edge 可执行文件")
    parser.add_argument("--width", type=int, default=1440)
    parser.add_argument("--height", type=int, default=4200)
    parser.add_argument("--force", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        result = render_preview(
            args.input,
            args.output,
            browser=find_browser(args.browser),
            width=args.width,
            height=args.height,
            force=args.force,
        )
    except (PreviewError, FileExistsError, subprocess.TimeoutExpired) as exc:
        print(json.dumps({"status": "error", "error": str(exc)}, ensure_ascii=False))
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
