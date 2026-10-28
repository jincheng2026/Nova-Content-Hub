# U4 账号、报告管理与注册正文检索

2026-10-28。只使用测试临时库、注入回调和真实 native Desktop/worker；没有操作工作台 GUI、真实内容库、网络或付费服务，没有打包。本目录记录源码行为验收；真实页面由 Root 后续单独验收。

## 已接通

- 账号、报告页面右上「管理与回收」接现有记录、snapshot token 和原生 mutation。正常/回收区独立过滤后 20/50/100 分页，危险操作确认，错误保留输入，收起保留及明确放弃草稿。来源投影、雷达和任务原报告由 native 权限判定禁止普通编辑、回收或恢复。
- 报告编辑保留多账号、未知 metadata 和 Markdown 原文；HTML 只显式替换选定页，其他页 id/hash/顺序/当前阅读页不变。回收和恢复不删除共用账号、报告、图片或正文资产。原关联账号/报告已回收时可保留原关联，不能新建指向回收对象的关联。
- searchProductionReports 已经 controller → utility worker 接通。搜索当前库注册报告的标题、关联账号名、已核验正文；类型/起始日期/正常与回收范围先过滤，再逐批最多 20 页、8 MiB/页读取。日期沿用采集时间，缺失时用创建时间。保留真实相对 HTML 页和附件的现有导航，未改写报告原件。
- 游标为内存 opaque token，绑定物理库 identity、快照、查询、类型、日期和范围；缓存以注册页 hash 失效，重新查询仍重读核验 bytes。换查询、源变化与切库废弃旧结果。HTML 由 xmldom/PostCSS/inline-style-parser 静态解析，不执行脚本、不读未注册附件/任意 metadata；script/style/template/hidden 内容不命中。复杂或条件可见性、外部样式等不能核验的页面明确返回 partial，不能冒充完整检索。
- 页面显示命中片段、待查/不可读页数及具体原因。继续批次和重试失败页都是显式按钮，没有自动失败游标重试循环；partial 时不显示「没有匹配报告」。

## 跨物理库 scope 修复

测试实际复制两个独立物理路径，库 id、记录 id、workspace 字节及 editToken 相同。旧版不带 scope 的 trashReport 实际写入了后来选中的物理副本（RED）。现在六项账号/报告 save/trash/restore 都要求 readProduction 给出的 libraryScope；controller 在当前操作锁内用 native binding 重算，匹配后只将原 domain input 交给持久 mutation。旧六项无 scope 通用入口也拒绝，不能绕过；原 pending 继续使用自身绑定的库/根 identity 恢复。异库旧 scope 拒绝且不产生 pending/磁盘写入（GREEN）。其它非 U4 manual 操作兼容保留。

## 验证记录

- `targeted-tests.log`：94/94。临时库 lifecycle、search 纯函数/native worker、真实 Desktop/preload/恢复/同 token 异物理库、真实 hook、管理组件、真实 workspace 接线/分页、manual report，以及 production/radar/content-creation 兼容回归。
- `lifecycle-linked.log`：6/6，含实际注册的 linked 外部账号/HTML 报告四个生命周期入口全部拒绝，原件字节不变。
- `relative-navigation.log`：11/11 现有报告相对链接专项，含同报告、跨报告和注册附件边界。
- `avatar-scope-validation.log`：1/1，补 scope 后仍精确验证 avatar hash/type。
- `typecheck-native.log`、`typecheck-renderer.log`：两项 tsc exit 0，空日志。

## 设计规则结果

| 规则 | 本轮结果 |
| --- | --- |
| Controls-01/02 | 复用 Semi 按钮、日期和枚举选择器、现有 DataTable/PaginationBar；正常/回收、失败/忙碌和危险确认有行为测试。 |
| Reading-02/03 | 多页报告和完整 metadata 仍可展开；Markdown 原文编辑保留空格换行；全库过滤后分页，末页可达。 |
| Surface-03 | 移除重复页面 h1，保留原操作；未增加原来源卡。沿用页面/弹窗/列表现有样式，没有新增来源数据真源。 |
| Acceptance-01 | 类型与上述行为验证通过。 |
| Acceptance-02 | 本执行代理未做 GUI、viewport、键盘焦点、窄窗口或截图验收，交 Root。静态/注入测试不等于视觉通过。 |

源码阶段：native 查询与权限 `6be0c8d`；生产 core、restoreReport、scope controller/worker 薄片由唯一负责人 J 提交 `6676cc6`。本目录及 UI/contracts/tests 为后续精确提交；未声明任何平台安装或交付包验收。

## 审查后窄修

- 检索失败页重试：21 页首次全部失败后，只恢复第 21 页，原算法重复前 20 页导致饥饿。`9ca004d` 将失败项移至队尾，保持每批最多 20 页，续查能访问恢复页并保留其他失败原因；search/worker/hook 19/19。
- 正文模式：任意 `meta.manualMarkdown` 曾可诱使 HTML 编辑器在只改标题时提交 Markdown，导致两页报告缩成一页。现在 native 权限结果只在可编辑、单注册页、原存标题渲染的 Markdown hash 等于当前注册 assetHash 时给出 `verifiedMarkdown`；UI 只信此独立结果。陈旧 metadata 仍原样保留，未核验报告继续提交完整 HTML pages/pageId。新测试覆盖一页 hash 不符与两页陈旧 metadata，以及真实手写 Markdown。core/manager/search 31/31、Desktop/workspace/worker 33/33，两端 tsc 0。
