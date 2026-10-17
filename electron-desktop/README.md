# Electron 本地导入技术入口

这是 P3 的有限文件流程验证，不是五页正式产品、G1/G2 或可发行安装包。界面只提供：系统选择旧备份 → 只读预检数量/资源提示 → 系统选择新内容库位置（默认文档目录）→ 导入并打开 → 内容列表与原文 → 查询/继续同一任务。旧渠道文案仍留在独立发布计划，列表不会拼接成基础正文。

## 开发运行

在仓库根目录安装既有共享核心依赖后，仅在本子目录安装 Electron：

```sh
npm ci
npm ci --prefix electron-desktop
npm start --prefix electron-desktop
```

开发环境 Node >=22.12.0。Electron **44.9.0** 精确锁定在本目录 package.json/package-lock.json；2026-10-17 通过 npm 官方 registry 的实际版本/engines/integrity 元数据核对，使用官方 release 的平台二进制。没有使用旅游工程的依赖、运行时或活动库。共享业务代码与 sharp 0.35.5 来自本仓库，utilityProcess 使用随 Electron 提供的 Node；普通用户未来的安装包不应要求外部 Node，但本轮未制作安装包。

若 Electron npm 包首次运行时下载官方二进制失败，启动会明确失败，不回退旅游运行时或未知路径。依赖安装与本地开发命令只供维护者；普通界面不显示命令、JSON、路径参数或任务 ID。

## 状态与隔离

- main 仅负责窗口、系统对话框、机器绑定与工作进程。preload 只暴露 6 个逐项命名且无参数的方法；renderer 不能传本机路径、库 ID、任务 ID、方法名或通用 IPC。
- 每次 IPC 都要求当前窗口的精确 webContents、顶层 frame、完整受控页面 URL，拒绝额外参数。工作进程再核对有限操作与字段；文件核心负责最终路径/身份/锁校验。
- sandbox/contextIsolation 开启，nodeIntegration 关闭。受控 `nova-content://app/` 协议只映射三个固定随包文件，严格 CSP；拒绝导航、新窗口、webview、权限和外部请求。正文和标题只用 textContent 展示，不执行 HTML/脚本。
- 预检、导入、完整图片解码和内容读取均在 utilityProcess，主进程没有同步业务复制/哈希。进程退出不会视为成功；重新查询磁盘预约，明确状态后再继续。
- 机器 userData 中的 `machine-binding.json` 只保存选定来源、原始 SHA256、目标与接受后的任务/库绑定。启动导入前先刷盘绑定；若进程在收到任务 ID 前退出，按固定目标预约找回同一任务。已接受任务固定目标，继续使用导入器归档的原始备份，不依赖原 JSON 仍存在。
- 预约前失败且磁盘查询确认无任务时，可以正常重新选择备份/目标。已接受任务未完成时不允许换目标或清除绑定。不会删锁、删任务或改 JSON 来“修复”。提交后只查询/打开，不重放历史导入覆盖后续编辑。
- 文件核心保留缺失资源、历史与回收项；此入口列出问题，不提供补文件、合集/发布等完整编辑界面。缺失本人照不会被视为已取得可信本人声明。
- 不导入演示授权、安装/信任为正式状态；没有 AI/助手调用或 required 鉴权绕过入口。正式生产授权仍是未来独立验收项。

## 验证

```sh
npm test --prefix electron-desktop
npm run probe --prefix electron-desktop
```

小测试覆盖 IPC 顶层来源/异常参数、固定协议资源、机器绑定格式/符号链接、工作进程退出、任务重启找回、预约前失败后重新选择、提交后不重放。

`probe` 只创建和清理独立临时合成备份/库，启动两个真实 Electron 进程：先通过真实隔离页面/preload/IPC → utilityProcess 完成导入与 sharp 原生解码，再移除原备份、重启查询同一任务并验证正常编辑没有被重放覆盖；还检查 renderer 无 Node 与恶意标题不成为脚本。自动化探针使用隐藏窗口和测试选择器；未解锁或验收系统对话框，**不代表真实系统对话框、目视交互、macOS 解锁、Windows、签名/公证、升级/卸载、双宿主四组合或生产授权验收**。测试选择器只存在维护者探针入口；正式 main 使用 Electron 原生对话框。

实际执行结果由本轮交付报告列出；不能只因脚本存在就认为运行通过。

## 官方核对依据

- [Electron 安全指南（官方仓库）](https://github.com/electron/electron/blob/main/docs/tutorial/security.md)
- [utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process)
- [自定义协议](https://www.electronjs.org/docs/latest/api/protocol)
- [contextBridge](https://www.electronjs.org/docs/latest/api/context-bridge)
- [系统对话框](https://www.electronjs.org/docs/latest/api/dialog)

本次二进制获取：npm 包安装成功，但首次启动的 Node fetch 下载失败；随后用 curl 从同一官方 GitHub Release 获取 `electron-v44.9.0-darwin-arm64.zip`，解压前与精确 npm 包自带 checksums.json 核对 SHA256：`12d873a5ae98a6598e730402e9278c5d132e97ea1a4405a7713bec2a3e83921f`。解压后的 dist/version 为 `44.9.0`，没有跳过摘要校验或修改安全参数。

2026-10-17 本机 macOS arm64 最终验证：13/13 Node 测试通过；真实 Electron 44.9.0 两进程自动探针通过（首次导入/原生图片解码/隔离页面显示，再启动找回同一绑定与任务且不覆盖后续编辑）。记录见 [验证收据](verification/receipt.json)、[Node 输出](verification/node-test.log) 和 [Electron 输出](verification/electron-probe.log)。系统选择器仍由正式入口实现但尚未人工选择验收；以上结果不扩展到 Windows 或发行安装。
