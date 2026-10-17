# Nova Content Hub 插件预接入包

本包用于完成自媒体原型的插件契约检查。它不是已接通 AI、登录或内容库的产品，所有构建声明 `prototype:true`、`productionReady:false`。不自动安装插件或信任 Hooks，不读取用户 keys、token，不访问或修改任何实际内容库。

在仓库根目录：

```sh
node plugin-src/build.mjs
node plugin-src/build.mjs --auth both
node --test plugin-src/tests/*.test.mjs
```

默认从根 release.config.json 读取 AUTH_MODE；both 生成 dist-plugin-contract/nova-content-hub-required 与 nova-content-hub-disabled 两份独立目录包。版本、scope、协议与模式组成 pairId，同时写入 contract.json 与宿主清单描述；不同模式的请求不可混用。交付包内路径独立，不依赖源码位置或 cwd 中的库。只需 Node.js 20+，无 npm 依赖。

在生成的包根目录运行：

```sh
node dist/content.mjs help
node dist/content.mjs summary
node dist/content.mjs context --file REQUEST.json
node dist/content.mjs check-request --file REQUEST.json
node dist/content.mjs check-handoff --file HANDOFF.json
node dist/content.mjs doctor
```

context 和 check-request 也接受 --stdin JSON。每次仅输出一个 JSON，失败返回非零退出码。required 对外部/写动作的检查会 fail closed 为 AUTH_NOT_CONFIGURED；disabled 仍验证请求，不具备真实执行能力。没有运行时授权模式开关。包内发布配置的产品、scope、协议、原型标记、授权模式、版本与 pairId 不一致时返回 PACKAGE_INVALID，未知模式不会被当成 disabled。请求字段及停止条件见 references/contract.md。

三个业务 Skill：模板学习、还原验收、项目封面。它们都携带相同校验器与局部引用，不拼接父目录。未来 task start、commit、导入、生成、登记尚未实现，直接调用会得到 NOT_IMPLEMENTED；当前不创建任务、资产文件或登记记录。

三个 Skill 已融合 GitHub 上宝玉封面、OpenAI imagegen 与 Anthropic canvas-design 中适合本产品的方法：证据拆解、明确参考作用、保存提示、固定约束和真实结果复核。来源固定到提交，取舍与许可见 [借鉴说明](references/upstream-notices.md)，具体执行见 [视觉工作流](references/visual-workflow.md)。未安装全局 Skill、执行上游脚本或接入新的收费后端。

宿主入口为 .codex-plugin/plugin.json 和 .codebuddy-plugin/plugin.json。公共 SessionStart/UserPromptSubmit/Stop 在 hooks/hooks.json；WorkBuddy 仅额外订阅 StopFailure。Codex 显式清单只加载 hooks/codex.json（公共事件加 Interrupt，后者 timeout=3），按官方规则替代默认 hooks，不双订阅。启动器使用兼容 CLAUDE_PLUGIN_ROOT；真实桌面安装依赖用户手动安装和信任 Hooks。

Hooks 最多读取 16 KiB JSON，600 ms 等待输入，异常和未知事件只返回安全 JSON 并在 stderr 输出脱敏错误码；Stop 始终输出 JSON。SessionStart 仅注入产品版本、构建模式与不可执行的使用说明，无绑定/无授权不注入项目摘要、目录或凭据。所有 Hooks 都不修改业务文件，也不完成任务。会话状态与业务验收独立。

HANDOFF.json 上限 64 KiB，嵌入 request 仍限 16 KiB；所有协议 URL 由工作台与 CLI 共用的 handoff.js 提供，CLI 不实际打开 URL。跨宿主传递最小摘要与输入快照，不能声称完整聊天迁移。五份 schemas 与所需 references/许可随每个独立 Skill 打包。

Codex/WorkBuddy 的清单、静态路径、模拟事件与门控已可自动检查；真实宿主版本、Windows 启动器、人工 trust、实际事件送达尚待人工安装后的兼容验证。真实授权服务、OAuth、内容库适配器、生成供应商、图片检测和原子登记均未实现。
