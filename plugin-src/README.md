# Nova Content Hub 插件源码与分发

本目录统一维护契约 CLI、真实封面文件执行命令、四项 Skill、Hooks 与纯助手桥接。两类分发均为实验产物，声明 `productionReady:false`。构建与 CLI 不自动安装插件或信任 Hooks，不读取宿主凭据，不调用模型；生图由明确选中的宿主 Skill 完成。

在仓库根目录：

```sh
node plugin-src/build.mjs
node plugin-src/build.mjs --auth both
node --test plugin-src/tests/*.test.mjs
```

轻量契约分发默认从根 release.config.json 读取 AUTH_MODE；both 生成 dist-plugin-contract/nova-content-hub-required 与 nova-content-hub-disabled 两份独立目录包。版本、scope、协议与模式组成 pairId，同时写入 contract.json 与宿主清单描述；不同模式的请求不可混用。交付包内路径独立，不依赖源码位置或 cwd 中的库。只需 Node.js 20+，无 npm 依赖。

在生成的包根目录运行：

```sh
node dist/content.mjs help
node dist/content.mjs summary
node dist/content.mjs context --file REQUEST.json
node dist/content.mjs check-request --file REQUEST.json
node dist/content.mjs check-handoff --file HANDOFF.json
node dist/content.mjs doctor
```

上面的轻量契约包只有三个不可执行 Skill，不包含真实封面执行命令。context 和 check-request 也接受 --stdin JSON。每次仅输出一个 JSON，失败返回非零退出码。required 对外部/写动作的检查会 fail closed 为 AUTH_NOT_CONFIGURED；disabled 仍验证请求，不具备真实执行能力。没有运行时授权模式开关。包内发布配置的产品、scope、协议、原型标记、授权模式、版本与 pairId 不一致时返回 PACKAGE_INVALID，未知模式不会被当成 disabled。请求字段及停止条件见 references/contract.md。

三个契约 Skill：模板学习、还原验收、项目封面。它们都携带相同校验器与局部引用，不拼接父目录。未来 task start、commit、导入、生成、登记尚未实现，直接调用会得到 NOT_IMPLEMENTED；当前不创建任务、资产文件或登记记录。

三个 Skill 已融合 GitHub 上宝玉封面、OpenAI imagegen 与 Anthropic canvas-design 中适合本产品的方法：证据拆解、明确参考作用、保存提示、固定约束和真实结果复核。来源固定到提交，取舍与许可见 [借鉴说明](references/upstream-notices.md)，具体执行见 [视觉工作流](references/visual-workflow.md)。未安装全局 Skill、执行上游脚本或接入新的收费后端。

宿主入口为 .codex-plugin/plugin.json 和 .codebuddy-plugin/plugin.json。公共 SessionStart/UserPromptSubmit/Stop 在 hooks/hooks.json；WorkBuddy 仅额外订阅 StopFailure。Codex 显式清单只加载 hooks/codex.json（公共事件加 Interrupt，后者 timeout=3），按官方规则替代默认 hooks，不双订阅。启动器使用兼容 CLAUDE_PLUGIN_ROOT；真实桌面安装依赖用户手动安装和信任 Hooks。

Hooks 最多读取 16 KiB JSON，600 ms 等待输入，异常和未知事件只返回安全 JSON 并在 stderr 输出脱敏错误码；Stop 始终输出 JSON。SessionStart 仅注入产品版本、构建模式与不可执行的使用说明，无绑定/无授权不注入项目摘要、目录或凭据。所有 Hooks 都不修改业务文件，也不完成任务。会话状态与业务验收独立。

HANDOFF.json 上限 64 KiB，嵌入 request 仍限 16 KiB；所有协议 URL 由 `plugin-src/src/bridge/handoff.js` 提供；`原型/shared/handoff.js` 是生成副本，执行 `node plugin-src/scripts/sync-bridge.mjs` 更新，`--check` 检测漂移。构建只校验漂移，不静默修复。此纯桥接模块保留固定 Codex/WorkBuddy 路由并拒绝未知宿主，不导入系统启动能力。工作台与 CLI 共用这一来源，CLI 不实际打开 URL。跨宿主传递最小摘要与输入快照，不能声称完整聊天迁移。五份 schemas 与所需 references/许可随每个独立 Skill 打包。

Codex/WorkBuddy 的清单、静态路径、模拟事件与门控已可自动检查；真实宿主版本、Windows 启动器、人工 trust、实际事件送达尚待人工安装后的兼容验证。真实授权服务、OAuth 与宿主自动交接未接入。轻量契约包没有内容库执行能力；真实封面执行包的文件校验和整批登记由共享文件核心提供，生图仍由宿主完成。


真实文件执行分发由同一构建器生成，保留旧路径：

```sh
npm run build:cover -- --auth both
# 或由 npm 调用统一构建器，--target 可选 contract、cover、all
npm exec -- node plugin-src/scripts/build.mjs --target all --auth both
```

在 `dist-cover-runtime/auth-disabled` 或 `auth-required` 中：

```sh
node plugin-src/src/cli.mjs doctor
node plugin-src/src/cli.mjs contract context --file REQUEST.json
node plugin-src/src/cli.mjs cover context --library /absolute/library --content UUID --request UUID --attempt UUID
node cover-runtime/cli.mjs context --library /absolute/library --content UUID --request UUID --attempt UUID
```

`contract context` 继续返回 `CONTEXT_UNAVAILABLE` 和 `executable:false`；`cover context` 只接受明确的绝对库根与 UUID，不会把未绑定原型请求升级为真实任务。旧 `cover-runtime/cli.mjs` 仅转发同一实现。required 包因可信权益未接入而拒绝全部 cover 业务读写；环境与参数不能切换模式。

真实包根目录是宿主插件根，清单指向 `plugin-src/skills/` 四项 Skill；三项契约 Skill 保持不可执行，`nova-content-cover-execution` 处理真实文件任务。完整目录包包含插件、相邻共享文件核心、图像解码器、维护/迁移工具、可信原型校验器及 72 项 hash 校验资源，需整体移动。locked sharp 与本机原生依赖由 npm ci 安装，禁用生命周期脚本。

真实包唯一发布配置在 `plugin-src/src/release.json`，contract 与 cover 均从这个固定位置读取并核验 product/scope/version/protocol/pair/auth/platform；兼容入口和 Skill 不各带一份授权配置。`integrity.json` 记录发布模式、四项 Skill 能力以及实现、Hooks、清单与 Skill 的 hash，用于构建一致性核验，不代表数字签名或可信授权。旧 runtime Skill 路径仅由构建器从唯一原文生成。
