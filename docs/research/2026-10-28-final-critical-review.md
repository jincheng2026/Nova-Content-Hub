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

## 原生钥匙串启动阻塞修复定点审查

基线：HEAD `1b78f7b` 之后本轮未提交的 service-settings/service-tools/desktop/shared contracts/设置控件与 deferred 测试补丁。根因依据集成负责人提供的 `/tmp/nova-050-main-start.sample.txt`：真实已安装候选主线程在 `SecItemCopyMatching → SecKeychainItemCopyContent` 同步等待；启动在创建窗口之前经 `initialize → read → encryptionAvailable` 调用 safeStorage。审查没有读取真实密钥、触发系统许可、操作 SecurityAgent 或改动安装应用。

检查实际调用点和差异后，未发现本轮新增或遗留的可定位 P1/P2：

- 生产 main 中唯一 ServiceSettingsStore 实例在 `desktop.mts:178` 明确设置 `deferEncryptionCheck:true`；初始化、反复 read、普通设置更新和清除 Key 都只返回缓存状态，不探测 native。非 desktop 默认 eager 行为保留，没有把兼容模式误用于生产实例。
- `secret()` 先检查指定密文存在，再主动探测和解密；仅明确 Key 替换执行加密。失败保留既有设置／密文并记 unavailable；`basic_text/unsafe` 等后端限制保留，无明文回退。明确清除是用户操作，不被误称密文丢失。
- 共用本地 readiness 仅检查本地模块并返回缓存 encryptionStatus。成功本地转写后的 scrub 只调用 `redactSerialized`，不再枚举或解密其他凭据。该内存集合只登记明确取用后返回的值；轮转前已使用的值继续参与当前进程脱敏，未主动解密未取用 Key。
- 自动发布 collector 的被动 isReady 读取缓存；unchecked 时不创建观测任务。设置 UI 挂载仍仅 onLoad；unchecked/unavailable 显式区分，Key 输入、查看与重试不再因缓存 available=false 永久禁用。检查了隔离 UI probe 新断言，没有据此宣称真实系统权限界面验收。

独立运行 `node --test workbench/test/service-settings-deferred.test.mjs`：**8/8 通过，240.561 毫秒**。覆盖零 native 的启动／读取／普通保存／清除、本地 readiness 和成功转写、缺 Key 优先返回、显式操作、拒绝和加解密异常后的密文保全、拒绝明文后端、旧 API、轮转脱敏及 observer 禁止派单。集成负责人提供的 82 项目标测试、typecheck 和隔离 UI 结果作为执行方证据，本审查未重复全量运行。

范围限制保持明确：延迟探测修复的是启动、被动访问及本地 ASR 被迫访问钥匙串的问题。用户主动查看／替换 Key 或执行授权 provider 调用时，系统仍可请求许可，当前同步 native 调用仍可能等待用户；此补丁没有实现权限等待期间的独立凭据进程隔离。最终重新构建、真实安装和无需 Key 操作即可进入 Vault/原创作页的冷启动验收由集成负责人继续执行，本节不将单元测试替代该结果。

## 随包 MP4 本地转写补丁定点审查

本节只检查新增 `LOCAL_MEDIA_DECODE_SCRIPT`、localTranscribe 转码接点及既有 productionAsset 授权接点。原问题由执行方实测确认：随包 mlx_audio 读取 MP4 依赖 PATH 上的 ffmpeg/ffprobe，生产干净 PATH 下失败。最终补丁改用现有随包 timing-site 的 PyAV/native codecs；没有新增下载或系统 ffmpeg 依赖。本审查只读产品并追加本节，未修改产品／测试。

最终差异未发现确定 P1/P2：

- broker 仍先验证 task/attempt/claim/worker、ASR 授权、当前 reference 或 mediaGrant 和资产 hash，再把至多 64 MiB 的资产写入隔离临时目录。解码入口没有扩大到任意用户路径。productionAsset 实际返回 mp3/wav/mp4/m4a/webm/ogg/flac；新增转换覆盖 mp4/m4a/webm/ogg，其余沿用原入口。
- 强制解复用器 mov/matroska/ogg，`protocol_whitelist=file`，并在审查建议后显式设置 `enable_drefs=0/use_absolute_path=0`，不依赖 MOV 外部引用的隐含默认值。输入只读，输出位于 mkdtemp 子目录、权限 0600；120 秒子进程上限和 16 kHz × 7200 秒采样上限约束时间与输出规模。成功或下游失败均经 finally 删除 PCM 目录。
- 以 container start 为播放时间零点；音轨 PTS 的前置间隔写入静音，负起始样本裁掉，明显正时间重叠／无 PTS 拒绝，不能为缺时标编造对齐。Qwen 正文与 Whisper 词级计时消费同一个 WAV，未再次叠加偏移。原输入 SHA256、解码后 SHA256、containerOrigin、首样本偏移及静音数保留在 mediaDecode；原资产不改写。
- 只在已发现的随包 runtime executable/modelPath 与当前选中配置一致、且模块为 mlx_audio/qwen_asr 时转换；手配引擎与 WAV/MP3/FLAC 路径保持原调用。没有修改固定请求中的原设置、预算、provider 或执行模型选择，也没有恢复隐式凭据读取。

证据核对：`.local-probes/mp4-asr/contracts-green.log` 为 **62 项通过、0 失败、0 skipped，16.951 秒**。新增测试实际解码，PATH 限制为 `/usr/bin:/bin`；延迟测试现已 remux video 起点 0、audio 延迟 1 秒，断言静音不少于 14000 样本且总样本增加约 16000，避免仅 audio-only 容器归零的弱验证。另验证真实 PCM 转换后成功／下游失败清理（仅下游转写在这项合同测试中 stub）。

最终显式 dref 限制版真实 broker 证据已读回：`docs/verification/production/2026-10-28-installed-050-asr/mp4-2026-10-27T21-28-42.863Z/{runner-result,service-summary}.json`。记录显示通过、13.157 秒本地转写、5 个词级时间段、原资产与 mediaDecode.originalSha256 一致、预算关闭、requestsUsed=0、外部 HTTPS 尝试 0、PCM 目录已清理、隔离样例已提交接受并生成归档回执。它使用新编译 ServiceTools 与冻结候选 native payload，**不是最终重新安装应用验收**；真人语音对齐和 GUI 均明确未验。本审查未重复模型运行，也不以这些合成样例结果承诺所有平台媒体或所有语言精度。

## 安装升级后的 Documents 授权启动门禁：实施前关键约束

集成负责人提供真实 e3a1b44 安装候选的 TCC 日志 `/tmp/nova-final050-documents-tcc.log`。本审查读取确认 `kTCCServiceSystemPolicyDocumentsFolder` 的 existing code requirement 不匹配并进入 AUTHREQ_PROMPTING。当前 machine binding 自动恢复旧 Documents 库，`controller.initialize()` 的 vaultLocation 与随后 LibraryWatcher 同步 checkBinding 均会触及受保护目录。此前已通过的单元测试或模型 broker 测试不能替代这次真实安装失败，也不能将该安装记录为原生运行通过。

拟议的 packaged 安装身份 receipt 门禁可直接收敛这个启动问题：只读取 app/userData 范围内的身份与 machine-binding，安装身份不匹配时把旧 binding 及 pending 保留在内存、设 needsReselect，跳过旧库 vaultLocation、watch、reminders 和 observer，先显示可操作窗口。receipt 只是控制是否尝试自动恢复的本机记录，不是系统已授权的证明，也不替代原库 rootIdentity／CAS。

已向实现负责人指出必须处理的现有代码交叉点，尚未据方案宣布代码通过：

1. `openLibrary()` 原先先 maySwitch/noPending，UI 打开按钮也会因 pending disabled。升级后必须允许明确的“重新授权原库”选择路径；选库结果与旧 root/libraryId/dev/ino 精确一致后仅解除门禁，保留所有 pending，不能用 emptyBinding 清空恢复现场。选错库不得带着旧 pending 切换。
2. creation 的 query/retry 分支以及部分 maintenance 恢复直接使用已保存 reservation，不经 current()。实施前曾建议所有 reservation 逐一重选；该建议经主线程架构收敛后撤回，不能据此扩展业务授权门禁。最终只禁止门禁期间自动读取旧 current；明确同库重选后原显式恢复继续按既有身份/CAS/系统权限执行。creation 无 current 时没有自动源读取，不新增重选死锁。具体核对见下节。
3. receipt 只在用户完成对应 OpenPanel 选择、受控 worker 身份核验成功、binding 持久化成功后原子写入。取消、选择错误目录、bind 失败都不写。创建／恢复的 receipt 不得先于实际成功固定目标。文件损坏、缺失或原子写失败必须保守返回需重选并保留原 binding/pending，不能降级为默认许可。
4. 安装身份字段应至少区分平台、架构、本机绝对 exe 路径、dev/ino、版本与 mtime，按目标平台路径规则比较；不是从用户内容或跨平台同步来的授权记录。非 packaged harness 保留既有初始化行为。没有旧库时不默认探测 Documents。

必要验证是首启加载零旧库 worker/watch 调用、所有 pending 原字段保全、取消／错选／失败不留 receipt、精确同库重选后可恢复、未完成 creation 的原显式恢复仍可用、receipt 缺坏回退、同安装下次启动正常恢复以及异安装身份重新门禁。最终仍需新冻结安装包在真实 macOS 上完成冷启动与明确选库验证；此节为实施前审查指导，不是修复验收结果。


## Documents 首启门禁最终定点复核

审查范围为本轮 `controller.mts`、`desktop.mts`、`startup-access.mts`、`app.tsx` 和新增启动专项；按主线程最终决定，receipt 仅是“本安装是否已明确选库”的自动恢复启发式，不是系统权限或跨 root 业务授权凭据。没有新增所有 reservation 逐一 OpenPanel 的要求，也没有把系统可能再次提示当作永久禁止恢复的理由。

实际差异确认如下：

- packaged 且可见启动读取 executable 的绝对路径、platform/arch、version、dev/ino、size/mtimeNs，与 app-local receipt 精确比较。缺失、损坏、符号链接、身份不可读均退回需重选；复用原安全 local-record 读取与临时文件 fsync/rename 写入，不触碰内容库路径。开发及 `show:false` harness 保持原初始化。
- 只有已有 current 时新安装要求在内存设 needsReselect；初次加载不重写 machine binding，全部 pending 原字段保全，跳过 vaultLocation。watcher 绑定 null，reminders/canRemind 与 observer listBindings 均拒绝此状态；renderer 初次读取与工作区挂载也显式跳过。通用 IPC 和本地文件导入在调用 controller 前检查门禁，避免绕过 current() 的旧路径访问。
- `status()` / `readMaintenanceStatus()` 只拼接内存状态。renderer `recover()` 中 query/retry creation，以及 MaintenancePanel 的 recover/queryUpgrade/continue 均来自明确按钮事件，未找到无点击便自动访问额外 reservation root 的调用。因此 creation 无 current 保留原显式恢复入口；同库重选后 maintenance/creation 的原身份、路径和 CAS 合同不变。
- 明确重选若存在 11 类任一 pending，worker bind 返回的 root/libraryId/dev/ino 必须与旧 current 一致，随后只清 needsReselect 并保存原 binding。选错、取消、bind/保存失败不写 receipt。实际 visible Vault 选择能映射到相同 hidden runtime，保留 pending。
- 复核中指出的一个 P2 已修：原新分支即使没有 pending 也强制原目录，旧磁盘不可恢复时会阻止用户显式打开其他库。最终仅有 pending 才要求同库；无 pending 沿原 maySwitch + 明确 OpenPanel + bind + 成功 persist 切库流程，旧指针保留到新选择成功，不自动读取旧位置。
- desktop 仅在选库/建库/打开已升级库方法成功返回、已有 current 且门禁已解除后写 receipt。门禁期间取消不记录；receipt 写失败不冒充成功，下次启动再次重选。receipt 不声明其他 pending root 获得系统授权，后续恢复仍需用户显式动作。

独立运行最终 `node --test workbench/test/startup-access.test.mjs`：**10 项通过，0 失败、0 skipped，2.404 秒**。覆盖零旧源 worker 调用、binding 字节保全、IPC 门禁、取消/错选/绑定或保存失败、同安装恢复、exe/版本/路径/平台/架构变更、损坏/链接 receipt、空库、开发 harness、真实 visible Vault 同库重选、无 pending 更换不可访问旧库、creation 无 current 原恢复可用。执行负责人另报告 native/renderer typecheck 及相关 42 项回归通过；本审查未重复全仓测试或触碰真实用户库。

最终结论：这轮定点范围没有剩余可定位 P1/P2，可以冻结源码进入重新构建和安装验证。先前 e3a1b44 候选的 Documents TCC 阻塞仍是已观察到的真实安装失败，不能被此单元测试结果覆盖；新包是否能在系统许可待定时先显示窗口，以及明确选库后的恢复，必须按最终安装产物记录。本审查没有触发、批准或操作系统权限界面。
