# 0.3.45 设置整合：Mac ARM64 预览安装核验

2026-10-23，冻结源码 `8b09fc1`。本次将常用设置整理为左右独立纵列：个人信息/本机偏好、发布渠道/AI 助手/内容库；插件安装、连接检查和版本信息归入「AI 助手」，删除底部重复的「配套插件与版本」卡片。助手选择保留项目通用 `PopupSelect` 下拉。模板任务仍由用户在外部助手中选模型并手动发送。

## 产物与安装

- `darwin-arm64`、`preview`、`AUTH_MODE=disabled`：`workbench/release/darwin-arm64/preview/Nova-Content-Hub-0.3.45-darwin-arm64-preview.dmg`，286,567,510 字节，2026-10-23 16:31:00 CST；SHA256 `52dd7c26e6ef29da20df68c9e9fa6477443d0759a66a1b25979baac17837f8a0`。
- 归档应用：`workbench/release/darwin-arm64/preview/.packaged-apps.noindex/build-jthsOL/mac-arm64/自媒体工作台.app`；已通过可恢复安装事务更新 `/Applications/自媒体工作台.app`。两份应用均为 1,646 项，树摘要同为 `3e3d1ba9be1f83a0ee47eee07eef340253c2aa1b4af18aa9b0cdaa78563d8fdd`。
- Finder「显示简介」实查安装版：名称及项目图标正确，应用程序（Apple 芯片），版本 0.3.45，版权「© 2026 杭州新岛橙灵智能科技有限责任公司」，逻辑大小 536,534,145 字节（磁盘上 539.6 MB），创建及修改时间均为 2026-10-23 16:30。原生「关于」显示版本 0.3.45 (0.3.45) 与相同图标、版权。DMG 与已安装应用大小分别记录。
- `codesign --verify --deep --strict` 通过；本包为 ad-hoc 预览签名，不是 Developer ID 签名/公证或正式生产发行。

## 安装版界面及数据

- 从系统应用名重开后，主进程是 `/Applications/自媒体工作台.app/Contents/MacOS/自媒体工作台`；总览正常读取原有 5 篇内容、1 个合集。设置实查「发布渠道」显示 6 个可用渠道，点击「管理渠道」可看到 6 项及新建/编辑入口；「AI 助手」为通用下拉，有复制安装位置、打开助手、怎么装、重新检查及版本状态；底部不再重复显示插件卡片。
- 内容库「备份与维护」不再显示网页版迁移；当前 renderer 代码无「网页版 / web版 / 从网页」文案。用户截图中「全局助手」、原生下拉和网页版入口来自安装恢复目录里的 0.3.10 旧 app，而非安装版 0.3.45。已只注销该旧 app 的 LaunchServices 登记并强制登记 `/Applications` 新版，未删除可恢复的旧 app；重开验证系统应用名指向新版。
- 安装前备份：`/Users/mac/Library/Application Support/Nova 内容库恢复留档/release-0345-settings-MiPRVy`；重开后内容库与备份均为 2,416 项、树摘要 `b962e16f71331c5d1a6bcfd834c8b9e8760efdf3a82a7ef3f95cf84ef3c21a28`。一次渠道验收误触曾生成两笔事务；已立即恢复渠道，将两笔事务及变更后的配置移至 `/Users/mac/Library/Application Support/Nova 内容库恢复留档/0345-误触恢复-20261023`，并用安装前备份恢复配置；再次校验内容库回到原摘要，重开正常。
- Codex 与 WorkBuddy 的本地配套插件均更新到 0.3.45；更新前宿主配置留档在 `/Users/mac/Library/Application Support/Nova 内容库恢复留档/plugin-config-0345-VOQ2RZ`。当前已经打开的助手会话仍需各自重载/新开，应用内「插件准备好」不等于宿主实际执行过 AI 任务。

## 验证边界

- `npm run check`、桌面类型检查、完整桌面测试 375/375、设置 Electron 探针（含 1280/960/390 布局）及 `git diff --check` 通过。设计规则 Surface-01/03、Controls-01/02、Reading-01/02、Interaction-03、Acceptance-01/02/03 已按本次布局和交互范围核对；实际安装版已看设置、渠道、内容库和原生关于，不等于全页面视觉验收。
- macOS ARM64 已构建、安装、运行及 Finder/原生界面检查。Intel Mac、Windows x64/ARM 未在本次构建或安装；未做正式签名、公证、卸载、真实外部助手生成/回传或用户手动选模型的端到端验收。
