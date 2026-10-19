# Semi 列表规范与提示词收藏

日期：2026-10-19；候选版本：0.3.23。此页记录实现约束，验收结果在完成后补记。

## 范围与参考

用户明确要求旅游营销工作台只作为信息排列和业务衔接的参考，实际组件统一采用已安装的 Semi UI。通过原生界面只读查看了月周日历、当天清单、具体活动发布安排以及总览的本周、下一条、今天与明天、待办和项目入口；未触发参考工作台的发布勾选、文案生成或业务写入。

采用选日后时间、渠道、标题与操作同行的排列，以及从总览和封面直接进入具体发布安排的路径。计划与实际发布仍分别保存；确认记录、更正与撤销保留现有事实链。合集继续只聚合单篇内容。

组件接口依据官方文档和本仓库实际安装版本的类型定义：

- [Semi Table](https://semi.design/zh-CN/show/table)：结构化管理数据、稳定行主键和受控分页。
- [Semi Pagination](https://semi.design/zh-CN/navigation/pagination)：继续使用现有 PaginationBar 的 Semi 分页及键盘适配。
- [Semi List](https://semi.design/zh-CN/show/list)：图片、封面和少量总览队列的浏览排列。

## 可复用列表

工具栏统一受控搜索、Select 筛选和操作区；筛选含义由业务页决定。结构化列表使用 Semi Table，当前页数据只切片一次，表格内置分页关闭，由统一分页组件接收总数、当前页和每页数量。图片类列表使用 Semi List/Card，仍复用工具栏和分页。

覆盖提示词、内容及合集内容、合集成员、渠道等内容库结构列表、当天发布安排、单篇计划和历史；图库、资料与工作流记录按数据含义使用列表或表格。筛选、空结果、忙碌禁用、恢复入口、排序和跨页成员选择保持业务语义。

成员草稿保存完整 ID 集合，当前页选择只能对当前项作增删，不能用当前页 selectedRowKeys 覆盖全量集合。隐藏或失效成员不能无声丢弃。历史文字和图片仅在展开对应记录后挂载；分页限制实际 DOM 数量，不能只把全量行隐藏。

## 提示词收藏

收藏属于内容库数据，使用可选布尔 metadata 字段；缺失按未收藏展示。旧库首次读取不写回、不改变 token，不提升库或提示词格式版本。新增提示词默认未收藏，正文编辑、启停、回收、恢复保留已有收藏。

专用 setPromptFavorite 命令严格校验布尔、沿用 CAS 和 mutationId，不能通过旧编辑表单覆盖收藏。摘要和完整库两条 DTO 投影均给出布尔值。收藏随原文件备份恢复，无本机侧表。已收藏筛选内取消收藏时，该行离开结果，页码钳制到有效范围；收藏不绕过停用和回收限制。

## 验收要求

分别验证旧文件字节不变、收藏重开持久化、编辑和回收恢复保留、备份往返、陈旧 token 与非法输入拒绝，以及真实 renderer → preload → IPC → worker → 文件库写入。UI 验证搜索、筛选、分页、跨页勾选、键盘操作、宽窄布局和空结果。大样本合成 DTO 验证只支持渲染与交互结论，真实文件读取和安装包验收单独记录。

### 已完成的数据层验证

数据层提交 `8098e2b`，主线程检查实际 diff 后提交。旧 schema 1/2 的字段缺省、原文件与 token 不变、收藏 true/false 重开、正文编辑、启停、回收恢复、备份往返、陈旧 CAS、重复 mutationId 及非法输入都在真实隔离库验证。

- `node --test plugin-src/src/lib/file-library/test/prompt-favorite.test.mjs plugin-src/src/lib/file-library/test/business.test.mjs plugin-src/src/lib/file-library/test/model-v5.test.mjs`：93/93 通过。
- `node --test workbench/test/prompt-favorite.test.mjs workbench/test/workspace.test.mjs workbench/test/collection-rename.test.mjs`：12/12 通过。
- `npm run typecheck:native --prefix workbench`：通过。

上述证明核心文件库和 worker 边界，不代表星标 UI、最终安装包或用户库的安装验收。
