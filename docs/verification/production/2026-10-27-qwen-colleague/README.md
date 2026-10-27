# 同事 Qwen3-ASR 离线附加包验收

已准备工作台包外的完整离线组件包，目标仅为 **Apple Silicon 原生 arm64 + macOS 26**。本机 macOS 26.4.1（25E253）、16 GiB 内存，已从前一归档重新解压、在含中文与空格的新目录安装并真实识别中文。本次审查只修正已有目录的拒绝提示，当前 ZIP 重新打包、解压并完成全量哈希与语法校验，未重跑引擎。引擎、依赖、模型和自测代码的哈希全部未变；接收同事的机器仍需安装与工作台接入验收。

交付文件：`/Users/mac/code/dashboard/qwen-addon/Qwen3-ASR-addon-2026.10.27-darwin-arm64-macos26-offline.zip`，实际 **2,675,524,552 字节**，修改时间 **2026-10-27 16:58:13 +08:00**。

SHA256：`05fdad6aace9c5bd4455de428cf9aaad75eeeb003e187b7a1845c784394775ce`。

同事只需解压、双击 `install.command`，等待离线安装与中文自测完成，再把窗口输出的 Python 和模型两条路径粘贴到工作台的本地 Qwen3-ASR 设置。默认安装位置是 `~/Library/Application Support/NovaIsland/QwenASRAddons/2026.10.27`，无需系统 Python、Homebrew、uv、API Key 或联网。安装器只创建独立组件目录，不读取或修改工作台内容库、用户设置与密钥。它拒绝覆盖已存在的安装目录；已安装 venv 不能直接搬迁。

固定内容：官方 CPython 3.11.16 + python-build-standalone 20260825，39 个固定 PyPI wheel，mlx-audio 0.6.2 / MLX 0.32.4，模型 `mlx-community/Qwen3-ASR-1.7B-8bit` revision `a8379a2e2f9e313c9292cdf1af4055ab56d50d55`。模型 11 文件总计 2,467,859,030 字节，权重 SHA256 与上游登记一致。模型、Python、每个 wheel 的来源与哈希分别保留在对应 manifest。独立 venv 在目标路径重新创建，没有复制原环境的绝对 Python 链接。CPython 自带 ensurepip 的 pip/setuptools 由固定官方 archive 哈希覆盖。

验收证据：

- `archive-file-list-check.json`：当前最终 ZIP 经系统 ditto 新解压，归档及解压文件清单与全部 2,311 条 SHA256 完全相等，无额外、缺失或重复项，全量哈希通过；安装脚本权限保留 755，shell 与自测 Python 语法通过。
- `final-zip-install.log`：前一引擎验收归档经系统 ditto 解压，包内完整性检查、离线 `--no-index --require-hashes --only-binary=:all:` 安装 39 个 wheel、`pip check` 全部通过。
- `final-zip-install-test.json`：前一引擎验收归档的独立路径 `/private/tmp/Nova Qwen 最终ZIP验收 20261027/venv/bin/python` 的基底是同目录的 `python/`；识别内附 1.543 秒中文 WAV，37.322 秒输出“你好，语音测试。”，归一文字完全匹配。
- 前一引擎验收的整条安装与识别命令由 `/usr/bin/sandbox-exec -p '(version 1) (allow default) (deny network*)'` 包围；`network-denial-control.json` 记录网络负控制返回 `PermissionError errno 1`。识别期间 Python 连接尝试为零。
- `installer-negative-tests.json`：当前脚本对完整已有安装与模拟半安装（即使放入伪造 passed JSON）都只中性提示检查状态、拒绝覆盖并保留文件；损坏包在创建安装目录前被拒绝。没有解析目标 JSON 来认可已有组件。
- `packaging-integrity-notes.json`：记录首次包校验捕获的制包期 `.pyc` 更新问题及恢复官方干净 Python 后重建、重新验收的处理；最终包已通过以上检查。
- `engine-validation-reference.json`、`engine-validated-install.command` 固定前一归档 SHA256、旧安装脚本及其真实识别证据；`payload-change-record.json` 证实当前包只有安装脚本的已有目录拒绝文案变化（以及对应哈希清单），其余 2,310 项载荷哈希完全相同。当前新 ZIP 没有宣称再次安装或推理。
- `delivery-record.json`、`build-inventory.json`：关联源码基准提交 `45c7d2578f6affd9b988a03b98d1e4e6ad524106` 及尚未提交的附加包脚本哈希。没有自动 commit/tag，主应用当前源码状态与此附加包分开记录。

原始依赖 wheel 全部保留；122 个独立许可/元数据文件包含 Python standalone 依赖许可、各 wheel 的原始许可/元数据、tokenizers/sentencepiece 对应版本上游许可和模型 Apache-2.0 许可及来源记录。构建脚本与重建步骤位于 `tools/local-asr/`。

这是同事离线预览附加组件，未做 Developer ID 签名、公证或生产发布审批。Finder 下载隔离、安全提示、双击交互与接收机器工作台设置/转录尚待真实界面验收；本次命令行组件自测不能替代这些门禁。接收机升级、重新打开、卸载和内容保全也未完成实机验收。旧版 macOS、Intel Mac、Windows x64 与 Windows ARM 没有本包可用载荷，未验收且不受支持。短句识别通过不代表长音频或全部语言通过。
