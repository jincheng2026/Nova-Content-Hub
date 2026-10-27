# Codex 插件真实安装冒烟记录

日期：2026-10-28（Asia/Shanghai）  
目标：Codex 插件安装与本机运行时就绪探测  
发布包：`0.4.0`，`darwin-arm64`，`AUTH_MODE=disabled`，`pairId=nova-content-hub@0.4.0:p1:disabled`

## 隔离与执行范围

使用 `mktemp` 创建临时 `CODEX_HOME`，真实 `HOME` 未重设；插件市场和插件缓存均落在临时目录。Codex CLI 操作未读取或改动真实 `~/.codex`。本机 Node 为 `v24.20.0 darwin-arm64`。验收只覆盖此 macOS Apple Silicon 环境。

真实 CLI 命令：

```sh
codex plugin marketplace add /Users/mac/code/dashboard/Nova-Content-Hub/workbench/dist-desktop/auth-disabled/workbench/plugin-marketplace --json
codex plugin add nova-content-hub@nova-content-hub-auth-disabled-darwin-arm64 --json
```

CLI 返回：

```json
{
  "marketplaceName": "nova-content-hub-auth-disabled-darwin-arm64",
  "installedRoot": "/Users/mac/code/dashboard/Nova-Content-Hub/workbench/dist-desktop/auth-disabled/workbench/plugin-marketplace",
  "alreadyAdded": false
}
```

```json
{
  "pluginId": "nova-content-hub@nova-content-hub-auth-disabled-darwin-arm64",
  "name": "nova-content-hub",
  "marketplaceName": "nova-content-hub-auth-disabled-darwin-arm64",
  "version": "0.4.0",
  "installedPath": "/private/var/folders/vl/nhqtk_8s6vl5j679xhv_z3n80000gn/T/codex-plugin-smoke.YolpIp/plugins/cache/nova-content-hub-auth-disabled-darwin-arm64/nova-content-hub/0.4.0",
  "authPolicy": "ON_INSTALL"
}
```

## 核验结果

- CLI 安装成功，缓存版本为 `0.4.0`；构建 release 元数据与缓存插件版本、配对 ID、平台及架构一致。
- 安装缓存有 21 个技能目录；integrity 清单有 21 个技能条目，21 份 `SKILL.md` 的 SHA-256 均与 integrity 登记相符。
- 其中 14 个条目为 `business-method`；`xindao-interview`、`xindao-xuanti` 及全部 `jc-*` 条目均在缓存中。
- 对每项能力均调用本项目 `installedAssistantSkill(host='codex', ...)` 和 `launchWithAssistantRuntime(...)`。运行时检查完整包快照并执行随包 doctor；四项均通过。

| 能力 | 已识别执行 Skill | 本机安装检查 | 完整性快照与 doctor | 空回调到达 |
|---|---|---|---|---|
| cover | `nova-content-cover-execution` | 通过 | 通过 | 通过 |
| template | `nova-content-template-execution` | 通过 | 通过 | 通过 |
| research | `nova-content-research-execution` | 通过 | 通过 | 通过 |
| writing | `nova-content-writing-execution` | 通过 | 通过 | 通过 |

运行时 doctor 按代码契约验证返回 `ok=true`、`authMode=disabled`、`library=unbound`、`imageGeneration=false` 且无 stderr；通过后只调用本地空回调。没有启动模型对话、付费接口或真实内容业务执行。

## 验收边界

- 已验：Codex CLI 对本地 marketplace 的真实安装、临时缓存版本与技能文件完整性、本机四能力探测及随包 doctor。
- 未验：WorkBuddy 安装及运行、Codex 交互式模型调用、端到端业务提交、其他 macOS/Windows 架构、安装器与系统 UI 展示验收。
- 临时 `CODEX_HOME` 在记录完成后清理；本报告为本次唯一源码库写入。未提交变更。
