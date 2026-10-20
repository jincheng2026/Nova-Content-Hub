# Nova Content Hub · 自媒体工作台

最新安装：**0.3.32 / Apple 芯片 Mac / 本地免登录预览版**，冻结源码 `43957b0`，本地 main 与 tag `v0.3.32-preview-mac-arm64` 已落实。包含 A 组、提示词及帮助页集成、图片并行读取优化、短菜单改进和明确勾选的收藏构图参考。最终应用/DMG/插件一致，原库安装前后保全；首次启动正在等待 macOS 文稿文件夹授权，尚未完成新安装版界面与重开验收。见[0.3.32交付证据](docs/verification/production/2026-10-20-a-release-0332/README.md)。下方0.3.31记录为历史。

当前安装：**0.3.31 / Apple 芯片 Mac / 本地免登录版**（2026-10-20），冻结源码`4c230eb`。安装树1817项与冻结构建/DMG一致，原库1781项安装前后及本轮正常退出后摘要保持，事务complete；已实际重开并读出4篇内容/1个合集。见[当轮交付证据](docs/verification/production/2026-10-20-ui-0331/README.md)。

本轮封面徽标/编号全部移出图片，分类使用Semi创选，资料/渠道置首，日程与展开发布面板清晰显示文档归属与五列。121/101计划及107计划/历史分页末条可达；主线程集成探针、模型检查、两模式构建和Astra审查通过。实际安装版核对这些页面，Finder与原生关于均显示完整公司版权。两宿主磁盘插件配对0.3.31；[真实Codex生成回流](docs/verification/production/2026-10-20-real-cover-0329/README.md)在本轮0.3.29完成，升级后候选保留，不重复计为0.3.31新生图。完整商用目标和跨平台矩阵仍有独立缺口。

- [重新整理的逐页面建议](docs/reviews/2026-10-20-逐页面优化建议.md)。本轮七图明确要求优先，已实现与等待用户选择的建议分开。
- [当前需求、第一性原理分析与验收缺口](docs/reviews/2026-10-20-最终交付收口与第一性原理复核.md)：合并项目主对话、跳转提示词对话及本轮追加要求，明确红框对应、已做工作及下一步。
- [24个逐页场景及可选优化](docs/verification/production/2026-10-20-ui-pages-0325/review.html)、[0.3.25修复与安装记录](docs/verification/production/2026-10-20-ui-0325.md)。旧图使用0.3.24原生层；另有0.3.25打包及安装证据，范围分开。
- [0.3.25安装树、配套插件和DMG复核](docs/verification/production/2026-10-20-final-convergence/artifacts.json)。该历史包源提交 `1de4f72`，当时安装与归档构建一致。交付目录 `/Users/mac/Downloads/自媒体工作台-0.3.25-同事交付-Mac苹果芯片/`，仅含DMG、使用说明和SHA256。
- [用户上手指南](docs/用户上手指南.md)、[实施台账与历史记录](docs/实施/00-实施计划与验收台账.md)。历史版本的测试和真实生图不能自动证明当前版本通过。

一期围绕内容：总览、模板、内容、日程、提示词；TS/React/Semi UI/Electron与插件共用文件核心。内置20组模板、52条提示词和科技姐风格真实示例；合集是集中收纳入口，具体业务在单篇内容管理。

当前按用户最新约束先验收内部Apple Silicon交付，不新增产品登录、Pro收费、云同步或自动发布。签名另行处理；Windows/Intel及其他环境的长期支持诉求另列矩阵。包仍为 `prototype/experimental`、`productionReady=false`，正式production入口保持门禁，不能把内部包称为已签名公证的公共正式发行。

此前日历/退出/原库读取修复继续保留，原完整verify的两个条件跳过项已另行显式各1/1通过，见[补测](docs/verification/production/2026-10-20-gated-runtime-0328/README.md)，不改写历史统计。下一轮页面优化等待用户选择；新会话自动交接、同版WorkBuddy生成、新用户首个成品、Dock实际显示及平台/发行矩阵缺口详见收口报告。

## 桌面技术栈与目录

| 目录 | 职责 |
|---|---|
| [docs](docs/实施/00-实施计划与验收台账.md) | 设计、实施台账与原始验收证据 |
| [plugin-src](plugin-src/README.md) | 唯一插件源码、共享文件核心、协议、Skills 与固定资源 |
| [workbench](workbench/README.md) | Electron / React 桌面端及保留的浏览器原型 |
| `plugin/` | 生成的契约包与实验执行包 |

桌面源码按`workbench/src/{main,preload,renderer,shared}`分层；不引入Vue，已有共享ESM JavaScript核心不因更换界面框架重写。助手路由/交接数据归
`plugin-src/src/bridge`
，系统发现和受限启动归桌面main。完整取舍见[技术栈与插件化设计](docs/实施/12-技术栈目录与插件化设计.md)。`plugin/`、`workbench/dist-desktop/` 与 `workbench/dist-prototype/`
均是生成物，不是修改入口。

开发桌面需Node22.18+，安装根目录与`workbench/`各自锁定依赖后执行：

```sh
npm ci
npm ci --prefix workbench
npm run build:desktop -- --auth disabled
npm start --prefix workbench
```

默认生成无需登录的免费体验运行目录。免费体验安装器使用 `npm run dist:preview --prefix workbench -- --platform darwin --arch arm64` 等对应原生目标入口；实际构建、安装、助手及平台验收范围见当前收口报告。构建模式不由用户运行时切换。

桌面采用指定的蓝色 N [应用图标](workbench/resources/brand/desktop/README.md)，窗口与macOS Dock从随包固定资源加载；两模式同时带PNG、Windows
ICO及macOS ICNS。`npm run icons:check`核验资源，`npm run icons:build`在macOS从现有母版重新导出。打包器引用固定图标；Mac已有安装观察，Windows图标仍需对应实机验收。

## 查看原型

本项目需要 Node.js 20.11 或更高版本。浏览器与旧契约插件运行无第三方依赖；完整验证使用开发依赖 Ajv 独立校验 JSON
Schema，实验封面执行器使用锁定的 sharp 原生解码依赖。

```sh
npm run build:both
```

构建后，分别双击：

- `workbench/dist-prototype/auth-required/index.html`：鉴权交互演示。
- `workbench/dist-prototype/auth-disabled/index.html`：免鉴权原型。

不要把两模式的“已开通”演示和浏览器状态当作真实授权。鉴权模式由根 `release.config.json` 的 `AUTH_MODE` 决定，值为
`required` 或 `disabled`；构建命令可显式生成两版，不提供运行时关闭鉴权入口。

## 一次完整体验

1. 鉴权原型先在“更多”中查看账号演示并选择已开通状态；免鉴权版无需这一步。
2. 在模板页上传自己的正脸或半身照，首张自动设为默认。手机大图在本机缩放压缩为封面参考版，也可选本次不放人物。
3. 选择十五套内置模板之一（十一套通用、四套
   AI），明确目标内容后填写标题、可空的内容说明与尺寸；一个模板是一组样张：列表显示组数量与缩略带，详情可翻阅每张原图。本人照与整组高清风格样张分别预选，可明确取消部分参考；生成张数独立设置。
4. 在“更多 → 设置”统一选择 AI 助手。所有 AI
   入口按当前设置桥接，跨助手保留旧任务并创建有来源的新交接。免鉴权版可尝试协议预填，鉴权演示不放行真实携内容跳转。图片文件不会随链接传入；主动“导出本次全部参考图”，一次下载
   ZIP，解压后将整组风格样张与选中的本人照片一起附给助手，包内文件按请求中的稳定 ID 命名。浏览器不自动发送或确认接单。
5. 收到真实图片后导入、验收和选定，再下载图片；日历人工记发布。发布记录固定当时封面，不随后来改选变化。完整工作区可导出备份并恢复。

浏览器工作区有明确的 4 MiB
存储上限，适合小样本交互验证；大图或大量图请保留原件。容量不足会报错并回退，不静默当作保存成功。浏览器数据可能随清理网站数据丢失，重要结果应主动下载和导出备份。此上限不是后续桌面内容库规格。

内置账号、设计与素材采用虚构示例、原创 SVG 和本项目实际生成的三十张 AI 样图（每套两张，SVG
单列为结构示意），未复用原隐私图片。用户上传照片在本机保存，可设默认、删除和恢复；没有照片时不会用模板样例人物冒充用户。有效的旧版浏览器工作区及导入备份会定向替换已知旧演示数据，保留自建项目和自定义图片；外部备份、未知自导入图片及损坏数据不自动删除。详见 [示例隐私与 Skills 融合记录](docs/示例隐私与Skills融合.md)。

## 插件契约包

配套目录位于 `plugin/contract/nova-content-hub-required`、`plugin/contract/nova-content-hub-disabled`
，各包含两宿主清单、Hooks、CLI 及三个业务 Skills。

在生成的插件目录中运行：

```sh
node dist/content.mjs summary
node dist/content.mjs check-request --file REQUEST.json
```

`required` 在缺真实可信授权时返回 `AUTH_NOT_CONFIGURED`；`disabled` 仍验证协议和路径。两版均返回 `executable:false`
：此包只校验契约，不生成图片、读写实际库或提交任务。不会自动安装插件和信任 Hooks。详见 `plugin-src/README.md`。

三个业务 Skills 已结合 GitHub
上的封面生成、图像生成与视觉设计方法，来源固定到提交并随包附带许可，见 [借鉴说明](plugin-src/references/upstream-notices.md)。

## 验证

```sh
npm run verify
```

完整验证使用Node22.18+，先安装根目录与`workbench/`依赖。`npm run verify`包含原型、共享核心、插件、桌面类型检查及双模式构建；真实Electron探针另用
`npm run probe:desktop`，不会把普通Node测试冒充窗口验收。修改内置模板时编辑`plugin-src/resources/builtin-templates/catalog.json`；修改桥接只编辑
`plugin-src/src/bridge/handoff.js`，`npm run sync:bridge`生成原型副本。`npm run check`会拒绝生成物漂移。

工作区测试使用内存存储，插件测试使用独立临时目录，交接测试使用实际双构建产物。自动化测试不操作真实资料库、不调用模型或登录服务。内置样图由实际
imagegen 调用生成，保留完整提示与文件校验记录；这不证明工作台的自动执行已接入。自动化测试不能代替浏览器渲染、真实宿主安装、Electron
安装升级或跨平台验收。

## 实施依据

- 历史产品、鉴权、模板、Skills/Hooks 与 Electron 工作包：`docs/自媒体工作台-产品与插件交付蓝图.md`。
- 历史原型交付及验证边界：`docs/原型交付与验收.md`。
- 全局助手、桥接与基础数据契约：[统一助手与内置模板验收](docs/统一助手与内置模板验收.md)。
- 当前照片与人物模板、同事资料的借鉴范围：[同事交接包借鉴与落地](docs/同事交接包借鉴与落地.md)。
- 首批场景设计与旅游机制借鉴：[自媒体模板与生成流程升级](docs/自媒体模板与生成流程升级.md)（保留为阶段记录）。
- `docs/reviews/2026-10-16-生产交付审查与桌面演进.md` 和当时模型诊断记录是修改前的审查快照，行号和诊断脚本不再代表当前实现。

本项目参考旅游工作台机制与已安装参考产品的界面，不修改参考源码、业务文件或凭据，不将同事私人图片作为内置素材分发。历史授权设计仅留档，一期免费体验不等待该接入。

项目右侧统一为一个按任务状态变化的入口；多个任务先单选，旧演示与完成记录在历史中查看。多尺寸生成会列出本批全部任务。交接弹窗先准备参考图
ZIP 和必要的 HANDOFF.json，再使用底部一个主按钮继续；备用方式与技术详情可按需展开。


新增全局交付规范补记：本轮安装后发现用户新增了AGENTS.md中的Finder信息要求，其登记时间晚于0.3.29冻结/安装。已在实际Finder“显示简介”核对名称、图标、0.3.29、672.9MB及真实修改时间；当前版权仍为“Copyright © 2026 自媒体工作台”，尚不含公司全称，不能记为符合新规范；应用内关于的实际面板也未在本轮打开。见[系统展示核验记录](docs/verification/production/2026-10-20-calendar-stable-0329/finder-info.json)。该项列入后续打包验收，不回写0.3.29冻结产物或宣称整体商用完成。
