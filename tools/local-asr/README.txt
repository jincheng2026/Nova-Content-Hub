Qwen3-ASR 离线附加包 · 2026.10.27 · darwin-arm64 · macOS 26
适用：Apple Silicon Mac（M 系列）+ macOS 26，原生 arm64。建议 16 GB 内存，至少 8 GB 可用磁盘。

同事操作（解压后先不要移动已安装组件）：
1. 双击 install.command。无需安装 Python、Homebrew、uv 或联网；安装过程包含固定依赖安装和一句中文的真实本地识别。
   如果 macOS 拒绝运行，请核对发送者及 ZIP SHA256，再按所在组织允许的 macOS 安全操作流程处理。
   此预览附加包没有 Developer ID 签名或公证；不建议绕过组织安全策略。Finder 下载隔离提示尚待接收机器实际验收。
2. 在工作台设置的本地 Qwen3-ASR 中，粘贴安装窗口输出的 Python 路径与模型目录，保存后执行工作台内的短音频转录验收。
   两条路径也保存在安装目录的“工作台设置路径.txt”。不要把 install.command 或模型文件填进 Python 路径。

默认安装目录：~/Library/Application Support/NovaIsland/QwenASRAddons/2026.10.27
可在终端通过 bash install.command "/绝对/安装目录" 选择别处；目录必须不存在。无需 sudo。
安装器只写它新建的组件目录，不读写工作台内容库、设置、密钥、系统 Python。
重复运行遇到已存在目录会停止，不覆盖旧组件；若有 installation-test.json 且 outcome=passed，可直接使用原路径。
失败后保留该组件目录供排查；确认它确为本次新建的附加组件后，可在 Finder 手动移除，再重试。

安装自测的正常文字：你好，语音测试。
自测只验证内附 1.543 秒中文音频及当前本地模型，不代表任意音频、长音频或其他语言均通过。
本机开发环境已验证“独立路径重新建 venv + 纯离线安装 + 拒绝网络的真实识别”；接收同事机器仍需验收。
此包仅组件自测，不修改工作台，也不包含工作台应用安装包。工作台版本及实际内置接入兼容性须按本次工作台交付记录核对。

安装后不要移动组件目录（venv 使用安装绝对路径）。如需换目录，请从原始附加包重新安装。
卸载：先在工作台手动停用/更换该本地引擎，然后只移除上述独立组件目录。内容库与工作台设置由工作台自己管理。
旧版 macOS、Intel Mac、Windows x64、Windows ARM 未包含可运行载荷、未验收，不受此包支持。
未验证生产签名、公证、自动升级、Finder 下载隔离处理和接收机器安装；请保留这些交付门禁。

组成与来源：
- Python 3.11.16，python-build-standalone 20260825，aarch64-apple-darwin 官方 install_only archive。
- mlx-audio 0.6.2 / MLX 0.32.4，39 个固定 PyPI wheel；requirements.lock 含 SHA256。
- mlx-community/Qwen3-ASR-1.7B-8bit，固定 revision a8379a2e2f9e313c9292cdf1af4055ab56d50d55。
- wheel-manifest.json、python-source.json、model-manifest.json 提供来源、字节数和哈希。
- licenses/ 保留 CPython 及 standalone 依赖许可、wheel 原始许可/元数据、模型 Apache-2.0 许可。
  原始 wheel 全部保留，随包原生库的 notices/licenses 也包含在原始 wheel 中。
- SHA256SUMS 用于包内完整性检查；ZIP 外部 SHA256 需要从可信发送者获得。

本附加组件打包维护：杭州新岛橙灵智能科技有限责任公司
© 2026 杭州新岛橙灵智能科技有限责任公司（仅适用于原创安装/验收脚本；第三方组件遵循各自许可）
