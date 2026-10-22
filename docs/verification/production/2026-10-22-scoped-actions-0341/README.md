# 0.3.41 局部操作与图片查看器预览

按用户要求重新打包并安装当前源码。包含图片边缘/表单内框优化（bd5e29a）、标注交互（337e276）与局部操作/查看器（36a93bc）。旧版 0.3.40 的冻结源码、tag 及证据保留；旧 DMG 在本轮静态核验后消失，当前不再声称它仍在本机。

本轮目标仅为 Apple Silicon Mac（darwin-arm64）预览，AUTH_MODE=disabled、productionReady=false、adhoc 临时签名。权威交付标准见根 AGENTS.md；Finder 与原生界面验收由主线程独立执行。Intel Mac、Windows、真实助手生成、正式 Developer ID 签名与公证不在本轮范围。

冻结构建、DMG 与归档全树、配套插件、实际当前绑定库备份及事务安装收据会写入本目录。安装前必须由主线程确认旧应用正常退出；保全旧应用恢复事务，不覆盖或恢复用户业务内容。源码/静态检查不能代替原生界面验收。

构建前验证：98/98 项 distribution、distribution-integrity、native-payload、installation、mac-installation 测试通过；bridge/模板镜像检查与 native/renderer TypeScript 检查均退出 0。五个 JSON 版本入口（含两个 lockfile 根包）与生成 prototype 版本/pairId 均为 0.3.41。日志见 logs/。未重复未改动业务的全部测试；用户库与真实宿主生成尚不在这些检查范围。

## 冻结构建与静态交付

冻结源码 310efee2bb00edf18a34dddf9027d6064b19697b，在本机 darwin-arm64 从干净 checkout 导出独立 native payload，并执行原生 DMG 构建。最终归档与挂载 DMG 应用全树 1859 条目一致；Electron、随包 Node、sharp/libvips 为 arm64；版本、pairId、公司版权、配套 marketplace、内置示例原图 provenance 与工程文件排除通过。签名为 adhoc 且通过严格校验；未进行 Developer ID 签名或公证。见 package.json、codesign.log、logs/dist.log、logs/package-verify.log。

最终 Nova-Content-Hub-0.3.41-darwin-arm64-preview.dmg：415,000,862 字节，修改时间 2026-10-22T07:15:41.011Z，SHA256 49c1766e09396aecbfe7595f3654521e6c5ae7f5d6fd32d05ad92ebf166e5025。Downloads 下“自媒体工作台-0.3.41-同事交付-Mac苹果芯片”恰好包含 DMG、安装与使用.txt、SHA256SUMS.txt，交付 DMG 字节一致，文本无研发/测试/验收/调试用词。完整路径以 package.json 为准。15:19:46 静态核验时，旧 0.3.40 DMG 的 SHA256 与原记录一致、原 tag 指向未变；之后的文件缺失另记于下文。见 static-install-delivery.json。

## 安装与当前原库保护

主线程通过 CUA 正常退出旧 app，产品精确运行检查在安装前再次确认停止。备份脚本重新读取当前实际 machine-binding，校验库 ID，独立复制当前 2303 条目并逐字节核对，摘要为 b6163320344103d8b401fff17806da42e8c65a087d6df9f202b17c4873f217ae。当前绑定与备份目录见 library-protection.json；未套用旧版基线，未恢复或覆盖用户业务文件。

通过产品 installMacApplication 事务安装到 /Applications/自媒体工作台.app，安装全树与冻结归档一致，安装结束时原库及绑定不变，旧 app 恢复事务保留。事务路径为 /Applications/.nova-content-hub-install-d61198d5-4014-4173-ad09-e2c10bcf3f0f，静态检查时为 published；主线程随后通过真实应用启动确认，最终为 complete。见 installation.json、logs/install.log、static-install-delivery.json。

Codex 与 WorkBuddy 均通过官方 CLI 更新配套插件至 0.3.41，四项 cover/template 执行 Skill 匹配且启用，不相关插件记录与启用设置保留。配置备份及执行记录见 plugins.json、logs/plugins.log；当前助手会话未重新加载，未执行本版本真实生成。

| 目标 | 已构建 | 已安装 | 已运行/原生验收 |
|---|---|---|---|
| darwin-arm64 预览 | 是 | 是 | 已启动、Finder 展示与正常退出重开；产物核验与运行期间库变化分开记录 |
| darwin-x64 | 未进行 | 未进行 | 未验收 |
| win32-x64 | 未进行 | 未进行 | 未验收 |
| win32-arm64 | 未纳入本轮 | 未进行 | 未支持/未验收 |

## 主线程原生验收

Finder 分别查看冻结归档与安装后应用：名称/既有 N 图标、0.3.41、Apple 芯片、公司版权均正确；实际文件大小 673,326,840 字节，磁盘显示 676.8 MB，修改时间为本地 2026-10-22 15:14。见 system/archive-finder-info.png 与 installed-finder-info.png。设置实际显示“自媒体工作台 0.3.41 · macOS · ARM64”，WorkBuddy 封面与模板能力就绪，见 installed-version.png/txt。

原内容库已加载，5 篇内容、1 个合集、已有封面与发布安排可见。主线程通过 Cmd+Q 正常退出，并用精确进程检查确认应用停止，随后重新启动 /Applications 下实际安装应用，原库与封面重新加载。未强制结束、未运行真实生成，未保存业务输入。用户在验收期间操作应用；发现资料脏输入后，按用户“不需要保存”的明确回复继续正常退出。见 system/native-acceptance.json、installed-reopened.png/txt。

规则范围：Layout-03 / Image-01 在实际总览观察到完整等比封面贴合图像边缘，无原白色空框；Controls-03 在实际候选页观察到“已选用”直接位于动作行，无重复状态行。Acceptance-03 仅覆盖当前 ARM64 安装版，未重新执行全页面、窄窗口、键盘、所有比例或其他系统的设计验收；源交互证据仍引用前序实现记录。

## 完整性边界与并发变化

首次严格核验保留在 logs/final-integrity-first.log：原构建归档与 native payload 在本地 15:21:06 附近消失，删除者/进程未知。随后只从 SHA256 验证的 0.3.41 DMG 只读恢复同版本归档；1859 条完整树及严格签名与原冻结收据一致，未重建源码或覆盖安装应用。见 archive-restoration.json。旧 0.3.40 DMG 当前缺失；static-install-delivery.json 中哈希只代表其 15:19:46 时确实通过，旧 tag 和源码证据仍保留。

恢复归档后严格 final-integrity.mjs 仍退出 1，日志见 logs/final-integrity-after-archive-restoration.log，未放宽该门禁：安装时原库2303条全部不变；应用开放期间变为2363条，新增60条已提交事务记录，唯一改动的既有文件为一篇内容 JSON，其余2302条未变、无既有条目删除。原独立备份与绑定仍匹配安装前摘要，未回滚或覆盖当前用户数据。精确差异见 library-diff-after-restoration.json。

最终 scoped 校验在本地 15:46:38 记录库2371条、两次读取稳定：精确71项差异包含上述61项业务/事务变化和10份 Finder .DS_Store 元数据变化（逐条保留哈希，不忽略）。12笔 revision 12→24 的事务链与请求、captured、提交标记均通过核对；业务变化为8次收藏切换、3次封面选用和1处发布文案更正，正文与原图不变。该记录单独报告 artifactIntegrity=true、strictLibraryUnchanged=false；它不将已知变化改写成全库不变或严格全项通过，也不凭 UI 接管提示推断每次写入的操作者。详见 final-scoped-integrity.json 与对应脚本。未进行 Developer ID 签名、公证、真实助手生图、Intel Mac 或 Windows 验收。

本地 tag `v0.3.41-preview-mac-arm64` 指向冻结源码 `310efee2bb00edf18a34dddf9027d6064b19697b`；后续证据提交不属于该安装包的源码。仓库未配置 remote，本轮没有推送。
