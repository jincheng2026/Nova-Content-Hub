# 0.3.42 桌面可用性修复预览

本轮目标仅为 Apple Silicon Mac（darwin-arm64）预览：AUTH_MODE=disabled、productionReady=false、adhoc 临时签名。权威交付标准见根 AGENTS.md。旧版冻结源码、tag、交付和验收证据分别保留，未清理旧产物。

## 当前状态：已安装，Apple Silicon 原生界面与重开已验收

最终源码冻结 a9eb3cc788f7e557b93dce9390a4f5a4b7a1aaca，本地发布标签 v0.3.42-preview-mac-arm64 指向该提交。已完成原生 payload/DMG 构建、挂载 DMG 与归档全树比较、三文件同事交付、事务安装与 Codex/WorkBuddy 配套插件更新。主线程复核独立 Electron disabled 探针 PASS，并正常退出实际运行的旧恢复副本后放行安装；随后以确切 /Applications/自媒体工作台.app 启动，检查真实内容库、Finder 系统展示、内置更新和正常退出重开。证据与逐项规则见 installed-native-acceptance.md；不把这些结果扩大为真实生成或生产验收。

源码修复范围、测试结果与风险审查见 source-acceptance.md。桌面初跑360/368及后续25项定向修复记录保留，不写作一次全量全绿。新建双 auth 插件负载后的移除功能专项11/11通过：consolidation、maintenance CLI 与 desktop-only，日志为 logs/dual-auth-plugin-build.log、logs/removed-feature-conformance.log。

## 冻结产物与同事交付

最终 DMG 为 Nova-Content-Hub-0.3.42-darwin-arm64-preview.dmg，286,571,161 字节，SHA256 23ea4f4a9fa7aa745104dbb01f7fb1aa75b82d5dfd36cd6f185a966f886bbc9f。归档与只读挂载 DMG 的应用全树1646条一致，树摘要6ba946a4891dbd8228595084c3ba5eef1b48e8764fc893540e508b8f1b135fa4；Electron、随包 Node、sharp/libvips 均为 arm64，配套 marketplace、版本/pairId、名称/公司版权、严格 adhoc 签名和工程文件排除通过。实际路径与时间见 package.json、codesign.log、logs/dist.log、logs/package-verify.log。

桌面应用与配套插件均不含 browser-import、旧 builtin-templates 或图库兼容资源。实包 worker、IPC 和封装维护 CLI 拒绝旧网页导入命令；CLI仅保留backup/verify/restore。DMG示例独立副本恰有5组当前同事模板、52条提示词、1篇示例内容及2张原始封面，原图hash与provenance一致，未发布/无日程。用户历史模板属于逻辑退役，原目录与历史文件保持，不能说已物理删除。

Downloads目录“自媒体工作台-0.3.42-同事交付-Mac苹果芯片”恰好包含DMG、安装与使用.txt、SHA256SUMS.txt，交付DMG字节一致，文本文案无研发/测试/验收/调试词。

## 实际副本识别与原库保护

最初只查标准安装路径无进程，但根线程发现实际运行PID77764来自旧事务 previous.app（local bundle ID）。该初次备份仅作为preliminary保留，见 library-protection-preliminary-before-backup-app-quit.json、running-backup-copy-observation.json；未用作安装基线。发布脚本增加全副本主进程守卫，真实运行副本负例在读取绑定前拒绝，见 logs/backup-guard-refused-running-copy.log。未强制结束或删除该恢复副本。

根线程检查草稿并通过菜单正常退出该旧副本、确认主进程均停止，且独立 Electron probe通过后，才重新读取当前实际 machine-binding并新建最终备份。最终备份目录为 /Users/mac/Library/Application Support/Nova 内容库恢复留档/release-0342-47aa7513-873b-4dea-948f-5cdcb64504c0；完整库2371条，摘要9e72b02b4b83dfe8a8b2912d3c1fafd873986036f07bfdeddd1742beaac81d5f，完整binding文件摘要667d693d3c44cf1296b1a12992642ed1148082e3a2e6023ed964ab4b9f3b9067。备份与当前库字节一致，未套用.41旧基线。见 library-protection.json、logs/library-backup-final.log。

产品installMacApplication事务安装到 /Applications/自媒体工作台.app，安装后完整树与冻结归档相同，原库和完整binding文件安装前后逐字节不变；未执行seed/retryBuiltins或业务写入。旧标准安装应用的恢复事务保留于 /Applications/.nova-content-hub-install-325ef7cf-8077-44f5-bdb1-54a20737af23。安装收据为installation.json；installed-ready.json记录16:55:59的静态复核，当时应用已将事务确认至complete，但原生界面与正常重开验收仍由根线程记录。

上述“不变”只适用于安装阶段。随后主线程在产品设置中执行了一次“更新内置资源”：仅将内置渠道“公众号”规范为“微信公众号”、“B 站”规范为“B站”，默认值未变化。正常退出后独立逐项快照2371→2376条，恰6项路径差异：配置修改及一笔已提交事务的目录/四文件新增；没有缓存或Finder元数据变化。正文、15张封面原图、215份原资产、全部模板及其历史、自建文件和完整binding均逐字节保留，见 post-update-library-report.json。严格全库不变检查如实失败，日志保留，不覆盖原安装收据，不表述为本轮全库无变化。

两端配套插件均经官方CLI更新到0.3.42，cover/template四项执行技能匹配并启用；不相关插件记录、启用设置及marketplace均保持，配置备份私下保存。见plugins.json与logs/plugins.log。当前助手会话未重新加载，未执行本版本真实生成。

release.mjs复用产品分发、native-payload、快照、导出和事务安装实现，提供package/backup/install/final阶段；final为严格原库不变检查，任何并发业务或Finder元数据变化都应保留失败与精确差异，不能忽略.DS_Store或覆盖安装前基线。

| 目标 | 构建 | 安装 | 原生验收 |
|---|---|---|---|
| darwin-arm64预览 | 已完成 | 已完成 | Finder、原库、缩放/搜索、正常退出重开通过；真实生成未验收 |
| darwin-x64 | 本轮未进行 | 未进行 | 未验收 |
| win32-x64 | 本轮未进行 | 未进行 | 未验收 |
| win32-arm64 | 未纳入本轮 | 未进行 | 未支持/未验收 |

未进行正式Developer ID签名、公证或生产发行。配置与构建日志不代替Finder/安装后运行验收。
