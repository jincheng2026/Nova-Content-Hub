# 0.3.43 桌面交互预览：打包安装记录

本次交付为 darwin-arm64（Apple Silicon Mac）预览，AUTH_MODE=disabled、productionReady=false、adhoc 临时签名。全局交付要求以根 AGENTS.md 为准。

冻结源码为 `266922901c7547e73923184e9c44b93971e095b2`，包含 `f9e6965` 图片手势缩放和 `f3a136e` 候选操作栏、单层批注输入、图标工具及批注移动。本地标签 `v0.3.43-preview-mac-arm64` 指向冻结源码；后续验收记录提交与已冻结安装包分开。

## 产物与安装

- 已安装：`/Applications/自媒体工作台.app`，0.3.43。
- DMG：`workbench/release/darwin-arm64/preview/Nova-Content-Hub-0.3.43-darwin-arm64-preview.dmg`，286,569,738 字节；SHA256 `13f8bdf1ce85ed04796654cf1cd59ac40f7314824a358df42194023fc32ac468`。
- 同事交付：`/Users/mac/Downloads/自媒体工作台-0.3.43-同事交付-Mac苹果芯片`，仅 DMG、安装与使用.txt、SHA256SUMS.txt。
- 归档、只读挂载 DMG 与安装应用全树1646条一致；树摘要 `ecaf7f99e50dbd491356e0482da11a810425ed8738ec1c4f487ef578c6ee04db`。
- Electron、随包 Node、sharp/libvips 为 arm64；版本、pairId、marketplace、公司版权及图标字节一致。用户交付排除源码、测试和探针；包含5组同事模板、52条提示词、1篇示例及2张 provenance 对应原图。
- Codex、WorkBuddy 经官方 CLI 更新到0.3.43，cover/template四项技能匹配，无关插件及设置保持。当前会话未重载，未执行本版本真实生成。

详细证据：[package.json](package.json)、[installation.json](installation.json)、[plugins.json](plugins.json)、[final-integrity.json](final-integrity.json)、[root-verification.json](root-verification.json)、logs/。

## 原库保护

旧应用通过菜单正常退出，全副本主进程守卫确认为零后，才从实际 machine-binding 读取当前库并新建完整备份。备份位于 `/Users/mac/Library/Application Support/Nova 内容库恢复留档/release-0343-92b1358f-b873-4a6f-b01f-7fba7029b3e9`；原库身份见 [library-protection.json](library-protection.json)。

事务安装、原生查看和正常退出重开后，2381条原库及完整绑定文件逐字节不变。库摘要 `cf475f06e6914f5910172f2330d36ce0c32de0a9e86e921de936dfef7aef258d`；绑定文件摘要 `667d693d3c44cf1296b1a12992642ed1148082e3a2e6023ed964ab4b9f3b9067`。安装事务已 complete，旧安装和恢复备份保留。未保存批注、选用/收藏候选、更新内置资源、启动生成或物理删除历史模板。

## 原生界面验收

实际窗口为1280×860点，截图为2560×1720像素。主线程经 CUA 操作确切安装路径，菜单正常退出后以进程列表确认零副本，再重新启动并读取原库。重开期间遇到用户接管提示后重新查询当前状态，未沿用旧状态继续操作。

| 规则 | 实际观察与证据 |
|---|---|
| AGENTS 打包展示、Acceptance-03 | Finder归档及已安装应用均显示 N 图标、自媒体工作台、Apple芯片、0.3.43、完整公司版权、536,530,999字节、2026-10-22 19:19修改时间；磁盘占用分别548.7MB与539.6MB。见 native/finder-archive.*、finder-installed.*。 |
| 应用内版本 | 原生关于窗口显示0.3.43及完整版权；设置显示0.3.43 · macOS · ARM64、WorkBuddy连接就绪。见 native/about.*、settings-version.txt。 |
| Image-02 | 首页封面打开共享预览，放大49%→61%，原始尺寸100%，坐标双击恢复49%适合窗口；有手势和键盘说明。见 native/preview-100.*、preview-double-click-fit.txt。部分后台窗口截图曾滞后于AX，前置窗口后核对，不据滞后截图推断后续页面。 |
| Image-03、Controls-03 | 真实有批注与无批注候选操作栏对齐，备注为固定信息入口，卡片不插入坐标正文。见 native/candidate-actions.*。 |
| Image-03、Controls-02 | 四个有名称图标，选择/移动可切换；整体输入聚焦仅一层边框与焦点环。见 native/annotation-tools-focus.*。本轮原库保持只读，未在真实内容上拖动并保存。 |
| Surface-03、Acceptance-03 | 批注关闭无写入；正常退出后零主进程，重开原库仍显示5篇内容、1合集、今日2条安排与原封面。见 native/normal-quit.json、reopened-overview.*。 |

## 必要验证与范围

冻结前主线程重新运行 `npm run typecheck:desktop` 通过；`node --test workbench/test/cover-gallery.test.mjs` 11/11通过；helper语法及diff空白检查通过。原生构建退出0，既有bundle体积提示保留。本轮双auth插件负载刷新后的移除功能专项11/11通过，见 logs/package-conformance.log。

手势与批注完整交互探针在对应实现提交已独立通过，见 [图片手势证据](../2026-10-22-image-gestures/) 与 [批注源码验收](../2026-10-22-annotation-controls/)。它们使用隔离fixture，不替代此次安装或物理设备验收。本轮未重新运行全量测试，未将既往全量失败宣称全绿。

仅本机 darwin-arm64 已构建、安装和原生重开验收。Intel Mac、Windows x64/ARM、真实触摸板/鼠标组合校准、真实助手生成及正式 Developer ID 签名/公证/生产发行均未在本轮验收。
