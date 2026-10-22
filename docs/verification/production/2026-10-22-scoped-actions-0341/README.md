# 0.3.41 局部操作与图片查看器预览

按用户要求重新打包并安装当前源码。包含图片边缘/表单内框优化（bd5e29a）、标注交互（337e276）与局部操作/查看器（36a93bc）。旧版 0.3.40 的冻结源码、tag、安装包及证据保留。

本轮目标仅为 Apple Silicon Mac（darwin-arm64）预览，AUTH_MODE=disabled、productionReady=false、adhoc 临时签名。权威交付标准见根 AGENTS.md；Finder 与原生界面验收由主线程独立执行。Intel Mac、Windows、真实助手生成、正式 Developer ID 签名与公证不在本轮范围。

冻结构建、DMG 与归档全树、配套插件、实际当前绑定库备份及事务安装收据会写入本目录。安装前必须由主线程确认旧应用正常退出；保全旧应用恢复事务，不覆盖或恢复用户业务内容。源码/静态检查不能代替原生界面验收。

构建前验证：98/98 项 distribution、distribution-integrity、native-payload、installation、mac-installation 测试通过；bridge/模板镜像检查与 native/renderer TypeScript 检查均退出 0。五个 JSON 版本入口（含两个 lockfile 根包）与生成 prototype 版本/pairId 均为 0.3.41。日志见 logs/。未重复未改动业务的全部测试；用户库与真实宿主生成尚不在这些检查范围。
