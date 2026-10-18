# 封面执行器：本地实验包

此包是封面任务的实际 CLI 消费者，供 WorkBuddy/Codex Skill 和后续 Electron 主进程调用。它不替宿主生成图片；也不是已发行的正式桌面端。旧原型插件仍返回
`executable:false`。

此目录仅保留兼容 CLI 与构建入口；执行实现、Skill 原文与统一构建器位于 `plugin-src/`。

在项目根执行 `npm run build:cover -- --auth both`。构建从锁文件安装生产依赖，禁用依赖生命周期脚本；生成当前系统/架构的
`plugin/runtime/auth-required` 和 `auth-disabled`。包内包含固定 Node.js 24.20.0、CLI、共享文件核心、完整图像解码器及原生依赖，不使用全局
Node/sharp。锁表、官方 archive 校验与许可证见 `plugin-src/runtime/`；跨系统安装包另行验收。

在生成包内执行 `bin/run-node doctor`（Windows 为 `bin\run-node.cmd doctor`）。启动器只用包内固定 Node，缺失、损坏或误配拒绝；
`doctor` 不能证明生图工具、授权、文件库或宿主可用。required 包缺可信权益验证时所有 cover 业务读写拒绝；disabled
是独立构建实验包。运行参数和环境变量不能把 required 切为 disabled。

## 业务调用

桌面交接由 `bin/run-node cover context --handoff UUID` 开始，后续 claim/submit/fail/cancel/status 使用相同 handoff
ID。仅从固定系统应用数据目录读取主进程准备的本机定位文件，再核验发布配对、原库 ID/dev/ino、固定请求 hash 与助手归属；不会从
cwd 或链接猜库。该定位文件不是任务状态，也不含图片或正文。Skill 自动构造接单和结果 JSON，不要求普通用户手工组装。

维护调用仍可显式提供绝对 `--library` 和 UUID `--content`，请求/尝试操作另加 `--request`、`--attempt`。两种定位方式互斥，handoff
不能创建额外请求/尝试。输入 JSON 通过 `--file` 或 `--stdin`，上限 64 KiB；CLI 输出一行 JSON，错误退出非零。

| 命令            | JSON 输入                                                                                        |
|-----------------|--------------------------------------------------------------------------------------------------|
| create          | `{request, editToken, mutationId?}`；request 字段由共享文件核心验证                              |
| attempt         | `{host, reason?}`；同输入重试或换助手创建新尝试                                                  |
| context         | 无；返回固定请求、正文、实际输入路径和 inbox                                                     |
| claim           | `{host, readAssetHashes}`；接单声明和输入字节复核                                                |
| submit          | 原始回执：`{libraryId,contentId,requestId,attemptId,requestHash,resultId,files:[{name,sha256}]}` |
| fail            | `{code,message}`                                                                                 |
| cancel / status | 无                                                                                               |

完整 API、输入限制、状态与真实解码语义以 [文件核心说明](../../src/lib/file-library/README.md) 为准。submit 保留原始回执字节；重复提交使用同一份
JSON 文件。核心校验数量、准确尺寸、格式、hash 与归属，一笔事务登记整批候选。CLI 不接受宿主自报的“校验通过”报告，也不自动选封面。

配套流程源码在 `plugin-src/skills/nova-content-cover-execution/SKILL.md`；包内的旧
`cover-runtime/skills/nova-content-cover-execution/SKILL.md` 路径由构建生成；需要宿主实际读取图片并生成本地结果。本包不自动安装插件、信任
Hooks 或向宿主发送请求。最终安装/信任流程由后续桌面入口接入。

验证包含真实临时文件库和打包后独立目录运行；不读取用户实际资料，不调用付费模型。Mac 本机通过不代表 Windows、助手生图、Electron
或商用发行已验收。

统一入口为 `bin/run-node cover <命令>`（Windows 为 `bin\run-node.cmd`）；旧 `node cover-runtime/cli.mjs` 仅作开发兼容，省略
cover。`contract <命令>` 保持不可执行原型契约；两个 context 不混用。包内唯一发布配置为 `plugin-src/src/release.json`，不再另设
runtime release.json。
