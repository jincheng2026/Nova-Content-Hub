# 0.3.44 AI 助手交接：Mac ARM64 预览包与安装核验

2026-10-23，冻结源码 `ff6d10288e323dc94c22211544b4f82216645f73`（本地 `main`）。本次把模板 AI 拆解收成“打开助手→用户选模型并手动发送→回工作台确认”的主流程；设置统一为“AI 助手”，并提供配套插件安装位置复制与说明。固定请求、只读预检、回写及人工验收契约未改。

## 产物与版本

- `darwin-arm64`、`preview`、`AUTH_MODE=disabled`：`workbench/release/darwin-arm64/preview/Nova-Content-Hub-0.3.44-darwin-arm64-preview.dmg`，286,548,906 字节，2026-10-23 16:14:49 CST；SHA256 `bdf351d0041250418ef26ef1d9f74d13cc48b3a0f8f88fe5e9e15068efc403ea`。
- 最终归档应用：`workbench/release/darwin-arm64/preview/.packaged-apps.noindex/build-yJ6ePW/mac-arm64/自媒体工作台.app`；安装位置：`/Applications/自媒体工作台.app`。归档、DMG 内和安装后的应用完整 1,646 项文件树一致，树摘要 `d8d93114786477262fab3d00fae49b2faea0a4b2d23e2659f7198b76a0c765a7`。
- 应用 `Info.plist`、应用内「关于」、桌面 release、安装器与随包插件版本均为 0.3.44；插件配对 `nova-content-hub@0.3.44:p1:disabled`。应用为 ad-hoc 签名，`codesign --verify --deep --strict` 通过；未做 Developer ID 签名或公证，`productionReady=false`。
- 旧 0.3.43 DMG 保持原 SHA256 `9b76064efeb80a1fb08f35f73f350c7573cdbdac4f06e7e6a44df1d45b601aae`，没有以同名产物覆盖。

## 实际安装、内容库与插件

- 通过工作台的 `installMacApplication` 可恢复事务替换，事务 `/Applications/.nova-content-hub-install-53ace338-5ef7-4c91-ba38-76bab75ca9f0` 处于 `complete`；安装树与归档树相同，重开时唯一主进程来自 `/Applications/自媒体工作台.app/Contents/MacOS/自媒体工作台`。
- 安装前将当前内容库、机器绑定及本机偏好备份至 `/Users/mac/Library/Application Support/Nova 内容库恢复留档/release-0344-ai-assistant-O42XHB`。原库 2,416 项，备份、安装前后及重开后树摘要均为 `b962e16f71331c5d1a6bcfd834c8b9e8760efdf3a82a7ef3f95cf84ef3c21a28`；绑定文件 SHA256 保持 `667d693d3c44cf1296b1a12992642ed1148082e3a2e6023ed964ab4b9f3b9067`。
- 使用 Codex/WorkBuddy 官方插件命令更新本地市场与插件；更改前的宿主配置备份于 `/Users/mac/Library/Application Support/Nova 内容库恢复留档/plugin-config-0344-p3Tn1u`，无关配置保持不变。两宿主的封面/模板四项技能安装路径检查通过。WorkBuddy 缓存 539 项与随包插件全树一致；Codex 缓存 538 项，仅官方安装器省略未使用的 `node_modules/.bin/semver` 链接，其目标文件已核对。当前已经打开的宿主会话仍需各自重载才能使用新版插件。

## 系统界面与交互记录

- Finder「显示简介」检查最终归档 app：名称「自媒体工作台」、项目图标、应用程序（Apple 芯片）、0.3.44、版权「© 2026 杭州新岛橙灵智能科技有限责任公司」、逻辑大小 536,536,421 字节（磁盘上 540.9 MB）、创建 16:12/修改 16:13。
- Finder「显示简介」独立检查已安装 app：相同名称/图标/平台/版本/版权/逻辑大小，磁盘上 539.6 MB，创建与修改均为 16:13。DMG 大小与 app 大小分别记录，不互作替代。原生「关于」显示「版本 0.3.44 (0.3.44)」及公司版权。
- 安装版正常打开原库，原生总览显示原有 5 篇内容、1 个合集；设置显示「AI 助手」、WorkBuddy、0.3.44 随包插件、封面及模板准备状态。点击「复制安装位置」得到成功反馈，展开「怎么装」显示本地市场三步说明；模板页仍显示既有 5 组内置风格和 3 组我的模板。未为了验收创建新的 AI 任务或生成结果。

## 验证范围

- `npm run check`、桌面类型检查、完整桌面测试 375/375、原生交接/模板/设置针对性测试 61/61、设置和模板/封面 Electron 交互探针通过；0.3.44 原生预览 DMG 构建成功。设计规则 Controls-01、Template-03、Reading-02/03、Interaction-03、Acceptance-01/02/03 在本次改动范围内核对；这里的真实页面观察不扩大为全页面视觉验收。
- macOS ARM64：已构建、安装、运行、检查 Finder 和本次设置入口。Intel Mac、Windows x64/ARM：本次未构建或安装，不能由 ARM64 结果替代。
- 尚未由用户在真实 Codex/WorkBuddy 会话中选模型、发送并回传模板结果；跳转或宿主会话结束都不作为生成成功证据。未做正式生产发行、签名、公证、Dock 标识专项截图或卸载验收。
