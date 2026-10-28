# 最终 installed payload：保存、独立重开与原作者恢复复查

**持久化与独立读回已取得新证据，但本项不能标为全部通过。** 同进程 T029→选题列表→T044 出现一次 90 秒有界导航等待失败；T044 两次恢复 drain 超过 25 秒门槛。失败全部保留。最后仅做原 final 的一次实际输入，由原页自动保存，未再次调用 flush；T029、T044 的全部作者 fields 与 HTML JSON 外字节现已准确恢复。

顶层 `runner-result.json.passed=true` **只代表最后 restore-final 阶段**，不代表前述流程全通过。顶层的历史 phase 文件是 runner 从同一 temp root 复制的留存；逐次结论以以下 attempt 目录和本报告为准。

## 实际边界与来源

- 入口：`workbench/scripts/installed-reaudit-entry.mjs`；未改产品、既有 probe 或已安装应用，未 commit。
- 从 `/Applications/自媒体工作台.app/Contents/Resources/app/workbench/dist/main/desktop.mjs` 动态 import，worker、preload、renderer、创作页与 Vault 实现均从该 installed 路径解析。plugin-marketplace 与 local-asr 也显式指向 installed Resources。
- installed desktop SHA256 前后均为 `52cf873aaf1807934bcf95f31791f2225c5d174a08c95929831beb1c59333b24`。其他关键模块的真实 hash 见 `provenance.json.moduleHashes`。
- 使用仓库 Electron 44.9.0 启动隔离 main harness，`app.isPackaged=false`，`show:false`。这是 installed 模块的原生集成验收；不是 Finder/Dock 启动 `.app`、系统属性、签名、公证、安装升级或跨平台验收。
- 最终初始 ZIP `/Users/mac/Desktop/自媒体工作台-0.5.0-交付/第二大脑-0.5.0-初始内容库.zip` SHA256 为 `c47d78e13d08360265b47fb4078cbd02c006fd3910ea47abf333a189f28a4db3`，结束后未变。
- ZIP 全新解压 source，完整复制到独立 fixture。11448 个 source 文件 manifest SHA256 前后均为 `efb54fbedc4d86fa3877206f12790e9f2a02044c012f49a26f68c06848ca3dea`。未使用、访问或扫描用户真实 Demo 库。
- ZIP 不含 `.workbench/vault.json`；真实 installed 按正常路径初始化新库。未删除作者数据或派生目录、未清 stash、未绕过种子或身份门禁。真实 Vault root、runtime binding root、libraryId、dev/ino 均强断言；各有效进程均读到 10916 文档、47 内容、56 账号、32 报告、22 来源。
- temp source、fixture、空白 userData 记录在 `provenance.json`。safeStorage OS 入口在 harness 中 fail closed，业务进程 cryptoCalls=0；非本机 fetch/renderer 网络及外部打开均阻断，实测 network/external=0。无模型生成、消息、付费 provider、ASR 推理。

## 本轮结果（不以新进程覆盖失败）

| 流程 | 新证据 | 结论 |
|---|---|---|
| T029 手改 mine 与意见 note | `attempt-2-navigation/save-result.json` | 真编辑、落盘并 drain 成功：12.818 秒 |
| T029 对照/通读/录制 | 同上截图与 drain | 1.850 / 3.228 / 5.118 秒，native pending、kitPending=0，error/storeError 空 |
| T029→列表→T044 同进程导航 | 同目录 `save-failure-1.png`、result | 失败：列表确已显示搜索框和正常“选题”页；“正在读取原选题、安排与创作文件…”在 90 秒等待结束仍在，未进入 T044；整步152.937秒，不能说永久卡死或断言根因 |
| fresh 进程 T044 包装、真实编辑→用这个→final | `attempt-4-independent-save-reopen/resume-result.json` | 3槽、29候选、3 final；新候选/选用/final准确落盘，drain18.384秒；其他final与全部段落fields保全 |
| 同 fresh 进程 T050 | 同上 `resume-T050-deferred.png` | 原卡暂缓原因存在，Doing排除，选题暂缓组可展开 |
| 独立重开 T044 | `attempt-4-independent-save-reopen/reopen-result.json`、`reopen-T044-selected-saved.png` | 新 candidate text、选用 decision、final 在磁盘及实际原 pane准确恢复；libraryId与counts相同 |
| 独立重开 T029 | 同上 T029 三视图截图 | 新 mine/note从独立进程准确恢复；三视图通过；恢复原 mine/note drain13.912秒，所有作者fields恢复 |
| T044 撤销本次选择、恢复原candidate/final | 同上 `reopen-failure-1.png` | drain25.002秒有界失败；不能记为保存响应成功。其后落盘已完成大部分恢复，原先已选candidate仍需恢复 |
| 单独恢复原已选candidate | `attempt-5-prior-decision-restore/restore-result.json`、`restore-failure-1.png` | 再次drain25.000秒失败；截图native状态已显示“已连接知识库保存通道”。退出后磁盘decision已回原值，但选用动作把手工final替为candidate文字，需恢复原手工final |
| 只输入原final，等待原页自动保存 | `restore-final-result.json`、`restore-final-T044-original-final-restored.png` | 通过：11.010秒落盘；未调用flush。kit pending=0、stash=[]、storeError空；native显示已连接。两个原页全部fields及JSON外字节均准确回原值 |

有效业务阶段共8个 step 组：5通过、3失败；失败是导航等待1组、25秒drain门槛2组。独立读回断言在含恢复失败的step内部已通过，因此单独列出，不能把该step整体改成通过。另有两次 harness 准备失败，分别单列，不能算作产品保存失败：

1. `attempt-1-path-alias/`：新 runner 未 canonicalize `/var` 临时路径，installed 的逐级 lstat 门禁拒绝系统符号链接，未进入业务。仅改 owned runner 使用 `fs.realpath(mkdtemp(...))`，没有改binding或绕过门禁。
2. `attempt-3-button-label/`：fresh T044 到达真实3/29/3 pane，owned helper误找“选用”按钮，作者原按钮实际为“用这个”；没有执行选择。仅改helper为实际按钮并等待enabled。

所有业务进程 worker error=0、console error=0、cryptoCalls=0。harness按钮错误产生的console仅保存在attempt-3。每阶段进程上限300秒、单次drain门槛25秒；未重跑广泛基础功能。

## 导航失败的只读诊断与限制

失败时 library identity 已通过强断言，正常列表和搜索框存在，等待条件因真实 loading 文案而失败，非单纯selector错配。该进程记录29次creationPage调用且全部成功；返回阶段没有新的目录读取worker完成记录。旧日志没有action、queued-at或完整失败时DOM快照，不能由此确诊“旧轮询没停”或“queue饥饿”。截图保留可见正文。后续进程已为worker添加action与at，失败step保存完整外层body。

T044的drainOriginal依次等待 `jcKit.flush()` 与 `JC_DESKTOP.flush()`；25秒外层race结束时未收到整个函数结果，旧日志不能区分停在哪一个Promise。最终磁盘写入与native连接状态不能替代该调用响应的成功。没有改产品或通过延长门槛把失败重标为成功。主线程另行执行真正.app同路径对照，本报告不冒领其结果。

## 最终完整性与规则留痕

`post-exit-author-fields.json` 在最后进程退出后新读磁盘：T029 36个item、T044 69个item全部作者fields与初始snapshot逐项相等；两个HTML JSON外字节均未变；installed desktop与初始ZIP hash均未变。仅保留临时库的测试/存储历史，不清作者stash、不清日志。

Acceptance-01：新入口 `node --check` 通过，实际installed IPC与独立进程证据如上，保留未通过项。Acceptance-02 / Reading-02：实际原页三视图、包装完整pane、暂停组截图已保存，窗口1280×860、实际viewport1280×828、DPR2；本项未宣称全页面视觉、窄窗、键盘或减少动画验收。Acceptance-03：仅darwin-arm64 installed payload native integration，其他发布与目标平台仍须分别验收。
