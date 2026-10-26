# 本地 ASR 安装与实际联通验收

2026-10-26，Apple Silicon Mac，`darwin-arm64`。本次安装使用独立用户目录，没有修改系统 Python、原内容库、用户服务设置或云端密钥。

## 结果

- 已安装 `faster-whisper==1.2.1`、`ctranslate2==4.8.4`、`av==16.0.1`，Python 3.12.14。
- 已下载官方 [Systran/faster-whisper-small](https://huggingface.co/Systran/faster-whisper-small)，固定源 revision `536b0662742c02347bc0e980a01041f333bce120`，权重 483,546,902 字节，全部四个必要文件共 486,212,372 字节。
- 真实 `ServiceTools` 使用 `local-only`、CPU/int8、`local_files_only=True` 识别成功。
- 真实临时内容库已导入 WAV 资产、登记到参考资料、建立任务与 claim，通过 production broker HTTP loopback、production worker 的身份及资产校验、预算预留和费用回写完成同一次离线识别。没有替换识别结果、worker 或调用函数。
- 8.493 秒合成语音：首次识别 37.185 秒，随后 broker 路径 4.245 秒。首次耗时包含安装后的首次导入和初始化，不能当作稳定性能指标。
- Python 出网审计阻断并记录 `socket.connect` 和 `socket.getaddrinfo`，两者均 0 次；Node HTTPS 出网阻断计数 0 次；任务账本 `measured / 0 REQ / no-external-call`。模型和依赖下载安装发生在验收前，属于联网下载；识别验收没有调用外部服务。
- 缺失模型的负向检查返回 `LOCAL_ASR_UNAVAILABLE / requestsUsed=0`。

测试原文为「你好，这是自媒体工作台的本地语音转文字测试。今天我们学习整理内容，记录想法。」。实际识别为「你好,这是自媒体工作台的本地语音拽文字测试,今天我们学习整理内容,记录想法。」。“转”识别为“拽”，说明实际转写仍需人工校对。本次只验证合成短中文音频与上述主机，尚未验收真实长音频、噪声、说话人区分、Intel Mac 或 Windows；本次不是安装包交付验收。

原始结果见 [local-asr-probe.json](./local-asr-probe.json)，模型校验与依赖见 [local-asr-installation-manifest.json](./local-asr-installation-manifest.json)。

## 设置参数

引擎：`faster-whisper`。模式可选择本地专用；本次没有自动修改用户设置。

Python：

```text
/Users/mac/Library/Application Support/NovaIsland/NovaContentHub/local-asr/venv/bin/python
```

模型目录：

```text
/Users/mac/Library/Application Support/NovaIsland/NovaContentHub/local-asr/models/faster-whisper-small
```

该环境位于应用程序支持目录；删除源码工作树不会删除模型。不要把本机绝对路径打包为其他电脑的默认值。Intel Mac 和 Windows 应在目标机器创建匹配架构的 Python 环境并单独验收。

## 重跑验收

在仓库根目录执行，要求 macOS 已有系统 Tingting 中文语音、Node 支持 TypeScript 类型擦除、上述离线引擎与模型已安装。脚本只创建和清理临时内容库及设置，证据文件保留。

```sh
node workbench/scripts/local-asr-probe.mjs \
  '/Users/mac/Library/Application Support/NovaIsland/NovaContentHub/local-asr/venv/bin/python' \
  '/Users/mac/Library/Application Support/NovaIsland/NovaContentHub/local-asr/models/faster-whisper-small' \
  docs/verification/production/2026-10-26-research-creation-rebuild/local-asr-probe.json
```

脚本中的加密存储能力返回不可用、所有凭据为空，仍应允许本地免费识别。联网付费请求被显式禁用。

## 安装记录与依赖兼容

限定排查两个同事包、`~/AIJinCheng`、`~/.cache`、`~/.local/share` 和 Homebrew 安装目录后，没有发现现成模型或 ASR venv。同事 `volc_asr.py` 的本地路径为 `~/.local/share/qwen3-asr/venv/bin/python`，本机不存在；其 `mlx_qwen3_asr` 不是当前工作台支持的 `mlx_audio` 接口。本次因此新建隔离环境并下载模型。

依据 [faster-whisper 官方说明](https://github.com/SYSTRAN/faster-whisper) 和上述模型卡使用本地模型目录、CPU 与 int8。依赖安装命令为现有 `uv venv --python ~/.local/bin/python3.12 '<独立目录>/venv'`，再 `uv pip install --python '<独立目录>/venv/bin/python' 'faster-whisper==1.2.1' 'av==16.0.1'`。通过官方 `huggingface_hub.snapshot_download`、`token=False` 下载 `config.json`、`model.bin`、`tokenizer.json` 和 `vocabulary.txt`；没有读取用户 token 或同事密钥，也没有执行同事安装脚本。

首次解析依赖自动得到 `av==19.0.2`，实际 `av.open(..., metadata_errors='ignore')` 抛出 `TypeError`；固定 `av==16.0.1` 后，完整离线验收通过。今后的环境重建应保留这一兼容约束。
