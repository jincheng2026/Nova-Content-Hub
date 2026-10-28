# V4 最终安装 MP4 ASR 接受记录

2026-10-28 本地时间，V4 安装的 ASR 范围通过。此次冻结产品源码 **baf01944e3b662151db83ca547d8b80ee4378722**，DMG SHA256 `7379e3980d7d1f895871da2dd8714fa27f17b6b45a0a93ed64149d7d965b5f3b`，实际 3,200,826,235 bytes。安装身份来自 [V4 installation.json](../2026-10-28-final-050-arm64-v4/installation.json)，root 确认 DMG 已安装并通过 strict codesign、原生选中演示库。本记录不覆盖旧 2a5d9066 接受正文；旧记录保持历史身份。

唯一执行命令：`node workbench/scripts/installed-qwen-probe.mjs --run`。此次独立证据为 [run-2026-10-27T23-33-19.663Z](run-2026-10-27T23-33-19.663Z/runner-result.json)，[服务结果](run-2026-10-27T23-33-19.663Z/service-summary.json)，[发布及执行上下文](run-2026-10-27T23-33-19.663Z/final-release-context.json)。没有重复 WAV 模型运行、重试或预热来替代此次结果。

## 实际通过内容

- macOS 26.4.1 / darwin-arm64，0.5.0。直接导入 `/Applications/自媒体工作台.app/Contents/Resources/app` 的 compiled ServiceSettingsStore、ServiceTools、production broker、worker、library/client。Python 实际为 `/Applications/自媒体工作台.app/Contents/Resources/local-asr/darwin-arm64/python/bin/python3`。没有旧 candidate、源码 overlay 或仓库模型副本。
- 新临时 settings/library，默认 raw engine=faster-whisper 且 exe/model 均为空，由已校验随包运行时解析 Qwen。任务冻结 raw 配置、预算关闭、REQ budget=0、allowCloud=false，隔离 crypto adapter 不可用，不访问真实 Keychain。真实 demo 库不作为 probe 的 library 打开；probe 只读真实 user binding/settings 做 hash 对比。
- 合法本地 H264/AAC MP4 18,877 bytes，经真实媒体资产、冻结 task 参考授权、HTTP broker、productionAsset，实际 PyAV 原生解码→Qwen 主正文「你好，语音测试。」→Whisper 原文「你好,语音测试。」与 **5 个真实词时间段**，duration 1792 ms。完整 broker ASR **17.778 秒**，readiness import **1.509 秒**。
- `timingSource=faster-whisper-word-timestamps`，Whisper 模型 revision/hash 和实际媒体 PTS 证据随结果保存；未插值伪造 Qwen 时轴、humanAlignmentReviewed=false。MP4 原片、库内资产和 mediaDecode 原片 hash 均为 `3dcfba08d71699b85c645552c68dd4a47e9dad40abbd8ee00956b1ff1ed6e988`。
- 生产识别进程 PATH=`/usr/bin:/bin`，PyAV 使用随包 native codec，不要求系统 ffmpeg/ffprobe。开发 ffmpeg 仅用于生成合法 fixture。Python `-B -I`、offline flags，载荷开始时无 `.pyc` / `__pycache__`。这是新独立进程验证，不声称机器重启或 OS 文件/dyld 缓存清空。
- 业务外部 HTTPS 尝试 **0**、requestsUsed **0**、账本 measured amount **0**。OS sandbox 仅允许 loopback；实际安装内 Python 的一次外部 socket 负控被 PermissionError 拒绝，没有成功外部连接。
- 实际 submit/accept fixture 与 archiveReady=true，receipt `fe48242675ea977fbb4e805c87643d5d59a4de8a697638dcad5b170f42ddfa35`，[归档结果](run-2026-10-27T23-33-19.663Z/accepted-archive.json)。这是自动化隔离素材接受，不代表用户接受或人工字幕复核。

## 保全结果与边界

前后完整快照一致：**625 个 Resources/app 文件、10,945 个载荷文件**，内容/模式/清单无变化；payload manifest SHA256 `2783e2cc5284cada58a0006180781efb6f0b4f86b790664943f1deeababdd234`。真实 service-settings SHA256 `25cb14d323c0976073d91254e297b667f8919347f70ecdb7098baa22a0dc5651`，真实 machine-binding SHA256 `830ce708b0a1e2b20205e012cf37941c18346515c5437ec4e3d6c29106ac5add`，均保持不变。临时 settings 没有创建文件；临时 PCM 目录 removed=true，原 MP4 不变。

没有修改产品、版本、真实 settings/binding、demo 库或模型，没有 commit。Root 在演示库的只读报告/原内容检查属于独立验收，本 probe 不对其阅读位置 companion 作无变化承诺。此次未调用 TikHub 下载真实作品，不把合成 MP4 冒称真实 TikHub 来源；不宣称全应用、Intel/Windows 或其他目标均通过。旧 2a 结果只作历史，本页结果与新 V4 产物独立关联。
