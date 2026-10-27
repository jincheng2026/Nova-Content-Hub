# 0.5.0 安装资源预检

本记录范围为 `workbench/scripts/build.mjs` / `dist.mjs` 的资源装配、真实 electron-builder FileMatcher 和完整性门禁。未启动 electron-builder、未生成 DMG、未改版本或冻结的 ASR 载荷。独立记录见同名 `.json`。

## 已修复的真实缺陷

1. `mac.signIgnore` 原先出现两次，后面的 marketplace 配置覆盖了前面的 local-asr 配置。现合并成唯一数组，精确匹配 `Contents/Resources/plugin-marketplace` 与 `Contents/Resources/local-asr`，保留目录边界；Unix / Windows 分隔符均验证，不会误匹配 `local-asr-other` 或桌面 sharp。其目的是保全冻结载荷字节，不能代替这些组件自身的正式签名/公证验收。
2. 全局 `!**/{...,scripts,...}/**/*` 原先会排除 Node 报告生成器**运行时读取**的 `upstream/current/scripts/account_report.py`、`render_report.py`。这些文件包含原报告交互脚本/CSS片段，生成器读取它们，不需要执行系统 Python。现仅排除工程构建脚本目录，保留受控的两个 skill 的 upstream/current 资源，继续排除 tests/fixtures/probe 等开发资产。

## 本地 ASR 装配与冻结

- 源目录固定为 `.local-probes/local-asr-release-v2/darwin-arm64`，extraResources 目标为 `local-asr/darwin-arm64`，因此最终路径为 `.app/Contents/Resources/local-asr/darwin-arm64`；不进入 app 或 asar。
- 使用真实 FileMatcher 对完整 manifest 中全部 10,944 个文件及 manifest 自身逐项验证，10,945 个文件全部入选。没有 `.gitattributes` 等隐藏资源被 filter 意外排除。
- 源载荷全部文件重新核验大小与 SHA256；payload manifest SHA256 保持 `2783e2cc5284cada58a0006180781efb6f0b4f86b790664943f1deeababdd234`。manifest 中文件合计 3,644,489,419 字节；加上 manifest 自身，最终普通文件总计 3,646,698,041 字节。
- `distribute` 现在在 builder 前封存完整 ASR 清单哈希，在 builder 完成后验证最终资源清单、逐文件 SHA256、无未列文件以及 Python executable mode。Apple Silicon preview 缺少已验证的 Qwen+Whisper 资源时直接阻止装包，不静默产出缺少组件的预览包。
- 本次没有修改 ASR payload。最终 DMG / 安装后的应用仍须由主发布再次验证并执行真实识别；本记录不把装包规则或源 hash 当成目标系统安装验收。

## 报告资源及独立安装布局验证

根据 `research-runtime/report.mjs`、`topic-report.mjs`、`comment-report.mjs` 的实际读取路径，固定检查10个文件：账号/选题 HTML模板、共享阅读CSS、原账号图表模块、1,030,855字节离线ECharts、两个原Python文本资源，以及评论HTML模板/CSS/JS。具体相对路径、大小、SHA256均记录于同名JSON。

`build.mjs` 在复制两个 upstream/current 目录后，逐文件核对上述资源与源码字节一致；`dist.mjs` 在builder前检查真实打包规则与stage资源，builder后再检查最终 `.app/Contents/Resources/app` 的对应文件，并与封存stage清单比较。缺资源、过滤掉资源或字节变化均失败。

独立测试通过真实 FileMatcher 筛选，复制成新的 `Contents/Resources/app` 布局，再从此布局实际导入研究运行库，分别生成账号、选题、评论三类HTML。三类均成功，账号挂载原 `AccountCharts`、选题含原数据脚本、评论含原交互数据，未引用远程 script/link/iframe。输入是明确的合成合同样本，只证明资源装配与本地执行，不冒称真实研究数据或报告视觉验收。

预检JSON记录时主线程正在重新build，旧/current stage的报告模板尚缺，记录为 `currentStage.validated=false`，没有宣布旧安装包合格。新build与后续dist必须通过新增的强制资源检查；最终应用以主发布实际构建产物记录为准。

## 验证结果

- `node --test workbench/test/packaging-resource-readiness.test.mjs workbench/test/distribution.test.mjs`：15项通过。
- 新回归包含：签名排除覆盖与边界、真实打包过滤、完整ASR清单/字节/未列文件/执行权限/封存manifest变化拒绝、真实筛选后的三类报告渲染、缺模板拒绝。
- 两个构建脚本 `node --check` 与 `git diff --check` 通过。
- 此回合未运行DMG命令。正式运行应由主线程冻结版本后通过现有native preview入口执行，不能绕过原签名/发布门禁。
