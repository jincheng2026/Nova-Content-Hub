#!/bin/bash
# Offline component installation; deliberately does not access workbench preferences.
set -euo pipefail
export PATH=/usr/bin:/bin:/usr/sbin:/sbin
unset PYTHONHOME PYTHONPATH VIRTUAL_ENV
export PYTHONNOUSERSITE=1 PYTHONDONTWRITEBYTECODE=1
export HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 HF_HUB_DISABLE_TELEMETRY=1
source_dir="$(cd "$(dirname "$0")" && pwd -P)"
destination="${1:-$HOME/Library/Application Support/NovaIsland/QwenASRAddons/2026.10.27}"
fail() { echo "安装未完成：$*" >&2; exit 1; }
[ "$(uname -s)" = Darwin ] || fail '本附加包只支持 Apple Silicon Mac + macOS 26。'
[ "$(uname -m)" = arm64 ] || fail '请在 Apple Silicon 原生终端运行，不支持 Intel 或 Rosetta。'
[ "$(sw_vers -productVersion | cut -d. -f1)" = 26 ] || fail '此固定 MLX 载荷仅验收 macOS 26。'
case "$destination" in /*) ;; *) fail '安装目录必须为绝对路径。';; esac
[ ! -e "$destination" ] && [ ! -L "$destination" ] || fail "目录已存在，未覆盖：${destination}。请检查已有组件状态；如安装未完成或无法确认，请保留检查或另选新的空目录。"
cd "$source_dir"
echo '1/4 校验离线包完整性（约 3 GB）…'
/usr/bin/shasum -a 256 -c SHA256SUMS > /dev/null || fail '载荷校验失败，请重新获取完整附加包。'
mkdir -p "$(dirname "$destination")"
# The new directory is never moved after venv creation: interpreter paths stay valid.
mkdir "$destination"
echo '2/4 复制 Python 与模型组件…'
/usr/bin/ditto "$source_dir/python" "$destination/python"
/usr/bin/ditto "$source_dir/models" "$destination/models"
/usr/bin/ditto "$source_dir/licenses" "$destination/licenses"
cp "$source_dir/model-manifest.json" "$source_dir/wheel-manifest.json" "$source_dir/python-source.json" "$source_dir/requirements.lock" "$source_dir/README.txt" "$destination/"
mkdir "$destination/self-test"
cp "$source_dir/self-test/known-chinese.wav" "$source_dir/self-test/verify.py" "$destination/self-test/"
echo '3/4 新建 venv，并从附带 wheel 离线安装固定版本…'
"$destination/python/bin/python3" -I -m venv "$destination/venv"
"$destination/venv/bin/python" -I -m pip --isolated install --no-index --find-links "$source_dir/wheels" --require-hashes --only-binary=:all: --no-cache-dir --disable-pip-version-check -r "$source_dir/requirements.lock"
"$destination/venv/bin/python" -I -m pip --isolated check
echo '4/4 本地识别内附中文测试音频…'
"$destination/venv/bin/python" -I "$destination/self-test/verify.py" --model "$destination/models/Qwen3-ASR-1.7B-8bit" --audio "$destination/self-test/known-chinese.wav" --output "$destination/installation-test.json"
{
  printf '本地 Python 可执行文件：\n%s\n\n' "$destination/venv/bin/python"
  printf '本地模型目录：\n%s\n' "$destination/models/Qwen3-ASR-1.7B-8bit"
} | tee "$destination/工作台设置路径.txt"
echo '组件安装与中文自测通过。请在工作台设置中选择本地 Qwen3-ASR，手动粘贴以上两条路径。此脚本没有修改工作台设置。'
if [ -t 0 ]; then read -r -p '按回车关闭此窗口。' unused_reply; fi
