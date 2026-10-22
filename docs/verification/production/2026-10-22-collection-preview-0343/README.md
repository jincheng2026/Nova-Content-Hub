# 0.3.43 合集成员封面预览：源码验收

日期：2026-10-22。基线 `80efa4e`；版本仍为 0.3.43。本记录只对应本次工作区修改，未替换已有冻结发布记录或安装包。

总览「内容项目」中的正常合集原来固定显示 ▤，现在与内容列表的正常合集共用 `CollectionPreview`。预览只读取真实、非回收成员的已选候选，最多展示两张不同 URL 的图，保留横竖图完整比例和图像边缘圆角。单张不复制；两张并排，避免叠图挡住封面文字；不展示空白假叠层。成员或已选候选缺失、未选封面和全部破图时回退 ▤；部分破图保留其余真实有效图。数量仍由原成员逻辑计算，不把预览图数量当作成员数量。

仅统一总览与内容列表两个同义的正常合集入口。回收站保持状态占位及恢复入口；合集自身发布封面、Hero、日程、成员、发布计划、原图字节及库结构均未修改。两张表建立索引后查找成员，找到两张有效不同图即停止。

## 核验

- `npm run typecheck:desktop`：native 与 renderer 均通过，见 `typecheck.log`。
- `node workbench/scripts/collection-preview-ui-probe.mjs`：54/54 场景通过，见 `matrix.log`、`matrix-results.json`。使用真实 React/Semi/Electron 渲染、合成数据及临时 userData，无真实内容库或原生写入能力。
- 精确内容 viewport：1280×860、960×680、760×680；各运行总览、内容列表 × 空合集、单图、双图、已回收成员、失效已选候选、仅未选候选、全部破图、部分破图、重复图 URL。每例核对图数量/回退、自然尺寸加载、完整比例、图片/标题边界、页面无横溢出、原对象不变和原导航 payload。
- `node --test workbench/test/collection-rename.test.mjs workbench/test/workspace.test.mjs workbench/test/workspace-open.test.mjs`：13/13 通过，见 `targeted-tests.log`。
- `git diff --check`：通过。

## 规则记录

| 规则 | 结果及证据 |
|---|---|
| Image-01 | 通过。图片 `object-fit:contain`，实际图像边缘 5px 圆角；矩阵逐图比较实际显示比例与 naturalWidth/naturalHeight，检查边界；横竖图都完整可见。 |
| Template-01（真实多图原则适配） | 通过。仅成员真实不同已选图，0/1/2 与 duplicate 场景验证无复制和无空白纸层。这里为紧凑内容预览，不移植模板选择业务。 |
| Layout-03 / Reading-02 | 本次合集行通过。长标题沿用既有 title 和合集导航，保留摘要及成员数量；1280 三列、960/760 窄窗降级，图片不挤压标题/箭头。截图按真实滚动位置展示；本次不重新验收整页所有业务。 |
| Foundation-01 / Surface-01 | 沿用 surface-inset、surface-line、Semi 文字变量与紧凑圆角；不新增配色系统。 |
| Interaction-03 | 通过本次范围检查与矩阵不变性断言：只改显示，共用既有点击处理器，无 mutation/IPC/存储更改。 |
| Acceptance-01/02 | 类型、针对性测试、真实组件隔离 Electron 矩阵及截图已完成；源码 probe 不等于已安装应用验收。 |
| Acceptance-03 | 本次未构建交付包、安装或验证系统展示；未做 Intel Mac / Windows 原生验收。打包要求仍以根 AGENTS.md 为准。 |

人工查看了 `screenshots/overview-two-1280.png`、`overview-two-960.png`、`contents-two-760.png`、`overview-one-1280.png`、`overview-broken-1280.png` 和 `contents-empty-1280.png` 对应的最终矩阵图片。全部截图源自同一次最终源码矩阵；broken 场景里的 Hero/单篇破图是原有路径，本次合集预览已回退，不能把该截图理解为 Hero 破图修复。

## 额外完整业务 probe 的实际限制

运行旧 `collection-contents-ui-probe.mjs` 时首先失败于总览寻找「旅行合集」：两个合集快速创建处于同毫秒，原摘要只选中了「空合集」，不是本次导航处理器改变。保留 `original-probe-failure.json` 和对应截图。仅在该 probe 的合成 fixture 两次创建间加入 5ms，保证目标合集较新，并将两处旧 `.content-collection-art img` 定位更新为 `.collection-preview img`；没有修改产品排序和导航逻辑。

修正 fixture 后再次运行，已经过总览进入合集、成员真实封面加载、内容管理、长流程中的草稿/冲突/回收站等前置检查，但在回收站恢复按钮 busy 断言超时。`restoreCollection` 已进入 probe 的 hold，按钮在等待期间没有按该断言变为 disabled。保留 `collection-contents-regression.log`、`restore-busy-probe-failure.json` 和截图；后续恢复流程尚未执行。该恢复按钮及 busy 业务代码不在本次产品改动中，尚未做旧源码对照，不能断言是既存缺陷，也不能宣称完整业务 probe 通过。未为使测试通过修改产品业务或跳过原断言。

本次没有运行全量测试、真实用户库、安装、打包、commit 或 tag。下一步由主线程审核真实 diff 与上述失败边界后决定冻结及最终安装验收；目前只有源码和隔离组件验收。
