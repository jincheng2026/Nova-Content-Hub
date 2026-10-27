# B 方案：发布包凭据门禁

状态：实施已提交，专项测试与构建待主线程统一执行。本记录不代表任何安装包或平台已验收。

## 发布与用户配置契约

- 发布包不提供开发者或其他用户的 TikHub、模型、语音、自定义兼容服务 Key，包括已加密的 Key。本机设置、机器绑定、真实内容库、调试日志和配置测试 fixture 不进入发布复制来源。
- 全新安装在工作台服务设置中由用户自行填写所需 Key；未配置时保持缺少服务凭据状态，不从开发者环境、示例配置或插件中注入默认 Key。模型服务是否可用仍由现有产品能力决定；空 Key 不表示模型功能已开放。
- 升级在原机器保留 `app.getPath('userData')` 中的 `service-settings.json`、`machine-binding.json` 与 `local-preferences.json`。本变更不清理这些目录，不改加密存储、安装迁移和运行设置逻辑。NSIS 的 `deleteAppDataOnUninstall` 保持 `false`。
- 静态依据：`desktop.mts` 通过 userData 路径构建 `ServiceSettingsStore`；该 store 默认加密凭据集合为空，文件不存在时初始化为空设置，不生成 Key。专项测试新增全新配置空 Key 和重新打开后保留本机加密设置用例。实际安装与升级仍须在目标系统验证。

## 门禁位置

- 插件 contract/runtime 构建只复制明确的源码、资源、技能、schema、references；递归复制统一使用发布来源过滤器，剔除 `.env`、本机配置及 fixture。只有 `.env.example` 可保留，内容必须只有空赋值或注释，`your-key` 等非空示例值也不允许。
- 插件构建结果、市场装配阶段、市场校验、桌面 stage、原生负载验证/导出/复制均运行同一个扫描器。市场完整性清单与实际复制字节保持一致，不通过二次静默过滤改变已封存市场。
- Electron 的 `afterPack` 钩子在最终 `Resources`（应用及 `plugin-marketplace`）复制后、DMG/NSIS 生成前执行；打包结束再检查同一 resources。Universal 装配完成复制后及最终复核时检查其 resources，两个原生负载分别沿用相同门禁。
- DMG 中的示例库来自 `buildDemoLibrary()` 当次生成，并单独检查。仅该调用显式允许内容库描述文件，任何 `nova-content` 记录仍须 `isExample:true`；本机设置与凭据规则不能因此绕过。默认 CLI 不允许任何内容库。

## 有界规则及失败行为

`plugin-src/scripts/artifact-safety.mjs` 仅读取传入的装配目录，不读取开发者 HOME、环境变量值或本机 userData。

- 按路径拒绝 `.env` 系列（仅空 `.env.example` 例外）、凭据/服务设置/机器绑定/本机偏好 JSON 与备份、`.npmrc`、`.netrc`、内容库描述、第一方测试 fixture、数据库及日志。
- 文本检测明确的 API Key、access token、service-scoped key 等字面量赋值（含 YAML/INI/配置及 shell 整行无引号标量）、Bearer 字面量、常见服务商 Key 格式、私钥标记及已加密设置对象；普通 `token`/`editToken` 字段、服务商枚举、hash、读取 `process.env`、配置中的环境表达式、shell 的 `$VAR`/`${...}`、代码变量表达式和明确的 mock/placeholder 不作为凭据。
- 第三方依赖不运行通用字段或高熵扫描，只检查明确服务商 Key、私钥、环境文件和本机状态路径。二进制与媒体不做高熵匹配。
- 递归检查 ZIP（stored/deflate）、普通 TAR、GZIP/TGZ；不解压到磁盘。压缩成员路径穿越、加密 ZIP、ZIP64、TAR 链接/扩展条目、未知归档格式、损坏或超限归档均阻断。大小上限为文本 16 MiB、单成员/单次 gzip 解压 64 MiB、归档输入及总展开预算 256 MiB、嵌套 4 层。常规 ZIP/TAR/GZIP 魔数也会识别改扩展名的归档。
- 命中只报相对路径与规则 ID，归档成员用 `包.zip!相对路径` 表示，不输出值、片段、绝对路径或底层解析异常。异常令构建失败，不存在仅警告继续发布的路径。
- 规则针对当前已知凭据表示和应用状态格式；它不是任意编码秘密的数学证明。新增服务或归档格式须同时补规则与专项用例，不能为一次构建关闭门禁。

## 延后统一验证命令

在仓库根目录，使用项目要求的 Node 版本执行：

```sh
node --test workbench/test/artifact-safety.test.mjs
node --test workbench/test/distribution.test.mjs workbench/test/distribution-integrity.test.mjs workbench/test/native-payload.test.mjs workbench/test/service-frozen-config.test.mjs
npm --prefix workbench run build -- --auth disabled
```

每个目标平台/架构在其原生 runner 分别构建发行包，例如当前 Apple Silicon 开发机：

```sh
npm --prefix workbench run dist:preview -- --platform darwin --arch arm64
```

统一阶段还须对最终安装器实际挂载/解包后的 app resources 再运行扫描器，避免把 build stage 的通过当作安装器内容验收：

```sh
node plugin-src/scripts/artifact-safety.mjs /absolute/path/to/installed-or-mounted/app-resources
```

验收留痕须关联平台、架构、渠道、冻结源码、产物 SHA256；系统信息、安装/升级/重开及用户内容保留按 `AGENTS.md` 验收。新机器验证所有 `hasKey:false`；原机升级验证用户设置及内容库仍在，但截图、日志、回执不得保存 Key 原文。

## 当前检查与缺口

- 已执行：变更脚本与专项测试文件 `node --check` 语法检查；静态检查复制白名单、封存市场完整性及 userData 设置默认/保留路径。
- 未执行：专项测试、现有回归、完整构建、实际发布目录扫描、安装器解包检查、macOS/Windows 实际安装与升级。按 B 方案集中统一验证，不宣称当前产物已通过凭据门禁。
