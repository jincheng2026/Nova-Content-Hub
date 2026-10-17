# Nova Content Hub · 自媒体工作台

当前阶段：**TypeScript / React / Semi UI 的 Electron 技术入口、真实文件核心与插件执行器**。桌面已能导入旧备份并重启恢复任务；正式五页、生产授权与双助手自动生成仍在实施。浏览器原型另行保留，其演示登录不构成真实授权。

商用桌面端实施已启动，按步骤记录设计、变更和验收证据。当前状态见 [实施计划与验收台账](docs/实施/00-实施计划与验收台账.md)，过程见 [实施日志](docs/实施/01-实施日志.md)。各阶段分别验收，不能将原型测试通过视为商用桌面端就绪。

真实本地文件核心位于 [file-library](file-library/README.md)：内容与提示词的 Markdown 真源、照片、不可变资产、模板组版本、候选封面、发布计划与人工发布快照，共用跨进程锁、可恢复事务、软删除与幂等回执。[内置资源安装器](library-seed/README.md) 将实际模板图片和原创创作者提示词导入新库，保留已有用户修改和删除。它们尚未连接原型界面与生产授权；不会把浏览器保存自动改成真实目录写入。

[插件执行入口](plugin-src/README.md) 以明确的`contract`/`cover`命令区分不可执行原型契约与真实封面文件任务；执行实现、Skill和桥接规则只维护一份。旧[封面执行器](cover-runtime/README.md)仅兼容转发。当前Codex线程真实两图回流见[验证样本](assets/production-probes/README.md)；它不证明自动交接、WorkBuddy/Windows或正式授权可用。

## 桌面技术栈与目录

| 目录 | 职责 |
| --- | --- |
| [workbench](workbench/README.md) | Electron；TypeScript main/preload/worker，React19 + Semi UI19界面，Vite构建 |
| [plugin-src](plugin-src/README.md) | Skills、命令分派、Hooks、纯桥接与插件构建的唯一源码 |
| [file-library](file-library/README.md) | 桌面与插件共用的文件CRUD、事务、历史与封面任务 |
| [browser-import](browser-import/README.md)、[library-maintenance](library-maintenance/README.md) | 旧备份迁移、整库备份/核验/恢复 |
| [image-validation](image-validation/README.md)、[library-seed](library-seed/README.md) | 完整图片解码、内置模板与提示词安装 |
| `原型/`、`builtin-templates/`、`builtin-prompts/` | 浏览器原型及原创可分发素材 |
| `schemas/`、`docs/`、`verification/`、`scripts/` | 对外协议、设计/实施记录、证据与工具 |

桌面源码按`workbench/src/{main,preload,renderer,shared}`分层；不引入Vue，已有共享ESM JavaScript核心不因更换界面框架重写。助手路由/交接数据归`plugin-src/src/bridge`，系统发现和受限启动归桌面main。完整取舍见[技术栈与插件化设计](docs/实施/12-技术栈目录与插件化设计.md)。`dist-*`均是生成物，不是修改入口。

开发桌面需Node22.18+，安装根目录与`workbench/`各自锁定依赖后执行：

```sh
npm ci
npm ci --prefix workbench
npm run build:desktop -- --auth both
npm start --prefix workbench
```

当前生成的是两种模式的实验运行目录，仍借助开发环境Electron启动，不是可售安装包；真实系统选择器人工验收、双系统双助手、生产授权与发行仍独立验收。构建模式不可由用户运行时切换。

## 查看原型

本项目需要 Node.js 20.11 或更高版本。浏览器与旧契约插件运行无第三方依赖；完整验证使用开发依赖 Ajv 独立校验 JSON Schema，实验封面执行器使用锁定的 sharp 原生解码依赖。

```sh
npm run build:both
```

构建后，分别双击：

- `dist-prototype/auth-required/index.html`：鉴权交互演示。
- `dist-prototype/auth-disabled/index.html`：免鉴权原型。

不要把两模式的“已开通”演示和浏览器状态当作真实授权。鉴权模式由根 `release.config.json` 的 `AUTH_MODE` 决定，值为 `required` 或 `disabled`；构建命令可显式生成两版，不提供运行时关闭鉴权入口。

## 一次完整体验

1. 鉴权原型先在“更多”中查看账号演示并选择已开通状态；免鉴权版无需这一步。
2. 在模板页上传自己的正脸或半身照，首张自动设为默认。手机大图在本机缩放压缩为封面参考版，也可选本次不放人物。
3. 选择十五套内置模板之一（十一套通用、四套 AI），明确目标内容后填写标题、可空的内容说明与尺寸；一个模板是一组样张：列表显示组数量与缩略带，详情可翻阅每张原图。本人照与整组高清风格样张分别预选，可明确取消部分参考；生成张数独立设置。
4. 在“更多 → 设置”统一选择 AI 助手。所有 AI 入口按当前设置桥接，跨助手保留旧任务并创建有来源的新交接。免鉴权版可尝试协议预填，鉴权演示不放行真实携内容跳转。图片文件不会随链接传入；主动“导出本次全部参考图”，一次下载 ZIP，解压后将整组风格样张与选中的本人照片一起附给助手，包内文件按请求中的稳定 ID 命名。浏览器不自动发送或确认接单。
5. 收到真实图片后导入、验收和选定，再下载图片；日历人工记发布。发布记录固定当时封面，不随后来改选变化。完整工作区可导出备份并恢复。

浏览器工作区有明确的 4 MiB 存储上限，适合小样本交互验证；大图或大量图请保留原件。容量不足会报错并回退，不静默当作保存成功。浏览器数据可能随清理网站数据丢失，重要结果应主动下载和导出备份。此上限不是后续桌面内容库规格。

内置账号、设计与素材采用虚构示例、原创 SVG 和本项目实际生成的三十张 AI 样图（每套两张，SVG 单列为结构示意），未复用原隐私图片。用户上传照片在本机保存，可设默认、删除和恢复；没有照片时不会用模板样例人物冒充用户。有效的旧版浏览器工作区及导入备份会定向替换已知旧演示数据，保留自建项目和自定义图片；外部备份、未知自导入图片及损坏数据不自动删除。详见 [示例隐私与 Skills 融合记录](docs/示例隐私与Skills融合.md)。

## 插件契约包

配套目录位于 `dist-plugin-contract/nova-content-hub-required`、`dist-plugin-contract/nova-content-hub-disabled`，各包含两宿主清单、Hooks、CLI 及三个业务 Skills。

在生成的插件目录中运行：

```sh
node dist/content.mjs summary
node dist/content.mjs check-request --file REQUEST.json
```

`required` 在缺真实可信授权时返回 `AUTH_NOT_CONFIGURED`；`disabled` 仍验证协议和路径。两版均返回 `executable:false`：此包只校验契约，不生成图片、读写实际库或提交任务。不会自动安装插件和信任 Hooks。详见 `plugin-src/README.md`。

三个业务 Skills 已结合 GitHub 上的封面生成、图像生成与视觉设计方法，来源固定到提交并随包附带许可，见 [借鉴说明](plugin-src/references/upstream-notices.md)。

## 验证

```sh
npm run verify
```

完整验证使用Node22.18+，先安装根目录与`workbench/`依赖。`npm run verify`包含原型、共享核心、插件、桌面类型检查及双模式构建；真实Electron探针另用`npm run probe:desktop`，不会把普通Node测试冒充窗口验收。修改内置模板时编辑`builtin-templates/catalog.json`；修改桥接只编辑`plugin-src/src/bridge/handoff.js`，`npm run sync:bridge`生成原型副本。`npm run check`会拒绝生成物漂移。

工作区测试使用内存存储，插件测试使用独立临时目录，交接测试使用实际双构建产物。自动化测试不操作真实资料库、不调用模型或登录服务。内置样图由实际 imagegen 调用生成，保留完整提示与文件校验记录；这不证明工作台的自动执行已接入。自动化测试不能代替浏览器渲染、真实宿主安装、Electron 安装升级或跨平台验收。

## 实施依据

- 当前产品、鉴权、模板、Skills/Hooks 与 Electron 工作包：`docs/自媒体工作台-产品与插件交付蓝图.md`。
- 本轮交付及验证边界：`docs/原型交付与验收.md`。
- 全局助手、桥接与基础数据契约：[统一助手与内置模板验收](docs/统一助手与内置模板验收.md)。
- 当前照片与人物模板、同事资料的借鉴范围：[同事交接包借鉴与落地](docs/同事交接包借鉴与落地.md)。
- 首批场景设计与旅游机制借鉴：[自媒体模板与生成流程升级](docs/自媒体模板与生成流程升级.md)（保留为阶段记录）。
- `docs/reviews/2026-10-16-生产交付审查与桌面演进.md` 和当时模型诊断记录是修改前的审查快照，行号和诊断脚本不再代表当前实现。

本项目参考旅游工作台机制，未修改它的源码、安装插件或访问其真实活动库。生产鉴权需要本产品独立 Native 应用、scope 与可信权益签发能力；不能复用浏览器演示状态或复制客户端签名私钥替代。

项目右侧统一为一个按任务状态变化的入口；多个任务先单选，旧演示与完成记录在历史中查看。多尺寸生成会列出本批全部任务。交接弹窗先准备参考图 ZIP 和必要的 HANDOFF.json，再使用底部一个主按钮继续；备用方式与技术详情可按需展开。
