# D1 C：最终资产桌面接入专项

日期：2026-10-28。承接已批准计划的 C 批次，未运行构建、安装、原模型生成、stage 或 commit；主线程后续集中构建与真实 UI 验收分别记录。本目录测试使用独立临时知识库和明确 fixture 图片，未写用户原库，不能作为真实服务或真实封面生成证据。

## 实现范围

- 新增四项业务 IPC：readFinalAssets、previewFinalAssets、saveFinalAssets、exportFinalAssets；renderer 只交业务身份／来源选择／预览版本／明确接受的 warning，不交文本字节、文件系统路径或 mutationId。接 controller、preload、CHANNELS、worker 与严格输入校验。同时串行注册 A1 的 readCoverPackaging。
- 保存复用 VaultPending 的稳定原生 mutationId、根身份与原输入。响应丢失和重启按原 mutation 恢复，不生成另一笔保存；FinalAssetsView 扩入 Vault result 联合，通用编辑器仅对含 document 的结果取文档。状态只增加有限 vaultPendingOperation(method/contentId)；保存前置拒绝后，明确没有本次 pending 才恢复可重试，未知或本次未决继续保留恢复意图。
- finalPreview 在同步业务锁外 await ensureSelectedCoverDecoded，再复核捕获的绑定根身份并调用同步预览；saveFinalAssets 的 vaultMutate 分支在 durable pending 已保存后同样先 await ensure，再复核绑定并同步保存。没有让 Vault 锁跨 await，没有增加 renderer proof 字段或第二套生命周期。
- 已保存图片由独立 resourceWorker 的 finalAssetRaster 从 readFinalAssetExport 已验证版本包的 cover 文件读取；URL 精确授予并捕获 binding/contentId/bundleId/manifestHash/hash，异步前后复核与切库撤销，重复 grant 去重／总量有界。预览图使用原 covers grant。CSP 未新增 data/blob 或任意路径。对明确 core Vault 锁占用的 NOT_READY，仅 saved raster 映射 BUSY，沿既有有限重试和 15 秒总读截止；缺能力等其它 NOT_READY 不转重试。所有新增只读操作有既有截止，写入没有套读超时。
- 导出从原生 maintenanceParent 选位置，worker vaultLocation 取 wholeVaultRoot，与 runtime 根分别 realpath 排除库内及别名路径。固定 parent/root 身份，使用新 stage 和独占新目标，每文件 wx 写入／落盘 hash 核验后 rename；不覆盖既有用户目录。stage 创建失败或换 inode 时不清理未知目录。Windows 单独在检查自己空 reservation 后 rmdir 再 rename；尚无 Windows 原生运行证据。
- 内容详情新增“最终资产”紧凑区，当前稿／明确录完稿、多个包装页、源差异 warning、完整长文展开、版本读回／导出／内容目录定位及既有图片查看器。预览前及保存前均 flush；保存失败保留选择、预览与确认。历史与本次预览的内容和动作共同切换：查看历史没有隐藏另一版的“保存这一版”，可返回原预览继续。App CoverPanel.flush 仅在存在实际 detail guard 时 await。

## RED → GREEN 与结果

- 桌面入口缺失先按预期失败；导出 preexisting-stage/replaced-stage 两例真实复现错误清理后转绿。
- state 的不存在恢复操作问题先失败，修复后与实际 controller AUTH 前置拒绝／可重试一起通过。
- 使用真实 B 默认 helper → execute finalPreview → vaultMutate → saved raster 的独立 fixture 通过，不依赖注入 h。
- 真正第二个 Node 进程持有 Vault 锁时，saved thumbnail 最初复现 NOT_READY 失败，修复后经既有 WorkerClient 重试，锁释放后得到正确图片字节。
- 实际 React review 组件 SSR 与按钮 handler 验证：当前 A → 历史 B，只显示 B 且没有保存隐藏 A 的动作；返回预览恢复 A 及既有 warning 确认。不是源码 grep。
- [tests.txt](tests.txt)：13 个相关专项共 **64/64 通过**，0 skipped；包含已有 Vault／worker／边界／本地文件／详情焦点与引用回归。
- [typecheck.txt](typecheck.txt)：`npm --prefix workbench run typecheck` 的 native 与 renderer 均 exit 0。`git diff --check -- workbench/src workbench/test` 无输出。

## 设计与待验收

已按规则实施并通过静态／行为部分：Controls-01/02（Semi 按钮和可搜索版本／来源 Select）、Reading-02（全文展开／换行）、Surface-03 与 Image-01/02（复用图片查看器）、Layout-02/Surface-01（紧凑单区）、Acceptance-01（类型与专项）。实际总览与 1440 级、1280×860、960×680、长文、多页、键盘、减少动画等视觉结果待主线程真实 React/Semi/Electron probe，不能把 SSR/CSS 当视觉通过。

本次机器为 darwin-arm64。未验证 Intel Mac、Windows x64/ARM 原生导出／安装，也没有实际 Codex/WorkBuddy 模型任务、学员权益、签名或公证结论。应用构建、最终安装包和真实 A08/D1 旅程仍由主线程冻结验收。
