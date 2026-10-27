# 助手任务、对标账号、调研报告验收

日期：2026-10-27。范围为本次分配的三个页面及其管理弹窗；此记录不覆盖并行工作的调研深度、正文长度和其他新增测试。没有提交 Git commit。

## 修复

`workbench/src/renderer/production-workspace.tsx` 的继续任务操作原先忽略 `openProductionTask` 返回的 `opened/message`。外部助手启动失败时，页面没有反馈。已先用真实 Electron/preload/IPC/worker 复现该问题，再补充成功/失败反馈，失败保留任务；成功提示打开助手不等于权限已批准或结果已提交。

任务页同时明确当前宿主能力：固定任务可继续，但入口打开对应助手工作区的新会话，不能可靠定位原聊天；等待状态来自助手回写，尚未接入宿主审批事件监听，不自动批准权限。没有修改后端、任务枚举、生产弹窗代码或生产弹窗样式。

## 已执行验证

- `node --test workbench/test/production-desktop.test.mjs plugin-src/src/lib/file-library/test/production.test.mjs plugin-src/tests/production-handoff.test.mjs`：30 项通过，0 失败。日志为 `logs/production-contract-tests.log`。
- `npm --prefix workbench run typecheck:renderer`：通过。日志为 `logs/typecheck-renderer.log`。
- `node workbench/scripts/compact-research-probe.mjs`：隔离原生 Electron 完成 17 项记录；见 `dialogs/compact-research-receipt.json`。
- `node workbench/scripts/workspace-contract-probe.mjs`：最终隔离原生 Electron 完成 8 项记录；见 `after/workspace-contract-receipt.json` 及 `logs/workspace-contract-final.log`。
- 标题模块只读交叉审查：未发现实际问题。核对原保存/CAS、`draftRef/dirtyRef`、冲突阻断、当前人工验收 attempt 的 receipt、旧正文提示与只修改标题草稿的边界；独立执行新增 helper 的 4 项测试全部通过，见 `logs/title-cross-review-tests.log`。没有修改标题组件/helper/app 接线。

双助手分别验证了轮询更新、`waiting-user → claimed`、`waiting-permission → claimed`、更换全局助手后仍继续原任务宿主/attempt、提交后人工验收、失败详情、重试、取消、再次启动及切换助手。每次重试保留固定请求并创建新 attempt；切换时旧的活跃 attempt 退役；打开助手不改变等待状态。

账号与报告弹窗分别验证 1440×1000 和 960×680 的边界、初始焦点、Tab、Esc 与焦点返回；平台别名搜索、长备注内部滚动、保留/放弃草稿、嵌套图片关闭、CAS 冲突保留输入、报告自定义类型和导入草稿、调研每次评论授权以及创建期间阻止取消均已通过。

## 设计规则与视觉证据

- **Foundation-04、Controls-01**：两种等待、失败、取消、待验收及已人工验收都有可见文字；人工验收须显式点击，终态不继续显示运行操作。参见 `after/codex-waiting-permission.png`、`after/workbuddy-waiting-user.png`、`after/workbuddy-submitted-review.png`。
- **Layout-02、Controls-02**：桌面账号搜索/平台上边沿均为 242.59px；报告搜索/类型上边沿均为 285.39px，日期标签高度为 34px。960px 宽页面允许重排且无文档横向溢出。对齐样式由主线程修改，本探针仅验收。参见 `after/accounts-1440x1000.png`、`after/reports-1440x1000.png`、对应的 `960x680.png`。
- **Surface-03**：添加/编辑账号、导入报告和新建调研的原生模态边界、焦点与关闭行为通过。人工检查了 `dialogs/account-long-draft-960x680.png`：标题与底部按钮可见，表单维持清楚层次，长备注保留可滚动文本。
- **Image-01、Reading-02**：账号合成截图按原比例完整显示，全部图片入口保留；最终截图等待解码，截图夹具仅将缩略图设为 eager 以排除多个 Electron 探针窗口互相遮挡造成的懒加载调度差异，不据此宣称图片加载性能通过。展开的提交结果保留换行和全文。
- **Acceptance-01/02**：上述行为测试、类型检查与截图均有独立记录；没有把 CSS 断言当作视觉验收。
- **Acceptance-03**：仅本机 darwin-arm64 原生 Electron，使用隔离临时内容库和当前源码重建的 renderer；宿主 launch callback 模拟，真实 IPC/worker/资料读写未模拟。没有触发付费采集、发送外部消息或自动批准宿主权限。未验收真实助手协议启动、原会话恢复、宿主审批事件、Intel Mac、Windows、安装器或系统应用信息。

`electron/workspace-contract-failure.json/png` 和 `logs/launch-feedback-red.log` 是修复前的预期失败证据。过程中测试夹具与后台读操作发生的 BUSY/异步回调过早断言已在探针中修正，没有据此修改产品代码；最终通过收据仅对应最终一轮。

## 追加：重试与切换须打开助手对话（用户新增要求）

本次追加仅修改 `ProductionWorkspace.taskAction`：`actProductionTask` 成功创建新 attempt 后，retry（含指定另一 host 的切换）立即调用 `openProductionTask`。成功显示助手已请求打开；失败显示返回的 message，并保留可“继续原任务”的新 attempt。cancel 和 accept 不调用助手打开入口，人工验收契约保留。没有修改后端和其他并行工作的调研/creation 文件。

先运行新增原生断言，修复前点击“重试”后新 attempt 已创建但没有 launch 回调，得到预期红灯 `Timeout waiting for native launch`。证据为 `retry-launch-red/workspace-contract-failure.json/png` 和 `logs/retry-launch-red.log`。

修复后的最终原生 Electron 探针 **9 项记录通过，0 失败**：`retry-launch-after/workspace-contract-receipt.json` 与 `logs/retry-launch-after.log`。Codex/WorkBuddy 分别验证重试立即调用自身宿主的新 attempt，切换立即调用另一宿主的新 attempt，固定请求保持不变；另验证重试/切换的 launch 拒绝后显示错误并保留新尝试，以及 cancel/accept 不触发 launch。renderer 类型检查通过，见 `logs/retry-launch-typecheck-renderer.log`。

截图 `retry-launch-after/retry-switch-launch-failure.png` 保留失败后仍可继续的入口；`retry-launch-after/codex-switched.png` 和 `retry-launch-after/workbuddy-switched.png` 展示切换后的任务。追加遵守 **Controls-01、Foundation-04、Acceptance-01/02/03**。此轮仍以模拟外部宿主 launch callback 验证真实 renderer → preload → IPC → controller → worker → launch 调用链，未冒充真实 Codex/WorkBuddy 桌面跳转验收；真实宿主与跨平台缺口沿用上文。

## 追加：库内助手产物归档入口

本 scope 仅负责 `production-workspace.tsx` 的 UI 接线与专项原生探针。底层投影、固定目录、版本及路径安全由后端代理负责，未在本 scope 修改后端。

- 任务卡只在当前 attempt 的 submitted/accepted 收据匹配 taskId、attemptId 和 requestHash 时显示保存位置及“打开产物目录”；未回传任务没有该按钮，显示回传后归档说明。目录存在不作为提交或人工验收的证据。
- 创作知识页新增单一白卡“助手产物归档”，按共用 `productionArchiveCategory` 的受控返回值分组展示“调研报告、账号拆解、创作知识、内容项目”；保留真实任务标题、提交/人工验收状态及关联内容入口。没有自由路径输入，也没有把归档任务改为已采纳知识。
- 打开目录调用 `openProductionLink({kind:'task-archive',id:task.id})`，展示返回的 message；失败沿用原 notice 并保留收据。snapshot 的临时 archiveWarnings 可见，打开目录不清除人工填写。

红灯证据：`archive-red/archive-ui-failure.json` 与 `logs/archive-ui-red.log`，缺少目录入口时得到明确 assertion failure。最终绿色专项为 **8 项记录通过，0 失败**，见 `archive-after/archive-ui-receipt.json` 与 `logs/archive-ui-after.log`。类型检查通过，见 `logs/archive-ui-typecheck-renderer.log`。测试夹具在 knowledge 组件刚挂载、读取尚未结束时的提前断言已改为等待真实列表，不据此修改产品代码。

专项使用隔离 Electron bundle：先克隆稳定分发目录，在隔离副本中重编译最新 native/renderer，并覆盖最新 file-library 源码；不写共享 dist。真实 renderer/preload/IPC/controller 与 worker 资料读取生效，外部目录打开和 AI launch 使用观察 callback，临时归档 warning 使用合成注入。实际点击打开目录没有增加任何 AI launch；任务提交、人工验收、知识候选和正文内容保持原契约。

视觉引用 **Surface-01、Controls-01、Reading-02、Foundation-04、Acceptance-01/02/03**：`archive-after/task-submitted-archive-1440.png`、`knowledge-archive-1440.png`、`knowledge-archive-960.png`。白卡、分类展开、文字状态和既有按钮层次清楚；960px 无文档横向溢出，页面可向下滚动。初始截图中的合成归档 warning 使用既有 alert 红色，已将标准警告色适配交由拥有全局样式的主线程统一处理。

本 UI 专项不证明真实 Finder/资源管理器已打开，不代替后端目录投影/路径安全测试；仅 darwin-arm64 原生 Electron，未验收安装器、Intel Mac、Windows 或真实助手宿主。
