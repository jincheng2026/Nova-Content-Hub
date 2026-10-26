# 0.3.47 Mac ARM64 预览安装记录

2026-10-26；冻结源码 b6aab6ab4155ad0e1d9c4f39f7278cfb7bad4173。已安装并原生运行，Finder归档/安装版及应用关于均验证0.3.47、N图标、Apple芯片与公司版权。Finder大小536,537,443字节，修改时间2026-10-26 15:50。

完整桌面测试378/378、check、typecheck通过。DMG SHA256为0453b93f2c617444da4f43c41f6026a3e2f23483d244e56a427f95d6fb1bcd24；DMG、归档、安装应用全树一致，19个Mach-O文件均thin ARM64，ad-hoc签名验证通过。

Codex与WorkBuddy插件经官方CLI同步0.3.47，完整负载核验通过；当前会话未重载。工作区日常启动阶段也是0.3.47。

final-integrity.json记录artifactIntegrity=true、strictLibraryUnchanged=true、bindingUnchanged=true、pairedPluginsUnchanged=true、transactionPhase=complete；原库2573项不变，旧应用与DMG保留。

用户在原生验收期间提出将生成按钮移到卡片底部，后续0.3.48包含该调整。此版本仍为图片覆盖层按钮，不能当作底部布局验收。原生正常退出已完成；本版未单独完成按应用名再次启动的轮次，后续版本补验。

仅本机darwin-arm64预览；未验收正式签名/公证、其他架构、Windows、卸载及真实助手生成。不推送远端。打包系统展示要求以根AGENTS.md为准。
