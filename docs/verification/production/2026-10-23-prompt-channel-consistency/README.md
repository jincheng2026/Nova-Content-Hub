# 提示词卡片与渠道输入一致性验收

2026-10-23，macOS / darwin-arm64，Electron 44.9.0。真实 React/Semi renderer，临时 userData 与内存内容库；未读取或写入用户真实内容库。此目录位于既有 production 证据树，不代表生产安装包验收。

## 修改与根因

- 提示词外卡已按 grid 行拉齐，内部 body 未填满卡片；底部 `margin-top:auto` 只能使用 body 的空间。补齐 body `height:100%`，并将 footer 元信息与操作按底部对齐，复制、填写并复制、停用提示等操作固定在各卡右下角。模板卡已有同样的满高 flex body，封面操作采用独立 grid；无需改全局 Card。
- 原预览固定三行，约一段中等长度文字也会出现「查看全部/收起」。统一放宽到六行，依据实际行数判断；本次一句话与约一百字的中篇完整显示，长文仍有完整展开入口。展开会使同排卡片一起增高，底部操作继续对齐。
- 渠道原有 `multiple filter` 已能直接输入。实际鼠标点击后已聚焦，但 Semi 将空搜索区设为 2px（内部 input 因公共 padding 实测 24px），而 `searchPlaceholder` 用于 dropdown 搜索，当前 trigger 输入没有提示。将提示放到实际 input，并保留 200px 最小输入区；过滤、多选、键盘及既有保存契约沿用。

## 设计规则与实测

| 规则 | 结果与证据 |
| --- | --- |
| Surface-01、Controls-01、Reading-03 | 1440×1000 与 960×680 精确 content viewport；短/中/长预览、长标题、元信息换行及停用卡同排操作底沿相差 0px，按钮距卡右/底边均 17px（含边框）。[桌面](after-prompts-1440.png)、[窄窗下排](after-prompts-lower-960.png) |
| Reading-02、Reading-03 | 中篇原文完整且无展开/收起；长文展开后保留换行与末尾标记，操作仍对齐，可正常纵向滚动。[展开后桌面](after-prompts-expanded-1440.png)、[展开后窄窗](after-prompts-expanded-960.png) |
| Controls-02 | 两个 viewport 空输入宽均为 200px，可见「输入渠道名称筛选，可多选」；真实鼠标聚焦后直接键入「直播」，仅保留匹配渠道；Down/Enter 可选，第二项多选保留第一项。无结果保留已选，清空恢复列表，Escape 关闭列表，busy 禁用。全程零 native API 调用。[可输入提示](after-channels-ready-960.png)、[过滤](after-channels-search-960.png)、[无结果](after-channels-no-match-960.png)、[多选](after-channels-selected-960.png) |
| Layout-01、Acceptance-02 | 两种 viewport 均无页面水平溢出；960×680 通过页面纵向滚动到达下排卡片和资料动作。截图为 renderer 截屏，Retina 像素尺寸是 CSS viewport 的两倍。 |
| Acceptance-01 | 类型检查、针对性 renderer 红绿检查、既有提示词完整交互回归与 renderer 生产构建均通过，见下表。 |
| Interaction-03、Acceptance-03 | 仅改提示词布局/预览与共享渠道输入呈现；业务实体、保存、IPC、版本、安装包、插件无变更。 |

修复前同类场景见 [before-prompts-1440.png](before-prompts-1440.png) 和 [before.json](before.json)。红灯阶段 content viewport 为 1440×968、960×968；最终绿灯改用 `setContentSize` 严格验证 1440×1000、960×680，[after.json](after.json) 记录精确 viewport 与几何。前后页面高度不同，不以图片像素直接对齐比较。

## 验证命令

| 命令 | 结果 |
| --- | --- |
| `PROMPT_CHANNEL_BASELINE=1 node workbench/scripts/prompt-card-channel-ui-probe.mjs`（修改前） | 预期失败：按钮底沿不齐、中篇被截断、渠道无输入提示；直接输入、键盘和多选功能原本可用。 |
| `node workbench/scripts/prompt-card-channel-ui-probe.mjs` | 通过；1440×1000 / 960×680，短中长文与展开、200px 输入区、直接键入/多选/键盘/无结果/清空/Escape/busy、零 native 调用。支持 `UI_EVIDENCE_DIR` 覆盖输出目录。 |
| `node workbench/scripts/prompt-density-ui-probe.mjs` | 通过；1440/1100/900/560 四档列数、分类/状态/收藏筛选、CAS与失败保留、完整多行复制/字段填写、未保存保护、busy/停用、10k数据分页、321字与百行正文编辑/预览末尾可达。将过期的160–190px高度约束改为中篇完整可读，并将 mock 对齐现有 `updatePromptFavorite` API。 |
| `cd workbench && npm run typecheck` | native 与 renderer 均通过。 |
| 在 workbench 用 Vite `build({configFile:false,root:path.resolve('src/renderer'),base:'./',oxc:{jsx:{runtime:'automatic'}},build:{outDir:临时目录,modulePreload:false,target:'chrome148'}})` | 完整 renderer 生产构建通过；产物在系统临时目录 `nova-renderer-consistency-build-MnDl1R`。保留既有 chunk >500kB 提示，无新增依赖。 |
| `node workbench/scripts/content-channel-ui-probe.mjs`（主线程独立执行） | 通过；渠道显示并集/去重、取消计划排除、历史不可用显示、元信息保全与零写入。 |
| `git diff --check` | 通过。 |

Renderer 构建可复现命令（在 `workbench` 执行）：

```sh
node --input-type=module -e 'import {build} from "vite"; import {mkdtemp} from "node:fs/promises"; import path from "node:path"; import os from "node:os"; const outDir=await mkdtemp(path.join(os.tmpdir(),"nova-renderer-consistency-build-")); await build({configFile:false,root:path.resolve("src/renderer"),base:"./",oxc:{jsx:{runtime:"automatic"}},build:{outDir,modulePreload:false,target:"chrome148"}}); console.log("Renderer build:",outDir);'
```

未执行完整测试集、真实系统剪贴板写入、中文输入法组合输入、安装后的应用、Windows/Intel Mac 原生交互与系统展示验收；未打包、安装、更版或提交。当前证据只覆盖此源码的隔离 renderer，长文展开仍会增加同排高度。

## 同日追加：移除免费体验表述

- 用户要求不再告知免费：删除侧栏「免费体验」徽标及其未使用样式；设置页说明保留「资料保存在你的本机内容库」，旧受限构建提示改为「请安装当前版本的自媒体工作台」。
- Layout-01、Controls-03、Interaction-03：仅删标签和调整文案；权限、模式、付费与业务流程无改动。本次为源码检查，未新增视觉验收或截图。
- Acceptance-01：`npm run typecheck:renderer --prefix workbench`、`git diff --check` 通过；检查 `workbench/src`、`workbench/prototype`、`plugin-src/src` 的 TS/JS/CSS/HTML 源码，无「免费体验」或 `free-badge` 残留。
- Acceptance-03：未打包安装或复核安装版；此前截图是修改前的历史证据。
