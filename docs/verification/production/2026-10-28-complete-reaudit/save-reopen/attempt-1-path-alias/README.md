# 首轮 harness 路径失败（保留）

本次尚未进入任何保存或重开业务断言，renderer boot 等待 60 秒后有界失败。UI 实际显示 BINDING_INVALID / binding-unsafe，workerTimings、startupWorkerTimings 和 cryptoCalls 均为零。临时 userData 位于 `/var/folders/...`，其中 `/var` 是 macOS 系统别名；installed bootstrap-recovery 的 directory() 使用 lstat 检查每级目录，拒绝符号链接。

owned runner 改为与既有 runner 相同的 `fs.realpath(await fs.mkdtemp(...))`，后续使用 `/private/var/...`。未改产品、初始化、库身份检查或 binding 文件；失败现场保留在本目录和 provenance.json 记录的 temp root。此失败属于 harness 路径准备错误，不能计为产品保存失败。
