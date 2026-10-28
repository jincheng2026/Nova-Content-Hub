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


## 取消选库后的 renderer 刷新：三行最终复核

本节仅复核 `app.tsx` 的三行条件差异：automaticRefresh 增加 needsReselect 拦截，nativeAction.finally 增加相同条件，自动刷新 effect 增加 needsReselect 依赖。此前真实安装候选取消 OpenPanel 后仍试图读取旧工作区并显示 LIBRARY_NOT_READY；这是真实 P2，原 native IPC 门禁虽保住源访问，renderer 仍需停止无效请求。

本轮没有发现新增 P1/P2。automaticRefresh 在门禁分支直接返回，尚未清 changesPending，因此不丢待刷新信号。成功选择后的 needsReselect true→false 会触发新增 effect，且 finally 的 active/acting 解锁保留，正常库读取仍恢复。取消时状态仍为 needsReselect，finally 只刷新 status，不再读工作区；焦点与可见性事件同样被挡住。原 guard 对 dirty 和 managed drafts 的保护及用户保存/放弃流程完全未改，没有新增绕过草稿保护的入口；没有把既有 clearEditor 行为改成新自动丢弃。

已读执行方隔离真实 Electron/完整 renderer 点击证据 `/private/var/folders/vl/nhqtk_8s6vl5j679xhv_z3n80000gn/T/nova-selection-cancel-ui-zT4gFY/result.json`：受控 dialog 返回 null 后只有 openLibrary/status/status，sourceCalls 和 workerCalls 均为空，errors 为空，needsReselect 仍 true，binding SHA256 前后一致。它明确不声称真实 OS panel 或安装应用验收；执行方报告 types 通过。本审查没有重复跑全套，也没有竞争读取真实大库。该三行补丁可进入最终合批构建。


## 原报告相对链接恢复：注册导航桥最终审查

本节仅检查新增 `report-navigation.mts` 与 production-worker、production-pages、shared contract 接线。原『内容作战手册.html』引用 `../2026-08-17_AI需求全景/人群1-门外观望的普通人.html`，原包目标存在；隔离 iframe 的 UUID 路由改变相对基址，原链接实际无法由现有路由命中。这是已确认的原功能回归，不能把单页成功展示视为完整工作流等价。

最终新增桥没有发现剩余确定 P1/P2：

- `report-navigation.mts:19–27` 按段仅解码一次，拒绝协议、绝对路径、查询串、编码分隔符、残余百分号/重复编码、NUL 与规范化后的根外路径；只产生数据索引，不把请求路径直接交文件读取。未知路径先与 registry 比较，不读取未注册目标。
- `:30–45` 同时校验源页与目标页当前未删除、currentBody=original、唯一 originalPages 登记、同 sourceId 的内部 reports 来源、原路径确属该来源、原文件 hash 与当前 prepareOfflineReport 后 assetHash。raw 与 prepared hash 分开，避免因离线 CSS 内联而误拒原目标。源/目标正文替换、来源缺失、管理正文与多候选歧义均不能进入可导航映射。
- `:48–69` 的 fingerprint 包含源 report/page、源原件身份、展示 HTML hash 与有序完整映射，目标固定 report/page UUID 及当前身份。父 wrapper 验证 event.source、null origin、pageId 和 nonce；iframe 只交索引。nonce 是 wrapper 上下文标识，不被当作源脚本无法看到的秘密；权限来自服务端固定映射，未扩大为文件/API 访问。
- `production-pages.mts` 的 POST /navigate 只接受 pageId/index/fingerprint/nonce，校验同 origin、JSON 和 4 KiB 上限；根据服务端保存的旧映射固定目标，再重取当前源完整 fingerprint 与目标 pageIdentity。签发 capability 后，目标实际 wrapper/page GET 再核 reportGuard，覆盖点击到载入之间的修改。既有 desktop authorize 对当前 binding 的 root/libraryId/dev/ino 复验仍保留；换库后旧 capability 不能继续读取。
- 没有增加任意 path/file/URL 路由，没有放宽 iframe sandbox 或 CSP。纯本页 #anchor 不拦截，原折叠和隔离脚本仍保留，外部作品仍走既有 sources 通道。导航 context 有 256 条上限并在 close 清理。

本轮复核发现且已修复一个 P2：最初跨文件 `#detail` 只追加到外层 wrapper URL，正文 iframe 没有 hash，无法定位正文。最终 fragment 固定进 capability、参与复用匹配，且只以 HTML 属性转义后的 fragment 追加到所选目标 iframe src；其他页不继承该锚点。

独立验证：额外 12 条解析边界断言通过；新 `production-report-navigation.test.mjs` **5/5 通过，5.810 秒**，覆盖真实原 href 的 worker+HTTP capability、raw/prepared 差异、未知目标、失效/删除/管理正文/跨来源/歧义、编码逃逸和 VM 消息边界。fragment 实际 iframe 断言加入后，仅重跑对应 HTTP 测试 **1/1 通过，2.403 秒**，没有重复全仓或真实大库。执行负责人另确认 native/renderer typecheck、4 个相关测试文件 **12/12 通过，6.65 秒**及 diff whitespace 检查通过。

范围限制：上述使用隔离真实 Vault、worker 与 HTTP 服务，并用原 href 构造 fixture；注入桥与父桥的事件校验用 VM 执行。执行方核查两个真实原 HTML 没有额外 meta CSP，但尚未在最终安装包浏览器/Electron 内点击真实『内容作战』链接。本审查未改原件、Demo、已安装应用或全局授权。源码可合批冻结；真实原页点击及最终安装验收仍需随最终构建记录，不据此宣称全部原工作流 100% 等价。


## 原报告未列入 meta.pages 的来源附页：补充注册审查

真实报告盘点发现 17 个链接指向原包已提供的来源材料附页（4 个不同锚点），该页不在 meta.pages 中。旧服务允许读取该原文件，仅恢复已有 registry 的跳转不足以覆盖原交互。本轮仅审 `resources.mjs` 的附页注册与升级投影测试；没有放宽导航服务为任意文件路由。

最终代码检查：从声明页实际 a.href 中提取直接引用，按段单次解码，拒绝协议、绝对路径、查询串、编码分隔符、控制字符、二次编码、根外和隐藏文件。只接受同 sourceId、同目录且已在当前 snapshot 中的唯一 HTML sibling；未知、链接到别组和未扫描目标不读取。workbenchVisible=false 仍在附页处理前排除。附页列表先完整计算后才附加，因此不递归跟随附页里的新链接，范围受原来源快照数量与每页 8 MiB 限制。

附页 UUID 使用既有 vaultId/sourceId/sourceRelativePath 规则，记录原始 hash，离线准备后另存 assetHash，并进入 originalPages 和 inventory。PROJECTION_POLICY_VERSION 4→5 已进入 inputFingerprint 和分类 fingerprint，旧输入未变也会重新分类，随后稳定缓存；既有 companion 管理档案、pageOverrides 和 managed markdown 的优先级保持原逻辑。附页只成为注册页，既有消息桥、目标版本 guard、当前库身份核对均未放宽。

本轮发现并独立复现的 P2 已修：有效声明主页引用存在但非 HTML 的可选旁页时，初版 htmlBytes 抛错会被整个组的 catch 接住，导致 reports=[]。最终只对该附页记录 INVALID_INPUT issue 并跳过，保留声明主页；若以前已登记的附页随后损坏，保留历史报告并标 source-missing，不静默以坏数据覆盖。

验证期间指出并加强了一个测试缺口：只删除 inputFingerprint 会命中 classified fingerprint 相同的早退，不能证明重投影保全。最终用例在保存作者数据后实际新增附页并修改声明主页 href，强制源 hash、inventory 和资源 entry 改变。独立运行这 **4 个重投影用例全部通过，13.127 秒**：metadata/deleted 的原 3 页 ID 保留并补第 4 页；managed-pages/managed-markdown 当前正文 exact 不变；标题、账号关联、deletedAt 与原附页字节保全。此前独立运行也通过了直接注册去重/稳定 ID、17 链接的 4 锚点映射、逃逸/隐藏/缺失快照/非递归边界与坏附页新库/已投影库保护；中间 3 个 fixture 断言失败是二次 saveReport 自身省略 accountIds 先清空关联，已在测试输入修正并先断言当前关联存在，未据此误报产品丢绑定。

当前本轮代码无剩余可定位 P1/P2。实际旧 policy4 缓存升级与最终已安装报告点击的证据应随执行方产物记录；这里的定点源码及隔离测试不替代真实安装验收，也不把未提供的任意来源自动纳入权限。

补充已核读执行方 `/tmp/nova-appendix-upgrade-audit.after.json`：真实旧源码生成的缓存 before 为 policy4、2 页；新源码同库打开后 policy5、3 页，reportId 不变，4 个原源文件 SHA256 清单不变，第二次 report 与 editToken 稳定。执行方新 8 项专项全部通过（18.61 秒）；48 项相关回归尚在执行，本审查不预报其通过。该旧缓存升级证据闭合本轮迁移验证缺口，最终安装后的真实点击仍另行验收。


## 原报告六个文本附件：最小 reader 架构与定点复核

本轮补充已核实原包提供且原服务支持的 6 个附件：珍妮报告的 3 个 CSV，以及 AI 科普独立 research_report.html 的研究结论 Markdown、视频明细 CSV、statistics.json。设计已直接与唯一实现负责人对齐，最终审查实际 helper/worker/HTTP capability/desktop allowlist/shared contract/worker-client 差异；不新增任意路径路由。

当前实际补丁未发现剩余可定位 P1/P2：

- 源报告仍须未删除、currentBody=original，并核对登记原件 raw hash 与 prepare 后的当前 page.assetHash。分组报告沿用 explicit sourceId/originalPages。独立单页 HTML 缺 sourceId 时，仅以 meta.vault 已登记原件 relativePath 匹配现有 source-map 的唯一内部根，重叠或缺失拒绝；显式无效 sourceId 不回退。实际 AI 科普原件位于默认 accounts/benchmark-accounts 来源，因此支持该现有角色，不把来源误限成 reports/materials，也不根据附件 href 推断更大的根。
- 实际链接扫描剔除 comment 和 script/style/textarea/title/xmp 文本块，href 属性不匹配 data-href。单次分段解码与路径规范化后，只在当前已绑定来源 catalog 中精确匹配原页和 md/txt/csv/json 附件；catalog 每来源每轮映射最多取一次。未知、跨根、协议、查询串、符号链接、非 UTF-8 或含 NUL 的候选不可导航。resolved source root 自身也拒绝隐藏段、node_modules、skills 和备份目录，防止从框架目录内部开始遍历而漏掉根名称。
- 8 MiB 限制并非仅在读取后判断：readBoundSourceCatalog 在 lstat 阶段过滤超限/硬链接，精确匹配后才调用 readBoundSourceFile；后者 core.readBytes 再执行打开前 stat 和打开后 fstat 的 8 MiB 检查。附件路径不能触发隐藏 .workbench 特殊大文件分支。
- 导航 target 是 report/attachment union；附件仅返回固定 id/identity，原路径留在 worker 内。productionReportAttachment 严格接受 binding/reportId/pageId/fingerprint/index，不接收 path/URL/filename。capability 固定保存源 report/page、完整映射 fingerprint、index 与附件 identity。预览 GET 和 /download 每次重新校验当前库、源原件、映射与附件 expectedHash，过期内容不能借旧 cap 继续读取。
- 预览是转义的标题和 pre，无附件脚本或 HTML 执行。UTF-8 decoder 可移除显示用 BOM；下载独立返回原 Uint8Array，保留 BOM、CRLF 和所有原字节，application/octet-stream + attachment + nosniff。文件名检查控制字符/分隔符，采用固定 ASCII fallback 与 RFC5987 filename*，不允许 CRLF 注入。下载是固定 cap 子路径，没有新增任意文件输入。
- 原报告 sandbox/CSP 和既有外部作品 sources 通道保留。desktop worker allowlist 只增本固定附件读取操作，worker-client 把它归入已有 15 秒有界读重试，没有放宽 Vault deadline 或任务授权。

独立运行新增正例 **2/2 通过，5.368 秒**：真实 Vault/worker/HTTP 测试覆盖 BOM+CRLF、恶意 HTML 文本转义、原字节下载、附件变化后预览/下载 cap 双拒绝，以及独立 HTML 对默认 accounts 来源的回溯和重叠拒绝。随后新负例 **1/1 通过，1.936 秒**，覆盖假 href、非法 UTF-8/NUL、缺失/symlink/逃根/查询串、managed/deleted/无效显式 source/原件及 prepared hash 失效。检查了最终新增框架源根专项与 sourceDirectory 的实际调用位置，没有因此重复全仓测试。

本节仍是定点源码与隔离链路验收。6 个真实附件的完整映射和最终安装包的原页点击/下载应由集成证据另行确认；不把受控测试结果替代最终安装验收。


## 报告附件返回后 iframe 空白：history 恢复补丁源码复核

集成负责人在实际已安装 baf 候选上确认：报告打开 Markdown 附件并完成原字节下载后，Chrome Back 返回已重新请求的新 wrapper/new nonce，但 opaque iframe 长时间停在 about:blank；直接重开正常。因此不能仅按 BFCache persisted=true 处理，也不能把此前导航/下载 HTTP 测试当作浏览器历史正常的证明。

本轮只读检查 `production-pages.mts` 的固定 frameSrc 与 pageshow handler，以及新增 history 专项；未更改产品、模板、CSP、sandbox、原页写入或插件版本。最终源码暂无新增确定 P1/P2：frameSrc 由服务端 capability/page UUID/bridge nonce/已验证 fragment 生成，同值经属性转义和 JSON 序列化传入；恢复不读取 DOM src 或 location 参数来决定 URL。pageshow 在 persisted 或 performance navigation.type=back_forward 时清除旧 timer，并用 setTimeout(0) 推迟到当前 history 恢复任务之后；只重设仍 connected 的该 iframe，重置 BFCache 可能保留的 navigating=true。没有父页 reload、pushState、replaceState 或额外业务写入；GET frame 仍走原 capability 与版本验证，失效 nonce 不会自动续授权。

独立执行 `node --test workbench/test/production-report-history.test.mjs`：**2/2 通过，2.997 秒**。覆盖 persisted=true 和 persisted=false/back_forward、新 wrapper nonce 对应的固定 iframe URL、初次 navigate 不重载、detached frame 不操作、重复 pageshow 仅一个 timer、恢复后的再次附件导航，以及真实 worker/HTTP 下 iframe 和附件预览/下载。执行方另报告 15 项 targeted 和 native typecheck 通过。

这些条件/计时器断言以 VM 执行，HTTP 可用性也不等于实际 joint-session-history 正常。必须由主线程唯一 Chrome 操作者完成：Back 后正文、再点同附件、Forward 栈、带 fragment 页返回。子 frame 重导航是否影响 forward 栈是本轮必须实测的浏览器行为；在真实结果前仅给源码范围通过，不宣布已修复真实 Chrome 空白。最终安装包仍需随新冻结产物验收。


### History 实测纠正与 replace-only 候选

后续主线程排除了 CUA 跨导航旧 Tab handle 的干扰：旧已安装 baf 返回后，重新取得同 tab 两次仍显示 about:blank，原生 Chrome 前台 AX 也只有 wrapper，真实 P2 保持成立。同时真实 Chrome 证明前述 iframe.src 赋值候选虽然恢复正文，却清除了 Forward 历史（Cannot navigate forward: no next page）。因此前一节的静态/VM通过不能作为该候选合入依据，src 方案作废。

唯一修正点现为：服务端生成绝对 http://127.0.0.1 固定 cap/page/nonce/已核 fragment URL，pageshow 的下一任务仅调用 `frame.contentWindow.location.replace(config.frameSrc)`，不读 child location 或 DOM 地址；无 src fallback，无 parent history/reload，无 CSP/sandbox 变化。若跨 opaque Location.replace 被浏览器拒绝，只显示固定恢复失败提示并保留从目录重开路径。VM 将 src setter 设为抛错并断言零调用，确保不会回退到已知破坏 Forward 的方式。

本审查复读实际 replace-only 差异并独立运行新 2 项 history 测试，**2/2 通过，5.175 秒**。执行负责人报告相应 15 项 targeted 通过、native typecheck 通过，并补充 SecurityError 提示用例。静态范围暂无新增确定 P1/P2；跨 opaque replace 是否允许、Back→Forward→Back→再次点击与 fragment 的实际结果仍以主线程唯一 Chrome 操作者验收为准，未获得该证据前不宣布可合入。


### Replace-only 候选的真实 Chrome 验收收口

主线程唯一浏览器操作者已在 `127.0.0.1:65450` 的 replace-only 实际 ProductionPages fixture 完成连续操作：报告 → Markdown 附件 → Back 返回报告正文 → Forward 返回同 Markdown → Back 返回正文 → 再次点击该附件 → Back 返回正文 → 本页 `#detail` 锚点及 details 展开。主线程确认上述链路全部成功，Forward 未被清除，恢复后的 navigating 状态未阻止再次点击，正文与折叠交互均可用。此结果补齐上一节留下的真实浏览器行为门槛；不再以 VM 推断 joint-session-history 的正确性。

本审查读回了 `docs/verification/production/2026-10-28-final-050-arm64-v4/history-fix-reclick.md.txt`：实际 Chrome tab 展示研究结论.md 的纯文本预览与固定下载链接；另读回 `history-fix-anchor-and-expand.txt`，确认报告页 details 已 expanded 且正文“折叠交互仍可用”可见，对应截图为同目录 `history-fix-anchor-and-expand.png`。连续 Back/Forward 成功及 #detail URL 的详细操作证据保留在主线程实际工具输出；这两份静态 AX 文件并不单独证明完整历史序列。

窄审查结论：**replace-only 候选可以合入并进入最终重建/安装验收，本轮无遗留确定 P1/P2**。固定绝对服务端 URL、原 capability/版本 guard、CSP/sandbox 和无 src fallback 的边界不变。此前 `iframe.src` 赋值候选真实清空 Forward 的红色结果继续保留，该候选已废弃，不能用它的测试通过记录替代最终方案。此次通过的是真实 Chrome 对当前源码 fixture 的历史链路，尚不把它表述为重新构建后的安装包已验收；最终产物仍应按冻结版本与哈希记录。
