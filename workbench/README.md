# 本地内容工作台 · 技术入口

当前栈为 **Electron 44.9.0 + TypeScript 7.0.2 + React/ReactDOM 19.3.1 + Semi UI React 19 版 2.104.0 + Vite 8.3.4**，Node >=22.18.0。依赖精确锁定，文件核心与 sharp 0.35.5 继续复用已有 ESM 实现。

实验入口可明确新建或打开一个当前文件库，创建内容、编辑标题/正文、保存、移入回收站、恢复、关闭后重开；也保留旧备份预检与同任务导入恢复。内容只通过文件核心写入；标题修改只传 title/body，不整包覆盖发布计划、素材等其他业务字段。正式授权、助手调用、其余业务页面和宿主桥接仍未实现。

## 开发与构建

```sh
npm ci
npm ci --prefix workbench
npm run typecheck --prefix workbench
npm test --prefix workbench
npm run build --prefix workbench -- --auth both
npm start --prefix workbench
npm run probe --prefix workbench
npm run probe:lifecycle --prefix workbench
```

构建必须显式选择 `--auth required|disabled|both`。产物为仓库根 `dist-desktop/auth-required`、`dist-desktop/auth-disabled`，均为 `experimental:true / productionReady:false`。根 `release.config.json` 的 scope/productId、版本、协议、实验标记、AUTH_MODE 与随包平台/架构/pairId 在构建、main、worker 分别核验。缺失或坏配置会拒绝启动；环境变量、query、localStorage、旧演示登录均不能切换权限。

required 包在 main 与 worker 独立拒绝新建库及内容创建、编辑、回收、恢复，返回 `AUTH_NOT_CONFIGURED`。读取及旧导入维护仍可用，读取可能由核心完成已有事务恢复。disabled 包为独立构建；没有运行时放行开关。

每个实验运行目录包含完整 `workbench/dist`、精确资源清单、随包配置、文件核心/导入/图片校验模块、可信原型校验器及72项摘要核对资源，并通过锁文件独立安装生产 sharp。浏览器 bundle 不含文件核心、Node 或 sharp。运行目录可移出仓库，但没有捆绑 Electron 应用运行时，也不是签名安装包。

应用图标沿用用户蓝色N母版。builder先调用 `checkAppIcons()` 核对母版及资源摘要，再把固定PNG/ICO/ICNS复制到 `workbench/dist/brand`。main只从随包位置验证/解码：Windows窗口用ICO，其他平台用PNG；macOS ready后调用Dock setIcon。缺失、摘要损坏或PNG解码失败拒绝启动，不回退Electron默认图标。EXE/Finder安装图标仍由后续真实发行打包接入。

## 业务与安全边界

- preload 只暴露16个有限方法：原六方法，加 createLibrary/openLibrary/readContent/createContent/updateContent/trashContent/restoreContent/queryPendingMutation/retryPendingMutation/resolvePendingMutation。renderer 可提交内容 UUID、title/body、editToken、active/trash 视图及明确恢复动作；不能提交文件路径、库/导入任务身份、权限模式、任意 patch 或方法。main 校验当前 webContents、精确顶层 frame 和受控 URL，再校验字段；worker 独立核验。标题上限500字符，正文上限1,000,000个 UTF-16 code units。
- sandbox/contextIsolation/webSecurity 开启；Node、webview、导航、新窗口及权限关闭。自定义协议只接受清单中的精确 URL，不开放泛目录；拒绝 query/hash、编码、路径规范化与未登记资源。
- CSP 保留 `script-src 'self'`，没有 inline script、eval、CDN或外部连接。Semi CSS 是本地构建资源；仅允许组件必要的 style 属性。用户标题和正文只作为 React 文本/value显示。
- 当前库持久保存 `{root,libraryId,rootIdentity:{dev,ino}}`，与导入记录分别绑定。明确打开其他库或接受新库预约前必须确认已有导入完成；随后清除机器上的已完成导入指针，磁盘导入现场保留，旧导入目录失效不会阻塞新当前库。每次已有库读写/查询均在恢复前携预期库ID和原根身份给 `openLibrary`。同路径换库、同ID克隆均拒绝；旧绑定无根身份时明确要求重新选择，不后台接受现路径。旧格式/未来格式不静默升级。
- 接受内容写入前，main 生成 mutationId，将唯一 pending、本次有限输入与当前库绑定刷盘，再调 worker。退出或丢响应显示“保存结果待核实”，阻止第二笔写入和换库。核验只按同一ID；查不到才允许用户明确重试同请求同ID，恢复错误保留现场。已提交回执只用来定位对象，另读当前版本，不能把历史快照覆盖后续编辑。
- CONFLICT 保存提交草稿；可核验/比较、保留、另存为新内容，或明确放弃提交并载入磁盘。列表刷新、焦点回到窗口、worker退出不清脏编辑器。切内容、换库、回收以及关闭时提示保存/放弃/留在当前页；磁盘版本变化时同时显示磁盘与本地草稿，保存不能自动覆盖。未提交的编辑器草稿保存在内存，不宣称断电恢复。
- 新库使用系统选择的新路径，main 预约新目录身份并刷盘唯一创建记录。响应丢失固定原目标核验；空预约可明确重试，部分失败保留目录，允许明确放弃创建而不删目录。worker透传原 `expectedRootIdentity`；core逐步核对初始化目录，末尾带新UUID与原inode打开。派发前、空检查后及末尾含pending的同ID克隆替换均有实际拒绝证据；仍不宣称原子 openat 或 inode 复用防护。
- 导入接受前刷盘来源摘要和固定目标；未完成任务不能更换库或目标，继续使用归档备份。提交后只核验/读取，不重放导入覆盖后续编辑。不删锁、删任务或改业务文件来修复。旧渠道文案保留在各发布计划，缺失资源保留记录，本人照缺失不构成可信本人声明。

## 验证范围

原导入探针仍使用仓库外两包、每包两个真实 Electron 进程，覆盖 React/Semi、sandbox/preload/IPC、utilityProcess/sharp、来源移走后同任务重启、后续编辑保留、恶意正文文本显示、资源MIME与CSP；缺少配置拒绝启动。

本轮另验收已保存A编辑器切到导入B：dirty guard通过后，四种切库动作派发前清理旧编辑上下文；操作响应与status均失败时禁新写，避免旧ID提交到新库。取消选择器可能清除已保存对象的选中状态。重启后直接保留提交稿也会从pending恢复正文并与后来磁盘版本比较；另存的pending仅作一次原子替换，ENOSPC保留旧记录。

生命周期探针另将两包复制出仓库。disabled 使用7个真实进程（含3个创建替换故障），验证新建/编辑/软删/恢复、脏稿刷新/换库保留、关闭事件阻止、外部冲突比较/另存、同路径不同库及同ID克隆拒绝、main持久预约后提交前退出、实际提交后控制器确认前退出、重启同ID核验/明确重试、后续外部编辑不被历史回执覆盖。required 验证 main/worker 五类新业务写拒绝而读取可用。两包都验证NativeImage512px、1x/2x、Dock真实调用，以及摘要相符但无法解码的PNG拒启。错sender、有限字段、资源清单及CSP继续核验。测试入口与core故障wrapper只注入仓库外临时副本，release权限守卫不变，未新增生产绕过接口；launch只在close后完成并清理。

本轮执行证据使用 `verification/lifecycle-{typecheck,node-test,build,electron,import-electron}.log` 与 `lifecycle-receipt.json`。原 `receipt.json` 等保留为此前迁移基线，不能用于证明本轮生命周期全部完成。

未验收真实系统选择器点击、原生关闭弹窗按钮、人工目视/辅助技术交互、macOS解锁、Windows/Linux运行、Windows任务栏/Finder安装图标、正式权益、签名/公证、升级/卸载和双宿主四组合；运行目录不是可商用安装包。

官方依据：[Semi React 19](https://semi.design/en-US/start/getting-started)、[Electron安全](https://www.electronjs.org/docs/latest/tutorial/security)、[utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process)、[自定义协议](https://www.electronjs.org/docs/latest/api/protocol)、[contextBridge](https://www.electronjs.org/docs/latest/api/context-bridge)。
