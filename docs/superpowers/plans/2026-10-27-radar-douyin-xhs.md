# 抖音与小红书真实多平台雷达实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 本次由唯一执行代理写入下述文件，主线程审真实diff；不另开写入代理。

**Goal:** 一次冻结请求自动搜索抖音与小红书，合计限制请求/候选，来源与缺指标如实保留。

**Architecture:** 共享无Node依赖的 `radar-policy.mjs` 统一能力、预算和候选份额，domain重导出供native使用。collector先按平台分别搜索，再按确定份额选择候选，剩余预算才补资料；broker通过持久化的对应search作者名单限制profile。其他平台继续明确为手工来源。

**Tech Stack:** 现有ESM文件库、Electron broker、React/Semi、node:test，不增加依赖。

**Spec:** 当前用户“可一次选择多个平台采集”与主线程2026-10-27明确授权；UI遵守 `docs/design/内容工作台设计标准.md`。

## Global Constraints

- 用户真实预算/comments保持OFF，key不输出；测试仅临时副本开启必要许可。
- 总请求≤4、全平台候选合计≤sampleLimit；首屏每平台一次，不采评论、不翻页、不重试。
- 本次追加外部HTTP最多2次，仅两平台search；不补profile，缺粉丝保留null/待核验。
- 已完成8项真实响应的cache已删除，现只留脱敏fixture；不可宣称存在可复用原始cache。
- 不改launcher/desktop/app。主线程唯一修改controller预算和XHS评论冻结条件，并打包新pair .56。

## Task 1: 共享策略与XHS归一化

**Files:** 新增 `plugin-src/src/lib/file-library/radar-policy.mjs` / `.d.mts`；修改 `radar.mjs` / `.d.mts`；测试 `plugin-src/src/lib/file-library/test/radar.test.mjs`。

**Interfaces:** `radarOperations(platform)` 映射dy-search/profile与xhs-search/xhs-profile；`radarRequestLimit(query,currentMax=4)` 返回 `min(4,有非零样本份额的自动平台数+sampleLimit,currentMax)`；`radarPlatformSampleLimit(query,platform)` 以自动平台顺序均分全局sampleLimit、余数归前项。`xhsRows`、`xhsProfileFollowers`、`normalizeXhsRadar` 只提取实测结构。

- [x] 使用本次真实XHS脱敏fixture写红测：note位于data.data.items[].note；数字互动、timestamp、user.userid；资料fans；缺字段保持null。
- [x] 写全局份额、单/双平台预算及不支持平台的红测。
- [x] 实现策略与normalizer；运行 `node --test plugin-src/src/lib/file-library/test/radar.test.mjs`。

## Task 2: collector与broker授权

**Files:** `radar-collector.mjs`、`workbench/src/main/production-services.mts`、`workbench/test/radar-desktop.test.mjs`。

**Interfaces:** collector先搜索所有预算可覆盖的自动平台；按份额限候选；补资料仅限对应平台、缺粉丝且有真实ID的作者。collection保留manualPlatforms、未搜索平台/资料缺口与partial。broker从每个search实际返回的限定份额中持久化允许作者IDs，profile按operation绑定对应search，不跨平台借用ID。

- [x] 红测真实fixtures驱动双search、maxRequests2、全局候选2，且不补profile、不生成粉丝。
- [x] 红测任意/跨平台profile作者被拒、允许名单重启后保留、所有平台共享预算与重复操作限制。
- [x] 实现collector与broker；执行上述domain测试及 `node --test workbench/test/radar-desktop.test.mjs`。
- [x] 主线程controller导入domain重导出的radarRequestLimit；XHS账号comments必须false。

## Task 3: 平台能力、UI与技能

**Files:** `workbench/src/shared/platform-catalog.ts`、`workbench/src/renderer/radar-workspace.tsx`、`plugin-src/skills/nova-content-research-execution/references/viral-radar.md`、对应catalog/UI/skill测试。

- [x] 更新平台能力为douyin/xiaohongshu/manual，账号分析不将XHS映射为抖音。
- [x] UI读取共享策略，明确自动支持两平台、其他平台手工、全局候选/预算与资料待核验。
- [x] 技能以helper固定请求为准，说明均分份额、全局预算、缺粉丝/时间/来源不编造和不采评论。
- [x] 检查Foundation/Controls/Reading对应规则；运行原生+renderer类型检查及相关现有测试。

## Task 4: 最终真实双平台联调与冻结

**Files:** 只增诊断脚本及 `docs/verification/2026-10-27-live-services` 证据。

- [x] 隔离临时库，当前已匹配加密Key；一次真实radar任务冻结抖音+XHS、sampleLimit2、预算2。
- [x] 仅调用两次search，真实broker预留结算、submit/receipt/accept/adopt/归档；不发profile。
- [x] 记录每个平台真实来源与缺粉丝字段；无合格候选亦是有效结果。HTTP总数与原设置受保护字段核对。
- [ ] 主线程审diff、测试及证据后freeze，打包新pair .56；不在执行代理提交或安装旧pair。

实际收敛：前3任务及最后真实双search均已完成；主线程增量审策略/broker后执行，HTTP2次/总10、submit/accept/adopt/archive成功、原设置hash不变。最终source freeze待本轮测试日志完成后通知，pair .56的构建安装由主线程负责，不以本计划勾选表示跨平台交付已完成。
