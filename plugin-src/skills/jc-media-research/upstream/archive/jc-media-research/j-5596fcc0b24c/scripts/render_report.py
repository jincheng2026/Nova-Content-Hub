#!/usr/bin/env python3
"""Render normalized content research as a self-contained HTML brief."""

from __future__ import annotations

import argparse
from datetime import datetime
import html
import json
import math
from pathlib import Path
import re
import sys
from typing import Any, Mapping, Sequence
from urllib.parse import urlsplit, urlunsplit


DEFAULT_TITLE = "低粉爆款选题研究简报"

FUNNEL_LABELS = {
    "input": "输入样本",
    "deduplicated": "去重后",
    "directly_relevant": "直接相关",
    "followers_100_to_20000": "粉丝 100–20,000",
    "likes_at_least_1000": "点赞至少 1,000",
}

ELIGIBILITY_LABELS = {
    "eligible_low_follower_viral": "符合低粉爆款门槛",
    "anomaly_low_followers": "粉丝过低，列为异常观察",
    "regular_viral_reference": "账号粉丝超出低粉范围",
    "unverified_low_likes": "点赞未达到爆款门槛",
    "adjacent": "相邻主题",
    "off_topic": "与研究方向无直接关系",
    "missing_evidence": "关键证据缺失",
}

EXCLUSION_LABELS = {
    "platform_gate_not_confirmed": "该平台尚无已确认的低粉爆款门槛",
    "missing_content_id": "缺少作品 ID",
    "missing_relevance_judgment": "缺少相关性判断",
    "not_directly_relevant": "与研究方向不直接相关",
    "missing_follower_count": "缺少粉丝数",
    "followers_below_100_anomaly": "粉丝少于 100，归入异常观察",
    "followers_above_20000_reference_only": "粉丝超过 20,000，仅作普通爆款参考",
    "missing_like_count": "缺少点赞数",
    "likes_below_1000_unverified": "点赞少于 1,000，未达到爆款门槛",
}

SENSITIVE_TEXT_PATTERNS = (
    re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/-]{8,}={0,2}\b"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{12,}\b"),
    re.compile(
        r"(?i)\b(?:api[_-]?key|access[_-]?token|authentication[_-]?token|"
        r"authorization|cookie|decode[_-]?key|password|secret)\s*[:=]\s*"
        r"[\"']?[^\s,;\"']{4,}"
    ),
)

ABSOLUTE_PATH_PATTERNS = (
    re.compile(r"/Users/[A-Za-z0-9._-]+(?:/[^\s<>\"']+)+"),
    re.compile(r"/home/[A-Za-z0-9._-]+(?:/[^\s<>\"']+)+"),
    re.compile(r"[A-Za-z]:\\Users\\[^\s<>\"']+(?:\\[^\s<>\"']+)+"),
    re.compile(r"(?i)file://(?:localhost)?/[^\s<>\"']+"),
)

SENSITIVE_QUERY_KEYS = frozenset(
    {
        "access_token",
        "auth",
        "authorization",
        "cookie",
        "decode_key",
        "key",
        "secret",
        "session",
        "sign",
        "signature",
        "token",
        "x-signature",
    }
)


class ReportError(RuntimeError):
    """An input cannot be rendered safely as a content report."""


def _nonnegative_int(value: Any, fallback: int = 0) -> int:
    if isinstance(value, bool):
        return fallback
    try:
        parsed = int(value)
    except (TypeError, ValueError, OverflowError):
        return fallback
    return parsed if parsed >= 0 else fallback


def _redact_text(value: Any, *, fallback: str = "未提供") -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    if not text:
        return fallback
    for pattern in ABSOLUTE_PATH_PATTERNS:
        text = pattern.sub("【已隐藏本机路径】", text)
    for pattern in SENSITIVE_TEXT_PATTERNS:
        text = pattern.sub("【已隐藏敏感信息】", text)
    return text


def _escape(value: Any, *, fallback: str = "未提供") -> str:
    return html.escape(_redact_text(value, fallback=fallback), quote=True)


def _safe_source_url(value: Any) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = urlsplit(value.strip())
    except ValueError:
        return None
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
    ):
        return None
    if parsed.query:
        query_keys = {
            item.split("=", 1)[0].lower()
            for item in parsed.query.split("&")
            if item
        }
        if query_keys & SENSITIVE_QUERY_KEYS:
            return None
    # Normalized platform links do not need query strings or fragments. Removing
    # both prevents tracking and temporary signatures from entering the report.
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", ""))


def _format_number(value: Any) -> str:
    if value is None or isinstance(value, bool):
        return "—"
    try:
        return f"{int(value):,}"
    except (TypeError, ValueError, OverflowError):
        return "—"


def _format_date(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        return "未提供"
    text = value.strip()
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return _redact_text(text)
    return parsed.strftime("%Y-%m-%d")


def _source_link(record: Mapping[str, Any], label: str = "查看来源") -> str:
    url = _safe_source_url(record.get("source_url"))
    if not url:
        return '<span class="source-missing">来源链接缺失</span>'
    return (
        f'<a class="source-link" href="{html.escape(url, quote=True)}" '
        f'target="_blank" rel="noopener noreferrer">{html.escape(label)} ↗</a>'
    )


def _metric(label: str, value: Any) -> str:
    return (
        '<div class="metric">'
        f'<span class="metric-label">{html.escape(label)}</span>'
        f'<strong>{html.escape(_format_number(value))}</strong>'
        "</div>"
    )


def _record_title(record: Mapping[str, Any]) -> str:
    title = record.get("title") or record.get("caption")
    return _redact_text(title, fallback="未命名作品")


def _display_title(record: Mapping[str, Any]) -> str:
    original = _record_title(record)
    without_hashtags = re.split(r"\s+#", original, maxsplit=1)[0].strip()
    return without_hashtags or original


def _eligible_rank(record: Mapping[str, Any]) -> int:
    rank = _nonnegative_int(record.get("eligible_rank"), 10**9)
    return rank if rank > 0 else 10**9


def _recency_sort_key(record: Mapping[str, Any]) -> tuple[int, int, str]:
    within_90_days = record.get("within_preferred_90_days")
    recency_order = 0 if within_90_days is True else 1 if within_90_days is False else 2
    return (
        recency_order,
        _eligible_rank(record),
        str(record.get("content_id") or ""),
    )


def _recency_badge(record: Mapping[str, Any]) -> tuple[str, str, str]:
    within_90_days = record.get("within_preferred_90_days")
    age_value = record.get("age_days_at_research")
    age_days = (
        int(age_value)
        if isinstance(age_value, (int, float))
        and not isinstance(age_value, bool)
        and age_value >= 0
        else None
    )
    age_text = f"距研究日 {age_days} 天" if age_days is not None else "天数待验证"
    if within_90_days is True:
        return "90 天内", "recent", age_text
    if within_90_days is False:
        return "超 90 天", "older", age_text
    return "时间待验证", "unknown", age_text


def _eligible_card(record: Mapping[str, Any]) -> str:
    recency_label, recency_class, age_text = _recency_badge(record)
    metrics = "".join(
        (
            _metric("粉丝", record.get("follower_count")),
            _metric("点赞", record.get("like_count")),
            _metric("收藏", record.get("collect_count")),
            _metric("分享", record.get("share_count")),
        )
    )
    original_title = _record_title(record)
    return f"""
      <article class="topic-card topic-card--{recency_class}" data-recency="{recency_class}">
        <div class="topic-main">
          <div class="topic-meta">
            <span class="recency-badge recency-badge--{recency_class}">{_escape(recency_label)}</span>
            <span class="age-label">{_escape(age_text)}</span>
            <span class="published-label">发布于 {_escape(_format_date(record.get('published_at')))}</span>
          </div>
          <h3>{_escape(_display_title(record))}</h3>
          <p class="byline">{_escape(record.get('author_name'), fallback='作者未提供')}</p>
          <details class="original-title">
            <summary>查看原始标题</summary>
            <p>{_escape(original_title)}</p>
          </details>
          <p class="reason"><span>为什么入选</span>{_escape(record.get('relevance_reason'), fallback='相关性理由未提供')}</p>
          <div class="metrics" aria-label="透明原始指标">{metrics}</div>
          <p class="secondary-metric">评论 <strong>{html.escape(_format_number(record.get('comment_count')))}</strong> · 评论只作次级观察，不参与硬门槛</p>
          <div class="topic-footer">
            <span class="qualified-label">{html.escape(ELIGIBILITY_LABELS['eligible_low_follower_viral'])}</span>
            {_source_link(record, '打开原始作品')}
          </div>
        </div>
      </article>
    """


def _reason_labels(record: Mapping[str, Any]) -> list[str]:
    reasons = record.get("exclusion_reasons")
    if not isinstance(reasons, list):
        reasons = []
    labels = [EXCLUSION_LABELS.get(str(reason), _redact_text(reason)) for reason in reasons]
    if not labels:
        eligibility = str(record.get("eligibility") or "missing_evidence")
        labels = [ELIGIBILITY_LABELS.get(eligibility, "未通过筛选")]
    return labels


def _excluded_card(record: Mapping[str, Any], *, closest: bool = False) -> str:
    eligibility = str(record.get("eligibility") or "missing_evidence")
    reason_text = "；".join(_reason_labels(record))
    closest_label = '<span class="closest-label">接近粉丝上限</span>' if closest else ""
    return f"""
      <article class="excluded-card{' excluded-card--closest' if closest else ''}">
        <div class="excluded-topline">
          <span class="excluded-label">{_escape(ELIGIBILITY_LABELS.get(eligibility, '未通过筛选'))}</span>
          {closest_label}
        </div>
        <h3>{_escape(_record_title(record))}</h3>
        <p class="excluded-metrics"><span>粉丝 <strong>{html.escape(_format_number(record.get('follower_count')))}</strong></span><span>点赞 <strong>{html.escape(_format_number(record.get('like_count')))}</strong></span></p>
        <p class="excluded-reason">{_escape(reason_text)}</p>
        <div class="excluded-footer"><span>{_escape(record.get('author_name'), fallback='作者未提供')}</span>{_source_link(record)}</div>
      </article>
    """


def _follower_ceiling(payload: Mapping[str, Any]) -> int:
    gate = payload.get("gate") if isinstance(payload.get("gate"), Mapping) else {}
    return _nonnegative_int(gate.get("followers_max_inclusive"), 20_000)


def _closest_exclusions(
    records: Sequence[Mapping[str, Any]], payload: Mapping[str, Any], limit: int = 3
) -> list[Mapping[str, Any]]:
    ceiling = _follower_ceiling(payload)

    def key(record: Mapping[str, Any]) -> tuple[int, int, int, str]:
        followers = record.get("follower_count")
        if isinstance(followers, (int, float)) and not isinstance(followers, bool):
            parsed = max(0, int(followers))
            return (
                0,
                abs(parsed - ceiling),
                -_nonnegative_int(record.get("like_count")),
                str(record.get("content_id") or ""),
            )
        return (1, 10**18, 0, str(record.get("content_id") or ""))

    return sorted(records, key=key)[:limit]


def _all_exclusions_details(records: Sequence[Mapping[str, Any]]) -> str:
    if not records:
        return '<p class="empty-state">当前文件没有逐条排除记录。</p>'
    cards = "".join(_excluded_card(record) for record in records)
    return f"""
      <details class="all-exclusions">
        <summary><span>查看全部排除明细</span><strong>{len(records)} 条</strong></summary>
        <div class="excluded-detail-grid">{cards}</div>
      </details>
    """


def _aggregate_exclusions(summary: Mapping[str, Any]) -> str:
    counts = summary.get("exclusion_counts")
    if not isinstance(counts, Mapping) or not counts:
        return ""
    items: list[str] = []
    for reason, count in sorted(counts.items(), key=lambda pair: (-_nonnegative_int(pair[1]), str(pair[0]))):
        label = EXCLUSION_LABELS.get(str(reason), _redact_text(reason))
        items.append(
            '<li><span>'
            f'{_escape(label)}</span><strong>{_nonnegative_int(count)}</strong></li>'
        )
    return (
        '<aside class="exclusion-summary"><h3>排除原因汇总</h3>'
        f'<ul>{"".join(items)}</ul></aside>'
    )


def _chart_number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    if not math.isfinite(parsed) or parsed < 0:
        return None
    return parsed


def _normalized_funnel(summary: Mapping[str, Any]) -> list[tuple[str, int]]:
    rows = summary.get("funnel")
    if not isinstance(rows, list) or not rows:
        rows = [
            {"stage": "input", "count": _nonnegative_int(summary.get("input_rows"))},
            {
                "stage": "deduplicated",
                "count": _nonnegative_int(summary.get("deduplicated_rows")),
            },
            {
                "stage": "likes_at_least_1000",
                "count": _nonnegative_int(summary.get("eligible_rows")),
            },
        ]
    normalized: list[tuple[str, int]] = []
    for item in rows:
        if not isinstance(item, Mapping):
            continue
        stage = str(item.get("stage") or "unknown")
        normalized.append((stage, _nonnegative_int(item.get("count"))))
    if not normalized:
        normalized = [("input", 0)]
    return normalized


def _funnel_svg(summary: Mapping[str, Any]) -> str:
    rows = _normalized_funnel(summary)
    maximum = max((count for _, count in rows), default=0)
    width = 680
    center = 365
    top = 34
    layer_height = 52
    gap = 12
    max_shape_width = 350
    height = top + len(rows) * (layer_height + gap) + 20
    polygons: list[str] = []
    labels: list[str] = []

    def shape_width(count: int) -> float:
        return 0.0 if maximum == 0 else max_shape_width * count / maximum

    for index, (stage, count) in enumerate(rows):
        next_count = rows[index + 1][1] if index + 1 < len(rows) else count
        top_width = shape_width(count)
        bottom_width = shape_width(next_count)
        y1 = top + index * (layer_height + gap)
        y2 = y1 + layer_height
        points = " ".join(
            (
                f"{center - top_width / 2:.2f},{y1}",
                f"{center + top_width / 2:.2f},{y1}",
                f"{center + bottom_width / 2:.2f},{y2}",
                f"{center - bottom_width / 2:.2f},{y2}",
            )
        )
        stage_attr = html.escape(stage, quote=True)
        polygons.append(
            f'<polygon class="funnel-shape funnel-shape--{index % 4 + 1}" '
            f'data-stage="{stage_attr}" data-count="{count}" points="{points}"/>'
        )
        label = FUNNEL_LABELS.get(stage, _redact_text(stage))
        retention = 0 if maximum == 0 else round(count / maximum * 100)
        labels.append(
            f'<text class="chart-label" x="12" y="{y1 + 31}">{_escape(label)}</text>'
            f'<text class="chart-value" x="650" y="{y1 + 31}" text-anchor="end">'
            f'{count} · {retention}%</text>'
        )

    return (
        f'<svg class="chart-svg" data-chart-svg="selection-funnel" '
        f'data-stage-count="{len(rows)}" viewBox="0 0 {width} {height}" '
        'role="img" aria-labelledby="funnel-svg-title funnel-svg-desc">'
        '<title id="funnel-svg-title">筛选漏斗</title>'
        '<desc id="funnel-svg-desc">每层宽度按该阶段相对输入样本的真实数量计算，右侧显示数量和保留率。</desc>'
        f'{"".join(polygons)}{"".join(labels)}</svg>'
    )


def _scatter_points(records: Sequence[Mapping[str, Any]]) -> list[tuple[Mapping[str, Any], float, float]]:
    points: list[tuple[Mapping[str, Any], float, float]] = []
    for record in records:
        followers = _chart_number(record.get("follower_count"))
        likes = _chart_number(record.get("like_count"))
        if followers is None or likes is None:
            continue
        points.append((record, followers, likes))
    return points


def _compact_axis_number(value: float) -> str:
    if value >= 1_000_000:
        return f"{value / 1_000_000:g}m"
    if value >= 1_000:
        return f"{value / 1_000:g}k"
    return f"{value:g}"


def _axis_ticks(maximum: float) -> list[float]:
    candidates = (0, 100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000, 100_000_000)
    ticks = [value for value in candidates if value <= maximum]
    if not ticks:
        return [0]
    if ticks[-1] < maximum and len(ticks) < 8:
        ticks.append(maximum)
    return ticks


def _scatter_svg(records: Sequence[Mapping[str, Any]], payload: Mapping[str, Any]) -> str:
    points = _scatter_points(records)
    gate = payload.get("gate") if isinstance(payload.get("gate"), Mapping) else {}
    followers_min = _chart_number(gate.get("followers_min_inclusive")) or 100.0
    followers_max = _chart_number(gate.get("followers_max_inclusive")) or 20_000.0
    likes_min = _chart_number(gate.get("likes_min_inclusive")) or 1_000.0
    x_max = max([followers_max, *(followers for _, followers, _ in points)], default=followers_max)
    y_max = max([likes_min, *(likes for _, _, likes in points)], default=likes_min)
    x_domain = max(1.0, math.log10(x_max + 1.0))
    y_domain = max(1.0, math.log10(y_max + 1.0))
    left, right, top, bottom = 72.0, 622.0, 28.0, 300.0

    def x_position(value: float) -> float:
        return left + math.log10(value + 1.0) / x_domain * (right - left)

    def y_position(value: float) -> float:
        return bottom - math.log10(value + 1.0) / y_domain * (bottom - top)

    grid: list[str] = []
    for tick in _axis_ticks(x_max):
        x = x_position(tick)
        grid.append(
            f'<line class="chart-grid-line" x1="{x:.2f}" y1="{top}" x2="{x:.2f}" y2="{bottom}"/>'
            f'<text class="chart-tick" x="{x:.2f}" y="326" text-anchor="middle">{_compact_axis_number(tick)}</text>'
        )
    for tick in _axis_ticks(y_max):
        y = y_position(tick)
        grid.append(
            f'<line class="chart-grid-line" x1="{left}" y1="{y:.2f}" x2="{right}" y2="{y:.2f}"/>'
            f'<text class="chart-tick" x="62" y="{y + 4:.2f}" text-anchor="end">{_compact_axis_number(tick)}</text>'
        )

    gates = (
        f'<line class="gate-line gate-line--follower-min" x1="{x_position(followers_min):.2f}" y1="{top}" '
        f'x2="{x_position(followers_min):.2f}" y2="{bottom}"/>'
        f'<line class="gate-line gate-line--follower-max" x1="{x_position(followers_max):.2f}" y1="{top}" '
        f'x2="{x_position(followers_max):.2f}" y2="{bottom}"/>'
        f'<line class="gate-line gate-line--likes-min" x1="{left}" y1="{y_position(likes_min):.2f}" '
        f'x2="{right}" y2="{y_position(likes_min):.2f}"/>'
    )

    circles: list[str] = []
    qualified_count = 0
    for index, (record, followers, likes) in enumerate(points, start=1):
        qualified = record.get("qualified") is True
        qualified_count += int(qualified)
        point_class = "eligible" if qualified else "excluded"
        title = (
            f"样本 {index}；粉丝 {_format_number(followers)}；"
            f"点赞 {_format_number(likes)}；{'合格' if qualified else '排除'}"
        )
        circles.append(
            f'<circle class="scatter-point scatter-point--{point_class}" data-point="{index}" '
            f'cx="{x_position(followers):.2f}" cy="{y_position(likes):.2f}" r="6">'
            f'<title>{_escape(title)}</title></circle>'
        )

    empty_note = ""
    if not points:
        empty_note = '<text class="chart-empty" x="347" y="168" text-anchor="middle">可用数据点为 0：缺少粉丝数或点赞数</text>'
    elif len(points) == 1:
        empty_note = '<text class="chart-empty" x="347" y="18" text-anchor="middle">只有 1 个有效点，仅作定位，不判断分布</text>'

    return (
        '<svg class="chart-svg" data-chart-svg="followers-likes-scatter" '
        f'data-point-count="{len(points)}" data-qualified-count="{qualified_count}" '
        f'data-excluded-count="{len(points) - qualified_count}" viewBox="0 0 650 350" '
        'role="img" aria-labelledby="scatter-svg-title scatter-svg-desc">'
        '<title id="scatter-svg-title">粉丝数与点赞数散点图</title>'
        '<desc id="scatter-svg-desc">横轴为采集时粉丝数，纵轴为采集时点赞数，均使用 log10(value+1) 对数坐标；绿色为合格样本，琥珀色为排除样本。</desc>'
        f'{"".join(grid)}{gates}{"".join(circles)}{empty_note}'
        '<text class="chart-axis-label" x="347" y="347" text-anchor="middle">采集时粉丝数 · 对数轴</text>'
        '<text class="chart-axis-label" x="14" y="164" text-anchor="middle" transform="rotate(-90 14 164)">采集时点赞数 · 对数轴</text>'
        '</svg>'
    )


def _follower_tiers(records: Sequence[Mapping[str, Any]]) -> tuple[list[tuple[str, str, int]], int, int]:
    counts = {"low": 0, "small": 0, "medium": 0, "large": 0}
    below_minimum = 0
    missing = 0
    for record in records:
        followers = _chart_number(record.get("follower_count"))
        if followers is None:
            missing += 1
        elif followers < 100:
            below_minimum += 1
        elif followers <= 20_000:
            counts["low"] += 1
        elif followers <= 100_000:
            counts["small"] += 1
        elif followers <= 1_000_000:
            counts["medium"] += 1
        else:
            counts["large"] += 1
    tiers = [
        ("low", "100–20,000", counts["low"]),
        ("small", "20,001–100,000", counts["small"]),
        ("medium", "100,001–1,000,000", counts["medium"]),
        ("large", "1,000,001 以上", counts["large"]),
    ]
    return tiers, below_minimum, missing


def _follower_tiers_svg(records: Sequence[Mapping[str, Any]]) -> str:
    tiers, below_minimum, missing = _follower_tiers(records)
    maximum = max((count for _, _, count in tiers), default=0)
    center = 405.0
    max_width = 360.0
    polygons: list[str] = []
    labels: list[str] = []
    for index, (key, label, count) in enumerate(tiers):
        y1 = 34 + index * 68
        y2 = y1 + 46
        tier_width = 0.0 if maximum == 0 else max_width * count / maximum
        slope = min(16.0, tier_width / 5)
        points = " ".join(
            (
                f"{center - tier_width / 2 + slope:.2f},{y1}",
                f"{center + tier_width / 2 - slope:.2f},{y1}",
                f"{center + tier_width / 2:.2f},{y2}",
                f"{center - tier_width / 2:.2f},{y2}",
            )
        )
        polygons.append(
            f'<polygon class="tier-shape tier-shape--{index + 1}" data-tier="{key}" '
            f'data-count="{count}" points="{points}"/>'
        )
        labels.append(
            f'<text class="chart-label" x="12" y="{y1 + 29}">{_escape(label)}</text>'
            f'<text class="chart-value" x="620" y="{y1 + 29}" text-anchor="end">{count} 条</text>'
        )
    tiered_count = sum(count for _, _, count in tiers)
    empty_note = ""
    if tiered_count == 0:
        empty_note = '<text class="chart-empty" x="405" y="304" text-anchor="middle">没有可进入分层的粉丝数记录</text>'
    note = f"进入分层 {tiered_count} 条；低于 100 粉 {below_minimum} 条；粉丝字段缺失 {missing} 条"
    return (
        '<svg class="chart-svg" data-chart-svg="follower-tiers" '
        f'data-tiered-count="{tiered_count}" data-below-minimum-count="{below_minimum}" '
        f'data-missing-count="{missing}" viewBox="0 0 640 330" '
        'role="img" aria-labelledby="tiers-svg-title tiers-svg-desc">'
        '<title id="tiers-svg-title">粉丝体量分层梯形图</title>'
        '<desc id="tiers-svg-desc">每个梯形代表一个粉丝体量区间，宽度按该区间真实记录数计算；这些区间不是筛选流失步骤。</desc>'
        f'{"".join(polygons)}{"".join(labels)}{empty_note}'
        f'<text class="chart-footnote" x="12" y="323">{_escape(note)}</text></svg>'
    )


def _exclusion_reasons(summary: Mapping[str, Any]) -> list[tuple[str, str, int]]:
    counts = summary.get("exclusion_counts")
    if not isinstance(counts, Mapping):
        return []
    rows: list[tuple[str, str, int]] = []
    for reason, raw_count in counts.items():
        count = _nonnegative_int(raw_count)
        if count <= 0:
            continue
        reason_text = str(reason)
        rows.append((reason_text, EXCLUSION_LABELS.get(reason_text, _redact_text(reason_text)), count))
    return sorted(rows, key=lambda row: (-row[2], row[0]))


def _exclusion_reasons_svg(summary: Mapping[str, Any]) -> str:
    rows = _exclusion_reasons(summary)
    if not rows:
        return (
            '<svg class="chart-svg" data-chart-svg="exclusion-reasons" data-bar-count="0" '
            'viewBox="0 0 640 260" role="img" aria-labelledby="reasons-svg-title reasons-svg-desc">'
            '<title id="reasons-svg-title">排除原因条形图</title>'
            '<desc id="reasons-svg-desc">本次 summary 没有大于 0 的排除原因数量。</desc>'
            '<line class="chart-axis" x1="210" y1="52" x2="610" y2="52"/>'
            '<text class="chart-empty" x="410" y="142" text-anchor="middle">排除原因数量为 0，没有绘制假条形</text>'
            '</svg>'
        )
    maximum = max(count for _, _, count in rows)
    row_height = 54
    height = 42 + len(rows) * row_height + 38
    bars: list[str] = []
    for index, (reason, label, count) in enumerate(rows):
        y = 34 + index * row_height
        bar_width = 360 * count / maximum
        bars.append(
            f'<text class="chart-label" x="12" y="{y + 22}">{_escape(label)}</text>'
            f'<rect class="reason-bar" data-reason="{html.escape(reason, quote=True)}" '
            f'data-count="{count}" x="225" y="{y}" width="{bar_width:.2f}" height="30"/>'
            f'<text class="chart-value" x="610" y="{y + 22}" text-anchor="end">{count}</text>'
        )
    return (
        '<svg class="chart-svg" data-chart-svg="exclusion-reasons" '
        f'data-bar-count="{len(rows)}" viewBox="0 0 640 {height}" '
        'role="img" aria-labelledby="reasons-svg-title reasons-svg-desc">'
        '<title id="reasons-svg-title">排除原因条形图</title>'
        '<desc id="reasons-svg-desc">条形长度来自 summary.exclusion_counts，各原因按数量从高到低排列。</desc>'
        f'{"".join(bars)}</svg>'
    )


def _funnel(summary: Mapping[str, Any]) -> str:
    normalized = _normalized_funnel(summary)
    maximum = max((count for _, count in normalized), default=0)
    funnel_rows = []
    for stage, count in normalized:
        width = 0 if maximum == 0 else max(2 if count else 0, round(count / maximum * 100))
        label = FUNNEL_LABELS.get(stage, _redact_text(stage))
        funnel_rows.append(
            '<li class="funnel-row" data-stage="'
            f'{html.escape(stage, quote=True)}">'
            f'<div class="funnel-copy"><span>{_escape(label)}</span><strong>{count}</strong></div>'
            '<div class="funnel-track" aria-hidden="true">'
            f'<span style="width:{width}%"></span></div></li>'
        )
    return "".join(funnel_rows)


def _scope_items(payload: Mapping[str, Any]) -> str:
    gate = payload.get("gate") if isinstance(payload.get("gate"), Mapping) else {}
    platform = gate.get("platform") or "douyin"
    followers_min = _format_number(gate.get("followers_min_inclusive", 100))
    followers_max = _format_number(gate.get("followers_max_inclusive", 20_000))
    likes_min = _format_number(gate.get("likes_min_inclusive", 1_000))
    preferred_days = _format_number(gate.get("preferred_age_days", 90))
    values = (
        ("平台", platform),
        ("粉丝门槛", f"{followers_min}–{followers_max}"),
        ("点赞门槛", f"至少 {likes_min}"),
        ("相关性", "内容主体必须直接相关"),
        ("时间偏好", f"最近 {preferred_days} 天优先，不是硬门槛"),
        ("研究时间", _format_date(payload.get("as_of"))),
        ("去重方式", "同平台作品 ID；同作品保留最新采集快照"),
        ("展示顺序", "90 天内优先，其次沿用 normalized 数据的合格顺序"),
    )
    return "".join(
        f'<div class="scope-item"><dt>{_escape(label)}</dt><dd>{_escape(value)}</dd></div>'
        for label, value in values
    )


def _visible_limits() -> str:
    items = (
        "粉丝数和互动数是采集时快照，不能反推作品发布当时的数据。",
        "最近 90 天只影响展示优先级，不替代粉丝、点赞和直接相关三项硬门槛。",
        "评论只作次级观察；缺少可靠字段的样本不会被写成已验证低粉爆款。",
        "报告只展示 normalized 白名单字段，不包含原始响应、本地文件位置或临时签名参数。",
    )
    return "".join(f"<li>{_escape(item)}</li>" for item in items)


def _unique_sources(records: Sequence[Mapping[str, Any]]) -> str:
    seen: set[str] = set()
    items: list[str] = []
    for record in records:
        url = _safe_source_url(record.get("source_url"))
        if not url or url in seen:
            continue
        seen.add(url)
        label = _record_title(record)
        items.append(
            '<li><a href="'
            f'{html.escape(url, quote=True)}" target="_blank" rel="noopener noreferrer">'
            f'{_escape(label)}</a><span>{_escape(urlsplit(url).hostname or "来源")}</span></li>'
        )
    if not items:
        return '<p class="empty-state">本次数据没有可公开的来源链接。</p>'
    return f'<ol class="source-list">{"".join(items)}</ol>'


def render_report(payload: Mapping[str, Any], title: str | None = None) -> str:
    """Return one responsive, self-contained HTML report."""
    if not isinstance(payload, Mapping):
        raise ReportError("normalized content JSON 顶层必须是对象")
    raw_records = payload.get("records")
    if not isinstance(raw_records, list):
        raise ReportError("normalized content JSON 必须包含 records 数组")
    records: list[Mapping[str, Any]] = [
        item for item in raw_records if isinstance(item, Mapping)
    ]
    summary = payload.get("summary") if isinstance(payload.get("summary"), Mapping) else {}

    eligible = sorted(
        [record for record in records if record.get("qualified") is True],
        key=_recency_sort_key,
    )
    excluded = [record for record in records if record.get("qualified") is not True]

    deduplicated_rows = _nonnegative_int(summary.get("deduplicated_rows"), len(records))
    input_rows = _nonnegative_int(summary.get("input_rows"), deduplicated_rows)
    eligible_rows = _nonnegative_int(summary.get("eligible_rows"), len(eligible))
    excluded_rows = _nonnegative_int(
        summary.get("excluded_rows"), max(0, deduplicated_rows - eligible_rows)
    )
    duplicates_removed = _nonnegative_int(
        summary.get("duplicates_removed"), max(0, input_rows - deduplicated_rows)
    )

    report_title = _redact_text(title, fallback=DEFAULT_TITLE) if title else DEFAULT_TITLE
    if eligible_rows and eligible:
        recent_rows = sum(
            record.get("within_preferred_90_days") is True for record in eligible
        )
        older_rows = sum(
            record.get("within_preferred_90_days") is False for record in eligible
        )
        recency_summary = f"其中 {recent_rows} 条在 90 天内"
        if older_rows:
            recency_summary += f"，{older_rows} 条超过 90 天"
        conclusion = (
            f"本轮从 {input_rows} 条输入中去重得到 {deduplicated_rows} 条，"
            f"最终有 {eligible_rows} 条同时达到粉丝、点赞和直接相关门槛。"
            f"{recency_summary}；报告先展示时效更近的样本，不把历史高数据误当成当前优先级。"
        )
    elif eligible_rows:
        conclusion = (
            f"本轮从 {input_rows} 条输入中去重得到 {deduplicated_rows} 条，"
            f"共有 {eligible_rows} 条通过硬门槛；当前文件只保留了汇总数据，未附合格记录明细。"
        )
    else:
        conclusion = (
            f"本轮从 {input_rows} 条输入中去重得到 {deduplicated_rows} 条，"
            "没有样本同时通过粉丝、点赞和直接相关门槛。"
            "报告保留真实筛选漏斗和排除原因，不降低标准凑数。"
        )

    topic_cards = "".join(_eligible_card(record) for record in eligible)
    if not topic_cards:
        topic_cards = (
            '<div class="empty-state empty-state--large">'
            '<strong>本轮没有合格选题</strong>'
            '<span>这不是报告失败，而是没有样本同时通过全部硬门槛。</span>'
            "</div>"
        )

    closest_excluded = _closest_exclusions(excluded, payload)
    closest_excluded_cards = "".join(
        _excluded_card(record, closest=True) for record in closest_excluded
    )
    if not closest_excluded_cards:
        closest_excluded_cards = '<p class="empty-state">当前没有排除样本。</p>'
    all_excluded_details = _all_exclusions_details(excluded)

    stat_cards = (
        ("input", "搜索返回", input_rows, "进入本轮计算的记录", ""),
        (
            "deduplicated",
            "去重后",
            deduplicated_rows,
            f"移除 {duplicates_removed} 条重复快照",
            "",
        ),
        (
            "eligible",
            "合格低粉爆款",
            eligible_rows,
            "同时通过全部硬门槛",
            " stat-card--eligible",
        ),
        (
            "excluded",
            "排除样本",
            excluded_rows,
            "保留逐条排除原因",
            " stat-card--excluded",
        ),
    )
    stats_html = "".join(
        f"""
        <article class="stat-card{modifier}" data-stat="{key}">
          <span>{_escape(label)}</span><strong>{value}</strong><small>{_escape(note)}</small>
        </article>
        """
        for key, label, value, note, modifier in stat_cards
    )

    chart_scatter_count = len(_scatter_points(records))
    chart_tiers, chart_below_minimum, chart_missing_followers = _follower_tiers(records)
    chart_tiered_count = sum(count for _, _, count in chart_tiers)
    chart_exclusion_rows = _exclusion_reasons(summary)
    chart_exclusion_total = sum(count for _, _, count in chart_exclusion_rows)
    chart_funnel_stages = len(_normalized_funnel(summary))

    document_title = html.escape(report_title, quote=True)
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>{document_title}</title>
  <style>
    :root {{
      --paper: #f3eee4;
      --sheet: #fffaf0;
      --ink: #10263c;
      --ink-soft: #425466;
      --red: #aa3b2e;
      --red-soft: #f1d8d0;
      --ochre: #c5964a;
      --green: #215c48;
      --green-soft: #e3eee7;
      --amber: #996416;
      --amber-soft: #f4e7c9;
      --line: #d8cdbd;
      --line-strong: #b8aa96;
      --shadow: 0 16px 50px rgba(16, 38, 60, 0.10);
      font-family: "Noto Serif SC", "Songti SC", "STSong", Georgia, serif;
      color: var(--ink);
      background: var(--paper);
    }}
    * {{ box-sizing: border-box; }}
    html {{ scroll-behavior: smooth; }}
    body {{ margin: 0; background: var(--paper); color: var(--ink); }}
    a {{ color: inherit; }}
    h1, h2, h3, p, a {{ overflow-wrap: anywhere; }}
    .page {{ width: min(1180px, calc(100% - 40px)); margin: 28px auto 64px; }}
    .sheet {{ background: var(--sheet); border: 1px solid var(--line); box-shadow: var(--shadow); }}
    .masthead {{ padding: 34px clamp(24px, 6vw, 78px) 54px; border-top: 8px solid var(--ink); }}
    .masthead-line {{ display: flex; align-items: center; justify-content: space-between; gap: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--line-strong); font: 700 12px/1.2 ui-sans-serif, system-ui, sans-serif; letter-spacing: .18em; text-transform: uppercase; }}
    .masthead-line span:last-child {{ color: var(--red); }}
    .hero {{ display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(250px, .5fr); gap: clamp(28px, 6vw, 80px); align-items: end; padding-top: 52px; }}
    .hero > *, .section-heading > div, .topic-main {{ min-width: 0; }}
    .kicker, .eyebrow {{ color: var(--red); font: 800 12px/1.3 ui-sans-serif, system-ui, sans-serif; letter-spacing: .16em; text-transform: uppercase; }}
    h1 {{ margin: 14px 0 22px; max-width: 780px; font-size: clamp(38px, 6vw, 76px); line-height: 1.03; letter-spacing: -.045em; }}
    .conclusion {{ margin: 0; max-width: 850px; font-size: clamp(18px, 2.3vw, 25px); line-height: 1.72; color: var(--ink-soft); }}
    .hero-note {{ padding: 18px 0 4px 24px; border-left: 4px solid var(--red); font: 600 14px/1.75 ui-sans-serif, system-ui, sans-serif; color: var(--ink-soft); }}
    .hero-note strong {{ display: block; margin-bottom: 6px; color: var(--ink); font-size: 18px; }}
    .section {{ padding: 54px clamp(24px, 6vw, 78px); border-top: 1px solid var(--line); }}
    .section-heading {{ display: grid; grid-template-columns: 74px 1fr; gap: 18px; align-items: start; margin-bottom: 30px; }}
    .section-number {{ color: var(--red); font: 800 13px/1 ui-sans-serif, system-ui, sans-serif; letter-spacing: .12em; }}
    .section-heading h2 {{ margin: -5px 0 7px; font-size: clamp(26px, 4vw, 42px); line-height: 1.15; letter-spacing: -.025em; }}
    .section-heading p {{ margin: 0; color: var(--ink-soft); font: 400 15px/1.7 ui-sans-serif, system-ui, sans-serif; }}
    .stats {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--line-strong); }}
    .stat-card {{ min-height: 164px; padding: 24px; border-right: 1px solid var(--line); }}
    .stat-card:last-child {{ border-right: 0; }}
    .stat-card span {{ color: var(--red); font: 800 12px/1 ui-sans-serif, system-ui, sans-serif; letter-spacing: .16em; }}
    .stat-card strong {{ display: block; margin: 16px 0 11px; font: 700 clamp(34px, 4vw, 54px)/1 Georgia, serif; }}
    .stat-card small {{ color: var(--ink-soft); font: 400 13px/1.5 ui-sans-serif, system-ui, sans-serif; }}
    .stat-card--eligible {{ background: var(--green-soft); }}
    .stat-card--eligible span, .stat-card--eligible strong {{ color: var(--green); }}
    .stat-card--excluded {{ background: var(--amber-soft); }}
    .stat-card--excluded span, .stat-card--excluded strong {{ color: var(--amber); }}
    .funnel {{ margin: 36px 0 0; padding: 0; list-style: none; }}
    .funnel-row {{ display: grid; grid-template-columns: 220px 1fr; gap: 24px; align-items: center; padding: 14px 0; border-bottom: 1px solid var(--line); }}
    .funnel-copy {{ display: flex; align-items: baseline; justify-content: space-between; gap: 14px; font: 600 14px/1.4 ui-sans-serif, system-ui, sans-serif; }}
    .funnel-copy strong {{ color: var(--red); font-size: 18px; }}
    .funnel-track {{ height: 12px; border: 1px solid var(--line-strong); background: #ebe4d8; }}
    .funnel-track span {{ display: block; height: 100%; background: var(--ink); }}
    .chart-grid {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; margin-top: 30px; }}
    .chart-card {{ min-width: 0; padding: 22px; border: 1px solid var(--line-strong); background: #fffdf8; }}
    .chart-card h3 {{ margin: 0 0 7px; font-size: 20px; line-height: 1.35; }}
    .chart-card > p {{ margin: 0; color: var(--ink-soft); font: 500 12px/1.65 ui-sans-serif, system-ui, sans-serif; }}
    .chart-card .chart-meta {{ margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }}
    .chart-svg {{ display: block; width: 100%; max-width: 100%; height: auto; margin: 18px 0 0; overflow: visible; }}
    .chart-label, .chart-value, .chart-tick, .chart-axis-label, .chart-footnote, .chart-empty {{ font-family: ui-sans-serif, system-ui, sans-serif; }}
    .chart-label {{ fill: var(--ink-soft); font-size: 12px; font-weight: 650; }}
    .chart-value {{ fill: var(--ink); font-size: 13px; font-weight: 800; }}
    .chart-tick {{ fill: var(--ink-soft); font-size: 10px; }}
    .chart-axis-label {{ fill: var(--ink-soft); font-size: 11px; font-weight: 700; }}
    .chart-footnote {{ fill: var(--ink-soft); font-size: 10px; }}
    .chart-empty {{ fill: var(--amber); font-size: 12px; font-weight: 700; }}
    .chart-grid-line {{ stroke: var(--line); stroke-width: 1; }}
    .chart-axis {{ stroke: var(--line-strong); stroke-width: 1; }}
    .gate-line {{ stroke: var(--red); stroke-width: 1.5; stroke-dasharray: 6 5; opacity: .78; }}
    .scatter-point {{ stroke: #fffaf0; stroke-width: 2; }}
    .scatter-point--eligible {{ fill: var(--green); }}
    .scatter-point--excluded {{ fill: var(--amber); opacity: .82; }}
    .funnel-shape {{ stroke: #fffaf0; stroke-width: 2; }}
    .funnel-shape--1 {{ fill: var(--ink); }}
    .funnel-shape--2 {{ fill: #284d68; }}
    .funnel-shape--3 {{ fill: #47708b; }}
    .funnel-shape--4 {{ fill: var(--green); }}
    .tier-shape {{ stroke: #fffaf0; stroke-width: 2; }}
    .tier-shape--1 {{ fill: var(--green); }}
    .tier-shape--2 {{ fill: #47708b; }}
    .tier-shape--3 {{ fill: var(--ochre); }}
    .tier-shape--4 {{ fill: var(--red); }}
    .reason-bar {{ fill: var(--amber); }}
    .chart-legend {{ display: flex; flex-wrap: wrap; gap: 10px 16px; margin-top: 10px; color: var(--ink-soft); font: 650 11px/1.5 ui-sans-serif, system-ui, sans-serif; }}
    .legend-item {{ display: inline-flex; align-items: center; gap: 6px; }}
    .legend-dot {{ width: 9px; height: 9px; border-radius: 50%; background: var(--amber); }}
    .legend-dot--eligible {{ background: var(--green); }}
    .legend-line {{ width: 18px; border-top: 2px dashed var(--red); }}
    .funnel-details {{ margin-top: 20px; border: 1px solid var(--line); background: #f8f1e6; }}
    .funnel-details > summary {{ padding: 14px 18px; cursor: pointer; font: 750 13px/1.4 ui-sans-serif, system-ui, sans-serif; }}
    .funnel-details .funnel {{ margin: 0; padding: 0 18px 14px; }}
    .topic-list {{ display: grid; gap: 18px; }}
    .topic-card {{ border: 1px solid var(--line-strong); border-top: 5px solid var(--green); background: #fffdf8; }}
    .topic-card--older {{ border-top-color: var(--amber); }}
    .topic-card--unknown {{ border-top-color: var(--line-strong); }}
    .topic-main {{ padding: clamp(24px, 4vw, 42px); }}
    .topic-main h3, .excluded-card h3 {{ margin: 9px 0 10px; font-size: clamp(23px, 3vw, 34px); line-height: 1.25; }}
    .topic-main h3 {{ display: -webkit-box; overflow: hidden; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }}
    .topic-meta {{ display: flex; align-items: center; flex-wrap: wrap; gap: 9px 13px; font: 700 12px/1.45 ui-sans-serif, system-ui, sans-serif; }}
    .recency-badge {{ padding: 6px 9px; border: 1px solid currentColor; }}
    .recency-badge--recent {{ color: var(--green); background: var(--green-soft); }}
    .recency-badge--older {{ color: var(--amber); background: var(--amber-soft); }}
    .recency-badge--unknown {{ color: var(--ink-soft); background: #eee7dc; }}
    .age-label, .published-label {{ color: var(--ink-soft); font-weight: 600; }}
    .byline {{ margin: 0; color: var(--ink-soft); font: 500 13px/1.6 ui-sans-serif, system-ui, sans-serif; }}
    .original-title {{ margin-top: 14px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }}
    .original-title summary {{ padding: 11px 0; cursor: pointer; color: var(--ink-soft); font: 700 12px/1.4 ui-sans-serif, system-ui, sans-serif; }}
    .original-title p {{ margin: 0 0 13px; font: 500 14px/1.7 ui-sans-serif, system-ui, sans-serif; }}
    .reason {{ margin: 24px 0; padding: 16px 18px; border-left: 3px solid var(--ochre); background: #f7f0e4; font: 400 15px/1.75 ui-sans-serif, system-ui, sans-serif; }}
    .reason span {{ display: block; margin-bottom: 5px; color: var(--red); font-size: 11px; font-weight: 800; letter-spacing: .12em; }}
    .metrics {{ display: grid; grid-template-columns: repeat(4, minmax(78px, 1fr)); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }}
    .metric {{ padding: 16px 12px; border-right: 1px solid var(--line); }}
    .metric:last-child {{ border-right: 0; }}
    .metric-label {{ display: block; margin-bottom: 7px; color: var(--ink-soft); font: 600 11px/1 ui-sans-serif, system-ui, sans-serif; }}
    .metric strong {{ font: 700 18px/1.15 ui-sans-serif, system-ui, sans-serif; }}
    .secondary-metric {{ margin: 10px 0 0; color: var(--ink-soft); font: 500 12px/1.6 ui-sans-serif, system-ui, sans-serif; }}
    .topic-footer {{ display: flex; align-items: center; justify-content: space-between; gap: 18px; padding-top: 22px; }}
    .qualified-label {{ color: var(--green); font: 800 12px/1.4 ui-sans-serif, system-ui, sans-serif; }}
    .qualified-label::before {{ content: ""; display: inline-block; width: 8px; height: 8px; margin-right: 8px; border-radius: 50%; background: var(--green); }}
    .source-link {{ color: var(--ink); font: 800 12px/1.4 ui-sans-serif, system-ui, sans-serif; text-underline-offset: 4px; }}
    .source-link:hover {{ color: var(--red); }}
    .source-missing {{ color: var(--ink-soft); font: 500 12px/1.4 ui-sans-serif, system-ui, sans-serif; }}
    .excluded-overview {{ display: grid; grid-template-columns: minmax(260px, .42fr) minmax(0, 1.58fr); gap: 28px; align-items: start; }}
    .closest-wrap h3 {{ margin: 0 0 13px; font-size: 18px; }}
    .closest-wrap > p {{ margin: 0 0 18px; color: var(--ink-soft); font: 500 13px/1.6 ui-sans-serif, system-ui, sans-serif; }}
    .closest-grid {{ display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }}
    .excluded-card {{ min-width: 0; padding: 18px; border: 1px solid var(--line); background: #fffdf8; }}
    .excluded-card--closest {{ border-top: 4px solid var(--amber); }}
    .excluded-card h3 {{ display: -webkit-box; overflow: hidden; margin-top: 9px; font-size: 18px; line-height: 1.35; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }}
    .excluded-topline {{ display: flex; flex-wrap: wrap; gap: 7px; align-items: center; }}
    .excluded-label, .closest-label {{ color: var(--amber); font: 800 10px/1.4 ui-sans-serif, system-ui, sans-serif; letter-spacing: .04em; }}
    .closest-label {{ padding: 3px 6px; background: var(--amber-soft); }}
    .excluded-metrics {{ display: flex; flex-wrap: wrap; gap: 10px 18px; margin: 14px 0 10px; color: var(--ink-soft); font: 600 12px/1.5 ui-sans-serif, system-ui, sans-serif; }}
    .excluded-metrics strong {{ color: var(--ink); }}
    .excluded-reason {{ margin: 0 0 14px; color: var(--ink-soft); font: 500 12px/1.65 ui-sans-serif, system-ui, sans-serif; }}
    .excluded-footer {{ display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 9px; padding-top: 11px; border-top: 1px solid var(--line); color: var(--ink-soft); font: 500 11px/1.5 ui-sans-serif, system-ui, sans-serif; }}
    .exclusion-summary {{ padding: 26px; border-top: 5px solid var(--amber); background: var(--ink); color: #fffaf0; }}
    .exclusion-summary h3 {{ margin: 0 0 17px; font-size: 19px; }}
    .exclusion-summary ul {{ margin: 0; padding: 0; list-style: none; }}
    .exclusion-summary li {{ display: flex; justify-content: space-between; gap: 18px; padding: 11px 0; border-bottom: 1px solid rgba(255,250,240,.22); font: 500 13px/1.45 ui-sans-serif, system-ui, sans-serif; }}
    .exclusion-summary strong {{ color: #f2c879; }}
    .all-exclusions {{ margin-top: 24px; border: 1px solid var(--line-strong); background: #f8f1e6; }}
    .all-exclusions > summary {{ display: flex; justify-content: space-between; gap: 18px; padding: 18px 20px; cursor: pointer; color: var(--ink); font: 800 14px/1.4 ui-sans-serif, system-ui, sans-serif; }}
    .all-exclusions > summary strong {{ color: var(--amber); }}
    .excluded-detail-grid {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 0 16px 16px; }}
    .scope-layout {{ display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, .82fr); gap: 24px; align-items: start; }}
    .scope-grid {{ margin: 0; border: 1px solid var(--line-strong); }}
    .scope-item {{ display: grid; grid-template-columns: minmax(100px, .35fr) 1fr; gap: 18px; padding: 18px 20px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }}
    .scope-item {{ border-right: 0; }}
    .scope-item:last-child {{ border-bottom: 0; }}
    .scope-item dt {{ color: var(--red); font: 800 12px/1.5 ui-sans-serif, system-ui, sans-serif; }}
    .scope-item dd {{ margin: 0; font: 500 13px/1.65 ui-sans-serif, system-ui, sans-serif; }}
    .limits {{ padding: 24px; border-top: 5px solid var(--red); background: var(--red-soft); }}
    .limits h3 {{ margin: 0 0 13px; color: var(--red); font-size: 19px; }}
    .limits ul {{ margin: 0; padding-left: 20px; }}
    .limits li {{ padding: 6px 0; font: 500 13px/1.7 ui-sans-serif, system-ui, sans-serif; }}
    .source-list {{ margin: 0; padding: 0; list-style: none; counter-reset: sources; border-top: 1px solid var(--line-strong); }}
    .source-list li {{ counter-increment: sources; display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; gap: 16px; align-items: center; padding: 17px 0; border-bottom: 1px solid var(--line); }}
    .source-list li::before {{ content: counter(sources, decimal-leading-zero); color: var(--red); font: 800 12px/1 ui-sans-serif, system-ui, sans-serif; }}
    .source-list a {{ overflow-wrap: anywhere; font: 700 14px/1.5 ui-sans-serif, system-ui, sans-serif; text-decoration-thickness: 1px; text-underline-offset: 4px; }}
    .source-list span {{ color: var(--ink-soft); font: 500 11px/1.4 ui-sans-serif, system-ui, sans-serif; }}
    .empty-state {{ margin: 0; padding: 20px; border: 1px dashed var(--line-strong); color: var(--ink-soft); font: 500 14px/1.65 ui-sans-serif, system-ui, sans-serif; }}
    .empty-state--large {{ display: grid; gap: 8px; padding: 36px; }}
    .empty-state--large strong {{ color: var(--ink); font: 700 24px/1.35 Georgia, serif; }}
    footer {{ display: flex; justify-content: space-between; gap: 20px; padding: 24px clamp(24px, 6vw, 78px); border-top: 1px solid var(--line); color: var(--ink-soft); font: 500 11px/1.5 ui-sans-serif, system-ui, sans-serif; letter-spacing: .06em; }}
    @media (max-width: 720px) {{
      .page {{ width: min(100% - 20px, 720px); margin-top: 10px; }}
      .hero, .excluded-overview, .scope-layout {{ grid-template-columns: 1fr; }}
      .stats {{ grid-template-columns: repeat(2, 1fr); }}
      .stat-card:nth-child(2) {{ border-right: 0; }}
      .stat-card:nth-child(-n+2) {{ border-bottom: 1px solid var(--line); }}
      .funnel-row {{ grid-template-columns: 1fr; gap: 8px; }}
      .chart-grid, .topic-list, .closest-grid, .excluded-detail-grid {{ grid-template-columns: 1fr; }}
      .metrics {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
      .metric:nth-child(2n) {{ border-right: 0; }}
      .topic-footer {{ align-items: flex-start; flex-direction: column; }}
    }}
    @media (max-width: 540px) {{
      .page {{ width: 100%; margin: 0; }}
      .sheet {{ border-left: 0; border-right: 0; box-shadow: none; }}
      .masthead, .section {{ padding-left: 20px; padding-right: 20px; }}
      .masthead-line {{ align-items: flex-start; flex-direction: column; }}
      .hero {{ padding-top: 34px; }}
      .section-heading {{ grid-template-columns: 42px 1fr; }}
      .stat-card {{ min-height: 142px; padding: 18px; }}
      .topic-main {{ padding: 20px; }}
      .chart-card {{ padding: 16px; }}
      .excluded-card {{ padding: 15px; }}
      footer {{ align-items: flex-start; flex-direction: column; }}
      .source-list li {{ grid-template-columns: 30px 1fr; }}
      .source-list span {{ grid-column: 2; }}
    }}
    @media print {{
      body, :root {{ background: #fff; }}
      .page {{ width: 100%; margin: 0; }}
      .sheet {{ border: 0; box-shadow: none; }}
      .chart-card, .topic-card, .excluded-card, .scope-layout {{ break-inside: avoid; }}
    }}
  </style>
</head>
<body>
  <main class="page">
    <article class="sheet">
      <header class="masthead">
        <div class="masthead-line"><span>JINCHENG MEDIA RESEARCH</span><span>EDITORIAL BRIEF</span></div>
        <div class="hero">
          <div>
            <div class="kicker">低粉爆款 · 可复算筛选</div>
            <h1>{document_title}</h1>
            <p class="conclusion">{_escape(conclusion)}</p>
          </div>
          <aside class="hero-note">
            <strong>先看结论，再看证据</strong>
            合格数量来自硬门槛，不为凑数降低标准。所有排序只使用公开、可回溯的原始指标。
          </aside>
        </div>
      </header>

      <section class="section" aria-labelledby="overview-title">
        <div class="section-heading">
          <span class="section-number">01</span>
          <div><h2 id="overview-title">筛选结果一眼看清</h2><p>输入、去重、合格与排除使用同一份 normalized 数据计算。</p></div>
        </div>
        <div class="stats">{stats_html}</div>
        <div class="chart-grid" aria-label="真实数据可视化">
          <article class="chart-card" data-chart="selection-funnel">
            <h3>筛选漏斗</h3>
            <p>梯形宽度对应每一步真实数量，右侧同时给出相对输入样本的保留率。</p>
            {_funnel_svg(summary)}
            <p class="chart-meta">数据来源：summary.funnel｜{chart_funnel_stages} 个阶段｜研究日 {_escape(_format_date(payload.get('as_of')))}</p>
          </article>
          <article class="chart-card" data-chart="followers-likes-scatter">
            <h3>粉丝数 × 点赞数</h3>
            <p>使用对数坐标保留量级差异；红色虚线是粉丝和点赞硬门槛。</p>
            <div class="chart-legend"><span class="legend-item"><i class="legend-dot legend-dot--eligible"></i>合格</span><span class="legend-item"><i class="legend-dot"></i>排除</span><span class="legend-item"><i class="legend-line"></i>硬门槛</span></div>
            {_scatter_svg(records, payload)}
            <p class="chart-meta">数据来源：normalized records｜有效点 {chart_scatter_count}/{len(records)}｜横轴粉丝、纵轴点赞，均为采集时快照</p>
          </article>
          <article class="chart-card" data-chart="follower-tiers">
            <h3>粉丝体量分层梯形图</h3>
            <p>每个梯形是一个粉丝区间，宽度按区间内真实记录数计算；不表示筛选流失。</p>
            {_follower_tiers_svg(records)}
            <p class="chart-meta">数据来源：normalized follower_count｜进入分层 {chart_tiered_count} 条｜低于 100 粉 {chart_below_minimum} 条｜字段缺失 {chart_missing_followers} 条</p>
          </article>
          <article class="chart-card" data-chart="exclusion-reasons">
            <h3>排除原因</h3>
            <p>条形只来自 summary.exclusion_counts；没有排除原因时不画假条。</p>
            {_exclusion_reasons_svg(summary)}
            <p class="chart-meta">数据来源：summary.exclusion_counts｜{len(chart_exclusion_rows)} 类原因｜合计 {chart_exclusion_total} 条</p>
          </article>
        </div>
        <details class="funnel-details">
          <summary>查看可复算的筛选阶段明细</summary>
          <ol class="funnel" aria-label="筛选漏斗明细">{_funnel(summary)}</ol>
        </details>
      </section>

      <section class="section" aria-labelledby="topics-title">
        <div class="section-heading">
          <span class="section-number">02</span>
          <div><h2 id="topics-title">合格低粉爆款</h2><p>先看 90 天内样本，再沿用 normalized 数据的合格顺序；评论只作次级观察。</p></div>
        </div>
        <div class="topic-list">{topic_cards}</div>
      </section>

      <section class="section" aria-labelledby="excluded-title">
        <div class="section-heading">
          <span class="section-number">03</span>
          <div><h2 id="excluded-title">排除样本怎么看</h2><p>先看原因汇总和最接近粉丝上限的 3 条；全部明细默认折叠，按需展开。</p></div>
        </div>
        <div class="excluded-overview">
          {_aggregate_exclusions(summary)}
          <div class="closest-wrap">
            <h3>最接近粉丝上限的 3 条</h3>
            <p>只用于理解边界，不会被标成合格低粉爆款。</p>
            <div class="closest-grid">{closest_excluded_cards}</div>
          </div>
        </div>
        {all_excluded_details}
      </section>

      <section class="section" aria-labelledby="scope-title">
        <div class="section-heading">
          <span class="section-number">04</span>
          <div><h2 id="scope-title">研究范围与限制</h2><p>门槛、时间偏好、去重和排序规则全部写明。</p></div>
        </div>
        <div class="scope-layout">
          <dl class="scope-grid">{_scope_items(payload)}</dl>
          <aside class="limits"><h3>直接可见的限制</h3><ul>{_visible_limits()}</ul></aside>
        </div>
      </section>

      <section class="section" aria-labelledby="sources-title">
        <div class="section-heading">
          <span class="section-number">05</span>
          <div><h2 id="sources-title">来源链接</h2><p>仅列公开规范化链接，不包含临时签名、跟踪参数或本地文件位置。</p></div>
        </div>
        {_unique_sources(records)}
      </section>

      <footer><span>由 jc-media-research 离线生成</span><span>事实、计算、判断边界可回溯</span></footer>
    </article>
  </main>
</body>
</html>
"""


def load_payload(path: Path) -> Mapping[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except FileNotFoundError:
        raise ReportError("输入文件不存在") from None
    except (OSError, json.JSONDecodeError):
        raise ReportError("输入文件无法读取或不是有效 JSON") from None
    if not isinstance(payload, Mapping):
        raise ReportError("normalized content JSON 顶层必须是对象")
    return payload


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="把 normalized content JSON 渲染为单文件、自包含的响应式 HTML 简报。"
    )
    parser.add_argument("--input", type=Path, required=True, help="normalized content JSON")
    parser.add_argument("--output", type=Path, required=True, help="输出 HTML 文件")
    parser.add_argument("--title", help="可选报告标题")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        payload = load_payload(args.input)
        rendered = render_report(payload, args.title)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    except (ReportError, OSError) as error:
        print(f"render_report: {error}", file=sys.stderr)
        return 2
    print(
        json.dumps(
            {
                "ok": True,
                "output": args.output.name,
                "bytes": len(rendered.encode("utf-8")),
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
