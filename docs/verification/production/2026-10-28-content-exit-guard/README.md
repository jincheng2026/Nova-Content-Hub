# 内容详情退出守卫恢复验收（2026-10-28）

## 已安装现场与源码状态

- 主线程在用户已安装的旧版本现场检查 T051：空正文 0 B；辅助区有“已有同环节原任务；这次填写已保留，请在原助手聊天补充”提示，没有可见输入框。
- 主线程点击原“共创口播稿”后重新看到了 `note` 中的“怎么做自媒体”，先备份至 `/Users/mac/.codex/recovery-drafts/nova-content-hub/2026-10-28-T051.txt`，然后明确清空、暂时收起并返回内容项目列表。旧版本现场恢复成功由主线程 AX 核实。
- 以下源码修复只通过隔离 fixture 验证；没有打包、安装、提交，也没有改动用户内容库。当前安装应用尚不包含本次源码修复。

## 根因与修复边界

`JinchengStageActions.start` 找到原任务后，旧逻辑 `setSelected(null)` 隐藏填写弹窗，但保留 `note` / `researchTarget` / `synthesisQuestion`，因此真实 `useManagedDraftGuard` 仍注册脏草稿。`WorkDetail.auxiliaryAction` 与 `App.guard` 随后正确阻止切换，却没有专门的可见填写恢复条。旧清空按钮只在 `note` 非空时出现，而且只清空 `note`，单独填写目标或综合调研问题时无法使用该入口清空。未修改的默认用途、时间、范围不参与脏状态，初始加载没有误注册；收起的详情工具原本不会挂载这些子组件。

本次仅修改 `jincheng-stage-actions.tsx`：有未交付输入时打开原任务后保留弹窗；暂时收起后在 `details` 外提供继续和明确清空入口，记住最近选择的动作；清空统一处理三个受保护字段。保留全局退出守卫、详情切换守卫和原任务去重逻辑；正常新任务启动成功仍清空已交付字段，失败继续保留输入。

## 验证结果

- 红测：在修改实现前建立组件行为回归，原始 5 例为 1 通过、4 失败；完善 fixture 与单字段用例后，以逆向精确替换重建的起始源码快照运行最终 7 例为 1 通过、6 失败。未回退工作树源码。
- 绿测：`node --test test/jincheng-stage-actions.test.mjs test/jincheng-stage-draft-recovery.test.mjs test/jincheng-work-detail-references.test.mjs test/jincheng-detail-pagination.test.mjs test/jincheng-checkpoints.test.mjs`：19/19 通过，其中新增 7 例。
- `npm run typecheck`（workbench）：native 与 renderer 均退出 0。
- `git diff --check -- workbench/src/renderer/jincheng-stage-actions.tsx workbench/test/jincheng-stage-draft-recovery.test.mjs`：退出 0。
- 隔离 harness 执行真实组件回调、`useManagedDraftGuard` 注册/清理、`ManagedCloseBoundary.flush` 与详情辅助操作守卫。仅替换 hooks 调度、无 DOM 控件、IPC；不宣称等同 Electron 原生交互验收。
- 覆盖：未修改初值；新任务成功；已有原任务保留输入且不重复创建；收起后恢复；清空三个受保护字段；单独目标/问题填写；失败保留；详情有真实草稿时继续阻止切换，明确清空后可收起；恢复按钮祖先不含 `details`。

## 设计标准规则 ID

| 规则 | 结果 |
| --- | --- |
| Surface-03 | 原弹窗与关闭契约保留；收起后的输入有可见恢复入口，原任务路径不隐藏尚未处理的输入。组件行为通过。原生焦点、Esc 与窄窗视觉未重新验收。 |
| Controls-01 | 新入口使用既有 Semi Button 和 busy/working 禁用状态，复用现有 management-resume 样式。未添加依赖或另建控件。源码检查通过；未声称新界面截图验收。 |
| Interaction-03 | 仅修复阶段填写的恢复/清空流程；不改实体、库结构、IPC、生成或发布规则。 |
| Acceptance-01 | 类型检查与相关 19 项测试通过；非平凡恢复流程包含真实组件调用链回归。 |
| Acceptance-02 | 新恢复条未做隔离页面截图或视觉验收。已安装旧版本现场恢复属于独立证据，不能当源码修复的视觉通过。 |
| Acceptance-03 | 当前仅源码与隔离测试通过；未构建安装包、未安装、未进行新源码原生运行或跨平台验收。打包要求遵守根 AGENTS.md。 |

## 审查定位

本次实现文件在任务开始前已有其他未提交修改。单独源码差异与新增测试见 `/tmp/nova-exit-guard-fix.patch`；起始实现快照为 `/tmp/nova-exit-guard-stage-actions-before.tsx`，由逆向本次精确替换重建。验收记录是本次新增文件。工作树既有修改均保留。
