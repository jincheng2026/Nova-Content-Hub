#!/usr/bin/env python3
"""Persist confirmed decisions into one append-only pending content package."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Iterable


ALLOWED_FIELDS = {"title", "description", "cover_copy", "script", "decision"}
def default_content_root() -> Path:
    configured = os.environ.get("JC_CONTENT_ROOT")
    if configured:
        return Path(configured).expanduser().resolve()
    return Path.cwd().resolve()


DEFAULT_CONTENT_ROOT = default_content_root()
DEFAULT_INBOX = DEFAULT_CONTENT_ROOT / "内容数据统计" / ".runtime" / "chendian-inbox"
DEFAULT_VISIBLE_ROOT = DEFAULT_CONTENT_ROOT / "内容数据统计" / "待发布沉淀"


class CaptureError(ValueError):
    """Raised when a pending package cannot be updated safely."""


def parse_pairs(values: Iterable[str], *, allowed: set[str] | None = None) -> dict[str, str]:
    parsed: dict[str, str] = {}
    for item in values:
        key, separator, value = item.partition("=")
        key = key.strip()
        if not separator or not key or not value:
            raise CaptureError(f"参数必须使用 key=value 且值不能为空：{item!r}")
        if allowed is not None and key not in allowed:
            raise CaptureError(f"不支持的字段：{key}")
        if key in parsed and parsed[key] != value:
            raise CaptureError(f"同一键出现不同值：{key}")
        parsed[key] = value
    return parsed


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def clone_or_copy(source: Path, destination: Path, *, replace: bool = False) -> str:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        if sha256_file(destination) == sha256_file(source):
            return "existing"
        if not replace:
            raise CaptureError(f"目标文件已存在但内容不同：{destination}")

    fd, temporary_name = tempfile.mkstemp(
        prefix=f".{destination.name}.",
        dir=destination.parent,
    )
    os.close(fd)
    temporary = Path(temporary_name)
    temporary.unlink()
    method = "copy"
    try:
        result = subprocess.run(
            ["cp", "-c", "-p", "--", str(source), str(temporary)],
            check=False,
            capture_output=True,
        )
        if result.returncode == 0:
            method = "apfs_clone"
        else:
            shutil.copy2(source, temporary)
        if sha256_file(temporary) != sha256_file(source):
            raise CaptureError(f"复制后 SHA-256 校验失败：{source}")
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)
    return method


def write_bytes_atomic(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def write_json_atomic(path: Path, payload: dict) -> None:
    data = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True).encode("utf-8")
    write_bytes_atomic(path, data + b"\n")


def safe_name(value: str) -> str:
    cleaned = "".join(
        "-" if char in '/\\:*?"<>|\n\r\t' else char
        for char in value.strip()
    )
    cleaned = "-".join(cleaned.split())
    while "--" in cleaned:
        cleaned = cleaned.replace("--", "-")
    return cleaned.strip("-.")[:80] or "未命名内容"


def asset_display(role: str, source: Path) -> tuple[str, str]:
    names = {
        "cover": ("封面", "正式封面"),
        "cover_horizontal": ("封面-横屏", "横屏封面"),
        "cover_vertical": ("封面-竖屏", "竖屏封面"),
        "cover_douyin": ("封面-抖音", "抖音封面"),
        "cover_xiaohongshu": ("封面-小红书", "小红书封面"),
        "cover_wechat_channels": ("封面-视频号", "视频号封面"),
        "image": ("图片", "正式图片"),
        "script_file": ("逐字稿附件", "逐字稿附件"),
    }
    stem, label = names.get(role, (safe_name(role), role))
    return f"{stem}{source.suffix.lower()}", label


def package_manifest_path(project: Path) -> Path:
    return project / ".system" / "manifest.json"


def load_package(project: Path) -> dict:
    path = package_manifest_path(project)
    if not path.is_file():
        raise CaptureError(f"待发布内容包缺少 manifest：{path}")
    return json.loads(path.read_text(encoding="utf-8"))


def list_pending(visible_root: Path) -> list[dict]:
    pending: list[dict] = []
    if not visible_root.exists():
        return pending
    for path in sorted(visible_root.glob("*/.system/manifest.json")):
        try:
            package = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if package.get("status") != "pending_closeout":
            continue
        pending.append(
            {
                "content_id": package.get("content_id"),
                "archive_key": package.get("archive_key"),
                "topic": package.get("topic"),
                "aliases": package.get("aliases", []),
                "fields": sorted(package.get("fields", {})),
                "assets": sorted(package.get("assets", {})),
                "updated_at": package.get("updated_at"),
                "project_dir": str(path.parents[1]),
            }
        )
    return pending


def find_project(visible_root: Path, content_id: str) -> Path:
    matches: list[Path] = []
    if visible_root.exists():
        for path in visible_root.glob("*/.system/manifest.json"):
            try:
                package = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if package.get("content_id") == content_id:
                matches.append(path.parents[1])
    if not matches:
        raise CaptureError(f"没有找到 content_id={content_id} 的待发布内容包")
    if len(matches) > 1:
        raise CaptureError(f"content_id={content_id} 对应多个目录，停止写入")
    return matches[0]


def render_markdown(package: dict) -> bytes:
    sections = {
        "title": "正式标题",
        "description": "正式简介",
        "cover_copy": "封面文字",
        "script": "完整逐字稿",
        "decision": "已确认决定",
    }
    lines = [
        f"# {package['topic']}",
        "",
        "> 状态：等待发布后收口",
        f"> 归档识别名：`{package['archive_key']}`",
        f"> 最近沉淀：{package['updated_at']}",
        "",
    ]
    for key, heading in sections.items():
        value = package.get("fields", {}).get(key)
        if value:
            lines.extend([f"## {heading}", "", value, ""])
    assets = package.get("assets", {})
    if assets:
        lines.extend(["## 已确认资产", ""])
        for role in sorted(assets):
            asset = assets[role]
            lines.append(f"- [{asset['label']}](./{asset['name']})")
        lines.append("")
    return "\n".join(lines).encode("utf-8")


def ensure_content_unedited(project: Path, package: dict) -> None:
    content = project / "内容.md"
    expected = package.get("content_sha256")
    if not expected:
        return
    if not content.is_file():
        raise CaptureError(f"内容.md 丢失，停止覆盖：{content}")
    actual = sha256_file(content)
    if actual != expected:
        raise CaptureError(f"内容.md 已被人工修改，停止覆盖：{content}")


def new_package(
    *,
    content_id: str,
    topic: str,
    confirmed_at: str,
    now: str,
) -> dict:
    try:
        date_prefix = datetime.fromisoformat(confirmed_at).date().isoformat()
    except (TypeError, ValueError):
        date_prefix = datetime.now().astimezone().date().isoformat()
    return {
        "schema_version": 2,
        "content_id": content_id,
        "archive_key": f"{date_prefix}-{safe_name(topic)}__{content_id[-6:]}",
        "status": "pending_closeout",
        "topic": topic,
        "aliases": [topic],
        "created_at": confirmed_at,
        "updated_at": now,
        "fields": {},
        "assets": {},
        "event_ids": [],
        "content_sha256": None,
    }


def capture(
    *,
    topic: str,
    fields: dict[str, str],
    assets: dict[str, str],
    inbox_root: Path,
    visible_root: Path = DEFAULT_VISIBLE_ROOT,
    content_id: str | None = None,
    new_content: bool = False,
    replace_fields: set[str] | None = None,
    replace_assets: set[str] | None = None,
    source_thread: str | None = None,
    source_cwd: str | None = None,
    confirmed_at: str | None = None,
) -> dict:
    topic = topic.strip()
    replace_fields = replace_fields or set()
    replace_assets = replace_assets or set()
    if not topic:
        raise CaptureError("topic 不能为空")
    if not fields and not assets:
        raise CaptureError("没有可沉淀的已确认内容或资产")
    if not replace_fields.issubset(fields):
        raise CaptureError("--replace-field 必须同时提供该字段的新值")
    if not replace_assets.issubset(assets):
        raise CaptureError("--replace-asset 必须同时提供该资产的新文件")
    if content_id and new_content:
        raise CaptureError("--content-id 与 --new-content 不能同时使用")

    now = datetime.now().astimezone().isoformat(timespec="seconds")
    confirmed = confirmed_at or now
    source_asset_facts: list[dict] = []
    for role, raw_path in sorted(assets.items()):
        source = Path(raw_path).expanduser().resolve(strict=True)
        if not source.is_file():
            raise CaptureError(f"资产不是普通文件：{source}")
        source_asset_facts.append(
            {
                "role": role,
                "source_path": str(source),
                "sha256": sha256_file(source),
                "bytes": source.stat().st_size,
            }
        )

    identity = {
        "topic": topic,
        "fields": dict(sorted(fields.items())),
        "assets": [
            {"role": item["role"], "sha256": item["sha256"]}
            for item in source_asset_facts
        ],
    }
    canonical = json.dumps(identity, ensure_ascii=False, sort_keys=True).encode("utf-8")
    event_id = f"chendian_{hashlib.sha256(canonical).hexdigest()[:20]}"
    central_receipt = inbox_root / "receipts" / f"{event_id}.json"
    existing_receipt = None
    if central_receipt.is_file():
        existing_receipt = json.loads(central_receipt.read_text(encoding="utf-8"))
    linked_content_id = (existing_receipt or {}).get("content_id")
    if content_id and linked_content_id and content_id != linked_content_id:
        raise CaptureError(
            f"event_id={event_id} 已属于 {linked_content_id}，禁止重复绑定到 {content_id}"
        )

    if content_id:
        project = find_project(visible_root, content_id)
        package = load_package(project)
        ensure_content_unedited(project, package)
    else:
        existing_content_id = (existing_receipt or {}).get("content_id")
        if existing_content_id:
            project = find_project(visible_root, existing_content_id)
            package = load_package(project)
            ensure_content_unedited(project, package)
            content_id = existing_content_id
        else:
            pending = list_pending(visible_root)
            if pending and not new_content:
                raise CaptureError(
                    "已有待发布内容包；必须明确提供 --content-id 或 --new-content，禁止静默拆分"
                )
            content_id = f"content_{event_id.removeprefix('chendian_')}"
            try:
                date_prefix = datetime.fromisoformat(confirmed).date().isoformat()
            except (TypeError, ValueError):
                date_prefix = datetime.now().astimezone().date().isoformat()
            visible_root.mkdir(parents=True, exist_ok=True)
            project = visible_root / f"{date_prefix}-{safe_name(topic)}"
            if project.exists():
                project = visible_root / f"{project.name}-{content_id[-6:]}"
            project.mkdir(parents=True)
            package = new_package(
                content_id=content_id,
                topic=topic,
                confirmed_at=confirmed,
                now=now,
            )

    if not package.get("archive_key"):
        try:
            key_date = datetime.fromisoformat(
                package.get("created_at") or confirmed
            ).date().isoformat()
        except (TypeError, ValueError):
            key_date = datetime.now().astimezone().date().isoformat()
        package["archive_key"] = (
            f"{key_date}-{safe_name(package.get('topic') or topic)}__{content_id[-6:]}"
        )

    if event_id in package.get("event_ids", []):
        return {
            "event_id": event_id,
            "content_id": content_id,
            "receipt_path": str(central_receipt),
            "visible_dir": str(project),
            "content_path": str(project / "内容.md"),
            "asset_count": len(source_asset_facts),
            "field_count": len(fields),
            "duplicate": True,
        }

    for key, value in fields.items():
        current = package["fields"].get(key)
        if current is not None and current != value and key not in replace_fields:
            raise CaptureError(f"字段 {key} 已有不同定稿；未明确替换，停止写入")
    for asset in source_asset_facts:
        current = package["assets"].get(asset["role"])
        if (
            current is not None
            and current.get("sha256") != asset["sha256"]
            and asset["role"] not in replace_assets
        ):
            raise CaptureError(
                f"资产位 {asset['role']} 已有不同文件；请改用横竖屏角色或明确替换"
            )

    visible_assets: list[dict] = []
    for asset in source_asset_facts:
        source = Path(asset["source_path"])
        stable = inbox_root / "assets" / asset["sha256"] / source.name
        storage_method = clone_or_copy(source, stable)
        name, label = asset_display(asset["role"], source)
        visible = project / name
        clone_or_copy(stable, visible, replace=asset["role"] in replace_assets)
        visible_assets.append(
            {
                **asset,
                "stored_path": str(stable),
                "storage_method": storage_method,
                "name": name,
                "label": label,
                "event_id": event_id,
            }
        )

    package["updated_at"] = now
    if topic not in package["aliases"]:
        package["aliases"].append(topic)
    package["aliases"] = sorted(package["aliases"])
    for key, value in fields.items():
        package["fields"][key] = value
    for asset in visible_assets:
        package["assets"][asset["role"]] = {
            key: asset[key]
            for key in (
                "name",
                "label",
                "sha256",
                "bytes",
                "stored_path",
                "event_id",
            )
        }
    package["event_ids"].append(event_id)

    receipt = {
        "schema_version": 2,
        "event_id": event_id,
        "content_id": content_id,
        "archive_key": package["archive_key"],
        "status": "pending_closeout",
        "topic": topic,
        "confirmed_at": confirmed,
        "captured_at": now,
        "fields": dict(sorted(fields.items())),
        "assets": visible_assets,
        "source": {
            "thread_id": source_thread,
            "cwd": str(Path(source_cwd or os.getcwd()).resolve()),
        },
        "visible_dir": str(project),
    }

    rendered = render_markdown(package)
    package["content_sha256"] = sha256_bytes(rendered)
    write_bytes_atomic(project / "内容.md", rendered)
    write_json_atomic(package_manifest_path(project), package)
    write_json_atomic(project / ".system" / "receipts" / f"{event_id}.json", receipt)
    write_json_atomic(central_receipt, receipt)

    return {
        "event_id": event_id,
        "content_id": content_id,
        "receipt_path": str(central_receipt),
        "visible_dir": str(project),
        "content_path": str(project / "内容.md"),
        "asset_count": len(source_asset_facts),
        "field_count": len(fields),
        "duplicate": False,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="沉淀当前会话中已明确确认的文字与资产。",
    )
    parser.add_argument("--list-pending", action="store_true")
    parser.add_argument("--topic")
    parser.add_argument("--content-id")
    parser.add_argument("--new-content", action="store_true")
    parser.add_argument("--field", action="append", default=[], metavar="KEY=VALUE")
    parser.add_argument("--asset", action="append", default=[], metavar="ROLE=PATH")
    parser.add_argument("--replace-field", action="append", default=[])
    parser.add_argument("--replace-asset", action="append", default=[])
    parser.add_argument("--source-thread")
    parser.add_argument("--source-cwd")
    parser.add_argument("--confirmed-at")
    parser.add_argument("--inbox-root", type=Path, default=DEFAULT_INBOX)
    parser.add_argument("--visible-root", type=Path, default=DEFAULT_VISIBLE_ROOT)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    visible_root = args.visible_root.expanduser().resolve()
    if args.list_pending:
        print(json.dumps(list_pending(visible_root), ensure_ascii=False, sort_keys=True))
        return 0
    if not args.topic:
        parser.error("沉淀内容时必须提供 --topic")
    try:
        result = capture(
            topic=args.topic,
            fields=parse_pairs(args.field, allowed=ALLOWED_FIELDS),
            assets=parse_pairs(args.asset),
            inbox_root=args.inbox_root.expanduser().resolve(),
            visible_root=visible_root,
            content_id=args.content_id,
            new_content=args.new_content,
            replace_fields=set(args.replace_field),
            replace_assets=set(args.replace_asset),
            source_thread=args.source_thread,
            source_cwd=args.source_cwd,
            confirmed_at=args.confirmed_at,
        )
    except (CaptureError, FileNotFoundError, json.JSONDecodeError) as exc:
        parser.error(str(exc))
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
