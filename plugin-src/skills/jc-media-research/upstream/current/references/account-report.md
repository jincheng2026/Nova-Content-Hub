# 账号对标报告

账号研究时读取本文件。目标是回答「这个人具体做对了什么，证据是什么，我能学哪一步」。用 `render_report.py` 的账号分支生成，内容判断由 Agent 写入 `account_analysis`，数字由明细计算。不要为每个博主另写一套统计和页面脚本。

## 内容判断

首屏给少量最有价值的判断，每条连接原文及应用建议。正文按材料组织为内容表达、定位、方向与表现、评论需求、如何借鉴、商业证据；作品明细和研究范围是轻入口。沿用白底、蓝色强调、单行导航，窄屏横向滚动，正文锚点避开导航。

一条有用的分析要连贯说明：原文做了什么、可能替观众解决了哪个疑虑、这个解释还有什么不确定、用户可以怎样试。不要只写「定义、演示、总结」这样的步骤名称。

- 内容表达从逐字稿或实际画面提炼。写出具体提问、解释、演示、验证、复述等动作及原话；标题只支持发布表达，不代替口播。
- 「重复出现」至少引用两条独立作品。同一视频的两段、转写和文案不是两条独立作品。单条内容写成单次观察；未经复核的 ASR 保留状态，不升级为确认口播规律。
- 做相似选题或相似形式的高低对照，也看接近中位数的普通作品。先说明为什么可比，再展示同口径原始指标和日期；分发、积累时长、受众和制作差异作为其他解释。没有实验不写因果。材料不够就写具体缺口。
- 内容主方向每条作品只归一类；形式、工具、使用场景可另作标签。系列按真实名称及内容核对，不把同一个关键词命中的作品拼成连续期数。
- 评论的场景、请求和反馈由语义复核。把相同问题在不同作品中的出现情况与原话一起呈现。条数和获赞分别展示；获赞不是人数，多标签合计不是独立评论数。零赞不能推出没人回复，回复未取全不能推出作者不回应。
- 从问题推到选题是可测试判断，从问题推到付费意愿还需要额外证据。没有完整核对作品与回复，不写「供给为零」「一直没人教」「这些人不会付费」。
- 定位分别看本人身份、面向谁、持续提供什么；身份与交付自述标为作者自述。商业入口、公开交付自述、实际交易证据分开，不能据此补收入、转化或销量。
- 如何借鉴要引用用户本人的定位、作品或经历，给出适用条件及不宜照搬的前提。缺本人材料时提供一般建议，并标明尚未完成个性化判断。已有正式作品先核对，避免重复立项。

## 图表选择

根据已有材料选择约 3 至 6 组图，不凑数。默认组件直接支持：

1. 发布时间与四种互动切换，标出本批样本中位数；有有效逐条基线时另画倍率。样本中位数与排除自身、按时间窗计算的基线分别标明。
2. 主要方向的点赞、评论、收藏、分享中位数，四幅小图统一方向顺序，分别标实际数值和有效 n。不同指标使用各自刻度，不跨图比较柱长。
3. 同题作品对照，直接显示原值、日期，并连接原文。比较作品由内容判断选出，不仅按数值排名。
4. 评论主题的出现条数与获赞总数分开画，可按视频和评论层级查看，旁边能展开原评论。
5. 评论来源覆盖，按作品分别显示顶层、回复、层级未知的实际行数。未抓取回复不是零回复。

每图旁写本图回答的问题、来源范围和计数单位。主要值、n、分母直接可见，悬浮提示只补细节。零值和缺失分开。只有全为可靠的播放计数时才用播放作分母；收藏／点赞比不能叫收藏率。不能把当前粉丝数除以作品数当平均净增。

## 生成输入

保留 `schema_version: 2`、`record_type: account_research`。在普通作品 `records`、`sources` 之外，可加：

- 作品的 `main_direction`：人工复核的互斥主方向。
- `comments`：逐条评论，字段为 `platform, content_id, comment_id, text, like_count, level, demand_tags, annotation_reviewed, reply_coverage, source_url`。`level` 为 `top_level / reply / unknown`；仅 `annotation_reviewed: true` 的非空 `demand_tags` 进入需求主题图。
- `account_analysis`：`version: 1`，可含 `summary_cards, chapters, comparisons, collection_note`。
- `chapters`：`id, title, lead, cards`。id 使用 `narration, positioning, directions, comments, transfer, commercial`；图表和明细由程序插入相应章节。
- `cards`：`title, observation, interpretation, citations, pattern_type, alternative_explanations, testable_change, conditions, not_suitable, own_citations`。只有 `title, observation` 必填；有判断而无引用时页面明确显示缺证据。`pattern_type` 为 `single / repeated / inference / unknown`。引用合同见 [数据合同](data-contract.md)，生成时逐字校验。`repeated` 要求至少两条不同 `content_id` 的证据。
- `comparisons`：`id, title, content_ids, observation, citations, alternative_explanations, testable_change`。作品必须都存在于 records 中，至少两条；不能用缺失值补零。
- `presentation` 可选，使用评论报告的共享阅读组件：`version: 1`、`emphasis` 精确文字片段、按来源 ID 保存的 `quote_emphasis` 与 `source_labels`，以及评论图的 `default_level: top_level / reply / unknown / all`。主引文可以用 `display: primary` 明确保留在正文，其余依据用 `supporting` 折叠。长解释在句末分段并精确加粗；桌面并列原话和解释，建议并列做法与检查。只改变阅读排版，不改原文字词、引用顺序、已冻结分析或统计。生成器优先使用同级 `jc-comment-visualize` 的阅读排版组件，保持两份报告的读法一致；没有安装它时使用本 Skill 自带的副本 `scripts/shared/reading_layout.py` 与 `assets/shared/reading.css`。

来源补充 `kind`（如 description、transcript、comment、profile、own_material）和 `review_status`，用于明确证据范围。转写来源另用 `text_reviewed: true` 表示文字能力检查已通过；缺少这一标志时不能以该转写确认重复模式。评论链接可由同一 content_id 的作品来源补齐；两处均缺失时页面明确标出。没有分析输入也能生成真实数据页，但显示「尚未完成内容分析」，不能当作完整账号研究。

## 同步与验收

作品数、评论数、层级分布、方向统计与图表共用同一份明细和程序计算结果。重复主键拒绝生成，先在规范化环节处理采集重复。每个账号单独生成，平台、账号和采集批次不能混在一份基线比较中。主报告已包含评论分析；确需单独评论页时，两页必须使用同一输入摘要哈希，更新后一起读回。

HTML 内保留 `report-audit`：生成器版本、输入摘要哈希、实际作品和评论数量。原始输入文件及 SHA-256 另存任务证据清单。修改输入后重新生成，不能只手改 HTML 中某一个数字。

验收分别确认引用与统计、交互与视觉、内容判断。程序通过不能证明解释成立；页面存在不能证明视觉通过。按 [报告与安全](reporting-and-security.md) 做实际浏览器验收，受限时如实保留未完成状态，不改用其他通道绕过限制。批量前先让一份有真实材料的报告跑通相同生成入口；后续每位博主保留自己的覆盖范围和缺口。
