# 作者安排端到端接线核验

2026-10-28，源码验证；未操作真实内容库、GUI、模型或付费服务，未构建发行包。平台交付要求沿用根 AGENTS.md，本记录不证明已安装或跨平台通过。

作者安排支持待做、暂缓、已写，以及清除本人覆盖后按来源推导。目录卡片和列表使用同一原生字段，筛选明确为“筛选作者安排”。已发布分类仍由真实事实优先决定；“本人标记已写”不产生正文、录制、发布或阶段完成事实。

## 持久化与边界

- `作者安排.json` 只在 `05_内容草稿/(已做/)?T编号_目录/` 的准确受管位置有效；普通扫描和来源目录排除该受管路径。普通同名 JSON 仍可作为资料。路径门禁兼顾 Windows 分隔符。
- 普通保存、回收和恢复不能操作受管记录；原生回执应用和恢复必须通过 `validateAuthorPlanningReceipt` 的固定请求、根身份、T、正文、历史及结果校验。
- 写入口沿用 `vaultPending`、持久 mutationId、原有锁和 CAS；native scope 在持久化意图之前核对当前库物理身份。领域写入重新核验来源 pins，不信批量缓存。
- WorkDirectory 一次读取批量作者安排再按 contentId 映射，错误返回明确 issue。批量调用共享一次 scan/contentSources、目录与历史回执索引、来源验真结果；核心 contentSources 内部的 overview 读取仍为线性次数，不宣称底层仅读取一次。
- 来源改变保留上次决定并标为待核对；读取失败不会变为待做。原文、稿件、录制、正式发布档案和阶段文件不会被作者安排写入改动。

## 界面规则

| 规则 | 当前证据与边界 |
|---|---|
| Controls-01/02 | 固定枚举使用既有 Semi 控件；只有显式保存提交，取消不写。有限枚举无需搜索。组件测试覆盖保存、失败、旧版本确认和切换身份。 |
| Controls-03 / Foundation-04 | 卡片状态使用 native 值；未知/失效显示待核对。卡片只留状态和短操作，稿件、录制、发布事实放在编辑层中，不以颜色代替文字。 |
| Surface-03 | 复用 ManagementDialog；编辑与说明驻留在独立弹层，目录筛选或来源刷新不会因行隐藏而丢掉填写；dirty/busy 交给既有保护。实际焦点、Esc 和窄窗验收待 Root 的统一 GUI 轮次。 |
| Reading-02 | 来源路径可换行、完整保留，复用 PagedItems 紧凑分页；不把全部 pins 固定堆在弹层内。 |
| Acceptance-01 | 本轮定向测试 98/98，通过完整 native/renderer TypeScript 检查；安全门禁先观察失败再实现。 |
| Acceptance-02/03 | 本轮禁止 GUI，因此没有新增真实页面截图；Electron 页面视觉、实际键盘和各 OS/架构设备行为留待后续验收。 |

## 验证

实际临时库验证包括批量/单读相等、一次快照和回执索引、单条坏记录隔离、孤立受管文件不产生幽灵 T、CAS 与 source pins、失响应后重开核验恢复、来源变化后恢复、普通路径绕过拒绝、准确同名路径兼容，以及原 U1/U2/选题事实回归。

运行日志已归档为本目录 `integration-tests.log` 与 `typecheck.log`，原临时路径保留。

```sh
node --test plugin-src/src/lib/vault/test/author-planning.test.mjs plugin-src/src/lib/vault/test/source-map.test.mjs plugin-src/src/lib/vault/test/document-trash.test.mjs plugin-src/src/lib/vault/test/topic-status.test.mjs workbench/test/author-planning-desktop.test.mjs workbench/test/author-planning-status.test.mjs workbench/test/content-directory-pagination.test.mjs workbench/test/content-directory-loading.test.mjs workbench/test/content-directory-navigation-state.test.mjs workbench/test/vault-topic-status.test.mjs workbench/test/vault-conflict-closeout.test.mjs workbench/test/boundaries.test.mjs
npm run typecheck --prefix workbench
```
