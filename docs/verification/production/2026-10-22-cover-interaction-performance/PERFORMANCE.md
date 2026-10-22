# 内容详情封面加载性能

2026-10-22，Apple Silicon macOS。证据只覆盖本次合成库、源码链路及单列的 Electron 构建运行；没有访问真实用户库、安装新应用或执行真实生图。

## 反馈命令与边界

`workbench/scripts/cover-loading-performance-probe.mjs` 创建专用临时合成库，随后调用真实 `Covers → execute → file-library`。固定 fixture 为 6 个生成任务、24 个候选、4 张不同的 1086×1448 PNG 原图（每张约 4.73 MB，候选跨任务引用这些原图）。输入为固定种子的不可压缩像素，全部任务通过真实 request/claim/commit API 建立。之后的读取不写业务数据。

首次指该进程 MIME 验证缓存为空、boundReader 已清空；再次指同进程缓存已热。操作系统页缓存未清空，因此不能称物理磁盘冷读。计时从调用方法前到 Promise 完成为止；原图阶段包含主线程再次核对 SHA256。所有候选均请求，但相同 URL 的并发请求合并，因此每阶段只传输 4 张不同原图。

仓库根目录执行（输出路径应使用绝对路径）：

```sh
node workbench/scripts/cover-loading-performance-probe.mjs "$PWD/docs/verification/production/2026-10-22-cover-interaction-performance/run.json"
node workbench/scripts/cover-loading-performance-probe.mjs "$PWD/docs/verification/production/2026-10-22-cover-interaction-performance/repeat.json" "$PWD/docs/verification/production/2026-10-22-cover-interaction-performance/run.json" 200
```

第二条复用第一条保存的同一合成库。末尾可选参数只对两次 `readCover` 的源码阶段施加 200ms 诊断预算；这是这台机器上的回归反馈阈值，不是产品 SLA。繁忙机器可能影响墙钟耗时；文件读取次数、字节和锁次数是更稳定的信号。

优化前已运行该命令并得到 `AssertionError: Cover metadata latency exceeds 200ms`，见 `before-red.log`；共享模板回归测试也先得到 `3 !== 1`，见 `shared-template-red.log`。

## 已确认的瓶颈与最小变更

原来每次 `readCover` 单独读取内容、进度，再为每个 job 获取完整执行上下文。6 个 job 反复验证同一模板包的 4 张原图；图片 URL 返回之前，已经读取约 227 MB。

新增核心 `readCoverState` 在同一个库锁内完成该批读取；仅在这一次调用内复用已经完整验证的同一模板包（键包含模板 ID、版本和 packageHash）。Map 保存包定义和资源描述，不保存原图 Buffer；下一次读取重新校验。每个任务独立的固定输入文件、正文、请求、交接、目录及结构文档仍走原校验，所有独立输入继续完整 SHA256。单任务执行入口 `readCoverContext` 保持完整校验。没有跨调用 mtime 缓存，没有裁切、重编码或修改原图。

相同合成库、相同计时段与原始 probe 版本的前后数据：

| 阶段 | 优化前 | 优化后 | 模板资产读取 | 独立输入读取 | 库锁 |
|---|---:|---:|---:|---:|---:|
| 首次 readCover | 322.8 ms | 146.3 ms | 24 → 4 次；113.5 → 18.9 MB | 24 次 / 113.5 MB，保持 | 10 → 3（含首次 open） |
| 再次 readCover | 243.6 ms | 100.6 ms | 24 → 4 次；113.5 → 18.9 MB | 24 次 / 113.5 MB，保持 | 8 → 1 |
| 首次全部原图 | 238.9 ms | 235.2 ms | 8 次 / 37.8 MB，保持 | 0 | 8，保持 |
| 再次全部原图 | 110.9 ms | 115.0 ms | 4 次 / 18.9 MB，保持 | 0 | 4，保持 |

原始证据：`before-counted.json`、`after.json`。两报告 fixtureDigest 相同且前后全库 snapshot 不变。首次原图仍保留完整解码及解码后第二次资产读取，以拒绝解码途中根目录被替换；温热原图仍校验当前字节。原图成本没有被宣称为已降低。

## 实际 App 入口与资产缓存

后续扩展 probe 使用当前 `App.readCoverAutomatically` 源码和既有 VM hook 测试方式，调用真实 `DesktopController` / `Covers` / worker 实现，包含末尾真实 `status`。缓存命中状态在 VM 中明确注入；没有挂载完整 React 页面。该数据用于补齐入口开销，不与原始阶段报告混为同一种量测。

`after-entry.json`：

| workspaceAssets | 入口 Promise 耗时 | 调用 | 资产字节 |
|---|---:|---|---:|
| 未命中 | 152.3 ms | listCoverAssets → readCover → status | 37.8 MB，加独立输入 113.5 MB |
| 命中 | 118.4 ms | readCover → status | 18.9 MB，加独立输入 113.5 MB |

两种情况均成功返回所有 24 个候选；命中时没有重复全局模板/照片扫描。未命中时仍执行既有真实模板资产读取，没有隐藏这部分成本。原图请求/解码和 UI paint 发生在入口 Promise 完成之后；这些数值不能直接当作用户点击到完整出图的时间。

## 回归与交付边界

- 共享模板只验证一次，但每份固定输入分别验证；下次同大小、恢复 mtime 的模板资产篡改仍令摘要不可用，恢复原字节后能再次读取。
- 原有历史输入缺失/损坏时 summary=null、健康任务及候选仍显示；执行/重试/claim/commit 仍拒绝损坏输入；意外错误继续传播。
- 不变更 renderer / preload / IPC schema，不新增依赖、不安装、不调整版本。
- 设计规则 **Image-01**：原图字节、矩形、下载语义保持；**Interaction-03**：业务实体、权限、生成/发布规则保持；**Acceptance-01/03**：源码、原生运行、安装包及跨平台分别记录。

### Electron 实际 worker transport

统一 `build:desktop -- --auth both` 完成后运行：

```sh
node workbench/scripts/cover-loading-electron-probe.mjs "$PWD/docs/verification/production/2026-10-22-cover-interaction-performance/before.json" "$PWD/docs/verification/production/2026-10-22-cover-interaction-performance/electron-performance.json"
```

脚本校验新构建确实含 `readCoverState`，使用 Electron 44.9.0 的两条真实 utilityProcess（元数据和图片），调用构建中的 Main / WorkerClient / worker。首轮包括各自的 worker 启动；热轮复用进程；OS 页缓存仍热。见 `electron-performance.json` 与 `.log`：

| 阶段 | 冷进程 | 热进程 |
|---|---:|---:|
| readCover Promise | 283.3 ms | 132.9 ms |
| 全部原图响应与主线程 hash | 514.8 ms | 160.4 ms |

两轮均 readCover 1 次、rasterBatch 2 次；24 份候选响应逐一匹配原图 SHA256，合成库全 snapshot 与源码前后报告相同。这里没有把源码 200ms 子阶段阈值套用到含进程启动的冷路径，也没有把这些数据当作 React 可交互或图片绘制完成时间。初版临时 Electron harness 在顶层等待 ready 时未启动 worker，已停止该自有测试进程，改为 ready 回调后正常完成；该失败没有产生性能样本，也没有改动业务代码。

### 必要测试结果

- `node --test workbench/test/covers.test.mjs workbench/test/raster-reader.test.mjs`：44/44，见 `main-regressions.log`（含原图篡改、根替换、锁/recovery、候选原字节导出）。
- `node --test plugin-src/src/lib/file-library/test/cover-jobs.test.mjs plugin-src/src/lib/file-library/test/template-context-documents.test.mjs`：82/82，见 `core-regressions.log`。
- `node --test --test-name-pattern='bound .* continuation keeps' workbench/test/covers.test.mjs workbench/test/templates.test.mjs`：8/8，见 `bound-host-regressions.log`。分别覆盖 Codex/WorkBuddy 与 waiting-user/waiting-permission，切换全局助手后仍打开原 host/session、进度及 CAS 不变；显式换助手生成新 attempt，不继承旧 session/进度。

`performance.json` 汇总原始量测、共享 fixtureDigest、测试命令及本次源码/测试/probe SHA256。主线程的最终统一类型检查、构建和真实 UI 记录单列，不将重复执行数当成互不重叠的测试数量。

Windows x64、Intel Mac、Windows ARM、安装/升级、签名公证与真实助手生图均不属于本次性能证据。
