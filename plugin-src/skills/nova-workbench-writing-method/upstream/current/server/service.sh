#!/bin/bash
# 保存服务的状态检查（只读：不加载、不卸载任何 launchd 任务，不启动、不停止服务）。
#   status   launchd 里有没有加载这个服务（有就给摘要）+ /healthz，并核对回答 /healthz 的是不是 launchd 管的那个进程
# 环境变量：JC_SAVE_PORT 换端口（默认 8977），JC_SAVE_LABEL 换 launchd 标签（默认 com.hejincheng.brain-save），
#           JC_LAUNCHCTL 换成假的 launchctl（只在测试 status 时用）
set -uo pipefail
LABEL="${JC_SAVE_LABEL:-com.hejincheng.brain-save}"
DOMAIN="gui/$(id -u)"
PORT="${JC_SAVE_PORT:-8977}"
LAUNCHCTL="${JC_LAUNCHCTL:-launchctl}"
EXIT_PORT_BUSY=3  # 和 brain_save.py 的 EXIT_PORT_BUSY 一致

svc_pid() {
  "$LAUNCHCTL" print "$DOMAIN/$LABEL" 2>/dev/null | awk -F' = ' '/^[[:space:]]*pid = /{print $2; exit}'
}

case "${1:-}" in
  status)
    lpid=""
    if info=$("$LAUNCHCTL" print "$DOMAIN/$LABEL" 2>&1); then
      echo "  launchd：已加载 $LABEL"
      echo "$info" | grep -E '^[[:space:]]*(state|pid|runs|last exit code|last terminating signal) = ' | sed 's/^[[:space:]]*/    /'
      lpid=$(svc_pid)
      if grep -Eq "^[[:space:]]*last exit code = ${EXIT_PORT_BUSY}[[:space:]]*$" <<<"$info"; then
        echo "    （上次退出码 ${EXIT_PORT_BUSY}：启动时 $PORT 端口被别的进程占着，详情看服务日志最后几行）"
      fi
    else
      echo "  launchd：没有加载 $LABEL（样板服务是用 nohup 起的，这里没有也正常）"
    fi
    body=$(curl -s -m 3 "http://127.0.0.1:$PORT/healthz")
    echo "  healthz：${body:-连不上 127.0.0.1:$PORT}"
    hpid=$(printf '%s' "$body" | /usr/bin/python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("pid") or "")
except Exception: print("")' 2>/dev/null)
    if [ -n "$body" ] && [ -z "$hpid" ]; then
      echo "  注意：$PORT 端口上有程序在回答，但回的不是保存服务的 healthz。"
    elif [ -n "$hpid" ] && [ -n "$lpid" ] && [ "$hpid" != "$lpid" ]; then
      echo "  注意：$PORT 端口上回答的不是 launchd 管的这个服务（healthz 的 pid=${hpid}，launchd 的 pid=${lpid}）。上面的 healthz 不能当成本服务正常。"
    elif [ -n "$hpid" ] && [ -n "$lpid" ]; then
      echo "  核对：healthz 的 pid 和 launchd 的 pid 一致（${hpid}）。"
    elif [ -n "$hpid" ]; then
      echo "  说明：服务在回答（pid=${hpid}），不归 launchd 管。"
    fi
    ;;
  *)
    sed -n '2,5p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
