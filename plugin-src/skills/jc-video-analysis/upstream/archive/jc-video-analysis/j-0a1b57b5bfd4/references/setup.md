# 本地转写首次配置

## 先检查

在 Skill 目录执行：

```bash
python3 scripts/transcribe_segments.py --check
```

返回的 5 项都是 `true` 即可使用：`ffmpeg_available`、`ffprobe_available`、`node_available`、`model_available`、`sherpa_package_available`。

## 安装运行依赖

缺少 Node.js 或 FFmpeg 时，先让用户安装当前系统适用的 Node.js LTS 和 FFmpeg。然后在 Skill 目录执行：

```bash
npm install
```

这只安装本地 `sherpa-onnx-node` 运行库，不上传视频。

## 安装 SenseVoice Small 模型

模型官方发布包约 1 GB。必须先告知用户下载大小和来源，只在明确同意后执行：

```bash
bash scripts/setup-sensevoice.sh
```

脚本从 k2-fsa `sherpa-onnx` 官方 GitHub Release 下载 `sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2`，只解压 `model.int8.onnx` 和 `tokens.txt` 到当前 Skill 的 `models/sensevoice-small/`。目标已存在时脚本拒绝覆盖。

也可以用 `SENSEVOICE_MODEL_DIR` 指向用户已有的模型目录，该目录必须包含 `model.int8.onnx` 和 `tokens.txt`。

## 验收

1. 重跑 `python3 scripts/transcribe_segments.py --check`。
2. 用一段很短的本地音频试跑，输出到一个空目录。
3. 确认 `manifest.json`、`raw/`、`review/` 和 `corrected/` 都存在，原始识别与校正层没有互相覆盖。

没有完成转写环境时，仍可分析用户提供的可靠逐字稿；不得自动切换云端 ASR。
