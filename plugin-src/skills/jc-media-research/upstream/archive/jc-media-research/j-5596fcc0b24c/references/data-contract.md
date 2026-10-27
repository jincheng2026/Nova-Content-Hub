# 数据字段合同

## 目录

- 通用规则
- 作品记录
- 评论记录与统计
- 证据索引
- 搜索计划和请求账本
- 图表 manifest
- 公开字段白名单

## 通用规则

- 时间使用带时区的 ISO 8601。
- 计数字段使用非负整数；缺失时使用 `null`，不要猜成 0。
- 每条 normalized 记录同时保存 `source_url`、`source_file` 和真实 `collected_at`。
- 平台内容 ID、评论 ID 和请求指纹按字符串保存。
- 新字段先写入版本化合同，再进入公开 normalized 数据。

## 作品记录

必填字段：

```text
schema_version
platform
content_id
title
caption
author_name
follower_count
like_count
comment_count
collect_count
share_count
published_at
collected_at
source_url
source_file
relevance
relevance_reason
direct_related
age_days_at_research
within_preferred_90_days
qualified
eligibility
exclusion_reasons
evidence_issues
```

`eligibility` 使用：

- `eligible_low_follower_viral`
- `anomaly_low_followers`
- `regular_viral_reference`
- `unverified_low_likes`
- `adjacent`
- `off_topic`
- `missing_evidence`

`exclusion_reasons` 是字符串数组，明确列出每个未过门槛的字段。最近 90 天优先状态单独保存为 `within_preferred_90_days`，不能覆盖硬门槛结果。

`evidence_issues` 单独记录缺少来源文件、来源链接或真实采集时间等证据问题。它不改变内容门槛结果，但报告不能把证据不完整的记录写成已充分核验。

## 评论记录

必填字段：

```text
schema_version
platform
content_id
comment_id
comment_text
commented_at
digg_count
source_url
source_file
collected_at
primary_category
secondary_categories
category_reason
classification_status
is_noise
noise_reason
```

`primary_category` 只能有一个；无法判断时使用 `未分类`。`secondary_categories` 可以为空。`classification_status` 使用 `ai_proposed`、`user_confirmed` 或 `unclassified`。

## 评论统计

```json
{
  "schema_version": 1,
  "total_rows": 0,
  "noise_rows": 0,
  "unclassified_rows": 0,
  "denominator_rule": "exclude_noise",
  "denominator": 0,
  "categories": [
    {"primary_category": "使用问题", "rows": 0, "ratio": 0.0}
  ]
}
```

比例用未四舍五入的行数计算，展示时再格式化。所有分类行数之和应等于分母；如果「未分类」也在分母中，必须作为一个类别显示。

## 证据索引

```text
evidence_id
evidence_type
claim_type
content_id
time_range
text_or_summary
source_url
source_file
collected_at
```

`claim_type` 使用 `raw_fact`、`computed`、`inference`、`user_confirmed`、`to_verify`。

## 搜索计划和请求账本

搜索计划保存关键词、排序、时间、分页、请求数、实时价格、最高费用、停止条件和计划哈希。请求账本只保存请求指纹、端点、时间、状态、缓存、已知费用和对应输出文件，不保存凭据。

## 图表 manifest

每张图保存：

```text
chart_id
chart_type
title
file
data_file
filters
columns
denominator
source
collected_at
evidence_issues
fallback
```

`collected_at` 缺失时必须为 `null`，并在 `evidence_issues` 写 `missing_collected_at`，不得拿研究时间代替采集时间。`fallback` 不为空时，报告必须展示对应表格或解释，不能声称图表已经生成。

## 公开字段白名单

公开研究结果只允许使用本合同中的 normalized 字段和显式的报告字段。平台原始响应中的未知字段默认删除；不是看起来无害就保留。
