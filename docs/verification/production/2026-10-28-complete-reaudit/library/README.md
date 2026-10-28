# 实际安装版 0.5.0 内容库逐项复核

本轮执行时间 2026-10-28T01:29:45.764Z 至 2026-10-28T01:54:52.160Z。使用实际安装目录中的 worker、file-library 与 creation-document helper；运行器为随安装插件提供的 Node v24.20.0 / arm64。不是源码 fixture，也没有复用旧轮结果。安装文件 SHA256、初始 ZIP SHA256 和原 A/B 原件核对见 [source-and-runtime-integrity.json](source-and-runtime-integrity.json)。

## 确切范围

| 输入 | 内容 | 账号 | 报告 / 页面 | 可识别知识文档 |
| --- | ---: | ---: | ---: | ---: |
| 原始A 交接包 | 46 | 50 | 15 / 15 | 6410 |
| 原始B 同事版 | 47 | 50 | 16 / 16 | 9546 |
| 最终ZIP独立副本 | 47 | 56 | 32 / 49 | 10916 |

A 来源：`/Users/mac/Downloads/第二大脑交接包_2026-10-16/第二大脑`。B 来源：`/Users/mac/Downloads/锦成工作台-同事版/数据和程序/AIJinCheng/个人IP与内容/第二大脑`。全部在 /tmp 独立副本进行首次 bind；未给原目录新增 .workbench。最终 ZIP 独立解压后全量执行。A/B 另各读取代表正文与原 HTML 来源，并对 A 的 T034、B 的 T026 执行原创作页 parse/read/meta/history/stash-read。

原 A/B 的 root 内容均能由安装 worker 自动识别，不要求先手工配置来源；但两份原库均有9个默认扩展来源 SOURCE_NOT_AVAILABLE（正式档案、创作知识、X、报告、提示词、VI）。同级目录中的原锦成报告、VI、X 不会自动并入。最终 ZIP 的6个额外 jincheng 来源是已合并的资料，不能把其更多数量冒称为原 A/B 的首次打开结果。

## 本轮全量读接口结果

- 47/47 条 readContent、47/47 条 productionCreation 可读取正文、创建数据及历史；42/47 条当前来源可读取。5条当前来源冲突如下，不能宣称47条全部可直接继续编辑。
- 56/56 个账号通过原件详情 vaultDocument 读取，保留原 source path/hash、说明和关联报告。
- 49/49 个报告页通过 productionReport 读取 HTML 与导航映射，6 次已登记附件接口读取。25个导航目标均可映射（19个报告页、6个附件），没有不可用报告导航。14个登记本地媒体引用因原位置无文件返回 ENOENT，逐条列于 [unavailable-references.json](unavailable-references.json)；本库未提供音视频文件。
- 46个草稿HTML逐一通过 vaultDocument 实际读取。12个含 jc-doc 的原页面均解析成功；全部 writable=true 且 read/meta/history/stash-read通过。其余34个为无 jc-doc 的旧对照页、图卡、流程图等，解析返回 JC_DOC_COUNT=0属于该结构化协议不适用，未将其标为结构化编辑通过。
- 原页面中 segment、suggestion、pubslot、pubcand、refnote 等按实际种类盘点；原手改、非空批注、候选字段与 locked 数据均逐项摘要并与 worker meta 原始数据哈希比较，见 [creation-original-field-integrity.json](creation-original-field-integrity.json)。没有把原字段存在等同于本轮编辑保存交互通过。

## 当前来源冲突

- **T048**：T048 的明确当前入口指向多个原件，请选择继续的来源。候选和原始证据见完整JSON中的 `contents[id=17a6594b-618f-4581-adf9-1591aa3d3e5b].context.content.sourceCandidates`。
- **T020**：T020 的明确当前入口指向多个原件，请选择继续的来源。候选和原始证据见完整JSON中的 `contents[id=22090a0f-3e01-4c2a-a080-2200173834c0].context.content.sourceCandidates`。
- **T019**：T019 有多个稿件而没有唯一当前入口，请选择继续的来源。候选和原始证据见完整JSON中的 `contents[id=8003f517-cfd1-41c0-abef-eed85ce19847].context.content.sourceCandidates`。
- **T025**：T025 有多个稿件而没有唯一当前入口，请选择继续的来源。候选和原始证据见完整JSON中的 `contents[id=c71116c2-9cb8-4b38-a884-59a10de6decd].context.content.sourceCandidates`。
- **T021**：T021 有多个稿件而没有唯一当前入口，请选择继续的来源。候选和原始证据见完整JSON中的 `contents[id=f7253f60-1764-4cce-a221-8f1ae86ffef6].context.content.sourceCandidates`。

原 A/B 的 workDirectory 也均列出相同5个 T 号的冲突。T019 的候选混有教程定稿与参考逐字稿，T021 的候选为参考逐字稿，T025 的候选甚至包括出图脚本、JSON/log。这些包含来源分类不准迹象，应按实际入口交互复核；不能全部归因为用户漏文件。T048/T020 则有多个明确当前入口。复现调用为 installed worker 的 vaultWorkContext 后调用 vaultContentSource，完整 JSON 保留各条错误、路径、角色和证据。

## 保护与限制

最终副本的 11446 个已有非 .workbench 文件逐项SHA256核对：修改 0，缺失 0。另将初始 ZIP 全部11448个文件（包括2个已有 .workbench 来源映射文件）逐项与本轮读取后的副本核对：11448/11448原字节保持，见 [zip-original-integrity.json](zip-original-integrity.json)。原A 6468个、原B 10103个已有文件与其副本逐项相同，两个实际原目录均无 .workbench。

本轮以随包 Node 直接导入安装目录 execute 实现；未经过 Electron IPC / WorkerClient 传输、排队、重试与超时。本报告验证的是安装实现的有限读取、解析、受控引用和可写状态契约；没有操作桌面UI，没有逐项输入保存/重开/候选采纳/录制/真实播放，没有发起付费网络、模型、平台发布或消息。远程引用只校验登记链接，不代表联网目标可用。本地原片缺失如实记录，不以URL可读替代媒体播放。视觉与真实交互应结合主线程本轮独立证据，不能仅据本报告声称全部功能100%通过。

完整逐项数据：[all-library-items.json](all-library-items.json)；汇总：[summary.json](summary.json)；原A/B：[original-A/all-library-items.json](original-A/all-library-items.json)、[original-B/all-library-items.json](original-B/all-library-items.json)；代表原创作页：[original-creation-samples.json](original-creation-samples.json)。

## 本地原片路径的追加校正

追加只读逐条核对（2026-10-28T02:09:11.516Z）：此前14条失败记录对应 **14个唯一 href / 14个唯一原位置目标**，不是去重后的14个可播放文件。其中12条指向02_内容素材；4条原相对地址正确落在库根02_内容素材下，但视频不存在；另8条位于已做目录，原 ../../02_内容素材 实际落入05_内容草稿/02_内容素材，存在明显少退一层的问题。对这8条再按库根02_内容素材的同一后缀核对，文件仍全部不存在。因此应同时记录“相对路径偏移”和“原位置及根素材候选位置均未提供文件”，不能仅改路径便宣称可播放，也不能把8条纯粹归为应用新增的丢文件。剩余2条是内容数据统计/视频项目的成片引用：原href解析位置和已注册08_原锦成来源/jincheng-original/archives的同名候选均不存在成片。

本次只做14条引用的定位与lstat，没有整库重跑、改href或补文件。14个原位置、12个根素材候选、2个导入档案候选的文件存在数均为0；这只证明所列位置未提供文件，不代表凭此检索了用户全机其他位置。逐条路径与分类见 [media-reference-location-correction.json](media-reference-location-correction.json)。
