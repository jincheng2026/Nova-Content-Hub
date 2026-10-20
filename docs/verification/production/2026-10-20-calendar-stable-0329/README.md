# 0.3.29 日历原位选日与正常退出修复交付

2026-10-20。功能提交e6ebd06、常驻探针8056c2b；冻结元数据2b8e9a1a88d39be7becbd1e20785ba230244bed6。Apple Silicon、本地免登录内部预览，ad hoc签名；experimental=true / productionReady=false，未冒充签名公证的公共正式发行。

## 打包与安装

- [package.json](package.json)：1817项归档应用与只读挂载DMG一致，插件完整性/版本、20模板/52提示词/1示例/2张provenance原图检查通过；无研发test/probe。DMG SHA256为`3f9264f81d4a930c627ac1f52da6f513ea054da8fbd8775d8811f01b174106c0`，应用树为`8cd84cfaedce6c334e8ab20bd6f216a08961cfdacda23bd67669c482399a3e99`。
- [installation.json](installation.json)：已安全替换`/Applications/自媒体工作台.app`，原库1717项在安装前后SHA256均`ef0616cf7e5dc013f963d1295db16e27aed277f1707d7b9be0185f1ae8d92c31`。安装事务随后complete，旧应用由既有安装器保留归档恢复。
- [tested-runtime-match.json](tested-runtime-match.json)：包内30个main文件、renderer清单与全部4个文件，逐字节匹配最后通过组合测试的auth-disabled源构建。编号改变没有混入未经测试的产品代码。
- 同事交付目录：`/Users/mac/Downloads/自媒体工作台-0.3.29-同事交付-Mac苹果芯片`，仅DMG、使用说明和SHA256SUMS。

隔离worktree使用npm ci按锁安装。第一次下载固定Node超时，原日志保留为package-build-network-failure.log；从本机已有归档复制同一Node24.20.0，既有cachedArchive按官方SHA256核验通过后重试打包exit0，未改校验或版本。见build-environment.json、pinned-cache-verification.log及package-build.log。

## 实际用户窗口

[native-observation.json](native-observation.json)记录CUA按Applications完整路径连接的实际安装窗口，而非开发Electron或合成库：

1. 正常读出原4篇内容/1个合集。
2. 大日历点击2026-10-21：选中日期和当天1条安排同步，标题/视口留在原处。
3. 小日历单独浏览2026-11：业务日期仍10-21，大日历仍10月。
4. 小日历选2026-11-07：大日历变11月、当天0条、标题/视口留在原处。

CUA的实际截图在工具结果中显示，未伪造归档截图路径。上述原位判断为实际截图目视对照；精确scrollX/Y不变属于[24样本组件探针](../2026-10-20-calendar-stable-scroll/receipt.md)。实际页面没有注入DOM脚本，也没有点击记录发布或修改业务文件。

用户随后正在操作日历、详情和分页，CUA阻止Cmd-Q并要求重读；未强制退出，**实际用户实例的退出重开不记作通过**。正常退出本身的真实utility worker两阶段/草稿保存取消回归另见[退出证据](../2026-10-20-graceful-quit/README.md)。

## 插件与回归

[plugins.json](plugins.json)：Codex和WorkBuddy的封面/模板执行Skill四项精确配对0.3.29。使用官方CLI，WorkBuddy配置根显式为`.workbuddy`且scope=user；与升级前私有备份比较，其他插件记录和启用设置不变。首次把Codex的--json/add语法用于WorkBuddy遭拒，失败日志保留；读取本机CLI help后使用支持的plugin update，无静默改默认`.codebuddy`配置。配置/CLI原始输出私有留存，不把凭据写入公开日志。

[source-verification.json](source-verification.json)：根线程完整桌面313/313、0失败/0跳过；最终calendar/daily组件探针独立复跑通过；两模式组合构建、原生建锁/释锁与常驻save/discard通过。完整桌面命令执行时仍为0.3.28编号加最终同字节功能代码；0.3.29只改6个元数据文件8行，未声称本轮重跑了整个仓库verify。旧两个条件集成项已另行各1/1通过，不改写旧完整日志统计。

原库空锁与完整副本保留及受控隔离见[维护记录](../2026-10-20-empty-lock-0328/README.md)，不按年龄自动删锁，也不认领历史owner。活动宿主会话尚未宣称重载、新版真实生成与人工图片质量未验证；Windows/Intel、公证及新用户首个成品仍按[总报告](../../../reviews/2026-10-20-最终交付收口与第一性原理复核.md)保留缺口。全局商用目标保持未完成。


新增全局交付规范补记：本轮安装后发现用户新增了AGENTS.md中的Finder信息要求，其登记时间晚于0.3.29冻结/安装。已在实际Finder“显示简介”核对名称、图标、0.3.29、672.9MB及真实修改时间；当前版权仍为“Copyright © 2026 自媒体工作台”，尚不含公司全称，不能记为符合新规范；应用内关于的实际面板也未在本轮打开。见[系统展示核验记录](finder-info.json)。该项列入后续打包验收，不回写0.3.29冻结产物或宣称整体商用完成。
