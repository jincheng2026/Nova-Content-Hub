# 内容创作与助手会话连续性审查

日期：2026-10-28。只读审查当前共享工作区；生产代码由开发主对话唯一负责人修改。本次仅写此报告。写报告时 HEAD 为 `d16277972dfad01bbef5d5b98cda1be0c26def4a`；工作区有并行开发，不能把此 SHA 当作全部已测文件的冻结快照。

目标：新建内容 → 调研账号／视频／用户问题 → TikHub 找视频、下载与 Qwen ASR → 拆解结构／开头／方法／判断 → 创作 → 人工多轮修改 → 封面 → 逐字稿、标题、简介、封面与参考资产留存。除封面外尽量在同一助手聊天完成；新聊天明确指定库和内容后能识别并接续。

结论：稳定内容身份、原页读回与人工字段保护、媒体授权、最终资产保存已有基础；以下三个编排断点仍阻止目标闭环。不得把助手打开、提示预填、阶段文件存在或聊天结束作为提交成功。

## 1. 新入口分阶段建任务，没有同聊天连续编排

### 可核验现状

- `workbench/src/renderer/jincheng-stage-actions.tsx` 的 `start()` 以 `jincheng-stage` 发起当前阶段；研究会被控制器转成 `jincheng-research`。
- `workbench/src/renderer/production-workspace.tsx` 的 `task()` 同样创建阶段任务；`content-creation` 只保留历史整篇任务及结果兼容入口，不能把旧整篇提示词存在等同于当前 UI 路由已经接通。
- `plugin-src/src/commands/jincheng-workflow.mjs` 的 `fixedStageContext()` 只允许冻结 `jincheng-stage`；`allowed` 中 writing 只允许 complete-draft，analysis、narrative、packaging 各有独立阶段。`jincheng-research.mjs` 反向只允许研究工作流。
- `plugin-src/src/bridge/production-handoff.mjs` 的 `prepareProductionHandoff()` 总是生成 `codex://new` 或 WorkBuddy `action=start`。`ProductionController.launch()` 对已领取任务仅 focus 助手，并明确提示无法定位原聊天。

因此：从研究 UI 开始后，不能在同一固定任务调用原页创作接口；换阶段的现有 UI 又生成新聊天。固定阶段权限本身是保护边界，不应简单删除。

### 最小实现建议（拟议，尚未实现）

优先增加“内容绑定连续编排”外层，保留现有阶段任务和执行器。外层身份至少关联已验证的库身份、contentId／T、当前来源版本、当前子任务／attempt 和前序回执。阶段切换通过受控操作创建后继固定请求，记录前序任务和回执；不改写旧 requestHash、不复活终态。

把“准备固定交接”和“打开宿主”拆开：复用 `prepareProductionHandoff()` 的校验、信封与短指令生成，但允许受控返回交接编号给当前聊天继续执行，而不是每次强制打开新聊天。仅有可信宿主会话标识时才定位原聊天；缺能力时明确显示手动续接指令，不猜会话。新增命令名称由 owner 决定，报告不将其当成已存在接口。

复用点：

- `ProductionController.startProductionTask()`：冻结定位、原页 source、正文版本、工具及预算；提取其创建逻辑，避免后继路径复制一套权限规则。
- `ProductionController.write()`／`pendingBase()`：持久操作意图、mutationId、响应丢失恢复。
- `production.mjs` 的 createTask／claimTask／progressTask／submitTask 与 receipt：保持生命周期和等待语义。
- `jincheng-workflow`／`jincheng-creation`：继续承担阶段门禁、原模板、CAS、suggest／reply 和作者字段保护。
- `readVaultWorkContext()`／`readWorkFlow()`：构造下一阶段上下文，保留已确认版本与原页引用；不从摘要重建完整 HTML。

不要仅恢复旧 content-creation 按钮：它的整套候选采用协议与当前原位 HTML／阶段确认协议不同，须明确接合后再作为新入口。

## 2. 新聊天只有库＋T时，没有公开的受控识别与后继尝试入口

### 可核验现状

- 底层 `readVaultTaskContext(runtimeRoot, contentId)` 已返回稳定 T、来源解析状态、当前文档、创作页和关联文档；`readWorkFlow()` 可读阶段产物及作者确认。
- 但 `production`、`jincheng-workflow`、`jincheng-creation` 的当前 CLI 都以显式 handoff 为入口；后两者连 read 也要求当前 claimToken／workerId。
- `plugin-src/resources/business-skills-contract.md` 和 `nova-workbench-writing-method/SKILL.md` 明确规定：直接聊天可以给候选；真实保存先取得绑定工作台任务，不能从 cwd 猜库。
- 已有 UI 重试／换助手能力。`retryTask` 会取消活跃旧 attempt 并创建新 attempt，拒绝 submitted／accepted／rejected，并在未知或未结算费用存在时拒绝。不是“完全不能恢复”；缺的是显式内容定位到安全续接的公开路径。

### 最小实现建议（拟议，尚未实现）

新增严格只读的内容定位入口，输入明确库定位与 T（或 contentId）；验证库身份，限定扫描范围，返回唯一内容身份、当前来源状态、当前工作流／任务状态、已保存结果与待人工决定。不返回旧 claimToken，不自动 claim、取消、重试、修改库、发服务请求或打开聊天。若现有读函数含隐式恢复／投影写入，需隔离副作用，不能仅因函数名为 read 就承诺零写入。

再增加显式续接动作，按实际状态分流：

1. 同一冻结请求确需重试：复用 `retryTask`，保留其费用门禁，旧 attempt 退役，新聊天自行生成新 workerId／claimToken；不要抄取原凭据。
2. 正文／来源／阶段／预算已有变化：创建后继新任务，重新冻结当前版本并记录前序关系，不能把 retry 当作重冻结。
3. submitted：先展示真实回执与待验收／采用状态；accepted 后再改稿应建新请求；rejected 不可重试，沿用明确修改要求后新建任务的规则。
4. 库不唯一、T冲突、当前来源未决或丢失：只回读候选／缺口，复用工作台的当前来源选择流程，不选“最新文件”猜测。

复用点：`vault-controller.mts/readVaultWorkContext`、`vault/core.mjs/readVaultTaskContext`、`vault/workflow.mjs/readWorkFlow`、`ProductionController.actProductionTask/openProductionTask`、`production.mjs/retryTask`、既有 pending mutation 恢复机制。新入口必须明确宿主与内容，不把任意库读取扩成全盘自动发现。

## 3. 关键词搜索结果不能在该研究任务继续下载／转写

### 可核验现状与复现

`ProductionController.startProductionTask()` 对抖音 topic 关键词研究冻结 `operations=['douyin-search']`，没有 videoIds 或 sampleLimit。`research-runtime/common.mjs` 的 sampleLimit 仅允许 account；`index.mjs/deriveSamples()` 仅认 account 的 user-posts 回执，`download()` 仅认固定 videoIds 或已派生样本且要求 video operation。

本轮在独立临时目录准备如下配置，executeService／fetchMedia 都设置为不可调用的失败 stub：

```json
{"version":1,"researchId":"topic-audit","outputDirectory":"调研报告库/topic-audit","route":"topic","platform":"douyin","targetIds":["AI教程"],"operations":["douyin-search"],"maxRequests":3,"comments":false}
```

实测结果：`deriveSamples('topic-audit')` → `RESEARCH_TARGET_FORBIDDEN`；`download('topic-audit','123456789')` → `RESEARCH_TARGET_FORBIDDEN`。临时目录随后清除，零外部调用。直接视频链接与账号最多三样本的已有路径不受本结论否定。

### 最小实现建议（拟议，尚未实现）

扩展已存在的“已结算 receipt → 有界样本”机制到新冻结的 topic 任务。新请求明确授权搜索结果可派生的样本上限及 video/media/asr；旧任务保持原权限。只能从当前任务／attempt 的成功搜索响应中提取真实 videoId，固定 requestId、responseHash、query 和样本列表；限制最多三条且不得经重复分页绕过总上限。

复用点：

- `research-runtime/common.mjs`：版本化扩展 `validateResearchConfig`、`researchMediaAuthorized`、`deriveResearchVideoIds`／新搜索归一器、`researchVideoAuthorized`。
- `workbench/src/main/production-services.mts`：现有 user-posts 成功结算时写入 `researchVideoIds/responseHash`，扩展至受授权的 douyin-search；不能仅在助手本地状态添加样本。
- `research-runtime/index.mjs`：派生时核对真实回执与哈希，下载继续走既有 sourceReceipt、媒体 grant、安全下载和本地 ASR。
- `workbench/src/main/production-worker.mts`：维持 grant 登记前的任务、attempt、来源授权复核。

如果当前发布范围不允许扩展该冻结授权，替代方案是明确选中搜索结果后建立同内容、同聊天的后继视频任务；这同样依赖第1项续接入口。不得让助手直接把搜索结果 ID 塞进旧请求。

## 已验证能力与证据边界

本轮执行下面六个测试文件，合计 **49项通过、0失败，exit 0，147714.575292 ms**。全部使用临时库或合成服务响应，未修改真实库、未运行费用业务。此次未单独落盘测试日志，结果来自本会话终端工具返回；不得引用为完整安装包／宿主 E2E 日志。

```sh
node --test workbench/test/content-creation-workflow.test.mjs workbench/test/jincheng-stage-runtime.test.mjs workbench/test/production-media.test.mjs workbench/test/production-asr-cli.test.mjs workbench/test/final-assets-desktop.test.mjs plugin-src/src/lib/file-library/test/production-bundle.test.mjs
```

覆盖：双助手标识下控制器等待／恢复与不重复建任务；原页创建、精确版本确认及拒绝覆盖作者 mine；媒体来源／归属／终态失效；ASR使用登记媒体与冻结本地引擎；整套候选采用和人工包装选择保留；最终资产响应丢失恢复、源文件消失后的快照读取和导出。

历史真实服务证据：`docs/verification/2026-10-27-live-services/CURRENT.md`、`qwen-local-asr/README.md` 记录 TikHub 八项 operation 与 Qwen 本地中文短样本真实调用。`docs/verification/production/2026-10-27-qwen-colleague/README.md` 区分组件离线安装／短句推理与工作台实机接入。它们不证明搜索原片→长视频ASR→同聊天整篇创作已验收。

最终资产模块已保存逐字稿／标题／简介／封面文字／封面和来源快照；参考媒体与研究证据另由内容库及研究／素材链留存。当前最终导出包不是包含全部参考原片的自足备份；如产品要求连原片一并交接，须另列导出范围，不能把引用清单称为原片副本。

## 待实现后的验收矩阵

以下都是待验收项，不以本轮49项通过替代。每个支持宿主分别执行，不共用一个宿主成功结论。

| 场景 | 必须观察的结果 | 现有基础／补测位置 |
| --- | --- | --- |
| Codex／WorkBuddy 从内容开始，研究→拆解→写稿→包装 | 当前聊天收到每个后继交接，内容身份连续；阶段门禁保留；终态回执真实可读 | stage-actions、production-controller、production-handoff；新增编排集成测试和两宿主实测 |
| waiting-user／waiting-permission 各暂停并恢复 | 实际答复／许可后恢复；不会因点击继续而批准；原 attempt／阶段状态正确 | content-creation-workflow、task-progress；两宿主事件能力分别记录 |
| 人工改稿后再请求修改 | 读当前完整原页，建议引用命中；旧版本冲突不覆盖 mine／note／决定／已选包装 | jincheng-stage-runtime、creation-desktop；补跨任务版本变化测试 |
| 新聊天显式库＋T只读定位 | 唯一正确内容、当前原页和历史；零 claim／写库／付费；不泄露旧凭据 | 新定位测试；包含两个库都有同T、来源冲突／缺失 |
| 新聊天明确续接／换助手 | 创建新 attempt 或后继请求；旧身份拒绝写入；未知费用阻断；不会复活 submitted／rejected | production lifecycle、handoff；两宿主实测 |
| 已提交后继续多轮改稿 | 回执、人工验收／采用、新请求分别留痕；后继冻结最新作者稿 | production-bundle、stage runtime、history |
| 关键词搜索→派生→下载→Qwen | 真实搜索 receipt 派生最多三条；原片、来源、ASR原稿／校正版和时间精度可追溯 | production-services、research-runtime、production-media、ASR；真实小样本需另有执行授权 |
| 伪造／跨任务／旧attempt／第4条／重复分页样本 | 服务调用前拒绝或不扩大总上限；失败／未知结算不盲重试；旧冻结请求不扩权 | researchVideoAuthorized、media grants、预算测试 |
| 内容最终资产与参考留存 | 作者明确保存后读回逐字稿／标题／简介／封面；原片与转写实际存在且关联同内容；重启与导出可用 | final-assets-desktop、素材归档；核对真实目录和hash |
| 平台／架构交付 | 每个承诺平台分别记录构建、安装、运行和宿主能力；Qwen缺载荷时明确能力限制 | 按 AGENTS.md；本轮仅本机 darwin-arm64 后端测试 |

建议 owner 先实现第1、2项共用的“准备交接但不强制新聊天”与内容续接事务，再接第3项 receipt 派生。每项写入仍由当前唯一代码 owner 收敛；本报告不另行分派生产文件。
