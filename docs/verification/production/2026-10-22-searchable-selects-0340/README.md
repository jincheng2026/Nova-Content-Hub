# 0.3.40 动态选择器搜索检查（2026-10-22）

用户反馈日历「选择要发布的内容」无法输入搜索，并要求一起检查选项会持续积累的同类入口。本记录为源码和隔离 Electron 验收；最终安装与发行证据由本轮发布记录另行关联。

## 根因与最小改动

1. 日历发布内容已声明 `searchable`，共享 `PopupSelect` 却用 `searchable && options.length > 7` 同时控制输入与虚拟列表。当前五篇内容加占位项未达阈值，因此没有输入框。改为搜索遵守显式 `searchable`，仅超过七项时使用原来的 36px 行高、252px 虚拟视口；短列表保持自然高度。
2. `String(option.label)` 遇到 JSX 文本与数值组成的 children 数组会插入逗号。「模板 079 · v80」完整输入无法匹配。当前调用均为原生 option 的文本/数值 children，映射时用 `Children.toArray(children).join('')` 保持显示与搜索相同的纯文本，不引入通用 ReactNode 解析器。
3. 收藏构图参考原来只有分页，新增本地标题/候选号输入搜索与清空，搜索变化回第一页；勾选集合及请求 payload 不变，失效已选项不受搜索过滤，继续可明确取消。
4. 漏标入口补充 `searchable`：发布计划渠道、模板组工作版本、候选所属封面版本、样张预览模板版本。日历多渠道筛选使用既有 Semi `filter`，加搜索提示、无匹配提示及同一长列表虚拟化阈值。

保留全部选项及原 value、disabled、占位项、onChange、原生 input 草稿事件、CAS 与提交契约。未添加查询状态或随 options 引用变化清空的 effect；Semi 原有关闭行为与 App 的库/内容 key 已能隔离查询。未改此前全局圆角裁剪 CSS。

## 全入口分类

审计 `workbench/src/renderer` 全部 TSX 的 PopupSelect、PopupCreatableSelect、直接 Select、原生 select、Dropdown 与 Pagination。下表源码相对该目录；30 个业务 PopupSelect、一个可创建分类选择器、一个直接多选，共 32 个均列出。直接 wrapper 定义不重复计数。

| 源码 | 字段 | 选项来源及是否增长 | 处理 |
|---|---|---|---|
| `template-workflow-panel.tsx` | 拆解历史 | 用户不断创建的拆解 attempts | 已有 searchable；短名单现在也可输入 |
| `assistant-settings.tsx` | 助手 | 当前正式能力表中两个宿主 | 固定枚举，保留普通选择 |
| `workspace-pages.tsx` | 日历发布渠道多选 | 设置渠道及历史计划的已失效渠道 | 新增输入搜索、空结果提示和长列表虚拟化 |
| `workspace-pages.tsx` | 当天发布状态 | 全部/待发布/已记录/已取消 | 固定枚举 |
| `workspace-pages.tsx` | 选择发布内容 | 未删除、非示例的已保存单篇内容 | 已有 searchable；修复短名单 |
| `workspace-pages.tsx` | 提示词分类筛选 | 配置分类和提示词实际分类的并集 | 已有 searchable；修复短名单 |
| `workspace-pages.tsx` | 提示词状态 | 全部/可用/停用 | 固定枚举 |
| `workspace-pages.tsx` | 提示词收藏 | 全部/只看收藏 | 固定枚举 |
| `workspace-pages.tsx` | 提示词范围 | 正常/回收站 | 固定枚举 |
| `workspace-pages.tsx` | 提示词参考内容 | 内容摘要集合；失效已选值保留禁用项 | 已有 searchable；修复短名单 |
| `workspace-pages.tsx` | 编辑提示词分类 | 已保存分类及当前输入草稿 | PopupCreatableSelect 已可输入；不改创建/IME契约 |
| `workspace-pages.tsx` | 模板来源 | 全部/我的/内置 | 固定枚举 |
| `workspace-pages.tsx` | 模板组工作版本 | 来源组内不断增加的工作副本 members | 新增 searchable |
| `workspace-pages.tsx` | 模板管理当前版本 | 单个模板累积的 versions | 已有 searchable；修复完整名称/版本文字搜索 |
| `publication-panel.tsx` | 发布计划状态 | 全部/待发布/已记录/已取消 | 固定枚举 |
| `publication-panel.tsx` | 时间精度 | 日期/当地分钟/UTC明确时刻 | 固定枚举 |
| `publication-panel.tsx` | 发布渠道 | 用户配置的可用渠道及已选停用项 | 新增 searchable；停用语义保留 |
| `publication-panel.tsx` | 计划/实际发布封面 | 内容累积的 candidates 与 coverVariants | 已有 searchable；完整候选号/收藏/构图比例可检索 |
| `content-list.tsx` | 内容范围 | 正常/回收站 | 固定枚举 |
| `content-list.tsx` | 内容状态 | 当前业务阶段/收藏等固定状态 | 固定枚举 |
| `content-list.tsx` | 内容列表排序 | 最近更新/名称/计划时间 | 固定枚举 |
| `covers.tsx` | 封面比例 | 三个默认比例 + settings.customRatios + 当前值 | 用户可持续增加自定义比例，保留已有 searchable |
| `covers.tsx` | 本人照片 | 本人可用照片资产列表及失效已选项 | 已有 searchable；短名单现在也可输入 |
| `covers.tsx` | 候选所属封面版本 | 内容累积的 coverVariants | 新增 searchable |
| `covers.tsx` | 样张预览模板版本 | 预览源组内不断增加的版本 members | 新增 searchable |
| `library-panels.tsx` | 合集成员筛选 | 全部/已选/未选 | 三态固定；真正成员内容已有独立标题/正文搜索与分页 |
| `library-panels.tsx` | 合集成员排序 | 更新/名称 | 固定枚举 |
| `library-panels.tsx` | 资料管理列表排序 | 更新/名称 | 固定枚举 |
| `library-panels.tsx` | 默认人物参考 | 已导入本人可用照片及失效默认项 | 已有 searchable；修复短名单 |
| `library-panels.tsx` | 默认模板 | 未删除的用户模板 | 已有 searchable；完整名称与版本现在可检索 |
| `library-panels.tsx` | 内容默认模板 | 内容可用模板列表及当前失效引用 | 已有 searchable；修复短名单 |
| `library-panels.tsx` | 附件角色 | 项目约定的正文/参考等有限角色 | 固定枚举 |

分页内置 Select 的 pageSizeOpts 是有限固定数字，不增加搜索。内容/提示词 Dropdown 为固定动作菜单；模板详情 Popover 是内容面板，内部工作版本已列入。渠道归档、合集成员、资料附件和模板浏览已有名称/正文搜索与分页；收藏构图参考是这次额外补齐的累积图片选择列表。候选/尝试/发布历史为结果阅读列表，本次不扩展只读历史查询功能。没有发现原生 `<select>` 绕过本封装。

## 可复现验收

- 红灯：`SEARCH_SELECT_EXPECT_RED=1 node workbench/scripts/searchable-selects-ui-probe.mjs` 在五篇内容真实 Calendar 弹窗断言 `explicit searchable Calendar contents must accept input even with only five saved contents` 失败；见 `red-calendar.log`、`before-calendar-short.png`。
- 第二处红灯：先启用搜索再运行相同 probe，实际 DefaultsForm 的「模板 079 · v80」完整输入没有匹配；见 `red-display-label.log`。
- 绿灯：`node workbench/scripts/searchable-selects-ui-probe.mjs` 通过；见 `green.log`、`after.json`。
- 收藏构图红灯：`node workbench/scripts/cover-composition-ui-probe.mjs` 新断言 `accumulating composition references need a search input` 修复前失败，见 `red-composition.log`；修复后完整既有脚本通过，见 `green-composition.log`。复用 25 个合成收藏来源，按来源标题/候选号找到末项、跨搜索保留三项、清空/无匹配、失效已选项与不匹配查询同时存在仍可取消；既有附件重试/去重/CAS/失效/图像错误检查继续通过。旧 fixture 补齐 `currentVersion:1` 与资产版本对应，没有放松产品版本校验。
- 既有自建分类：`node workbench/scripts/semi-creatable-ui-probe.mjs` 通过，包含实际 PromptEditor 的已有分类/自建中文、取消草稿、Enter 无隐式提交、合成 IME 与 busy。见 `green-creatable.log`。
- 类型：`npm --prefix workbench run typecheck:renderer` 通过；`git diff --check` 通过。主线程将独立复跑本 probe、圆角 probe 与全桌面类型检查，并关联最终冻结提交。

真实源码页使用合成内存 DTO：Calendar、PromptsPage、LibraryPanels/DefaultsForm、PublicationEditor。五篇内容可输入，短弹层实测 224px；350 篇内容与 350 渠道保持有界虚拟 DOM，精确命中末项。80 个分类、照片、默认模板、发布渠道、80 个候选与 80 个构图检索正确。覆盖无结果、清空恢复、输入不等于选择、选择正确 ID、无结果保留已选 ID、弹层关闭后查询清空、页面切换无查询串用、已停用引用保持 disabled、busy 禁止打开。搜索/选择操作未调用原生 API；实际 PublicationEditor 使用 Down + Enter 选中候选，确认只更新选择、不触发表单保存；首个 Escape 只关闭下拉。App 库级 `libraryEpoch` 与内容级 `${libraryEpoch}:${base.id}` key 通过源码核对；本 probe 对相同 remount 行为做代表验证，未在完整 App 中切换真实库。

收藏构图截图 `composition-search-last-reference.png`、`composition-search-no-match-retained.png`、`composition-search-invalid-retained.png` 来自真实 CoverPanel，窗口 1280×860。

截图为真实源码 Electron 内容区域：`after-calendar-short.png`、`after-calendar-large-last.png`、`after-prompt-no-match.png`、`after-defaults-selected.png`、`after-cover-no-match-retained.png`。窗口配置 1280×1000；PNG 根据当前 Retina 比例生成。不是产品库数据或重绘稿。

## 设计规则与范围

| 规则 | 验收结果 |
|---|---|
| Controls-02 | 动态数据显式可搜索，短名单不隐藏输入；长名单独立虚拟化，不截断数据；完整显示文字可检索，保留选中/禁用/空值行为。 |
| Surface-01 / Foundation-01 | 使用已有 Semi 控件与变量，无新色彩/布局；Select wrapper 保持 12px/hidden。 |
| Surface-03 | 原生 dialog 内沿用 popup host；首个 Escape 只关闭当前 Select，dialog 保持打开。 |
| Interaction-03 | 未改变库结构、IPC、实体、发布/生成逻辑；未加入依赖或远程获取。 |
| Acceptance-01 | 两处实际红灯与修复后绿灯已运行，记录必要检查。 |
| Acceptance-02 | 保存真实业务弹窗与代表页截图；为全入口源码审计加代表场景运行验证，未声称每个业务入口都逐一人工点击。 |
| Acceptance-03 | 仅本地 darwin-arm64 Electron 44.9.0 源码；独立临时 userData；未操作安装版或真实内容库。 |

未在此项验收安装包、正式签名/公证、Intel Mac、Windows、浏览器或物理中文输入法；本项不替代最终 0.3.40 Apple Silicon Mac 预览包安装/Finder 检查。
