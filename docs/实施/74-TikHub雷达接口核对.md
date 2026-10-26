# TikHub 雷达接口核对（2026-10-27）

接口核对阶段仅使用公开定义和源码，未读取凭证或调用计费接口。随后获授权进行最小真实联通，结果见末节；未安装依赖。结论：后端可以固定「一次平台搜索 → 有限作者补全 → 本地筛选」；小红书接口路径已核实，但真实结果结构尚未验收，不能据此声明已支持。

## 证据范围

- 官方公开定义：[OpenAPI](https://api.tikhub.io/openapi.json)、[Swagger](https://api.tikhub.io/)、[官方文档入口](https://docs.tikhub.io/)。2026-10-27 无鉴权 GET 取得的 OpenAPI 自述版本 V5.3.2、更新时间 2026-06-22；取得文件 SHA256 `011c55ef12ac07bd175de5cd5bf196c51a1a03bfd247468de74a415c7e2b16f6`。
- 项目入口：`workbench/src/shared/service-contracts.ts`、`workbench/src/shared/service-validation.ts`、`workbench/src/main/service-tools.mts`。
- OpenAPI 中接口的 200 响应均指向通用 `ResponseModel`；其 `data` 没有业务结构约束。接口说明中的字段属于文档证据，仍需真实响应确定嵌套层级、缺失值、数值含义及可用率。

## 现有付费边界

当前仅允许六个抖音操作，不能让助手传任意 URL 或把小红书 ID 放进抖音操作：

| 操作 | 方法与路径 | 当前输入 |
|---|---|---|
| `douyin-search` | POST `/api/v1/douyin/search/fetch_video_search_v2` | JSON `keyword`、`cursor` |
| `user-search` | POST `/api/v1/douyin/search/fetch_user_search_v2` | JSON `keyword`、`cursor` |
| `profile` | GET `/api/v1/douyin/app/v3/handler_user_profile` | `sec_user_id` |
| `user-posts` | GET `/api/v1/douyin/app/v3/fetch_user_post_videos` | `sec_user_id`、`max_cursor`、`count=20` |
| `video` | GET `/api/v1/douyin/app/v3/fetch_one_video_v2` | `aweme_id` |
| `comments` | GET `/api/v1/douyin/app/v3/fetch_video_comments` | `aweme_id`、`cursor`、`count=20`；另有评论授权开关 |

缓存键目前只含操作、ID、游标，TTL 为六小时。若增加排序、发布时间、内容类型等筛选，缓存键必须包含全部生效参数。现有参数校验也只接受 `operation/id/cursor`，不能只改 HTTP 构造。

## 抖音：一次搜索有机会获得全部筛选数据

已核实 POST `/api/v1/douyin/search/fetch_video_search_v2` 的请求体字段：

| 字段 | 官方定义 |
|---|---|
| `keyword` | 关键词 |
| `cursor` | 首次 `0`；后续使用响应游标 |
| `sort_type` | 字符串 `0` 综合、`1` 最多点赞、`2` 最新 |
| `publish_time` | 字符串 `0` 不限、`1` 一天、`7` 一周、`180` 半年 |
| `filter_duration` | `0`、`0-1`、`1-5`、`5-10000` |
| `content_type` | 字符串 `0` 不限、`1` 视频、`2` 图片、`3` 文章 |
| `search_id`、`backtrace` | 首次空字符串；分页沿用响应值 |

没有文档定义的 `count` 或 `page_size`。第一版固定一次首屏请求，限制本地处理条数，不伪造供应商未支持的分页大小。

接口说明将候选列表描述为 `business_data[].data.aweme_info`，其中：

| 业务数据 | 文档所列相对字段 |
|---|---|
| 标识、描述、时间 | `aweme_id`、`desc`、`create_time` |
| 作者和粉丝 | `author.uid`、`author.nickname`、`author.follower_count` |
| 封面 | `video.cover.url_list`、`video.origin_cover.url_list` |
| 点赞、评论、分享、收藏 | `statistics.digg_count/comment_count/share_count/collect_count` |
| 来源链接 | `share_url` |

真实外层 `data` 及列表包装仍要样本验证。`author.follower_count` 有效时直接筛选，避免逐作者查询。缺失、空值、异常数值必须显示未知，不默认当零。文档未在该摘要中明确列出 profile 所需的 `sec_user_id`；若真实搜索结果没有可用 `sec_uid`，不可把 `uid` 当 `sec_user_id` 猜用。用户资料接口仅确认参数，具体粉丝字段路径待实测。

## 小红书：最小增加两个固定操作

建议操作名 `xiaohongshu-search` 与 `xiaohongshu-profile`（仅为实现建议，当前不存在）：

| 用途 | 已核实方法与路径 | 参数 |
|---|---|---|
| 搜索笔记 | GET `/api/v1/xiaohongshu/app_v2/search_notes` | 必需 `keyword`；`page` 默认 `1`；`sort_type` 默认 `general`；`note_type` 默认 `不限`；`time_filter` 默认 `不限`；`search_id/search_session_id` 默认空；`source` 默认 `explore_feed`；`ai_mode` 默认 `0` |
| 作者资料 | GET `/api/v1/xiaohongshu/app_v2/get_user_info` | `user_id` 或 `share_text`，二选一；优先 `user_id` |

排序支持 `general/time_descending/popularity_descending/comment_descending/collect_descending/english_preferred`。类型支持 `不限/视频笔记/普通笔记/直播笔记`。时间支持 `不限/一天内/一周内/半年内`。首次页数为 1，分页需同时传回首次响应的两个搜索会话标识。没有文档定义的 `count` 或 `page_size`。

搜索定义仅承诺笔记列表与分页；没有列出精确 JSON 路径。封面、标题、点赞、评论、收藏、分享、作者 ID、粉丝、发布时间、来源 URL 和 `xsec_token` 是否首屏存在，全部需要真实样本确认。资料接口文字说明包括粉丝数，未指定字段路径。不得把其他 SDK、第三方兼容服务或旧版小红书接口的字段名直接当作本接口契约。

官方明确说明：错误或不存在的用户 ID 即使返回上游服务异常，也会正常计费。仅使用当次搜索中取得的作者 ID，去重并缓存；业务错误不得自动重试或换接口继续扣费。

笔记详情不是首屏默认步骤。若以后按需补全文字或日期，官方 `GET /api/v1/xiaohongshu/app_v2/get_image_note_detail?note_id=...` 可处理图文和视频，但视频只给封面等基础数据；`get_video_note_detail` 仅用于视频。`web_v3/fetch_note_detail` 还要求 `xsec_token`，不应作为没有令牌时的盲目回退。

## 可直接实施的调用与判定边界

1. 平台、方向/关键词、时间窗、粉丝上限、点赞下限先冻结成请求；后端用固定表映射平台与接口。第一版每次一个关键词、一个平台、一页，不自动扩词或翻页。
2. 先本地去重、按已知互动筛出有限候选，再按唯一作者补粉丝。建议首屏最多处理 20 条、最多补 5 位作者；这两个上限是产品策略，不是接口能力。总上限 `1 + 最多 5` 次，实际还受任务授权余额限制。
3. 实测抖音首屏已含有效粉丝时，最少只需 1 次。小红书按文档预估 `1 + N`，真实响应如含粉丝也可减少。未知粉丝候选单列，不能混入「已确认低粉」结果。粉丝和互动为采集时快照，不代表发布时粉丝数。
4. 本地规则负责数值阈值、时间与排名；记录规则版本、样本数、通过数、未知数、采集时间、实际请求数、缓存命中。助手只对已取得的材料补充选题角度和原因，不能新增未授权调用、补造指标或把有方向相关性等同于已达低粉爆款阈值。
5. 取消或预算耗尽后停止后续调用，保留已采集部分并明确未验证项。HTTP 成功但上游业务失败不能当作完整搜索；超时等费用未知继续沿用现有 `COST_UNKNOWN` 门禁，禁止自动重复计费。

## 最低成本实测验收（待主任务执行）

本记录没有执行下列请求：

- 抖音：一次首屏搜索，验证列表层级、有效粉丝比例、封面、来源和各指标；只有缺粉丝且带可用 `sec_uid` 时，选一位作者请求现有 profile。
- 小红书：一次 `page=1` 搜索；从响应选一位真实作者，仅一次 profile。保留脱敏结构与请求 ID，核对上游业务成功及粉丝路径；不请求详情、评论、下载、转写或模型。
- 不在这一轮验证分页；只有首屏成功且有明确需求时再测试。准确费用须取账户真实计费证据，不能以「一次请求」推导人民币金额。失败也记录已消耗或费用未知的次数。

完成上述证据后才能冻结归一化适配器。若首屏缺日期或来源，需要如实降级展示或提出有固定上限的按需详情方案，不能默认每条补全并扩大预算。

## 真实联通补记

2026-10-27 已通过独立 Electron 入口、临时加密配置副本、真实生产 broker/worker/临时任务库发送一次抖音搜索和一次小红书搜索，均为 HTTP 402。未取得真实候选和作者 ID，因此没有继续资料或作品查询，没有伪造成功 fixture。Ark 一次最短调用成功、本地 faster-whisper 短音频真实转写成功；二者不替代 TikHub 验收。证据及费用口径见 [最小真实服务联通记录](../verification/2026-10-27-live-services/README.md)。原用户设置未修改，临时副本已删除。当前服务白名单已增加 `xhs-search/xhs-profile` 与 typed 首屏搜索筛选，但小红书仍应标待真实数据验收。
