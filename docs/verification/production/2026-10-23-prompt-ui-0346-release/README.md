# 0.3.46 提示词与渠道输入：Mac ARM64 预览升级核验

2026-10-23，冻结源码 `7e78bf5f01162b06b8f9c1801b32fbfe4be621aa`。本次补齐提示词卡片内部满高、底部操作对齐，并将预览放宽到六行；渠道多选的实际输入提供提示与 200px 最小输入区；删除侧栏、设置及旧构建提示中的「免费体验」表述。业务、保存和助手任务契约沿用。

## 产物与版本

- 仅 `darwin-arm64 / preview / AUTH_MODE=disabled`，`productionReady=false`。根 package、workbench package、release 配置、两个 lock root 与 prototype pairId 均为 0.3.46；安装包内根 package、desktop release、配套插件同版。
- DMG：`/Users/mac/code/dashboard/Nova-Content-Hub/workbench/release/darwin-arm64/preview/Nova-Content-Hub-0.3.46-darwin-arm64-preview.dmg`，286,574,600 字节，修改时间 `2026-10-23T11:27:33.018Z`；SHA256 `6c3a6867b9acdc496a0abc6fed861ce1914a31266aec5971a4117f0fdfe16a03`。
- 归档 app：`/Users/mac/code/dashboard/Nova-Content-Hub/workbench/release/darwin-arm64/preview/.packaged-apps.noindex/build-cPPfbE/mac-arm64/自媒体工作台.app`。DMG 挂载应用与归档全树相同，共 1646 项，树 SHA256 `7d48e967e93ad4469cc3eabdcdc1523cefed25a09d3a65cc4bbbf8792092dcad`；普通文件 bytes 合计 536,533,701 字节，该口径不替代 Finder 的显示大小。
- native payload 的 source commit、锁文件、配置与 ARM64 负载已校验；应用/Electron/随包 Node/sharp/libvips 9 个重点原生文件均为 thin ARM64；最终另遍历全部文件头，含 helper/crashpad 共 **19 个 Mach-O 文件均为 thin ARM64**，见 `all-macho-files.json`。
- `codesign --verify --deep --strict` 通过，应用为 ad-hoc 预览签名，未做应用 Developer ID 签名及公证。随包 Node 及两宿主缓存内的 Node.js Foundation Developer ID 签名分别 strict 验证通过（`runtime-signatures.json`）；插件负载使用 manifest/SHA 校验，不声称插件市场发行签名。0.3.45 原 DMG、blockmap、归档应用保留；旧 builder 配置另存 `previous-build-config/`。

## 安装与保全

- 主线程通过 CUA 正常退出旧应用，安装代理独立使用 ps 与 installer lsof 确认应用未运行；从实际 machine-binding 读取库，不从 cwd 猜测。
- fresh 备份：`/Users/mac/Library/Application Support/Nova 内容库恢复留档/release-0346-prompt-ui-a0ae00e0-5685-4f51-8745-3752223aa40d`；真实内容库 2,502 项，树 SHA256 `00409edbd8ffa3e598505826bf7c413ceac8465f2f40e5638485e47103610fc5`，完整 binding SHA256 `667d693d3c44cf1296b1a12992642ed1148082e3a2e6023ed964ab4b9f3b9067`。备份库与原库全树相同；事务安装前后再次核对，库及完整 binding bytes 不变。
- 通过现有 `installMacApplication` 发布到 `/Applications/自媒体工作台.app`，全树等于归档；本次事务记录旧 app 的恢复身份。新 app 启动后的既有归档机制已将事务内旧 app 转为 `previous-backup/previous.app.zip`（ZIP SHA 与恢复收据匹配）；0.3.45 原完整归档 app 也保留且全树复核通过，见 `previous-recovery-archive.json`。旧恢复入口的 `lsregister -u` 返回 -10814，系统 dump 确认该隐藏路径无登记；未重复安装，已单独 `lsregister -f` 注册新版，留存首次错误日志与安全补写收据。新 app 启动前事务为 published，实际启动确认后已转 complete。
- Codex、WorkBuddy 已通过各自官方 CLI 更新至 0.3.46；更新前宿主配置备份 `/Users/mac/Library/Application Support/Nova 内容库恢复留档/plugin-config-0346-prompt-ui-c5333661-b1b2-4bdc-912f-6e532a65c4c6`。断言保全其他插件记录、启用设置及其他市场，显式使用 WorkBuddy 配置根。当前已开的助手会话未重载；本次升级验收没有发起真实生成。同期既有 WorkBuddy 模板任务发生外部回写，见下文，不能作为新版本生成验收。

## 静态与隔离 renderer 验证

- `npm run check`、`npm run typecheck:desktop`、完整 `npm run test:desktop` 375/375、版本/pairId 断言和 `git diff --check` 均通过，见 `root-verification.json` 及日志。
- 本次新探针在 0.3.46 再次通过 1440/960 精确 viewport、短中长预览与展开、同排底部对齐、200px 渠道输入、直接键入、筛选、多选、键盘、无匹配、清空、Escape、busy 及零 native 写入。见 `renderer/` 和 `prompt-channel-probe.log`；旧 density/content-channel 检查见前序源码证据目录。
- 设计规则 Surface-01、Controls-01/02、Reading-02/03、Layout-01、Interaction-03、Acceptance-01/02/03 按此次范围核对。隔离 renderer 与最终包/安装原生验收分别记录。
- 构建保留既有大于 500kB chunk 提示和已有关闭 ASAR 的打包提示；没有新增依赖。

## 原生验收与终检

- 主线程在实际安装版 1280×860 窗口验收（截图 2560×1720）：侧栏无免费标签，设置说明为中性文字；原生关于显示 0.3.46 (0.3.46)。提示词验收卡全文五行完整显示、不折叠，同排主要操作视觉底沿一致。`system/about.*`、`prompts.*`、`settings.*` 留档。
- 归档和安装版 Finder「显示简介」均显示 N 图标、Apple 芯片、0.3.46、公司版权，创建/修改为 2026-10-23 19:25。两者 Finder 大小均为 **536,533,994 字节**，归档磁盘占用显示 540.9MB、安装版 539.6MB；Finder 大小与普通文件 bytes 合计 536,533,701 属于不同口径，分别记录。`system/finder-archive.*`、`finder-installed.*` 留档。
- 在原内容资料页，通过 CUA `setValue` 向实际渠道输入设置「微信」，选项只保留微信公众号；原选 0 保持 0、保存按钮始终 disabled，随后清空搜索并 Esc 关闭，未保存资料。原生此项证明输入/过滤，不能声称真实键盘键入已验；真实鼠标与键盘键入、多选在隔离 renderer 探针单列覆盖。`system/channel-filter.*` 留档。
- Cmd+Q 正常退出后 ps 无 app 路径进程；以系统应用名重开后唯一主进程 74009 指向 `/Applications/自媒体工作台.app/Contents/MacOS/自媒体工作台`，原库 5 篇内容、1 个合集正常读取。`system/normal-quit.json`、`reopened-process.json`、`reopened-overview.*` 留档。
- 已恢复用户原来打开的提示词临时填写窗口，保留供继续使用；未保存到库、未改系统剪贴板。完整字段 AX 在私有恢复目录，本证据仅记录恢复结果，不收录原临时输入。
- 规则 Surface-01、Controls-01/02、Reading-03、Layout-01、Interaction-03 已按本次实际页面检查；Acceptance-01/02/03 区分 renderer、包、安装及系统展示，未扩大为全页面或跨平台验收。

## 同期外部任务回写与数据保全

- 安装前后及安全补写安装收据时，库严格等于 2,502 项备份。原生验收后的首次严格终检失败，原日志 `final-integrity-strict-failed.log` 保留，未把失败改写为「库完全未变」。
- 完整差异是 **新增 8 项、修改 1 个原文件、删除 0 项**，其余 **2,501 个原条目逐文件不变**。单个模板 JSON 仅 `revision`（10→11）、`updatedAt`、`templateJobs` 变化；模板标题、版本/资源、其余原文件与完整 machine-binding bytes 均保全。
- 备份时已有 WorkBuddy 模板任务为 claimed：job `4af40522-b57a-47bf-b8a2-f29ad86356c9`、attempt `848e01df-96f4-496b-a07b-4e8e33f2d73a`，创建于 18:45。它在 **19:30:44** 回写 failed / `IMAGE_GENERATION_UNAVAILABLE`，内容说明目标 734×978 与宿主 16 倍数尺寸限制冲突；此终态时间早于新版首次启动 **19:32**。新增项为两张 generated-images 图片、`.workbuddy/memory` 文件及该提交事务 5 项。记录支持既有外部 WorkBuddy 任务回写这一判断，未取得写入进程遥测，不能仅凭文件断言具体进程。
- 未回滚、覆盖或删除这些真实新状态，也未接管/重试该外部尺寸失败任务。`library-final-difference.json` 保存精确路径/字节 SHA，`library-change-analysis.json` 保存字段、状态与时间分析，原始前后模板字节仅留私有备份。
- 因此最终收据应为 `strictLibraryUnchanged=false`，同时分别记录安装阶段库未变、备份完整、绑定未变、2,501 原条目未变以及外部新状态被保留。新旧 app、DMG、两宿主缓存、签名与事务完整性独立终检，结果见 `final-integrity.json` 与 `final-signatures.json`。

## 验证边界

未运行完整根 `npm run verify`、Intel Mac/Windows 构建安装、正式签名/公证、卸载或本次版本真实外部助手 AI 生成回传验收；没有推送、生产发布或跨架构构建。界面临时填写留档在私有恢复目录，不进入本证据目录。
