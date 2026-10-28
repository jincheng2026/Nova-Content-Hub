# 同事交付准备只读审查

> 时点补充：本分报告采集时源码版本仍为0.5.2；主线程15:34的独立快照已为0.5.3，新增方法代码另见增补报告。最终交付包仍为0.5.2，此处安装和产物结论不变。

审查时间：2026-10-28；工作区 `/Users/mac/code/dashboard/Nova-Content-Hub`。只读产品源码和既存产物；未安装、未启动宿主、未改全局配置、未调用付费服务、未写用户内容库。唯一输出为本报告。未执行全量测试。

## 结论

现有 0.5.2 可作为 **Apple Silicon Mac 的受限预览检查点**，不能据此承诺“任意同事拿包、打开自己的第二大脑，就能直接完成全部业务”。可直接用的本地浏览/编辑核心与需要助手、插件、联网凭证的业务必须区分。最终 0.5.2 尚无安装后独立运行、同版宿主缓存、真实模型业务的验收；本机已安装仍为 0.5.1。此为真实交付门禁缺口，不冒充已经观察到的安装失败。

确认一项 P2：交付条件只写 M 系列，然而内置本地转写只接受 macOS 26。未在本次范围确认新的确定 P1 产品缺陷。下面列出的验收缺口应当阻止扩大支持声明，但不人为升级成确定代码 bug。

## 平台状态

| 目标 | 0.5.2 已构建 | 0.5.2 已安装 | 安装后原生运行 | 目前可作出的结论 |
|---|---|---|---|---|
| darwin-arm64 / macOS 26 | 是，最终 DMG 与归档 .app 存在；本次重算 SHA256 相符 | 无；本次读 `/Applications/自媒体工作台.app/Contents/Info.plist` 为 0.5.1 | 无 0.5.2 证据 | 最终镜像元数据/签名与静态资源已核验；业务首启待验 |
| darwin-arm64 / macOS 13、14、15 | 同一个 DMG 声明最低 13.0 | 无 | 无 | 壳可被最低版本允许启动；内置 Qwen discovery 确定拒绝这些 major，不能承诺离线转写 |
| darwin-x64 | 未发现本轮最终包 | 未验 | 未验 | 需对应原生 runner、独立包与原生机；未支持结果 |
| win32-x64 | 未发现本轮最终包 | 未验 | 未验 | 仅有 NSIS 配置，不能代表已构建/安装/运行 |
| win32-arm64 | 未发现本轮最终包 | 未验 | 未验 | 未纳入已验交付 |

证据：`docs/verification/production/2026-10-28-final-052-arm64/README.md`、`artifacts.json`、`delivery-artifacts.json`；本地 `workbench/release/` 只有 `darwin-arm64` 本轮安装包目录。`workbench/scripts/dist.mjs:31` 拒绝非同平台/架构打包，符合原生 runner 策略。`dist.mjs:175` 起的 Windows 配置是实现计划存在的证据，不是 Windows 验收。

## 确定发现

### [P2] 给同事的适用系统遗漏 macOS 26，导致受宣称覆盖的 M 系列无法使用内置离线转写

代码定位：[local-asr-runtime.mts](/Users/mac/code/dashboard/Nova-Content-Hub/workbench/src/main/local-asr-runtime.mts:27)，关联 [dist.mjs](/Users/mac/code/dashboard/Nova-Content-Hub/workbench/scripts/dist.mjs:172)、[service-tools.mts](/Users/mac/code/dashboard/Nova-Content-Hub/workbench/src/main/service-tools.mts:153)。

交付目录 `/Users/mac/Desktop/自媒体工作台-0.5.2-交付/README.txt` 只写“适用：Apple Silicon Mac（M系列）”，没有系统版本前提。最终 .app 的 `LSMinimumSystemVersion` 为 13.0；但最终归档 .app 的 `Contents/Resources/local-asr/darwin-arm64/runtime.json` 为 `macOSMajor:26`，discovery 要求 `m.macOSMajor === native.macOSMajor`。当用户没有高级自配路径时，discovery 被拒绝后保留空 Python/模型路径，`localModule` 第158行抛 `LOCAL_ASR_UNAVAILABLE`。默认 local-first 并不把内置语音变成所有 macOS 可用；云端也需要单独授权、预算和凭证。

本次对最终归档 .app 的真实载荷调用纯 discovery 函数，显式传目标而不运行 Python：

```
darwin arm64 macOSMajor 13 -> selected=false
darwin arm64 macOSMajor 14 -> selected=false
darwin arm64 macOSMajor 15 -> selected=false
darwin arm64 macOSMajor 26 -> selected=true
```

归档路径：`/Users/mac/code/dashboard/Nova-Content-Hub/workbench/release/darwin-arm64/preview/.packaged-apps.noindex/build-P9l3G4/mac-arm64/自媒体工作台.app`。载荷选择失败是确定结果；并未声称其他 OS 上的整个壳或其他功能不能运行。建议当前交付说明明确“内置离线转写仅 macOS 26 原生 arm64”，并使设置的能力提示说出实际不匹配版本；若目标是支持较旧 macOS，应独立验证兼容 runtime 后扩展，而非直接删除门禁。

## 安装者实际需要的前置条件

1. **系统与空间**：当前可验目标为 Apple Silicon + macOS 26；安装包 3,212,313,177 字节，应用逻辑普通文件约 4.216GB。需有额外可用磁盘空间供应用复制、旧版恢复副本/归档及其解压复核，不能只按 DMG 大小预留。没有把推算值冒充已测最低空间。
2. **安装/目录权限**：正常退出旧工作台，向 `/Applications` 复制并重开；需要该目录可写权限。应用自带安装器使用普通 `ditto` 与文件操作，没有提权分支（`mac-installation.mts:390`、`:415`）。Finder 手动拖装的管理员权限体验另验。应用非正式签名、公证包，需验证真实下载隔离/Gatekeeper 体验，不能承诺双击无提示，也无需关闭安全保护。
3. **第二大脑本身可访问**：首启或更换安装程序身份要通过系统目录选择器选择自己的库；不是自动猜原目录。`startup-access.mts:7`、`:32` 以可执行文件身份记录选择；`desktop.mts:366` 使用该收据。若复制库到新机器，不应复制旧机器绑定记录当作可用连接；该绑定含绝对根路径及文件系统身份（`bindings.mts:26`）。库格式/历史内容是否完全兼容由专门库审查覆盖，本报告不拿“可选文件夹”代替格式验收。
4. **助手**：有已安装、已登录且能使用的 Codex 或 WorkBuddy；完成其自身模型权限/账号配置。文本分析与创作由助手完成，工作台模型端点请求明确返回 `MODEL_SERVICE_DISABLED`（`service-tools.mts:199`）；工作台自身不是离线文本模型宿主。
5. **同版插件安装和新会话**：选定助手后，复制应用设置的本地市场位置，在助手插件页面完成安装、启用和权限，再检查。`setup.mts:72` 只是复制路径，没有自动安装。`assistant-skill.mts:64`、`:83`、`:88` 严格要求同版缓存/manifest/release，旧 0.5.1 不能代替 0.5.2。插件 ZIP 有单独约91MiB载荷；安装应用并不自动安装助手插件。旧聊天缓存刷新、会话跳转和助手对协议的支持要实际验证。
6. **联网采集/观察**：TikHub 需要用户自己的 Key、网络和明确启用的预算；评论还要单独允许。初装默认预算/评论均 false（`shared/service-validation.ts:23`），不是“打开库即可自动采集”。本地浏览/修改与已经完整随包的 Qwen 可避免开发环境依赖，但在线资料、助手推理/生图和远端发布观测不能承诺断网可用。
7. **密钥不随库迁移**：服务设置存在 app userData，使用 Electron safeStorage 加密（`desktop.mts:180`、`service-settings.mts:45`）。从别人机器拷贝设置文件不能承诺可解密。新机器应输入自己的凭证，并满足系统安全存储可用/已解锁。首启延迟凭据检查，避免只打开设置就同步访问钥匙串，但实际使用 Key 仍要系统确认。

## 无开发环境、离线与 ffmpeg

随包插件自带 Node 24.20.0，`runtime/launch.mjs:11` 核验版本、平台、架构和当前 executable。`assistant-runtime.mts:69` 直接启动缓存里的 Node，不需要外部 node/npm。最终归档 .app 的 runtime manifest 包含 Qwen3-ASR-1.7B-8bit、完整 Python 及 `Systran/faster-whisper-small` timing 模型，用户不应再执行研发 `tools/setup-local-asr.py` 才能满足本包设计。

`service-tools.mts:15`、`:254` 对内置 runtime 的 MP4/M4A/WebM/Ogg 使用 timing-site 的 PyAV 解码成 WAV，避免依赖开发机 PATH 中的 ffmpeg/ffprobe。Python 执行使用 `-B -I`，并设置 HF/Transformers offline 标志（`:144`）。这是代码/载荷证据；本次没有运行真正识别，不能拿旧 0.5.0 的离线识别收据冒充最终 0.5.2 断网通过。`checkReadiness` 仅做文件与 import 检查（`:174`），不是识别质量/整条任务验收；如果可选 timing-site 或其模型不完整，Qwen 仍可能被发现，而容器音频路径会在 `:258` 拒绝，需要明确区分基础文本 runtime 与 MP4 可用性。

最终 0.5.2 的必要后续验证：干净机器/独立用户环境、没有开发 PATH/venv/ffmpeg/cache、OS 网络拒绝情况下，从最终安装目录读本地 WAV 与 MP4，实际识别并提交收据；另验初次 warm-up 与失败重试。不得只看组件状态绿色。

## 产物与当前源码差异

最终包冻结 `46851c337ae72431827edb0356cf76ff44b774a2`；当前 HEAD `d16277972dfad01bbef5d5b98cda1be0c26def4a` 为交付文档提交。当前根包、workbench 包与 release.config 仍都写 0.5.2。工作区另有未提交的 research-runtime 内容接入变更、多个 renderer 分页改动和新分页组件/测试/研究文档；这些不是冻结安装包的一部分。审查过程中共享工作区仍可变化，以主线程最终 `git status` 为准。

因此，“当前源码测试通过”“正在修的分页/方法适配已好”不能证明同事手中 0.5.2 同样包含修复。后续交付须重新冻结版本/提交、打包并验最终安装产物及同版插件。README 提到继续 0.5.3 工作区，但实际 manifest 未升版，交付时尤其容易混淆。

本次重算桌面交付文件 SHA256：

| 文件 | 实际 SHA256 |
|---|---|
| Nova-Content-Hub-0.5.2-darwin-arm64-preview.dmg | `5c6b6e36b8ab73224c1720c038e13ab29ccb6af40f011caa93ee6517e4b74f84` |
| Nova-Content-Hub-Plugin-0.5.2-darwin-arm64-preview-disabled.zip | `802425040cec82a57538847873b474696d185d255940876e0fc861939c32df47` |

均与冻结交付记录相符。`plugin-zip.json` 记录2054条 exactStageMatch=true；这是历史产物验证证据，本次没有重新全 ZIP 解压比对。最终资源的签名核验、Finder显示简介已有该版本专属记录，不等于生产 Developer ID/公证。`artifacts.json` 明确 `ad-hoc`、notarized=false、productionReady=false。

## 最终包必须补齐的验收缺口

- **0.5.2 安装、首次打开、重新打开、升级保全**：最终README明确未覆盖本机0.5.1；本次 plist 再确认0.5.1。需要使用最终DMG在隔离的目标环境安装，确认内容库/设置前后、原安装恢复收据与安装后Dock/关于信息。`mac-installation.mts` 有源/副本全树与签名验证、旧应用保留、原子发布机制，但不能以代码替代本版本运行验收。
- **两宿主的同版插件**：本次只读存在性检查，`.codex` 与 `.workbuddy` 均有0.5.1缓存、均无0.5.2缓存；所以当前机器无法证明0.5.2启动doctor、任务、两种等待恢复、取消/失败/重试、原任务续接与切换助手。严格同版门禁是正确边界，不应为了验收通过而跳过。
- **正式签名与下载隔离**：当前允许内部预览的临时签名状态可如实交付，但 Gatekeeper/用户从下载文件安装的实际体验未验。公司版权元数据不构成签名发布者身份。
- **断网、无开发环境、真实转写/生图/写作**：本轮0.5.2只做了静态资源、fixture UI等验证；未发真实模型业务。需用最终安装目录、个人新库/副本与目标宿主验证，明确授权外部调用后另行执行。
- **Intel/Windows**：缺少本版本最终安装器、系统属性界面、原生依赖、安装升级/卸载及运行证据；现状不能宣称跨平台已支持。

验收建议先用 macOS26/M系列的新用户环境完成完整预览验收，确认最终安装目录和同版插件，再找一位同事拿包执行从零安装与自己的库选择。其他系统按平台单列，不复用本机结果。
