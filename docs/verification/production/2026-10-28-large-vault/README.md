# 大库扫描与附件引用源码验收

2026-10-28。只在独立临时库创建数据，未读取/写入作者真实库，没有网络、GUI、付费调用、版本或打包操作。本阶段只修扫描与附件可发现性；显式就地重绑单独实现和提交。

原问题：core 把图片、视频及所有目录项计入两万文件限制，并对普通二进制附件走文本文件读取/hash。因此约 2.5 万项目的库即使真实文档很少也不能打开。

## 行为

- 索引按 250,000 遍历项目、25,000 目录、20,000 真正文档、深度 24 分别限制。opendir 逐项检查预算后才排序，不先将无界目录全量载入内存。低于默认值的原生预算可用于定向验证，不能提高默认上限。
- 普通附件保留原路径、稳定 doc-id、文件大小与只读元信息，在 `snapshot.attachments` 单列；没有伪造的 hash，不进入正文投影或唯一稿件选择。按旧 doc-id 实际读取小附件时仍检查真实字节/hash；大视频可经 native `vaultLocation` 原位定位，不需全文 hash。受管最终资产继续使用既有 manifest 元数据与精确读取规则。
- core、bound source catalog、native 原文阅读共享预算。直接、准确的来源内相对引用按选中来源/原文 token/真实文件检查解析；wiki 同名解析仍遍历完整受控目录并保留歧义。
- 预算用尽明确 INDEX_BUDGET_EXCEEDED，不返回可被当成完整的 partial projection。资源投影和受管最终资产的 catch 必须传播预算错误。linked 超预算不会被转换成 SOURCE_MISSING 后提交。
- 不搬走附件，不重写原视频、图片、正文、skills、记忆或任务。视频播放器能力未扩大；本阶段保证原位引用可发现、精确定位与既有原HTML/媒体入口的文件位置保全。

## 证据

- `large-index.log`：3/3，25,010 图片 + 视频的完整 open/readSnapshot、索引媒体字节读取数为 0、末张图片真实 native 引用解码；独立遍历/目录/文档/深度预算；超过 20,000 文档时原投影字节不变。
- `linked-budget.log`：1/1，真实 linked 账号来源超过文档预算，原 resource projection 和 workspace 字节不变。
- `video-locate.log`：1/1，70 MiB 视频稳定 ID/元信息与定位正常，普通 8 MiB reader 继续拒绝，文件换成符号链接后撤销定位。
- `final-budget.log`：1/1，托管最终资产到文档预算边界时不能吞错返回子集。
- `regression-initial.log`：原文、源码引用、Vault、working draft、source-map 与资源性能回归 73/74。唯一失败为此前 U4 已禁止的普通表单编辑外部原来源 fixture；没有放宽权限，而是改成原生创建的手工账号后测试相同 source-commit 中断与恢复。
- `resource-recovery.log`：该修正后的资源回归文件 10/10，恢复断言保留。
- renderer typecheck exit 0。native 在本扫描改动完成时已通过；归档时 Root 的独立重绑 controller 正在接线，当前日志仅该中间态的 parameter-property/worker operation 类型错误，不声明这次全局 native 通过。Root 接完后另补核验。

日志包含造数、重复完整核验和当时并行测试负载；它们证明正确性，不是交互延迟基准。真实大库、操作系统、GUI 和打包未在此执行代理验收。附件引用 UI 由 Root 单独提交 `b3b6795`，保留“定位原件”而不把附件元信息当正文授权。
