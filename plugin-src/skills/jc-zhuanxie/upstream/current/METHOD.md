---
name: jc-zhuanxie
description: "用火山引擎豆包语音批量把音视频转成校正版逐字稿，保留原始识别、分段复核和验收。触发：转文字、转写、逐字稿、校正错别字。"
---

# 锦成转写

把本地中文音视频稳定转成完整逐字稿。统一使用火山引擎豆包语音「录音文件识别标准版 2.0」，不打开 App、不改用其他模型。

- 引擎：`scripts/volc_asr.py`，接口 `https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit`（提交）和 `/query`（轮询结果），请求头 `X-Api-Key`，资源 ID `volc.seedasr.auc`。其他转写类 skill 都调用这个脚本。
- 密钥：环境变量 `VOLC_SPEECH_API_KEY`，或 `~/.config/secrets/volc-speech.env`。不打印、不写进交付物。
- 媒体先用 ffmpeg 抽成 16kHz 单声道 MP3 再上传；超过 30 分钟在静音处自动切段，最多 3 段并发请求，时间戳自动加回偏移。
- 不开启顺滑（`enable_ddc`），保留口语和重复；开启标点和数字规整（ITN）。
- 备用引擎：火山因额度用完、未开通、鉴权、服务繁忙或网络原因失败时，自动改用本机 `Qwen/Qwen3-ASR-1.7B`（MLX，环境在 `~/.local/share/qwen3-asr/venv`，模型缓存在 `~/.cache/huggingface/hub`），字级时间来自 `Qwen3-ForcedAligner-0.6B`。空音频、格式错误、参数错误不切换。本机约 4 倍实时，88 分钟视频约 20 分钟。2026-09-17 用 26 条抖音口播对照已有校正稿实测（数字写法差异不计）：火山与本地准确度接近，火山在 20 条上略好，本地在英文产品名较多的条目上更好；本地在 22 条上比旧 SenseVoice 准。
- 结果里的 `engine` 和复核稿头部写明实际用了哪个引擎；自动切换时 `fallback_reason` 记录火山的失败原因，交付时告诉用户。
- 强制指定：`--engine volc`（只用火山，失败就报错）、`--engine local`（只用本地、不花额度），或环境变量 `JC_ASR_ENGINE`。
- `--engine step`：阶跃 StepAudio 2.5 ASR（SSE 接口，0.15 元每小时，逸尘实测时间戳比豆包准），只在指定时用，失败就报错、不换服务商；密钥在 `~/.config/secrets/stepfun.env`（`STEPFUN_API_KEY=`）。2026-10-23 加入，还没用真实密钥跑过，第一次用先截一分钟片段核对时间戳。
- 测试脚本改动只截几十秒到两分钟的片段；需要反复试时用 `--engine local`。
- 依赖检查：`python3 scripts/volc_asr.py --check`（显示火山密钥和本地备用是否可用）。

## 边界

- 处理本地 MP4、MOV、MKV、WebM、MP3、M4A、AAC、WAV、FLAC、OGG、Opus。
- 普通网页或平台分享链接先交给对应下载工具；拿到真实媒体文件后再转写。不要把下载成功当作转写完成。
- 只做下载后校验、ASR、错字校正和交付验收，不自动分析观点、提炼金句、写稿或入知识库。
- 保留口语、重复和原意；只修确定的识别错误。完整标准见 `references/correction-standard.md`。

## 工作流

1. 读取项目规则，确认输入目录和交付目录。用户未要求清理时，保留全部中间证据。
2. 先用一个样本验证媒体、模型、FFmpeg 和输出路径。
3. 批量运行转写（逐个文件处理，单个长文件内部分段并发）：

```bash
python3 /Users/hejincheng/.agents/skills/jc-zhuanxie/scripts/transcribe_batch.py \
  "/绝对路径/输入目录" \
  "/绝对路径/输出目录"
```

只盘点和检查媒体，不启动 ASR。`--dry-run` 仍会创建输出子目录，并在处理媒体时写入 `manifest.json`；使用独立的检查输出目录，不指向已有正式交付目录。用户明确要求只读、不允许写文件时，不运行此命令，改用不落盘的媒体检查：

```bash
python3 /Users/hejincheng/.agents/skills/jc-zhuanxie/scripts/transcribe_batch.py \
  "/绝对路径/输入目录" \
  "/绝对路径/输出目录" \
  --dry-run
```

4. 逐项读取 `原始识别/<id>.txt`。长音视频按约 28 秒切片复核，将带时间戳的复核稿写入 `分段复核/<id>.md`。
5. 按 `references/correction-standard.md` 校正，将最终稿写入 `校正版逐字稿/<id>.md`。禁止覆盖原始识别。
6. 运行最终验收：

```bash
python3 /Users/hejincheng/.agents/skills/jc-zhuanxie/scripts/validate_delivery.py \
  "/绝对路径/输出目录"
```

7. 交付完整逐项文本和验收结果。作者、日期、主题只从可验证的来源元数据取得；不确定就保留编号或标记 `【疑似：…】`。

## 单文件与字级时间戳（切片、剪辑用）

`transcribe_batch.py` 已在 `原始识别/` 为每项同时写出 `<id>.srt`（句级）、`<id>.json`（句级＋字级起点）和 `<id>.volc.json`（接口原始返回）。只处理单个文件时直接运行：

```bash
python3 /Users/hejincheng/.agents/skills/jc-zhuanxie/scripts/volc_asr.py /绝对路径/媒体.mp4 --out-prefix /绝对路径/输出前缀 --review-md
```

切片流程沿用 `~/.claude/skills/jc-qiepian-chupian/scripts/transcribe_chars.mjs`，它同样调用本引擎。句子带 `approx: true` 表示接口给的词与句文本对不上，字级时间按句内均分估计，定切点前必须回原声核对。抽音频必须带 `-af aresample=async=1:first_pts=0`（脚本已内置）：AAC 顺序解码出的音频会比容器时间轴短几秒且中段浮动，2026-09-04 徐皓天 01 场差 3～4.5 秒，成片音画错位。转完随机抽一句按时间戳回原片核对。

## 标准目录

```text
输出目录/
├── manifest.json
├── 原始识别/
├── 分段复核/
├── 校正版逐字稿/
└── validation.json
```

## 完成条件

以下清单适用于完整校正版逐字稿交付。用户本次仅要求切片或剪辑用的字级时间戳时，交付对应源媒体的句级 SRT 和字级 JSON，保留原始识别；核对文件内容非空、时间戳有效且不超出媒体时长，并按「字级时间戳模式」要求抽句回原片核对。该脚本不生成下面所列的 manifest、校正层和 validation，不能把时间戳交付说成完整逐字稿校正完成；本次也要求校正版逐字稿时，仍须完成原有校正流程及下面的验收。

- `manifest.json` 中每个输入都有明确状态。
- 成功项的原始识别和校正版逐字稿数量一致、内容非空。
- 长音视频存在分段复核稿；无空分段和明显时间覆盖缺口。
- 没有 `.part`、`.tmp` 或零字节交付文件。
- 失败项不计入完成数，可单项重跑；不得用进程退出或文件出现代替交付验收。

## 失败处理

- 媒体不可读：先看 `ffprobe`，不要把下载残片送入 ASR。
- 接口报 `45000030 requested resource not granted`：豆包语音控制台未开通录音文件识别标准版 2.0；报 `Invalid X-Api-Key`：密钥不是豆包语音的 API Key（`ark-` 开头的是火山方舟密钥，不能用）。
- 接口报 `55000031` 服务器繁忙：脚本已自动重试 3 次；仍失败就单项重跑。
- 分段边界附近的字可能被切断：复核时重点看 `volc.json` 里 `chunks` 的边界时间。
- 专有名词不确定：对照分段和上下文；仍不确定时标 `【疑似：…】`，不猜。
- 用户只要最终稿：仍保留原始识别和校正层；如需瘦身，把中间材料移入项目 `.trash/`，不永久删除。
