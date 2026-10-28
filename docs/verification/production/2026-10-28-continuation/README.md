# 0.5.1 接续集成验收

本记录为源码构建的独立 Electron 宿主验收，原库只读、仅测试副本写入；安装包与系统展示另留记录。

- `npm run check`、完整 native/renderer 类型检查、`build:desktop -- --auth disabled` 通过。构建保留 crypto browser externalized 与 bundle size 既有警告，`productionReady=false`。
- 广泛桌面回归 746 项：743 通过、1 失败、2 跳过，耗时 536358ms。失败是 checkpoint 中空关闭守卫的 await 让首击未同步占锁；已修复，相关 background 18 项通过。没有重跑全部广泛回归，也不把该次结果写成全绿。
- 最终源码集中复测 53/53 通过，涵盖上述排队修复、详情数据/动作/正文聚焦及四方法来源与路由。
- P0 关闭适配 20/20；旧探针过早读值与产品 source ACK 缺口分别证明。真实立即关闭、显式保存、主导航、换内容、失败保稿、renderer 重载恢复、真实 CAS 冲突与显式解决通过；最终 build 定点 tail exit0，作者原值恢复，冻结 Kit 未改。详见相邻 `2026-10-28-p0-save-close/acceptance.json`。
- 四方法 621 份原件与 ZIP 字节一致，58 来源版本/1039 来源文件通过校验并核对纳入 Git index。完整原件与原始测试日志的尾空格（含 Markdown 硬换行）保持，代码/适配层范围 diff whitespace 检查通过；不为全局 `diff --check` 改原件字节。

## 真实页面

`final-ui/detail/result.json` 为最终构建的实际 React/Semi 界面，viewport 1440×948；窄窗实际960×836。具体尺寸以JSON逐项记录为准。

| 规则 | 场景与结果 | 证据 |
|---|---|---|
| Surface-03、Acceptance-01 | 无页 T005 打开原 writing 方法，未触发任务；T020 保留全部冲突入口 | T005、T020截图与result |
| Controls-01、Interaction-03 | T046 多份 HTML 保留，已接入原页依次打开且每次仅一个iframe | T046截图、t046Pages与steps |
| Reading-02、Controls-01 | T019 发布面板后接着写，正文进入视口并获得焦点；长文件列表未丢 | T019-publication-to-body.png；自动断言viewport相交和activeElement |
| Reading-02、Surface-01 | T041作品和普通资料分开；本机括号路径完整，不冒充已找到原片 | T041-reference-groups.png、T041-reference-materials.png |
| Layout-01、Acceptance-02 | 真实960px窗口无文档横向溢出，长路径与动作可达 | T041-narrow.png；JSON scrollWidth断言 |
| Acceptance-03 | 独立进程重开同库身份、显示名及目录事实 | final-ui/reopen（运行后补入） |

原片与素材文件夹没有新增任意路径读取权限；未索引位置仅保留/复制，在线原视频链接仍复制。四方法为 `contract-unverified`，不等于真实模型、媒体上传、制图与助手 submit 链全部通过。缺外部 transcribe_chars 分支、其他平台/架构和正式签名/公证仍单列。
