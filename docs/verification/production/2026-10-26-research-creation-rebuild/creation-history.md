# 创作版本与改稿日志验收

2026-10-26。复用原内容库已提交事务中的正文前后字节，不另建正文或版本存储。新增内容查询仅返回当前内容的正文变更；资料字段保存不重复产生正文版本。日期与 revision 来自经校验的事务后元数据，来源标为事务操作，操作者和原因未记录时保持 null 并在界面显示未知。

读取复用核心 transaction 对库身份、对象、before/after、元数据、提交标记和摘要的完整验证。历史 helper 私有，不新增路径读取接口。其他内容及 workspace 的历史正文不会出现在本篇 history 内。当前任务 context 只附本篇版本的改动摘要，省略历史正文全文；每侧摘要最多 300 字符。

固定读取范围为最多 20 条正文版本、250 笔最近归档候选事务、5,000 个已提交目录条目、累计 32 MiB 原始事务、单笔最多 16 MiB、最终 history 响应最多 1 MiB。任一上限导致不完整时 `truncated=true`。候选以归档目录修改时间排序，返回版本再按实际正文 revision 倒序；不是全库完整历史声明。正文全文超过响应预算时前后正文均不返回，以摘要替代并设置 `bodyTruncated=true`，界面不能用局部文本恢复。

恢复选择只作用于旧版正文，明确确认后通过当前内容 token/bodyHash 及已有 productionToken 契约保存为新事务，不重放旧事务、不回滚创作资料 overlay。参考、拆解、叙事、包装、批注等沿用当前资料；正文确认清空。已迁移 overlay 由内容 CAS 保护，无关 workspace 的知识或任务变化不阻塞保存；迁移前旧资料仍校验 workspace token。陈旧内容 CAS 拒绝保存。

## 运行证据

- `node --test plugin-src/src/lib/file-library/test/production-history.test.mjs`：4/4 通过。覆盖本篇隔离、context 摘要、未知来源、不暴露路径、恢复生成新版本与保留最新 overlay、无关知识保全、陈旧内容与 legacy workspace CAS、条数/字节预算及损坏提交标记。
- `node --test plugin-src/src/lib/file-library/test/production.test.mjs workbench/test/production-worker-client.test.mjs workbench/test/production-pages.test.mjs`：20/20 通过。
- `npm run typecheck`（workbench）：native、renderer 均通过。
- `git diff --check`：通过。

## 设计规则

| 规则 ID | 结果与边界 |
|---|---|
| Foundation-01、Foundation-03、Surface-01 | React 历史区域复用现有 Semi Card、Input、Button、正文和辅助文字样式，不新增颜色或字体 token；静态检查通过。 |
| Controls-01 | 恢复先选择再明确确认，忙碌、脏稿、正文预算不足及相同正文时禁用对应动作；取消入口清楚。 |
| Controls-02 | 版本始终支持输入搜索，不因当前条目少关闭搜索；内容按条目 details 展开。 |
| Reading-02 | 完整前后正文使用可聚焦 pre，保留换行；摘要、截断和未知信息明确显示，截断正文无恢复入口。 |
| Interaction-03 | 沿用现有保存及 CAS 链路，原事务保留；没有新增存储真源或任意文件 API。 |

React 部分本轮未重新构建或生成桌面安装包，未声称已完成目标平台系统界面验收。HTML 创作页的版本区与恢复草稿入口由同轮锚点审稿实现者验收，参见同目录的创作页交互证据；桌面最终视觉与打包由主线程统一收敛。
