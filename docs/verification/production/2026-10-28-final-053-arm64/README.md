# 0.5.3 轻量预览验收入口

最终产品冻结 `00ca6f9be5738e08ac1cf838606a4f9d2516881b`。主目录0.5.4开发与此固定worktree构建分离。

- `build/handoff.json`：最终产物路径、实际大小/哈希、签名及构建时的待验状态。
- `build/final-artifact-verification.json`：最终.app/ZIP的字节快照、codec真实自检、无模型/安全检查。
- `build/legacy-upgrade-verification.json`：旧封面请求升级重试的真实RED/GREEN与边界。
- `pre-freeze/`：原始桌面整组、明确失败及后续修复、方法/沉淀/研究回归和真实外部MLX+codec证据。不要混为一次固定源码的全绿总数。
- `release-ready.json`：Root复核后允许单一安装负责人开始本机安装的交付记录；不代表安装/系统UI/两宿主业务已通过。

安装由“修复所有助手跳转并打包”对话负责；Root不并行替换/Applications或升级缓存。遵循根AGENTS应用信息与逐目标验收要求。0.5.3首次包未提供Intel/Windows实际产物与验收。
