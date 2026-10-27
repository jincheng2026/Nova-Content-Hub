#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
skill_dir="$(dirname "$script_dir")"
target_dir="${1:-$skill_dir/models/sensevoice-small}"
archive_url="https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2"

if [[ -e "$target_dir" ]]; then
  echo "目标已存在，拒绝覆盖：$target_dir" >&2
  exit 2
fi

for command_name in curl tar; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "缺少命令：$command_name" >&2
    exit 2
  fi
done

temp_dir="$(mktemp -d)"
cleanup() {
  if [[ -n "${temp_dir:-}" && -d "$temp_dir" ]]; then
    rm -rf -- "$temp_dir"
  fi
}
trap cleanup EXIT

archive_path="$temp_dir/model.tar.bz2"
curl -fL --retry 3 --output "$archive_path" "$archive_url"
tar -xjf "$archive_path" -C "$temp_dir"

model_path="$(find "$temp_dir" -type f -name 'model.int8.onnx' -print -quit)"
if [[ -z "$model_path" ]]; then
  echo "下载包内未找到 model.int8.onnx" >&2
  exit 2
fi
source_dir="$(dirname "$model_path")"
if [[ ! -f "$source_dir/tokens.txt" ]]; then
  echo "下载包内未找到 tokens.txt" >&2
  exit 2
fi

mkdir -p "$(dirname "$target_dir")"
mkdir "$target_dir"
cp "$source_dir/model.int8.onnx" "$target_dir/model.int8.onnx"
cp "$source_dir/tokens.txt" "$target_dir/tokens.txt"

test -s "$target_dir/model.int8.onnx"
test -s "$target_dir/tokens.txt"
echo "SenseVoice Small 已安装到：$target_dir"
