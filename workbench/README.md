# 本地内容工作台 · 技术入口

当前栈为 **Electron 44.9.0 + TypeScript 7.0.2 + React/ReactDOM 19.3.1 + Semi UI React 19 版 2.104.0 + Vite 8.3.4**。顶层依赖与完整安装树在本目录精确锁定；Semi 使用 `@douyinfe/semi-ui-19`，其官方 peer 要求为 React/ReactDOM `^19.0.0`。运行开发命令需要 Node >=22.18.0，文件核心与 sharp 0.35.5 继续复用仓库既有 ESM 实现。

这是有限的本地导入与读取入口：系统选择旧备份 → 只读预检 → 系统选择新内容库位置 → 导入并打开 → 内容列表/原文 → 查询或继续同一任务。旧渠道文案留在各自发布计划；不拼成基础正文。此轮没有新增内容 CRUD、助手调用、授权实现或宿主桥接。

## 目录

```text
workbench/
  src/main/       窗口与系统对话框、IPC边界、机器绑定、控制器、utility worker
  src/preload/    单个隔离桥接入口（仅 require electron）
  src/renderer/   React/Semi UI 页面与本地 CSS
  src/shared/     六方法合同、错误投影、既有共享 ESM 的有限声明接缝
  scripts/        可复现构建与真实 Electron 双进程探针
  test/           原有13项回归与新增配置/资源/CSP边界检查
  verification/   本机实际执行日志、收据与渲染截图
```

主进程、工作进程和 preload 都以 TS 维护。原生 NodeNext 编译输出保留 `main/preload/shared` 层级；Vite 只处理 renderer。没有把文件核心或 sharp 打入浏览器 bundle。

## 开发与构建

```sh
npm ci
npm ci --prefix workbench
npm run typecheck --prefix workbench
npm test --prefix workbench
npm run build --prefix workbench -- --auth both
npm start --prefix workbench
npm run probe --prefix workbench
```

构建参数必须显式给出 `--auth required|disabled|both`，缺失或未知参数会失败。产物为仓库根 `dist-desktop/auth-required`、`dist-desktop/auth-disabled`。根 `release.config.json` 必须具有固定产品 scope/productId、合法版本、协议1、实验标记与合法 AUTH_MODE；构建分别写入随包配置，主进程和 worker 再核对 scope、pairId、模式、平台与架构。不从环境、查询参数、源码目录或包目录推断模式，也没有运行时切换入口。两模式当前都只验证已有导入/读取流程，均为 `experimental:true / productionReady:false`。

每包包含 `workbench/dist/{main,preload,shared,renderer}`、固定 `renderer-resources.json`、`release.json`、相邻根目录的 `file-library/browser-import/image-validation`、可信原型 validator/72项摘要校验资源，以及通过 locked `npm ci --omit=dev --ignore-scripts` 安装的生产 sharp。原型 validator 保留 CommonJS 所需包边界，worker 的相对导入在源码与产物均有效。包可以移动出仓库再用 Electron 打开；它是实验运行目录，**没有捆绑 Electron 应用运行时或制作签名安装器**。开发依赖中的 Electron binary 只用于维护者启动/验证，不会成为产物中的绝对路径或符号链接依赖。

本机验证先定位官方 Electron 缓存，仅发现旧版33缓存，随后复用本项目开发目录已按精确44.9.0 npm checksums校验的官方 darwin-arm64 binary；未借用旅游项目运行时。全新开发机仍由正常 `npm ci --prefix workbench` 下载精确版本 Electron；下载失败应明确修复网络/下载问题，不回退未知运行时。

## 边界与数据行为

- preload 只暴露 `status/chooseBackup/chooseDestination/importBackup/resumeImport/listContents` 六个无参数方法。renderer 不能传路径、库/任务ID或通用IPC。每次调用核对当前 webContents、精确顶层frame与受控页面URL，拒绝额外参数。worker 再校验有限业务操作与字段，文件核心负责最终路径、身份及锁校验。
- `sandbox/contextIsolation/webSecurity` 开启，Node、webview、导航、新窗口和权限关闭。自定义协议仅查构建清单中精确 URL→固定相对文件/MIME；未登记资源、query/hash、编码与路径规范化形式均不匹配；不开放泛 assets 目录。
- CSP 保留 `script-src 'self'`，没有 inline script、unsafe-eval、CDN或外部连接。Semi CSS 由Vite打包为本地文件；只允许组件所需 style 属性，`style-src` 仍为 self，未放开 style 标签。React 的文字子节点渲染标题和正文，不解释 HTML。
- 预检、导入、图片完整解码和列表读取在 utilityProcess。主进程只保留机器绑定；renderer 状态投影不含原始备份路径、任务/库身份或完整预检来源信息。工作进程退出不会视为成功。
- 接受导入前先刷盘来源摘要和固定目标；响应丢失后按同一磁盘预约找回任务。未完成任务不能更换目标，继续使用已归档原备份，原JSON移走后仍能继续/查询。提交后只查询/读取，不重放导入覆盖后续编辑。不会删锁、删任务或改数据文件来修复。
- 缺失/不支持资源保留记录；本人照缺失不等于可信本人声明。列表只读，本入口暂不提供补文件、合集/发布等完整编辑界面。旧演示授权、安装或信任状态不作为正式状态导入。

## 验证范围

实际结果见 [收据](verification/receipt.json)、[类型检查](verification/typecheck.log)、[Node测试](verification/node-test.log)、[构建](verification/build.log) 与 [Electron探针](verification/electron-probe.log)。`probe` 把两个完整产物复制到仓库外临时目录再启动；测试入口仅注入临时副本，不进入正式包。每模式先验证缺少显式配置拒绝启动，再使用两个真实Electron进程验证：React/Semi已挂载、sandbox/preload/IPC、utilityProcess/sharp导入、移走来源后同任务重启、后续编辑不被覆盖、恶意标题/正文仍是DOM文本，以及实际资源MIME与CSP无拒绝。

自动探针使用隐藏窗口和稳定业务选择器，不依赖Semi内部DOM。未验收真实系统选择器、人工目视交互、macOS解锁、Windows/Linux、签名/公证、升级/卸载、双宿主四组合或正式授权；运行目录不是可商用安装包。

官方依据：[Semi React 19说明](https://semi.design/en-US/start/getting-started)、[Electron安全指南](https://www.electronjs.org/docs/latest/tutorial/security)、[utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process)、[自定义协议](https://www.electronjs.org/docs/latest/api/protocol)、[contextBridge](https://www.electronjs.org/docs/latest/api/context-bridge)。精确版本另通过 npm 官方registry实时核对并写入lock。
