# 0.5.0 配套插件隔离安装与运行时验证

日期：2026-10-28（Asia/Shanghai）  
验收目标：已构建的 `0.5.0`、`AUTH_MODE=disabled`、`darwin-arm64` 本地 marketplace。  
发布配对：`nova-content-hub@0.5.0:p1:disabled`。  
验收环境：macOS Apple Silicon，Node `v24.20.0`；Codex CLI `0.152.1`；CodeBuddy CLI `2.177.1`。

## 隔离安装

没有重设 `HOME`。Codex 命令均使用独立临时 `CODEX_HOME`；WorkBuddy 命令均同时设置 `WORKBUDDY_CONFIG_DIR` 和 `CODEBUDDY_CONFIG_DIR` 为同一独立临时目录。临时目录在检查完成后已清理。

Codex 从构建目录中的本地 marketplace 添加并安装，CLI 返回 `version=0.5.0`、`authPolicy=ON_INSTALL`。`installedPath` 为 `<CODEX_HOME>/plugins/cache/nova-content-hub-auth-disabled-darwin-arm64/nova-content-hub/0.5.0`，与隔离目录内预期缓存路径完全一致；`codex plugin list --json` 返回 `installed=true`、`enabled=true`。

WorkBuddy 从同一构建目录添加本地 marketplace，随后以 `--scope user` 安装。`plugin list --json` 返回 `version=0.5.0`、`scope=user`、`enabled=true`，注册的 `installPath` 为 `<WORKBUDDY_CONFIG_DIR>/plugins/cache/nova-content-hub-auth-disabled-darwin-arm64/nova-content-hub/0.5.0`，与隔离目录内预期缓存路径完全一致。`installed_plugins.json` 中恰有一条该插件注册，`settings.json` 中该插件启用。

以上 `installPath` 均由真实 CLI 注册结果读取并与临时目录逐字比较，隔离检查通过。未升级、覆盖或改动真实用户的 Codex / WorkBuddy 插件。CLI 提示 WorkBuddy 可运行 `/reload-plugins` 或启动新会话；本次没有重载或重启助手会话。

CLI 返回摘要（路径已脱敏）：

```json
{
  "codex": {
    "pluginId": "nova-content-hub@nova-content-hub-auth-disabled-darwin-arm64",
    "version": "0.5.0",
    "enabled": true,
    "installedPath": "<CODEX_HOME>/plugins/cache/nova-content-hub-auth-disabled-darwin-arm64/nova-content-hub/0.5.0",
    "authPolicy": "ON_INSTALL"
  },
  "workbuddy": {
    "id": "nova-content-hub@nova-content-hub-auth-disabled-darwin-arm64",
    "version": "0.5.0",
    "scope": "user",
    "enabled": true,
    "installPath": "<WORKBUDDY_CONFIG_DIR>/plugins/cache/nova-content-hub-auth-disabled-darwin-arm64/nova-content-hub/0.5.0"
  }
}
```

## 构建包与来源完整性

- release 元数据为 `0.5.0`、`disabled`、`darwin-arm64`，pair ID 与两助手安装版本一致。
- 插件有 **28 个顶层技能目录**，全部包含各自的顶层 `SKILL.md`。
- `plugin-src/resources/method-sources.json` 记录 **53 个来源版本**。
- `integrity.json` 登记 **636 个文件 SHA-256**；逐文件重算后 **0 项不匹配**，其中 **418 项**位于 `skills/*/upstream/`。
- marketplace `package-files.json` 格式为 `nova-content-marketplace-package-files`、schema 1，共 **1,376 项**；SHA-256：`c640cedc46dd3c6c89ff6778933d98cd4527846d57e2df74ff88d85e37a087d8`。
- Codex 插件清单指向 `./skills/`；WorkBuddy 插件清单列出 28 个顶层技能路径。upstream 下有 37 份 `METHOD.md`，没有 nested `SKILL.md`，方法源没有被登记为嵌套执行 Skill。

`xindao-xuanti` 原始来源记录 `xindao-xuanti:X:a3778c4f28b16179` 的五个文件都保留原 SHA-256；`method-sources.json`、`integrity.json` 与实际文件内容相符：

| 原始来源文件 | 打包路径 | SHA-256 |
|---|---|---|
| `SKILL.md` | `skills/xindao-xuanti/upstream/current/METHOD.md` | `84189cd06fd9fdb4d5972380e2aecfa07d5e919ca97ec44c5748281486e6601d` |
| `manifest.json` | `skills/xindao-xuanti/upstream/current/manifest.json` | `752a933eb20a75e5047f596363e2f6b05d089c2d53bfebcf2334c58f7b0f18b0` |
| `references/candidate-menu.md` | `skills/xindao-xuanti/upstream/current/references/candidate-menu.md` | `fd8c56d6326843e37edc8ec423a2c547e16353886efaa7942edb1c593d675ce3` |
| `references/material-intake.md` | `skills/xindao-xuanti/upstream/current/references/material-intake.md` | `d360a94c47b474a39d728652b938a4965f4a5eb094fb25ce912ac14860ae2995` |
| `references/topic-expansion.md` | `skills/xindao-xuanti/upstream/current/references/topic-expansion.md` | `5af70b8cb10527f0ccfbe9978789a16ed1a3adbb83b37cfe93fd1b133ab2f027` |

## 本机安装包运行时

使用项目的 `installedAssistantSkill(host, release, ...)` 和 `launchWithAssistantRuntime(host, release, marketRoot, emptyCallback, ...)`，传入上述临时配置路径与构建目录中的 desktop release。每次调用都通过安装登记、`package-files.json` 全包快照及随包 `doctor`，并到达本地空回调：

| 助手 | 能力 | 已识别执行 Skill | 安装登记、整包快照、doctor、空回调 |
|---|---|---|---|
| Codex | cover | `nova-content-cover-execution` | 通过 |
| Codex | template | `nova-content-template-execution` | 通过 |
| Codex | research | `nova-content-research-execution` | 通过 |
| Codex | writing | `nova-content-writing-execution` | 通过 |
| WorkBuddy | cover | `nova-content-cover-execution` | 通过 |
| WorkBuddy | template | `nova-content-template-execution` | 通过 |
| WorkBuddy | research | `nova-content-research-execution` | 通过 |
| WorkBuddy | writing | `nova-content-writing-execution` | 通过 |

doctor 校验 `ok=true`、`authMode=disabled`、`library=unbound`、`imageGeneration=false` 且 stderr 为空。没有启动模型对话、图像生成、付费或外部业务服务，也没有提交真实内容任务。

## 留痕与范围

- 上述 CLI 注册信息保留为脱敏路径证据：缓存路径以 `<CODEX_HOME>` 或 `<WORKBUDDY_CONFIG_DIR>` 表示；临时目录本身已删除。
- WorkBuddy 对新建隔离目录的首次安装日志记录读取用户 `settings.json` 时 `ENOENT`；安装命令随后报告成功，且安装后的注册表、启用设置和四项运行时探测均通过。
- 已验本机 macOS `darwin-arm64` 的本地 marketplace CLI 安装、28 个顶层 Skill、来源及整包 hash、两助手四能力的安装探测和随包 doctor。
- 未验助手当前已打开会话是否即时加载插件、真实模型/业务提交，以及 Intel Mac、Windows 或其他架构。
- 本次源码库写入仅为本记录；未改产品代码、版本或已构建包。
