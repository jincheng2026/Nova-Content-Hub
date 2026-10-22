# 候选操作范围与一致图片查看器：源码验收

日期：2026-10-22。改动基线：`337e276`；本记录随本次 main 源码提交保留。没有打包、安装、修改版本或操作用户真实内容库。当前安装的 0.3.40 不因此包含这些改动。

## 复现与原因

修复前执行 `NOVA_ENTITY_PROBE_EVIDENCE=docs/verification/production/2026-10-22-scoped-candidate-actions/before node workbench/scripts/entity-actions-ui-probe.mjs`，实际 App / React / Semi / Electron 在延迟收藏请求期间 `main[data-busy]="true"`，失败信息为 `candidate favorite must not lock the whole page ('true' !== 'false')`。见 [原始日志](before/probe.log)、[忙碌范围](before/red-or-green.json)、[截图](before/delayed-favorite.png)。夹具使用合成图片、合成 IPC 与独立 userData，未打开真实用户库。

修复前提出并依次核对的假设：

1. `CoverPanel.run=nativeAction` 把单个候选的等待提升为全局 acting；局部执行应保持导航、另一候选预览与批注可用。
2. `saveCandidate`、`refreshWorkspace` 和 `nativeAction` 重复读取封面、全库工作区、资产及全库详情；确认回执后应用当前实体应消除不必要的全库读取。
3. 原生 `WorkspaceController.recover` 本身也执行 `workspaceLibrary`，因此只去掉 renderer 刷新仍存在原生扫描成本；原生精确实体投影应保留持久意图、回执核验及恢复语义。

三项均由调用链和探针确认。新增明确的 `updateCoverCandidate` / `updatePromptFavorite` 入口，共用原持久意图→写入→精确回执核验流程；成功和提交后丢响应均读取当前实体，再清除 pending。普通 mutate、重试及重启恢复仍返回原全库契约。选用后通过 `readWorkspaceContent` 取得匹配的候选元数据；不会给旧候选字段套用新 CAS token。

候选仅禁用自己正在提交的写入动作，其他候选可查看和填写批注；实际 IPC 由现有 desktop 队列与 App 的共享动作顺序执行。收藏/选用在队列执行时使用最新已确认状态。同一实体编辑草稿只在完整文档与预期的本机单候选变更一致、原候选字段仍等于打开时基线时，沿已确认 token 链继续；检测到外部变化时保留全部输入并报告冲突，不自动重试覆盖。

## 操作范围审计

| 入口 | 等待与读取范围 | 当前验证 |
|---|---|---|
| 候选收藏 / 取消收藏 / 备注 / 保存批注 | 候选键控制提交态；当前内容实体投影 + 必要的 scoped readCover；无主动全库刷新 | 完整 App 连续操作、延迟、第二候选排队、外部冲突、失败解锁；原生实际文件库回执/CAS/恢复 |
| 候选选用 | 既有持久 coverActionPending 契约；当前 CoverView + 当前内容详情，状态同步图集与查看器 | 选用→收藏/批注连续操作及同一共享操作按钮 |
| 候选下载、当前封面下载、原图文件夹、手动刷新封面 | 使用局部动作；沿原导出与目标选择流程；刷新仅封面和封面资产 | 完整 App 下载入口；既有图库导出/取消与全部候选验收 |
| 放大查看、上一张 / 下一张、适合窗口 / 原始尺寸 | 仅查看器本地状态；原始尺寸可双轴滚动，不改图片字节 | Hero 7 种比例×3 个窗口宽度；图库、键盘、焦点归位、长宽图滚动 |
| 提示词收藏 / 取消收藏 | 当前提示词键提交态；单提示词投影；不刷新图片资产、全库详情 | 完整 App 延迟与连续收藏/取消，原生单提示词投影与 CAS |
| 提示词启用 / 回收 / 恢复 | 共用局部 mutation hook；对象键提交态；保留普通回执全库快照，应用后不重复读取 | 调用者审计 + 提示词原有原生测试；未逐项运行每个菜单的 Electron 流程 |
| 照片、渠道、资料附件、合集、成员、个人资料、默认值、分类、内容元数据、发布计划 | 共用局部 mutation hook；同行/当前表单反馈；保留全库回执兼容；仅照片/模板变化需要重读封面资产 | 调用者审计；渠道真实 App 延迟、恢复、最新 token；资料表单、未保存保护与发布计划原契约探针 |
| 资料预览/导出、模板打开目录、发布链接/复制/下载 | 所在业务面板使用局部执行；不提升为全页 acting | 调用者审计；对应既有组件/图库探针；未逐个实际系统导出 |
| 内容库切换/导入、维护、恢复、全局资源补充、正文保存/离开草稿 | 继续使用原全局动作和保护；操作确实影响库绑定或编辑会话 | 未改变其业务契约；共享队列与跨库 epoch 定向回归 |

通用实体修改仍包含一次原生全库快照，未宣称全部原生读路径均已局部化。不同表单/渠道共享同一设置或内容 token 时，外部或另一个独立表单的改动仍可能触发显式冲突；保留输入，不自动合并。

文件监听发来的是不含实体 ID 的通用失效通知，不能安全当作本次提交的回声丢弃。此类通知仍会合并后执行后台完整刷新以保留外部变更正确性，页面不进入 acting。探针的“局部连续操作零全库读取”指未注入监听事件的请求链；不能据此声称安装后真实监听循环绝无全库读取。完整 App 探针另外注入通用外部通知与读取失败，核对后台刷新保留候选页面且不锁全页。

## 验证结果与复跑

| 命令 / 证据 | 结果与范围 |
|---|---|
| `npm run typecheck:desktop` / [日志](typecheck.log) | 原生 + renderer 类型检查通过 |
| `node --test workbench/test/background-refresh.test.mjs` / [日志](background-tests.log) | 15/15，包括局部→全局切库→旧库局部动作失效，局部→后台读取→局部排队，确认实体更新当前 CAS、保留未保存正文并提示真实冲突 |
| `node --test workbench/test/workspace.test.mjs workbench/test/prompt-favorite.test.mjs workbench/test/scoped-entity-actions.test.mjs workbench/test/covers.test.mjs workbench/test/cover-gallery.test.mjs` / [日志](targeted-64.log) | 64/64；其中候选/提示词精确投影 4 项包含持久回执、丢响应、当前外部内容、投影失败与重启恢复 |
| `node --test workbench/test/background-refresh.test.mjs workbench/test/workspace.test.mjs workbench/test/scoped-entity-actions.test.mjs workbench/test/worker-client-busy.test.mjs` / [日志](native-regressions.log) | 33/33 |
| `NOVA_ENTITY_PROBE_EVIDENCE=docs/verification/production/2026-10-22-scoped-candidate-actions/after node workbench/scripts/entity-actions-ui-probe.mjs` / [日志](after/probe.log) | 实际 App / React / Semi / Electron；延迟、并发排队、不同候选批注、取消收藏/选用/批注保存、窗口动作同步、原始尺寸双轴滚动、写失败、外部冲突、提示词收藏及通用监听失败；内容资料保存→返回封面→选用和终态进度回传→选用均核对新 CAS |
| `node workbench/scripts/media-form-surfaces-ui-probe.mjs docs/verification/production/2026-10-22-scoped-candidate-actions/hero` / [结果](hero/result.json) | Hero 3:4、16:9、1:1、1:5、7:1、4:3、533:377；1280×860 / 960×680 / 540×860；另含发布表单 fieldset、长表单、脏草稿、收起恢复 |
| `node workbench/scripts/cover-gallery-ui-probe.mjs` / [日志](cover-gallery-ui.log) | 原有点选 + 矩形 + 划线、128 点/20 标记限制、长输入、原提示词确认、导出/取消、比较、收藏及原始候选均通过；夹具适配新的精确候选响应 |
| `node workbench/scripts/unobstructed-cover-ui-probe.mjs docs/verification/production/2026-10-22-scoped-candidate-actions/unobstructed` / [结果](unobstructed/result.json) | 1280 / 900 / 620 宽，完整原图、外置操作、键盘 Enter 放大、比较与候选动作。旧的重复状态 badge 断言已按当前按钮状态更新；不修改冻结的 10-20 截图 |
| `NOVA_ACTION_PROBE_EVIDENCE=docs/verification/production/2026-10-22-scoped-candidate-actions/channel node workbench/scripts/action-completion-ui-probe.mjs` / [日志](channel/probe.log) | 渠道确认快照无需重复全库读；通用监听触发的后台读取挂起/失败时导航和助手弹层可操作；恢复使用最新 token 一次提交 |

复现探针使用本机 Apple Silicon macOS、Electron 44.9.0。Vite 大 chunk 提示与独立 userData 的 Chromium cache 提示不作为产品通过或失败证明。未运行全项目全量测试；未验证 Intel Mac、Windows x64/ARM、真实助手生成、真实用户库、签名、公证、安装或生产发布。

## 主线程独立复核

主线程检查了实际生产 diff、原生边界与恢复流程、局部动作队列及当前内容版本同步，并查看 Hero、延迟收藏、带操作区查看器的实际 Electron 截图。独立命令均退出 0：

| 检查 | 结果与证据 |
|---|---|
| 最终 `npm run typecheck:desktop` | native / renderer 通过，independent-final-typecheck.log |
| 最终 `node --test workbench/test/background-refresh.test.mjs workbench/test/scoped-entity-actions.test.mjs` | 19/19，independent-final-models.log；包括确认快照同步、保留草稿及版本变化 |
| workspace、worker、超时、队列、精确实体回归 | 37/37，independent-native.log；运行时队列用例为 14 项，后来增加的第 15 项由上一行最终复跑覆盖，不将两次重复用例相加 |
| covers、cover-gallery、cover-read-refresh | 52/52，independent-covers.log；原生与模型逻辑之后未修改 |
| 最终完整 App 实体操作探针 | independent-final-entity-ui.log，截图临时输出 /tmp/nova-scoped-entity-final；含资料保存切回封面、终态进度后的最新内容与 CAS、另一候选批注及外部冲突保护 |
| Hero / 表单探针 | independent-media-ui.log，7 比例 × 3 窗口尺寸，临时截图 /tmp/nova-entity-media-independent |
| 原图库 / 点选 / 标框 / 划线探针 | independent-gallery-ui.log，临时截图 /tmp/nova-scoped-gallery-independent/gallery |

截图目录中保留的是实施阶段的同场景验收图；独立复跑的临时目录不是安装包或用户内容库。最终确认 `git diff --check` 通过，旧冻结截图、0.3.40 发布 tag 与版本不变。

## 性能观察

`NODE_ENV=test node workbench/scripts/scoped-candidate-performance-probe.mjs docs/verification/production/2026-10-22-scoped-candidate-actions/performance.json`，同一个合成库（31 篇内容、30 条提示词、1 张目标候选），交替执行普通 mutation 与精确候选 mutation。实测 [原始记录](performance.json)：

| 样本 | 时间 ms | readFileSync / openSync | worker 投影 |
|---|---:|---:|---|
| 原全库回执 1 | 359.56 | 681 / 804 | workspaceLibrary |
| 精确候选回执 1 | 181.46 | 283 / 340 | workspaceContent |
| 原全库回执 2 | 364.99 | 551 / 662 | workspaceLibrary |
| 精确候选回执 2 | 160.13 | 283 / 340 | workspaceContent |

持久化、回执核验和库身份验证仍会读取文件；精确投影并非零 I/O。本观察证明该夹具减少了全库投影与文件读取，不能推出所有真实库或安装后的固定提速比例；不包含 renderer、文件监听或系统导出耗时。

## 设计标准与截图

| 规则 | 验收 |
|---|---|
| Layout-03 / Image-01 | Hero 的实际图像边缘与按钮边缘一致，完整等比适配任意实际比例；已有源码的自适应边缘规则保留。点击封面直接进入统一查看器，继续编辑仍使用原内容入口。原图自带白边属于源像素，未裁剪或改写。见 [16:9](hero/hero-1280-1.png)、[竖版](hero/hero-1280-0.png)、[1:1](hero/hero-1280-2.png) 及每比例指标。 |
| Surface-03 / Controls-01 | 查看器标题、上一张/下一张、关闭与右侧操作独立于图像滚动；窄窗堆叠；Esc 和关闭后焦点返回可达。见 [完整查看器](after/viewer-with-actions.png)、[原尺寸长图](after/tall-original-scroll.png)、[原尺寸宽图](after/wide-original-scroll.png)。 |
| Interaction-01 / Interaction-03 | 提交反馈限定目标候选/实体，其他候选允许打开批注，排队保留请求；没有新增依赖、删除功能或新实体。见 [延迟收藏](after/delayed-favorite.png)、[另一张仍可批注](after/other-annotation-during-favorite.png)。 |
| Reading-02 / Reading-03 | 备注完整换行，位置批注/自由划线/框选、长提示词与原始输入保留；冲突不覆盖输入。见 [冲突草稿](after/annotation-conflict-preserves-draft.png)。 |
| Acceptance-01/02/03 | 本记录是源码、合成 IPC 与本机 Electron 证据；不是当前安装版或全平台交付。原生实际临时文件库测试与合成界面探针分别报告。 |

主线程另行独立检查：原生相关 37/37、封面相关 52/52、Hero/media UI 和原图库/批注 UI 均通过；这些原生/图库检查在最后的 App 当前内容 token 同步修复之前完成，相关原生实现未再修改。最终 token 同步修复之后，本执行代理重新通过 desktop 类型检查、background 15/15、完整 App 实体 UI（包含资料修改与进度回传的新 token 连续操作）。主线程的最终独立记录以同目录 `independent-*` 日志为准。
