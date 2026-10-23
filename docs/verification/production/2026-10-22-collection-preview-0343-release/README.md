# 0.3.43 合集图片优化：Mac ARM64 安装验收

2026-10-22 构建并安装，2026-10-23 完成原生重开与严格终检。用户明确要求本次合集展示优化继续计入 `v0.3.43-preview-mac-arm64`，未升级版本号。

冻结源码为 `13d0ae9ab36707a3d07d3ae048049213db003aed`，分支 `main`。该版本总览与内容列表共用真实成员封面预览：最多两张不同的已选封面、完整比例、图像边缘圆角；单图不复制，空合集及全部破图回退图标。导航和成员数量保留原逻辑；不修改原图或内容库。

## 发布身份与旧产物保全

- 最新本地 tag `v0.3.43-preview-mac-arm64` 对应上述冻结源码。首份同版本源码保留为 `v0.3.43-preview-mac-arm64-initial`，指向 `266922901c7547e73923184e9c44b93971e095b2`；未推送远端。
- 新 DMG：`workbench/release/darwin-arm64/preview/Nova-Content-Hub-0.3.43-darwin-arm64-preview.dmg`，286,569,939 字节。
- SHA256：`9b76064efeb80a1fb08f35f73f350c7573cdbdac4f06e7e6a44df1d45b601aae`。
- 新同事交付目录：`/Users/mac/Downloads/自媒体工作台-0.3.43-合集优化-同事交付-Mac苹果芯片`，仅包含 DMG、安装与使用说明、SHA256SUMS。
- 首份 DMG、blockmap、构建配置和 debug 文件在标准路径覆盖前保全至 `workbench/release/preserved-preview-0343.noindex/initial-266922901c7547e73923184e9c44b93971e095b2/`。首份归档 app 和原同事交付目录仍在；保全映射见 `previous-release-preservation.json`，严格终检再次核对其字节未变。首份 DMG SHA256 为 `13f8bdf1ce85ed04796654cf1cd59ac40f7314824a358df42194023fc32ac468`。

新归档 app 为 `workbench/release/darwin-arm64/preview/.packaged-apps.noindex/build-WoBdsc/mac-arm64/自媒体工作台.app`；安装位置为 `/Applications/自媒体工作台.app`。归档、DMG 内和安装后三份应用的完整 1646 条树一致，树摘要 `c5bf78153a9bed43ad25ab9bf4c8459f92424879db6c02c670be057807827a87`。原生负载关联冻结源码，Electron、Node、sharp 均核验为 ARM64。配套资源版本为 0.3.43，示例库仅五个同事模板、52 条提示词及一篇示例；不包含工程测试文件与已移除的网页迁移能力。

## 系统展示与原生操作

根 `AGENTS.md` 为打包标准权威入口。本次在真实 Finder「显示简介」分别检查最终归档和已安装应用，并检查应用原生「关于」。证据位于 `native/`。

| 检查 | 结果与证据 |
|---|---|
| 名称、图标、版本、公司 | `finder-archive`、`finder-installed`、`about`：自媒体工作台、项目 N 图标、0.3.43、© 2026 杭州新岛橙灵智能科技有限责任公司。Finder 显示 Apple 芯片应用。 |
| 实际大小与时间 | 两份 app 逻辑大小均 536,531,714 字节；Finder 磁盘占用分别 539.7 MB / 539.6 MB。归档创建于 10月22日20:01、修改20:02，安装 app 创建/修改20:02；未将 DMG 大小等同 app 大小。截图在次日显示“昨天”。 |
| 总览与内容列表 | `overview-collection`、`contents-collection`：原库合集显示两张真实已选封面，完整比例、无复制；名称、2 篇成员数及原入口保留。 |
| 合集导航 | `collection-navigation`：从总览进入「连续创作流程验收合集」，正确显示两位成员；未执行管理、重命名、回收、保存或生成。 |
| 正常退出与重开 | `normal-quit.json`：应用菜单退出，末尾 CUA 观测超时，但进程查询确认所有 app 主进程为零，未强制终止。随后从确切安装位置重开，`reopened-overview` 记录原库 5 篇内容、1 个合集及两图预览正常。 |

重开时日期已为 10月23日，总览今天为 0 条、10月22日两条显示为待核对逾期计划。这是跨日展示；严格内容库摘要不变，未改动计划。

设计规则 `Image-01`、`Template-01`（真实多图原则适配）、`Layout-03`、`Reading-02`、`Foundation-01`、`Surface-01`、`Interaction-03` 的源码及三种窗口矩阵结果见 [源码验收](../2026-10-22-collection-preview-0343/README.md)。本页补充 `Acceptance-01/02/03` 的真实安装、Finder 和原库重开证据；不扩展为所有页面或平台验收。

## 内容库、安装与插件

- 应用正常退出后建立本次独立备份：`/Users/mac/Library/Application Support/Nova 内容库恢复留档/release-0343-collection-preview-30f6de8b-5fa0-4d2e-9b1a-747288ff519f`。
- 原库 `/Users/mac/Documents/自媒体工作台/内容库-恢复-20261019` 共 2381 条，备份、安装前后、原生操作及重开后严格字节摘要均为 `cf475f06e6914f5910172f2330d36ce0c32de0a9e86e921de936dfef7aef258d`。完整 machine-binding 文件 SHA256 仍为 `667d693d3c44cf1296b1a12992642ed1148082e3a2e6023ed964ab4b9f3b9067`。
- 安装事务 `/Applications/.nova-content-hub-install-19189765-5636-4776-81c6-399fad55c064` 最终为 `complete`；见 `installation.json`、`library-protection.json`、`final-integrity.json`。
- 新旧随包插件全树字节相同，未重复修改宿主配置。WorkBuddy 缓存全部539条匹配；Codex 缓存538条，官方安装器仅省略 `node_modules/.bin/semver` 链接，目标内容已单独核对，见 `plugins.json`。两个宿主的封面/模板四项技能路径均就绪，最终再次核验缓存全树。
- 主线程独立复核安装 app 全树、归档 app、DMG 摘要以及唯一运行进程确为 `/Applications/自媒体工作台.app/Contents/MacOS/自媒体工作台`；见 `root-verification.json`。

## 检查范围与未通过项

类型检查通过；针对性测试13/13通过；独立 React/Semi/Electron 合集图片矩阵54/54通过，覆盖总览/列表、三种窗口与九种数据情况。主线程重跑并核对记录。未运行全量测试。

旧综合 `collection-contents-ui-probe.mjs` 在修正合成 fixture 的同毫秒排序及新图片定位器后，通过前置导航和图片检查，但合集恢复按钮的 busy 禁用断言超时，后续恢复流程未执行。业务恢复代码未在本次修改，也未做旧源码对照，因此不能称为已证实的既存问题或宣称完整回归通过；失败日志及截图保留在源码验收目录。

| 目标 | 本次状态 |
|---|---|
| macOS ARM64 | 已构建、安装、原生运行、退出重开与本次图片 UI 验收。AUTH_MODE=disabled，productionReady=false，adhoc 签名；无 Developer ID 签名或公证。 |
| Intel macOS / Windows x64 / Windows ARM | 本次未构建、安装或原生验收；ARM64 结果不能替代这些目标。 |

当前宿主会话未重载插件，未执行真实 agent 生成。合集图片优化验收不代表正式生产发行、真实生成链路或上述未通过的恢复流程已验收。
