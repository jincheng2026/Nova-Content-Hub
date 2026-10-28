# 封面通用兼容与弹窗四角修复

用户要求：当前封面生成被 CURRENT_MANUSCRIPT_UNAVAILABLE 普遍阻断；同事直接打开自己的第二大脑也应可用；全部同类二级弹窗四角修复；同步主开发对话。

## 根因与行为

严格原稿包装读取被直接用于 cover-only 入口，选题卡尚无逐字稿时全部拒绝；旧 jc-doc 虽有正文但未创建任何 pubslot，也被当作缺少已采用包装而阻断。新增封面专用 readVaultCoverPackaging，严格 readVaultPackaging 保持原行为。选题只作为参考，script=null；完全没有 pubslot 的旧页用精确作者稿。已有包装、来源冲突、损坏原件、显式无效包装选择均继续阻断，不借其他来源掩盖。

新建的空Markdown/纯文本草稿可先按已保存标题生成，明确标识尚未写正文，script=null；调研笔记、参考说明与普通HTML等支撑材料不再误挡topic路径。损坏jc-doc、已有包装和显式无效选择继续拦截。

schema 5 固定 contextSource，核心创建、寻找请求、claim、commit 重新验证来源身份和文本；同版插件执行契约明确选题参考语义。桌面 fingerprint 校验、worker 转发、重试与切换助手均贯通，避免旧页的正文摘要与实际稿件不同造成误判。界面正确显示选题参考或完整作者稿。

公共 ProductionDialog 先前 overflow:visible 允许白色 footer 覆盖下方圆角；保留已有 overflow:hidden 修复并记录公共边界职责，正文独立滚动。所有同组件调用一起生效。其余 dialog 与 Semi Modal 核查后已有裁剪，无需重复添加CSS。详见 modal-corners.md。

## 验收证据

- UI 回归10/10，含文本来源显示和 fingerprint 路径/身份拒绝；相应红绿日志在本目录。
- 桌面封面回归57/57：nova-cover-portable-desktop-regression.log。
- 独立同事库六场景6/6：topic/旧稿/只有标题的空正文 × Codex/WorkBuddy，包含两等待状态恢复、原会话继续、重开、重试、切换助手，原稿未改：nova-portable-cover-native-complete.log。助手启动为测试适配器，未声称真实宿主已生成图。
- 旧无 kind 字段的有效segment复现重试 STALE_INPUT后修复，见 nova-portable-cover-retry-red.log。
- 核心最终定向回归33/33：nova-cover-supporting-final-green-20261028.log，包含后补的仅标题空正文与选题支撑材料场景。原件身份、已选包装、临时库生成请求/claim/实际PNG提交、明确迁移到不同root后重开由核心 topic-cover.test.mjs 覆盖。PNG是测试夹具，不是助手生成的业务封面。
- 当前绑定库只读对比：bound-library-read-only.json。T001 原有稿件拦截→topic参考，T029缺三项pubslot→精确旧稿。未改写该库原件，没有硬编码用户库路径或T编号到运行代码。
- native与renderer类型检查通过；git diff --check通过。
- 圆角在1280×860、960×680的实际Chromium组件渲染验证，包括旧值复现、长文末尾与跨边界下拉，按Surface-03、Controls-02、Reading-02、Acceptance规则记录；详见modal-corners.md。非安装包、非Windows/Intel Mac验收。

## 交付状态与主开发同步

已通过工具同步至主开发对话“继续开发账号切换续接”（01a18097-68e7-7e02-ae27-07bd39e849d1），明确生产源码停写，可纳入0.5.3统一冻结、构建与安装；禁止竞争包。当前最后核验安装版仍0.5.2，本记录不宣称用户已安装修复版或真实生图成功。最终安装和两宿主插件版本待主开发统一产物验证后补记。

最终候选已改为00ca6f9be5738e08ac1cf838606a4f9d2516881b，补入本轮发现并移交主开发的旧schema1/2任务升级重试修复；已检查实际diff与8项兼容测试，旧任务继续使用冻结指纹，作者修改标题/正文的失效检查仍保留。主开发报告8/8通过并重新构建。此前3c73e80候选及final-artifact-cover-reading.json只代表临时候选的只读验证，不作为最终安装证据。

打包、系统信息、平台架构与签名要求遵循根 AGENTS.md。没有以macOS本机结果代替Intel Mac或Windows运行验收。
