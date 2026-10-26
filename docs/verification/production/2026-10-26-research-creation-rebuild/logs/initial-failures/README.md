本目录保留最终复验之前的诊断材料，不代表最终结果。

- `electron-production-failure.json/png`：旧烟测在故意提交旧CAS后留下恢复意图，下一视口操作被正确禁用。烟测现明确在临时库放弃该已知失败的恢复意图，再继续下一场景。
- `build-interrupted.log`：为避开全量测试中的共享产物构建，主动中止的一次重复构建；没有作为构建通过证据。最终构建记录另存上级 `final-desktop-build.log`（工作树）与 `main-desktop-build.log`（main）。

最终结果以主目录 `electron-production-receipt.json` 和上级日志为准。测试仅使用合成临时内容库。
