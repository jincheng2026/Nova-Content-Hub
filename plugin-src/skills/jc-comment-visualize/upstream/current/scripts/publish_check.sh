#!/bin/bash
# 新格式核对数据、原文和生成结果；旧格式保留原有深度检查。
# 文风提示只针对分析文字，不能据此修改真实引文。
set -eu
H="${1:?用法: publish_check.sh 报告.html [L4|L3|L2]}"
L="${2:-L4}"
SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
exec python3 -B "$SCRIPT_DIR/check_report.py" "$H" "$L"
