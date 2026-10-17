# 封面执行器：本地实验包

此包是封面任务的实际 CLI 消费者，供 WorkBuddy/Codex Skill 和后续 Electron 主进程调用。它不替宿主生成图片；也不是已发行的正式桌面端。旧原型插件仍返回 `executable:false`。

在项目根执行 `npm run build:cover -- --auth both`。构建从锁文件安装生产依赖，禁用依赖生命周期脚本；生成当前系统/架构的 `dist-cover-runtime/auth-required` 和 `auth-disabled`。包内包含 CLI、共享文件核心、完整图像解码器及原生依赖，不使用全局安装的 sharp。它们需要符合项目 engines 的 Node；正式 Electron 内置运行时与跨系统安装包另行验收。

在生成包内执行 `node cover-runtime/cli.mjs help`。`doctor` 仅检查包配置，不能证明生图工具、授权、文件库或宿主可用。required 包缺可信权益验证时所有业务读写拒绝；disabled 是独立构建实验包。运行参数和环境变量不能把 required 切为 disabled。

## 业务调用

所有操作显式提供绝对 `--library` 和 UUID `--content`，不会从 cwd 或深链猜库。请求/尝试操作另加 `--request`、`--attempt`。输入 JSON 通过 `--file` 或 `--stdin`，上限 64 KiB；CLI 输出一行 JSON，错误退出非零。

| 命令 | JSON 输入 |
| --- | --- |
| create | `{request, editToken, mutationId?}`；request 字段由共享文件核心验证 |
| attempt | `{host, reason?}`；同输入重试或换助手创建新尝试 |
| context | 无；返回固定请求、正文、实际输入路径和 inbox |
| claim | `{host, readAssetHashes}`；接单声明和输入字节复核 |
| submit | 原始回执：`{libraryId,contentId,requestId,attemptId,requestHash,resultId,files:[{name,sha256}]}` |
| fail | `{code,message}` |
| cancel / status | 无 |

完整 API、输入限制、状态与真实解码语义以 [文件核心说明](../file-library/README.md) 为准。submit 保留原始回执字节；重复提交使用同一份 JSON 文件。核心校验数量、准确尺寸、格式、hash 与归属，一笔事务登记整批候选。CLI 不接受宿主自报的“校验通过”报告，也不自动选封面。

配套流程在 `cover-runtime/skills/nova-content-cover-execution/SKILL.md`；需要宿主实际读取图片并生成本地结果。本包不自动安装插件、信任 Hooks 或向宿主发送请求。最终安装/信任流程由后续桌面入口接入。

验证包含真实临时文件库和打包后独立目录运行；不读取用户实际资料，不调用付费模型。Mac 本机通过不代表 Windows、助手生图、Electron 或商用发行已验收。
