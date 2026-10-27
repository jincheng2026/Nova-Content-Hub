#!/bin/bash
# install.sh：把创作页（Skill jc-gongzuotai-write）部署到本机正式位置，并让保存服务常驻。
#
# 代码只在这个目录（工具项目/内容工作台-2.0/creation-page）里改；改完跑一次本脚本就上线。不要直接改安装目录里的文件。
#
# 做的事：
#   1. 把运行要用的文件复制成一个新版本：<安装目录>/versions/<时间>-<提交号>/（测试、缓存不复制）。
#   2. 编译检查新版本的 Python 脚本，过了才把 <安装目录>/current 指到新版本。旧版本都留着，不删。
#   3. ~/.claude/skills/jc-gongzuotai-write 指向 <安装目录>/current（已存在且指向别处时停下，不覆盖）。
#   4. 保存服务：launchd 任务 com.hejincheng.brain-save，端口 8977，根目录是第二大脑。
#      没装过就写配置并加载；装过就重启一次，让新代码生效。样式和界面脚本服务每次现读，不重启也会用上新版。
#   5. 等 /healthz 回答，打印 service.sh status。
#
# 回退：把 current 指回 versions/ 里上一个版本，再重启服务：
#   ln -sfn "versions/<上一个版本>" "<安装目录>/current" && launchctl kickstart -k gui/$(id -u)/com.hejincheng.brain-save
# 停用服务：launchctl bootout gui/$(id -u)/com.hejincheng.brain-save（配置文件在 ~/Library/LaunchAgents/com.hejincheng.brain-save.plist）
#
# 参数：--no-service  只部署文件和 Skill 链接，不碰 launchd（测试用）
# 环境变量（测试用）：JC_INSTALL_ROOT 安装目录，JC_SKILL_LINK Skill 链接位置，JC_BRAIN_ROOT 第二大脑根目录，
#                     JC_SAVE_PORT 端口，JC_SAVE_LABEL launchd 标签，JC_LAUNCH_AGENTS 放配置文件的目录
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
ROOT="${JC_INSTALL_ROOT:-$HOME/Library/Application Support/JinCheng/brain-save}"
SKILL_LINK="${JC_SKILL_LINK:-$HOME/.claude/skills/jc-gongzuotai-write}"
BRAIN="${JC_BRAIN_ROOT:-/Users/hejincheng/AIJinCheng/个人IP与内容/第二大脑}"
PORT="${JC_SAVE_PORT:-8977}"
LABEL="${JC_SAVE_LABEL:-com.hejincheng.brain-save}"
AGENTS_DIR="${JC_LAUNCH_AGENTS:-$HOME/Library/LaunchAgents}"
PLIST="$AGENTS_DIR/$LABEL.plist"
LOG="$HOME/Library/Logs/brain-save.log"
DOMAIN="gui/$(id -u)"
WITH_SERVICE=1
[ "${1:-}" = "--no-service" ] && WITH_SERVICE=0

fail() { echo "失败：$*" >&2; exit 1; }

# 运行要用的文件（新增文件或目录时在这里加一行）
ITEMS=(SKILL.md brain_page.py build_page.py creation_doc.py 文案术语表.md kit template server schema)
for it in "${ITEMS[@]}"; do [ -e "$SRC/$it" ] || fail "源目录里缺 $it（$SRC）"; done
[ -d "$BRAIN" ] || fail "第二大脑根目录不存在：$BRAIN"

commit="$(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || echo nogit)"
if [ "$commit" != nogit ] && [ -n "$(git -C "$SRC" status --porcelain -- . 2>/dev/null)" ]; then commit="$commit-未提交"; fi
ver="$(date +%Y%m%d-%H%M%S)-$commit"
dest="$ROOT/versions/$ver"
[ -e "$dest" ] && fail "版本目录已存在：$dest"
mkdir -p "$dest"
for it in "${ITEMS[@]}"; do
  rsync -a --exclude '__pycache__' --exclude '*.pyc' --exclude '.DS_Store' --exclude 'tests' "$SRC/$it" "$dest/"
done
printf '来源：%s\n提交：%s\n部署时间：%s\n' "$SRC" "$commit" "$(date '+%Y-%m-%d %H:%M:%S')" > "$dest/VERSION.txt"

# 编译检查：有语法错误就不切换
for py in "$dest"/*.py "$dest"/server/*.py; do
  /usr/bin/python3 -c 'import sys; compile(open(sys.argv[1], encoding="utf-8").read(), sys.argv[1], "exec")' "$py" \
    || fail "新版本里 $(basename "$py") 编译不过，没有切换（新版本留在 $dest 供检查）"
done

# 原子切换 current
/usr/bin/python3 - "$ROOT" "versions/$ver" <<'PY'
import os, sys
root, target = sys.argv[1], sys.argv[2]
tmp = os.path.join(root, '.current.tmp')
if os.path.lexists(tmp): os.remove(tmp)
os.symlink(target, tmp)
os.replace(tmp, os.path.join(root, 'current'))
PY
echo "已部署：$ROOT/current -> versions/$ver"

# Skill 链接
want="$ROOT/current"
if [ -L "$SKILL_LINK" ]; then
  [ "$(readlink "$SKILL_LINK")" = "$want" ] || fail "$SKILL_LINK 已经指向别处（$(readlink "$SKILL_LINK")），没有覆盖"
elif [ -e "$SKILL_LINK" ]; then
  fail "$SKILL_LINK 已存在且不是链接，没有覆盖"
else
  mkdir -p "$(dirname "$SKILL_LINK")"
  ln -s "$want" "$SKILL_LINK"
  echo "已建 Skill 链接：$SKILL_LINK -> $want"
fi

[ "$WITH_SERVICE" = 1 ] || { echo "按 --no-service 跳过保存服务"; exit 0; }

mkdir -p "$AGENTS_DIR" "$(dirname "$LOG")"
if [ ! -f "$PLIST" ]; then
  /usr/bin/python3 - "$PLIST" "$LABEL" "$ROOT/current/server/brain_save.py" "$BRAIN" "$PORT" "$LOG" <<'PY'
import plistlib, sys
plist, label, script, brain, port, log = sys.argv[1:]
with open(plist, 'wb') as f:
    plistlib.dump({
        'Label': label,
        'ProgramArguments': ['/usr/bin/python3', script, '--root', brain, '--port', port],
        'RunAtLoad': True,
        'KeepAlive': True,
        'ThrottleInterval': 10,  # 挂了 10 秒后再拉起；端口被占时 brain_save.py 退出码 3，service.sh status 会说明
        'StandardOutPath': log,
        'StandardErrorPath': log,
    }, f)
PY
  launchctl bootstrap "$DOMAIN" "$PLIST" || fail "launchd 加载失败（$PLIST）"
  echo "已安装并启动保存服务：$LABEL（端口 $PORT，根目录 $BRAIN）"
else
  launchctl kickstart -k "$DOMAIN/$LABEL" || fail "重启保存服务失败（$LABEL）"
  echo "已重启保存服务：$LABEL"
fi

for _ in 1 2 3 4 5 6 7 8 9 10; do
  curl -s -m 1 "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1 && break
  sleep 1
done
JC_SAVE_PORT="$PORT" JC_SAVE_LABEL="$LABEL" "$ROOT/current/server/service.sh" status
