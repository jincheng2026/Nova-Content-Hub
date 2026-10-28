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

## WorkBuddy CLI 安装路径核验（2026-10-28 补充）

### 配置路径解析

检查了本机 `/Users/mac/.local/bin/codebuddy` 所属已安装 CLI 包 `/Users/mac/.local/lib/node_modules/@tencent-ai/codebuddy-code`：打包代码的 `getWorkbuddyConfigDir()` 读取 `WORKBUDDY_CONFIG_DIR`，为空时默认 `~/.workbuddy`；版本记录也说明 WorkBuddy 使用独立的 `.workbuddy/` 配置目录。CLI 帮助确认提供 `plugin marketplace add`、`plugin install --scope user`、`plugin list --json`、`plugin enable` 和 `plugin update` 命令。

### 隔离安装结果及路径偏差

在临时目录 `WORKBUDDY_CONFIG_DIR=/var/folders/vl/nhqtk_8s6vl5j679xhv_z3n80000gn/T//workbuddy-plugin-smoke.hLrdsn` 下执行了：

```sh
codebuddy plugin marketplace add "/Applications/自媒体工作台.app/Contents/Resources/plugin-marketplace" --name nova-content-hub-auth-disabled-darwin-arm64
codebuddy plugin install nova-content-hub@nova-content-hub-auth-disabled-darwin-arm64 --scope user
codebuddy plugin list --json
```

CLI 报 marketplace 添加成功及插件安装成功，并提示 `Run /reload-plugins to apply now, or start a new session.`。但 `plugin list --json` 返回目标插件 `version=0.4.0`、`scope=user`、`enabled=true`，其 `installPath` 却为 `/Users/mac/.codebuddy/plugins/cache/nova-content-hub-auth-disabled-darwin-arm64/nova-content-hub/0.4.0`，没有跟随临时 `WORKBUDDY_CONFIG_DIR`。只读核对发现该缓存路径存在且 manifest 版本为 `0.4.0`；`/Users/mac/.workbuddy/plugins/cache/nova-content-hub-auth-disabled-darwin-arm64/nova-content-hub/0.4.0` 不存在。由于安装前未检查 `~/.codebuddy` 中该精确缓存是否已存在，不能断言它由本次命令新建或覆盖。

### 结论与范围

- WorkBuddy 真实插件安装：**未验收**。CLI 插件管理器落到 CodeBuddy cache，无法证明安装到应用使用的 `/Users/mac/.workbuddy`。
- `installedAssistantSkill('workbuddy', ...)` 与 `launchWithAssistantRuntime(...)`：**未运行**，目标缓存不在预期路径；不能伪造 WorkBuddy doctor 成功。
- 未对 `/Users/mac/.workbuddy` 执行真实安装或修改其它设置。CLI 提示需 `/reload-plugins` 或新会话；未重启 WorkBuddy 或 Codex。
- 本次隔离目录未包含安装缓存，完成后已清理。未启动模型会话、收费服务或真实业务执行。

## WorkBuddy 实际安装与运行时验收（2026-10-28 最终补充）

### CLI 配置隔离验证

本机 `codebuddy` 包内存在 `getWorkbuddyConfigDir()`（读取 `WORKBUDDY_CONFIG_DIR`）和插件缓存路径所用的 CodeBuddy 配置目录解析（读取 `CODEBUDDY_CONFIG_DIR`）两套逻辑。此前只传 `WORKBUDDY_CONFIG_DIR` 的隔离尝试使插件 CLI 仍写入 `~/.codebuddy`。随后用新的临时目录同时设置两变量为同一路径，重新添加 app 内本地 marketplace 并安装；`plugin list --json` 返回 `installPath` 精确为 `<临时目录>/plugins/cache/nova-content-hub-auth-disabled-darwin-arm64/nova-content-hub/0.4.0`，该缓存存在。隔离验证通过，临时目录已清理。

### 对意外写入的收敛

首轮仅设置 `WORKBUDDY_CONFIG_DIR` 时，真实 `~/.codebuddy` 中的 Nova 插件注册被 CLI 更新到 `0.4.0`，`lastUpdated` 为 `2026-10-27T17:41:33.434Z`。其 `installedAt` 保持 `2026-10-20T04:28:42.903Z`；旧 `0.3.27` 缓存仍在。既有同名 marketplace 记录的 `lastUpdated` 仍为 `2026-10-20T04:28:40.910Z`，源路径为已安装 app 的 marketplace。本次未改动或删除该旧缓存、旧 `installedAt` 和 marketplace 记录，也未尝试猜测或恢复无法确认的旧 registry 状态。主线程决定保留此同一 Nova 插件的 `0.4.0` 更新；因此真实 `~/.codebuddy` 更新是本次操作的真实副作用，不属于临时隔离成功。

### WorkBuddy 目标目录实装

实装时显式同时设置 `WORKBUDDY_CONFIG_DIR=/Users/mac/.workbuddy` 与 `CODEBUDDY_CONFIG_DIR=/Users/mac/.workbuddy`，使用已安装 app 的本地 marketplace：

```sh
codebuddy plugin marketplace add "/Applications/自媒体工作台.app/Contents/Resources/plugin-marketplace" --name nova-content-hub-auth-disabled-darwin-arm64
codebuddy plugin install nova-content-hub@nova-content-hub-auth-disabled-darwin-arm64 --scope user
```

CLI 返回 marketplace 添加成功、插件安装成功。安装后的 `plugin list --json` 精确记录：

```json
{
  "id": "nova-content-hub@nova-content-hub-auth-disabled-darwin-arm64",
  "version": "0.4.0",
  "scope": "user",
  "enabled": true,
  "installPath": "/Users/mac/.workbuddy/plugins/cache/nova-content-hub-auth-disabled-darwin-arm64/nova-content-hub/0.4.0"
}
```

此前 `~/.workbuddy` 中同 selector 的用户安装为 `0.3.57` 且启用；CLI 安装后指向 `0.4.0`。旧 `.workbuddy` `0.3.57` 缓存未删除。app `Resources/app/package.json` 版本与随包 plugin release 均为 `0.4.0`，配对 ID 为 `nova-content-hub@0.4.0:p1:disabled`。

### WorkBuddy 运行时结果

用 `installedAssistantSkill(host='workbuddy', ...)` 和 `launchWithAssistantRuntime(...)` 验证四种能力。四项均通过安装登记、插件包快照与随包 doctor；doctor 校验 `ok=true`、`authMode=disabled`、`library=unbound`、`imageGeneration=false` 且无 stderr。每项只到达本地空回调，没有执行 handoff、模型会话或内容业务。

| 能力 | 执行 Skill | 安装检查 | 整包校验与 doctor |
|---|---|---|---|
| cover | `nova-content-cover-execution` | 通过 | 通过 |
| template | `nova-content-template-execution` | 通过 | 通过 |
| research | `nova-content-research-execution` | 通过 | 通过 |
| writing | `nova-content-writing-execution` | 通过 | 通过 |

CLI 要求运行 `/reload-plugins` 或启动新会话以应用插件；本次未运行该命令，也未重启 WorkBuddy 或 Codex。因此已验 CLI 登记、启用状态和随包运行时 doctor，**未验 WorkBuddy 当前已打开会话是否即时加载新版本**。未执行 AI 真实业务验收。
