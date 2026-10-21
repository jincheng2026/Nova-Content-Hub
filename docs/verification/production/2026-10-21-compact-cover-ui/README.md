# 模板阅读与封面生成空间优化

用户反馈：详情浮层太窄、模板卡片下半部留白过大、竖向样张被放进宽而矮的框，生成窗口基础设置过于分散，需要滚动。要求基础填写不超过五项，完整展示原图，保留现有排版与生成能力。

## 最终状态（用户允许系统访问后）

已完成 0.3.39 Apple Silicon Mac 的打包、安装与原生启动验收，本地 tag `v0.3.39-preview-mac-arm64` 指向冻结源码 `f3e54c7d8646f4eea6cd8dce74931cf562f6f4fe`；没有重构建、改签或移动 tag。源码后的本节/截图提交仅补验收记录，工作区最终保持干净，未向远端推送。

用户亲自允许文稿访问后，CUA 实际检查总览、模板、内容、日程、提示词和设置。原来的 CORRUPT 提示消失；模板卡片下方紧凑且同排对齐，宽详情显示同事 VI 全文并滚动至末尾，整组 19 张预览关闭后回到原阅读层。见 `system/native-templates.*`、`native-template-wide-details.*`、`native-template-details-end.*`、`native-template-samples-preview.*` 和 `native-details-preview-return.*`。

实际内容的制作封面窗口首屏可见标题、模板、比例、张数和本人照片；整组样张与两张收藏参考展开后按纵图完整显示，主操作固定在底部。只打开、滚动和关闭，没有编辑标题、保存设置、选择候选或触发生图；见 `system/native-cover-composer.*`、`native-cover-samples-scrolled.*` 与 `native-cover-favorites.*`。实际设置显示 `0.3.39 · macOS · ARM64`、WorkBuddy 配套插件已连接、封面/模板助手均准备好。

已用 Cmd+Q 正常退出，精确进程检查确认 installed main process 不再运行，然后从安装路径重开；原库 5 篇内容、1 个合集和原计划正常加载。见 `system/normal-quit-process.json`、`native-reopened-overview.*` 和 `native-acceptance.json`。

严格 `final-integrity.mjs` 未带待授权参数，退出 0：事务 **complete**、`systemPermissionPending=false`，安装/归档/DMG 应用树一致，两端配套插件匹配，原绑定与用户库 **2135** 个条目不变，摘要仍为 `af0c67f39f297c0effed016e4f73e228935cc4e946f3e42840908360643aecca`。见当前 `final-integrity.json` 与 `logs/final-integrity-accepted.log`。下文等待系统授权是较早中间状态，保留作现场记录，不代表当前仍待授权。

真实助手生图、Intel Mac、Windows、正式 Developer ID 与公证仍未验收；本次是临时签名预览，不能据此宣称全平台或正式生产通过。

## 设计与范围

- 生成弹层采用左模板、右基础设置，标题、比例、人物照片与张数首屏可见；模板计入后共五个基础项，已有默认值沿用。
- 标题绑定原内容草稿，调用原 `save()` 显式保存，保持 CAS、失败保留和未保存禁止生成规则；不新增独立封面标题或保存接口。
- 完整正文、样张、收藏构图、补充要求与资料折叠，失效项、零样张及合计 10000 字预算的阻断原因仍需可见。
- 模板卡片保持五列和同排对齐，工作版本移入详情；轻菜单保留常用动作，完整来源资料使用宽阅读弹窗。
- 样张/收藏参考改为紧凑竖向图卡，原图完整 contain。图片字节、尺寸、库结构、助手固定请求和权限边界保持原有语义。
- 原 0.3.38 冻结提交、tag、安装包和验收记录独立保留。本次在 `codex/compact-cover-ui` 完成后续修改，后续源码/构建/安装各按实际证据记录。

适用规则：Template-01/02/03/04、Cover-01、Image-01、Surface-03、Controls-02、Reading-02、Interaction-03、Acceptance-01/02/03。

## 已完成的源码与隔离验证

- 最终 React/Semi/Electron 布局在 1280×860、960×680 首屏展示基本设置；模板版本移入右侧整组样张折叠，左侧卡片非图片区域小于 110px。完整 50 样张可到达，横/竖图 contain、长标题全文阅读、嵌套预览和焦点返回均通过。见 `logs/cover-layout-final.log` 与 `isolated-ui/`。
- 修复前日志 `logs/cover-layout-before.log` 复现人物选择低于首屏；这是旧布局失败证据，不是当前状态。
- 实际 App、原保存函数和临时原生文件库验证：输入不写盘；显式保存保留正文、模板、比例、照片和张数；I/O 失败与真实 CAS 冲突保留本地草稿及外部版本，并阻断生成。原内容保存结果测试 7/7。见 `logs/template-title.log`、`logs/save-outcome.log`。
- 收藏构图探针通过空可选要求回退、合并 10000 字预算、失效图片、部分失败重试、去重与 CAS；卡片探针通过模板/人物/张数保留、五项分页、完整原图、悬停翻看、减少动画与清理；管理页 5/4/3/2 列、长标题、空样张和学习焦点通过。见对应日志。
- 上述全部使用隔离 fixture；标题路径使用临时原生库。没有在实际用户库中编辑或触发生图。原图字节、文件库结构、IPC、助手请求契约和依赖未改动。正文/冲突入口保持在同一内容草稿，不触发离开内容的丢弃保护。

## 发布边界

本轮版本 0.3.39，已独立构建 darwin-arm64 临时签名预览，保留 0.3.38 的 tag 与安装包；最终打包、安装、系统展示及退出重开结果见顶部最终状态。Intel Mac、Windows、真实助手生图、Developer ID 与公证不计入已验收范围。

## 升级前发现的原库兼容问题

实际 0.3.38 在本轮升级前已经显示 `CORRUPT`，见 `system/before-upgrade.*`。只读调用定位为模板目录下 Finder 生成的普通 `.DS_Store` 文件被当成对象 ID。当前原库 2135 个条目、摘要 `af0c67f39f297c0effed016e4f73e228935cc4e946f3e42840908360643aecca`；与上轮 2071 条目的快照不同，因此本轮重新独立备份，不恢复旧快照或覆盖用户新增内容。备份逐条校验一致，见 `library-protection.json`。应用已正常退出，本轮不清除或改写原库文件。

桌面首次全套结果 345/346，唯一失败是源码布线测试锁定 CoverPanel 的第一个属性；新增标题编辑属性后顺序变化。已在同一标签内检查原出版入口，保留原生成/选封面分离断言，单文件 1/1 通过。最终整套运行结果另行记录，不把首次红日志记为全通过。

最终 UI 源码的双 auth 模式构建、native/renderer TypeScript 和 bridge/模板镜像检查已通过；原型 150/150。最终桌面完整重跑 346/346。见 `logs/build-ui-final.log`、`logs/typecheck-ui-final.log`、`logs/check-ui-final.log`、`logs/prototype-final.log` 与 `logs/desktop-final.log`。后续 Finder 元数据兼容修复的测试和最终冻结构建另列。

Finder 兼容修复只豁免对象目录中精确命名 `.DS_Store` 的安全普通文件，仍逐层拒绝符号链接；未知名称、伪装目录、事务布局、空库初始化边界不放宽。列表、提示词类别/唯一键、合集引用检查、模板报告 catalog、健康检查和备份恢复两处枚举保持一致；原文件备份与恢复保留字节。隔离 9 项回归通过，包含负例、升级和恢复，见 `logs/finder-metadata-test.log`；只读风险审查未发现调用遗漏或安全阻断项。

根线程以新源码只读访问实际原绑定，读取到 23 模板、5 内容、54 提示词、2 照片、1 合集；前后 2135 个条目及完整摘要保持一致，`.DS_Store` 原样存在。见 `library-read-final.json`。这不是写入修复，也未运行生图。

Finder 修复后的最终文件库全套 **450/450**（原 441 + 新增 9），内置资源/种子 **15/15**；源镜像及 72 项资源目录约束通过。最终双模式桌面构建、native/renderer TypeScript 与镜像/模板检查再次通过。见 `logs/finder-metadata-file-library-final.log`、`logs/seeds-final.log`、`logs/build-final.log`、`logs/typecheck-final.log` 和 `logs/check-final.log`。

## 冻结与安装产物

- 冻结源码 `f3e54c7d8646f4eea6cd8dce74931cf562f6f4fe`，分支 `codex/compact-cover-ui`。从干净提交构建 darwin-arm64 独立负载与 DMG 成功；最终应用与负载、DMG 内应用全树 1853 条目一致。配套 Electron、Node、sharp、marketplace 按 arm64 核验。见 `package.json` 与 `logs/dist.log`、`logs/package-verify.log`。
- DMG `Nova-Content-Hub-0.3.39-darwin-arm64-preview.dmg`，415,026,999 字节，SHA256 `8388ba8b8c3c81a177cbf5211018d3a3b5b4c5024f61b88ce7ecd190c9784f24`。同事目录 `/Users/mac/Downloads/自媒体工作台-0.3.39-同事交付-Mac苹果芯片` 精确三文件，不带研发测试文件。
- Finder 实际核对归档和安装后应用：名称/图标正确、Apple 芯片、版本 0.3.39、公司版权完整；均显示 673,262,021 字节、修改时间 2026-10-21 19:52。见 `system/*finder-info.*`。该观察值与文件树求和方法分开记录。
- 产品事务安装器已发布至 `/Applications/自媒体工作台.app`，旧版恢复目录保留。安装前后原库完整摘要与原绑定一致，未清除 Finder 文件。Codex/WorkBuddy 官方 CLI 更新成功，两端 cover/template 均核对 0.3.39，其他插件设置保留；见 `installation.json`、`plugins.json`。
- 预览使用 adhoc 临时签名、`productionReady=false`，没有 Developer ID 或公证；0.3.38 原冻结产物/tag 没有改动。本次未向远端推送。

## 原生启动等待系统确认（中间状态）

首次打开安装后的 0.3.39，精确进程检查为 running，CUA 读取应用超时，安装事务为 published。系统 TCC 日志在 19:56:32 明确记录已有 code requirement 不匹配，以及本应用 DocumentsFolder 的 `AUTHREQ_PROMPTING`（18478.21）；见 `system/startup-permission.log`。尚不能把这个状态算作原生启动验收。

已请用户亲自允许系统正常弹窗。此前计算机工具明确禁止操作这个系统授权窗口；本轮不绕过它、不修改权限数据库、不重新签名或转移原库。默认最终核验仍要求事务 complete；等待时仅用显式 `--awaiting-system-permission` 的中间收据，后续页面与正常退出重开完成后再记录最终状态。
