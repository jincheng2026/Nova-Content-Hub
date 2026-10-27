#!/usr/bin/env bash
set -euo pipefail

cwd="${1:-$PWD}"
projects_dir="${CLAUDE_PROJECTS_DIR:-$HOME/.claude/projects}"
pid_dir="${CLAUDE_SESSION_PID_DIR:-$HOME/.claude/.session-pids}"

project_key="$(printf '%s' "$cwd" | sed 's|/|-|g')"
project_dir="$projects_dir/$project_key"

latest_jsonl() {
  local root="$1"
  local max_depth="$2"
  local find_args=("$root")
  if [[ ! -d "$root" ]]; then
    return 0
  fi
  if [[ -n "$max_depth" ]]; then
    find_args+=("-maxdepth" "$max_depth")
  fi
  if [[ "$(uname -s)" == "Darwin" ]]; then
    find "${find_args[@]}" -name '*.jsonl' -type f -exec stat -f '%m %N' {} \; 2>/dev/null \
      | sort -nr \
      | sed 's/^[0-9][0-9]* //' \
      | head -1
  else
    find "${find_args[@]}" -name '*.jsonl' -type f -exec stat -c '%Y %n' {} \; 2>/dev/null \
      | sort -nr \
      | sed 's/^[0-9][0-9]* //' \
      | head -1
  fi
}

session_id=""
session_source="missing"

pid="$PPID"
while [[ -n "$pid" && "$pid" != "0" && "$pid" != "1" ]]; do
  pid_file="$pid_dir/$pid"
  if [[ -f "$pid_file" ]]; then
    session_id="$(cat "$pid_file" 2>/dev/null | tr -d '[:space:]' || true)"
    if [[ -n "$session_id" ]]; then
      session_source="pid-file:$pid"
      break
    fi
  fi
  pid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d '[:space:]' || true)"
done

jsonl_path=""

if [[ -n "$session_id" && -d "$projects_dir" ]]; then
  jsonl_path="$(find "$projects_dir" -name "$session_id.jsonl" -print -quit 2>/dev/null || true)"
fi

if [[ -z "$jsonl_path" && -d "$project_dir" ]]; then
  jsonl_path="$(latest_jsonl "$project_dir" "1" || true)"
  if [[ -n "$jsonl_path" && -z "$session_id" ]]; then
    session_id="$(basename "$jsonl_path" .jsonl)"
    session_source="project-latest-jsonl"
  fi
fi

if [[ -z "$jsonl_path" && "${JC_HANDOFF_ALLOW_GLOBAL_JSONL_FALLBACK:-0}" == "1" && -d "$projects_dir" ]]; then
  jsonl_path="$(latest_jsonl "$projects_dir" "" || true)"
  if [[ -n "$jsonl_path" && -z "$session_id" ]]; then
    session_id="$(basename "$jsonl_path" .jsonl)"
    session_source="global-latest-jsonl"
  fi
fi

if [[ -n "$session_id" && -z "$session_source" ]]; then
  session_source="unknown"
fi

printf 'cwd=%s\n' "$cwd"
printf 'project_key=%s\n' "$project_key"
printf 'project_dir=%s\n' "$project_dir"
printf 'session_id=%s\n' "${session_id:-missing}"
printf 'session_source=%s\n' "$session_source"
printf 'jsonl_path=%s\n' "${jsonl_path:-missing}"
