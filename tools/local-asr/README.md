# Qwen3-ASR 同事离线附加包

这些脚本只负责工作台之外的独立组件，不修改应用源码、版本、设置、内容库或密钥。当前唯一目标是 Apple Silicon 原生 arm64 + macOS 26。用户操作见 `README.txt`，验收见 `docs/verification/production/2026-10-27-qwen-colleague/`。

## 重建固定载荷

用已验收的 Python 3.11 arm64 环境运行（需要 `packaging` 和 `zstandard`；当前 Qwen runtime 均已包含）。以下步骤只在制包机需要联网，同事安装不联网。不使用认证或私有模型。固定清单以 2026-10-27 的 runtime.json 和 model-source.json 为输入，所有 wheel 为官方 PyPI 获取并核验返回的 SHA256。

1. 从 `python-source.json` 中的两个 GitHub 官方固定 URL 下载 install_only 与 pgo+lto-full archive；从同一 release 下载 `SHA256SUMS`。在独立制包目录保存为 `cpython-install.tar.gz`、`cpython-full.tar.zst`、`python-SHA256SUMS`，核验对应文件名的 SHA256。full 只为提取第三方许可，不装入同事包。
2. 运行 `prepare.py --runtime-json <固定runtime.json> --output <附加包目录>`，生成 39 个 wheel、`requirements.lock`、wheel 来源/哈希清单与 wheel 中许可/元数据。
3. 运行 `prepare_licenses.py --full-python-archive <cpython-full.tar.zst> --upstream-sums <python-SHA256SUMS> --output <附加包目录>/licenses`，补充 Python/standalone 许可及 wheel 未提供的 sentencepiece/tokenizers 许可。补充许可的 URL 与实得哈希会另行记录。
4. 将完整 licenses 复制到制包目录外的独立目录（作为下一步 `--license-directory`，避免对自身复制）。运行：

```sh
python assemble.py \
  --output <附加包目录> \
  --source-model <固定revision的本地模型目录> \
  --model-source <固定model-source.json> \
  --known-audio <已知中文WAV> \
  --python-archive <cpython-install.tar.gz> \
  --license-directory <独立完整licenses目录>
```

`assemble.py` 仅从固定 model-source.json 枚举复制模型文件，不复制 Hugging Face 缓存、认证文件或现有 venv；权重按原始注册 SHA256 验证，所有模型文件记录交付哈希。Python archive 固定 SHA256 后安全解包，包内链接必须留在包内。最后生成整个包内的 `SHA256SUMS`。补充许可证 URL 固定到各依赖版本；Apache 通用许可记录实际字节哈希。

5. 在不存在的绝对路径执行 `bash <附加包目录>/install.command <测试安装目录>`。制包机验收额外使用 `/usr/bin/sandbox-exec -p '(version 1) (allow default) (deny network*)'` 包围整条安装命令，并用已安装目录的 Python 单独执行网络拒绝负控制。冻结哈希后不执行待交付源包里的 Python，避免自动生成/更新 stdlib .pyc。安装器新建 venv，离线 `pip --isolated install --no-index --require-hashes --only-binary=:all:`，执行 `pip check`，最后真实识别中文 WAV。
6. 在制包目录用 `zip -0 -q -r -y <版本-平台-架构-渠道.zip> <附加包目录名>`（工作目录为附加包目录的父目录） 制作 ZIP；用全新目录解压后再次验证包内 SHA256，然后从最终解压载荷重新执行安装/识别。记录 ZIP 的实际字节数、修改时间、SHA256、源码基准提交、脚本哈希与未提交状态。

不将制包机现有的 venv 当作可迁移载荷；安装后的 venv 不允许移动。归档内 CPython 自带 ensurepip，pip/setuptools 启动载荷由固定 CPython archive 的 SHA256 覆盖；39 个运行依赖另用哈希锁安装。主应用安装、内置接入设置、系统 Finder 下载隔离体验、签名/公证、接收同事实机与其他平台分别保留验收门禁。
