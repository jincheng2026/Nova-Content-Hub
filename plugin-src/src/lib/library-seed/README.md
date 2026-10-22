# 正式本地库的内置资源安装

`installBuiltins(library, bundleRoot?)` 只安装同事交接包的五组内置模板（AI大白话、秋芝、Seven、鹿一家、科技姐；127 张完整原图、8 份规则附件）以及 52 条提示词。新库没有旧版原创模板。供桌面
main 的受控安装和补装调用；`bundleRoot` 由应用资源目录提供，不向 renderer 暴露任意来源路径。

安装前检查所有 PNG 的实际字节和已有生成清单哈希。风格样张与结构图分开；保留原始 definition、来源版本、`accepted:false` 与
`aiTested:false`。文件进入不可变资产库，模板通过可信 hash 引用。字节一致不代表模型生成、人物替换或跨比例质量已验收。

模板按 ID/版本/包内容重复安装；同版内容变化应由文件核心拒绝。提示词按 builtinKey
检查当前与回收站，已有编辑和删除优先，不在启动时覆盖用户正文或复活已删条目。同事资源的来源、完整拆解、许可和实际交付范围见 `../../../resources/colleague-library/README.md`。

新建、显式打开库、迁移或维护完成后的既有流程可调用 seed，但启动时的 `initialize()` 仅加载绑定，不会自动给已绑定旧库补装。旧库用户需要显式更新入口，设置页“一键更新内置模板与提示词”应复用 `retryBuiltins` IPC，无需重新选库。该接口检查鉴权、当前库、其他待处理写入与导入状态，并允许重试自己的 `seedPending`；不能直接在启动读取路径静默写入。

真正执行 seed 时，先核对全部原图与规则 SHA256，再开始任何对象写入。旧库中精确匹配既有 15 个 ID 且 `builtin:true` 的旧模板按固定策略从当前模板和回收站目录列表移除，不再允许新选用、恢复、修改、安装或启动新生成任务。历史元信息、不可变包、学习记录与资产仍保留原位置，不移动或物理清除，原内容、生成请求和工作副本继续通过原 ID/版本/hash 追溯。`retireLegacyBuiltinTemplates()` 只核验这些历史条目并报告 ID，策略无须写入标记，重复执行不改变历史字节。全局默认仅在精确 ID 与内置所有权均匹配时清空；内容未改变的历史偏好仍可随其他字段保存。五组采用稳定 `builtin-colleague-*` ID、v1，用户已回收的五组不复活。自建模板保全。来源规则以 `source-verified-design` 标记，不能冒充 AI 还原和人工验收。

渠道维持原 ID 与历史发布快照；仅当内置渠道的名称仍精确等于旧默认「公众号」「B 站」时更新为「微信公众号」「B站」。自定义名称、颜色、比例、删除状态及自建渠道均保留。全新库的五个渠道为抖音、小红书、视频号、微信公众号、B站，仍支持自建渠道。

提示词同时按 builtinKey（含回收站）和真实正文去重；只在比较时忽略 CRLF/LF 与首尾空白，来源正文原换行完整保存。同名不同正文均可保留，已有相同正文的自建条目不被接管为内置。用户修改、停用或删除内置提示词后重装仍保留其状态，不按来源正文覆盖。旧版若已通过备份导入同事提示词，正文相同则跳过新增。

各模板/提示词逐项提交；安装中断后可重新运行，不宣称全库原子安装。后续内置提示词升级须独立设计“可更新/用户已修改/用户已删除”的处理，本版本不自动覆盖它们。

全部来源预检完成后，通过仅供 Node 调用的 `readAssetDescriptors` 在一次锁定与恢复中按 hash 去重读取、完整核对库内资产，返回不含图片字节的描述信息。缺失或损坏资产继续走原有导入校验；损坏的同 hash 资产由文件核心拒绝，不覆盖修补。模板安装仍逐项重新验证资产与包内容；批量结果不跨安装持久缓存。

验证：`node --test plugin-src/src/lib/library-seed/test/*.test.mjs`。测试使用临时库，真实导入模板字节，不接触用户库或发起生图。

## 2026-10-22 源码验收与回退边界

- `node --test plugin-src/src/lib/file-library/test/template-retirement.test.mjs workbench/test/template-catalog.test.mjs`：当前原路径策略首次 9/10 通过；冻结旧读写器用例的断言误读安装返回对象的 `packageHash` 字段，已改为 `versions[0].packageHash`。随后 `node --test --test-name-pattern='frozen schema5 readers' plugin-src/src/lib/file-library/test/template-retirement.test.mjs` 单独 1/1 通过。覆盖当前/回收站目录排除、历史字节和原路径、自建副本、逻辑幂等、旧 schema5 读取和幂等重装、历史交接包真实路径及 SHA256、重试拒绝、备份恢复和健康检查。
- `node --test --test-name-pattern='existing library retires' plugin-src/src/lib/library-seed/test/seed.test.mjs`：1/1 通过，真实旧版 15 组升级后仅保留五组当前内置和自建模板，旧包 hash 不变。
- `node --test plugin-src/src/lib/file-library/test/model-v5.test.mjs workbench/test/template-catalog.test.mjs`：此前私有目录实现阶段 46/46 通过；原路径简化后未重跑此完整组合。
- `node --test plugin-src/src/lib/file-library/test/cover-jobs.test.mjs plugin-src/src/lib/file-library/test/template-jobs.test.mjs`：此前私有目录实现阶段 94/94 通过；原路径简化后未重跑此完整组合。
- `node --check`（退役模块、model-v5、seed）与 `git diff --check` 通过。全量 seed 的首次执行载入了改动前「保留 20 组」的旧断言，升级用例因此失败；该用例已更新并单独重新通过，不把这次执行记录成完整全绿。桌面类型检查当时仍有并行移除浏览器导入入口引起的编译错误，另由主任务收敛。

这些是临时内容库的源码级结果；没有据此宣称真实用户库已迁移、应用已安装、真实生图或其他平台已验收。只读核对当前绑定库的 15 个旧版内置候选均为活动 v4，未对真实库执行 seed、移动或删除。

执行真实库更新前先保留完整备份。seed 中断后可重复运行；原历史目录和元信息没有搬迁或清除，损坏包会明确失败。旧版本仍能读取相同路径并幂等重装旧包，不会制造两处目录冲突；旧版本不认识当前目录可用性策略，因此可能重新显示旧模板。回退应用会回退这些产品限制，不能把旧版本界面作为当前版本验收。需要恢复更新前的默认和渠道名称时，从完整备份恢复到独立目录，再显式绑定；源码回退与用户库备份恢复是两项独立操作。
