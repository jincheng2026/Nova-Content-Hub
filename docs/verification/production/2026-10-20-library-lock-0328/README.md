# 0.3.28 锁恢复候选包

源码冻结`6b739b385e01931bd26962f229c853da2317a37c`。隔离托管worktree完成依赖安装、check及9项恢复基线、版本元数据更新、Apple Silicon Mac preview打包；打包命令exit 0，构建复制到主仓库持久归档后才归档worktree。

`package.json`和`package-verification.log`记录根线程核验：1817项应用全树在DMG与归档构建中一致；ad hoc深签名校验通过、配套marketplace完整性与版本匹配、研发tests/probes排除。应用与插件内共享index均精确匹配已定向/全仓/原生overlay验证的SHA256 `04c38d8bf75a47eb3c659a175084a9dcc754a54f28613a8a5dd73b3b351ab3a1`。示例库含20模板、52提示词、1内容/2张provenance原图、0发布计划/记录。实际业务库未读写。

DMG SHA256：`ed3bf6c88e6b4eb0a9c54f5df295b0ada1c448ec744c8dab2e7aef5d3f53e054`。交付目录`/Users/mac/Downloads/自媒体工作台-0.3.28-同事交付-Mac苹果芯片`仅含DMG、安装与使用、SHA256SUMS。

主仓库快进相同6个版本元数据文件后，check和两模式桌面开发构建再次exit 0，见`metadata-desktop-build.log`；源码完整verify的1065通过/2跳过是在此前0.3.27编号加同字节锁修复下执行，不混称编号0.3.28重跑全仓。

同候选打包资源的独立原生新库/持久化/备份恢复和运行中移库验证已在[native子目录](native/)完成，五个进程全部退出0。移库后同一owner/main worker仍存活，首个178ms样本healthy，真实读取成功，573个业务文件和绑定字节不变；完整1817项候选应用树前后与打包收据一致。根线程已独立检查回执并重跑verify。它使用独立临时库和开发Electron，不能代替Finder、系统TCC、实际用户窗口或真实宿主验收。

当前`/Applications/自媒体工作台.app`仍为0.3.27，其安装事务published、文稿权限未确认，恢复副本保留。0.3.28尚未安装，也没有更新磁盘宿主缓存；候选原生setup诚实显示assistant为skill-missing，不能据market可用推断宿主已经配对或重载。候选仍prototype/experimental、productionReady=false，Developer ID签名与公证未执行。

探针原始源码已归档到`probe-source/*.txt`并保存SHA256；复跑需在主仓库`.local-probes/lock-0328/`还原脚本后，传入package.json记录的app路径、DMG路径和完整sourceCommit。脚本只检查副本示例库，不从cwd猜业务库。
