# 本地任务交接与进度验收

日期：2026-10-22（Asia/Shanghai）。源码版本保持 0.3.39；本记录覆盖本次源码与隔离数据验证，不是安装包或生产验收。

## 行为与边界

- 跳转仅携带有界自然任务句、任务编号和固定执行 Skill。WorkBuddy 通过 skills 参数激活，Codex 保留 `$skill`；补充要求、批注坐标与换行、10,000 字长输入、数量、比例、尺寸、本人照、资料及收藏构图均保留在原不可变请求，context 明确返回原请求与正文文件路径，不建立第二权威副本。
- 进度写入独立 attempt sidecar，不改正文、模板元数据或 editToken。created 可报告 reading 和等待，生成/分析/还原/校验须 claimed；进度不等于已提交。最终回传仍由原 submit 回执决定，模板仍须人工验收。
- 业务归属、active、host、requestHash、固定输入、revision CAS、mutationId 回放及尺寸/字段限制在库锁内校验。sidecar 绑定库的绝对 root 和 dev/ino，复制、移动或替换后不投影旧会话。坏记录和物理归属不匹配均严格拒写，界面提供取消后重试入口，原输入和产物保留。
- 界面沿文件监听的独立 progress 事件更新，活动任务每 2 秒轻量轮询兜底；phase/接单变化仅合并任务状态，终态才完整读取一次结果。进度不写回编辑器，不清除正文或补充要求草稿，不清除模板人工确认。
- “去确认”固定使用任务原 host 和合法已绑定 session；全局助手改动不会把确认导向另一助手。无可靠会话编号时诚实提示打开原助手、按同一任务编号继续。只有明确“换用”才创建另一 host 的新 attempt。打开助手不代表同意权限。
- 两 execution Skills 分为短步骤与执行前必读的 execution-contract.md，保留完整输入读取、真实生图 prompt、原字节、SHA256 与提交约束；在读取、生成前、校验前及提问/请求允许前回写进度。当前没有可安全绑定当前 handoff 的宿主工具级审批 hook，界面只显示助手主动报告的实际进展。

## 可复核验证

| 检查 | 结果与证据 |
|---|---|
| 红测试 | 新增短跳转及两业务 progress 首次 3/3 失败，完成实现后 3/3 通过。 |
| 源码针对性回归 | `node --test plugin-src/tests/native-handoff.test.mjs workbench/test/covers.test.mjs workbench/test/templates.test.mjs workbench/test/library-watch.test.mjs workbench/test/background-refresh.test.mjs workbench/test/detail-read-assets.test.mjs`：108/108 通过；[原始输出](source-targeted-108.txt)。此后补物理 root 绑定，以下 6 项对最后核心变更重新检查。 |
| 最后进度核心边界 | `node --test --test-name-pattern='copied or replaced\|progress is isolated\|damaged or swapped' plugin-src/tests/native-handoff.test.mjs`：6/6 通过，覆盖两业务 CAS/回放/终态、损坏/超限/symlink/session 归属、clone 与同路径 inode 替换，正文/模板 token 保持。 |
| 会话路由/投影 | `node --test workbench/test/task-progress.test.mjs`：2/2 通过；固定 host+UUID 路由拒任意 URL/路径、终态优先、claimed 轻量合并。 |
| Skills 原字节约束 | `node --test plugin-src/tests/clean-output-skills.test.mjs`：2/2 通过；原全部输入/约束断言随必读执行契约一并保留。 |
| 主线程独立验证 | 最后 typecheck、build:both、desktop both（darwin/arm64）、npm run check 和 diff --check 均 exit 0，独立重跑同 Electron 探针 ok。最后核心 pattern 11/11 通过（10k 本地完整要求、短跳转、CAS、损坏、session 与物理 root clone）；重建后随包 launcher 的 cover/template progress 2/2 通过（实际写入、context 回读、required gate、错 host、token 保持）。此前完整 built CLI 11/11、controller/worker/assistant 43/43、schema/clean-output 12/12 通过。 |
| 静态 | 最后 `npm run typecheck:desktop` 与 `git diff --check` 均 exit 0。 |
| Electron 页面 | `node workbench/scripts/task-progress-ui-probe.mjs`：exit 0；[机器结果](ui-probe.json)、[原始输出](electron-ui-probe.txt)。真实 React/Semi 渲染，合成 IPC 回执，未访问用户库。 |

Electron 探针验证 waiting → running → committed、文件事件与漏事件轮询、阶段更新不重读全部图片/模板、脏正文与模板 notes 保留、当前全局 WorkBuddy 未就绪仍能去原 Codex 确认、点击继续不清等待、终态优先于旧等待、窄窗无横向溢出。真实 CSS viewport 为 1280×868 和 820×868，DPR 2；BrowserWindow 外框为 1280×900、820×900。

## 设计规则逐项结果

| 规则 ID | 结果 |
|---|---|
| Foundation-02/04、Controls-03 | 延用既有文字、浅蓝承载面和紧凑状态，状态有明确文本；“助手报告”与提交事实分开，无虚构百分比。未新设配色。 |
| Controls-01、Interaction-03 | 原助手确认入口清楚可点击；全局助手不同则单列明确换用动作。继续不代用户审批；进度不可读时继续禁用、取消保留。 |
| Reading-02/03 | 完整要求保存在原请求，短跳转不截断权威输入；长 notes、批注、参考图角色继续完整读取；进度报告有真实更新时间。 |
| Surface-01、Layout-01 | 延用原任务承载面及按钮，无新视觉体系；1280/820 窗口已截图检查，窄窗口无横向溢出。 |
| Acceptance-01/02/03 | 类型、针对性行为与隔离 Electron 结果分别记录。截图确认可读与缩排，不把源码或合成回执当真实宿主生成、已安装或全平台证据。 |

截图：[封面等待](cover-waiting-1280.png)、[模板等待](template-waiting-1280.png)、[模板窄窗](template-waiting-820.png)。已人工查看截图；封面空结果文案为“封面尚未回传”，模板说明区分当前任务原助手和新任务全局助手。

## 参考观察与未覆盖

只读参考旅游营销工作台的 tasks/turn/hooks/短跳转结构。主线程实际从旅游界面发送专用测试任务到 WorkBuddy，要求生成前确认；Agent 提出两个确认问题，发生在物料任务建立前，因此旅游界面未出现任务。随后已回复不出图并结束。该观察仅说明真实确认可能早于 claimed，本次允许 created 阶段 reading/等待；参考测试未生图、未发布、未修改资料卡，截图只在聊天工具结果中，无本地截图文件。

本次未在真实自媒体用户库调用助手或外部生图；未安装、升级或修改已安装缓存；未验证真实会话绑定来自宿主、工具级审批 hook、真实生成/回传、Intel Mac/Windows 原生运行或签名、公证、正式发行。主线程已完成本机 darwin/arm64 的最终构建与上述 built CLI 独立复核；这不等于已安装、真实宿主生图或其他架构运行验收。打包和系统应用信息要求统一引用根 AGENTS.md。
