# 首轮封装拒绝交付

源码 cf1ef05。`npm run dist:preview --prefix workbench -- --platform darwin --arch arm64`：构建、签名和镜像生成完成，但封装后完整快照不符，最终 exit 1；不能作为合格安装产物。

实测唯一差异见 `attempt-1-package-diff.json`：2054→2053 项，缺 `nova-content-hub/skills/jc-cover-design/upstream/current/assets/.gitkeep`（原0字节）。固定 builder-util 的递归 walk 在 filter 前跳过此文件；签名与其余字节未显示差异。

87af634 为该精确文件新增单文件资源映射，未删除原件、改源清单或放宽完整性校验。真实固定 builder copy 测试12项先RED再GREEN；同时发现旧workbench测试夹具仍复制完整1039清单，独立HEAD基线复现3项失败后按既有分发策略对齐为1034。目标组及共享夹具消费者最终39/39通过，见 distribution-tests.log。配置组合测试不代表其他平台原生验收。

失败镜像及app已隔离保留在仓库 `.local-probes/051-packaging-attempt-1/`，不进入桌面交付目录。该文件记录首轮失败，不代替后续最终封装结果。
