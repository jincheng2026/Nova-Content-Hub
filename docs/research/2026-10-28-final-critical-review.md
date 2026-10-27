# 最终关键差异审查

日期：2026-10-28。审查基线：分支 `codex/second-brain-workbench-rebuild`，HEAD `4ef7f65`，包括当时未提交实现与新增文件。依据纠偏设计、workflow equivalence plan 及当日三份原业务/第二大脑/Nova 差距审计。本报告仅列实际定位并复现的 P1/P2；不重复 creation-frame 已修问题，不审不可变 upstream 方法原件。

检查了真实 `git diff` 的 desktop、boundary/preload、controller、production-controller/pages/services、bound-reader、vault core/bridge/source-map 接线，以及新增 publication observer/collector/worker/runtime、source worker、stage controller/worker。没有联网、真实平台采集、执行原件程序或修改产品代码。以下复现使用系统临时目录和实际导出的函数；临时目录已清除。此次是定点关键审查，不宣称全业务、双宿主或安装验收通过。

## 1. [P1] 外部正式档案仅凭同号 T 自动成为当前内容的发布及复盘事实

位置：`plugin-src/src/lib/publication-runtime/index.mjs:27` 的 `linkedArchives()`；结果升级位于同文件 `:28` 的 `readPublicationFacts()`。

触发：用户关联一个正式档案目录，其中有来自另一个知识库的同号 T。匹配条件是 `m.work_id===work.workId && m.nova?.vault_id!==work.vaultId`，实际恰好接受不同 vault 身份，旧档案没有 nova.vault_id 也会通过。随后只要该档案有发布链接/时间，当前内容就被标记 `published`；只有一个匹配时还直接继承其 `review`。目录关联只授予读取该来源，不能代表作者已逐条确认同号作品属于当前内容。

实际复现：新建空库和未发布 T001 草稿，另建外部 `foreign-video/.system/manifest.json`（schema 2、work_id T001、不同随机 vault_id、video_id unrelated_video、已发布及已复盘），通过实际 `linkSource(... role:'official-archives')` 关联，调用实际 `readPublicationFacts()`。输出：

```json
{"publication":"published","archive":"linked-read-only","review":{"status":"reviewed","summary":"另一个知识库同号内容的已确认复盘"},"externalVideo":"unrelated_video"}
```

影响：当前未发布稿显示已有真实发布及作者确认复盘，污染业务事实；这与计划明确的 `(vaultId, workId)` / `(sourceId, videoId)` 身份和不得同号合并要求相冲突。把档案显示为只读并不能消除错误关联。

建议：只有经过确认并持久化的 `(sourceId, videoId) → (vaultId, workId)` 映射可贡献当前内容事实。没有可靠原 vault 身份的历史档案，先展示待关联候选；已知 foreign vault_id 的同号档案不能自动匹配。验证两库同号互不影响、旧无 vault_id 档案需明确关联、准确关联后可读且重开保持。

## 2. [P2] 正常退出未等待 observer 完成，已预约的观测无法写入终态

位置：`workbench/src/main/desktop.mts:110–118`；`workbench/src/main/publication-observer.mts:18–22`。重开跳过条件为 observer `:16`。

触发：observer 已写入 reservation，正在 `collectOnce()` 的异步阶段（例如 collector 的 freshness 检查、HTTP 客户端返回或任务提交），此时正常退出。`stop()` 只清 interval，不返回/等待正在运行的 tick；退出等待 pages/broker，但没有等待 observer 的客户端后续提交和 `publicationFinishObservation`，随后关闭共享队列。broker 的服务处理结束也不等于 collector/observer 的后处理已结束。

实际复现：使用真实 `createPublicationObserver()` 和 `createOperationQueue()`，worker stub 完成 due/reserve 后让 collection 保持未完成；按 desktop 顺序 `observer.stop(); await queue.close()`，再完成 collection。输出：

```json
{"calls":["publicationDue","publicationReserveObservation"],"errors":["WORKER_STOPPED"],"reservation":{"id":"reserved","status":"reserved"}}
```

影响：`publicationFinishObservation` 未执行，预约仍是 reserved；重开后的 `item.reservation` 无条件跳过，永远不会自动核验原请求的结果。若原请求已经付费成功，还可能失去将已取得数据自动归入正式档案的机会。当前“不自动重试未知付费请求”的规则是正确的，但不能以永久 reserved 代替核验和终态回执。

建议：observer 保存 in-flight tick Promise，提供停止新调度并 drain 当前 tick 的异步关闭契约；退出阶段保留队列/worker，直到 observer 的原请求完成或明确写入 unknown 回执，再关闭资源。避免在 drain 之前关闭 collector 必需的 broker；对于进程强杀留下的 reserved，重开只核对已存在 task/cost/result，不重新发付费请求。验证 reservation 后退出、已计费响应后退出、finish 写回前退出以及重开恢复。

## 范围结论

确认 **1 项 P1、1 项 P2**，均已将最小复现结果通知集成负责人。源页面写入包含独立 capability、来源 hash、sandbox、路径/root identity 检查，未在本次聚焦检查中证实新的可报告信任边界绕过；这不等于完整安全审计通过。其余已读接线未发现足够确定的新 P1/P2，不以代码量或报告存在推断功能等价完成。

## 最终性能／本地语音初始化补丁定点审查

基线：HEAD `52d36f5` 之后的未提交补丁；本节不重复此前业务和创作页审查。读取实际 `bridge.mjs`、`resources.mjs`、`service-tools.mts` 差异及相关有限调用链，没有修改产品代码。此轮 `core.mjs`、bound-reader、worker deadline 没有新增差异。

初版发现两类 P2，均在本轮修复后复核通过：

- **明确声明为报告的 jc-doc 被误当作仅正文页缓存。** 原 `creationOnly` 直接忽略所有 drafts jc-doc 的 hash/bytes。临时真实库中，管理块声明 `kind:report` 的页面正文 AAAA→BBBB 后，`readProduction()` 返回旧 asset，`hasNewText=false`。修法现为 `resources.mjs:293–307`：仅上次 inventory 已验证 excluded 的创作页可尝试排除；变化页面定点读回并验证 hash，检查 management 和 frontmatter 的 `type/kind=report/research-report`。中途复核还实际复现了“excluded 页面新增 frontmatter 报告声明后 reports 仍为 0”，已补上对应 predicate 和回归。原本已是报告的页面不再忽略完整 hash。
- **关联报告 CSS 变化后离线预览仍保留旧 CSS。** 原 reports catalog 提前过滤 sidecar，且对象 `sourceEntry` 没有依赖 hash。临时库关联 `group/report.html` 和 `theme.css`，red→blue 后旧输出 `assetChanged=false, hasBlue=false`。现 linked sidecar 参与当前输入签名；实际 script/style 引用的 hash 进入 sourceEntry，触发该报告重新导入。账号图片也加入 imageDependencies，导入前后校验当前 hash。

最终检查：资源输入签名同时包含 libraryId、vault root/vaultId、完整 source-map、bound sources/可用性、source issues 和当前文件清单；新增、删除、绑定根替换与资源 hash 变更均能使相关读重新分类。仅内容列表／正文读在首次 hydration 后跳过无关资源投影，资源 API 下次读取仍重新取得输入签名；没有增加 TTL。原 pending recovery 和 runtime asset checksum 校验仍经真实 API 执行。没有发现这轮补丁新增的跨库元数据复用或其他可定位 P1/P2。

独立验证运行：`node --test plugin-src/src/lib/vault/test/resource-read-performance.test.mjs` 的前 9 项全部通过（10.320 秒），覆盖外改、同尺寸同 mtime、source-map、linked root 替换、资产损坏和 pending 事务恢复，以及本轮报告／CSS／图片回归。随后只对新增 frontmatter 修正运行 `--test-name-pattern=frontmatter`，1 项通过，包含 excluded→声明报告和声明后的正文变化。没有为无变化代码再次全仓测试。

语音初始化只将实际 Python 模块 import 的上限改为 `LOCAL_ASR_INIT_TIMEOUT_MS=120000`（`service-tools.mts:128`）；超时独立返回 `LOCAL_ASR_INIT_TIMEOUT`，readiness 仍为 unavailable（`:131`），非零退出／缺组件仍区分为不可用。离线环境变量保留，没有把初始化失败变成云端授权，也没有延长 Vault 读取 deadline。核对执行负责人产出的 `.local-probes/asr-init-green.log`（3/3）及 `.local-probes/asr-init-contracts-green.log`（60/60，10.317 秒）：覆盖 30 秒后仍 pending、120 秒超时不宣告就绪、beforeExecute 未预约费用、冻结设置及相关服务契约。负责人另报告 native/renderer typecheck 通过；本审查不将它冒充真实安装或冷启动实测。

本节结论：已发现的缓存 P2 在当前补丁中闭环；当前定点范围没有遗留新 P1/P2。实际 10,916 文件库的速度与最终安装包冷启动效果由集成／执行证据确认，本审查未独立复跑该大型真实库，也未新增视觉验收结论。
