# 爆款雷达多平台与自定义筛选验收

范围：平台可多选；粉丝上限、点赞下限、赞粉比、发布天数、采样上限均可手工输入。发布天数为 1–3650 的整数；样本为全部平台合计 1–100 条上限，不承诺返回数量。自动采集仅抖音首屏，最多 4 次请求，同时受最新服务预算和任务冻结预算限制；其他平台保留人工来源与缺口。

契约保留旧单 `platform` 任务（包括旧版本允许的首尾空格）；新任务增加 `platforms`，首项与 `platform` 一致。来源键按真实平台与 sourceId 生成，收录时校验冻结平台数组、候选平台、合计数量与回执。相同 sourceId 在抖音和小红书不会混同。

## 代码与行为

- 全部 18 项雷达插件/桌面测试通过；之后修复旧冻结 platform 空格兼容并补回归，重跑 5 项多平台/旧任务重点测试均通过。
- `npm run typecheck --prefix workbench` native + renderer 通过。
- 覆盖自动采样 8 条仍最多 4 次请求、手工平台明确缺口、2 次当前服务额度继续生效、手工平台预算为 0、冻结选择被篡改拒绝、同 ID 跨平台区分、旧任务收录，以及原有回执和事务恢复。
- 数据和服务响应为隔离契约测试，不代表真实 TikHub 采集或真实助手宿主运行。

## 设计规则

- **Controls-02**：复用公共 Semi 多选与可输入 Select，保留搜索、输入、键盘和 portal；手工数值不会在 blur 或关闭下拉后恢复成默认值。平台至少选一个，天数与条数标签有明确单位。
- **Reading-03**：字段标签常驻，非法值显示原因并禁止提交；来源与人工采集缺口在正文说明。
- **Surface-03**：保持原 ProductionDialog，筛选展开后正文内部滚动，底部动作固定可达；取消后重新打开保留当前页面生命周期内的草稿。
- **Foundation-01/02、Layout-02**：复用现有冷灰、白卡、蓝动作与页头，没有新增本地颜色覆盖。
- **Acceptance-01/02/03**：本目录保留 Electron 1280×860 与 960×680 截图及最终 receipt；截图为 macOS arm64 原生开发 Electron，不能替代最终安装包、Intel Mac、Windows 或真实设备键盘验收。

## 运行

`NOVA_RADAR_PROBE=1 NOVA_RADAR_SOURCE_PROBE=1 UI_EVIDENCE_DIR=docs/verification/production/2026-10-27-radar-multiplatform/electron node workbench/scripts/production-probe.mjs`

`NOVA_RADAR_SOURCE_PROBE=1` 仅在临时副本编译当前 renderer/main 并复制雷达契约，不覆盖共享 dist。必须在统一 dist 构建完成后开始，避免复制正在被替换的构建目录。

## 最终原生探针

`electron/radar-ui-receipt.json`：2026-10-27T03:25:17Z，passed=true；实际 sandbox/preload/IPC/worker/隔离资料库执行。双平台和手输 730 天/12 条写入冻结请求；取消重开、Escape、数值 blur 均保留；两类等待恢复、回执验收与收录、加入空正文选题、原目录和正文保存通过。服务设置开启 2 次额度后 UI 显示最多 2 次，关闭后重新打开显示不允许付费。960×680、1280×860 均无横向溢出，展开筛选可滚动、底部动作可达。

`paidRequests=0`，候选为合成数据，外部宿主启动使用测试回调；没有真实采集、真实 Codex/WorkBuddy 宿主或平台签名/安装包验收。

## 初次探针记录

`electron/initial-failures` 保留一次失败断言：把草稿保留检查放到了七页导航之后，组件卸载恢复默认值，超出了原有页面内草稿策略。已将取消重开断言移动到导航前，保留原有跨页面状态策略。第二次启动遇到共享 dist 重建中的文件 ENOENT，尚未运行页面，不属于采集或 UI 成功证据。

`electron/initial-failures/synthetic-open-popups.png` 为探针用程序 click 而未发送真实鼠标按下时同时保持多个搜索浮层的调试画面，不作为正常页面视觉证据。后续截图位置已移到取消重开后，避免此探针事件差异。
