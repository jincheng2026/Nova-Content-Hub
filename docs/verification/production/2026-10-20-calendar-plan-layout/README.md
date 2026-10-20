# 日程发布计划布局与分页核验（2026-10-20）

基于源码 HEAD `7d1eb85` 的局部修改；冻结 0.3.30 安装产物未在本项工作中修改或安装。

## 真实复现与改动

独立合成 React/Semi/Electron fixture：两篇相似标题内容、一份合集，复用相同发布文案，共 121 条计划；单份内容 107 条计划及 107 条历史。独立 Electron userData，native bridge 为禁止调用的合成实现。

先运行专属 probe，20/50/100 分页与筛选检查均通过，随后标题断言失败：期待来源标题 `春日散步 · 西湖篇`，实际只有 `相同发布文案`。见 `calendar-pagination-red.log` 和 `calendar-pagination-before.png`。两条数据、每页 100 时没有上一页，并非截断证据；本次未复现全量数据被 100 条截断。

修改日程下方列表：时间、渠道、内容标题/发布文案、状态、操作五列对齐；内容标题为主行，发布文案为次行，内容/合集独立标签。只有点击详情才挂载发布管理，记录发布仍需用户明确确认；不自动发帖。Busy 或记录弹窗存在时禁用筛选。没有修改共享分页算法和存储接口。

## 全部共享分页调用点静态检查

| 文件 | 列表 | 检查结果 |
| --- | --- | --- |
| `content-list.tsx` | 内容、组内内容、合集 | 完整筛选排序后的 `items.length` / `collections.length` 为 total，独立 slice 渲染 |
| `library-panels.tsx` | 合集成员、照片、渠道、合集管理、适用渠道、内容附件 | total 来自完整过滤集；管理列表依 tab 选择 total 和容量；不存在 slice 后 total |
| `covers.tsx` | 参考资料、生成尝试、封面候选、生成记录、模板组 | 候选 total 汇总所有组的候选数量，再按 offset 跨组切片；其他为完整过滤集/历史长度 |
| `workspace-pages.tsx` | 当天安排、提示词、模板、模板管理 | 完整过滤集 total 后分页；总览今日/明日仅预览前 5/10 条，并有“查看全部”入口 |
| `publication-panel.tsx` | 计划、实际发布历史 | 完整筛选集 total 后分页；focus 按完整排序集定位 |
| `app.tsx` | 模板使用内容选择 | 完整 `templateContents.length`，slice 只影响可见行 |
| `list-primitives.tsx` / `pagination-bar.tsx` | 共享组件 | DataTable 关闭 Semi Table 自带分页，只使用独立 PaginationBar；0/1 页隐藏多页控制但保留容量选择；20/50/100 容量切换重置第一页，多页显示页码/前后页/跳转 |

`workspace-controller.mts`、`controller.mts` 读接口未带 100 条限制，`workspace-worker.mts` 映射完整文档、plans/publications 数组。本表为代码路径审查，不代表每个业务列表都已通过真实库运行。

## 执行验证

- `NOVA_PROBE_EVIDENCE_DIR=docs/verification/production/2026-10-20-calendar-plan-layout node workbench/scripts/calendar-pagination-ui-probe.mjs`：通过。
  - 121 条计划在每页 20/50/100 时逐页点到最后 `plan-120`，再点上一页，核对实际行与总数。
  - 101 条每页 100 的第二页唯一行 `plan-100` 可达；末页改容量返回第一页。
  - 搜索跨文档、渠道筛选、取消状态筛选、清空无结果后恢复；过滤后总量、页码均正确。
  - 0/1 条容量可切换且无无效跳页输入；busy 分页与容量禁用。
  - 计划和历史各 107 条，容量 100 时次页 7 条、上一页 100 条。
  - 显式 focus 一次定位后手动分页不重放旧 focus，viewport 不被 scrollIntoView 拉回。
  - 1440/1100/760/560 布局无横向页面溢出；三份相似标题和合集、待发布/已记录同屏证据：`calendar-pagination/daily-distinct-documents.png`。
  - 无 native bridge 调用，最终合成数据未被修改。
- `node workbench/scripts/daily-publication-ui-probe.mjs`：通过，原三精度/时区、空文案、发布记录、更正历史、最小化草稿保护、刷新/回收/CAS、10k DTO 深分页 focus、1280/560 布局回归。
- `node workbench/scripts/semi-calendar-ui-probe.mjs`：通过，24 个滚动稳定样本；小日期面板浏览与选择分离、跨月/周选择、周末计算背景一致、普通日期不滚动、显式全部/详情仍导航、刷新不重放旧 focus。
- `node --test workbench/test/daily-publication-wiring.test.mjs workbench/test/publication-model.test.mjs`：7/7 通过。
- `npm --prefix workbench run typecheck:renderer`：通过。

## 验证边界

本项为源码及隔离 Electron 合成 DTO 验证，未操作用户真实内容库、实际已安装应用、原生平台发布、安装升级或冻结包。没有用本机验证结果宣称 Intel Mac/Windows 通过。未重跑整个 313 项测试集；由主线程在汇总后统一验证。

## 补充：截图 1 展开的 PublicationPanel 本体

截图 1 对应的是展开的文档发布管理面板，并非仅日历下方跨文档的当天列表。本次同时调整该面板的 `publication-panel.tsx` 和 `publication-workspace.css`：

- 面板顶部明确显示内容/合集类型与所属文档标题，行内以每条发布文案为主，不重复同一文档标题。
- 桌面五列为时间/日期、渠道、发布文案、状态、操作。时间在上、日期在下，只有日期的计划保留“时间待定”。
- 长文案可显示两行，次行提示是正文、独立文案或空文字；完整文字仍在计划详情中。
- 状态与操作使用固定列宽，“记录已发布/查看记录”和“计划详情”统一放在操作列，避免详情按钮漂到新行左侧。
- 窄屏保留时间、渠道、状态上行及文案、操作下行；busy 或记录弹窗打开时搜索和状态筛选禁用。

先对旧面板运行新断言得到 0 个表头、预期 5 个的失败（`publication-panel-red.log` / `publication-panel-before.png`），修改后同一 probe 通过（`publication-panel-green.log`）。保留 107 条计划与 107 条历史的真实跨页检查；新增短/长文案、时间待定、待发布/已记录状态、完整详情、busy/dialog guards 和合集归属检查。

实际查看并核对了 `calendar-pagination/publication-panel-1440.png` 与 `publication-panel-560.png`；另有 1100/760 及合集截图。它们直接覆盖截图 1 对应的面板，而 `daily-distinct-documents.png` 覆盖日历下方跨文档当天列表。

与旅游日列表的适配区别：保留时间、渠道、标题、状态、操作的扫描顺序；本项目跨文档列表显示内容/合集身份，单文档面板显示该文档的各渠道发布文案；操作是本机计划、准备资料、记录实际发布与保留历史，不连接平台自动发帖。

补充验证：renderer typecheck、相关 7 项 node tests、局部 diff 空白检查通过。再次执行旧 daily-publication probe 验证原记录/历史/focus/三精度/CAS 草稿语义（日志见 `publication-panel-daily-regression.log`）。
