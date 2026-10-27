# 提交结果拒绝：有界修复验收

2026-10-27，责任源码按 source-freeze.json 冻结；主线程统一提交和交给中央对话发布。本批没有升版、打包、操作真实内容库或调用实际助手／付费服务。

## 行为与契约

- 新增 rejected 终态，只允许用户 rejectTask 从 submitted 转入。必须携带当前 taskId、active attemptId、receiptHash、expectedToken 及 1–2000 字非空 reason；原因 trim 后保存，拒绝额外 worker 身份字段。
- rejection:{reason,at} 仅 rejected 允许／要求存在。原 result、receipt、requestHash、activeAttemptId 保留；有精确 task/attempt/receipt 来源的反馈与状态在同一事务写入。
- rejected 不可继续业务执行、发起新服务调用、重试、打开继续、验收或采用。费用结算例外沿原语义：仅已有 reserved/unknown 记录可由原 worker 结算；未预留请求不能新增任意 cost，人工 reconciliation 保留。
- 原 adopting helper 保持 submitted/accepted 预览与 accepted 采用边界；另加 receipt-readable helper 供 rejected 归档与结果阅读。报告精确关联仍在，状态显示“已拒绝”且不计已验收。
- 任务详情、整篇结果卡和雷达结果可拒绝；整篇候选即使 bundle 校验失败也保留拒绝入口。原因弹窗在打开时捕获精确回执与 CAS，后台刷新不能偷偷换基线；失败保留原因。
- 拒绝后由用户修改需求，再明确 start 新 task 与固定请求；不自动发送，不重用旧 claim，也不把坏结果假验收。原 launcher 适配、服务设置和预算评论未变；controller 仅补终态防线。

## 已验证

- RED：新域与 desktop 测试先 5 项失败／1 项负例通过，失败来自未知 rejectTask、缺失 metadata 终态及输入契约（red.log）。
- 新 focused：`node --test plugin-src/src/lib/file-library/test/production-rejection.test.mjs workbench/test/production-rejection.test.mjs`：8/8，通过两宿主、保留回执／原稿、同事务反馈、严格 reason/CAS/attempt/receipt、不可重试或执行、metadata、归档、备份恢复、费用例外、丢回复后恢复不重复反馈（domain-tests.log）。
- 相关回归：`node --test plugin-src/src/lib/file-library/test/production.test.mjs plugin-src/src/lib/file-library/test/production-archive.test.mjs plugin-src/src/lib/file-library/test/production-bundle.test.mjs workbench/test/production-report-status.test.mjs workbench/test/content-creation-workflow.test.mjs`：34/34（regression-tests.log）。没有跑整仓 suite。
- `npm --prefix workbench run typecheck`：native + renderer 通过（typecheck.log）。`git diff --check` 通过。
- 隔离原生 Electron `node workbench/scripts/production-rejection-ui-probe.mjs`：4 项复合场景通过（electron-probe.log、electron/receipt.json）：重复正文产物无法预览仍可拒绝；空原因禁用；1280×860 与 960×680 原因及确认按钮可达；并发 workspace 改动触发 CAS 冲突并保留原因；明确处理恢复／重读后拒绝两个坏结果，正文未变；新要求显式创建第三个新 task；被拒绝任务详情有原结果与归档且无重试／继续／验收入口。

## 设计与平台

复用设计标准 Foundation-01/02/03/04、Surface-03、Controls-01/02、Reading-02/03：Semi 文本框单层焦点、明确原因标签、危险确认、固定底部动作，原因失败保留；960 窄窗截图 reject-confirm-960x680.png 已人工查看，取消／确认首屏可达。未增加颜色、布局依赖或动效。

本次仅开发机 darwin-arm64 隔离 Electron，助手 launch/focus 使用模拟回调。安装版 .56 不应写入此新状态；实际两个坏候选须由 .57/中央冻结版本安装后人工拒绝并重跑。Intel Mac、Windows、同事 macOS 26 的最终安装及真实会话验收不在本批宣称通过。
