# 0.3.40 下拉面板圆角检查（2026-10-22）

## 结论与根因

普通、可搜索、自建分类及多选最终均渲染 Semi Select 的 `.semi-select-option-list-wrapper`。Semi Popover 外壳有圆角，但 wrapper 原为 `border-radius:0; overflow:visible`，内部白列表及 hover/selected 背景越过外壳圆角；既有分页修复仅匹配 `.semi-page-select-dropdown`。

最小修复：`workbench/src/renderer/semi-controls.css` 给 **Select 内容 wrapper** 统一 `border-radius:var(--semi-border-radius-medium); overflow:hidden`。保留内层 `.semi-select-option-list` 的 `overflow-y:auto` 及虚拟滚动，不裁剪 `.semi-portal`、原生 dialog popup host 或通用 Popover；不改变选择事件、表单或库数据。分页旧局部规则保持兼容。

## 可复现证据与范围

- 红灯：修复前执行 `DROPDOWN_EXPECT_RED=1 node workbench/scripts/dropdown-corners-ui-probe.mjs`，退出 1，断言 `rounded popup must clip child option backgrounds`。`before.json` 为 radius `0px`、overflow `visible`、两角命中均 `true`；见 `before-single-selected.png`、`before-failure.png`、`red.log`。
- 绿灯：修复后执行 `node workbench/scripts/dropdown-corners-ui-probe.mjs`，退出 0。`after.json` 的所有 Select wrapper 均 radius `12px`、overflow `hidden`、两角命中均 `false`；见 `green.log`。
- 真实 `PromptsPage` 使用合成空库，分类为“全部分类 / 写作 / 标题”；`after-actual-prompt-category-first-hover.png` 与 `after-actual-prompt-category-last-hover.png` 对应用户反馈入口。不是重画截图。
- 代表场景逐一运行：普通单选首/末 hover、首/末选中及聚焦；40 项虚拟搜索并实际选择第 40 项；可输入分类；多选实际新增第二项；原生 modal 中普通、搜索、自建分类和分页；disabled 禁止打开；分页首/末 hover；Semi Dropdown 动作菜单角落。
- 每次截图等待有限 CSS 动画完成。Electron 窗口 1100×900（包含系统标题栏）；PNG 为 Retina 2200×1736 内容区域。当前 **darwin-arm64 本地源码 Electron 44.9.0**；临时独立 userData、合成内存数据，不打开已安装自媒体工作台或真实内容库。
- 这是逐入口源码审计 + 共享机制代表场景运行检查；没有声称每个业务入口均已逐一人工点击。浏览器、安装包、Intel Mac、Windows 及物理中文输入法未在本项验收。

## 逐入口审计清单

检索全部 renderer TSX 中 `PopupSelect`、`PopupCreatableSelect`、直接 `Select`、`Dropdown`、原生 `select` 与菜单角色；未发现另一组原生 select。下表每个 Select 入口均由此次同一 wrapper 规则覆盖；没有复制逐页补丁。

| 源码（相对 workbench/src/renderer） | 入口 | 控件 | 处理 |
|---|---|---|---|
| `template-workflow-panel.tsx:87` | 拆解历史 | PopupSelect | 共用 Select wrapper，已修复覆盖 |
| `assistant-settings.tsx:77` | assistant | PopupSelect | 共用 Select wrapper，已修复覆盖 |
| `workspace-pages.tsx:228` | calendar-channel-label | Select | 共用 Select wrapper，已修复覆盖 |
| `workspace-pages.tsx:230` | 筛选发布状态 | PopupSelect | 共用 Select wrapper，已修复覆盖 |
| `workspace-pages.tsx:230` | 选择发布内容 | PopupSelect | 共用 Select wrapper，已修复覆盖 |
| `workspace-pages.tsx:263` | 提示词分类 | PopupSelect | 共用 Select wrapper，已修复覆盖 |
| `workspace-pages.tsx:263` | 提示词状态 | PopupSelect | 共用 Select wrapper，已修复覆盖 |
| `workspace-pages.tsx:263` | 提示词收藏 | PopupSelect | 共用 Select wrapper，已修复覆盖 |
| `workspace-pages.tsx:263` | 提示词范围 | PopupSelect | 共用 Select wrapper，已修复覆盖 |
| `workspace-pages.tsx:264` | 选择提示词参考内容 | PopupSelect | 共用 Select wrapper，已修复覆盖 |
| `workspace-pages.tsx:269` | 提示词动作菜单 | Dropdown | Semi Dropdown，代表场景角落命中检查通过，未修改 |
| `workspace-pages.tsx:293` | 提示词分类 | PopupCreatableSelect | 共用 Select wrapper，已修复覆盖 |
| `workspace-pages.tsx:416` | 模板来源 | PopupSelect | 共用 Select wrapper，已修复覆盖 |
| `workspace-pages.tsx:419` | 模板工作版本 | PopupSelect | 共用 Select wrapper，已修复覆盖 |
| `workspace-pages.tsx:445` | 模板当前版本 | PopupSelect | 共用 Select wrapper，已修复覆盖 |
| `publication-panel.tsx:80` | 筛选计划状态 | PopupSelect | 共用 Select wrapper，已修复覆盖 |
| `publication-panel.tsx:114` | 发布时刻精度 | PopupSelect | 共用 Select wrapper，已修复覆盖 |
| `publication-panel.tsx:156` | 发布渠道 | PopupSelect | 共用 Select wrapper，已修复覆盖 |
| `publication-panel.tsx:158` | 发布封面 | PopupSelect | 共用 Select wrapper，已修复覆盖 |
| `content-list.tsx:65` | 内容范围 | PopupSelect | 共用 Select wrapper，已修复覆盖 |
| `content-list.tsx:65` | 内容状态 | PopupSelect | 共用 Select wrapper，已修复覆盖 |
| `content-list.tsx:65` | 内容列表排序 | PopupSelect | 共用 Select wrapper，已修复覆盖 |
| `content-list.tsx:69` | 内容动作菜单 | Dropdown | Semi Dropdown，代表场景角落命中检查通过，未修改 |
| `covers.tsx:343` | cover-ratio | PopupSelect | 共用 Select wrapper，已修复覆盖 |
| `covers.tsx:344` | 选择我的本人照片 | PopupSelect | 共用 Select wrapper，已修复覆盖 |
| `covers.tsx:357` | 封面候选构图关联 | PopupSelect | 共用 Select wrapper，已修复覆盖 |
| `covers.tsx:358` | 样张预览的模板版本 | PopupSelect | 共用 Select wrapper，已修复覆盖 |
| `library-panels.tsx:88` | 合集成员筛选 | PopupSelect | 共用 Select wrapper，已修复覆盖 |
| `library-panels.tsx:88` | 合集成员排序 | PopupSelect | 共用 Select wrapper，已修复覆盖 |
| `library-panels.tsx:108` | 管理列表排序 | PopupSelect | 共用 Select wrapper，已修复覆盖 |
| `library-panels.tsx:143` | 默认人物参考 | PopupSelect | 共用 Select wrapper，已修复覆盖 |
| `library-panels.tsx:143` | 默认模板 | PopupSelect | 共用 Select wrapper，已修复覆盖 |
| `library-panels.tsx:179` | 内容默认模板 | PopupSelect | 共用 Select wrapper，已修复覆盖 |
| `library-panels.tsx:206` | 附件角色 | PopupSelect | 共用 Select wrapper，已修复覆盖 |

`semi-controls.tsx:60/68` 是上述两种 PopupSelect 的唯一定义；直接 Semi 多选位于日历渠道筛选，亦使用相同 wrapper。表内多选的 modal 能力不是产品新增承诺；该入口实际在日历页，运行验证在普通页面。

分页统一由 `pagination-bar.tsx:6` 的 Semi Pagination 内建 Select 提供，额外 class 为 `.semi-page-select-dropdown`；`list-primitives.tsx:15` 的 DataTable 仍委托 PaginationBar。逐一检索到的使用处：内容列表/合集分页（content-list:68/69）、合集成员/渠道/合集管理/本人照片/内容渠道/资料附件（library-panels:88/112/113/114/179/202）、封面资料/构图/尝试记录/候选/历史/模板选择（covers:31/43/47/323/324/340）、模板使用内容弹窗（app:666）、日程明细/提示词/模板组/旧版模板管理（workspace-pages:230/274/421/445）、发布计划/实际历史（publication-panel:83/92）。它们共用既有局部分页规则及新增共享规则；本次在普通页和原生 dialog 均实测。

非 Select 菜单：内容动作与提示词动作沿用 Semi Dropdown，其 menu 自带 4px padding；代表实测两角不命中内容，不改裁剪。模板详情是 `workspace-pages.tsx:419` 的受控 Popover，内容为 `creator-template-detail-body`（18px padding，内部按钮与边缘分离），源码无同类贴边选项背景；保留 overflow auto 与内嵌工作版本 Select portal，未对通用 Popover 加 hidden。日期、时间面板不是选项列表 wrapper，保持原行为。

## 设计规则验收

| 规则 | 结果 |
|---|---|
| Controls-02 | Select 内容边缘随公共 12px 圆角；首末 hover、selected/focused、可搜索、自建及多选检查通过；搜索实际选到末项，原滚动保留。 |
| Surface-01 / Foundation-01 | 复用现有圆角 token、白色承载面与边线，无新增配色或页面布局。 |
| Surface-03 | 原生 dialog 中 popup 保持 top-layer host；Escape 仅关闭当前 Select，dialog 仍打开。 |
| Interaction-03 | CSS 仅限 Select wrapper；未改业务实体、数据、IPC、生成/发布流程。 |
| Acceptance-01 | 红灯/绿灯回归已执行；类型检查及其他完整测试由主线程合并验收另记。 |
| Acceptance-02 | 保存真实 PromptsPage 分类及共享控件各场景截图；源码逐入口覆盖，不替代全业务页面逐个手工验收。 |
| Acceptance-03 | 仅本地 Mac arm64 源码 Electron；未打包、安装或验证其他系统/架构。发行要求引用根 AGENTS.md。 |
