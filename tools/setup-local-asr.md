# 内置 Qwen 本地载荷

`setup-local-asr.py` 是制包机工具，要求 Python 3.11+、Apple Silicon 原生 macOS 26。它从现有已固定的离线附加包重建可迁移的应用资源；同事机器无需运行脚本、安装 Python 或联网。

```sh
python3.12 tools/setup-local-asr.py \
  --source /absolute/Qwen3-ASR-addon-2026.10.27-darwin-arm64-macos26-offline \
  --output /absolute/new/local-asr/darwin-arm64
```

先核验源包完整 SHA256SUMS，仅向全新输出目录复制独立 CPython、模型与许可证，再用固定 wheelhouse `--no-index --require-hashes --only-binary=:all:` 安装到载荷内部的 `python/lib/python3.11/site-packages`。没有 venv 的开发机绝对链接；不安装用户或系统包、不读取服务设置或凭据。不覆盖已有输出；中断后应使用新的空目录重建。

制包接线：完整复制输出目录到 Electron `resources/local-asr/darwin-arm64`，保留内部 symlink 和 executable mode；不得放进 asar。构造 `ServiceTools` 时传入 `localRuntimeRoots: [path.join(process.resourcesPath, 'local-asr', process.platform+'-'+process.arch)]`；开发目录也必须由主进程传入绝对路径。自动探测不使用 CWD、PATH、HF 缓存或用户凭据。当本地两条路径均为空时使用适配本机的内置组件；任一路径已填写时遵从原配置。

`runtime.json` 固定平台、架构、已验证 macOS 大版本、相对 Python/模型路径和模型 revision。发现阶段检查每个模型文件大小、模型类型及路径边界；就绪检查实际导入 Python 模块。`payload-manifest.json` 记录完整载荷每文件 SHA256/大小，交付冻结和验收时应重新核验。就绪检查不等于真实音频推理验收。

当前源包固定：standalone CPython 3.11.16 / 20260825，MLX 0.32.4、mlx-audio 0.6.2，`mlx-community/Qwen3-ASR-1.7B-8bit` revision `a8379a2e2f9e313c9292cdf1af4055ab56d50d55`；模型 Apache-2.0。完整第三方许可证随 `licenses/` 和 wheel 元数据交付。Qwen 原始输出没有可靠时间轴，服务返回 `segments: []` 与 `timingSource: 'none'`，不能直接发布精确字幕。

此载荷仅验收 darwin-arm64 / macOS 26；Intel Mac、Windows x64/ARM 与其他 macOS 版本分别缺少构建和原生验收，不自动选择此载荷。已签名应用中嵌入的 Python、dylib、metal 组件仍需目标渠道的签名/公证与安装后路径推理验收。

## 可选的真实字幕时间来源

`tools/setup-local-asr-timing.py` 向**新的**输出目录扩展已验证的Qwen载荷，保持原载荷不变。`--component` 指向冻结的 `model/`、`wheels/`、`timing-model-manifest.json`、`wheel-manifest.json`、`requirements.lock` 与 `licenses/`；wheel SHA256先与对应固定版本的官方PyPI登记核对。脚本不联网，核验每文件hash后在独立`timing-site/`安装hash锁定wheel，并复制独立Whisper模型和许可证。

```sh
python3.12 tools/setup-local-asr-timing.py \
  --base-runtime /absolute/local-asr/darwin-arm64 \
  --component /absolute/frozen-whisper-component \
  --output /absolute/new/local-asr-with-timing/darwin-arm64
```

扩展载荷仍使用Qwen `data.text`。同一音频独立运行 `faster-whisper 1.2.1` / `CTranslate2 4.8.4` 的CPU int8 `word_timestamps=True`；`data.segments`来自Whisper实际word start/end，另存 `timingTranscript`、`timingSource: faster-whisper-word-timestamps` 和 `timingModel.{repoId,revision,sha256}`。Whisper提示简体中文，识别原文完整保留。它是独立识别器的时间来源，不能宣称Qwen原生时轴或人工已复核。缺组件、识别失败或无有效时间词时Qwen正文仍保留、时间轴为空，并交由后续字幕匹配与人工复核门禁处理。

## 发布裁剪与安全扫描

对扩展载荷运行 `tools/lean-local-asr.py --source /absolute/timed-runtime --output /absolute/new/release-runtime`；它保留输入，在新目录移除测试、fixtures、缓存/pyc、安装用whl和开发自测资产，记录`release-omit-manifest.json`并重新生成完整`payload-manifest.json`。内部文件别名实体化为同字节普通文件；不带开发机venv、不放宽全局门禁。完整`licenses/`逐文件保留。裁剪后直接运行原始`node plugin-src/scripts/artifact-safety.mjs /absolute/release-runtime`，并在新路径重新封网推理验收；最终复制发布runtime，不复制制包源wheelhouse。
