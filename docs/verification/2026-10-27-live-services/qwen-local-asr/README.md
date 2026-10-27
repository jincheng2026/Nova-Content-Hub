# Qwen3-ASR 1.7B 本地真实验证

2026-10-27，macOS Apple Silicon（darwin-arm64、16GiB）。本次下载公开模型并安装独立环境，经现有应用转写适配、真实任务broker与文件内容库完成一次中文识别；没有调用任何付费API，没有修改云端model、Key或原预算开关。

## 锦成参考与本机实际环境

实际 `/Applications/锦成工作台.app` 是版本0.1.0、bundle `com.hejincheng.content-workbench` 的Electron壳，启动launchd管理的8878 API与8879 UI。其代码与数据引用的转写工具是 `jc-zhuanxie`。历史原始识别YAML明确写 `local-qwen3-asr (Qwen/Qwen3-ASR-1.7B, mlx)`；来源仍是当前不存在的 `/Users/hejincheng`。参考没有记录量化版本，不据此猜成bf16、4bit或8bit。

本机检查未找到可复用的Qwen权重或该执行脚本，旧ASR环境只有faster-whisper。因此本次在用户明确授权后补装独立环境，未修改锦成工作台、其launchd或原faster-whisper环境。Qwen3-ASR是语音识别模型，不能据本次结果宣称本地文本/聊天LLM已接入。

## 下载与安装

- Python：已有arm64 CPython3.11.16，新建独立venv。
- 运行时：通过 `https://pypi.org/simple` 安装 `mlx-audio[stt]==0.6.2`；实际MLX0.32.4、39个包，完整版本见 `runtime.json`。
- 模型：`mlx-community/Qwen3-ASR-1.7B-8bit`，固定revision `a8379a2e2f9e313c9292cdf1af4055ab56d50d55`。这是上游MLX实现README明确列出的1.7B变体；本机16GiB内存，选择8bit控制加载体积，不冒称与参考原始量化完全相同。
- HF公开接口返回 `gated:false`、Apache-2.0，没有协议确认或登录门禁；下载显式 `token=False`，禁用隐式认证与遥测。
- 实际模型文件合计 **2,467,859,030bytes**；主权重 **2,463,307,541bytes**，SHA256为 `bf304b009cc7eca79283056f787b44c952d24ac22cec787b39732bba3c23c13c`，与固定revision注册表LFS摘要一致。来源、逐文件体积、校验与完成时间见 `model-source.json`、`download.json`。
- 独立运行时实际磁盘占用 **474,537,984bytes**；模型目录实际占用 **2,470,174,720bytes**（包含元数据/文件系统分配差异）。完整安装盘点见 `inventory.json`。这些资产保留在本机，不进入本次安装包。

可填写到工作台的绝对路径：

```text
本地引擎：qwen3-asr
识别方式：local-only
Python：/Users/mac/Library/Application Support/NovaIsland/NovaContentHub/local-asr-qwen/venv/bin/python
模型：/Users/mac/Library/Application Support/NovaIsland/NovaContentHub/local-asr-qwen/models/Qwen3-ASR-1.7B-8bit
```

## 唯一一次真实识别

`live/summary.json` 记录UTC07:04:09开始。系统say生成中文“你好，语音测试。”，转换为16kHz单声道WAV，实际1543ms；音频及SHA256保留在 `live/known-chinese.wav` 和summary中。

使用原加密设置的临时副本，只将ASR改成上述本地环境与 `local-only`，原预算保持false。真实controller创建预算0的transcription任务、登记音频资产/参考、冻结配置并claim，再经productionToolBroker、worker和现有ServiceTools执行一次本地子进程转写，`allowCloud:false`。HF、Transformers和datasets均设为offline。

实际识别正文精确为 **“你好，语音测试。”**，耗时32,895ms，cacheHit=false、requestsUsed=0。随后真实submit、回执校验、accept与知识目录归档回读均通过；`live/accepted-archive.json` 保留accepted产物与同一回执hash。不是mock响应，也不只是模块安装或空转写检查。

应用账本为asr/measured/0REQ、`costStatus:no-external-call`。`cloudModelUnchanged:true`、`originalBudgetEnabled:false`、`originalSettingsChanged:false`，临时加密设置、broker描述符、音频副本和测试库已清理，独立运行时与模型保留。没有为补取证据再次识别；最终工作台GUI导入的另一个样本由主线程单独验收。

## 兼容与边界

上游实际接口与当前接缝兼容：`mlx_audio.stt.utils.load_model(localPath)` → 实例 `generate(audioPath)` → `result.text`。上游裸Model类通过 `__getattr__` 委托Qwen3ASRModel，类上直接找不到generate不代表实例缺方法。本次真实调用已验证，无需修改生产应用源码。

当前MLX适配只返回text和空segments，未透出上游STTOutput的segments、token或运行时间，所以本次应用响应 `segmentCount:0`、`durationMs:null`，账本也保留未知时长；音频1543ms是独立读取WAV头取得，不伪装成供应商usage。助手技能必须明确：没有真实时间戳时保留空/未知，不得编造逐句时间轴或挪用另一引擎时间戳。若需要完整时间轴，应另验收相应输出适配。

本次仅证明本机arm64上的短中文样本；没有验证长视频、噪音、多说话人、Intel Mac或Windows，不将MLX运行时标为这些平台均已支持。

上游来源：[Qwen官方ASR仓库](https://github.com/QwenLM/Qwen3-ASR)、[MLX Qwen3-ASR实现与调用说明](https://github.com/Blaizzy/mlx-audio/blob/main/mlx_audio/stt/models/qwen3_asr/README.md)、[固定模型仓库](https://huggingface.co/mlx-community/Qwen3-ASR-1.7B-8bit/tree/a8379a2e2f9e313c9292cdf1af4055ab56d50d55)、[PyPI包](https://pypi.org/project/mlx-audio/0.6.2/)。
