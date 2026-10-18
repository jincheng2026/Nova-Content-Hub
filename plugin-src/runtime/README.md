# 固定 Node.js 运行时

真实插件实验包自带 Node.js 24.20.0，macOS/Linux 使用 `bin/run-node`，Windows 使用 `bin\run-node.cmd`。启动器只调用包内
`runtime/node`（Windows 为 `node.exe`）及固定 CLI，清除 NODE_OPTIONS、NODE_PATH 和 ELECTRON_RUN_AS_NODE；不查找
PATH、宿主私有运行时或用户配置的替代 Node。缺失、版本/系统/架构不匹配、二进制或许可证校验失败即退出。

`node-release.json` 锁定官方 HTTPS 下载地址和 archive SHA256；`SHASUMS256.txt` 是 2026-10-18
从 https://nodejs.org/dist/v24.20.0/SHASUMS256.txt 获取的证据。构建器仅下载当前系统/架构的官方 archive，每次使用
`.node-runtime-cache/` 都重新校验 archive，再提取 Node 和官方 LICENSE。缓存不进入 Git 或成品。构建还使用包内 Node 执行
doctor 和 sharp 图片生成/解码校验。

成品 `manifest.json` 记录官方 URL、archive SHA256、Node 二进制 SHA256、LICENSE SHA256、版本、系统和架构。启动自校验用于发现损坏与误配；同目录可修改的
manifest/代码不是抵御恶意替换的签名信任根。更换系统或架构需要重新构建对应包。Windows/Linux 的结构校验不能替代当地真实运行验证；Linux
目前仍属于实验支持，实际依赖宿主系统库。

contract-only 包保持原有预接入契约行为，不是免安装 Node 的执行插件发行包。
