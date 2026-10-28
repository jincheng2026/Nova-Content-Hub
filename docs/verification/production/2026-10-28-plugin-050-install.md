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

## 最终已安装应用中的真实用户安装验收（v2 历史记录，后由 v4 复验）

日期：2026-10-28（Asia/Shanghai）

冻结源码：`2a5d906697347a6518883d02f2930c7429f83b43`

已安装 DMG：`Nova-Content-Hub-0.5.0-darwin-arm64-preview.dmg`，SHA-256 `102a4f7b9d0ce2961408c33e36a49b75da5ce202b1c334afce35c2610df8b26c`，3,200,547,172 bytes。安装记录见 `2026-10-28-final-050-arm64-v2/installation.json`；最终 `.app` 的 deep/strict 签名检查由同次安装验收记录确认通过。

验收前从真实 CLI 只读取目标插件记录：Codex 与 WorkBuddy 均登记 `0.4.0` 且启用。最终插件仅从 `/Applications/自媒体工作台.app/Contents/Resources/plugin-marketplace` 安装；没有设置假的 `HOME`，Codex 的 `CODEX_HOME` 未设置。WorkBuddy CLI 两个配置变量都显式设为 `/Users/mac/.workbuddy`。命令均成功，结果为：

| 助手 | 命令 | CLI 结果 |
|---|---|---|
| Codex | `codex plugin marketplace add /Applications/自媒体工作台.app/Contents/Resources/plugin-marketplace --json` | exit 0；市场已指向上述安装目录 |
| Codex | `codex plugin add nova-content-hub@nova-content-hub-auth-disabled-darwin-arm64 --json` | exit 0；`version=0.5.0`、`authPolicy=ON_INSTALL`，安装路径 `/Users/mac/.codex/plugins/cache/nova-content-hub-auth-disabled-darwin-arm64/nova-content-hub/0.5.0` |
| WorkBuddy | `codebuddy plugin marketplace add /Applications/自媒体工作台.app/Contents/Resources/plugin-marketplace --name nova-content-hub-auth-disabled-darwin-arm64` | exit 0；本地目录市场添加成功 |
| WorkBuddy | `codebuddy plugin install nova-content-hub@nova-content-hub-auth-disabled-darwin-arm64 --scope user` | exit 0；安装成功，CLI 提示运行 `/reload-plugins` 或开启新会话后生效 |

安装后以 `plugin list --json` 重新读取并仅保留目标插件字段：Codex 为 `version=0.5.0`、`installed=true`、`enabled=true`、`authPolicy=ON_INSTALL`；WorkBuddy 为 `version=0.5.0`、`scope=user`、`enabled=true`，`installPath=/Users/mac/.workbuddy/plugins/cache/nova-content-hub-auth-disabled-darwin-arm64/nova-content-hub/0.5.0`。WorkBuddy 两个配置变量都指向该路径的父配置目录。两个 cache 中的 0.5.0 release 均与最终桌面 release 一致。

本次最终安装目录的实际 package-files 摘要为 `a3e21088e99137e99b9c79157b10316f4c91833034cae6c6383e20d9646d1b3c`，格式与 schema 正确；对插件目录重新计算的 1,376 项快照与 manifest 完全相等。28 个顶层 Skill 均含 `SKILL.md`；636 个 integrity 文件哈希全部匹配，含 418 个 upstream 文件；来源 manifest 有 53 个版本。`xindao-xuanti:X:a3778c4f28b16179` 的五个原始文件 hash 与本记录上方来源表完全一致。最终包 release 为 `0.5.0`、`disabled`、`darwin-arm64`、`nova-content-hub@0.5.0:p1:disabled`。

从已安装 `.app` 的 `assistant-skill.mjs` 与 `assistant-runtime.mjs` 逐项运行 `installedAssistantSkill()` 和 `launchWithAssistantRuntime()`。每项均核对目标 Skill、用户安装登记、整包 snapshot、随包 `doctor`（`ok=true`、`authMode=disabled`、`library=unbound`、`imageGeneration=false`、stderr 为空）并到达本地空 callback：

| 助手 | 能力 | 已识别 Skill | 结果 |
|---|---|---|---|
| Codex | cover | `nova-content-cover-execution` | 通过 |
| Codex | template | `nova-content-template-execution` | 通过 |
| Codex | research | `nova-content-research-execution` | 通过 |
| Codex | writing | `nova-content-writing-execution` | 通过 |
| WorkBuddy | cover | `nova-content-cover-execution` | 通过 |
| WorkBuddy | template | `nova-content-template-execution` | 通过 |
| WorkBuddy | research | `nova-content-research-execution` | 通过 |
| WorkBuddy | writing | `nova-content-writing-execution` | 通过 |

真实用户旧缓存留痕：升级前 CLI 注册版本为 `0.4.0`，但升级前没有检查 `0.4.0` cache 目录；升级后 Codex 的 `0.4.0` 目录不存在，WorkBuddy 的 `0.4.0` 目录仍存在。无法据此判断 Codex 目录在升级前是否存在或是否被 CLI 清理，因此不宣称其被保留；没有手动恢复缓存或强改注册。安装器保留旧应用的完整备份；本次未对其他插件执行安装、启用或设置写入命令。

Codex CLI `0.152.1`、CodeBuddy CLI `2.177.1`，Node `v24.20.0`。未启动模型对话、图像生成、付费 provider、外部业务服务或真实内容库任务；未提交真实内容任务，未热重载当前助手聊天。当前聊天要使用新插件，需按助手提示重新加载或开新会话。验收范围为本机 Apple Silicon Mac；未覆盖 Intel Mac、Windows 或其他架构。

独立探针与脱敏验收结果：`2026-10-28-plugin-050-install/plugin-install-probe.mjs`、`2026-10-28-plugin-050-install/plugin-install-evidence.json`。源码库改动仅有本验收文档追加内容及该独立证据目录；未改产品代码、版本、Skills、或已构建安装包。

## v4 最终安装包的真实用户插件刷新与运行验收

日期：2026-10-28（Asia/Shanghai）

冻结源码提交：`baf01944e3b662151db83ca547d8b80ee4378722`。已安装 DMG：`Nova-Content-Hub-0.5.0-darwin-arm64-preview.dmg`，SHA-256 `7379e3980d7d1f895871da2dd8714fa27f17b6b45a0a93ed64149d7d965b5f3b`，3,200,826,235 bytes。安装记录为 `2026-10-28-final-050-arm64-v4/installation.json`，其中记录安装成功及 deep/strict 签名检查通过。

唯一使用的 marketplace 是 `/Applications/自媒体工作台.app/Contents/Resources/plugin-marketplace`。最终 release 为 `0.5.0`、`AUTH_MODE=disabled`、`darwin-arm64`、pair ID `nova-content-hub@0.5.0:p1:disabled`。最终 `package-files.json` SHA-256 为 `b106be7b4da43ca24f2e5c835ef5c0f6428629971d0ab7f573754080a5b1d9ab`；插件目录实际 1,376 项全量快照与 manifest 完全一致。28 个顶层 Skill 均有 `SKILL.md`；`integrity.json` 的 636 个 SHA-256 全部匹配，其中 418 项为 upstream 文件；来源 manifest 记录 53 个版本。`xindao-xuanti:X:a3778c4f28b16179` 的五个原始文件均与来源记录及打包文件 hash 一致，具体值保存在独立证据中。

最终市场内容相较 v2 有变化：其 `package-files.json` SHA-256 从 `a3e21088e99137e99b9c79157b10316f4c91833034cae6c6383e20d9646d1b3c` 变为上述 `b106be7b…`。两个助手的配置路径均是真实用户目录，没有伪造 `HOME`。WorkBuddy 命令同时设置 `WORKBUDDY_CONFIG_DIR=/Users/mac/.workbuddy` 和 `CODEBUDDY_CONFIG_DIR=/Users/mac/.workbuddy`。

| 助手 | 命令／处理 | 结果 |
|---|---|---|
| Codex | `codex plugin add nova-content-hub@nova-content-hub-auth-disabled-darwin-arm64 --json` | exit 0；读取到 `version=0.5.0`、`installed=true`、`enabled=true`、`authPolicy=ON_INSTALL`。注册 cache 为 `/Users/mac/.codex/plugins/cache/nova-content-hub-auth-disabled-darwin-arm64/nova-content-hub/0.5.0`。 |
| WorkBuddy | `codebuddy plugin update <selector> --scope user`、`codebuddy plugin marketplace update nova-content-hub-auth-disabled-darwin-arm64` 及 `codebuddy plugin install <selector> --scope user` | 命令均 exit 0，但同版本安装未刷新版本化缓存（与官方 [marketplace 文档](https://www.codebuddy.ai/docs/cli/plugin-marketplaces) 描述一致）。旧 `integrity.json` SHA-256 为 `69155c7b6fa8838c447247c4f8d02d3750c75d72641bff266f9fbb80d0d5ae64`，最终市场为 `cc43af6cd7e8e545cbde952832302602c1155a7c98a5e31913e197dcfc86b916`；旧 `resources.mjs` SHA-256 为 `3b06c1248c65f9f44513a69d4c33297ea800bc6b56617bf0fa64f7238bbdde3b`，最终市场为 `d397330d92a7cefcfc1b0a0ad1e93d69b3fd28561c4f1c6b5dd2b8861cd8ecc6`。 |
| WorkBuddy | `codebuddy plugin uninstall <selector> --scope user --keep-data` | exit 0；重新读取 CLI list 后目标 selector 为空，`settings.json` 中目标 disabled，精确 cache 的 `lsof` open reference 数为 0。`installed_plugins.json` 留下一行精确的 inactive user/0.5.0/path 元数据；没有手动删除或编辑该行。 |
| WorkBuddy | 将整个精确 0.5.0 cache 目录移至隔离恢复目录，再执行 `codebuddy plugin install <selector> --scope user` | 官方 fresh install exit 0；重新登记为 `scope=user`、`enabled=true`，路径恢复为 `/Users/mac/.workbuddy/plugins/cache/nova-content-hub-auth-disabled-darwin-arm64/nova-content-hub/0.5.0`。新 cache 的 1,376 项与最终已安装 app marketplace 全量逐项、逐字节一致。 |

旧 WorkBuddy cache 的整目录恢复副本保存在 `.local-probes/workbuddy-nova-content-hub-cache-refresh-v4-baf01944/0.5.0`，移动前后 canonical path 检查确认它不是符号链接；锁定的 1,376 项快照 SHA-256 为 `f13b2946adeb54b12547de0bf37d16ded984026b4795eb2e83c38c7d586cf2c0`。旧 0.4.0 cache 仍在。只移动了目标 WorkBuddy 0.5.0 cache，没有终止进程，也没有手工改 cache 内部文件或 plugin registry。Codex cache 与 1,376 项市场相比为 1,375 项：仅缺失 marketplace 清单里可选的 `node_modules/.bin/semver -> ../semver/bin/semver.js` 链接；项目 runtime 对此项有明确兼容处理，其余文件与 manifest 完全匹配。

使用已安装 `.app` 中的 `installedAssistantSkill()`、`launchWithAssistantRuntime()`，分别对两个助手的 cover、template、research、writing 做了探测。每项都通过真实安装登记、目标 Skill、整包字节快照和随包 `doctor`（`ok=true`、`authMode=disabled`、`library=unbound`、`imageGeneration=false`、stderr 为空），并到达本地空 callback；共 8/8 通过。

| 助手 | 能力 | Skill | 结果 |
|---|---|---|---|
| Codex | cover | `nova-content-cover-execution` | 通过 |
| Codex | template | `nova-content-template-execution` | 通过 |
| Codex | research | `nova-content-research-execution` | 通过 |
| Codex | writing | `nova-content-writing-execution` | 通过 |
| WorkBuddy | cover | `nova-content-cover-execution` | 通过 |
| WorkBuddy | template | `nova-content-template-execution` | 通过 |
| WorkBuddy | research | `nova-content-research-execution` | 通过 |
| WorkBuddy | writing | `nova-content-writing-execution` | 通过 |

数据目录说明：此前一次 WorkBuddy 官方 `plugin uninstall <selector> --scope user` 未带 `--keep-data`。官方 [CLI 插件参考](https://www.codebuddy.ai/docs/cli/plugins-reference) 说明移除最后一个安装 scope 时可能清理 `${CODEBUDDY_PLUGIN_DATA}`。目标插件源代码没有 `CODEBUDDY_PLUGIN_DATA` 或 `CLAUDE_PLUGIN_DATA` 引用，但没有该次操作前该目录是否存在及其内容的证据，因此不能确认它是否存在或是否受影响，也不声称其被保全；没有手工恢复。此项与工作台业务内容库和设置不同，后者经独立前后 hash 核验保持，且本次未改内容库绑定。此次正式 cache 隔离与刷新使用了 `--keep-data`。

没有重载或重启当前助手聊天。CLI 提示 WorkBuddy 需 `/reload-plugins` 或新会话后生效；当前聊天须重载或开启新聊天才能使用更新后的插件。没有启动模型、图像生成、付费 provider、外部服务或真实内容库任务，也没有提交真实业务任务。验收范围限本机 Apple Silicon Mac；Intel Mac、Windows 和其他架构待验。

独立证据：`2026-10-28-plugin-050-install/post-final-market-probe.mjs`、`post-final-market-evidence.json`、`workbuddy-cache-before-isolation-v4.json`、`workbuddy-cache-uninstall-guard-v4.json`、`workbuddy-cache-isolation-v4.json`。最终市场、用户 selector/cache 对照和八项运行探测均通过；未提交源码 commit。
