# 2a5d906：真实安装模块 focused 两进程验收

**本轮有界 focused 两进程通过。** 最终安装 desktop.mjs 的实际 SHA256 与冻结值 `806ff945e0b2e1f1464ff7d369c59e67306ddaff12ddfde9a187a92980490869` 一致。冻结源码 `2a5d906697347a6518883d02f2930c7429f83b43`，DMG SHA256 `102a4f7b9d0ce2961408c33e36a49b75da5ce202b1c334afce35c2610df8b26c`（DMG 值由主线程提供；本轮实际复核 installed desktop 字节）。

## 实际执行边界

直接从 `/Applications/自媒体工作台.app/Contents/Resources/app/workbench/dist/main/desktop.mjs` 动态导入 startDesktop；worker、renderer、Vault 与创作模块由此真实安装位置解析。插件与 ASR 根目录分别显式指定安装 `Contents/Resources/plugin-marketplace`、`Contents/Resources/local-asr/darwin-arm64`。结果记录了上述路径。

探针入口仍由项目 Electron 44.9.0 harness 启动，`app.isPackaged=false`，userData隔离于 OTOC5Z/machine；这是一项**真实安装模块的原生集成验收**，不冒充 Finder/Dock 启动最终.app或其系统属性验收。主线程另有真正.app的OpenPanel初开、系统信息和真实MP4 ASR证据；本记录不重复声明那些测试。

复用完整真实47库临时副本 OTOC5Z，保留前轮批注、暂存、selection identity；没有清空stash、模拟业务、绕过种子或修改产品。编辑仅在临时副本。两进程各读到10916文档、47内容、56账号、32报告、22来源，库ID一致；Vault实际root、绑定runtime root、libraryId、磁盘dev/ino均强断言通过。

哈希核验的sourceArg是独立解压的静态交付ZIP副本，不是正在演示的Desktop库。ZIP SHA256 `cfb1c98884702def950813113080ad28234dbaf1c94e2c695df7a314ca1ec55c`；副本11448文件hash前后完全一致，见 `static-source-provenance.json`、`source-integrity.json`。此前原Desktop11455文件未变的证明保留在首轮目录；本轮不读取、扫描或hash演示库。

## 两进程验证结果

| 检查 | continue（实际保存） | reopen（独立进程读回） |
|---|---|---|
| T029准确恢复原note/mine | 通过 | 通过 |
| T029对照/通读/录制stash排空并安全导航 | 通过 | 通过 |
| T044真实包装pane | 3槽/29候选/3final | 3槽/29候选/3final |
| 前轮selected及全部final准确恢复 | 通过 | 通过 |
| 小改标题候选→选用→保存→列表重开 | 通过 | 准确读回新candidate/final及选用状态 |
| 其他final、所有mine、原HTML JSON外字节 | 保全 | final/mine准确恢复 |
| T050暂停证据、选题暂缓与Doing排除 | 通过 | 通过 |

两个进程均exit0，无worker失败、console错误、READ_TIMEOUT或保存响应错误。T029六次drain为3.321–8.341秒；T044小改选用保存drain **19.934秒**，同进程列表重开步骤18.096秒，其他T044drain为1.748–6.487秒；全部低于25秒门限，最终native pending、kitPending为0，error/storeError为空。保存仍有可感知延迟，本轮不声称所有保存都低延迟。

ready后的13次list为465–732ms。已补startup worker计时：vaultLocation分别6487ms、3590ms且成功；两个进程bootLibrarySummary均为“第二大脑”。完整逐项时延、错误字段和业务结果见 `continue-result.json`、`reopen-result.json`。

## 首轮失败保留

`../2026-10-27T22-14-27-378Z/installed-attempt-diagnostic.md` 保留第一次installed调用：主UI有47内容但summary显示runtime，旧探针硬等中文库名240秒而失败；该次没有进入业务测试。它的startup调用未计时，不能据第二次成功或冷读现象反推其真实错误。自身PIDsample/TCC日志没有证实跨.app权限拒绝。

经主线程授权，仅将探针身份门禁改为真实Vault及绑定身份核验，库名另行记录；没有调用refreshDisplayRoot、操作权限、清理身份或改产品。本次唯一修正后的两进程执行成功，首轮失败没有被覆盖或隐去。

## 证据

- `reopen-focused-T044-reopened-selection.png`：独立进程真实原pane、准确恢复final和已选候选。
- `continue-focused-T044-saved.png`、`continue-focused-T044-reopened-selection.png`：实际小改保存、同进程重开。
- `reopen-focused-T029-restored-drained.png`、`reopen-focused-T050-paused.png`：原批注恢复与暂停状态。
- `installed-related-module-hashes.json`：实际安装main/Vault/creation相关模块SHA256，供之后仅renderer取消刷新修复重打包时核对复用；不是全安装包字节清单。
- 窗口1280×860，各result.views记录真实内容viewport。按Acceptance-01/02/03、Reading-02留痕；未重跑此前报告/X/VI/模板/radar或provider流程，未运行模型、付费操作、消息或ASR推理。

仅darwin-arm64；真正.app界面、最终系统属性、安装升级和其他平台分别验收。后续源码或产物变更必须独立核对相关模块与影响范围，不能把本轮结果无条件附给新包。
