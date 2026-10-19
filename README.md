# Nova Content Hub · 自媒体工作台

本机最新为 **0.3.13 preview / Apple 芯片 Mac**，已通过应用内安装事务实际替换 `/Applications/自媒体工作台.app` 并完成重启确认。最终构建与安装版1839项完整应用文件一致，随包638项插件负载版本为0.3.13；旧应用完整保留，安装前后内容库摘要一致。见[安装收据](docs/verification/production/2026-10-19-mac-0313-preview-installed.json)与[本批记录](docs/实施/55-封面对比位置批注与模板密度.md)。两助手插件0.3.13已通过官方CLI更新及缓存校验，安装版最终原生走查尚未完成。交付包与演示说明位于`/Users/mac/Downloads/自媒体工作台-0.3.13-Mac苹果芯片/`，正式商用仍未宣布完成。

本批新增封面并排对比、收藏筛选、位置批注修改、自定义比例、模板密度及共用颜色选择。最终聚焦验证：封面35项、Mac安装29项通过，真实React/Semi/Electron界面探针通过；完整 `npm run verify` 正在运行，尚未登记通过。0.3.11日志中的924通过/0失败/2跳过仅为此前测试分组汇总，不据此声称该轮完整verify退出0，也不覆盖0.3.13改动。当前批注修改尚未实际发送AI并回流验收；Windows/Intel实机、正式签名公证、Codex原生发送及G2完整商用验收仍未完成。下文旧版本与[0.3.9改版记录](docs/实施/51-创作工作台全面改版与039.md)均为历史证据。

0.3.2历史验证：当时已重新安装 **0.3.2**，两助手插件均为0.3.2；完整健康检查、原生备份恢复与100篇隔离库走查见[0.3.2历史Mac记录](docs/实施/42-本机Mac优先与032安装.md)。后续每次最新Mac包均需实际安装；先保证本机可用，下文旧版本验证仅为历史证据。

当前阶段：**TypeScript / React / Semi UI / Electron 的本地内容工作台，功能队列已收口，正在统一验收。**

一期交付免费体验版，无需注册、登录或产品权益。Pro 与收费鉴权不在本期；默认构建为 `AUTH_MODE=disabled`，旧 `required` 构建仅保留内部受限兼容，不是用户入口。当前源码、本机安装和真实助手结果分别留证，不能将构建或单机通过视为商用就绪。

五页围绕内容：总览了解进度，模板组与本人照片辅助生图，内容保存正文、资料和封面，日历记录人工发布计划，提示词辅助打磨。当前已按用户顺序转入集中验证；失败和修复见[统一验证记录](docs/实施/34-统一验证首轮问题与修复.md)。进度见[实施台账](docs/实施/00-实施计划与验收台账.md)、[免费体验发行策略](docs/实施/28-免费体验发行策略.md)与[交互重构记录](docs/实施/29-免费体验与创作流程重构.md)。

用户操作见[上手指南](docs/用户上手指南.md)。新增[Mac 通用包源码流程](docs/实施/31-Mac通用包与原生产物装配.md)和[旧库升级副本流程](docs/实施/32-旧库升级副本与中断恢复.md)，源码已完成集中验证；0.3.1已在本机通过原生安装并更新两个助手插件；0.3.0的Codex与WorkBuddy真实生图均已回流，0.3.1 WorkBuddy首次自动准备及真实原图回流已原生验证，见[安装记录](docs/实施/35-安装包完整性与本机原生验收.md)、[尺寸升级](docs/实施/36-真实生图尺寸契约与030升级.md)、[首次交接准备](docs/实施/39-首次助手交接运行时准备.md)、[首点击修复](docs/实施/40-返回工作台时的首点击与后台刷新.md)与[再次交接](docs/实施/41-WorkBuddy使用标记与再次交接.md)。

[file-library](plugin-src/src/lib/file-library/README.md) 是 Electron 与插件共用的本地文件核心：Markdown/JSON 真源、不可变图片、模板组版本、封面候选、发布快照、回收站及可恢复事务。内置资源通过[安装器](plugin-src/src/lib/library-seed/README.md)进入真实内容库，保留用户修改。

[插件](plugin-src/README.md) 的 `contract` 仅校验旧原型契约；`cover` / `template` 执行固定的真实文件任务。历史真实宿主证据见[验收记录](docs/实施/18-五页桌面与真实宿主验收.md)，其覆盖范围不自动延伸到本批源码或 Windows/Intel。

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

默认生成无需登录的免费体验运行目录。免费体验安装器使用 `npm run dist:preview --prefix workbench -- --platform darwin --arch arm64` 等对应原生目标入口；本批两模式桌面构建与仓库外Electron探针已执行，系统选择器、当前安装包、双系统双助手、升级、签名与发行仍须分别验收。构建模式不由用户运行时切换。

桌面采用指定的蓝色 N [应用图标](workbench/resources/brand/desktop/README.md)，窗口与macOS Dock从随包固定资源加载；两模式同时带PNG、Windows
ICO及macOS ICNS。`npm run icons:check`核验资源，`npm run icons:build`在macOS从现有母版重新导出。打包器已引用固定图标，正式EXE/app安装后的显示仍待真机验收。

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

- 当前产品、鉴权、模板、Skills/Hooks 与 Electron 工作包：`docs/自媒体工作台-产品与插件交付蓝图.md`。
- 本轮交付及验证边界：`docs/原型交付与验收.md`。
- 全局助手、桥接与基础数据契约：[统一助手与内置模板验收](docs/统一助手与内置模板验收.md)。
- 当前照片与人物模板、同事资料的借鉴范围：[同事交接包借鉴与落地](docs/同事交接包借鉴与落地.md)。
- 首批场景设计与旅游机制借鉴：[自媒体模板与生成流程升级](docs/自媒体模板与生成流程升级.md)（保留为阶段记录）。
- `docs/reviews/2026-10-16-生产交付审查与桌面演进.md` 和当时模型诊断记录是修改前的审查快照，行号和诊断脚本不再代表当前实现。

本项目参考旅游工作台机制与已安装参考产品的界面，不修改参考源码、业务文件或凭据，不将同事私人图片作为内置素材分发。历史授权设计仅留档，一期免费体验不等待该接入。

项目右侧统一为一个按任务状态变化的入口；多个任务先单选，旧演示与完成记录在历史中查看。多尺寸生成会列出本批全部任务。交接弹窗先准备参考图
ZIP 和必要的 HANDOFF.json，再使用底部一个主按钮继续；备用方式与技术详情可按需展开。
