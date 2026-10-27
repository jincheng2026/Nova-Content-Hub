# 评论报告数据与检查

新版 HTML 由 `scripts/render_report.py` 从 JSON 生成。输入保留在任务目录；Skill 仅含程序、模板和合成示例。图表、明细和页脚使用同一份数据计算。

## 输入

顶层：`schema_version: 2, title, summary, collected_at, coverage, comments, topics, sources, findings, recommendations`。这些数组都保留，暂无内容时使用空数组。主题、来源、发现和建议的 id 使用稳定英文标识，正文标题正常写中文。

```bash
python3 scripts/render_report.py --input TASK/normalized/comment-report.json --out TASK/reports/评论区洞察.html
bash scripts/publish_check.sh TASK/reports/评论区洞察.html
```

页面没有外部脚本依赖，数据、样式和交互内联。合成预览由 `--example --out assets/example-report.html` 生成；不把模板文件直接当报告打开。

- `coverage`：`note` 说明取样与排序，`reported_total` 可为 null，`reported_total_scope` 说明平台总数包含哪些层级，`raw_rows` 为原始返回行数，`collection_note` 说明本轮请求/费用或仅使用存量材料。不得把差额擅自解释成删评。
- `comments`：每行 `cid, content_id, video_title, text, likes, level, reviewed, topic_ids, source_url`。`level` 为 top、reply 或 unknown；likes 未取得为 null。cid 唯一；reviewed 表示该条语义标注已复核，不表示所有判断都成立。
- `topics`：`id, label, description`。每条评论可关联多个需求主题；页面明确按独立评论计数，主题合计不等于人数。点赞只作另一个统计视角。
- `sources`：非评论材料，字段 `id, title, text, kind, review_status, source_url`。kind 可为 transcript、description、own_material、interview、document。评论已自动成为 `comment:<cid>` 来源，不重复保存。
- 引用：`{source_id, quote}`，quote 必须逐字存在于对应 text；不以正文风格修改原话。可加 `display: primary / supporting`；默认直接展示，补充引用可折叠。每项发现至少有一处关键原话直接可见，重要证据不能都设为 supporting。
- `findings`：`id, title, observation, explanation, citations, status, scope, alternatives`。status 为 observation 或 inference；推断要给其他解释。与题目无关或证据不足的材料可不生成发现，但在 coverage.note 说明缺口，不虚构心理分析。
- `recommendations`：`id, title, action, verification, finding_ids, audience, own_citations`。audience 为 general 或 personal；个人建议必须引用 kind=own_material 的实际材料。建议是可验证的下一步，不能写成已产生结果。写口播的请求可另附脚本，由相应写稿 Skill 处理。
- `presentation` 可选，独立保存排版信息：`version: 1`、`emphasis` 精确文字片段数组、按来源 ID 映射片段数组的 `quote_emphasis`、按来源 ID 映射阅读标签的 `source_labels`，以及 `default_level: all / top / reply / unknown`。`evidence_styles` 按发现 ID 指定 `quotes` 或经根评论、回复对象和发言账号核对的 `thread`。这些字段不改分析和引用，不属于 `findings` 的冻结内容；具体使用见 [页面规范](page-spec.md)。

完成对象分析时保存 `findings` 与其规范 JSON 的 SHA-256；可调用生成器的 `digest(findings)` 计算。追加建议后在顶层带入 `frozen_findings_sha256`，生成器会核对对象分析是否变化。若要纠正原分析，重新复核、冻结，再写建议，不能仅更新哈希掩盖改变。

来源链接使用不含登录信息的 HTTP(S) URL。评论必须给出视频来源；本地访谈或逐字稿可无外部链接，完整原文仍嵌入页面供核对。ASR 的 review_status 如实写未复核，不据此声称精确时间点或已核证的正文规律。

## 检查层级

`publish_check.sh 页面.html [L2|L3|L4]` 对新版页面执行本 Skill 的本地检查，不修改其他 Skill 共用的深度检查器。

- L1：评论去重、来源、层级、字段及采集范围完整；图表与评论原文来自同一输入。
- L2：有效主题能回到已复核评论，计数由程序重算，保留未分类或未复核数量。
- L3：每条发现有原文、观察范围、具体解释；推断有其他解释。检验引用文字，不用情绪词或图标数量代替深度。
- L4：应用建议能回到发现，说明做什么及怎样检查；个性化建议还要有本人材料。不存在固定的心理层数、脚本数量或口令要求。

完整评论报告仍以 L4 为默认目标。原文少也能交付完整结果，但结论限于已有材料；无评论时只生成真实空结果。L3 人群深度页可用 sources 中的访谈等材料支撑发现，不能为填主题图编评论。旧 HTML 没有嵌入 comment-report-data 时继续走原有深度检查，文案检查只扫描可见分析文字；既有格式缺少数据时，脚本无法追溯其统计与全部引文。

新版页面保留 `comment-report-data` 和 `report-audit`，包括输入哈希、生成器版本和实际统计。发布检查会用输入重新渲染比对，防止修改 HTML 后统计、正文和来源脱节。机器检查通过仍需核对分析逻辑与实际页面显示。
