#!/bin/bash
# 用豆包 Seedream 生成一页幻灯片图，支持参考图锁风格
# 用法: gen_slide.sh <提示词文件> <输出.png> [尺寸] [参考图1] [参考图2] ...
#   尺寸默认 2560x1440；参考图为本地图片路径（如原参考 PPT 的一页、或本套已定稿的首页）
# 需要环境变量 DOUBAO_API_KEY（在 ~/.zshrc 里，用前先 source）
set -euo pipefail
PROMPTFILE="$1"; OUT="$2"; SIZE="${3:-2560x1440}"; shift 3 || true
[ -n "${DOUBAO_API_KEY:-}" ] || { echo "缺 DOUBAO_API_KEY，先 source ~/.zshrc" >&2; exit 1; }
MODEL="${SEEDREAM_MODEL:-doubao-seedream-4-0-250828}"

URL=$(python3 - "$PROMPTFILE" "$SIZE" "$MODEL" "$@" <<'PY'
import base64, json, mimetypes, sys, urllib.request, os
prompt = open(sys.argv[1], encoding="utf-8").read()
body = {"model": sys.argv[3], "prompt": prompt, "size": sys.argv[2],
        "response_format": "url", "watermark": False}
refs = []
for p in sys.argv[4:]:
    mime = mimetypes.guess_type(p)[0] or "image/png"
    b64 = base64.b64encode(open(p, "rb").read()).decode()
    refs.append(f"data:{mime};base64,{b64}")
if refs:
    body["image"] = refs if len(refs) > 1 else refs[0]
req = urllib.request.Request(
    "https://ark.cn-beijing.volces.com/api/v3/images/generations",
    data=json.dumps(body).encode(),
    headers={"Authorization": "Bearer " + os.environ["DOUBAO_API_KEY"],
             "Content-Type": "application/json"})
with urllib.request.urlopen(req, timeout=300) as r:
    print(json.load(r)["data"][0]["url"])
PY
)
curl -sf -o "$OUT" "$URL"
echo "OK: $OUT"
