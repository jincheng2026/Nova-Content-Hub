# 锦成研究、原片与字幕运行适配

本目录是 Node 运行接口，不是新采集 provider。桌面与插件共用同一实现；打开 Vault、生成报告、校正和字幕构建不依赖 Python。真实本地 ASR 继续由工作台已有 `ServiceTools` 检查已安装的离线 Qwen 运行环境与模型。未取得的 `jc-zhuanxie` 源码、模型或字级对齐能力没有被视为已取得，也没有自动安装。

## 宿主接线

`workbench/src/main/jincheng-research-services.mts` 导出：

```ts
new JinChengResearchServices(owner, executeService, serviceTools, runQueue)
  .execute({taskId, attemptId, claimToken, workerId}, operation, input)
```

`executeService` 连接现有 `productionToolBroker`，与普通采集使用相同凭据、冻结预算、成本结算、缓存、未知费用阻断、claim 与媒体 receipt。没有新增 worker 操作；原 `productionMediaGrant` / `productionAsset` 可接受严格冻结的独立研究，媒体 grant 仍登记在准确的任务 attempt，不制造创作对象。ASR 仅能读此 attempt 的原片，研究任务只允许冻结的本地 Qwen，始终 `allowCloud:false`。

插件总 CLI 需把 `jincheng-research` 分派到 `src/commands/jincheng-research.mjs` 的 `main(args)`。命令形式：

```text
jincheng-research OP --handoff UUID (--file ABSOLUTE_JSON | --stdin)
```

JSON 只有 `{claimToken,workerId,input?}`；库绑定、研究配置、预算与服务入口来自固定 handoff。调用前仍需用已有 production claim 领取任务；提交、等待、失败、取消与人工验收继续走已有 production 合同。生成报告不表示 task 已提交或人工接受。

固定任务 parameters：

```json
{
  "workflow": "jincheng-research",
  "researchRuntime": {
    "version": 1,
    "researchId": "task-specific-id",
    "outputDirectory": "01_对标账号/已选账号/调研/本次任务",
    "route": "account",
    "platform": "douyin",
    "targetIds": ["已选sec_user_id"],
    "operations": ["profile", "user-posts", "video"],
    "maxRequests": 4,
    "comments": false,
    "videoIds": ["12345"]
  },
  "media": {"version": 1, "maxDownloads": 3, "maxBytes": 67108864},
  "comments": false,
  "budgetEnabled": true,
  "serviceConfig": {"asr": "工作台当前完整的冻结ASR配置对象；local-only/local-first，qwen3-asr"}
}
```

输出目录由所选 Vault 原资源映射产生后冻结；不能接受 renderer 的绝对路径。配置允许 `01_对标账号/`、`02_内容素材/`、`调研报告库/` 中的明确相对目录，拒绝越界、符号链接、根替换和隐式覆盖。账号/搜索对象列在 `targetIds`；视频/评论对象必须单列 `videoIds`，最多三条。没有在固定请求中列入的对象须新建或重新冻结请求，不自动扩展权限。

## 操作与结果

| operation | input | 行为 |
| --- | --- | --- |
| `prepare` | `{}` | 建本次研究状态和显式目录；不重复创建 |
| `status` | `{}` | 读回真实阶段、文件、费用请求记录与限制 |
| `readiness` | `{}` | 桌面读已有本地服务就绪检查；插件没有探测能力时明确 unavailable |
| `normalize-content` | `{rows,asOf?}` | 原作品字段、去重、低粉硬门槛与90天偏好；平台来自固定配置 |
| `collect` | `{operation,id,cursor?,search?}` | 一次已授权 TikHub 请求及原始响应归档；失败不自动重试 |
| `download` | `{videoId}` | 规范抖音链接→现有来源 receipt→安全下载→登记 grant→SHA 核对的原片归档 |
| `transcribe` | `{videoId}` | 本地 Qwen 原稿；无时间轴时标记 unknown，不猜时间 |
| `correct` | `{videoId,correction:{correctedText,corrections:[{original,corrected,reason}],reviewedBy,segments?,durationSeconds?,timePrecision?,alignmentReviewed?}}` | 保留原稿；校正分版；校验文字与时间能力；字幕另行校验 |
| `finalize-intake` | `{videoId,title,platform,author?,publishedAt?}` | 仅唯一原片、校正版和字幕全部通过后正式素材入库 |
| `save-dataset` | 原报告 schema | 保留完整规范化输入与精确引用；未冻结可新增版本 |
| `freeze-findings` | `{}` | 冻结对象材料、分析和哈希；本人材料不能提前混入 |
| `personal-advice` | `{findingsHash,advice,ownSources?:[]}` | 冻结后单独追加本人材料和建议，不能改对象发现 |
| `render-report` | `{}` | Node 原模板报告生成，返回相对路径、SHA、findingsHash、机械/视觉状态 |

账号报告使用原 `account-template.html`、`shared/reading.css`、`account-charts.mjs`、离线 ECharts 与原账号导航/搜索脚本；Node 移植数据/引用/统计和阅读组件。topic route 使用原 editorial CSS 与原 ECharts 脚本，完整复算原低粉硬门槛、漏斗和排除原因。

评论 route 接受原 `schema_version:2` 评论合同，使用原 `report-template.html`、`reading.css`、`report.js`，可执行 L1–L4 检查。固定配置可选 `commentMode`：`report`（默认，完整页 L4）、`audience-depth`（人群页 L3）、`diagnostic`（先看材料 L2）、`reference-card`（L2 快卡，保留对账/cid/证据等级/用户判断）。快卡 render 返回静态 HTML 主 `relativePath/sha256`，供 `production import` 后按回执 assetHash 提交；另有 `sourceMarkdown:{relativePath,sha256}` 保留原 Markdown，findingsHash 继续绑定冻结发现，不提升为 L3/L4。历史 `.md` 输出保持原样，需要 HTML 时显式重新 render。完整页 `save-dataset` / 对象冻结允许先到 L3，可验证建议后追加。

快卡数据保存在 `reference_card`：`audience`，`questions/objections/concerns/testable_actions` 数组，`user_judgment`；每项为 `{claim,evidence_level:'comment_evidence'|'inference',citations:[{source_id,quote}]}`。`hook` 保留同样的判断与证据，并有 `classification:fulfilled_hook|promise_unlocated|unanswered_question|unknown`、`criteria:{pinned,authorReplied,endingGuide,keywordBurst}`（值 true/false/unknown）。所有引文逐字回到输入的真实 source，评论实证必须有可回查 cid。

来源方法、全部字段和规则以包内 upstream/current references 为准，Node 移植不声称与 Python 输出字节相同。

`render-report` 返回 `visualValidation:'pending'`；生成器不会把模板存在或机械测试当作实际报告视觉验收。生成文件由正式 reader 读取时还须通过可信生成资产的受控登记；不能为此启用任意旧 HTML 脚本。

## 字幕与正式素材

`subtitles.mjs` 复用原字幕规则：校正版正文对齐原识别时间；规范化口播字符匹配至少 80%，递增无重叠，单条不超过 60 秒，覆盖一分钟以上时每分钟 6–120 条，末条不超出视频时长一秒，全文与校正版一致。校正插值仍不表示精确句/词时间经过媒体复核。原识别没有时间时保留文字研究能力，正式字幕与视频素材验收阻塞。

intake 中间产物先在所选素材目录 `.staging/`。`finalize-intake` 成功后仅发布原格式 `笔记信息.md`、`视频.<原格式>`、`转写/校正版逐字稿/<videoId>.md` 与同名 `.srt`；中间证据移到 Vault `.trash/jincheng-research/<researchId>/` 保留。既有不同版本拒绝覆盖；正式收口后后续修订需新的固定任务。

运行状态以正式目录/归档中的 `research-runtime.json` 保存，`.workbench/research-runtime` 只是定位入口。跨进程独占锁遇异常退出不自动夺取；需先核对本次任务和费用，再处理遗留锁。已有已完成采集可重读，不会另收费。仍未结清或失败的采集不会隐式重放。

## 验证边界

targeted tests 覆盖独立研究 grant/来源隔离、取消后拒绝、冻结与个人建议隔离、原片 SHA、无时轴 Qwen 的限制、原字幕算法、正式素材目录及证据归档、原离线模板与互动统计、报告 8MiB 边界。没有调用真实付费 TikHub、安装模型或验证真实 Qwen 推理。合成 Electron 页面检查不能代替正式 reader、真实数据、目标平台安装或最终包验收。

账号动态样本：固定配置可含sampleLimit（1—3）。成功collect本targetIds账号的user-posts后执行derive-samples；只从该响应前N个有效去重作品ID派生。归档responseHash和同attempt已结清broker receipt共同限制video/comments和媒体grant。其他attempt、账号或任意自造视频ID均不能借此取得许可。
